"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Combine, Crown, Play, RefreshCw, SlidersHorizontal, Target, Timer, X, Zap } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { filterBySource, sourceLabel, studyWeight, weightedSample } from "@/lib/learning";
import { maskWord } from "@/lib/quiz-engine";
import { useSettings } from "@/lib/settings";
import { useVocab, useVocabStats } from "@/lib/store";
import type { SourceKey, Word } from "@/lib/types";
import { cn, haptic, playTone, shuffle } from "@/lib/utils";
import { Button, Card, Chip, EmptyState, IconButton, IconTile, PageHeader, ProgressBar, SectionTitle, Segmented } from "./ui";

interface Pair {
  id: number;
  word: string;
  meaning: string;
}
interface Result {
  timeMs: number;
  mistakes: number;
  pairs: number;
  perfect: number;
  record: boolean;
  best: number | null;
}

const BEST_KEY = "vb-match-best";
const fmt = (ms: number) => {
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};
function readBest(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

export function MatchGame({ topSlot }: { topSlot?: ReactNode }) {
  const { words, recordReviews } = useVocab();
  const stats = useVocabStats();
  const { settings, update } = useSettings();
  const [source, setSource] = useState<SourceKey>("all");
  const [phase, setPhase] = useState<"setup" | "play" | "done">("setup");
  const [rounds, setRounds] = useState<Pair[][]>([]);
  const [roundIdx, setRoundIdx] = useState(0);
  const [left, setLeft] = useState<number[]>([]);
  const [right, setRight] = useState<number[]>([]);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [selL, setSelL] = useState<number | null>(null);
  const [selR, setSelR] = useState<number | null>(null);
  const [wrong, setWrong] = useState<{ l: number; r: number } | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const startRef = useRef(0);
  const missed = useRef<Set<number>>(new Set());
  const bestKey = `${settings.matchPairs}x${settings.matchRounds}-${settings.matchMeaning}`;
  const [best, setBest] = useState<number | null>(null);

  useEffect(() => {
    setBest(readBest()[bestKey] ?? null);
  }, [bestKey, phase]);

  const meaningOf = useCallback(
    (w: Word) =>
      settings.matchMeaning === "bangla"
        ? w.banglaMeaning || maskWord(w.englishMeaning, w.word)
        : maskWord(w.englishMeaning, w.word) || w.banglaMeaning,
    [settings.matchMeaning],
  );

  const pool = useMemo(
    () => filterBySource(words, source).filter((w) => (settings.matchMeaning === "bangla" ? w.banglaMeaning : w.englishMeaning)),
    [words, source, settings.matchMeaning],
  );

  const current = rounds[roundIdx] ?? [];
  const byId = useMemo(() => new Map(current.map((p) => [p.id, p])), [current]);

  const setupRound = (r: Pair[]) => {
    setLeft(shuffle(r.map((p) => p.id)));
    setRight(shuffle(r.map((p) => p.id)));
    setMatched(new Set());
    setSelL(null);
    setSelR(null);
    setWrong(null);
  };

  const start = () => {
    const total = Math.min(pool.length, settings.matchPairs * settings.matchRounds);
    const picked = weightedSample(pool, (w) => studyWeight(w), total);
    const seen = new Set<string>();
    const pairs: Pair[] = [];
    for (const w of picked) {
      const m = meaningOf(w);
      if (!m || seen.has(m.toLowerCase())) continue;
      seen.add(m.toLowerCase());
      pairs.push({ id: w.id, word: w.word, meaning: m });
    }
    const rs: Pair[][] = [];
    for (let i = 0; i < pairs.length; i += settings.matchPairs) rs.push(pairs.slice(i, i + settings.matchPairs));
    if (rs.length > 1 && rs[rs.length - 1].length < 3) rs[rs.length - 2].push(...rs.pop()!);
    setRounds(rs);
    setRoundIdx(0);
    setupRound(rs[0]);
    setMistakes(0);
    missed.current = new Set();
    startRef.current = Date.now();
    setElapsed(0);
    setResult(null);
    setPhase("play");
  };

  useEffect(() => {
    if (phase !== "play") return;
    const id = setInterval(() => setElapsed(Date.now() - startRef.current), 100);
    return () => clearInterval(id);
  }, [phase]);

  const finish = useCallback(() => {
    const timeMs = Date.now() - startRef.current;
    const all = rounds.flat();
    void recordReviews(
      all.map((p) => ({ wordId: p.id, correct: !missed.current.has(p.id), type: "match" })),
      "match",
    );
    const bests = readBest();
    const prev = bests[bestKey] ?? null;
    const record = prev === null || timeMs < prev;
    if (record) {
      bests[bestKey] = timeMs;
      try {
        localStorage.setItem(BEST_KEY, JSON.stringify(bests));
      } catch {
        /* ignore */
      }
    }
    playTone("complete");
    setResult({
      timeMs,
      mistakes,
      pairs: all.length,
      perfect: all.filter((p) => !missed.current.has(p.id)).length,
      record,
      best: record ? timeMs : prev,
    });
    setPhase("done");
  }, [rounds, recordReviews, bestKey, mistakes]);

  // Evaluate a selection pair
  useEffect(() => {
    if (selL === null || selR === null) return;
    if (selL === selR) {
      const next = new Set(matched);
      next.add(selL);
      setMatched(next);
      setSelL(null);
      setSelR(null);
      playTone("correct");
      haptic(10);
      if (next.size === current.length) {
        setTimeout(() => {
          if (roundIdx + 1 < rounds.length) {
            setRoundIdx((i) => i + 1);
            setupRound(rounds[roundIdx + 1]);
          } else finish();
        }, 420);
      }
    } else {
      missed.current.add(selL);
      missed.current.add(selR);
      setMistakes((m) => m + 1);
      setWrong({ l: selL, r: selR });
      playTone("wrong");
      haptic([18, 30, 18]);
      const t = setTimeout(() => {
        setWrong(null);
        setSelL(null);
        setSelR(null);
      }, 480);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selL, selR]);

  const sources: { key: SourceKey; label: string; count: number }[] = [
    { key: "all", label: "All words", count: stats.total },
    { key: "due", label: "Due", count: stats.due },
    { key: "weak", label: "Weak", count: stats.weak },
    { key: "new", label: "New", count: stats.new },
    { key: "learning", label: "Learning", count: stats.learning },
    { key: "mastered", label: "Mastered", count: stats.mastered },
    { key: "favorites", label: "Favorites", count: stats.favorites },
  ];

  /* --------------------------------- Setup -------------------------------- */
  if (phase === "setup") {
    return (
      <>
        <PageHeader title="Quiz" subtitle="Match words with their meanings" icon={Combine} tone="teal" />
        {topSlot}
        {words.length < 3 ? (
          <EmptyState icon={Combine} tone="teal" title="Add a few more words" text="You need at least 3 words to play Match pairs.">
            <Link href="/add">
              <Button>Add words</Button>
            </Link>
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 [&>*]:min-w-0">
            <div className="lg:order-2 lg:col-span-5">
              <div className="sheen relative animate-fade-up overflow-hidden rounded-[30px] bg-linear-to-br from-teal-400 via-cyan-500 to-sky-500 p-6 text-white shadow-2xl shadow-cyan-500/30 lg:sticky lg:top-24">
                <div className="pointer-events-none absolute -right-14 -top-14 size-56 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.3),transparent_65%)]" />
                <Combine className="absolute -bottom-6 -right-4 size-36 text-white/15" strokeWidth={1.5} />
                <div className="relative">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[12px] font-bold ring-1 ring-white/25">
                    <Timer className="size-3.5" /> Beat the clock
                  </span>
                  <h2 className="mt-4 text-3xl font-extrabold tracking-tight">Match pairs</h2>
                  <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-white/85">Tap a word, then its meaning. Fewer mistakes and faster times win.</p>
                  <div className="mt-5 grid grid-cols-3 gap-2">
                    {[
                      { label: "Pairs", value: Math.min(pool.length, settings.matchPairs * settings.matchRounds) },
                      { label: "Rounds", value: Math.max(1, Math.ceil(Math.min(pool.length, settings.matchPairs * settings.matchRounds) / settings.matchPairs)) },
                      { label: "Best", value: best ? fmt(best) : "—" },
                    ].map((s) => (
                      <div key={s.label} className="rounded-2xl bg-white/15 px-2 py-2.5 text-center ring-1 ring-white/20">
                        <div className="text-xl font-extrabold tabular-nums">{s.value}</div>
                        <div className="text-[11px] font-semibold text-white/80">{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={start}
                    disabled={pool.length < 3}
                    className="mt-5 inline-flex h-14 w-full items-center justify-center gap-2 rounded-[20px] bg-white text-[15px] font-extrabold text-cyan-700 shadow-xl transition active:scale-[0.98] disabled:opacity-60"
                  >
                    <Play className="size-5 fill-current" /> Start matching
                  </button>
                  {pool.length < 3 && <p className="mt-2.5 text-center text-[13px] font-semibold">Need at least 3 words in “{sourceLabel(source)}”.</p>}
                </div>
              </div>
            </div>
            <div className="stagger space-y-4 lg:order-1 lg:col-span-7">
              <Card className="space-y-5 p-4 sm:p-5">
                <div>
                  <SectionTitle title="Match with" className="!px-0" />
                  <Segmented
                    value={settings.matchMeaning}
                    onChange={(v) => update({ matchMeaning: v })}
                    options={[
                      { value: "bangla", label: "বাংলা meaning" },
                      { value: "definition", label: "Definition" },
                    ]}
                  />
                </div>
                <div>
                  <SectionTitle title="Pairs per round" className="!px-0" />
                  <Segmented<number> value={settings.matchPairs} onChange={(v) => update({ matchPairs: v })} options={[4, 5, 6, 8].map((n) => ({ value: n, label: String(n) }))} />
                </div>
                <div>
                  <SectionTitle title="Rounds" className="!px-0" />
                  <Segmented<number> value={settings.matchRounds} onChange={(v) => update({ matchRounds: v })} options={[1, 2, 3, 5].map((n) => ({ value: n, label: String(n) }))} />
                </div>
              </Card>
              <Card className="p-4 sm:p-5">
                <SectionTitle title="Practice from" className="!px-0" />
                <div className="flex flex-wrap gap-2">
                  {sources.map((s) => (
                    <Chip key={s.key} active={source === s.key} count={s.count} disabled={!s.count} onClick={() => setSource(s.key)}>
                      {s.label}
                    </Chip>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}
      </>
    );
  }

  /* --------------------------------- Done --------------------------------- */
  if (phase === "done" && result) {
    const acc = Math.round((result.perfect / Math.max(1, result.pairs)) * 100);
    return (
      <Card glass className="mx-auto max-w-lg animate-pop px-6 py-8 text-center">
        <IconTile icon={result.record ? Crown : Target} tone={result.record ? "amber" : "teal"} size="xl" className="mx-auto animate-float" />
        <h2 className="mt-5 text-2xl font-extrabold tracking-tight">{result.record ? "New personal best!" : "All matched!"}</h2>
        <p className="mt-1 text-sm text-muted">
          {result.pairs} pairs in {fmt(result.timeMs)} with {result.mistakes} mistake{result.mistakes === 1 ? "" : "s"}.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-2">
          {[
            { label: "Time", value: fmt(result.timeMs), icon: Timer, cls: "text-sky-500" },
            { label: "Accuracy", value: `${acc}%`, icon: Target, cls: "text-emerald-500" },
            { label: "Best", value: result.best ? fmt(result.best) : "—", icon: Crown, cls: "text-amber-500" },
          ].map((s) => (
            <div key={s.label} className="surface rounded-2xl px-2 py-3">
              <s.icon className={cn("mx-auto size-5", s.cls)} />
              <div className="mt-1 text-lg font-extrabold tabular-nums">{s.value}</div>
              <div className="text-[11px] font-medium text-muted">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <Button size="lg" icon={RefreshCw} onClick={start}>
            Play again
          </Button>
          <Button size="lg" variant="secondary" icon={SlidersHorizontal} onClick={() => setPhase("setup")}>
            Change settings
          </Button>
        </div>
      </Card>
    );
  }

  /* --------------------------------- Play --------------------------------- */
  const totalPairs = rounds.reduce((s, r) => s + r.length, 0);
  const doneBefore = rounds.slice(0, roundIdx).reduce((s, r) => s + r.length, 0);
  const tile = (id: number, side: "l" | "r") => {
    const p = byId.get(id);
    if (!p) return null;
    const isMatched = matched.has(id);
    const isSel = side === "l" ? selL === id : selR === id;
    const isWrong = wrong && (side === "l" ? wrong.l === id : wrong.r === id);
    const bn = side === "r" && settings.matchMeaning === "bangla" && /[\u0980-\u09FF]/.test(p.meaning);
    return (
      <motion.button
        key={`${side}-${id}`}
        layout
        type="button"
        disabled={isMatched || !!wrong}
        onClick={() => {
          playTone("tap");
          if (side === "l") setSelL((c) => (c === id ? null : id));
          else setSelR((c) => (c === id ? null : id));
        }}
        animate={isMatched ? { opacity: 0.35, scale: 0.96 } : { opacity: 1, scale: 1 }}
        className={cn(
          "flex min-h-[68px] items-center justify-center rounded-[20px] px-3 py-2.5 text-center transition-colors duration-150",
          side === "l" ? "text-[15px] font-extrabold tracking-tight" : bn ? "font-bangla text-[15px] font-medium leading-snug" : "text-[12.5px] font-medium leading-snug",
          isMatched && "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300",
          !isMatched && isWrong && "animate-shake bg-rose-500 text-white shadow-lg shadow-rose-500/30",
          !isMatched && !isWrong && isSel && "brand-gradient text-white shadow-lg shadow-brand-500/30",
          !isMatched && !isWrong && !isSel && "surface hover:-translate-y-0.5",
        )}
      >
        {isMatched ? (
          <span className="flex items-center gap-1.5">
            <Check className="size-4" strokeWidth={3} />
            <span className="line-clamp-3">{side === "l" ? p.word : p.meaning}</span>
          </span>
        ) : (
          <span className="line-clamp-4">{side === "l" ? p.word : p.meaning}</span>
        )}
      </motion.button>
    );
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-3">
        <IconButton icon={X} label="Quit" onClick={() => setPhase("setup")} />
        <ProgressBar value={(doneBefore + matched.size) / Math.max(1, totalPairs)} className="h-2.5 flex-1" barClassName="bg-linear-to-r from-teal-400 to-cyan-500 [background-image:linear-gradient(90deg,#2dd4bf,#06b6d4)]" />
        <span className="min-w-[4rem] text-right text-sm font-bold tabular-nums">{fmt(elapsed)}</span>
      </div>
      <div className="mt-3 flex items-center justify-between px-1 text-[13px] font-bold">
        <span className="text-muted">
          Round {roundIdx + 1} of {rounds.length}
        </span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-rose-500">
            <X className="size-3.5" strokeWidth={3} /> {mistakes}
          </span>
          {best && (
            <span className="flex items-center gap-1 text-amber-500">
              <Zap className="size-3.5" /> {fmt(best)}
            </span>
          )}
        </span>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={roundIdx}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.25 }}
          className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3"
        >
          <div className="flex flex-col gap-2.5 sm:gap-3">{left.map((id) => tile(id, "l"))}</div>
          <div className="flex flex-col gap-2.5 sm:gap-3">{right.map((id) => tile(id, "r"))}</div>
        </motion.div>
      </AnimatePresence>
      <p className="mt-5 text-center text-xs text-muted">Tap a word on the left, then its meaning on the right.</p>
    </div>
  );
}
