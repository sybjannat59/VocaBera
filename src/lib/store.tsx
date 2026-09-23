"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  computeReview,
  computeStreak,
  isDue,
  isWeak,
  levelFromXp,
  localDay,
  totalXp,
  wordStatus,
} from "./learning";
import type {
  BackupImportResult,
  BootstrapData,
  DailyActivity,
  QuizSession,
  ReviewItem,
  ReviewSource,
  Word,
  WordInput,
} from "./types";

type Status = "loading" | "ready" | "error";

export interface SessionPayload {
  total: number;
  correct: number;
  durationSec: number;
  bestStreak: number;
  xp: number;
  source: string;
  types: string[];
}

interface VocabCtx {
  words: Word[];
  activity: DailyActivity[];
  sessions: QuizSession[];
  status: Status;
  refresh: () => Promise<void>;
  addWord: (input: WordInput) => Promise<Word | null>;
  updateWord: (id: number, patch: Partial<WordInput>) => Promise<Word | null>;
  deleteWord: (id: number) => Promise<boolean>;
  toggleFavorite: (id: number) => void;
  bulkDelete: (ids: number[]) => Promise<void>;
  bulkUpdate: (ids: number[], patch: { isFavorite?: boolean; difficulty?: string }) => Promise<void>;
  bulkResetProgress: (ids: number[]) => Promise<void>;
  importWords: (items: unknown[]) => Promise<{ inserted: number; skipped: number } | null>;
  recordReviews: (items: ReviewItem[], source: ReviewSource, session?: SessionPayload) => Promise<void>;
  importBackup: (
    data: unknown,
    mode: "merge" | "replace",
  ) => Promise<(BackupImportResult & { snapshot: BootstrapData }) | null>;
  dataAction: (action: "seed" | "reset-progress" | "delete-all") => Promise<boolean>;
}

const Ctx = createContext<VocabCtx | null>(null);
const CACHE_KEY = "vb-cache-v1";

async function api<T>(url: string, method = "GET", json?: unknown, keepalive = false): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: json !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: json !== undefined ? JSON.stringify(json) : undefined,
    keepalive,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

function upsertActivity(list: DailyActivity[], row: DailyActivity | null | undefined) {
  if (!row) return list;
  const rest = list.filter((a) => a.day !== row.day);
  return [row, ...rest].sort((a, b) => (a.day < b.day ? 1 : -1));
}

function bumpLocal(list: DailyActivity[], day: string, inc: Partial<Omit<DailyActivity, "day">>) {
  const cur = list.find((a) => a.day === day) ?? { day, reviews: 0, correct: 0, wordsAdded: 0, quizzes: 0, flashcards: 0 };
  return upsertActivity(list, {
    day,
    reviews: cur.reviews + (inc.reviews ?? 0),
    correct: cur.correct + (inc.correct ?? 0),
    wordsAdded: cur.wordsAdded + (inc.wordsAdded ?? 0),
    quizzes: cur.quizzes + (inc.quizzes ?? 0),
    flashcards: cur.flashcards + (inc.flashcards ?? 0),
  });
}

export function VocabProvider({ children }: { children: ReactNode }) {
  const [words, setWords] = useState<Word[]>([]);
  const [activity, setActivity] = useState<DailyActivity[]>([]);
  const [sessions, setSessions] = useState<QuizSession[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const wordsRef = useRef<Word[]>([]);
  wordsRef.current = words;

  const applyBootstrap = useCallback((d: BootstrapData) => {
    setWords(d.words);
    setActivity(d.activity);
    setSessions(d.sessions);
    setStatus("ready");
  }, []);

  const refresh = useCallback(async () => {
    try {
      applyBootstrap(await api<BootstrapData>("/api/bootstrap"));
    } catch (e) {
      setStatus((s) => (s === "ready" ? s : "error"));
      toast.error(errMsg(e));
    }
  }, [applyBootstrap]);

  // Instant paint from local cache, then revalidate from the server.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) applyBootstrap(JSON.parse(raw) as BootstrapData);
    } catch {
      /* ignore */
    }
    void refresh();
  }, [applyBootstrap, refresh]);

  useEffect(() => {
    if (status !== "ready") return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ words, activity, sessions }));
      } catch {
        /* quota exceeded — ignore */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [words, activity, sessions, status]);

  const addWord = useCallback(async (input: WordInput) => {
    try {
      const res = await api<{ word: Word; activity: DailyActivity }>("/api/words", "POST", {
        ...input,
        localDate: localDay(),
      });
      setWords((ws) => [res.word, ...ws]);
      setActivity((a) => upsertActivity(a, res.activity));
      return res.word;
    } catch (e) {
      toast.error(errMsg(e));
      return null;
    }
  }, []);

  const updateWord = useCallback(async (id: number, patch: Partial<WordInput>) => {
    try {
      const res = await api<{ word: Word }>(`/api/words/${id}`, "PATCH", patch);
      setWords((ws) => ws.map((w) => (w.id === id ? res.word : w)));
      return res.word;
    } catch (e) {
      toast.error(errMsg(e));
      return null;
    }
  }, []);

  const importWords = useCallback(async (items: unknown[]) => {
    try {
      const res = await api<{ inserted: Word[]; skipped: number; activity: DailyActivity | null }>(
        "/api/words/bulk",
        "POST",
        { action: "import", words: items, localDate: localDay() },
      );
      setWords((ws) => [...res.inserted, ...ws].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
      setActivity((a) => upsertActivity(a, res.activity));
      return { inserted: res.inserted.length, skipped: res.skipped };
    } catch (e) {
      toast.error(errMsg(e));
      return null;
    }
  }, []);

  const deleteWord = useCallback(
    async (id: number) => {
      const target = wordsRef.current.find((w) => w.id === id);
      if (!target) return false;
      setWords((ws) => ws.filter((w) => w.id !== id));
      try {
        await api(`/api/words/${id}`, "DELETE");
        toast.success(`Deleted “${target.word}”`, {
          action: { label: "Undo", onClick: () => void importWords([target]) },
        });
        return true;
      } catch (e) {
        setWords((ws) => [target, ...ws].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
        toast.error(errMsg(e));
        return false;
      }
    },
    [importWords],
  );

  const toggleFavorite = useCallback((id: number) => {
    const target = wordsRef.current.find((w) => w.id === id);
    if (!target) return;
    const next = !target.isFavorite;
    setWords((ws) => ws.map((w) => (w.id === id ? { ...w, isFavorite: next } : w)));
    api(`/api/words/${id}`, "PATCH", { isFavorite: next }).catch((e) => {
      setWords((ws) => ws.map((w) => (w.id === id ? { ...w, isFavorite: !next } : w)));
      toast.error(errMsg(e));
    });
  }, []);

  const bulkDelete = useCallback(async (ids: number[]) => {
    if (!ids.length) return;
    const snapshot = wordsRef.current;
    const set = new Set(ids);
    setWords((ws) => ws.filter((w) => !set.has(w.id)));
    try {
      await api("/api/words/bulk", "POST", { action: "delete", ids });
      toast.success(`Deleted ${ids.length} word${ids.length === 1 ? "" : "s"}`);
    } catch (e) {
      setWords(snapshot);
      toast.error(errMsg(e));
    }
  }, []);

  const mergeWords = useCallback((updated: Word[]) => {
    if (!updated.length) return;
    const m = new Map(updated.map((w) => [w.id, w]));
    setWords((ws) => ws.map((w) => m.get(w.id) ?? w));
  }, []);

  const bulkUpdate = useCallback(
    async (ids: number[], patch: { isFavorite?: boolean; difficulty?: string }) => {
      try {
        const res = await api<{ words: Word[] }>("/api/words/bulk", "POST", { action: "update", ids, patch });
        mergeWords(res.words);
        toast.success(`Updated ${res.words.length} word${res.words.length === 1 ? "" : "s"}`);
      } catch (e) {
        toast.error(errMsg(e));
      }
    },
    [mergeWords],
  );

  const bulkResetProgress = useCallback(
    async (ids: number[]) => {
      try {
        const res = await api<{ words: Word[] }>("/api/words/bulk", "POST", { action: "reset-progress", ids });
        mergeWords(res.words);
        toast.success("Progress reset");
      } catch (e) {
        toast.error(errMsg(e));
      }
    },
    [mergeWords],
  );

  const recordReviews = useCallback(
    async (items: ReviewItem[], source: ReviewSource, session?: SessionPayload) => {
      if (!items.length && !session) return;
      const now = new Date();
      const today = localDay(now);
      setWords((ws) => {
        const map = new Map(ws.map((w) => [w.id, w]));
        for (const it of items) {
          const w = map.get(it.wordId);
          if (!w) continue;
          const r = computeReview(w, it.correct, now);
          map.set(w.id, {
            ...w,
            ...r,
            lastReviewedAt: r.lastReviewedAt.toISOString(),
            nextReviewAt: r.nextReviewAt.toISOString(),
          });
        }
        return ws.map((w) => map.get(w.id) ?? w);
      });
      setActivity((a) =>
        bumpLocal(a, today, {
          reviews: items.length,
          correct: items.filter((i) => i.correct).length,
          quizzes: session ? 1 : 0,
          flashcards: source === "flashcard" ? items.length : 0,
        }),
      );
      try {
        const res = await api<{ words: Word[]; activity: DailyActivity; session: QuizSession | null }>(
          "/api/reviews",
          "POST",
          { items, source, session, localDate: today },
          true,
        );
        mergeWords(res.words);
        setActivity((a) => upsertActivity(a, res.activity));
        if (res.session) setSessions((s) => [res.session as QuizSession, ...s].slice(0, 30));
      } catch {
        toast.error("Could not sync your progress");
      }
    },
    [mergeWords],
  );

  const dataAction = useCallback(
    async (action: "seed" | "reset-progress" | "delete-all") => {
      try {
        const res = await api<BootstrapData & { inserted?: number }>("/api/data", "POST", { action });
        applyBootstrap(res);
        if (action === "seed") toast.success(res.inserted ? `Added ${res.inserted} sample words` : "Sample words already added");
        if (action === "reset-progress") toast.success("Learning progress reset");
        if (action === "delete-all") toast.success("All data deleted");
        return true;
      } catch (e) {
        toast.error(errMsg(e));
        return false;
      }
    },
    [applyBootstrap],
  );

  const importBackup = useCallback(
    async (data: unknown, mode: "merge" | "replace") => {
      try {
        const res = await api<BootstrapData & { result: BackupImportResult }>("/api/backup", "POST", { data, mode });
        applyBootstrap(res);
        return { ...res.result, snapshot: { words: res.words, activity: res.activity, sessions: res.sessions } };
      } catch (e) {
        toast.error(errMsg(e));
        return null;
      }
    },
    [applyBootstrap],
  );

  const value = useMemo<VocabCtx>(
    () => ({
      words,
      activity,
      sessions,
      status,
      refresh,
      addWord,
      updateWord,
      deleteWord,
      toggleFavorite,
      bulkDelete,
      bulkUpdate,
      bulkResetProgress,
      importWords,
      recordReviews,
      dataAction,
      importBackup,
    }),
    [
      importBackup,
      words,
      activity,
      sessions,
      status,
      refresh,
      addWord,
      updateWord,
      deleteWord,
      toggleFavorite,
      bulkDelete,
      bulkUpdate,
      bulkResetProgress,
      importWords,
      recordReviews,
      dataAction,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVocab() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useVocab must be used inside VocabProvider");
  return ctx;
}

export function useVocabStats() {
  const { words, activity, sessions } = useVocab();
  return useMemo(() => {
    const now = Date.now();
    const today = localDay();
    const counts = { new: 0, learning: 0, reviewing: 0, mastered: 0 };
    let due = 0;
    let favorites = 0;
    let weak = 0;
    let reviews = 0;
    let correct = 0;
    const tags = new Map<string, number>();
    for (const w of words) {
      counts[wordStatus(w)]++;
      if (isDue(w, now)) due++;
      if (w.isFavorite) favorites++;
      if (isWeak(w)) weak++;
      reviews += w.timesReviewed;
      correct += w.timesCorrect;
      for (const t of w.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
    }
    const xp = totalXp(activity);
    return {
      total: words.length,
      ...counts,
      due,
      favorites,
      weak,
      accuracy: reviews ? Math.round((correct / reviews) * 100) : 0,
      totalReviews: reviews,
      streak: computeStreak(activity, today),
      today: activity.find((a) => a.day === today) ?? null,
      xp,
      level: levelFromXp(xp),
      quizzes: sessions.length,
      tags: [...tags.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t),
    };
  }, [words, activity, sessions]);
}

/* ------------------------------ Word sheet ------------------------------ */

interface SheetCtx {
  openWordId: number | null;
  openWord: (id: number) => void;
  closeWord: () => void;
}

const WordSheetCtx = createContext<SheetCtx | null>(null);

export function WordSheetProvider({ children }: { children: ReactNode }) {
  const [openWordId, setOpenWordId] = useState<number | null>(null);
  const openWord = useCallback((id: number) => setOpenWordId(id), []);
  const closeWord = useCallback(() => setOpenWordId(null), []);
  const value = useMemo(() => ({ openWordId, openWord, closeWord }), [openWordId, openWord, closeWord]);
  return <WordSheetCtx.Provider value={value}>{children}</WordSheetCtx.Provider>;
}

export function useWordSheet() {
  const ctx = useContext(WordSheetCtx);
  if (!ctx) throw new Error("useWordSheet must be used inside WordSheetProvider");
  return ctx;
}
