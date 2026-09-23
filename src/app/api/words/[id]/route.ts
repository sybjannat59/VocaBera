import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { reviewLogs, words } from "@/db/schema";
import { jsonError, sanitizeWordInput, serializeWord } from "@/lib/server/words";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function parseId(params: Ctx["params"]) {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_req: Request, { params }: Ctx) {
  const id = await parseId(params);
  if (!id) return jsonError("Invalid id");
  const [row] = await db.select().from(words).where(eq(words.id, id));
  if (!row) return jsonError("Word not found", 404);
  const logs = await db
    .select({ correct: reviewLogs.correct, source: reviewLogs.source, qtype: reviewLogs.qtype, createdAt: reviewLogs.createdAt })
    .from(reviewLogs)
    .where(eq(reviewLogs.wordId, id))
    .orderBy(desc(reviewLogs.createdAt))
    .limit(30);
  return Response.json({
    word: serializeWord(row),
    history: logs.reverse().map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const id = await parseId(params);
  if (!id) return jsonError("Invalid id");
  const body = await req.json().catch(() => null);
  const { data, error } = sanitizeWordInput(body, { partial: true });
  if (error || !data) return jsonError(error ?? "Invalid request body");
  if (!Object.keys(data).length) return jsonError("Nothing to update");
  const [row] = await db
    .update(words)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(words.id, id))
    .returning();
  if (!row) return jsonError("Word not found", 404);
  return Response.json({ word: serializeWord(row) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = await parseId(params);
  if (!id) return jsonError("Invalid id");
  const res = await db.delete(words).where(eq(words.id, id)).returning({ id: words.id });
  if (!res.length) return jsonError("Word not found", 404);
  return Response.json({ ok: true, id });
}
