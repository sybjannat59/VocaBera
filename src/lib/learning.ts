import type { DailyActivity, SourceKey, Word, WordStatus } from "./types";

const DAY_MS = 86_400_000;

/** Spaced-repetition intervals (days) indexed by mastery level after a correct answer. */
export const INTERVAL_DAYS = [0, 1, 3, 7, 16, 35];

type ReviewBase = Pick<Word, "mastery" | "timesReviewed" | "timesCorrect" | "timesWrong">;

export function computeReview(w: ReviewBase, correct: boolean, now = new Date()) {
  const mastery = correct ? Math.min(5, w.mastery + 1) : Math.max(0, w.mastery - 2);
  const nextReviewAt = correct
    ? new Date(now.getTime() + INTERVAL_DAYS[mastery] * DAY_MS)
    : new Date(now.getTime() + 10 * 60_000);
  return {
    mastery,
    timesReviewed: w.timesReviewed + 1,
    timesCorrect: w.timesCorrect + (correct ? 1 : 0),
    timesWrong: w.timesWrong + (correct ? 0 : 1),
    lastReviewedAt: now,
    nextReviewAt,
  };
}

export function wordStatus(w: Pick<Word, "timesReviewed" | "mastery">): WordStatus {
  if (w.timesReviewed === 0) return "new";
  if (w.mastery >= 5) return "mastered";
  if (w.mastery >= 3) return "reviewing";
  return "learning";
}

export const STATUS_META: Record<WordStatus, { label: string; dot: string; text: string; bg: string }> = {
  new: { label: "New", dot: "bg-sky-500", text: "text-sky-600 dark:text-sky-300", bg: "bg-sky-500/10" },
  learning: {
    label: "Learning",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-300",
    bg: "bg-amber-500/10",
  },
  reviewing: {
    label: "Reviewing",
    dot: "bg-violet-500",
    text: "text-violet-600 dark:text-violet-300",
    bg: "bg-violet-500/10",
  },
  mastered: {
    label: "Mastered",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-300",
    bg: "bg-emerald-500/10",
  },
};

export function isDue(w: Pick<Word, "timesReviewed" | "nextReviewAt">, now = Date.now()) {
  return w.timesReviewed > 0 && !!w.nextReviewAt && new Date(w.nextReviewAt).getTime() <= now;
}

export function isWeak(w: Pick<Word, "timesWrong" | "timesCorrect" | "mastery">) {
  return w.timesWrong > 0 && (w.mastery <= 2 || w.timesWrong >= w.timesCorrect);
}

export function accuracyOf(w: Pick<Word, "timesReviewed" | "timesCorrect">) {
  return w.timesReviewed ? Math.round((w.timesCorrect / w.timesReviewed) * 100) : null;
}

export function filterBySource(words: Word[], source: SourceKey, now = Date.now()): Word[] {
  if (source === "all") return words;
  if (source === "due") return words.filter((w) => isDue(w, now));
  if (source === "weak") return words.filter(isWeak);
  if (source === "new") return words.filter((w) => w.timesReviewed === 0);
  if (source === "learning") return words.filter((w) => wordStatus(w) === "learning");
  if (source === "mastered") return words.filter((w) => wordStatus(w) === "mastered");
  if (source === "favorites") return words.filter((w) => w.isFavorite);
  if (source.startsWith("tag:")) {
    const tag = source.slice(4).toLowerCase();
    return words.filter((w) => w.tags.some((t) => t.toLowerCase() === tag));
  }
  return words;
}

export function sourceLabel(source: SourceKey) {
  if (source.startsWith("tag:")) return `#${source.slice(4)}`;
  return (
    { all: "All words", due: "Due for review", weak: "Weak words", new: "New words", learning: "Learning", mastered: "Mastered", favorites: "Favorites" } as Record<
      string,
      string
    >
  )[source] ?? "All words";
}

/** Higher weight = more likely to be studied. */
export function studyWeight(w: Word, now = Date.now()) {
  let wt = 1 + (5 - w.mastery) * 0.7 + Math.min(w.timesWrong, 5) * 0.5;
  if (isDue(w, now)) wt += 2.5;
  if (w.timesReviewed === 0) wt += 1.2;
  if (w.difficulty === "hard") wt += 0.4;
  if (w.isFavorite) wt += 0.3;
  return wt;
}

/** Weighted sampling without replacement (Efraimidis–Spirakis). */
export function weightedSample<T>(items: T[], weight: (item: T) => number, count: number): T[] {
  return items
    .map((item) => ({ item, key: Math.pow(Math.random(), 1 / Math.max(0.0001, weight(item))) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, count)
    .map((x) => x.item);
}

/* ---------------------------- Dates & streaks ---------------------------- */

export function localDay(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return localDay(new Date(y, m - 1, d + n));
}

export function computeStreak(activity: DailyActivity[], today = localDay()) {
  const active = new Set(activity.filter((a) => a.reviews > 0 || a.wordsAdded > 0).map((a) => a.day));
  let current = 0;
  let cursor = active.has(today) ? today : addDays(today, -1);
  while (active.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  const sorted = [...active].sort();
  let best = 0;
  let run = 0;
  let prev = "";
  for (const day of sorted) {
    run = prev && addDays(prev, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return { current, best: Math.max(best, current), activeToday: active.has(today) };
}

/* ------------------------------- XP / level ------------------------------ */

export function totalXp(activity: DailyActivity[]) {
  return activity.reduce(
    (sum, a) => sum + a.correct * 10 + (a.reviews - a.correct) * 2 + a.wordsAdded * 5 + a.quizzes * 20,
    0,
  );
}

export function levelFromXp(xp: number) {
  let level = 1;
  let need = 150;
  let acc = 0;
  while (xp >= acc + need) {
    acc += need;
    level++;
    need = Math.round(need * 1.3);
  }
  return { level, current: xp - acc, needed: need, progress: (xp - acc) / need };
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function relativeTime(iso: string | null) {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [DAY_MS * 30, "mo"],
    [DAY_MS, "d"],
    [3_600_000, "h"],
    [60_000, "m"],
  ];
  for (const [ms, label] of units) {
    if (abs >= ms) {
      const v = Math.round(abs / ms);
      return diff > 0 ? `in ${v}${label}` : `${v}${label} ago`;
    }
  }
  return diff > 0 ? "soon" : "just now";
}
