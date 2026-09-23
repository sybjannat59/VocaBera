import "server-only";

import { analyzeMorphology, validateAffix } from "@/lib/morphology";
import { capitalizeFirst, sentenceCase } from "@/lib/text-format";
import { PARTS_OF_SPEECH, type Difficulty } from "@/lib/types";
import { normPos, usesWord, type LexiconEvidence } from "./lexicon";

export interface AutofillFields {
  pronunciation?: string;
  partOfSpeech?: string;
  banglaMeaning?: string;
  englishMeaning?: string;
  synonyms?: string[];
  antonyms?: string[];
  example?: string;
  prefix?: string;
  rootWord?: string;
  suffix?: string;
  mnemonic?: string;
  etymology?: string;
  notes?: string;
  difficulty?: Difficulty;
}

export interface Alternatives {
  definitions: string[];
  examples: string[];
  bangla: string[];
}

const hasBangla = (s: string) => /[\u0980-\u09FF]/.test(s);
const firstSentence = (s: string) => {
  const t = s.trim();
  const m = t.match(/^(.{20,}?[.;])\s+[A-Z(]/);
  return (m ? m[1] : t).replace(/;$/, ".");
};
const endSentence = (s: string) => {
  const t = sentenceCase(s.trim().replace(/\s+/g, " "));
  return t && !/[.!?…]$/.test(t) ? `${t}.` : t;
};
const capList = (items: string[], n: number) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const v = capitalizeFirst(raw.trim());
    if (!v || v.length > 40 || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
    if (out.length >= n) break;
  }
  return out;
};

export function difficultyFromFrequency(f: number | null, word: string): Difficulty {
  if (f === null) return word.length >= 10 ? "hard" : word.length <= 5 ? "easy" : "medium";
  if (f >= 25) return "easy";
  if (f >= 2.5) return "medium";
  return "hard";
}

function affixesToParts(word: string, affixes: string[]) {
  const out = { prefix: "", rootWord: "", suffix: "" };
  for (const a of affixes) {
    const v = a.trim();
    if (!v || v.includes(" ")) continue;
    if (v.endsWith("-") && !out.prefix) out.prefix = v;
    else if (v.startsWith("-") && !out.suffix) out.suffix = v;
    else if (!out.rootWord && !v.startsWith("-") && !v.endsWith("-") && v.toLowerCase() !== word.toLowerCase()) out.rootWord = v;
  }
  return out;
}

/** Deterministic, evidence-only draft (instant; no AI). */
export function buildDraft(e: LexiconEvidence): { fields: AutofillFields; alternatives: Alternatives } {
  const pos = e.partsOfSpeech[0] ?? "";
  const defs = e.definitions.filter((d) => d.text.length <= 220);
  const ranked = [...defs].sort((a, b) => {
    const pa = a.pos === pos ? 0 : 1;
    const pb = b.pos === pos ? 0 : 1;
    return pa - pb || (a.source === "Wiktionary" ? 0 : 1) - (b.source === "Wiktionary" ? 0 : 1);
  });
  const examples = [...e.examples].sort((a, b) => {
    const score = (t: string) => (t.length >= 30 && t.length <= 120 ? 0 : 1) + (a.source === "Tatoeba" ? 0 : 0.5);
    return score(a.text) - score(b.text);
  });
  const topBn = e.bangla[0]?.score ?? 0;
  const bangla = e.bangla.filter((b, i) => i === 0 || b.score >= topBn * 0.45).slice(0, 3).map((b) => b.text);

  const fromWikt = affixesToParts(e.word, e.affixes);
  const morph = e.morphology;
  const parts = fromWikt.prefix || fromWikt.suffix || fromWikt.rootWord
    ? fromWikt
    : { prefix: morph.prefix, rootWord: morph.root, suffix: morph.suffix };

  const fields: AutofillFields = {
    pronunciation: e.pronunciation,
    partOfSpeech: pos,
    englishMeaning: ranked[0] ? endSentence(firstSentence(ranked[0].text)) : "",
    banglaMeaning: bangla.join("; "),
    synonyms: capList(e.synonyms, 6),
    antonyms: capList(e.antonyms, 5),
    example: examples[0] ? endSentence(examples[0].text) : "",
    etymology: e.etymology,
    difficulty: difficultyFromFrequency(e.frequency, e.word),
    ...parts,
  };
  return {
    fields,
    alternatives: {
      definitions: ranked.slice(0, 6).map((d) => endSentence(firstSentence(d.text))),
      examples: examples.slice(0, 6).map((x) => endSentence(x.text)),
      bangla: e.bangla.map((b) => b.text),
    },
  };
}

/* ------------------------------------ AI ----------------------------------- */

interface Provider {
  name: string;
  url: string;
  model: string;
  headers: Record<string, string>;
  extra: Record<string, unknown>;
}

function providers(): Provider[] {
  const key = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const list: Provider[] = [];
  if (key) {
    const base = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    list.push({
      name: process.env.AI_PROVIDER_NAME || "OpenAI-compatible",
      url: `${base}/chat/completions`,
      model: process.env.AI_MODEL || "gpt-4o-mini",
      headers: { Authorization: `Bearer ${key}` },
      extra: { temperature: 0.2 },
    });
  }
  list.push({
    name: "Pollinations AI",
    url: "https://text.pollinations.ai/openai",
    model: "openai",
    headers: {},
    extra: { referrer: "vocabera", private: true },
  });
  return list;
}

function parseJsonLoose(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function buildPrompt(e: LexiconEvidence) {
  const evidence = {
    word: e.word,
    partsOfSpeech: e.partsOfSpeech,
    definitions: e.definitions.slice(0, 4).map((d) => `${d.pos ? `(${d.pos}) ` : ""}${firstSentence(d.text).slice(0, 160)}`),
    examples: e.examples.slice(0, 3).map((x) => x.text),
    synonymCandidates: e.synonyms.slice(0, 8),
    antonymCandidates: e.antonyms.slice(0, 5),
    banglaCandidates: e.bangla.slice(0, 4).map((b) => b.text),
    etymology: e.etymology.slice(0, 200),
    wiktionaryAffixes: e.affixes,
    frequencyPerMillion: e.frequency,
  };
  return [
    {
      role: "system",
      content:
        "You are a meticulous lexicographer and expert English–Bangla vocabulary teacher for Bangladeshi students preparing for IELTS, GRE, SAT and BCS. Ground every answer in the supplied dictionary evidence (from Wiktionary, Datamuse, Tatoeba and MyMemory). Never invent etymology or word parts. Respond with a single JSON object only.",
    },
    {
      role: "user",
      content: `Create a vocabulary card for the English word "${e.word}".

Dictionary evidence:
${JSON.stringify(evidence)}

Return JSON with exactly these keys:
{
 "partOfSpeech": one of ${JSON.stringify(PARTS_OF_SPEECH)} (most common use),
 "englishMeaning": one clear learner-friendly definition of the most common sense, max 22 words, sentence case, ending with a period, without using the word itself,
 "banglaMeaning": 1-3 precise Bangla equivalents in Bangla script, separated by "; " (standard Bangla Academy style, no transliteration, no English),
 "synonyms": up to 6 common single-word synonyms for that sense,
 "antonyms": up to 5 antonyms (empty array if none),
 "example": one natural modern sentence (8-20 words) that uses "${e.word}" in that sense; prefer a supplied example if it is good,
 "prefix": real prefix with meaning like "bene- (well)" or "",
 "root": real root with meaning like "vol (wish)" or "",
 "suffix": real suffix with meaning like "-ent (having the quality of)" or "",
 "mnemonic": one short vivid memory trick (max 25 words) linking the sound or spelling to the meaning,
 "etymology": origin in max 20 words, consistent with the evidence, or "",
 "difficulty": "easy" | "medium" | "hard" for an intermediate learner,
 "notes": a short usage tip or common collocation (max 18 words) or "",
 "confidence": number 0-1
}
Only include prefix/root/suffix when they genuinely appear in the spelling of "${e.word}". Leave them "" for simple native words.`,
    },
  ];
}

async function callProvider(p: Provider, messages: unknown[], timeoutMs: number) {
  const res = await fetch(p.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...p.headers },
    body: JSON.stringify({ model: p.model, messages, response_format: { type: "json_object" }, ...p.extra }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${p.name} ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string | null; reasoning?: string }; finish_reason?: string }[] };
  const choice = data.choices?.[0];
  const content = choice?.message?.content ?? "";
  const parsed = parseJsonLoose(content) ?? parseJsonLoose(choice?.message?.reasoning ?? "");
  if (!parsed) throw new Error(`${p.name} returned invalid JSON (finish=${choice?.finish_reason ?? "?"}, len=${content.length}): ${content.slice(0, 160).replace(/\s+/g, " ")}`);
  return parsed;
}

const str = (v: unknown, max = 400) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const arr = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x, 40)).filter(Boolean) : typeof v === "string" ? v.split(/[,;]/).map((x) => x.trim()) : []);

/** Validates AI output so hallucinations never reach the form. */
export function validateAi(word: string, raw: Record<string, unknown>): AutofillFields {
  const out: AutofillFields = {};
  const pos = normPos(str(raw.partOfSpeech));
  if (pos) out.partOfSpeech = pos;

  const def = str(raw.englishMeaning, 300);
  if (def.length >= 8 && !/[\u0980-\u09FF]/.test(def)) out.englishMeaning = endSentence(def);

  const bn = str(raw.banglaMeaning, 120)
    .split(/[;,،]/)
    .map((s) => s.trim())
    .filter((s) => hasBangla(s) && !/[a-z]{2,}/i.test(s) && s.length <= 30);
  if (bn.length) out.banglaMeaning = [...new Set(bn)].slice(0, 3).join("; ");

  const lower = word.toLowerCase();
  const syn = capList(arr(raw.synonyms).filter((s) => s.toLowerCase() !== lower && /^[a-z][a-z\s'-]*$/i.test(s)), 6);
  if (syn.length) out.synonyms = syn;
  const ant = capList(arr(raw.antonyms).filter((s) => s.toLowerCase() !== lower && /^[a-z][a-z\s'-]*$/i.test(s)), 5);
  if (ant.length) out.antonyms = ant;

  const ex = str(raw.example, 260);
  if (ex && usesWord(ex, word) && ex.split(/\s+/).length >= 5) out.example = endSentence(ex);

  const prefix = validateAffix(word, str(raw.prefix, 60), "prefix");
  const root = validateAffix(word, str(raw.root ?? raw.rootWord, 60), "root");
  const suffix = validateAffix(word, str(raw.suffix, 60), "suffix");
  if (prefix || root || suffix) Object.assign(out, { prefix, rootWord: root, suffix });

  const mn = str(raw.mnemonic, 220);
  if (mn.length >= 10) out.mnemonic = sentenceCase(mn);
  const ety = str(raw.etymology, 220);
  if (ety.length >= 8) out.etymology = sentenceCase(ety);
  const notes = str(raw.notes, 200);
  if (notes.length >= 6) out.notes = sentenceCase(notes);
  const diff = str(raw.difficulty).toLowerCase();
  const diffMap: Record<string, Difficulty> = { easy: "easy", beginner: "easy", basic: "easy", elementary: "easy", medium: "medium", intermediate: "medium", moderate: "medium", hard: "hard", advanced: "hard", difficult: "hard" };
  if (diffMap[diff]) out.difficulty = diffMap[diff];
  return out;
}

/** Rule-based enrichment used when every AI provider is unavailable. */
export function fallbackEnrichment(e: LexiconEvidence, draft: AutofillFields): AutofillFields {
  const morph = analyzeMorphology(e.word);
  const gloss = (v: string) => v.match(/\(([^)]+)\)/)?.[1] ?? "";
  let mnemonic = "";
  const root = draft.rootWord || morph.root;
  const def = (draft.englishMeaning ?? "").split(/[.;]/)[0].trim().toLowerCase();
  if ((draft.prefix || morph.prefix) && root && gloss(root)) {
    const pre = draft.prefix || morph.prefix;
    mnemonic = `${e.word.toUpperCase()}: ${pre.split(" ")[0].replace(/-$/, "").toUpperCase()} = ${gloss(pre) || "…"}, ${root.split(" ")[0].toUpperCase()} = ${gloss(root)} → ${def}.`;
  } else if (draft.synonyms?.[0] && def) {
    mnemonic = `Link ${e.word} with “${draft.synonyms[0].toLowerCase()}” — both suggest ${def}.`;
  }
  return {
    prefix: draft.prefix || morph.prefix,
    rootWord: draft.rootWord || morph.root,
    suffix: draft.suffix || morph.suffix,
    mnemonic: mnemonic ? sentenceCase(mnemonic) : "",
  };
}

const aiCache = new Map<string, { at: number; value: { fields: AutofillFields; provider: string } }>();

export async function enrichWithAi(e: LexiconEvidence, budgetMs = 48_000): Promise<{ fields: AutofillFields; provider: string; ai: boolean }> {
  const key = e.word.toLowerCase();
  const hit = aiCache.get(key);
  if (hit && Date.now() - hit.at < 12 * 3600_000) return { ...hit.value, ai: true };
  const messages = buildPrompt(e);
  const deadline = Date.now() + budgetMs;
  for (const p of providers()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 6_000) break;
      try {
        const raw = await callProvider(p, messages, Math.min(attempt === 0 ? 40_000 : 25_000, remaining - 1_000));
        const fields = validateAi(e.word, raw);
        if (Object.keys(fields).length >= 4) {
          const value = { fields, provider: `${p.name}${p.model ? ` · ${p.model}` : ""}` };
          if (aiCache.size > 400) aiCache.delete(aiCache.keys().next().value as string);
          aiCache.set(key, { at: Date.now(), value });
          return { ...value, ai: true };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("AI enrichment failed", p.name, attempt, msg);
        if (/timeout|aborted/i.test(msg)) break; // a slow provider won't be faster on retry
        await new Promise((r) => setTimeout(r, / 429/.test(msg) ? 4000 : 800));
      }
    }
  }
  const { fields: draft } = buildDraft(e);
  return { fields: fallbackEnrichment(e, draft), provider: "Rule-based morphology engine", ai: false };
}
