"use client";

import { Brain, CalendarCheck, CircleCheck, Flame, Languages, Layers, Plus, RotateCcw, Sparkles, Target, X, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { addDays, localDay } from "@/lib/learning";
import { useSettings } from "@/lib/settings";
import { useVocab, useVocabStats, useWordSheet } from "@/lib/store";
import type { RecapData, Word } from "@/lib/types";
import { cn, plural } from "@/lib/utils";
import { letterTone } from "./word-bits";
import { Button, Segmented, Sheet, Switch } from "./ui";

export const RECAP_EVENT = "vb:open-recap";
export const openRecap = () => window.dispatchEvent(new Event(RECAP_EVENT));
const SEEN_KEY = "vb-recap-seen";

type Tab = "learned" | "practice" | "added";
interface Row {
  w: Word;
  reviews: number;
  correct: number;
  lastCorrect: boolean;
}

function dayLabel(day: string, today: string) {
  if (day === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function DailyRecap() {
  const { status, words } = useVocab();
  const stats = useVocabStats();
  const { settings, update, ready } = useSettings();
  const { openWord } = useWordSheet();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<RecapData | null>(null);
  const [tab, setTab] = useState<Tab>("learned");
  const autoChecked = useRef(false);
  const wordsRef = useRef(words);
  wordsRef.current = words;

  const load = useCallback(async () => {
    const res = await fetch(`/api/recap?today=${localDay()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("recap");
    return (await res.json()) as RecapData;
  }, []);

  const addedOn = (day: string) => wordsRef.current.filter((w) => localDay(new Date(w.createdAt)) === day);

  const pickTab = (d: RecapData) => {
    const hasWrong = d.items.some((i) => !i.lastCorrect);
    const hasRight = d.items.some((i) => i.lastCorrect);
    setTab(hasRight ? "learned" : hasWrong ? "practice" : "added");
  };

  // Auto-open once per day after the app loads.
  useEffect(() => {
    if (autoChecked.current || status !== "ready" || !ready || !words.length) return;
    autoChecked.current = true;
    if (!settings.showRecap) return;
    const today = localDay();
    try {
      if (localStorage.getItem(SEEN_KEY) === today) return;
    } catch {
      return;
    }
    setTimeout(async () => {
      try {
        const d = await load();
        localStorage.setItem(SEEN_KEY, today);
        if (d.day && (d.items.length || addedOn(d.day).length || (d.activity?.reviews ?? 0) > 0)) {
          setData(d);
          pickTab(d);
          setOpen(true);
        }
      } catch {
        /* silent */
      }
    }, 900);
  }, [status, ready, words.length, settings.showRecap, load]);

  // Manual open from anywhere.
  useEffect(() => {
    const handler = async () => {
      try {
        const d = await load();
        if (!d.day) {
          toast.info("No earlier study day yet. Study today and your recap will be here tomorrow!");
          return;
        }
        setData(d);
        pickTab(d);
        setOpen(true);
      } catch {
        toast.error("Could not load your recap");
      }
    };
    window.addEventListener(RECAP_EVENT, handler);
    return () => window.removeEventListener(RECAP_EVENT, handler);
  }, [load]);

  const today = localDay();
  const view = useMemo(() => {
    if (!data?.day) return null;
    const day = data.day;
    const byId = new Map(words.map((w) => [w.id, w]));
    let rows: Row[] = data.items
      .map((i) => ({ ...i, w: byId.get(i.wordId) }))
      .filter((r): r is Row & { wordId: number } => !!r.w);
    if (!rows.length) {
      rows = words
        .filter((w) => w.lastReviewedAt && localDay(new Date(w.lastReviewedAt)) === day)
        .map((w) => ({ w, reviews: 1, correct: w.mastery > 0 ? 1 : 0, lastCorrect: w.mastery > 0 }));
    }
    const added = words.filter((w) => localDay(new Date(w.createdAt)) === day);
    const learned = rows.filter((r) => r.lastCorrect).sort((a, b) => b.correct - a.correct);
    const practice = rows.filter((r) => !r.lastCorrect).sort((a, b) => a.correct / a.reviews - b.correct / b.reviews);
    const act = data.activity;
    const reviews = act?.reviews ?? rows.reduce((s, r) => s + r.reviews, 0);
    const correct = act?.correct ?? rows.reduce((s, r) => s + r.correct, 0);
    const wordsAdded = Math.max(act?.wordsAdded ?? 0, added.length);
    const xp = correct * 10 + (reviews - correct) * 2 + wordsAdded * 5 + (act?.quizzes ?? 0) * 20;
    return {
      day,
      label: dayLabel(day, today),
      learned,
      practice,
      added,
      reviewed: rows.length,
      reviews,
      accuracy: reviews ? Math.round((correct / reviews) * 100) : 0,
      wordsAdded,
      xp,
    };
  }, [data, words, today]);

  const close = () => setOpen(false);
  const go = (path: string) => {
    close();
    setTimeout(() => router.push(path), 180);
  };

  const idsFor = () => {
    if (!view) return [];
    const base = view.practice.length ? view.practice.map((r) => r.w.id) : [...view.learned.map((r) => r.w.id), ...view.added.map((w) => w.id)];
    return [...new Set(base)].slice(0, 50);
  };

  const message = !view
    ? ""
    : view.accuracy >= 85
      ? "Outstanding session — your memory is on fire!"
      : view.accuracy >= 60
        ? "Solid work! A quick review will lock these words in."
        : view.reviews
          ? "Every mistake is progress. Let's revisit the tricky ones."
          : "You grew your list — now let's practice those new words.";

  const list: { key: string; w: Word; badge: React.ReactNode }[] =
    !view
      ? []
      : tab === "learned"
        ? view.learned.map((r) => ({
            key: `l${r.w.id}`,
            w: r.w,
            badge: (
              <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                {r.correct}/{r.reviews}
              </span>
            ),
          }))
        : tab === "practice"
          ? view.practice.map((r) => ({
              key: `p${r.w.id}`,
              w: r.w,
              badge: (
                <span className="rounded-full bg-rose-500/12 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:text-rose-300">
                  {r.correct}/{r.reviews}
                </span>
              ),
            }))
          : view.added.map((w) => ({
              key: `a${w.id}`,
              w,
              badge: <span className="rounded-full bg-sky-500/12 px-2 py-0.5 text-[11px] font-bold text-sky-700 dark:text-sky-300">New</span>,
            }));

  return (
    <Sheet open={open && !!view} onClose={close} label="Daily recap" className="md:max-w-lg">
      {view && (
        <div>
          <div className="sheen relative mx-3 mt-1 overflow-hidden rounded-[26px] brand-gradient p-5 text-white shadow-xl shadow-brand-500/25 md:mx-4 md:mt-4">
            <div className="pointer-events-none absolute -right-12 -top-16 size-56 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.3),transparent_65%)]" />
            <button
              type="button"
              onClick={close}
              aria-label="Close recap"
              className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-white/20 ring-1 ring-white/25 transition active:scale-90"
            >
              <X className="size-4" />
            </button>
            <div className="relative">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[12px] font-bold ring-1 ring-white/25">
                <CalendarCheck className="size-3.5" /> Daily recap
              </span>
              <h2 className="mt-3 text-[26px] font-extrabold leading-tight tracking-tight">{view.label === "Yesterday" ? "Yesterday's recap" : "Your last session"}</h2>
              <p className="text-sm font-medium text-white/80">{view.label === "Yesterday" ? dayLabel(view.day, "") : view.label}</p>
              <p className="mt-2 text-[14px] leading-snug text-white/90">{message}</p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 px-3 pt-3 md:px-4">
            {[
              { label: "Words", value: view.reviewed, icon: Layers, cls: "text-brand-500" },
              { label: "Accuracy", value: view.reviews ? `${view.accuracy}%` : "—", icon: Target, cls: "text-emerald-500" },
              { label: "New", value: view.wordsAdded, icon: Plus, cls: "text-sky-500" },
              { label: "XP", value: view.xp, icon: Zap, cls: "text-amber-500" },
            ].map((s) => (
              <div key={s.label} className="surface rounded-2xl px-1 py-2.5 text-center">
                <s.icon className={cn("mx-auto size-4", s.cls)} />
                <div className="mt-0.5 text-lg font-extrabold tabular-nums">{s.value}</div>
                <div className="text-[10.5px] font-semibold text-muted">{s.label}</div>
              </div>
            ))}
          </div>

          {stats.streak.current > 0 && (
            <div
              className={cn(
                "mx-3 mt-3 flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-[13px] font-semibold md:mx-4",
                stats.streak.activeToday ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-orange-500/10 text-orange-700 dark:text-orange-300",
              )}
            >
              {stats.streak.activeToday ? <CircleCheck className="size-4" /> : <Flame className="size-4" />}
              {stats.streak.activeToday
                ? `Streak safe today · ${plural(stats.streak.current, "day")} and counting`
                : `Practice today to keep your ${stats.streak.current}-day streak alive!`}
            </div>
          )}

          <div className="px-3 pt-4 md:px-4">
            <Segmented<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { value: "learned", label: `Learned ${view.learned.length}` },
                { value: "practice", label: `Practice ${view.practice.length}` },
                { value: "added", label: `New ${view.added.length}` },
              ]}
            />
          </div>

          <div className="mt-2 max-h-[34dvh] overflow-y-auto overscroll-contain px-3 md:max-h-[38vh] md:px-4">
            {list.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                {tab === "learned" ? "No words answered correctly on this day." : tab === "practice" ? "No mistakes — nothing to fix!" : "No new words were added."}
              </p>
            ) : (
              <div className="divide-y divide-[var(--line)]">
                {list.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => {
                      close();
                      setTimeout(() => openWord(r.w.id), 260);
                    }}
                    className="flex w-full items-center gap-3 py-2.5 text-left"
                  >
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl text-sm font-extrabold", letterTone(r.w.word))}>{r.w.word[0]?.toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{r.w.word}</span>
                      <span className="flex items-center gap-1 truncate font-bangla text-[13px] text-muted">
                        {r.w.banglaMeaning ? <Languages className="size-3 shrink-0" /> : null}
                        <span className="truncate">{r.w.banglaMeaning || r.w.englishMeaning}</span>
                      </span>
                    </span>
                    {r.badge}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="sticky bottom-0 mt-2 space-y-2 border-t border-[var(--line)] bg-[rgba(248,250,255,0.94)] px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md md:px-4 dark:bg-[rgba(16,21,37,0.94)]">
            <div className="grid grid-cols-2 gap-2">
              <Button icon={view.practice.length ? RotateCcw : Layers} disabled={!idsFor().length} onClick={() => go(`/flashcards?ids=${idsFor().join(",")}`)}>
                {view.practice.length ? "Review mistakes" : "Flashcards"}
              </Button>
              <Button variant="secondary" icon={Brain} disabled={!idsFor().length || words.length < 4} onClick={() => go(`/quiz?ids=${idsFor().join(",")}`)}>
                Quiz me
              </Button>
            </div>
            <div className="flex items-center justify-between px-1">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                <Sparkles className="size-3.5" /> Show recap when I open the app
              </span>
              <Switch checked={settings.showRecap} onChange={(v) => update({ showRecap: v })} label="Show recap on open" />
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

