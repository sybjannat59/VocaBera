"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  CircleCheck,
  CircleX,
  Clock,
  Crown,
  Flame,
  Headphones,
  House,
  Languages,
  Lightbulb,
  Link2,
  Medal,
  PenLine,
  Play,
  Puzzle,
  RefreshCw,
  Repeat,
  RotateCcw,
  Search,
  SpellCheck,
  Split,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfirm } from "@/components/providers";
import { SpeakButton } from "@/components/word-bits";
import {
  Button,
  Card,
  Chip,
  IconButton,
  IconTile,
  PageHeader,
  PageSkeleton,
  PosBadge,
  ProgressBar,
  ProgressRing,
  SectionTitle,
  Segmented,
  Switch,
  type IconType,
  type Tone,
} from "@/components/ui";
import { filterBySource, sourceLabel } from "@/lib/learning";
import { QUESTION_TYPES, buildQuestion, eligible, grade, planQuiz, poolStats, type Question, type QuestionType } from "@/lib/quiz-engine";
import { useSettings } from "@/lib/settings";
import { useVocab, useVocabStats, useWordSheet } from "@/lib/store";
import type { SourceKey } from "@/lib/types";
import { cn, findWordInSentence, hasBangla, haptic, playTone, shuffle, speak } from "@/lib/utils";
import { MatchGame } from "@/components/match-game";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Snail, Volume2, Combine } from "lucide-react";

const TYPE_META: Record<QuestionType, { icon: IconType; tone: Tone }> = {
  "word-bangla": { icon: Languages, tone: "emerald" },
  "bangla-word": { icon: Repeat, tone: "teal" },
  "word-definition": { icon: BookOpen, tone: "sky" },
  "definition-word": { icon: Search, tone: "indigo" },
  synonym: { icon: Link2, tone: "violet" },
  antonym: { icon: Split, tone: "rose" },
  "fill-blank": { icon: PenLine, tone: "amber" },
  "word-parts": { icon: Puzzle, tone: "pink" },
  spelling: { icon: SpellCheck, tone: "brand" },
  listening: { icon: Headphones, tone: "teal" },
  "true-false": { icon: CircleCheck, tone: "slate" },
};

interface QuizConfig {
  wordIds: number[];
  types: QuestionType[];
  timer: boolean;
  adaptive: boolean;
  source: SourceKey;
}
interface AnswerRecord {
  q: Question;
  response: string;
  correct: boolean;
  typo: boolean;
  timedOut: boolean;
}
interface QuizResult {
  history: AnswerRecord[];
  correct: number;
  total: number;
  durationSec: number;
  bestStreak: number;
  xp: number;
  config: QuizConfig;
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const PRAISE = ["Excellent!", "Great job!", "Nailed it!", "Correct!", "Brilliant!", "Spot on!"];

/* ---------------------------------- Setup --------------------------------- */

function QuizSetup({
  initialSource,
  onStart,
  topSlot,
}: {
  initialSource?: SourceKey;
  onStart: (c: QuizConfig) => void;
  topSlot?: ReactNode;
}) {
  const { words, sessions } = useVocab();
  const stats = useVocabStats();
  const { settings, update } = useSettings();
  const [source, setSource] = useState<SourceKey>(initialSource ?? settings.quizSource);

  const pool = useMemo(() => filterBySource(words, source), [words, source]);
  const pStats = useMemo(() => poolStats(words), [words]);
  const typeCounts = useMemo(() => {
    const c = {} as Record<QuestionType, number>;
    for (const t of QUESTION_TYPES) c[t.id] = pool.filter((w) => eligible(t.id, w, pStats)).length;
    return c;
  }, [pool, pStats]);

  const sources: { key: SourceKey; label: string; count: number }[] = [
    { key: "all", label: "All words", count: stats.total },
    { key: "due", label: "Due", count: stats.due },
    { key: "weak", label: "Weak", count: stats.weak },
    { key: "new", label: "New", count: stats.new },
    { key: "favorites", label: "Favorites", count: stats.favorites },
    ...stats.tags.slice(0, 8).map((t) => ({ key: `tag:${t}` as SourceKey, label: `#${t}`, count: filterBySource(words, `tag:${t}`).length })),
  ];

  const activeTypes = settings.quizTypes.filter((t) => typeCounts[t] > 0);
  const reason =
    words.length < 4
      ? "Add at least 4 words to unlock quizzes."
      : !pool.length
        ? `No words in “${sourceLabel(source)}” yet.`
        : !activeTypes.length
          ? "Select at least one available question type."
          : "";

  const toggleType = (t: QuestionType) => {
    const has = settings.quizTypes.includes(t);
    update({ quizTypes: has ? settings.quizTypes.filter((x) => x !== t) : [...settings.quizTypes, t] });
  };

  const start = () => {
    if (reason) return;
    onStart({
      wordIds: planQuiz(pool, settings.quizLength),
      types: activeTypes,
      timer: settings.quizTimer,
      adaptive: settings.quizAdaptive,
      source,
    });
  };

  return (
    <>
      <PageHeader title="Quiz" subtitle="Smart, adaptive practice" icon={Brain} tone="amber" />
      {topSlot}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 [&>*]:min-w-0">
        <div className="lg:col-span-5 lg:order-2">
          <div className="space-y-4 lg:sticky lg:top-24">
            <div className="sheen relative animate-fade-up overflow-hidden rounded-[30px] bg-linear-to-br from-amber-400 via-orange-500 to-pink-500 p-6 text-white shadow-2xl shadow-orange-500/30">
              <div className="pointer-events-none absolute -right-14 -top-14 size-56 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.3),transparent_65%)]" />
              <Brain className="absolute -bottom-6 -right-4 size-36 text-white/15" strokeWidth={1.5} />
              <div className="relative">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[12px] font-bold ring-1 ring-white/25">
                  <Zap className="size-3.5" /> Adaptive engine
                </span>
                <h2 className="mt-4 text-3xl font-extrabold tracking-tight">Ready to test yourself?</h2>
                <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-white/85">
                  Questions get harder as you improve and focus on words you tend to miss.
                </p>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  {[
                    { label: "Questions", value: settings.quizLength },
                    { label: "Words", value: pool.length },
                    { label: "Types", value: activeTypes.length },
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
                  disabled={!!reason}
                  className="mt-5 inline-flex h-14 w-full items-center justify-center gap-2 rounded-[20px] bg-white text-[15px] font-extrabold text-orange-600 shadow-xl transition active:scale-[0.98] disabled:opacity-60"
                >
                  <Play className="size-5 fill-current" /> Start quiz
                </button>
                {reason && <p className="mt-2.5 text-center text-[13px] font-semibold text-white/90">{reason}</p>}
              </div>
            </div>

            {sessions.length > 0 && (
              <Card className="p-4">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
                  <TrendingUp className="size-4 text-emerald-500" /> Recent results
                </h3>
                <div className="space-y-1.5">
                  {sessions.slice(0, 5).map((s) => {
                    const pct = s.total ? Math.round((s.correct / s.total) * 100) : 0;
                    return (
                      <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
                        <span
                          className={cn(
                            "grid size-9 place-items-center rounded-xl text-[12px] font-extrabold",
                            pct >= 80 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : pct >= 50 ? "bg-amber-500/15 text-amber-600 dark:text-amber-300" : "bg-rose-500/15 text-rose-600 dark:text-rose-300",
                          )}
                        >
                          {pct}%
                        </span>
                        <div className="min-w-0 flex-1 text-[13px]">
                          <div className="font-semibold">
                            {s.correct}/{s.total} correct · {sourceLabel(s.source as SourceKey)}
                          </div>
                          <div className="text-xs text-muted">{new Date(s.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</div>
                        </div>
                        <span className="text-xs font-bold text-brand-600 dark:text-brand-300">+{s.xp} XP</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        </div>

        <div className="stagger space-y-4 lg:col-span-7 lg:order-1">
          <Card className="p-4 sm:p-5">
            <SectionTitle title="Number of questions" className="!px-0" />
            <Segmented<number>
              value={settings.quizLength}
              onChange={(v) => update({ quizLength: v })}
              options={[5, 10, 15, 20, 30].map((n) => ({ value: n, label: String(n) }))}
            />
          </Card>

          <Card className="p-4 sm:p-5">
            <SectionTitle title="Practice from" className="!px-0" />
            <div className="flex flex-wrap gap-2">
              {sources.map((s) => (
                <Chip
                  key={s.key}
                  active={source === s.key}
                  count={s.count}
                  disabled={!s.count}
                  onClick={() => {
                    setSource(s.key);
                    update({ quizSource: s.key });
                  }}
                >
                  {s.label}
                </Chip>
              ))}
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <SectionTitle
              title="Question types"
              className="!px-0"
              action={
                <div className="flex gap-1">
                  <button type="button" onClick={() => update({ quizTypes: QUESTION_TYPES.map((t) => t.id) })} className="rounded-full px-2.5 py-1 text-[12.5px] font-bold text-brand-600 hover:bg-brand-500/10 dark:text-brand-300">
                    All
                  </button>
                  <button type="button" onClick={() => update({ quizTypes: [] })} className="rounded-full px-2.5 py-1 text-[12.5px] font-bold text-muted hover:bg-black/5 dark:hover:bg-white/10">
                    None
                  </button>
                </div>
              }
            />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              {QUESTION_TYPES.map((t) => {
                const on = settings.quizTypes.includes(t.id);
                const count = typeCounts[t.id];
                const meta = TYPE_META[t.id];
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleType(t.id)}
                    aria-pressed={on}
                    className={cn(
                      "relative flex flex-col items-start rounded-[20px] p-3 text-left transition active:scale-[0.97]",
                      on ? "bg-brand-500/10 ring-2 ring-brand-500/60 dark:bg-brand-400/10" : "surface opacity-80 hover:opacity-100",
                      !count && "opacity-45",
                    )}
                  >
                    <IconTile icon={meta.icon} tone={meta.tone} size="sm" />
                    <span className="mt-2 text-[13px] font-bold leading-tight">{t.label}</span>
                    <span className="text-[11.5px] text-muted">{t.desc}</span>
                    <span className="mt-1.5 text-[11px] font-semibold text-muted">{count} words</span>
                    {on && (
                      <span className="absolute right-2.5 top-2.5 grid size-5 place-items-center rounded-full brand-gradient text-white">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="divide-y divide-[var(--line)] px-4 sm:px-5">
            <div className="flex items-center gap-3 py-4">
              <IconTile icon={Timer} tone="rose" size="sm" />
              <div className="flex-1">
                <div className="text-sm font-bold">Timed questions</div>
                <div className="text-xs text-muted">20s per question · 35s for spelling</div>
              </div>
              <Switch checked={settings.quizTimer} onChange={(v) => update({ quizTimer: v })} label="Timed questions" />
            </div>
            <div className="flex items-center gap-3 py-4">
              <IconTile icon={Zap} tone="amber" size="sm" />
              <div className="flex-1">
                <div className="text-sm font-bold">Adaptive difficulty</div>
                <div className="text-xs text-muted">Harder questions after streaks, easier after misses</div>
              </div>
              <Switch checked={settings.quizAdaptive} onChange={(v) => update({ quizAdaptive: v })} label="Adaptive difficulty" />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

/* --------------------------------- Player --------------------------------- */

interface AnswerState {
  response: string;
  correct: boolean;
  typo: boolean;
  timedOut: boolean;
  gained: number;
  praise: string;
}

function QuizPlayer({ config, onFinish, onExit }: { config: QuizConfig; onFinish: (r: QuizResult) => void; onExit: () => void }) {
  const { words, recordReviews } = useVocab();
  const confirm = useConfirm();
  const [pool] = useState(() => words);
  const byId = useMemo(() => new Map(pool.map((w) => [w.id, w])), [pool]);
  const pStats = useMemo(() => poolStats(pool), [pool]);
  const total = config.wordIds.length;

  const build = useCallback(
    (i: number, streak: number, lastType?: QuestionType) => {
      const w = byId.get(config.wordIds[i]) ?? pool[0];
      return buildQuestion(w, pool, pStats, config.types, { streak, lastType, adaptive: config.adaptive });
    },
    [byId, pool, pStats, config],
  );

  const [index, setIndex] = useState(0);
  const [q, setQ] = useState<Question>(() => build(0, 0));
  const [answer, setAnswer] = useState<AnswerState | null>(null);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [xp, setXp] = useState(0);
  const [hints, setHints] = useState(0);
  const [typed, setTyped] = useState("");
  const limitMs = q.input ? 35_000 : 20_000;
  const [remaining, setRemaining] = useState(limitMs);
  const history = useRef<AnswerRecord[]>([]);
  const startedAt = useRef(Date.now());
  const finished = useRef(false);
  const continueRef = useRef<HTMLButtonElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

  const submit = (response: string, timedOut = false) => {
    if (answer) return;
    const g = timedOut ? { correct: false, typo: false } : grade(q, response);
    const ns = g.correct ? Math.max(1, streak + 1) : Math.min(-1, streak - 1);
    const gained = g.correct ? Math.max(4, 10 + Math.min(ns - 1, 5) * 2 - hints * 3 - (g.typo ? 2 : 0)) : 0;
    setAnswer({ response, ...g, timedOut, gained, praise: PRAISE[Math.floor(Math.random() * PRAISE.length)] });
    setStreak(ns);
    if (g.correct) {
      setXp((x) => x + gained);
      setBestStreak((b) => Math.max(b, ns));
      playTone("correct");
      haptic(12);
    } else {
      playTone("wrong");
      haptic([20, 40, 20]);
    }
    history.current.push({ q, response, correct: g.correct, typo: g.typo, timedOut });
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    const h = history.current;
    if (!h.length) return onExit();
    const correct = h.filter((x) => x.correct).length;
    const durationSec = Math.round((Date.now() - startedAt.current) / 1000);
    void recordReviews(
      h.map((x) => ({ wordId: x.q.word.id, correct: x.correct, type: x.q.type })),
      "quiz",
      { total: h.length, correct, durationSec, bestStreak, xp, source: config.source, types: config.types },
    );
    playTone("complete");
    onFinish({ history: [...h], correct, total: h.length, durationSec, bestStreak, xp, config });
  };

  const next = () => {
    if (!answer) return;
    if (index + 1 >= total) return finish();
    setQ(build(index + 1, streak, q.type));
    setIndex(index + 1);
    setAnswer(null);
    setHints(0);
    setTyped("");
  };

  const submitRef = useRef(submit);
  const nextRef = useRef(next);
  submitRef.current = submit;
  nextRef.current = next;

  // Listening questions speak automatically
  useEffect(() => {
    if (!q.audio) return;
    const t = setTimeout(() => speak(q.answer), 350);
    return () => clearTimeout(t);
  }, [q.key, q.audio, q.answer]);

  // Timer
  useEffect(() => {
    if (!config.timer || answer) return;
    const start = Date.now();
    setRemaining(limitMs);
    const id = setInterval(() => {
      const left = limitMs - (Date.now() - start);
      if (left <= 0) {
        clearInterval(id);
        setRemaining(0);
        submitRef.current("", true);
      } else setRemaining(left);
    }, 200);
    return () => clearInterval(id);
  }, [q.key, answer, config.timer, limitMs]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (["INPUT", "TEXTAREA", "BUTTON"].includes(tag) && (e.key === "Enter" || e.key === " ")) return;
      if (answer) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          nextRef.current();
        }
        return;
      }
      if (tag === "INPUT" || !q.options.length) return;
      const k = e.key.toLowerCase();
      let idx = -1;
      if (/^[1-9]$/.test(k)) idx = Number(k) - 1;
      else if (q.type === "true-false" && (k === "t" || k === "f")) idx = k === "t" ? 0 : 1;
      else if (/^[a-d]$/.test(k)) idx = k.charCodeAt(0) - 97;
      if (idx >= 0 && idx < q.options.length) submitRef.current(q.options[idx]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q, answer]);

  useEffect(() => {
    if (!answer) return;
    continueRef.current?.focus({ preventScroll: true });
    feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [answer]);

  const exit = async () => {
    if (!history.current.length) return onExit();
    const ok = await confirm({
      title: "End this quiz?",
      message: `You've answered ${history.current.length} of ${total}. Your progress so far will be saved.`,
      confirmText: "End quiz",
    });
    if (ok) {
      if (answer || history.current.length) finish();
    }
  };

  const meta = TYPE_META[q.type];
  const blankFill = q.sentence ? findWordInSentence(q.word.example, q.word.word)?.match ?? q.answer : "";
  const reveal = (n: number) => {
    const a = q.answer;
    const k = Math.ceil(a.length * (n === 2 ? 0.34 : 0.6));
    return (a.slice(0, k) + a.slice(k).replace(/\S/g, "_")).split("").join(" ");
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-3">
        <IconButton icon={X} label="End quiz" onClick={() => void exit()} />
        <ProgressBar value={(index + (answer ? 1 : 0)) / total} className="h-2.5 flex-1" />
        <span className="min-w-[3.5rem] text-right text-sm font-bold tabular-nums">
          {index + 1}/{total}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold", "bg-black/[0.05] dark:bg-white/[0.07]")}>
          <meta.icon className="size-3.5" /> {q.label}
        </span>
        <div className="flex items-center gap-2">
          <AnimatePresence>
            {streak >= 2 && (
              <motion.span
                key="streak"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                className="inline-flex items-center gap-1 rounded-full bg-orange-500/12 px-2.5 py-1.5 text-[12px] font-extrabold text-orange-600 dark:text-orange-300"
              >
                <Flame className="size-3.5" /> {streak}×
              </motion.span>
            )}
          </AnimatePresence>
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-2.5 py-1.5 text-[12px] font-extrabold text-brand-700 tabular-nums dark:text-brand-200">
            <Zap className="size-3.5" /> {xp} XP
          </span>
          {config.timer && (
            <ProgressRing value={remaining / limitMs} size={38} stroke={4} className={cn(remaining < 5000 && !answer && "animate-pulse")}>
              <span className={cn("text-[11px] font-extrabold tabular-nums", remaining < 5000 && "text-rose-500")}>{Math.ceil(remaining / 1000)}</span>
            </ProgressRing>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={q.key}
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -28 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          <Card glass className="mt-4 px-5 py-7 text-center sm:px-8 sm:py-9">
            <p className="text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted">{q.prompt}</p>
            {q.audio ? (
              <div className="mt-5 flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => speak(q.answer)}
                  aria-label="Play the word"
                  className="sheen relative grid size-24 place-items-center rounded-full bg-linear-to-br from-teal-400 to-cyan-500 text-white shadow-xl shadow-teal-500/30 transition active:scale-90"
                >
                  <span className="absolute inset-0 animate-ping rounded-full bg-teal-400/25 [animation-duration:2s]" />
                  <Volume2 className="relative size-10" />
                </button>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => speak(q.answer)} className="h-9 rounded-full px-3 text-[13px] font-bold text-teal-700 hover:bg-teal-500/10 dark:text-teal-300">
                    Replay
                  </button>
                  <button
                    type="button"
                    onClick={() => speak(q.answer, 0.55)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold text-teal-700 hover:bg-teal-500/10 dark:text-teal-300"
                  >
                    <Snail className="size-4" /> Slow
                  </button>
                </div>
                {answer && <div className="text-3xl font-extrabold tracking-tight">{q.answer}</div>}
              </div>
            ) : q.sentence ? (
              <p className="mt-5 text-xl font-medium leading-relaxed sm:text-[26px]">
                {q.sentence.before}
                <span
                  className={cn(
                    "mx-1 inline-block min-w-[5.5rem] rounded-lg border-b-[3px] px-1.5 align-baseline transition-colors",
                    answer ? (answer.correct ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300") : "border-brand-500",
                  )}
                >
                  {answer ? blankFill : "\u00a0"}
                </span>
                {q.sentence.after}
              </p>
            ) : (
              <div className="mt-4 flex items-center justify-center gap-2">
                <h2
                  className={cn(
                    "break-words",
                    q.focusBangla
                      ? "font-bangla text-[28px] font-semibold leading-snug sm:text-4xl"
                      : q.focusLong
                        ? "text-lg font-semibold leading-relaxed sm:text-[22px]"
                        : "text-[40px] font-extrabold leading-tight tracking-tight sm:text-5xl",
                  )}
                >
                  {q.focus}
                </h2>
                {!q.focusBangla && !q.focusLong && <SpeakButton text={q.focus} />}
              </div>
            )}
            {q.secondary && (
              <p
                className={cn(
                  "mx-auto mt-5 max-w-lg rounded-2xl bg-black/[0.04] px-4 py-3 dark:bg-white/[0.06]",
                  q.secondaryBangla ? "font-bangla text-xl" : "text-[15px] leading-relaxed",
                )}
              >
                {q.secondary}
              </p>
            )}
          </Card>

          {q.input ? (
            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (typed.trim()) submit(typed);
              }}
            >
              <div
                className={cn(
                  "field flex h-16 items-center gap-3 px-4",
                  answer && (answer.correct ? "!border-emerald-500 !shadow-[0_0_0_4px_rgba(16,185,129,0.15)]" : "!border-rose-500 animate-shake"),
                )}
              >
                <SpellCheck className="size-5 shrink-0 text-muted" />
                <input
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  disabled={!!answer}
                  placeholder="Type the word…"
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="Your answer"
                  className="h-full min-w-0 flex-1 bg-transparent text-xl font-bold tracking-wide outline-none placeholder:font-medium placeholder:text-muted/60"
                />
              </div>
              {!answer && (
                <>
                  {hints > 0 && (
                    <p className="mt-3 text-center text-sm font-semibold text-brand-700 dark:text-brand-300">{hints === 1 ? q.hint : <span className="font-mono tracking-wider">{reveal(hints)}</span>}</p>
                  )}
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setHints((h) => Math.min(3, h + 1))}
                      disabled={hints >= 3}
                      className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold text-amber-600 transition hover:bg-amber-500/10 disabled:opacity-40 dark:text-amber-300"
                    >
                      <Lightbulb className="size-4" /> Hint {hints > 0 && `${hints}/3`}
                    </button>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => submit("")}>
                        Skip
                      </Button>
                      <Button type="submit" size="sm" disabled={!typed.trim()} iconRight={ArrowRight}>
                        Check
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </form>
          ) : (
            <div className={cn("mt-4 grid gap-2.5", q.type === "true-false" ? "grid-cols-2" : q.longOptions ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
              {q.options.map((opt, i) => {
                const isAnswer = opt === q.answer;
                const chosen = answer?.response === opt;
                const state = !answer ? "idle" : isAnswer ? "correct" : chosen ? "wrong" : "dim";
                return (
                  <button
                    key={`${q.key}-${i}`}
                    type="button"
                    disabled={!!answer}
                    onClick={() => submit(opt)}
                    className={cn(
                      "relative flex min-h-[62px] items-center gap-3 rounded-[20px] px-4 py-3 text-left font-semibold transition-all duration-200",
                      state === "idle" && "surface hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]",
                      state === "correct" && "animate-pop bg-linear-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30",
                      state === "wrong" && "animate-shake bg-linear-to-br from-rose-500 to-red-500 text-white shadow-lg shadow-rose-500/30",
                      state === "dim" && "surface opacity-45",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-xl text-[13px] font-extrabold",
                        state === "correct" || state === "wrong" ? "bg-white/25" : "bg-black/[0.05] text-muted dark:bg-white/10",
                      )}
                    >
                      {state === "correct" ? <Check className="size-4" strokeWidth={3} /> : state === "wrong" ? <X className="size-4" strokeWidth={3} /> : q.type === "true-false" ? (i === 0 ? <Check className="size-4" /> : <X className="size-4" />) : String.fromCharCode(65 + i)}
                    </span>
                    <span className={cn("flex-1", q.optionsBangla && "font-bangla text-[17px] font-medium", q.longOptions && "text-[14.5px] font-medium leading-snug")}>{opt}</span>
                    <kbd className={cn("hidden text-[11px] font-bold opacity-40 md:block", state !== "idle" && "invisible")}>{i + 1}</kbd>
                  </button>
                );
              })}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {answer && (
          <motion.div
            ref={feedbackRef}
            key={`fb-${q.key}`}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className={cn("mt-4 rounded-[26px] p-4 ring-1 sm:p-5", answer.correct ? "bg-emerald-500/10 ring-emerald-500/25" : "bg-rose-500/10 ring-rose-500/25")}
          >
            <div className="flex items-center gap-3">
              <IconTile icon={answer.timedOut ? Clock : answer.correct ? CircleCheck : CircleX} tone={answer.correct ? "emerald" : "rose"} />
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-extrabold">
                  {answer.timedOut ? "Time's up!" : answer.correct ? (answer.typo ? "Correct — watch the spelling" : answer.praise) : "Not quite"}
                </div>
                {(!answer.correct || answer.typo) && (
                  <div className={cn("text-sm", hasBangla(q.answer) && "font-bangla text-[15px]")}>
                    {answer.typo ? "Spelling: " : "Answer: "}
                    <b>{q.answer}</b>
                  </div>
                )}
              </div>
              {answer.correct && <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-300">+{answer.gained} XP</span>}
            </div>
            <div className="mt-3 rounded-2xl bg-white/65 p-3.5 dark:bg-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold">{q.word.word}</span>
                <PosBadge pos={q.word.partOfSpeech} />
                <SpeakButton text={q.word.word} size="sm" className="ml-auto" />
              </div>
              {q.word.banglaMeaning && <p className="font-bangla text-[16px]">{q.word.banglaMeaning}</p>}
              {q.word.englishMeaning && <p className="mt-0.5 text-[13.5px] text-muted">{q.word.englishMeaning}</p>}
              {q.note && <p className="mt-2 text-[13px] font-semibold text-brand-700 dark:text-brand-300">{q.note}</p>}
              {!answer.correct && q.word.mnemonic && (
                <p className="mt-2 flex gap-1.5 text-[13px] font-medium text-amber-700 dark:text-amber-300">
                  <Lightbulb className="mt-0.5 size-3.5 shrink-0" /> {q.word.mnemonic}
                </p>
              )}
            </div>
            <Button ref={continueRef} size="lg" className="mt-3 w-full" iconRight={ArrowRight} onClick={next}>
              {index + 1 >= total ? "See results" : "Continue"}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      <p className="mt-4 hidden text-center text-xs text-muted md:block">
        Keys: <b>1–4</b> answer · <b>T/F</b> true/false · <b>Enter</b> continue
      </p>
    </div>
  );
}

/* --------------------------------- Results -------------------------------- */

function QuizResults({ result, onRetry, onNew }: { result: QuizResult; onRetry: (ids: number[]) => void; onNew: () => void }) {
  const { openWord } = useWordSheet();
  const pct = result.total ? Math.round((result.correct / result.total) * 100) : 0;
  const g =
    pct === 100
      ? { title: "Perfect score!", text: "Flawless — every single answer right.", icon: Crown, tone: "amber" as Tone }
      : pct >= 80
        ? { title: "Outstanding!", text: "You really know these words.", icon: Trophy, tone: "emerald" as Tone }
        : pct >= 60
          ? { title: "Great effort!", text: "Solid progress — keep the momentum.", icon: Medal, tone: "sky" as Tone }
          : pct >= 40
            ? { title: "Keep going!", text: "Review the mistakes below and try again.", icon: TrendingUp, tone: "violet" as Tone }
            : { title: "Practice makes perfect", text: "Flashcards can help these words stick.", icon: Target, tone: "rose" as Tone };
  const mistakes = result.history.filter((h) => !h.correct);
  const mistakeIds = [...new Set(mistakes.map((m) => m.q.word.id))];

  return (
    <div className="mx-auto max-w-3xl">
      <Card glass className="relative animate-pop overflow-hidden px-5 py-8 text-center sm:px-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-linear-to-b from-brand-500/15 to-transparent" />
        <div className="relative">
          <ProgressRing value={pct / 100} size={156} stroke={13} className="mx-auto">
            <div className="leading-none">
              <div className="text-[40px] font-extrabold tabular-nums">{pct}%</div>
              <div className="mt-1.5 text-xs font-semibold text-muted">
                {result.correct}/{result.total} correct
              </div>
            </div>
          </ProgressRing>
          <div className="mt-5 flex items-center justify-center gap-2.5">
            <IconTile icon={g.icon} tone={g.tone} size="sm" />
            <h2 className="text-2xl font-extrabold tracking-tight">{g.title}</h2>
          </div>
          <p className="mt-1 text-sm text-muted">{g.text}</p>
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "XP earned", value: `+${result.xp}`, icon: Zap, cls: "text-brand-600 dark:text-brand-300" },
              { label: "Best streak", value: `${result.bestStreak}×`, icon: Flame, cls: "text-orange-500" },
              { label: "Time", value: fmtTime(result.durationSec), icon: Clock, cls: "text-sky-500" },
              { label: "Avg / question", value: `${Math.round(result.durationSec / Math.max(1, result.total))}s`, icon: Timer, cls: "text-emerald-500" },
            ].map((s) => (
              <div key={s.label} className="surface rounded-2xl px-2 py-3">
                <s.icon className={cn("mx-auto size-5", s.cls)} />
                <div className="mt-1 text-lg font-extrabold tabular-nums">{s.value}</div>
                <div className="text-[11px] font-medium text-muted">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {mistakeIds.length > 0 && (
              <Button size="lg" icon={RotateCcw} onClick={() => onRetry(mistakeIds)}>
                Retry {mistakeIds.length} missed
              </Button>
            )}
            <Button size="lg" variant={mistakeIds.length ? "secondary" : "primary"} icon={RefreshCw} onClick={onNew}>
              New quiz
            </Button>
            <Link href="/" className="contents">
              <Button size="lg" variant="ghost" icon={House}>
                Home
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      <SectionTitle title="Review answers" className="mt-7" action={<span className="text-[13px] font-semibold text-muted">{mistakes.length} to review</span>} />
      <div className="stagger space-y-2">
        {[...mistakes, ...result.history.filter((h) => h.correct)].map((h, i) => (
          <button
            key={`${h.q.key}-${i}`}
            type="button"
            onClick={() => openWord(h.q.word.id)}
            className="surface flex w-full items-start gap-3 rounded-[20px] p-3.5 text-left transition hover:-translate-y-0.5"
          >
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", h.correct ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : "bg-rose-500/15 text-rose-600 dark:text-rose-300")}>
              {h.correct ? <Check className="size-4" strokeWidth={3} /> : <X className="size-4" strokeWidth={3} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="font-bold">{h.q.word.word}</span>
                <span className="text-[11px] font-semibold text-muted">{h.q.label}</span>
              </div>
              {!h.correct ? (
                <div className="mt-0.5 text-[13px]">
                  <span className={cn("text-rose-600 line-through dark:text-rose-400", hasBangla(h.response) && "font-bangla")}>
                    {h.response || (h.timedOut ? "No answer (time up)" : "Skipped")}
                  </span>
                  <span className="mx-1.5 text-muted">→</span>
                  <span className={cn("font-semibold text-emerald-600 dark:text-emerald-400", hasBangla(h.q.answer) && "font-bangla")}>{h.q.answer}</span>
                </div>
              ) : (
                <div className={cn("mt-0.5 line-clamp-1 text-[13px] text-muted", hasBangla(h.q.word.banglaMeaning) && "font-bangla")}>
                  {h.q.word.banglaMeaning || h.q.word.englishMeaning}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------- Page ---------------------------------- */

function QuizInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { status, words } = useVocab();
  const { settings } = useSettings();
  const [mode, setMode] = useState<"quiz" | "match">(params.get("mode") === "match" ? "match" : "quiz");
  const idsHandled = useRef(false);
  const [phase, setPhase] = useState<"setup" | "play" | "result">("setup");
  const [config, setConfig] = useState<QuizConfig | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [round, setRound] = useState(0);
  const initialSource = (params.get("source") as SourceKey | null) ?? undefined;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [phase, round, mode]);

  // Start directly from a list of word ids (e.g. from the daily recap).
  useEffect(() => {
    const raw = params.get("ids");
    if (!raw || idsHandled.current || status !== "ready") return;
    idsHandled.current = true;
    const set = new Set(raw.split(",").map(Number));
    const pool = words.filter((w) => set.has(w.id));
    router.replace("/quiz");
    if (!pool.length || words.length < 4) return;
    const stats = poolStats(words);
    const enabled = (settings.quizTypes.length ? settings.quizTypes : QUESTION_TYPES.map((t) => t.id)).filter((t) =>
      pool.some((w) => eligible(t, w, stats)),
    );
    if (!enabled.length) return;
    setConfig({
      wordIds: planQuiz(pool, Math.min(20, Math.max(5, pool.length))),
      types: enabled,
      timer: settings.quizTimer,
      adaptive: settings.quizAdaptive,
      source: "all",
    });
    setRound((r) => r + 1);
    setPhase("play");
  }, [params, status, words, settings, router]);

  const modeSwitch = (
    <Segmented
      className="mb-5 max-w-sm animate-fade-up"
      value={mode}
      onChange={setMode}
      options={[
        { value: "quiz", label: "Smart quiz", icon: Brain },
        { value: "match", label: "Match pairs", icon: Combine },
      ]}
    />
  );

  if (status === "loading") return <PageSkeleton />;

  if (phase === "play" && config)
    return (
      <QuizPlayer
        key={round}
        config={config}
        onFinish={(r) => {
          setResult(r);
          setPhase("result");
        }}
        onExit={() => setPhase("setup")}
      />
    );

  if (phase === "result" && result)
    return (
      <QuizResults
        result={result}
        onRetry={(ids) => {
          setConfig({ ...result.config, wordIds: shuffle(ids) });
          setRound((r) => r + 1);
          setPhase("play");
        }}
        onNew={() => setPhase("setup")}
      />
    );

  if (mode === "match") return <MatchGame topSlot={modeSwitch} />;

  return (
    <QuizSetup
      topSlot={modeSwitch}
      initialSource={initialSource}
      onStart={(c) => {
        setConfig(c);
        setRound((r) => r + 1);
        setPhase("play");
      }}
    />
  );
}

export default function QuizPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <QuizInner />
    </Suspense>
  );
}
