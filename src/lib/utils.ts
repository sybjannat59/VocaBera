import { prefs } from "./prefs";
import { speakText } from "./tts";
import type { Word } from "./types";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function uniqueCI(items: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const v = raw.trim();
    const k = v.toLowerCase();
    if (!v || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

export const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export const plural = (n: number, word: string, pluralWord = `${word}s`) => `${n} ${n === 1 ? word : pluralWord}`;

export const hasBangla = (s: string) => /[\u0980-\u09FF]/.test(s);

export function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Finds the word (or an inflected form) inside a sentence. */
export function findWordInSentence(sentence: string, word: string) {
  const w = word.trim();
  if (!w || !sentence) return null;
  let m = new RegExp(`\\b(${escapeRegExp(w)}(?:s|es|ed|d|ing|ly|ness|ment)?)\\b`, "i").exec(sentence);
  if (!m && w.length >= 5) {
    const stem = /[ey]$/i.test(w) ? w.slice(0, -1) : w;
    m = new RegExp(`\\b(${escapeRegExp(stem)}[a-z]{0,5})\\b`, "i").exec(sentence);
  }
  if (!m) return null;
  return { index: m.index, length: m[1].length, match: m[1] };
}

/* ------------------------- Speech, sound & haptics ------------------------ */

export { prefs };

/** Speaks text with the best engine available (real recording → AI voice → device voice). */
export function speak(text: string, rate?: number) {
  return speakText(text, { rate });
}

let audioCtx: AudioContext | null = null;

export function playTone(kind: "correct" | "wrong" | "complete" | "tap") {
  if (!prefs.sound || typeof window === "undefined") return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx ??= new Ctor();
    const ctx = audioCtx;
    const notes =
      kind === "correct" ? [660, 990] : kind === "wrong" ? [240, 190] : kind === "complete" ? [523, 659, 784, 1046] : [540];
    const t0 = ctx.currentTime;
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = kind === "wrong" ? "triangle" : "sine";
      o.frequency.value = f;
      const start = t0 + i * (kind === "complete" ? 0.11 : 0.08);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(kind === "tap" ? 0.05 : 0.11, start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(start);
      o.stop(start + 0.22);
    });
  } catch {
    /* audio not available */
  }
}

export function haptic(pattern: number | number[] = 12) {
  if (!prefs.haptics || typeof navigator === "undefined") return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

/* ---------------------------------- CSV ---------------------------------- */

export const CSV_FIELDS = [
  "word",
  "pronunciation",
  "partOfSpeech",
  "banglaMeaning",
  "englishMeaning",
  "synonyms",
  "antonyms",
  "example",
  "prefix",
  "rootWord",
  "suffix",
  "mnemonic",
  "etymology",
  "notes",
  "tags",
  "difficulty",
  "isFavorite",
] as const;

export function wordsToCsv(words: Word[]) {
  const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [CSV_FIELDS.join(",")];
  for (const w of words) {
    lines.push(
      CSV_FIELDS.map((f) => {
        const v = w[f];
        return esc(Array.isArray(v) ? v.join("; ") : String(v ?? ""));
      }).join(","),
    );
  }
  return "\uFEFF" + lines.join("\r\n");
}

const HEADER_ALIASES: Record<string, string> = {
  bangla: "banglaMeaning",
  bengali: "banglaMeaning",
  banglameaning: "banglaMeaning",
  meaning: "banglaMeaning",
  definition: "englishMeaning",
  englishdefinition: "englishMeaning",
  englishmeaning: "englishMeaning",
  synonym: "synonyms",
  antonym: "antonyms",
  examplesentence: "example",
  sentence: "example",
  root: "rootWord",
  rootword: "rootWord",
  pos: "partOfSpeech",
  partofspeech: "partOfSpeech",
  favorite: "isFavorite",
  isfavorite: "isFavorite",
  tag: "tags",
  origin: "etymology",
};

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...data] = rows.filter((r) => r.some((c) => c.trim()));
  if (!header) return [];
  const keys = header.map((h) => {
    const k = h.trim().toLowerCase().replace(/[^a-z]/g, "");
    return HEADER_ALIASES[k] ?? CSV_FIELDS.find((f) => f.toLowerCase() === k) ?? h.trim();
  });
  return data.map((r) => Object.fromEntries(keys.map((k, idx) => [k, (r[idx] ?? "").trim()])));
}

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ------------------------------ Dictionary ------------------------------- */

interface DictEntry {
  phonetic?: string;
  phonetics?: { text?: string }[];
  origin?: string;
  meanings?: {
    partOfSpeech: string;
    synonyms?: string[];
    antonyms?: string[];
    definitions: { definition: string; example?: string; synonyms?: string[]; antonyms?: string[] }[];
  }[];
}

export interface DictResult {
  pronunciation?: string;
  partOfSpeech?: string;
  englishMeaning?: string;
  example?: string;
  etymology?: string;
  synonyms: string[];
  antonyms: string[];
}

export async function lookupDictionary(word: string): Promise<DictResult | null> {
  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.trim().toLowerCase())}`);
  if (!res.ok) return null;
  const data = (await res.json()) as DictEntry[];
  if (!Array.isArray(data) || !data.length) return null;
  const meanings = data.flatMap((e) => e.meanings ?? []);
  const defs = meanings.flatMap((m) => m.definitions ?? []);
  return {
    pronunciation: data.find((e) => e.phonetic)?.phonetic ?? data.flatMap((e) => e.phonetics ?? []).find((p) => p.text)?.text,
    partOfSpeech: meanings[0]?.partOfSpeech,
    englishMeaning: defs[0]?.definition,
    example: defs.find((d) => d.example)?.example,
    etymology: data.find((e) => e.origin)?.origin,
    synonyms: uniqueCI([...meanings.flatMap((m) => m.synonyms ?? []), ...defs.flatMap((d) => d.synonyms ?? [])]).slice(0, 6),
    antonyms: uniqueCI([...meanings.flatMap((m) => m.antonyms ?? []), ...defs.flatMap((d) => d.antonyms ?? [])]).slice(0, 5),
  };
}

export async function suggestBangla(word: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word.trim())}&langpair=en%7Cbn`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      responseData?: { translatedText?: string };
      matches?: { translation?: string }[];
    };
    const main = data.responseData?.translatedText;
    if (main && hasBangla(main)) return main.trim();
    return data.matches?.map((m) => m.translation ?? "").find((t) => hasBangla(t))?.trim() ?? null;
  } catch {
    return null;
  }
}
