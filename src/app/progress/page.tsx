"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BookOpen,
  Brain,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  Clock,
  Crown,
  Flame,
  Gauge,
  Lock,
  Minus,
  Plus,
  Sparkles,
  Sunrise,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { openRecap } from "@/components/daily-recap";
import { Button, Card, EmptyState, IconTile, PageHeader, PageSkeleton, ProgressBar, SectionTitle, Segmented, type IconType, type Tone } from "@/components/ui";
import { letterTone } from "@/components/word-bits";
import { buildAchievementCtx, evaluateAchievements } from "@/lib/achievements";
import { accuracyOf, addDays, localDay } from "@/lib/learning";
import { QUESTION_TYPES } from "@/lib/quiz-engine";
import { useSettings } from "@/lib/settings";
import { useVocab, useVocabStats, useWordSheet } from "@/lib/store";
import type { DailyActivity, ProgressData } from "@/lib/types";
import { cn, plural } from "@/lib/utils";

type Range = 7 | 30 | 90;
const TYPE_LABEL: Record<string, string> = { ...Object.fromEntries(QUESTION_TYPES.map((t) => [t.id, t.label])), match: "Match pairs" };

const parseDay = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, m - 1, dd);
};
const shortDate = (d: string) => parseDay(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtHour = (h: number) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;

function sumRange(map: Map<string, DailyActivity>, days: string[]) {
  const t = { reviews: 0, correct: 0, wordsAdded: 0, quizzes: 0, active: 0 };
  for (const d of days) {
    const a = map.get(d);
    if (!a) continue;
    t.reviews += a.reviews;
    t.correct += a.correct;
    t.wordsAdded += a.wordsAdded;
    t.quizzes += a.quizzes;
    if (a.reviews || a.wordsAdded) t.active++;
  }
  return { ...t, accuracy: t.reviews ? Math.round((t.correct / t.reviews) * 100) : 0, xp: t.correct * 10 + (t.reviews - t.correct) * 2 + t.wordsAdded * 5 + t.quizzes * 20 };
}

function Delta({ now, prev, suffix = "" }: { now: number; prev: number; suffix?: string }) {
  const diff = now - prev;
  if (!prev && !now) return <span className="text-[11px] font-semibold text-muted">—</span>;
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-bold", diff > 0 ? "text-emerald-600 dark:text-emerald-400" : diff < 0 ? "text-rose-500" : "text-muted")}>
      <Icon className="size-3" />
      {diff > 0 ? "+" : ""}
      {diff}
      {suffix}
    </span>
  );
}

function Heatmap({ map, goal }: { map: Map<string, DailyActivity>; goal: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const today = localDay();
  const weeks = 20;
  const firstSunday = addDays(today, -weeks * 7 - parseDay(today).getDay());
  const cols: string[][] = [];
  for (let w = 0; w < weeks + 1; w++) cols.push(Array.from({ length: 7 }, (_, d) => addDays(firstSunday, w * 7 + d)));
  useEffect(() => {
    if (ref.current) ref.current.scrollLeft = ref.current.scrollWidth;
  }, []);
  const level = (n: number) => (n === 0 ? 0 : n < goal * 0.25 ? 1 : n < goal * 0.6 ? 2 : n < goal ? 3 : 4);
  const cls = ["bg-black/[0.06] dark:bg-white/[0.07]", "bg-brand-500/25", "bg-brand-500/45", "bg-brand-500/70", "brand-gradient"];
  return (
    <div>
      <div ref={ref} className="overflow-x-auto pb-1">
        <div className="inline-flex gap-[4px]">
          <div className="mr-1 flex flex-col gap-[4px] pt-5 text-[10px] font-semibold text-muted">
            {["", "Mon", "", "Wed", "", "Fri", ""].map((l, i) => (
              <span key={i} className="h-[14px] leading-[14px]">
                {l}
              </span>
            ))}
          </div>
          {cols.map((col, ci) => {
            const month = parseDay(col[0]).getMonth();
            const showMonth = ci === 0 || parseDay(cols[ci - 1][0]).getMonth() !== month;
            return (
              <div key={ci} className="flex flex-col gap-[4px]">
                <span className="h-4 whitespace-nowrap text-[10px] font-semibold text-muted">{showMonth ? parseDay(col[0]).toLocaleDateString(undefined, { month: "short" }) : ""}</span>
                {col.map((d) => {
                  const n = map.get(d)?.reviews ?? 0;
                  const future = d > today;
                  return (
                    <span
                      key={d}
                      title={`${shortDate(d)} · ${plural(n, "review")}`}
                      className={cn("size-[14px] rounded-[4px]", future ? "opacity-0" : cls[level(n)], d === today && "ring-2 ring-brand-500/60 ring-offset-1 ring-offset-[var(--bg)]")}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] font-semibold text-muted">
        Less {cls.map((c, i) => <span key={i} className={cn("size-3 rounded-[3px]", c)} />)} More
      </div>
    </div>
  );
}

function Donut({ segments, total }: { segments: { value: number; color: string; label: string }[]; total: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative size-40 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="11" className="stroke-black/[0.06] dark:stroke-white/10" />
        {total > 0 &&
          segments.map((s) => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={s.label}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="11"
                strokeDasharray={`${Math.max(0, len - 1.2)} ${c}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray .8s ease" }}
              />
            );
            offset += len;
            return s.value ? el : null;
          })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        <div>
          <div className="text-3xl font-extrabold tabular-nums">{total}</div>
          <div className="mt-1 text-[11px] font-semibold text-muted">words</div>
        </div>
      </div>
    </div>
  );
}

export default function ProgressPage() {
  const { words, activity, sessions: storeSessions, status } = useVocab();
  const stats = useVocabStats();
  const { settings } = useSettings();
  const { openWord } = useWordSheet();
  const [range, setRange] = useState<Range>(30);
  const [extra, setExtra] = useState<ProgressData | null>(null);
  const today = localDay();

  useEffect(() => {
    fetch(`/api/progress?tz=${new Date().getTimezoneOffset()}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<ProgressData>) : null))
      .then(setExtra)
      .catch(() => setExtra(null));
  }, [storeSessions.length]);

  const actMap = useMemo(() => new Map(activity.map((a) => [a.day, a])), [activity]);
  const days = useMemo(() => Array.from({ length: range }, (_, i) => addDays(today, i - range + 1)), [range, today]);
  const prevDays = useMemo(() => days.map((d) => addDays(d, -range)), [days, range]);
  const cur = useMemo(() => sumRange(actMap, days), [actMap, days]);
  const prev = useMemo(() => sumRange(actMap, prevDays), [actMap, prevDays]);

  const series = days.map((d) => {
    const a = actMap.get(d);
    return { day: d, reviews: a?.reviews ?? 0, acc: a?.reviews ? (a.correct / a.reviews) * 100 : null };
  });
  const maxReviews = Math.max(settings.dailyGoal, ...series.map((s) => s.reviews), 1);

  const growth = useMemo(() => {
    const created = words.map((w) => localDay(new Date(w.createdAt))).sort();
    let idx = 0;
    const before = created.filter((d) => d < days[0]).length;
    idx = before;
    const pts = days.map((d) => {
      while (idx < created.length && created[idx] <= d) idx++;
      return idx;
    });
    return { pts, added: pts[pts.length - 1] - before, start: before };
  }, [words, days]);

  const forecast = useMemo(() => {
    const out = Array.from({ length: 7 }, (_, i) => ({ day: addDays(today, i), count: 0 }));
    for (const w of words) {
      if (!w.timesReviewed || !w.nextReviewAt) continue;
      const d = localDay(new Date(w.nextReviewAt));
      if (d <= today) out[0].count++;
      else {
        const i = out.findIndex((o) => o.day === d);
        if (i > 0) out[i].count++;
      }
    }
    return out;
  }, [words, today]);
  const maxForecast = Math.max(1, ...forecast.map((f) => f.count));

  const sessions = (extra?.sessions ?? storeSessions).slice(0, 20).reverse();
  const avgScore = sessions.length ? Math.round(sessions.reduce((s, x) => s + (x.total ? x.correct / x.total : 0), 0) / sessions.length * 100) : 0;
  const bestScore = sessions.reduce((m, x) => Math.max(m, x.total ? Math.round((x.correct / x.total) * 100) : 0), 0);
  const avgSec = sessions.length ? Math.round(sessions.reduce((s, x) => s + x.durationSec / Math.max(1, x.total), 0) / sessions.length) : 0;

  const typeStats = (extra?.typeStats ?? []).map((t) => ({ ...t, acc: t.total ? Math.round((t.correct / t.total) * 100) : 0 })).sort((a, b) => b.total - a.total);
  const hours = extra?.hours ?? Array(24).fill(0);
  const maxHour = Math.max(1, ...hours);
  const peak = hours.indexOf(Math.max(...hours));

  const hardest = useMemo(
    () => words.filter((w) => w.timesReviewed >= 2).sort((a, b) => (accuracyOf(a) ?? 0) - (accuracyOf(b) ?? 0) || b.timesWrong - a.timesWrong).slice(0, 5),
    [words],
  );
  const strongest = useMemo(
    () => words.filter((w) => w.timesReviewed >= 2).sort((a, b) => b.mastery - a.mastery || (accuracyOf(b) ?? 0) - (accuracyOf(a) ?? 0)).slice(0, 5),
    [words],
  );
  const pos = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of words) m.set(w.partOfSpeech || "other", (m.get(w.partOfSpeech || "other") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [words]);

  const achievements = useMemo(
    () =>
      evaluateAchievements(
        buildAchievementCtx(words, activity, extra?.sessions ?? storeSessions, {
          mastered: stats.mastered,
          streakBest: stats.streak.best,
          level: stats.level.level,
          quizzes: stats.quizzes,
        }),
      ).sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || b.progress - a.progress),
    [words, activity, extra, storeSessions, stats],
  );
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  if (status === "loading") return <PageSkeleton />;

  const header = (
    <PageHeader
      title="Progress"
      subtitle={`Level ${stats.level.level} · ${stats.xp.toLocaleString()} XP · ${stats.streak.current}-day streak`}
      icon={ChartColumn}
      tone="violet"
      actions={
        <Button size="sm" variant="secondary" icon={CalendarCheck} onClick={openRecap}>
          <span className="hidden sm:inline">Last session</span>
          <span className="sm:hidden">Recap</span>
        </Button>
      }
    />
  );

  if (!words.length)
    return (
      <>
        {header}
        <EmptyState icon={ChartColumn} tone="violet" title="No progress yet" text="Add words and start practicing — your charts and insights will appear here." />
      </>
    );

  const kpis: { label: string; value: string | number; now: number; prev: number; suffix?: string; icon: IconType; tone: Tone }[] = [
    { label: "Reviews", value: cur.reviews, now: cur.reviews, prev: prev.reviews, icon: Zap, tone: "brand" },
    { label: "Accuracy", value: cur.reviews ? `${cur.accuracy}%` : "—", now: cur.accuracy, prev: prev.accuracy, suffix: "%", icon: Target, tone: "emerald" },
    { label: "Words added", value: cur.wordsAdded, now: cur.wordsAdded, prev: prev.wordsAdded, icon: Plus, tone: "sky" },
    { label: "Active days", value: `${cur.active}/${range}`, now: cur.active, prev: prev.active, icon: CalendarDays, tone: "amber" },
    { label: "Quizzes", value: cur.quizzes, now: cur.quizzes, prev: prev.quizzes, icon: Brain, tone: "pink" },
    { label: "XP earned", value: cur.xp, now: cur.xp, prev: prev.xp, icon: Sparkles, tone: "violet" },
  ];

  const segs = [
    { label: "New", value: stats.new, color: "#0ea5e9" },
    { label: "Learning", value: stats.learning, color: "#f59e0b" },
    { label: "Reviewing", value: stats.reviewing, color: "#8b5cf6" },
    { label: "Mastered", value: stats.mastered, color: "#10b981" },
  ];

  const gPts = growth.pts;
  const gMin = Math.min(...gPts);
  const gMax = Math.max(...gPts, gMin + 1);
  const gPath = gPts.map((v, i) => `${(i / Math.max(1, gPts.length - 1)) * 100},${100 - ((v - gMin) / (gMax - gMin)) * 88 - 6}`).join(" L ");

  return (
    <>
      {header}
      <Segmented<Range>
        className="mb-5 max-w-xs animate-fade-up"
        value={range}
        onChange={setRange}
        options={[
          { value: 7, label: "7 days" },
          { value: 30, label: "30 days" },
          { value: 90, label: "90 days" },
        ]}
      />

      <div className="stagger grid grid-cols-1 gap-4 lg:grid-cols-12 [&>*]:min-w-0">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-12 lg:grid-cols-6">
          {kpis.map((k) => (
            <Card key={k.label} className="p-4">
              <div className="flex items-center justify-between">
                <IconTile icon={k.icon} tone={k.tone} size="sm" />
                <Delta now={k.now} prev={k.prev} suffix={k.suffix} />
              </div>
              <div className="mt-3 text-2xl font-extrabold leading-none tabular-nums">{k.value}</div>
              <div className="mt-1 text-[12.5px] font-medium text-muted">{k.label}</div>
            </Card>
          ))}
        </div>

        <Card className="p-5 lg:col-span-8">
          <SectionTitle
            title="Daily activity"
            className="!px-0"
            action={
              <span className="flex items-center gap-3 text-[11.5px] font-semibold text-muted">
                <span className="flex items-center gap-1">
                  <span className="size-2.5 rounded-sm brand-gradient" /> Reviews
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-0.5 w-3 rounded bg-emerald-500" /> Accuracy
                </span>
              </span>
            }
          />
          <div className="relative h-48">
            <div className={cn("flex h-full items-end", range === 90 ? "gap-[2px]" : range === 30 ? "gap-1" : "gap-2 sm:gap-3")}>
              {series.map((s) => (
                <div key={s.day} className="flex h-full flex-1 items-end" title={`${shortDate(s.day)} · ${s.reviews} reviews${s.acc !== null ? ` · ${Math.round(s.acc)}%` : ""}`}>
                  <div
                    className={cn("w-full rounded-t-md transition-[height] duration-700", s.day === today ? "brand-gradient" : "bg-brand-500/30 dark:bg-brand-400/30", range === 7 && "rounded-xl")}
                    style={{ height: `${s.reviews ? Math.max(3, (s.reviews / maxReviews) * 100) : 1.5}%` }}
                  />
                </div>
              ))}
            </div>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full overflow-visible">
              <line x1="0" x2="100" y1={100 - (settings.dailyGoal / maxReviews) * 100} y2={100 - (settings.dailyGoal / maxReviews) * 100} stroke="currentColor" strokeDasharray="2 2" className="text-brand-500/50" vectorEffect="non-scaling-stroke" />
              <polyline
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                points={series
                  .map((s, i) => (s.acc === null ? null : `${((i + 0.5) / series.length) * 100},${100 - s.acc * 0.95}`))
                  .filter(Boolean)
                  .join(" ")}
              />
            </svg>
            {series.map((s, i) =>
              s.acc === null ? null : (
                <span
                  key={`dot-${s.day}`}
                  title={`${Math.round(s.acc)}% accuracy`}
                  className="pointer-events-none absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white bg-emerald-500 shadow dark:border-slate-900"
                  style={{ left: `${((i + 0.5) / series.length) * 100}%`, bottom: `${s.acc * 0.95}%` }}
                />
              ),
            )}
          </div>
          <div className="mt-2 flex justify-between text-[11px] font-semibold text-muted">
            <span>{shortDate(days[0])}</span>
            {range > 7 && <span>{shortDate(days[Math.floor(days.length / 2)])}</span>}
            <span>Today</span>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-4">
          <SectionTitle title="Mastery" className="!px-0" />
          <div className="flex items-center gap-5 lg:flex-col xl:flex-row">
            <Donut segments={segs} total={stats.total} />
            <div className="w-full space-y-2">
              {segs.map((s) => (
                <div key={s.label} className="flex items-center gap-2 text-[13px]">
                  <span className="size-2.5 rounded-full" style={{ background: s.color }} />
                  <span className="font-semibold">{s.label}</span>
                  <span className="ml-auto font-extrabold tabular-nums">{s.value}</span>
                  <span className="w-9 text-right text-[11px] text-muted">{stats.total ? Math.round((s.value / stats.total) * 100) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-7">
          <SectionTitle
            title="Study calendar"
            className="!px-0"
            action={
              <span className="flex items-center gap-1 text-[12px] font-bold text-orange-600 dark:text-orange-300">
                <Flame className="size-3.5" /> Best {plural(stats.streak.best, "day")}
              </span>
            }
          />
          <Heatmap map={actMap} goal={settings.dailyGoal} />
        </Card>

        <Card className="p-5 lg:col-span-5">
          <SectionTitle
            title="Vocabulary growth"
            className="!px-0"
            action={<span className="text-[12px] font-bold text-emerald-600 dark:text-emerald-400">+{growth.added} this period</span>}
          />
          <div className="relative h-40">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="size-full overflow-visible">
              <defs>
                <linearGradient id="growth" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--b-500)" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="var(--b-500)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`M 0,100 L ${gPath} L 100,100 Z`} fill="url(#growth)" />
              <path d={`M ${gPath}`} fill="none" stroke="var(--b-500)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </svg>
            <div className="absolute left-0 top-0 text-3xl font-extrabold tabular-nums">{gPts[gPts.length - 1]}</div>
          </div>
          <div className="mt-2 flex justify-between text-[11px] font-semibold text-muted">
            <span>{shortDate(days[0])}</span>
            <span>Today</span>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-5">
          <SectionTitle title="Upcoming reviews" className="!px-0" action={<CalendarClock className="size-4 text-muted" />} />
          <div className="flex h-36 items-end gap-2">
            {forecast.map((f, i) => (
              <div key={f.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[11px] font-bold tabular-nums text-muted">{f.count || ""}</span>
                <div className="flex h-[70%] w-full items-end">
                  <div
                    className={cn("w-full rounded-xl", i === 0 ? "bg-linear-to-t from-amber-500 to-orange-400" : "bg-amber-500/25")}
                    style={{ height: `${f.count ? Math.max(6, (f.count / maxForecast) * 100) : 4}%` }}
                  />
                </div>
                <span className={cn("text-[11px] font-semibold", i === 0 ? "text-amber-600 dark:text-amber-300" : "text-muted")}>
                  {i === 0 ? "Today" : parseDay(f.day).toLocaleDateString(undefined, { weekday: "short" })}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Today includes {plural(forecast[0].count, "word")} due or overdue.</p>
        </Card>

        <Card className="p-5 lg:col-span-7">
          <SectionTitle title="Quiz performance" className="!px-0" action={<Gauge className="size-4 text-muted" />} />
          {sessions.length ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Avg score", value: `${avgScore}%` },
                  { label: "Best score", value: `${bestScore}%` },
                  { label: "Avg / question", value: `${avgSec}s` },
                ].map((s) => (
                  <div key={s.label} className="rounded-2xl bg-black/[0.035] px-2 py-2.5 text-center dark:bg-white/[0.05]">
                    <div className="text-lg font-extrabold tabular-nums">{s.value}</div>
                    <div className="text-[11px] font-medium text-muted">{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex h-24 items-end gap-1.5">
                {sessions.map((s) => {
                  const pct = s.total ? (s.correct / s.total) * 100 : 0;
                  return (
                    <div
                      key={s.id}
                      title={`${Math.round(pct)}% · ${new Date(s.createdAt).toLocaleDateString()}`}
                      className={cn("flex-1 rounded-t-lg", pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500")}
                      style={{ height: `${Math.max(6, pct)}%` }}
                    />
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] font-semibold text-muted">Last {sessions.length} quizzes, oldest → newest</p>
            </>
          ) : (
            <p className="py-6 text-center text-sm text-muted">Take a quiz to see your score trend.</p>
          )}
        </Card>

        <Card className="p-5 lg:col-span-6">
          <SectionTitle title="Accuracy by question type" className="!px-0" />
          {typeStats.length ? (
            <div className="space-y-3">
              {typeStats.map((t) => (
                <div key={t.type}>
                  <div className="mb-1 flex items-center justify-between text-[13px]">
                    <span className="font-semibold">{TYPE_LABEL[t.type] ?? t.type}</span>
                    <span className="font-bold tabular-nums">
                      {t.acc}% <span className="text-[11px] font-medium text-muted">· {t.total}</span>
                    </span>
                  </div>
                  <ProgressBar
                    value={t.acc / 100}
                    barClassName={t.acc >= 80 ? "!bg-none bg-emerald-500" : t.acc >= 50 ? "!bg-none bg-amber-500" : "!bg-none bg-rose-500"}
                  />
                </div>
              ))}
              {typeStats.length > 1 && (
                <p className="flex items-center gap-1.5 pt-1 text-xs text-muted">
                  <TrendingDown className="size-3.5 text-rose-500" /> Focus area: <b className="text-fg">{TYPE_LABEL[[...typeStats].sort((a, b) => a.acc - b.acc)[0].type]}</b>
                </p>
              )}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted">Answer some quiz questions to unlock this breakdown.</p>
          )}
        </Card>

        <Card className="p-5 lg:col-span-6">
          <SectionTitle title="When you study" className="!px-0" action={<Clock className="size-4 text-muted" />} />
          <div className="flex h-28 items-end gap-[3px]">
            {hours.map((h, i) => (
              <div
                key={i}
                title={`${fmtHour(i)} · ${h} answers`}
                className={cn("flex-1 rounded-t-[4px]", i === peak && h ? "brand-gradient" : "bg-brand-500/25")}
                style={{ height: `${h ? Math.max(6, (h / maxHour) * 100) : 3}%` }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[10.5px] font-semibold text-muted">
            <span>12 AM</span>
            <span>6 AM</span>
            <span>12 PM</span>
            <span>6 PM</span>
            <span>11 PM</span>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted">
            <Sunrise className="size-4 text-amber-500" />
            {hours.some((h) => h) ? (
              <>
                You study most around <b className="text-fg">{fmtHour(peak)}</b>
              </>
            ) : (
              "Your study-time pattern will appear here."
            )}
          </p>
        </Card>

        <Card className="p-5 lg:col-span-6">
          <SectionTitle title="Toughest words" className="!px-0" action={<TrendingDown className="size-4 text-rose-500" />} />
          {hardest.length ? (
            <div className="space-y-1">
              {hardest.map((w) => (
                <button key={w.id} type="button" onClick={() => openWord(w.id)} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-black/[0.04] dark:hover:bg-white/[0.05]">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-rose-500/12 text-[12px] font-extrabold text-rose-600 dark:text-rose-300">{accuracyOf(w)}%</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{w.word}</span>
                    <span className="block truncate font-bangla text-[13px] text-muted">{w.banglaMeaning || w.englishMeaning}</span>
                  </span>
                  <span className="text-[11px] font-semibold text-muted">{w.timesWrong}× missed</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted">Review words a few times to find your toughest ones.</p>
          )}
        </Card>

        <Card className="p-5 lg:col-span-6">
          <SectionTitle title="Strongest words" className="!px-0" action={<TrendingUp className="size-4 text-emerald-500" />} />
          {strongest.length ? (
            <div className="space-y-1">
              {strongest.map((w) => (
                <button key={w.id} type="button" onClick={() => openWord(w.id)} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-black/[0.04] dark:hover:bg-white/[0.05]">
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl text-sm font-extrabold", letterTone(w.word))}>{w.word[0]?.toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{w.word}</span>
                    <span className="block truncate font-bangla text-[13px] text-muted">{w.banglaMeaning || w.englishMeaning}</span>
                  </span>
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">{accuracyOf(w)}%</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted">Your best-known words will show up here.</p>
          )}
        </Card>

        <Card className="p-5 lg:col-span-5">
          <SectionTitle title="Parts of speech" className="!px-0" action={<BookOpen className="size-4 text-muted" />} />
          <div className="space-y-2.5">
            {pos.map(([p, n]) => (
              <div key={p}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span className="font-semibold capitalize">{p}</span>
                  <span className="font-bold tabular-nums">{n}</span>
                </div>
                <ProgressBar value={n / stats.total} className="h-1.5" />
              </div>
            ))}
          </div>
          {stats.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {stats.tags.slice(0, 10).map((t) => (
                <span key={t} className="rounded-full bg-brand-500/10 px-2.5 py-1 text-[12px] font-semibold text-brand-700 dark:text-brand-200">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5 lg:col-span-7">
          <SectionTitle
            title="Achievements"
            className="!px-0"
            action={
              <span className="flex items-center gap-1 text-[12px] font-bold text-amber-600 dark:text-amber-300">
                <Award className="size-3.5" /> {unlockedCount}/{achievements.length}
              </span>
            }
          />
          <ProgressBar value={unlockedCount / achievements.length} className="mb-4 h-1.5" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {achievements.map((a) => (
              <div key={a.id} className={cn("relative rounded-[18px] p-3", a.unlocked ? "surface" : "bg-black/[0.03] dark:bg-white/[0.03]")}>
                <div className="flex items-start justify-between">
                  <IconTile icon={a.icon} tone={a.tone} size="sm" className={cn(!a.unlocked && "opacity-35 grayscale")} />
                  {a.unlocked ? <Crown className="size-3.5 text-amber-500" /> : <Lock className="size-3.5 text-muted" />}
                </div>
                <div className={cn("mt-2 text-[13px] font-bold leading-tight", !a.unlocked && "text-fg/70")}>{a.title}</div>
                <div className="text-[11px] leading-snug text-muted">{a.desc}</div>
                {!a.unlocked && (
                  <div className="mt-2">
                    <ProgressBar value={a.progress} className="h-1" />
                    <div className="mt-1 text-[10px] font-semibold tabular-nums text-muted">
                      {a.current}/{a.target}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
