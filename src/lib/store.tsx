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
  addLocalWord,
  bulkAddLocalWords,
  bulkDeleteLocalWords,
  bulkResetLocalProgress,
  bulkUpdateLocalWords,
  deleteLocalWord,
  getLocalBootstrap,
  importLocalBackup,
  localDataAction,
  recordLocalReviews,
  updateLocalWord,
} from "./idb";
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
  /** Replace the in-memory data after an external change (e.g. a device sync merge). */
  applyData: (data: BootstrapData) => void;
  pendingSync: number;
}

const Ctx = createContext<VocabCtx | null>(null);

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

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

  // Load directly from local browser IndexedDB
  const refresh = useCallback(async () => {
    try {
      const localData = await getLocalBootstrap();
      applyBootstrap(localData);

      // Optional background sync with server if server has DB and is reachable
      if (typeof window !== "undefined" && navigator.onLine) {
        fetch("/api/bootstrap", { cache: "no-store" })
          .then(async (res) => {
            if (!res.ok) return;
            const serverData = (await res.json().catch(() => null)) as BootstrapData | null;
            if (serverData && Array.isArray(serverData.words) && serverData.words.length > 0) {
              // Only merge if local DB has fewer words
              if (localData.words.length === 0) {
                applyBootstrap(serverData);
              }
            }
          })
          .catch(() => {
            /* ignore server errors - local database is primary */
          });
      }
    } catch (e) {
      console.warn("Local storage refresh issue:", e);
      setStatus("ready");
    }
  }, [applyBootstrap]);

  // Initial load
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addWord = useCallback(async (input: WordInput) => {
    try {
      const res = await addLocalWord(input, localDay());
      setWords((ws) => [res.word, ...ws]);
      setActivity((a) => {
        const rest = a.filter((item) => item.day !== res.activity.day);
        return [res.activity, ...rest].sort((x, y) => y.day.localeCompare(x.day));
      });

      // Background mirror to server if available (never throws or blocks)
      if (typeof window !== "undefined" && navigator.onLine) {
        fetch("/api/words", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, localDate: localDay() }),
        }).catch(() => undefined);
      }

      return res.word;
    } catch (e) {
      toast.error(errMsg(e));
      return null;
    }
  }, []);

  const updateWord = useCallback(async (id: number, patch: Partial<WordInput>) => {
    try {
      const updated = await updateLocalWord(id, patch);
      if (!updated) throw new Error("Word not found");
      setWords((ws) => ws.map((w) => (w.id === id ? updated : w)));

      if (typeof window !== "undefined" && navigator.onLine) {
        fetch(`/api/words/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }).catch(() => undefined);
      }

      return updated;
    } catch (e) {
      toast.error(errMsg(e));
      return null;
    }
  }, []);

  const importWords = useCallback(async (items: unknown[]) => {
    try {
      const res = await bulkAddLocalWords(items, localDay());
      setWords((ws) => [...res.inserted, ...ws].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setActivity((a) => {
        const rest = a.filter((item) => item.day !== res.activity.day);
        return [res.activity, ...rest].sort((x, y) => y.day.localeCompare(x.day));
      });

      // Background mirror to server if available
      if (typeof window !== "undefined" && navigator.onLine && res.inserted.length > 0) {
        fetch("/api/words/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "import", words: items, localDate: localDay() }),
        }).catch(() => undefined);
      }

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
        await deleteLocalWord(id);
        toast.success(`Deleted “${target.word}”`, {
          action: { label: "Undo", onClick: () => void importWords([target]) },
        });

        if (typeof window !== "undefined" && navigator.onLine) {
          fetch(`/api/words/${id}`, { method: "DELETE" }).catch(() => undefined);
        }

        return true;
      } catch (e) {
        setWords((ws) => [target, ...ws].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
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

    updateLocalWord(id, { isFavorite: next }).catch((e) => {
      setWords((ws) => ws.map((w) => (w.id === id ? { ...w, isFavorite: !next } : w)));
      toast.error(errMsg(e));
    });

    if (typeof window !== "undefined" && navigator.onLine) {
      fetch(`/api/words/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: next }),
      }).catch(() => undefined);
    }
  }, []);

  const bulkDelete = useCallback(async (ids: number[]) => {
    if (!ids.length) return;
    const snapshot = wordsRef.current;
    const set = new Set(ids);
    setWords((ws) => ws.filter((w) => !set.has(w.id)));

    try {
      await bulkDeleteLocalWords(ids);
      toast.success(`Deleted ${ids.length} word${ids.length === 1 ? "" : "s"}`);

      if (typeof window !== "undefined" && navigator.onLine) {
        fetch("/api/words/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", ids }),
        }).catch(() => undefined);
      }
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
        const updated = await bulkUpdateLocalWords(ids, patch);
        mergeWords(updated);
        toast.success(`Updated ${updated.length} word${updated.length === 1 ? "" : "s"}`);

        if (typeof window !== "undefined" && navigator.onLine) {
          fetch("/api/words/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update", ids, patch }),
          }).catch(() => undefined);
        }
      } catch (e) {
        toast.error(errMsg(e));
      }
    },
    [mergeWords],
  );

  const bulkResetProgress = useCallback(
    async (ids: number[]) => {
      try {
        const updated = await bulkResetLocalProgress(ids);
        mergeWords(updated);
        toast.success("Progress reset");

        if (typeof window !== "undefined" && navigator.onLine) {
          fetch("/api/words/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "reset-progress", ids }),
          }).catch(() => undefined);
        }
      } catch (e) {
        toast.error(errMsg(e));
      }
    },
    [mergeWords],
  );

  const recordReviews = useCallback(
    async (items: ReviewItem[], source: ReviewSource, session?: SessionPayload) => {
      if (!items.length && !session) return;
      try {
        const res = await recordLocalReviews(items, source, session, localDay());
        mergeWords(res.words);
        setActivity((a) => {
          const rest = a.filter((item) => item.day !== res.activity.day);
          return [res.activity, ...rest].sort((x, y) => y.day.localeCompare(x.day));
        });
        if (res.session) {
          setSessions((s) => [res.session as QuizSession, ...s].slice(0, 30));
        }

        // Mirror to server if online
        if (typeof window !== "undefined" && navigator.onLine) {
          fetch("/api/reviews", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items, source, session, localDate: localDay() }),
          }).catch(() => undefined);
        }
      } catch {
        toast.error("Could not save your progress locally");
      }
    },
    [mergeWords],
  );

  const importBackup = useCallback(
    async (data: unknown, mode: "merge" | "replace") => {
      try {
        const res = await importLocalBackup(data, mode);
        applyBootstrap(res.snapshot);
        return res;
      } catch (e) {
        toast.error(errMsg(e));
        return null;
      }
    },
    [applyBootstrap],
  );

  const dataAction = useCallback(
    async (action: "seed" | "reset-progress" | "delete-all") => {
      try {
        const res = await localDataAction(action);
        applyBootstrap(res);

        if (action === "seed") toast.success("Sample words ready");
        if (action === "reset-progress") toast.success("Learning progress reset");
        if (action === "delete-all") toast.success("All data cleared");

        if (typeof window !== "undefined" && navigator.onLine) {
          fetch("/api/data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          }).catch(() => undefined);
        }

        return true;
      } catch (e) {
        toast.error(errMsg(e));
        return false;
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
      importBackup,
      dataAction,
      applyData: applyBootstrap,
      pendingSync: 0,
    }),
    [
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
      importBackup,
      dataAction,
      applyBootstrap,
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
