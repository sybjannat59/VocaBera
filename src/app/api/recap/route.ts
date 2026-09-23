import { and, desc, eq, gt, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { dailyActivity, reviewLogs } from "@/db/schema";
import { ensureSchema, hasDatabase, jsonError, safeDay, serializeActivity } from "@/lib/server/words";
import type { RecapData } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Summary of the most recent active day before `today` (client local date). */
export async function GET(req: Request) {
  if (!hasDatabase()) {
    return Response.json({ day: null, activity: null, items: [] } satisfies RecapData);
  }

  try {
    await ensureSchema();
    const url = new URL(req.url);
    const today = safeDay(url.searchParams.get("today"));
    const requested = url.searchParams.get("day");

    let day: string | null = null;
    if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)) day = requested;
    else {
      const [last] = await db
        .select({ day: dailyActivity.day })
        .from(dailyActivity)
        .where(and(lt(dailyActivity.day, today), or(gt(dailyActivity.reviews, 0), gt(dailyActivity.wordsAdded, 0))))
        .orderBy(desc(dailyActivity.day))
        .limit(1);
      day = last?.day ?? null;
    }
    if (!day) return Response.json({ day: null, activity: null, items: [] } satisfies RecapData);

    const [act] = await db.select().from(dailyActivity).where(eq(dailyActivity.day, day));
    const items = await db
      .select({
        wordId: reviewLogs.wordId,
        reviews: sql<number>`count(*)::int`,
        correct: sql<number>`sum(case when ${reviewLogs.correct} then 1 else 0 end)::int`,
        lastCorrect: sql<boolean>`(array_agg(${reviewLogs.correct} order by ${reviewLogs.createdAt} desc))[1]`,
      })
      .from(reviewLogs)
      .where(eq(reviewLogs.day, day))
      .groupBy(reviewLogs.wordId);

    return Response.json({ day, activity: act ? serializeActivity(act) : null, items } satisfies RecapData, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("recap failed", err);
    return Response.json({ day: null, activity: null, items: [] } satisfies RecapData);
  }
}
