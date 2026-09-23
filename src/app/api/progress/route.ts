import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { quizSessions, reviewLogs } from "@/db/schema";
import { ensureSchema, hasDatabase, jsonError, serializeSession } from "@/lib/server/words";
import type { ProgressData } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!hasDatabase()) {
    return Response.json({
      typeStats: [],
      sourceStats: [],
      hours: Array(24).fill(0),
      sessions: [],
    });
  }

  try {
    await ensureSchema();
    const tzRaw = Number(new URL(req.url).searchParams.get("tz"));
    const tz = Number.isFinite(tzRaw) ? Math.max(-900, Math.min(900, Math.round(tzRaw))) : 0;

    const [typeRows, sourceRows, hourRows, sess] = await Promise.all([
      db
        .select({
          type: reviewLogs.qtype,
          total: sql<number>`count(*)::int`,
          correct: sql<number>`sum(case when ${reviewLogs.correct} then 1 else 0 end)::int`,
        })
        .from(reviewLogs)
        .where(and(eq(reviewLogs.source, "quiz"), ne(reviewLogs.qtype, "")))
        .groupBy(reviewLogs.qtype),
      db
        .select({
          source: reviewLogs.source,
          total: sql<number>`count(*)::int`,
          correct: sql<number>`sum(case when ${reviewLogs.correct} then 1 else 0 end)::int`,
        })
        .from(reviewLogs)
        .groupBy(reviewLogs.source),
      db
        .select({
          hour: sql<number>`extract(hour from ((${reviewLogs.createdAt} at time zone 'UTC') - make_interval(mins => ${tz}::int)))::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(reviewLogs)
        .groupBy(sql`1`),
      db.select().from(quizSessions).orderBy(desc(quizSessions.createdAt)).limit(100),
    ]);

    const hours = Array.from({ length: 24 }, () => 0);
    for (const r of hourRows) if (r.hour >= 0 && r.hour < 24) hours[r.hour] = r.count;

    const data: ProgressData = {
      typeStats: typeRows,
      sourceStats: sourceRows,
      hours,
      sessions: sess.map(serializeSession),
    };
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("progress failed", err);
    return Response.json({
      typeStats: [],
      sourceStats: [],
      hours: Array(24).fill(0),
      sessions: [],
    });
  }
}
