import { db } from "@/db";
import { dailyActivity, quizSessions, reviewLogs, words } from "@/db/schema";
import { SAMPLE_WORDS } from "@/lib/sample-words";
import { ensureSchema, getBootstrap, hasDatabase, jsonError } from "@/lib/server/words";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { action?: string } | null;

  if (!hasDatabase()) {
    return Response.json({ words: [], activity: [], sessions: [] });
  }

  await ensureSchema();
  try {
    switch (body?.action) {
      case "seed": {
        const existing = await db.select({ word: words.word }).from(words);
        const have = new Set(existing.map((e) => e.word.toLowerCase()));
        const toInsert = SAMPLE_WORDS.filter((w) => !have.has(w.word.toLowerCase()));
        const base = Date.now();
        if (toInsert.length) {
          await db
            .insert(words)
            .values(toInsert.map((w, i) => ({ ...w, createdAt: new Date(base - i * 1000), updatedAt: new Date(base) })));
        }
        return Response.json({ ...(await getBootstrap()), inserted: toInsert.length });
      }
      case "reset-progress": {
        await db.transaction(async (tx) => {
          await tx
            .update(words)
            .set({ mastery: 0, timesReviewed: 0, timesCorrect: 0, timesWrong: 0, lastReviewedAt: null, nextReviewAt: null });
          await tx.delete(reviewLogs);
          await tx.delete(quizSessions);
          await tx.delete(dailyActivity);
        });
        return Response.json(await getBootstrap());
      }
      case "delete-all": {
        await db.transaction(async (tx) => {
          await tx.delete(words);
          await tx.delete(reviewLogs);
          await tx.delete(quizSessions);
          await tx.delete(dailyActivity);
        });
        return Response.json(await getBootstrap());
      }
      default:
        return jsonError("Unknown action");
    }
  } catch (err) {
    console.error("data action failed", err);
    return jsonError("Action failed. Please try again.", 500);
  }
}
