"use client";

import { BookOpen, CirclePlus, Database, Dices, LayoutGrid, List, Search, SlidersHorizontal, Star, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { WordCard } from "@/components/word-bits";
import { Button, Chip, EmptyState, PageHeader, PageSkeleton, Segmented, Skeleton } from "@/components/ui";
import { isDue, wordStatus } from "@/lib/learning";
import { useSettings } from "@/lib/settings";
import { useVocab, useVocabStats, useWordSheet } from "@/lib/store";
import { PARTS_OF_SPEECH } from "@/lib/types";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "favorites" | "due" | "new" | "learning" | "reviewing" | "mastered";
type SortKey = "newest" | "oldest" | "az" | "za" | "mastery" | "mistakes";
const STATUS_KEYS: StatusFilter[] = ["all", "favorites", "due", "new", "learning", "reviewing", "mastered"];

const selectCls = "field h-11 w-full appearance-none bg-no-repeat px-3.5 pr-9 text-sm font-medium outline-none";
const chevron = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%2394a3b8' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundPosition: "right 12px center",
};

function WordsInner() {
  const params = useSearchParams();
  const { words, status, dataAction } = useVocab();
  const stats = useVocabStats();
  const { settings, update } = useSettings();
  const { openWord } = useWordSheet();
  const [query, setQuery] = useState("");
  const dq = useDeferredValue(query);
  const initial = params.get("status") as StatusFilter | null;
  const [filter, setFilter] = useState<StatusFilter>(initial && STATUS_KEYS.includes(initial) ? initial : "all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [pos, setPos] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [tag, setTag] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(40);
  const searchRef = useRef<HTMLInputElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const view = settings.wordsView;

  useEffect(() => {
    const s = params.get("status") as StatusFilter | null;
    if (s && STATUS_KEYS.includes(s)) setFilter(s);
  }, [params]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(t.tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const counts = useMemo(() => {
    const now = Date.now();
    const c: Record<StatusFilter, number> = { all: words.length, favorites: 0, due: 0, new: 0, learning: 0, reviewing: 0, mastered: 0 };
    for (const w of words) {
      if (w.isFavorite) c.favorites++;
      if (isDue(w, now)) c.due++;
      c[wordStatus(w)]++;
    }
    return c;
  }, [words]);

  const filtered = useMemo(() => {
    const q = dq.trim().toLowerCase();
    const now = Date.now();
    const list = words.filter((w) => {
      if (filter === "favorites" && !w.isFavorite) return false;
      if (filter === "due" && !isDue(w, now)) return false;
      if (["new", "learning", "reviewing", "mastered"].includes(filter) && wordStatus(w) !== filter) return false;
      if (pos && w.partOfSpeech !== pos) return false;
      if (difficulty && w.difficulty !== difficulty) return false;
      if (tag && !w.tags.includes(tag)) return false;
      if (!q) return true;
      return (
        w.word.toLowerCase().includes(q) ||
        w.banglaMeaning.toLowerCase().includes(q) ||
        w.englishMeaning.toLowerCase().includes(q) ||
        w.synonyms.some((s) => s.toLowerCase().includes(q)) ||
        w.antonyms.some((s) => s.toLowerCase().includes(q)) ||
        w.tags.some((s) => s.toLowerCase().includes(q))
      );
    });
    switch (sort) {
      case "oldest":
        list.reverse();
        break;
      case "az":
        list.sort((a, b) => a.word.localeCompare(b.word));
        break;
      case "za":
        list.sort((a, b) => b.word.localeCompare(a.word));
        break;
      case "mastery":
        list.sort((a, b) => a.mastery - b.mastery || b.timesWrong - a.timesWrong);
        break;
      case "mistakes":
        list.sort((a, b) => b.timesWrong - a.timesWrong);
        break;
    }
    if (q) {
      const rank = (s: string) => (s.toLowerCase() === q ? 0 : s.toLowerCase().startsWith(q) ? 1 : s.toLowerCase().includes(q) ? 2 : 3);
      list.sort((a, b) => rank(a.word) - rank(b.word));
    }
    return list;
  }, [words, dq, filter, sort, pos, difficulty, tag]);

  useEffect(() => setLimit(40), [dq, filter, sort, pos, difficulty, tag]);

  const hasMore = filtered.length > limit;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setLimit((l) => l + 40), { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, limit]);

  const activeExtra = [pos, difficulty, tag].filter(Boolean).length + (sort !== "newest" ? 1 : 0);
  const clearAll = () => {
    setQuery("");
    setFilter("all");
    setSort("newest");
    setPos("");
    setDifficulty("");
    setTag("");
  };

  if (status === "loading") {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-12 w-full" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  const labels: Record<StatusFilter, string> = {
    all: "All",
    favorites: "Favorites",
    due: "Due",
    new: "New",
    learning: "Learning",
    reviewing: "Reviewing",
    mastered: "Mastered",
  };

  return (
    <>
      <PageHeader
        title="Words"
        subtitle={`${stats.total} words · ${stats.mastered} mastered · ${stats.due} due`}
        icon={BookOpen}
        tone="sky"
        actions={
          <>
            <Segmented
              className="hidden sm:flex"
              value={view}
              onChange={(v) => update({ wordsView: v })}
              options={[
                { value: "list", label: <span className="sr-only">List</span>, icon: List },
                { value: "grid", label: <span className="sr-only">Grid</span>, icon: LayoutGrid },
              ]}
            />
            <Link href="/add" aria-label="Add word" className="grid size-11 place-items-center rounded-2xl brand-gradient text-white shadow-lg shadow-brand-500/30 transition active:scale-90">
              <CirclePlus className="size-5" />
            </Link>
          </>
        }
      />

      {words.length === 0 ? (
        <EmptyState icon={BookOpen} tone="sky" title="Your word list is empty" text="Add your first word or load a curated set of 32 GRE / IELTS words to explore the app.">
          <Link href="/add">
            <Button icon={CirclePlus}>Add a word</Button>
          </Link>
          <Button variant="secondary" icon={Database} onClick={() => void dataAction("seed")}>
            Load samples
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 -mx-4 mb-4 bg-page/80 px-4 pb-3 pt-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div className="flex gap-2">
              <div className="field flex h-12 flex-1 items-center gap-2.5 px-4">
                <Search className="size-[18px] shrink-0 text-muted" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search words, meanings, synonyms…"
                  aria-label="Search words"
                  className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted/70"
                />
                {query ? (
                  <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="grid size-7 place-items-center rounded-full bg-black/5 dark:bg-white/10">
                    <X className="size-3.5" />
                  </button>
                ) : (
                  <kbd className="hidden rounded-md border border-[var(--field-border)] px-1.5 text-[11px] font-semibold text-muted md:inline">/</kbd>
                )}
              </div>
              <button
                type="button"
                aria-label="Random word"
                title="Surprise me with a random word"
                disabled={!filtered.length}
                onClick={() => filtered.length && openWord(filtered[Math.floor(Math.random() * filtered.length)].id)}
                className="surface grid size-12 shrink-0 place-items-center rounded-2xl transition active:scale-95 disabled:opacity-40"
              >
                <Dices className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => setShowFilters((s) => !s)}
                aria-label="Filters and sorting"
                aria-expanded={showFilters}
                className={cn(
                  "relative grid size-12 shrink-0 place-items-center rounded-2xl transition active:scale-95",
                  showFilters ? "brand-gradient text-white shadow-lg shadow-brand-500/30" : "surface",
                )}
              >
                <SlidersHorizontal className="size-5" />
                {activeExtra > 0 && (
                  <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-[var(--bg)]">
                    {activeExtra}
                  </span>
                )}
              </button>
            </div>

            {showFilters && (
              <div className="mt-2.5 grid animate-fade-up grid-cols-2 gap-2 md:grid-cols-4">
                <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={selectCls} style={chevron}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="az">A → Z</option>
                  <option value="za">Z → A</option>
                  <option value="mastery">Least mastered</option>
                  <option value="mistakes">Most mistakes</option>
                </select>
                <select aria-label="Part of speech" value={pos} onChange={(e) => setPos(e.target.value)} className={selectCls} style={chevron}>
                  <option value="">All parts of speech</option>
                  {PARTS_OF_SPEECH.map((p) => (
                    <option key={p} value={p}>
                      {p[0].toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
                <select aria-label="Difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={selectCls} style={chevron}>
                  <option value="">Any difficulty</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
                <select aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)} className={selectCls} style={chevron}>
                  <option value="">All tags</option>
                  {stats.tags.map((t) => (
                    <option key={t} value={t}>
                      #{t}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="no-scrollbar -mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              {STATUS_KEYS.map((k) => (
                <Chip key={k} active={filter === k} onClick={() => setFilter(k)} count={counts[k]} icon={k === "favorites" ? Star : undefined}>
                  {labels[k]}
                </Chip>
              ))}
            </div>
          </div>

          <div className="mb-3 flex items-center justify-between px-1 text-[13px] text-muted">
            <span>
              {filtered.length === words.length ? `${words.length} words` : `${filtered.length} of ${words.length} words`}
            </span>
            {(filter !== "all" || query || activeExtra > 0) && (
              <button type="button" onClick={clearAll} className="font-semibold text-brand-600 dark:text-brand-300">
                Clear filters
              </button>
            )}
            <Segmented
              className="sm:hidden"
              value={view}
              onChange={(v) => update({ wordsView: v })}
              options={[
                { value: "list", label: <span className="sr-only">List</span>, icon: List },
                { value: "grid", label: <span className="sr-only">Grid</span>, icon: LayoutGrid },
              ]}
            />
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={Search} tone="slate" title="No matching words" text="Try a different search or clear your filters.">
              <Button variant="secondary" onClick={clearAll}>
                Clear filters
              </Button>
            </EmptyState>
          ) : (
            <div
              className={cn(
                "grid gap-3 [&>*]:min-w-0",
                view === "grid" ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
              )}
            >
              {filtered.slice(0, limit).map((w) => (
                <WordCard key={w.id} w={w} view={view} onOpen={openWord} />
              ))}
            </div>
          )}
          {hasMore && <div ref={sentinel} className="h-10" />}
        </>
      )}
    </>
  );
}

export default function WordsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WordsInner />
    </Suspense>
  );
}
