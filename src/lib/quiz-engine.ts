import { studyWeight, weightedSample } from "./learning";
import type { Word } from "./types";
import { clamp, escapeRegExp, findWordInSentence, levenshtein, norm, shuffle, uniqueCI } from "./utils";

export type QuestionType =
  | "word-bangla"
  | "bangla-word"
  | "word-definition"
  | "definition-word"
  | "synonym"
  | "antonym"
  | "fill-blank"
  | "word-parts"
  | "spelling"
  | "listening"
  | "true-false";

export const QUESTION_TYPES: { id: QuestionType; label: string; desc: string; tier: 1 | 2 | 3 }[] = [
  { id: "word-bangla", label: "Bangla meaning", desc: "Word → বাংলা", tier: 1 },
  { id: "bangla-word", label: "Reverse Bangla", desc: "বাংলা → Word", tier: 2 },
  { id: "word-definition", label: "Definition", desc: "Word → meaning", tier: 2 },
  { id: "definition-word", label: "Reverse definition", desc: "Meaning → word", tier: 3 },
  { id: "synonym", label: "Synonyms", desc: "Closest meaning", tier: 2 },
  { id: "antonym", label: "Antonyms", desc: "Opposite meaning", tier: 3 },
  { id: "fill-blank", label: "Fill in the blank", desc: "Use in context", tier: 3 },
  { id: "word-parts", label: "Prefix · Root · Suffix", desc: "Word building", tier: 3 },
  { id: "spelling", label: "Spelling", desc: "Type the word", tier: 3 },
  { id: "listening", label: "Listening", desc: "Hear → type", tier: 3 },
  { id: "true-false", label: "True / False", desc: "Quick check", tier: 1 },
];

const TIER = Object.fromEntries(QUESTION_TYPES.map((t) => [t.id, t.tier])) as Record<QuestionType, number>;

export interface Question {
  key: string;
  type: QuestionType;
  word: Word;
  label: string;
  prompt: string;
  focus: string;
  focusBangla?: boolean;
  focusLong?: boolean;
  secondary?: string;
  secondaryBangla?: boolean;
  sentence?: { before: string; after: string };
  options: string[];
  optionsBangla?: boolean;
  longOptions?: boolean;
  answer: string;
  input?: boolean;
  audio?: boolean;
  hint?: string;
  note?: string;
}

type PartKey = "prefix" | "rootWord" | "suffix";
const PART_KEYS: PartKey[] = ["prefix", "rootWord", "suffix"];
const PART_LABEL: Record<PartKey, string> = { prefix: "prefix", rootWord: "root", suffix: "suffix" };

export const partsOf = (w: Word) => PART_KEYS.filter((k) => w[k].trim());
export const formatParts = (w: Word) => partsOf(w).map((k) => w[k].trim()).join("  +  ");
const core = (v: string) => v.split("(")[0].trim().toLowerCase().replace(/^-+|-+$/g, "");

const others = (w: Word, pool: Word[]) => pool.filter((o) => o.id !== w.id && norm(o.word) !== norm(w.word));

/** Rank candidates so distractors look plausible (same part of speech, similar shape). */
function rankSimilar(w: Word, cands: Word[]) {
  return cands
    .map((o) => {
      let s = Math.random() * 1.6;
      if (w.partOfSpeech && o.partOfSpeech === w.partOfSpeech) s += 2;
      if (Math.abs(o.word.length - w.word.length) <= 2) s += 0.8;
      if (o.word[0]?.toLowerCase() === w.word[0]?.toLowerCase()) s += 0.6;
      if (o.difficulty === w.difficulty) s += 0.3;
      return { o, s };
    })
    .sort((a, b) => b.s - a.s)
    .map((x) => x.o);
}

function wordOptions(w: Word, pool: Word[], n = 3, exclude?: (o: Word) => boolean) {
  const cands = others(w, pool).filter((o) => !exclude?.(o));
  return uniqueCI(rankSimilar(w, cands).map((o) => o.word))
    .filter((x) => norm(x) !== norm(w.word))
    .slice(0, n);
}

function meaningOptions(w: Word, pool: Word[], field: "banglaMeaning" | "englishMeaning", n = 3) {
  const target = norm(w[field]);
  const cands = others(w, pool).filter((o) => o[field] && norm(o[field]) !== target);
  return uniqueCI(rankSimilar(w, cands).map((o) => o[field])).slice(0, n);
}

function relationDistractors(w: Word, pool: Word[], rel: "synonyms" | "antonyms") {
  const opposite = rel === "synonyms" ? "antonyms" : "synonyms";
  const block = new Set([norm(w.word), ...w[rel].map(norm)]);
  const related = (o: Word) => o[rel].some((s) => norm(s) === norm(w.word)) || block.has(norm(o.word));
  // Realistic trap: an option from the opposite relation (e.g. an antonym in a synonym question).
  const traps = shuffle(w[opposite]).filter((a) => !block.has(norm(a))).slice(0, 1);
  const rest = rankSimilar(w, others(w, pool).filter((o) => !related(o)))
    .flatMap((o) => shuffle([o.word, ...o[rel]]).slice(0, 2))
    .filter((x) => !block.has(norm(x)));
  return uniqueCI([...traps, ...rest]);
}

function partOptions(w: Word, pool: Word[], key: PartKey) {
  const target = core(w[key]);
  const seen = new Set([target]);
  const out: string[] = [];
  for (const o of shuffle(others(w, pool))) {
    const v = o[key].trim();
    if (!v || seen.has(core(v))) continue;
    seen.add(core(v));
    out.push(v);
    if (out.length >= 3) break;
  }
  return out;
}

export function maskWord(text: string, word: string) {
  if (!text || !word.trim()) return text;
  const w = word.trim();
  const stem = w.length >= 5 && /[ey]$/i.test(w) ? w.slice(0, -1) : w;
  return text.replace(new RegExp(`\\b${escapeRegExp(stem)}[a-z]*\\b`, "gi"), "_____");
}

export interface PoolStats {
  total: number;
  withBangla: number;
  withDef: number;
}

export function poolStats(pool: Word[]): PoolStats {
  let withBangla = 0;
  let withDef = 0;
  for (const w of pool) {
    if (w.banglaMeaning) withBangla++;
    if (w.englishMeaning) withDef++;
  }
  return { total: pool.length, withBangla, withDef };
}

/** Cheap eligibility check (used for setup counts and type picking). */
export function eligible(type: QuestionType, w: Word, s: PoolStats): boolean {
  switch (type) {
    case "word-bangla":
      return !!w.banglaMeaning && s.withBangla >= 3;
    case "bangla-word":
      return !!w.banglaMeaning && s.total >= 3;
    case "word-definition":
      return !!w.englishMeaning && s.withDef >= 3;
    case "definition-word":
      return !!w.englishMeaning && s.total >= 3;
    case "synonym":
      return w.synonyms.length > 0 && s.total >= 3;
    case "antonym":
      return w.antonyms.length > 0 && s.total >= 3;
    case "fill-blank":
      return !!w.example && s.total >= 3 && !!findWordInSentence(w.example, w.word);
    case "word-parts":
      return partsOf(w).length > 0 && s.total >= 3;
    case "spelling":
      return w.word.trim().length >= 3 && !!(w.banglaMeaning || w.englishMeaning);
    case "listening":
      return w.word.trim().length >= 3 && typeof window !== "undefined" && "speechSynthesis" in window;
    case "true-false":
      return !!(w.banglaMeaning || w.englishMeaning) && s.total >= 2;
  }
}

export function makeQuestion(type: QuestionType, w: Word, pool: Word[]): Question | null {
  const base = { key: `${w.id}-${type}-${Math.random().toString(36).slice(2, 8)}`, type, word: w };
  switch (type) {
    case "word-bangla": {
      const d = meaningOptions(w, pool, "banglaMeaning");
      if (!w.banglaMeaning || d.length < 2) return null;
      return {
        ...base,
        label: "Bangla meaning",
        prompt: "Choose the correct Bangla meaning of",
        focus: w.word,
        options: shuffle([w.banglaMeaning, ...d]),
        optionsBangla: true,
        answer: w.banglaMeaning,
      };
    }
    case "bangla-word": {
      const d = wordOptions(w, pool, 3, (o) => norm(o.banglaMeaning) === norm(w.banglaMeaning));
      if (!w.banglaMeaning || d.length < 2) return null;
      return {
        ...base,
        label: "Reverse Bangla",
        prompt: "Which English word means",
        focus: w.banglaMeaning,
        focusBangla: true,
        options: shuffle([w.word, ...d]),
        answer: w.word,
      };
    }
    case "word-definition": {
      const d = meaningOptions(w, pool, "englishMeaning");
      if (!w.englishMeaning || d.length < 2) return null;
      return {
        ...base,
        label: "Definition",
        prompt: "What is the best definition of",
        focus: w.word,
        options: shuffle([w.englishMeaning, ...d]),
        longOptions: true,
        answer: w.englishMeaning,
      };
    }
    case "definition-word": {
      const d = wordOptions(w, pool, 3, (o) => norm(o.englishMeaning) === norm(w.englishMeaning));
      if (!w.englishMeaning || d.length < 2) return null;
      return {
        ...base,
        label: "Reverse definition",
        prompt: "Which word matches this definition?",
        focus: maskWord(w.englishMeaning, w.word),
        focusLong: true,
        options: shuffle([w.word, ...d]),
        answer: w.word,
      };
    }
    case "synonym":
    case "antonym": {
      const rel = type === "synonym" ? "synonyms" : "antonyms";
      const list = w[rel];
      if (!list.length) return null;
      const d = relationDistractors(w, pool, rel);
      const noun = type === "synonym" ? "synonym" : "antonym";
      const note = `${type === "synonym" ? "Synonyms" : "Antonyms"} of ${w.word}: ${list.join(", ")}`;
      if (list.length >= 3 && d.length >= 1 && Math.random() < 0.35) {
        const odd = d[0];
        return {
          ...base,
          label: "Odd one out",
          prompt: `Which word is NOT ${type === "synonym" ? "a synonym" : "an antonym"} of`,
          focus: w.word,
          options: shuffle([odd, ...shuffle(list).slice(0, 3)]),
          answer: odd,
          note,
        };
      }
      if (d.length < 2) return null;
      const correct = shuffle(list)[0];
      return {
        ...base,
        label: type === "synonym" ? "Synonym" : "Antonym",
        prompt: type === "synonym" ? "Which word is closest in meaning to" : "Which word is most nearly OPPOSITE to",
        focus: w.word,
        options: shuffle([correct, ...d.slice(0, 3)]),
        answer: correct,
        note: note || `Pick the ${noun}.`,
      };
    }
    case "fill-blank": {
      const m = findWordInSentence(w.example, w.word);
      const d = wordOptions(w, pool, 3);
      if (!m || d.length < 2) return null;
      return {
        ...base,
        label: "Fill in the blank",
        prompt: "Choose the word that best completes the sentence",
        focus: "",
        sentence: { before: w.example.slice(0, m.index), after: w.example.slice(m.index + m.length) },
        options: shuffle([w.word, ...d]),
        answer: w.word,
        note: m.match.toLowerCase() !== w.word.toLowerCase() ? `Used in the sentence as “${m.match}”.` : undefined,
      };
    }
    case "word-parts": {
      const parts = partsOf(w);
      if (!parts.length) return null;
      const identifiable = parts
        .map((k) => ({ k, opts: partOptions(w, pool, k) }))
        .filter((x) => x.opts.length >= 2);
      if (identifiable.length && Math.random() < 0.5) {
        const pick = identifiable[Math.floor(Math.random() * identifiable.length)];
        return {
          ...base,
          label: "Word parts",
          prompt: `What is the ${PART_LABEL[pick.k]} of`,
          focus: w.word,
          options: shuffle([w[pick.k].trim(), ...pick.opts]),
          answer: w[pick.k].trim(),
          note: `${w.word} = ${formatParts(w)}`,
        };
      }
      const d = wordOptions(w, pool, 3);
      if (d.length < 2) return null;
      return {
        ...base,
        label: "Word building",
        prompt: "Which word is built from these parts?",
        focus: formatParts(w),
        focusLong: true,
        options: shuffle([w.word, ...d]),
        answer: w.word,
      };
    }
    case "spelling": {
      if (!w.banglaMeaning && !w.englishMeaning) return null;
      const bn = !!w.banglaMeaning;
      return {
        ...base,
        label: "Spelling",
        prompt: "Type the English word that means",
        focus: bn ? w.banglaMeaning : maskWord(w.englishMeaning, w.word),
        focusBangla: bn,
        focusLong: !bn,
        secondary: bn && w.englishMeaning ? maskWord(w.englishMeaning, w.word) : undefined,
        options: [],
        input: true,
        answer: w.word.trim(),
        hint: `Starts with “${w.word.trim()[0].toUpperCase()}” · ${w.word.trim().length} letters`,
      };
    }
    case "listening": {
      return {
        ...base,
        label: "Listening",
        prompt: "Listen and type the word you hear",
        focus: "",
        audio: true,
        options: [],
        input: true,
        answer: w.word.trim(),
        hint: w.banglaMeaning ? `Meaning: ${w.banglaMeaning}` : `Meaning: ${maskWord(w.englishMeaning, w.word)}`,
      };
    }
    case "true-false": {
      const useBn = !!w.banglaMeaning && (!w.englishMeaning || Math.random() < 0.55);
      const field = useBn ? "banglaMeaning" : "englishMeaning";
      if (!w[field]) return null;
      let statement = w[field];
      if (Math.random() < 0.5) {
        const d = meaningOptions(w, pool, field, 1);
        if (d.length) statement = d[0];
      }
      const isTrue = statement === w[field];
      return {
        ...base,
        label: "True or False",
        prompt: "Is this the correct meaning of",
        focus: w.word,
        secondary: statement,
        secondaryBangla: useBn,
        options: ["True", "False"],
        answer: isTrue ? "True" : "False",
      };
    }
  }
}

/** Adaptive type ordering: harder types after streaks & for well-known words, easier after mistakes. */
export function rankTypes(
  w: Word,
  stats: PoolStats,
  enabled: QuestionType[],
  ctx: { streak: number; lastType?: QuestionType; adaptive: boolean },
) {
  const list = enabled.filter((t) => eligible(t, w, stats));
  const bias = ctx.streak >= 3 ? 0.9 : ctx.streak >= 1 ? 0.4 : ctx.streak <= -2 ? -0.9 : ctx.streak < 0 ? -0.4 : 0;
  const target = clamp(1.2 + w.mastery / 2.5 + bias, 1, 3);
  return list
    .map((t) => {
      const closeness = ctx.adaptive ? 1 / (1 + Math.abs(TIER[t] - target) * 1.6) : 1;
      const repeat = t === ctx.lastType ? 0.25 : 1;
      return { t, key: Math.pow(Math.random(), 1 / (closeness * repeat)) };
    })
    .sort((a, b) => b.key - a.key)
    .map((x) => x.t);
}

export function buildQuestion(
  w: Word,
  pool: Word[],
  stats: PoolStats,
  enabled: QuestionType[],
  ctx: { streak: number; lastType?: QuestionType; adaptive: boolean },
): Question {
  for (const t of rankTypes(w, stats, enabled, ctx)) {
    const q = makeQuestion(t, w, pool);
    if (q) return q;
  }
  return (makeQuestion("true-false", w, pool) ?? makeQuestion("spelling", w, pool)) as Question;
}

/** Picks the words for a quiz, weighted toward weak, due and new words. */
export function planQuiz(source: Word[], count: number): number[] {
  const usable = source.filter((w) => w.banglaMeaning || w.englishMeaning);
  if (!usable.length) return [];
  if (usable.length === 1) return Array(count).fill(usable[0].id);
  const ids: number[] = [];
  let guard = 0;
  while (ids.length < count && guard++ < 1000) {
    const batch = weightedSample(usable, (w) => studyWeight(w), Math.min(usable.length, count - ids.length));
    for (const w of batch) {
      if (ids.length && ids[ids.length - 1] === w.id) continue;
      ids.push(w.id);
    }
  }
  return ids.slice(0, count);
}

export function grade(q: Question, response: string): { correct: boolean; typo: boolean } {
  if (q.input) {
    const a = norm(response);
    const b = norm(q.answer);
    if (!a) return { correct: false, typo: false };
    if (a === b) return { correct: true, typo: false };
    const tol = b.length >= 9 ? 2 : b.length >= 5 ? 1 : 0;
    return levenshtein(a, b) <= tol ? { correct: true, typo: true } : { correct: false, typo: false };
  }
  return { correct: response === q.answer, typo: false };
}
