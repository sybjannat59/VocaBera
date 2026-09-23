import { db } from "@/db";
import { ensureSchema } from "@/lib/server/words";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSchema().catch((err) => {
      if (err instanceof Error && err.message.startsWith("DATABASE_URL")) throw err;
      console.error("schema bootstrap failed", err);
    });
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (err) {
    const error = err instanceof Error && err.message.startsWith("DATABASE_URL") ? err.message : "Database unreachable";
    return Response.json({ ok: false, error }, { status: 500 });
  }
}
