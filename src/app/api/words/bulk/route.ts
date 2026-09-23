import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { words, type NewWordRow } from "@/db/schema";
import {
  bumpActivity,
  jsonError,
  safeDay,
  sanitizeImportItem,
  sanitizeWordInput,
  serializeWord, ensureSchema } from "@/lib/server/words";

export const dynamic = "force-dynamic";

const toIds = (v: unknown) =>
  (Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 5000);

export async function POST(req: Request) {
  await ensureSchema();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("Invalid request body");

  switch (body.action) {
    case "import": {
      const items = Array.isArray(body.words) ? body.words.slice(0, 5000) : [];
      const existing = await db.select({ word: words.word }).from(words);
      const have = new Set(existing.map((e) => e.word.toLowerCase()));
      const rows: NewWordRow[] = [];
      let skipped = 0;
      for (const item of items) {
        const d = sanitizeImportItem(item);
        if (!d?.word) {
          skipped++;
          continue;
        }
        const key = d.word.toLowerCase();
        if (have.has(key)) {
          skipped++;
          continue;
        }
        have.add(key);
        rows.push({ ...d, word: d.word });
      }
      const inserted = [];
      for (let i = 0; i < rows.length; i += 400) {
        inserted.push(...(await db.insert(words).values(rows.slice(i, i + 400)).returning()));
      }
      const activity = inserted.length
        ? await bumpActivity(safeDay(body.localDate), { wordsAdded: inserted.length })
        : null;
      return Response.json({ inserted: inserted.map(serializeWord), skipped, activity });
    }

    case "delete": {
      const ids = toIds(body.ids);
      if (!ids.length) return Response.json({ ids: [] });
      const res = await db.delete(words).where(inArray(words.id, ids)).returning({ id: words.id });
      return Response.json({ ids: res.map((r) => r.id) });
    }

    case "update": {
      const ids = toIds(body.ids);
      const { data } = sanitizeWordInput(body.patch ?? {}, { partial: true });
      const set: Partial<NewWordRow> = {};
      if (data?.isFavorite !== undefined) set.isFavorite = data.isFavorite;
      if (data?.difficulty !== undefined) set.difficulty = data.difficulty;
      if (!ids.length || !Object.keys(set).length) return jsonError("Nothing to update");
      const rows = await db
        .update(words)
        .set({ ...set, updatedAt: new Date() })
        .where(inArray(words.id, ids))
        .returning();
      return Response.json({ words: rows.map(serializeWord) });
    }

    case "reset-progress": {
      const ids = toIds(body.ids);
      if (!ids.length) return jsonError("No words selected");
      const rows = await db
        .update(words)
        .set({ mastery: 0, timesReviewed: 0, timesCorrect: 0, timesWrong: 0, lastReviewedAt: null, nextReviewAt: null })
        .where(inArray(words.id, ids))
        .returning();
      return Response.json({ words: rows.map(serializeWord) });
    }

    default:
      return jsonError("Unknown action");
  }
}
