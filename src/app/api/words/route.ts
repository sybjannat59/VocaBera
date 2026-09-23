import { desc } from "drizzle-orm";
import { db } from "@/db";
import { words } from "@/db/schema";
import {
  bumpActivity,
  ensureSchema,
  hasDatabase,
  jsonError,
  safeDay,
  sanitizeWordInput,
  serializeWord,
} from "@/lib/server/words";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDatabase()) {
    return Response.json({ words: [] });
  }
  try {
    const rows = await db.select().from(words).orderBy(desc(words.createdAt), desc(words.id));
    return Response.json({ words: rows.map(serializeWord) });
  } catch {
    return Response.json({ words: [] });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const { data, error } = sanitizeWordInput(body);
  if (error || !data?.word) return jsonError(error ?? "Invalid request body");

  if (!hasDatabase()) {
    const now = new Date();
    return Response.json(
      {
        word: {
          id: Date.now(),
          ...data,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
        activity: {
          day: safeDay(body?.localDate),
          reviews: 0,
          correct: 0,
          wordsAdded: 1,
          quizzes: 0,
          flashcards: 0,
        },
      },
      { status: 201 },
    );
  }

  await ensureSchema();

  try {
    const [row] = await db
      .insert(words)
      .values({ ...data, word: data.word })
      .returning();
    const activity = await bumpActivity(safeDay(body?.localDate), { wordsAdded: 1 });
    return Response.json({ word: serializeWord(row), activity }, { status: 201 });
  } catch (err) {
    console.error("create word failed", err);
    return jsonError("Could not save the word to database", 500);
  }
}
