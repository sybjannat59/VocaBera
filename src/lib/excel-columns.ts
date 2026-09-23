import { capitalizeFirst, sentenceCase } from "./text-format";
import { PARTS_OF_SPEECH, type Difficulty, type WordInput } from "./types";
import { uniqueCI } from "./utils";

export type ExcelField =
  | "word"
  | "banglaMeaning"
  | "englishMeaning"
  | "partOfSpeech"
  | "synonyms"
  | "antonyms"
  | "example"
  | "prefix"
  | "rootWord"
  | "suffix"
  | "mnemonic"
  | "pronunciation"
  | "notes"
  | "difficulty"
  | "tags";

export interface ExcelColumn {
  header: string;
  field: ExcelField;
  required?: "always" | "one-meaning";
  list?: boolean;
  hint: string;
  example: string;
  width: number;
  aliases: string[];
}

/** Exact column names users should put in row 1 of the sheet (order is flexible). */
export const EXCEL_COLUMNS: ExcelColumn[] = [
  { header: "Word", field: "word", required: "always", hint: "The English word or phrase", example: "Benevolent", width: 18, aliases: ["term", "vocabulary", "english word"] },
  { header: "Bangla Meaning", field: "banglaMeaning", required: "one-meaning", hint: "বাংলা অর্থ", example: "দয়ালু; পরোপকারী", width: 24, aliases: ["bangla", "bengali", "bengali meaning", "meaning bangla", "bangla meaning"] },
  { header: "English Meaning", field: "englishMeaning", required: "one-meaning", hint: "Definition in English", example: "Well meaning and kindly.", width: 40, aliases: ["definition", "english definition", "meaning", "english"] },
  { header: "Part of Speech", field: "partOfSpeech", hint: "noun, verb, adjective, adverb…", example: "adjective", width: 14, aliases: ["pos", "part-of-speech", "type", "word type"] },
  { header: "Synonyms", field: "synonyms", list: true, hint: "Separate with commas", example: "Kind, Generous, Charitable", width: 30, aliases: ["synonym", "similar words"] },
  { header: "Antonyms", field: "antonyms", list: true, hint: "Separate with commas", example: "Malevolent, Cruel", width: 24, aliases: ["antonym", "opposites", "opposite"] },
  { header: "Example Sentence", field: "example", hint: "A sentence using the word", example: "A benevolent donor paid for the school.", width: 42, aliases: ["example", "sentence", "examples", "usage"] },
  { header: "Prefix", field: "prefix", hint: "e.g. bene- (well)", example: "bene- (well)", width: 16, aliases: [] },
  { header: "Root", field: "rootWord", hint: "e.g. vol (wish)", example: "vol (wish)", width: 16, aliases: ["root word", "rootword", "base"] },
  { header: "Suffix", field: "suffix", hint: "e.g. -ent", example: "-ent", width: 14, aliases: [] },
  { header: "Mnemonic", field: "mnemonic", hint: "Memory trick", example: "BENE = good, VOL = wish → wishing good.", width: 40, aliases: ["memory trick", "mnemonics", "trick"] },
  { header: "Pronunciation", field: "pronunciation", hint: "IPA or phonetic", example: "/bəˈnev.əl.ənt/", width: 18, aliases: ["ipa", "phonetic", "pronounce"] },
  { header: "Notes", field: "notes", hint: "Any extra info", example: "Common in GRE reading passages.", width: 30, aliases: ["note", "comments", "remarks"] },
  { header: "Difficulty", field: "difficulty", hint: "easy, medium or hard", example: "medium", width: 12, aliases: ["level", "difficulty level"] },
  { header: "Tags", field: "tags", list: true, hint: "Separate with commas", example: "GRE, IELTS", width: 18, aliases: ["tag", "category", "categories", "labels"] },
];

const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

const HEADER_LOOKUP = new Map<string, ExcelField>();
for (const c of EXCEL_COLUMNS) {
  HEADER_LOOKUP.set(key(c.header), c.field);
  for (const a of c.aliases) HEADER_LOOKUP.set(key(a), c.field);
}

export interface HeaderMatch {
  index: number;
  raw: string;
  field: ExcelField | null;
}

export function matchHeaders(headerRow: unknown[]): HeaderMatch[] {
  const used = new Set<ExcelField>();
  return headerRow.map((cell, index) => {
    const raw = cellText(cell);
    const field = HEADER_LOOKUP.get(key(raw)) ?? null;
    if (!field || used.has(field)) return { index, raw, field: null };
    used.add(field);
    return { index, raw, field };
  });
}

export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/\u00a0/g, " ").trim();
}

const splitList = (v: string) => uniqueCI(v.split(/[,;|\n]/).map((s) => s.trim()).filter(Boolean));

const POS_ALIASES: Record<string, string> = {
  n: "noun",
  v: "verb",
  adj: "adjective",
  adv: "adverb",
  prep: "preposition",
  conj: "conjunction",
  pron: "pronoun",
  interj: "interjection",
};

export function normalizePos(v: string) {
  const k = v.toLowerCase().replace(/[^a-z]/g, "");
  const full = POS_ALIASES[k] ?? k;
  return (PARTS_OF_SPEECH as readonly string[]).includes(full) ? full : "";
}

export function normalizeDifficulty(v: string): Difficulty {
  const k = v.toLowerCase().trim();
  if (["easy", "e", "1", "beginner", "basic", "low"].includes(k)) return "easy";
  if (["hard", "h", "3", "difficult", "advanced", "high"].includes(k)) return "hard";
  return "medium";
}

export type RowStatus = "ready" | "duplicate" | "invalid";

export interface ParsedRow {
  line: number;
  data: WordInput;
  status: RowStatus;
  issue?: string;
}

export interface ParsedSheet {
  headers: HeaderMatch[];
  missingRequired: string[];
  unknownHeaders: string[];
  rows: ParsedRow[];
}

/** Turns raw sheet rows (row 1 = headers) into validated word inputs. */
export function parseSheetRows(rows: unknown[][], existingWords: Iterable<string>): ParsedSheet {
  const firstNonEmpty = rows.findIndex((r) => r.some((c) => cellText(c)));
  if (firstNonEmpty < 0) return { headers: [], missingRequired: ["Word"], unknownHeaders: [], rows: [] };
  const headers = matchHeaders(rows[firstNonEmpty]);
  const fields = new Set(headers.map((h) => h.field).filter(Boolean));
  const missingRequired: string[] = [];
  if (!fields.has("word")) missingRequired.push("Word");
  if (!fields.has("banglaMeaning") && !fields.has("englishMeaning")) missingRequired.push("Bangla Meaning or English Meaning");
  const unknownHeaders = headers.filter((h) => !h.field && h.raw).map((h) => h.raw);

  const have = new Set([...existingWords].map((w) => w.toLowerCase()));
  const seen = new Set<string>();
  const out: ParsedRow[] = [];

  rows.slice(firstNonEmpty + 1).forEach((row, i) => {
    if (!row.some((c) => cellText(c))) return;
    const rec: Partial<Record<ExcelField, string>> = {};
    for (const h of headers) if (h.field) rec[h.field] = cellText(row[h.index]);
    const word = capitalizeFirst((rec.word ?? "").slice(0, 120));
    const data: WordInput = {
      word,
      pronunciation: rec.pronunciation ?? "",
      partOfSpeech: normalizePos(rec.partOfSpeech ?? ""),
      banglaMeaning: rec.banglaMeaning ?? "",
      englishMeaning: sentenceCase(rec.englishMeaning ?? ""),
      synonyms: splitList(rec.synonyms ?? "").map(capitalizeFirst),
      antonyms: splitList(rec.antonyms ?? "").map(capitalizeFirst),
      example: sentenceCase(rec.example ?? ""),
      prefix: rec.prefix ?? "",
      rootWord: rec.rootWord ?? "",
      suffix: rec.suffix ?? "",
      mnemonic: rec.mnemonic ?? "",
      etymology: "",
      notes: rec.notes ?? "",
      tags: splitList(rec.tags ?? "").slice(0, 12),
      difficulty: normalizeDifficulty(rec.difficulty ?? ""),
      isFavorite: false,
    };
    const line = firstNonEmpty + i + 2;
    const k = word.toLowerCase();
    let status: RowStatus = "ready";
    let issue: string | undefined;
    if (!word) {
      status = "invalid";
      issue = "Missing Word";
    } else if (!data.banglaMeaning && !data.englishMeaning) {
      status = "invalid";
      issue = "Needs a Bangla or English meaning";
    } else if (have.has(k)) {
      status = "duplicate";
      issue = "Already in your list";
    } else if (seen.has(k)) {
      status = "duplicate";
      issue = "Repeated in this file";
    }
    if (word) seen.add(k);
    out.push({ line, data, status, issue });
  });

  return { headers, missingRequired, unknownHeaders, rows: out };
}
