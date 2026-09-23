import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { quizSessions, reviewLogs, words, type WordRow } from "@/db/schema";
import { computeReview } from "@/lib/learning";
import {
  bumpActivity,
  ensureSchema,
  hasDatabase,
  jsonError,
  safeDay,
  serializeSession,
  serializeWord,
} from "@/lib/server/words";
import type { QuizSession, Word } from "@/lib/types";

export const dynamic = "force-dynamic";

const int = (v: unknown, max = 100_000) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    items?: unknown;
    source?: unknown;
    localDate?: unknown;
    session?: Record<string, unknown>;
  } | null;
  if (!body || !Array.isArray(body.items)) return jsonError("Invalid request body");

  const items = (body.items as { wordId?: unknown; correct?: unknown; type?: unknown }[])
    .filter((i) => Number.isInteger(i?.wordId) && typeof i?.correct === "boolean")
    .slice(0, 500)
    .map((i) => ({
      wordId: i.wordId as number,
      correct: i.correct as boolean,
      type: typeof i.type === "string" ? i.type.slice(0, 40) : "",
    }));
  const source = body.source === "quiz" ? "quiz" : body.source === "match" ? "match" : "flashcard";
  const day = safeDay(body.localDate);
  const now = new Date();
  const ids = [...new Set(items.map((i) => i.wordId))];
  const updated: Word[] = [];

  if (!hasDatabase()) {
    const correct = items.filter((i) => i.correct).length;
    return Response.json({
      words: [],
      activity: {
        day,
        reviews: items.length,
        correct,
        wordsAdded: 0,
        quizzes: source === "quiz" ? 1 : 0,
        flashcards: source === "flashcard" ? items.length : 0,
      },
      session: null,
    });
  }

  await ensureSchema();

  try {
    if (ids.length) {
      await db.transaction(async (tx) => {
        const rows = await tx.select().from(words).where(inArray(words.id, ids));
        const map = new Map<number, WordRow>(rows.map((r) => [r.id, r]));
        for (const item of items) {
          const r = map.get(item.wordId);
          if (r) map.set(r.id, { ...r, ...computeReview(r, item.correct, now) });
        }
        for (const id of ids) {
          const r = map.get(id);
          if (!r) continue;
          const [u] = await tx
            .update(words)
            .set({
              mastery: r.mastery,
              timesReviewed: r.timesReviewed,
              timesCorrect: r.timesCorrect,
              timesWrong: r.timesWrong,
              lastReviewedAt: r.lastReviewedAt,
              nextReviewAt: r.nextReviewAt,
            })
            .where(eq(words.id, id))
            .returning();
          if (u) updated.push(serializeWord(u));
        }
        const logs = items
          .filter((i) => map.has(i.wordId))
          .map((i) => ({ wordId: i.wordId, correct: i.correct, source, qtype: i.type, day, createdAt: now }));
        if (logs.length) await tx.insert(reviewLogs).values(logs);
      });
    }

    let session: QuizSession | null = null;
    if (source === "quiz" && body.session) {
      const s = body.session;
      const typeStats: Record<string, { total: number; correct: number }> = {};
      for (const i of items) {
        if (!i.type) continue;
        const t = (typeStats[i.type] ??= { total: 0, correct: 0 });
        t.total++;
        if (i.correct) t.correct++;
      }
      const [row] = await db
        .insert(quizSessions)
        .values({
          total: int(s.total, 500),
          correct: int(s.correct, 500),
          durationSec: int(s.durationSec),
          bestStreak: int(s.bestStreak, 500),
          xp: int(s.xp),
          source: typeof s.source === "string" ? s.source.slice(0, 60) : "all",
          types: Array.isArray(s.types) ? s.types.map(String).slice(0, 20) : [],
          typeStats,
        })
        .returning();
      session = serializeSession(row);
    }

    const correct = items.filter((i) => i.correct).length;
    const activity = await bumpActivity(day, {
      reviews: items.length,
      correct,
      quizzes: session ? 1 : 0,
      flashcards: source === "flashcard" ? items.length : 0,
    });

    return Response.json({ words: updated, activity, session });
  } catch (err) {
    console.error("review failed", err);
    return jsonError("Could not save your progress", 500);
  }
}
