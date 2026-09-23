import { buildDraft } from "@/lib/server/autofill";
import { lookupLexicon } from "@/lib/server/lexicon";
import { jsonError } from "@/lib/server/words";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const WORD_RE = /^[A-Za-z][A-Za-z' -]{0,58}[A-Za-z]$|^[A-Za-z]$/;

export async function GET(req: Request) {
  const word = (new URL(req.url).searchParams.get("word") ?? "").trim().replace(/\s+/g, " ");
  if (!WORD_RE.test(word)) return jsonError("Enter a valid English word (letters, spaces, hyphens or apostrophes).");
  try {
    const { evidence, sources, found } = await lookupLexicon(word);
    if (!found) return Response.json({ found: false, sources }, { status: 404 });
    const { fields, alternatives } = buildDraft(evidence);
    return Response.json({ found: true, fields, alternatives, sources });
  } catch (err) {
    console.error("autofill lookup failed", err);
    return jsonError("Dictionary lookup failed. Please try again.", 502);
  }
}
