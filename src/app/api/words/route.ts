import { desc } from "drizzle-orm";
import { db } from "@/db";
import { words } from "@/db/schema";
import { bumpActivity, jsonError, safeDay, sanitizeWordInput, serializeWord, ensureSchema } from "@/lib/server/words";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(words).orderBy(desc(words.createdAt), desc(words.id));
  return Response.json({ words: rows.map(serializeWord) });
}

export async function POST(req: Request) {
  await ensureSchema();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const { data, error } = sanitizeWordInput(body);
  if (error || !data?.word) return jsonError(error ?? "Invalid request body");
  try {
    const [row] = await db
      .insert(words)
      .values({ ...data, word: data.word })
      .returning();
    const activity = await bumpActivity(safeDay(body?.localDate), { wordsAdded: 1 });
    return Response.json({ word: serializeWord(row), activity }, { status: 201 });
  } catch (err) {
    console.error("create word failed", err);
    return jsonError("Could not save the word", 500);
  }
}
