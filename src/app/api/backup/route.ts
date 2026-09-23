import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { dailyActivity, quizSessions, reviewLogs, words, type NewWordRow } from "@/db/schema";
import {
  ensureSchema,
  getBootstrap,
  jsonError,
  sanitizeImportItem,
  serializeActivity,
  serializeSession,
  serializeWord,
} from "@/lib/server/words";
import type { BackupImportResult } from "@/lib/types";

export const dynamic = "force-dynamic";

const int = (v: unknown, max = 1_000_000) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
};
const date = (v: unknown) => {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Full app-data export: words (with progress), daily activity, quiz history and review logs. */
export async function GET() {
  try {
    await ensureSchema();
    const [ws, act, sess, logs] = await Promise.all([
      db.select().from(words).orderBy(asc(words.id)),
      db.select().from(dailyActivity).orderBy(asc(dailyActivity.day)),
      db.select().from(quizSessions).orderBy(asc(quizSessions.id)),
      db.select().from(reviewLogs).orderBy(asc(reviewLogs.id)),
    ]);
    return Response.json({
      app: "VocaBera",
      version: 2,
      exportedAt: new Date().toISOString(),
      words: ws.map(serializeWord),
      activity: act.map(serializeActivity),
      sessions: sess.map(serializeSession),
      logs: logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
    });
  } catch (err) {
    console.error("backup export failed", err);
    return jsonError("Could not export data", 500);
  }
}

export async function POST(req: Request) {
  await ensureSchema();
  const body = (await req.json().catch(() => null)) as { mode?: unknown; data?: unknown } | null;
  if (!body || body.data === undefined) return jsonError("Invalid backup file");
  const mode = body.mode === "replace" ? "replace" : "merge";
  const data = body.data as Record<string, unknown> | unknown[];
  const wordsIn = Array.isArray(data) ? data : arr(data?.words);
  const activityIn = Array.isArray(data) ? [] : arr(data?.activity);
  const sessionsIn = Array.isArray(data) ? [] : arr(data?.sessions);
  const logsIn = Array.isArray(data) ? [] : arr(data?.logs);
  if (!wordsIn.length && !activityIn.length && !sessionsIn.length) return jsonError("No VocaBera data found in this file");

  const result: BackupImportResult = { words: 0, skipped: 0, activity: 0, sessions: 0, logs: 0 };

  try {
    await db.transaction(async (tx) => {
      if (mode === "replace") {
        await tx.delete(reviewLogs);
        await tx.delete(words);
        await tx.delete(quizSessions);
        await tx.delete(dailyActivity);
      }

      /* ------------------------------- Words ------------------------------- */
      const existing = mode === "replace" ? [] : await tx.select({ id: words.id, word: words.word }).from(words);
      const byWord = new Map(existing.map((e) => [e.word.toLowerCase(), e.id]));
      const pending: { oldId: number | null; key: string; row: NewWordRow }[] = [];
      const idMap = new Map<number, number>();
      const freshOld = new Set<number>();
      for (const item of wordsIn.slice(0, 20000)) {
        const d = sanitizeImportItem(item);
        const oldIdRaw = Number((item as { id?: unknown })?.id);
        const oldId = Number.isInteger(oldIdRaw) ? oldIdRaw : null;
        if (!d?.word) {
          result.skipped++;
          continue;
        }
        const key = d.word.toLowerCase();
        const have = byWord.get(key);
        if (have !== undefined) {
          if (oldId !== null && have > 0) idMap.set(oldId, have);
          result.skipped++;
          continue;
        }
        byWord.set(key, -1);
        pending.push({ oldId, key, row: { ...d, word: d.word } });
      }
      for (let i = 0; i < pending.length; i += 400) {
        const chunk = pending.slice(i, i + 400);
        const inserted = await tx.insert(words).values(chunk.map((c) => c.row)).returning({ id: words.id, word: words.word });
        const newIds = new Map(inserted.map((r) => [r.word.toLowerCase(), r.id]));
        for (const c of chunk) {
          const id = newIds.get(c.key);
          if (id === undefined) continue;
          byWord.set(c.key, id);
          if (c.oldId !== null) {
            idMap.set(c.oldId, id);
            freshOld.add(c.oldId);
          }
        }
        result.words += inserted.length;
      }

      /* ------------------------------ Activity ----------------------------- */
      const actRows = activityIn
        .map((a) => a as Record<string, unknown>)
        .filter((a) => isDay(a?.day))
        .map((a) => ({
          day: a.day as string,
          reviews: int(a.reviews),
          correct: int(a.correct),
          wordsAdded: int(a.wordsAdded),
          quizzes: int(a.quizzes),
          flashcards: int(a.flashcards),
        }));
      for (let i = 0; i < actRows.length; i += 500) {
        await tx
          .insert(dailyActivity)
          .values(actRows.slice(i, i + 500))
          .onConflictDoUpdate({
            target: dailyActivity.day,
            set: {
              reviews: sql`greatest(${dailyActivity.reviews}, excluded.reviews)`,
              correct: sql`greatest(${dailyActivity.correct}, excluded.correct)`,
              wordsAdded: sql`greatest(${dailyActivity.wordsAdded}, excluded.words_added)`,
              quizzes: sql`greatest(${dailyActivity.quizzes}, excluded.quizzes)`,
              flashcards: sql`greatest(${dailyActivity.flashcards}, excluded.flashcards)`,
            },
          });
      }
      result.activity = actRows.length;

      /* ------------------------------ Sessions ----------------------------- */
      const seen = new Set(
        mode === "replace"
          ? []
          : (await tx.select({ c: quizSessions.createdAt }).from(quizSessions)).map((r) => r.c.toISOString()),
      );
      const sessRows = sessionsIn
        .map((s) => s as Record<string, unknown>)
        .map((s) => ({ s, created: date(s?.createdAt) }))
        .filter(({ s, created }) => s && created && !seen.has(created.toISOString()))
        .map(({ s, created }) => ({
          total: int(s.total, 500),
          correct: int(s.correct, 500),
          durationSec: int(s.durationSec),
          bestStreak: int(s.bestStreak, 500),
          xp: int(s.xp),
          source: typeof s.source === "string" ? s.source.slice(0, 60) : "all",
          types: arr(s.types).map(String).slice(0, 20),
          typeStats:
            s.typeStats && typeof s.typeStats === "object" && !Array.isArray(s.typeStats)
              ? (s.typeStats as Record<string, { total: number; correct: number }>)
              : {},
          createdAt: created as Date,
        }));
      for (let i = 0; i < sessRows.length; i += 500) await tx.insert(quizSessions).values(sessRows.slice(i, i + 500));
      result.sessions = sessRows.length;

      /* -------------------------------- Logs ------------------------------- */
      const logRows = logsIn
        .map((l) => l as Record<string, unknown>)
        .filter((l) => l && freshOld.has(Number(l.wordId)) && typeof l.correct === "boolean" && isDay(l.day))
        .map((l) => ({
          wordId: idMap.get(Number(l.wordId)) as number,
          correct: l.correct as boolean,
          source: typeof l.source === "string" ? l.source.slice(0, 20) : "quiz",
          qtype: typeof l.qtype === "string" ? l.qtype.slice(0, 40) : "",
          day: l.day as string,
          createdAt: date(l.createdAt) ?? new Date(),
        }));
      for (let i = 0; i < logRows.length; i += 1000) await tx.insert(reviewLogs).values(logRows.slice(i, i + 1000));
      result.logs = logRows.length;
    });

    return Response.json({ ...(await getBootstrap()), result });
  } catch (err) {
    console.error("backup import failed", err);
    return jsonError("Import failed — the file may be corrupted.", 500);
  }
}
