import "server-only";

import { analyzeMorphology } from "@/lib/morphology";
import { PARTS_OF_SPEECH } from "@/lib/types";

const UA = "VocaBera/1.0 (vocabulary learning app; contact: app@vocabera.local)";

export interface SourceStatus {
  id: "wiktionary" | "datamuse" | "tatoeba" | "mymemory" | "freedict" | "gtranslate";
  name: string;
  ok: boolean;
  count: number;
  ms: number;
}

export interface LexiconEvidence {
  word: string;
  pronunciation: string;
  partsOfSpeech: string[];
  definitions: { pos: string; text: string; source: string }[];
  examples: { text: string; source: string }[];
  synonyms: string[];
  antonyms: string[];
  bangla: { text: string; score: number; source: string }[];
  etymology: string;
  affixes: string[];
  frequency: number | null;
  morphology: { prefix: string; root: string; suffix: string };
}

export interface LexiconResult {
  evidence: LexiconEvidence;
  sources: SourceStatus[];
  found: boolean;
}

/* --------------------------------- helpers -------------------------------- */

async function getJson<T>(url: string, ms: number): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(ms),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));

const stripHtml = (s: string) => decode(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

const hasBangla = (s: string) => /[\u0980-\u09FF]/.test(s);

function uniq(items: string[], limit = 50) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const v = raw.trim();
    const k = v.toLowerCase();
    if (!v || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

const POS_MAP: Record<string, string> = {
  n: "noun",
  v: "verb",
  adj: "adjective",
  adv: "adverb",
  u: "",
  prep: "preposition",
  conj: "conjunction",
  pron: "pronoun",
  interj: "interjection",
  interjection: "interjection",
  "proper noun": "noun",
};

export function normPos(p: string) {
  const k = p.toLowerCase().trim();
  const v = POS_MAP[k] ?? k;
  return (PARTS_OF_SPEECH as readonly string[]).includes(v) ? v : "";
}

/** Rough check that a sentence uses the word (or an inflection). */
export function usesWord(sentence: string, word: string) {
  const w = word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stem = w.length >= 5 && /[ey]$/.test(w) ? w.slice(0, -1) : w;
  return new RegExp(`\\b${stem}[a-z]{0,4}\\b`, "i").test(sentence);
}

/* ------------------------------- Wiktionary ------------------------------- */

interface WiktDef {
  partOfSpeech: string;
  language?: string;
  definitions: { definition: string; examples?: string[]; parsedExamples?: { example: string }[] }[];
}

async function wiktionaryDefinitions(word: string) {
  const title = encodeURIComponent(word.replace(/ /g, "_"));
  let data = await getJson<Record<string, WiktDef[]>>(`https://en.wiktionary.org/api/rest_v1/page/definition/${title}`, 6000);
  if (!data?.en && word !== word.toLowerCase()) {
    data = await getJson<Record<string, WiktDef[]>>(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word.toLowerCase())}`, 6000);
  }
  const defs: LexiconEvidence["definitions"] = [];
  const examples: LexiconEvidence["examples"] = [];
  const pos: string[] = [];
  for (const block of data?.en ?? []) {
    const p = normPos(block.partOfSpeech);
    if (p) pos.push(p);
    for (const d of block.definitions ?? []) {
      const text = stripHtml(d.definition ?? "");
      // Skip empty, form-of and heavily tagged obsolete senses.
      if (!text || text.length < 6 || /^(plural of|alternative (form|spelling) of|obsolete form of|misspelling of)/i.test(text)) continue;
      if (/^\((obsolete|archaic|rare)[^)]*\)/i.test(text) && defs.length >= 2) continue;
      defs.push({ pos: p, text: text.replace(/^\([^)]{1,40}\)\s*/, ""), source: "Wiktionary" });
      for (const ex of d.parsedExamples?.map((e) => e.example) ?? d.examples ?? []) {
        const t = stripHtml(ex);
        if (t.length >= 15 && t.length <= 200) examples.push({ text: t, source: "Wiktionary" });
      }
    }
  }
  return { defs: defs.slice(0, 8), examples: examples.slice(0, 6), pos: uniq(pos) };
}

const LANGS: Record<string, string> = {
  la: "Latin",
  "la-lat": "Late Latin",
  "la-med": "Medieval Latin",
  "la-new": "New Latin",
  ML: "Medieval Latin",
  LL: "Late Latin",
  grc: "Ancient Greek",
  el: "Greek",
  fro: "Old French",
  frm: "Middle French",
  fr: "French",
  enm: "Middle English",
  ang: "Old English",
  it: "Italian",
  es: "Spanish",
  de: "German",
  nl: "Dutch",
  non: "Old Norse",
  ar: "Arabic",
  fa: "Persian",
  sa: "Sanskrit",
  hi: "Hindi",
  pt: "Portuguese",
  "gem-pro": "Proto-Germanic",
  "ine-pro": "Proto-Indo-European",
};

function cleanEtymology(src: string) {
  let s = src;
  // {{bor|en|la|word}} {{der|en|la|word}} {{inh|en|enm|word}} {{uder|en|fro|word}}
  s = s.replace(/\{\{(?:bor|der|inh|uder|ubor|lbor|bor\+|der\+|inh\+|borrowed|derived|inherited)\|en\|([^|}]+)\|([^|}]*)[^}]*\}\}/g, (_, lang: string, w: string) =>
    `${LANGS[lang] ?? lang}${w ? ` ${w}` : ""}`,
  );
  s = s.replace(/\{\{(?:m|mention|l|link|ll|cog|ncog|noncog)\|([^|}]+)\|([^|}]*)(?:\|[^|}]*)?(?:\|([^|}]*))?[^}]*\}\}/g, (_, lang: string, w: string, gloss?: string) =>
    `${lang !== "en" && LANGS[lang] ? `${LANGS[lang]} ` : ""}${w}${gloss ? ` ("${gloss}")` : ""}`,
  );
  s = s.replace(/\{\{(?:af|affix|compound|com|prefix|suffix|confix)\|en\|([^}]+)\}\}/g, (_, parts: string) =>
    parts
      .split("|")
      .filter((p) => p && !p.includes("="))
      .join(" + "),
  );
  s = s.replace(/\{\{gloss\|([^}]+)\}\}/g, '("$1")');
  for (let i = 0; i < 4 && /\{\{[^{}]*\}\}/.test(s); i++) s = s.replace(/\{\{[^{}]*\}\}/g, ""); // drop remaining (nested) templates
  s = s.replace(/\{\{|\}\}/g, "").replace(/\((?:\s*whence\s*)\)/gi, "");
  s = s.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1").replace(/'''?/g, "");
  s = s.replace(/<ref[^>]*>[\s\S]*?<\/ref>|<ref[^>]*\/>/g, "").replace(/<[^>]+>/g, "");
  s = decode(s).replace(/\s+/g, " ").replace(/\s+([,.;)])/g, "$1").replace(/\(\s*\)/g, "").trim();
  const first = s.split(/(?<=\.)\s/)[0] ?? s;
  return first.length > 260 ? `${first.slice(0, 257)}…` : first;
}

async function wiktionaryWikitext(word: string) {
  const data = await getJson<{ parse?: { wikitext?: string } }>(
    `https://en.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(word.toLowerCase())}&prop=wikitext&format=json&formatversion=2&redirects=1`,
    6500,
  );
  const w = data?.parse?.wikitext ?? "";
  const start = w.indexOf("==English==");
  if (start < 0) return { etymology: "", ipa: "", synonyms: [] as string[], antonyms: [] as string[], affixes: [] as string[] };
  const rest = w.slice(start + 11);
  const next = rest.search(/\n==[^=]/);
  const en = next > 0 ? rest.slice(0, next) : rest;

  const etySection = en.match(/===\s*Etymology[^=]*===\n([\s\S]*?)(?=\n===|$)/)?.[1] ?? "";
  const affixes: string[] = [];
  for (const m of etySection.matchAll(/\{\{(?:af|affix|prefix|suffix|confix|compound)\|en\|([^}]+)\}\}/g)) {
    affixes.push(...m[1].split("|").filter((p) => p && !p.includes("=")));
  }
  const ipa = en.match(/\{\{IPA\|en\|([^|}]+)/)?.[1] ?? "";

  const listFrom = (section: string) => {
    const out: string[] = [];
    for (const m of en.matchAll(new RegExp(`====\\s*${section}\\s*====\\n([\\s\\S]*?)(?=\\n====|\\n===|$)`, "g"))) {
      for (const t of m[1].matchAll(/\{\{l\|en\|([^|}]+)/g)) out.push(t[1]);
      for (const t of m[1].matchAll(/\[\[([^|\]#:]+)(?:\|[^\]]*)?\]\]/g)) out.push(t[1]);
    }
    const tag = section === "Synonyms" ? "syn" : "ant";
    for (const m of en.matchAll(new RegExp(`\\{\\{(?:${tag}|${section.toLowerCase()})\\|en\\|([^}]+)\\}\\}`, "g"))) {
      out.push(...m[1].split("|").filter((p) => p && !p.includes("=") && !p.startsWith("Thesaurus")));
    }
    return uniq(out.map((x) => x.replace(/<[^>]+>/g, "").trim()).filter((x) => x && x.toLowerCase() !== word.toLowerCase() && !/[:;]/.test(x)), 12);
  };

  return {
    etymology: etySection ? cleanEtymology(etySection) : "",
    ipa,
    synonyms: listFrom("Synonyms"),
    antonyms: listFrom("Antonyms"),
    affixes: uniq(affixes, 6),
  };
}

/* -------------------------------- Datamuse -------------------------------- */

interface DatamuseWord {
  word: string;
  score?: number;
  tags?: string[];
  defs?: string[];
}

async function datamuse(word: string) {
  const q = encodeURIComponent(word.toLowerCase());
  const [meta, syn, ant, ml] = await Promise.all([
    getJson<DatamuseWord[]>(`https://api.datamuse.com/words?sp=${q}&md=dpfr&ipa=1&max=1`, 4500),
    getJson<DatamuseWord[]>(`https://api.datamuse.com/words?rel_syn=${q}&md=f&max=20`, 4500),
    getJson<DatamuseWord[]>(`https://api.datamuse.com/words?rel_ant=${q}&max=12`, 4500),
    getJson<DatamuseWord[]>(`https://api.datamuse.com/words?ml=${q}&md=f&max=12`, 4500),
  ]);
  const m = meta?.[0]?.word?.toLowerCase() === word.toLowerCase() ? meta[0] : undefined;
  const tags = m?.tags ?? [];
  const freq = Number(tags.find((t) => t.startsWith("f:"))?.slice(2));
  const ipa = tags.find((t) => t.startsWith("ipa_pron:"))?.slice(9) ?? "";
  const pos = uniq(tags.map((t) => normPos(t)).filter(Boolean));
  const defs = (m?.defs ?? []).map((d) => {
    const [p, ...rest] = d.split("\t");
    return { pos: normPos(p), text: rest.join(" ").trim(), source: "Datamuse" };
  });
  const single = (x: DatamuseWord) => /^[a-z][a-z-]*$/i.test(x.word) && x.word.toLowerCase() !== word.toLowerCase();
  // Prefer common synonyms (by frequency tag) so learners get useful words.
  const fq = (x: DatamuseWord) => Number(x.tags?.find((t) => t.startsWith("f:"))?.slice(2) ?? 0);
  const synPool = (syn ?? []).filter(single);
  const common = synPool.filter((x) => fq(x) >= 0.4);
  const bySyn = (common.length >= 3 ? common : synPool).sort((a, b) => Math.log1p(fq(b)) * 2 + (b.score ?? 0) / 3000 - (Math.log1p(fq(a)) * 2 + (a.score ?? 0) / 3000));
  return {
    ok: !!(m || syn?.length || ant?.length),
    frequency: Number.isFinite(freq) ? freq : null,
    ipa,
    pos,
    defs,
    synonyms: uniq(bySyn.map((x) => x.word), 12),
    antonyms: uniq((ant ?? []).filter(single).map((x) => x.word), 8),
    related: uniq((ml ?? []).filter(single).map((x) => x.word), 8),
  };
}

/* --------------------------------- Tatoeba -------------------------------- */

async function tatoeba(word: string) {
  const q = encodeURIComponent(word);
  const modern = await getJson<{ data?: { text: string; is_unapproved?: boolean }[] }>(
    `https://api.tatoeba.org/unstable/sentences?lang=eng&q=${q}&sort=relevance&limit=30`,
    5000,
  );
  let texts = (modern?.data ?? []).filter((s) => !s.is_unapproved).map((s) => s.text);
  if (!texts.length) {
    const legacy = await getJson<{ results?: { text: string }[] }>(
      `https://tatoeba.org/en/api_v0/search?from=eng&query=%3D${q}&orphans=no&unapproved=no&sort=relevance`,
      6000,
    );
    texts = (legacy?.results ?? []).map((r) => r.text);
  }
  return uniq(texts.filter((t) => t.length >= 18 && t.length <= 150 && usesWord(t, word)), 8).map((text) => ({ text, source: "Tatoeba" }));
}

/* ------------------------------- Translation ------------------------------ */

async function myMemory(word: string) {
  const data = await getJson<{
    responseData?: { translatedText?: string; match?: number };
    matches?: { translation?: string; quality?: string | number; match?: number; segment?: string }[];
  }>(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en%7Cbn`, 6000);
  const out: LexiconEvidence["bangla"] = [];
  const main = data?.responseData?.translatedText?.trim() ?? "";
  if (main && hasBangla(main)) out.push({ text: main, score: (data?.responseData?.match ?? 0.6) + 0.2, source: "MyMemory" });
  for (const m of data?.matches ?? []) {
    const t = (m.translation ?? "").replace(/\s+/g, " ").trim();
    if (!hasBangla(t) || t.length > 40 || /[a-z]{3,}/i.test(t)) continue;
    if (m.segment && m.segment.toLowerCase().trim() !== word.toLowerCase().trim()) continue;
    out.push({ text: t, score: (m.match ?? 0) * (Number(m.quality) || 50) / 100, source: "MyMemory" });
  }
  return out;
}

async function googleTranslate(word: string) {
  const data = await getJson<unknown[]>(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=bn&dt=t&dt=bd&q=${encodeURIComponent(word)}`,
    3500,
  );
  if (!Array.isArray(data)) return [];
  const out: LexiconEvidence["bangla"] = [];
  const main = (data[0] as unknown[][] | undefined)?.[0]?.[0];
  if (typeof main === "string" && hasBangla(main)) out.push({ text: main.trim(), score: 0.9, source: "Google Translate" });
  const dict = data[1] as [string, string[]][] | undefined;
  for (const entry of dict ?? []) for (const t of (entry?.[1] ?? []).slice(0, 4)) if (hasBangla(t)) out.push({ text: t, score: 0.7, source: "Google Translate" });
  return out;
}

/* ----------------------------- Free Dictionary ---------------------------- */

interface FreeDictEntry {
  phonetic?: string;
  phonetics?: { text?: string }[];
  meanings?: {
    partOfSpeech: string;
    synonyms?: string[];
    antonyms?: string[];
    definitions: { definition: string; example?: string }[];
  }[];
}

async function freeDictionary(word: string) {
  const data = await getJson<FreeDictEntry[]>(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`, 2500);
  if (!Array.isArray(data)) return null;
  const meanings = data.flatMap((e) => e.meanings ?? []);
  return {
    ipa: data.find((e) => e.phonetic)?.phonetic ?? data.flatMap((e) => e.phonetics ?? []).find((p) => p.text)?.text ?? "",
    defs: meanings.flatMap((m) => m.definitions.slice(0, 2).map((d) => ({ pos: normPos(m.partOfSpeech), text: d.definition, source: "Free Dictionary" }))),
    examples: meanings.flatMap((m) => m.definitions.filter((d) => d.example).map((d) => ({ text: d.example as string, source: "Free Dictionary" }))),
    synonyms: meanings.flatMap((m) => m.synonyms ?? []),
    antonyms: meanings.flatMap((m) => m.antonyms ?? []),
  };
}

/* ---------------------------------- merge --------------------------------- */

const cache = new Map<string, { at: number; value: LexiconResult }>();
const TTL = 12 * 3600_000;

async function timed<T>(fn: () => Promise<T>) {
  const t0 = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - t0 };
}

export async function lookupLexicon(rawWord: string): Promise<LexiconResult> {
  const word = rawWord.trim().replace(/\s+/g, " ");
  const key = word.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;

  const [wd, wt, dm, tb, mm, fd] = await Promise.all([
    timed(() => wiktionaryDefinitions(word)),
    timed(() => wiktionaryWikitext(word)),
    timed(() => datamuse(word)),
    timed(() => tatoeba(word)),
    timed(() => myMemory(word)),
    timed(() => freeDictionary(word)),
  ]);
  let gt = { value: [] as LexiconEvidence["bangla"], ms: 0 };
  if (mm.value.length < 2) gt = await timed(() => googleTranslate(word));

  const definitions = [...wd.value.defs, ...(fd.value?.defs ?? []), ...dm.value.defs];
  const seenDef = new Set<string>();
  const defs = definitions.filter((d) => {
    const k = d.text.toLowerCase().replace(/[^a-z ]/g, "").slice(0, 60);
    if (!d.text || seenDef.has(k)) return false;
    seenDef.add(k);
    return true;
  });

  const examples = [...tb.value, ...wd.value.examples, ...(fd.value?.examples ?? [])].filter((e) => usesWord(e.text, word));
  const seenEx = new Set<string>();
  const exs = examples.filter((e) => {
    const k = e.text.toLowerCase();
    if (seenEx.has(k)) return false;
    seenEx.add(k);
    return true;
  });

  const banglaMap = new Map<string, { text: string; score: number; source: string }>();
  for (const b of [...mm.value, ...gt.value]) {
    const text = b.text.replace(/[।.,]/g, "").trim().normalize("NFC");
    const k = text.normalize("NFD").replace(/\s+/g, "");
    const prev = banglaMap.get(k);
    if (prev) prev.score += b.score * 0.6;
    else banglaMap.set(k, { ...b, text });
  }
  const bangla = [...banglaMap.values()].sort((a, b) => b.score - a.score).slice(0, 6);

  const pronunciation = wt.value.ipa || fd.value?.ipa || (dm.value.ipa ? `/${dm.value.ipa}/` : "");
  const partsOfSpeech = uniq([...wd.value.pos, ...dm.value.pos, ...defs.map((d) => d.pos).filter(Boolean)], 4);

  const evidence: LexiconEvidence = {
    word,
    pronunciation,
    partsOfSpeech,
    definitions: defs.slice(0, 10),
    examples: exs.slice(0, 8),
    synonyms: uniq([...wt.value.synonyms, ...dm.value.synonyms, ...(fd.value?.synonyms ?? [])], 14),
    antonyms: uniq([...wt.value.antonyms, ...dm.value.antonyms, ...(fd.value?.antonyms ?? [])], 10),
    bangla,
    etymology: wt.value.etymology,
    affixes: wt.value.affixes,
    frequency: dm.value.frequency,
    morphology: analyzeMorphology(word),
  };

  const sources: SourceStatus[] = [
    { id: "wiktionary", name: "Wiktionary", ok: wd.value.defs.length > 0 || !!wt.value.etymology, count: wd.value.defs.length, ms: Math.max(wd.ms, wt.ms) },
    { id: "datamuse", name: "Datamuse", ok: dm.value.ok, count: dm.value.synonyms.length + dm.value.antonyms.length, ms: dm.ms },
    { id: "tatoeba", name: "Tatoeba", ok: tb.value.length > 0, count: tb.value.length, ms: tb.ms },
    { id: "mymemory", name: "MyMemory NMT", ok: mm.value.length > 0, count: mm.value.length, ms: mm.ms },
    { id: "freedict", name: "Free Dictionary", ok: !!fd.value, count: fd.value?.defs.length ?? 0, ms: fd.ms },
  ];
  if (gt.ms) sources.push({ id: "gtranslate", name: "Google Translate", ok: gt.value.length > 0, count: gt.value.length, ms: gt.ms });

  const result: LexiconResult = { evidence, sources, found: defs.length > 0 || bangla.length > 0 || evidence.synonyms.length > 0 };
  if (result.found) {
    if (cache.size > 400) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), value: result });
  }
  return result;
}
