import { enrichWithAi } from "@/lib/server/autofill";
import { lookupLexicon } from "@/lib/server/lexicon";
import { jsonError } from "@/lib/server/words";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // works on every Vercel plan

const WORD_RE = /^[A-Za-z][A-Za-z' -]{0,58}[A-Za-z]$|^[A-Za-z]$/;
const hits = new Map<string, number[]>();

function rateLimited(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 2000) hits.delete(hits.keys().next().value as string);
  return recent.length > 20;
}

export async function POST(req: Request) {
  if (rateLimited(req)) return jsonError("Too many AI requests. Please wait a minute.", 429);
  const body = (await req.json().catch(() => null)) as { word?: unknown } | null;
  const word = typeof body?.word === "string" ? body.word.trim().replace(/\s+/g, " ") : "";
  if (!WORD_RE.test(word)) return jsonError("Enter a valid English word.");
  try {
    const started = Date.now();
    const { evidence, found } = await lookupLexicon(word);
    if (!found) return jsonError("No dictionary evidence found for this word.", 404);
    const result = await enrichWithAi(evidence, Math.max(10_000, 52_000 - (Date.now() - started)));
    return Response.json(result);
  } catch (err) {
    console.error("AI autofill failed", err);
    return jsonError("AI enrichment failed. Please try again.", 502);
  }
}
