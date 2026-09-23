"use client";

import {
  ArrowRight,
  BookOpen,
  Brain,
  CalendarCheck,
  ChartColumn,
  CirclePlus,
  Clock,
  Database,
  Flame,
  GraduationCap,
  Languages,
  Layers,
  Moon,
  RefreshCw,
  Repeat,
  RotateCcw,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FavoriteButton, SpeakButton, letterTone } from "@/components/word-bits";
import { openRecap } from "@/components/daily-recap";
import { InstallBanner } from "@/components/install-app";
import { usePwa } from "@/lib/pwa";
import { Button, Card, EmptyState, IconTile, PageSkeleton, ProgressBar, ProgressRing, SectionTitle, type IconType, type Tone } from "@/components/ui";
import { STATUS_META, accuracyOf, addDays, greeting, isWeak, localDay } from "@/lib/learning";
import { useSettings } from "@/lib/settings";
import { useVocab, useVocabStats, useWordSheet } from "@/lib/store";
import type { Word } from "@/lib/types";
import { cn, plural } from "@/lib/utils";

function weekday(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short" });
}

function WordOfDay({ w }: { w: Word }) {
  const { openWord } = useWordSheet();
  return (
    <div className="sheen relative h-full overflow-hidden rounded-[30px] brand-gradient p-6 text-white shadow-2xl shadow-brand-500/30 sm:p-7">
      <div className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.28),transparent_65%)]" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 size-72 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.16),transparent_65%)]" />
      <div className="relative flex h-full flex-col">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[12px] font-bold ring-1 ring-white/25">
            <Sparkles className="size-3.5" /> Word of the day
          </span>
          <div className="flex items-center gap-1 rounded-full bg-white/15 p-0.5 ring-1 ring-white/20 [&_button]:text-white [&_button:hover]:bg-white/15">
            <SpeakButton text={w.word} size="sm" />
            <FavoriteButton id={w.id} active={w.isFavorite} size="sm" className={w.isFavorite ? "!text-amber-300" : ""} />
          </div>
        </div>
        <h2 className="mt-5 break-words text-[40px] font-extrabold leading-none tracking-tight sm:text-[52px]">{w.word}</h2>
        <p className="mt-2 text-sm font-medium text-white/80">
          {[w.pronunciation, w.partOfSpeech].filter(Boolean).join("  ·  ")}
        </p>
        {w.banglaMeaning && <p className="mt-4 font-bangla text-[22px] font-medium leading-snug">{w.banglaMeaning}</p>}
        {w.englishMeaning && <p className="mt-1.5 line-clamp-2 text-[15px] leading-relaxed text-white/85">{w.englishMeaning}</p>}
        <div className="mt-6 flex flex-wrap gap-2 pt-1 lg:mt-auto">
          <button
            type="button"
            onClick={() => openWord(w.id)}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-white px-5 text-sm font-bold text-brand-700 shadow-lg transition active:scale-95"
          >
            Explore word <ArrowRight className="size-4" />
          </button>
          <Link
            href="/flashcards"
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-white/20 px-5 text-sm font-bold ring-1 ring-white/25 transition hover:bg-white/25 active:scale-95"
          >
            <Layers className="size-4" /> Practice
          </Link>
        </div>
      </div>
    </div>
  );
}

function Welcome() {
  const { dataAction } = useVocab();
  const [busy, setBusy] = useState(false);
  const features: { icon: IconType; tone: Tone; title: string; text: string }[] = [
    { icon: Languages, tone: "emerald", title: "Bangla + English", text: "Meanings, synonyms, antonyms & examples" },
    { icon: Brain, tone: "amber", title: "Smart quizzes", text: "10 adaptive question types" },
    { icon: Layers, tone: "pink", title: "Flashcards", text: "Flip, swipe and remember" },
    { icon: Repeat, tone: "violet", title: "Spaced repetition", text: "Review at the perfect moment" },
  ];
  return (
    <div className="space-y-5">
      <div className="sheen relative overflow-hidden rounded-[32px] brand-gradient p-7 text-white shadow-2xl shadow-brand-500/30 sm:p-10">
        <div className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.3),transparent_65%)]" />
        <div className="relative max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[12px] font-bold ring-1 ring-white/25">
            <Sparkles className="size-3.5" /> Welcome to VocaBera
          </span>
          <h1 className="mt-5 text-[34px] font-extrabold leading-[1.05] tracking-tight sm:text-5xl">Your words. Mastered, beautifully.</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-white/85 sm:text-base">
            Build a personal vocabulary with Bangla meanings, then lock it in with smart quizzes, flashcards and spaced repetition.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await dataAction("seed");
                setBusy(false);
              }}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-5 text-sm font-bold text-brand-700 shadow-lg transition active:scale-95 disabled:opacity-70"
            >
              {busy ? <RefreshCw className="size-4 animate-spin" /> : <Database className="size-4" />} Load 32 sample words
            </button>
            <Link
              href="/add"
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white/20 px-5 text-sm font-bold ring-1 ring-white/25 transition hover:bg-white/25 active:scale-95"
            >
              <CirclePlus className="size-4" /> Add your first word
            </Link>
          </div>
        </div>
      </div>
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        {features.map((f) => (
          <Card key={f.title} className="p-4">
            <IconTile icon={f.icon} tone={f.tone} />
            <h3 className="mt-3 font-bold">{f.title}</h3>
            <p className="mt-0.5 text-[13px] text-muted">{f.text}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const { words, activity, status, refresh } = useVocab();
  const stats = useVocabStats();
  const { settings } = useSettings();
  const { openWord } = useWordSheet();
  const { online } = usePwa();
  const today = localDay();

  const wotd = useMemo(() => {
    if (!words.length) return null;
    const sorted = [...words].sort((a, b) => a.id - b.id);
    let h = 0;
    for (const c of today) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return sorted[h % sorted.length];
  }, [words, today]);

  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
    const map = new Map(activity.map((a) => [a.day, a]));
    return days.map((d) => ({ day: d, reviews: map.get(d)?.reviews ?? 0, correct: map.get(d)?.correct ?? 0 }));
  }, [activity, today]);

  const weak = useMemo(
    () => words.filter(isWeak).sort((a, b) => b.timesWrong - a.timesWrong || a.mastery - b.mastery).slice(0, 5),
    [words],
  );

  if (status === "loading") return <PageSkeleton />;
  if (status === "error" && !words.length)
    return (
      <EmptyState
        icon={RefreshCw}
        tone="rose"
        title={online ? "Couldn't reach the server" : "You're offline"}
        text={online ? "Check your connection and try again." : "Connect once to load your words — after that VocaBera works offline."}
      >
        <Button icon={RefreshCw} onClick={() => void refresh()}>
          Retry
        </Button>
      </EmptyState>
    );

  const goal = settings.dailyGoal;
  const todayReviews = stats.today?.reviews ?? 0;
  const goalDone = todayReviews >= goal;
  const weekTotal = week.reduce((s, d) => s + d.reviews, 0);
  const weekMax = Math.max(goal, ...week.map((d) => d.reviews), 1);

  const header = (
    <div className="mb-5 flex animate-fade-up items-end justify-between gap-3">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-muted">
          {new Date().getHours() >= 6 && new Date().getHours() < 18 ? (
            <Sun className="size-4 text-amber-500" />
          ) : (
            <Moon className="size-4 text-indigo-400" />
          )}
          {greeting()}
        </p>
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight sm:text-[32px]">
          Let&apos;s grow your <span className="text-gradient">vocabulary</span>
        </h1>
      </div>
      <span className="surface hidden h-9 items-center rounded-full px-3.5 text-[13px] font-semibold text-muted sm:inline-flex">
        {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
      </span>
    </div>
  );

  if (!words.length || !wotd)
    return (
      <>
        {header}
        <InstallBanner />
        <Welcome />
      </>
    );

  const tiles: { label: string; value: string | number; icon: IconType; tone: Tone; href: string }[] = [
    { label: "Total words", value: stats.total, icon: BookOpen, tone: "sky", href: "/words" },
    { label: "Mastered", value: stats.mastered, icon: Trophy, tone: "emerald", href: "/words?status=mastered" },
    { label: "Due for review", value: stats.due, icon: Clock, tone: "amber", href: "/flashcards?deck=due" },
    { label: "Accuracy", value: stats.totalReviews ? `${stats.accuracy}%` : "—", icon: Target, tone: "pink", href: "/quiz" },
  ];

  const actions: { label: string; text: string; icon: IconType; tone: Tone; href: string; tint: string }[] = [
    { label: "Add word", text: "Grow your list", icon: CirclePlus, tone: "emerald", href: "/add", tint: "from-emerald-500/14 to-teal-500/5 ring-emerald-500/15" },
    { label: "Smart quiz", text: "Adaptive practice", icon: Brain, tone: "amber", href: "/quiz", tint: "from-amber-500/14 to-orange-500/5 ring-amber-500/15" },
    { label: "Flashcards", text: "Flip & swipe", icon: Layers, tone: "pink", href: "/flashcards", tint: "from-pink-500/14 to-rose-500/5 ring-pink-500/15" },
    {
      label: "Review due",
      text: stats.due ? `${plural(stats.due, "word")} waiting` : "All caught up",
      icon: RotateCcw,
      tone: "violet",
      href: "/flashcards?deck=due",
      tint: "from-violet-500/14 to-fuchsia-500/5 ring-violet-500/15",
    },
  ];

  const segments = (["new", "learning", "reviewing", "mastered"] as const).map((k) => ({
    key: k,
    ...STATUS_META[k],
    value: stats[k],
  }));

  return (
    <>
      {header}
      <InstallBanner />
      <div className="stagger grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <WordOfDay w={wotd} />
        </div>

        <Card className="flex flex-col p-5 lg:col-span-4">
          <div className="flex items-center gap-4">
            <ProgressRing value={todayReviews / goal} size={100} stroke={10}>
              <div className="text-center leading-none">
                <div className="text-[26px] font-extrabold tabular-nums">{todayReviews}</div>
                <div className="mt-1 text-[11px] font-semibold text-muted">of {goal}</div>
              </div>
            </ProgressRing>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Daily goal</div>
              <div className="mt-0.5 text-lg font-bold leading-snug">
                {goalDone ? "Goal smashed!" : `${goal - todayReviews} reviews to go`}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-orange-600 dark:text-orange-300">
                <Flame className="size-4" /> {stats.streak.current}-day streak
              </div>
              <div className="text-xs text-muted">Best: {plural(stats.streak.best, "day")}</div>
            </div>
          </div>
          <div className="mt-4 rounded-2xl bg-black/[0.035] p-3.5 dark:bg-white/[0.05] lg:mt-auto">
            <div className="mb-2 flex items-center justify-between text-[13px]">
              <span className="flex items-center gap-1.5 font-bold">
                <GraduationCap className="size-4 text-brand-500" /> Level {stats.level.level}
              </span>
              <span className="font-semibold tabular-nums text-muted">
                {stats.level.current}/{stats.level.needed} XP
              </span>
            </div>
            <ProgressBar value={stats.level.progress} />
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:col-span-12">
          {tiles.map((t) => (
            <Link key={t.label} href={t.href} className="surface rounded-[24px] p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]">
              <IconTile icon={t.icon} tone={t.tone} />
              <div className="mt-3 text-[26px] font-extrabold leading-none tabular-nums">{t.value}</div>
              <div className="mt-1 text-[13px] font-medium text-muted">{t.label}</div>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-12">
          <Link
            href="/progress"
            className="group relative flex items-center gap-4 overflow-hidden rounded-[24px] bg-linear-to-br from-violet-500/14 to-fuchsia-500/5 p-4 ring-1 ring-violet-500/15 transition hover:-translate-y-0.5 active:scale-[0.99]"
          >
            <IconTile icon={ChartColumn} tone="violet" size="lg" />
            <div className="min-w-0 flex-1">
              <div className="font-bold">Progress & insights</div>
              <div className="truncate text-[12.5px] text-muted">Charts, study calendar, forecasts & achievements</div>
            </div>
            <ArrowRight className="size-4 text-muted transition group-hover:translate-x-0.5" />
          </Link>
          <button
            type="button"
            onClick={openRecap}
            className="group relative flex items-center gap-4 overflow-hidden rounded-[24px] bg-linear-to-br from-teal-500/14 to-cyan-500/5 p-4 text-left ring-1 ring-teal-500/15 transition hover:-translate-y-0.5 active:scale-[0.99]"
          >
            <IconTile icon={CalendarCheck} tone="teal" size="lg" />
            <div className="min-w-0 flex-1">
              <div className="font-bold">Last session recap</div>
              <div className="truncate text-[12.5px] text-muted">Words you learned & ones to practice again</div>
            </div>
            <ArrowRight className="size-4 text-muted transition group-hover:translate-x-0.5" />
          </button>
        </div>

        <div className="lg:col-span-5">
          <SectionTitle title="Quick actions" />
          <div className="grid grid-cols-2 gap-3">
            {actions.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className={cn(
                  "group relative overflow-hidden rounded-[24px] bg-linear-to-br p-4 ring-1 transition duration-200 hover:-translate-y-0.5 active:scale-[0.98]",
                  a.tint,
                )}
              >
                <IconTile icon={a.icon} tone={a.tone} />
                <div className="mt-3 font-bold">{a.label}</div>
                <div className="text-[12.5px] text-muted">{a.text}</div>
                <ArrowRight className="absolute right-4 top-4 size-4 text-muted transition group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7">
          <SectionTitle
            title="This week"
            action={
              <span className="flex items-center gap-1 text-[13px] font-semibold text-muted">
                <TrendingUp className="size-4 text-emerald-500" /> {plural(weekTotal, "review")}
              </span>
            }
          />
          <Card className="p-5">
            <div className="relative flex h-40 items-end gap-2 sm:gap-3">
              <div
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-brand-500/40"
                style={{ bottom: `calc(${(goal / weekMax) * 100}% * 0.78 + 22px)` }}
                title="Daily goal"
              />
              {week.map((d) => {
                const isToday = d.day === today;
                return (
                  <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                    <span className="text-[11px] font-bold tabular-nums text-muted">{d.reviews || ""}</span>
                    <div className="flex h-[78%] w-full items-end">
                      <div
                        className={cn(
                          "w-full rounded-xl transition-[height] duration-700 ease-out",
                          isToday ? "brand-gradient shadow-lg shadow-brand-500/30" : "bg-brand-500/20 dark:bg-brand-400/20",
                        )}
                        style={{ height: `${Math.max(5, (d.reviews / weekMax) * 100)}%` }}
                      />
                    </div>
                    <span className={cn("text-[11px] font-semibold", isToday ? "text-brand-600 dark:text-brand-300" : "text-muted")}>
                      {weekday(d.day)}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-5">
          <SectionTitle
            title="Mastery"
            action={
              <Link href="/progress" className="flex items-center gap-1 text-[13px] font-semibold text-brand-600 dark:text-brand-300">
                Insights <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <Card className="p-5">
            <div className="flex h-3.5 gap-1 overflow-hidden rounded-full">
              {segments.map((s) =>
                s.value ? <div key={s.key} className={cn("h-full rounded-full", s.dot)} style={{ width: `${(s.value / stats.total) * 100}%` }} /> : null,
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {segments.map((s) => (
                <Link key={s.key} href={`/words?status=${s.key}`} className={cn("flex items-center gap-2 rounded-2xl px-3 py-2.5 transition hover:brightness-95", s.bg)}>
                  <span className={cn("size-2.5 rounded-full", s.dot)} />
                  <span className="text-[13px] font-semibold">{s.label}</span>
                  <span className={cn("ml-auto text-sm font-extrabold tabular-nums", s.text)}>{s.value}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>

        <div className="min-w-0 lg:col-span-7">
          <SectionTitle
            title="Recently added"
            action={
              <Link href="/words" className="flex items-center gap-1 text-[13px] font-semibold text-brand-600 dark:text-brand-300">
                View all <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {words.slice(0, 10).map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => openWord(w.id)}
                className="surface w-44 shrink-0 snap-start rounded-[22px] p-4 text-left transition hover:-translate-y-0.5 active:scale-[0.98]"
              >
                <span className={cn("grid size-9 place-items-center rounded-xl text-sm font-extrabold", letterTone(w.word))}>{w.word[0]?.toUpperCase()}</span>
                <div className="mt-3 truncate font-bold">{w.word}</div>
                <div className="line-clamp-1 font-bangla text-[14px] text-muted">{w.banglaMeaning || w.englishMeaning}</div>
              </button>
            ))}
          </div>
        </div>

        {weak.length > 0 && (
          <div className="lg:col-span-12">
            <SectionTitle
              title="Needs attention"
              action={
                <Link href="/quiz?source=weak" className="flex items-center gap-1 text-[13px] font-semibold text-brand-600 dark:text-brand-300">
                  <Zap className="size-3.5" /> Practice these
                </Link>
              }
            />
            <Card className="grid gap-1 p-2 md:grid-cols-2 lg:grid-cols-3">
              {weak.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => openWord(w.id)}
                  className="flex items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-rose-500/12 text-sm font-extrabold text-rose-600 dark:text-rose-300">
                    {accuracyOf(w) ?? 0}%
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{w.word}</span>
                    <span className="block truncate font-bangla text-[13px] text-muted">{w.banglaMeaning || w.englishMeaning}</span>
                  </span>
                  <span className="text-xs font-semibold text-rose-500">{w.timesWrong}× missed</span>
                </button>
              ))}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
