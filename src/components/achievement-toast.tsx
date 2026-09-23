"use client";

import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { buildAchievementCtx, evaluateAchievements } from "@/lib/achievements";
import { useVocab, useVocabStats } from "@/lib/store";
import { playTone } from "@/lib/utils";

const KEY = "vb-achievements";

export function achievementToast(title: string, desc: string) {
  playTone("complete");
  toast.success(`Achievement unlocked: ${title}`, { description: desc, duration: 5000 });
}

/** Watches progress and celebrates newly unlocked achievements. */
export function AchievementWatcher() {
  const { words, activity, sessions, status } = useVocab();
  const stats = useVocabStats();
  const initialized = useRef(false);

  const unlocked = useMemo(() => {
    const ctx = buildAchievementCtx(words, activity, sessions, {
      mastered: stats.mastered,
      streakBest: stats.streak.best,
      level: stats.level.level,
      quizzes: stats.quizzes,
    });
    return evaluateAchievements(ctx).filter((a) => a.unlocked);
  }, [words, activity, sessions, stats.mastered, stats.streak.best, stats.level.level, stats.quizzes]);

  useEffect(() => {
    if (status !== "ready") return;
    let stored: string[] | null = null;
    try {
      stored = JSON.parse(localStorage.getItem(KEY) || "null") as string[] | null;
    } catch {
      stored = null;
    }
    const ids = unlocked.map((a) => a.id);
    // First run on this device: record silently so old achievements don't spam.
    if (!initialized.current) {
      initialized.current = true;
      if (!stored) {
        localStorage.setItem(KEY, JSON.stringify(ids));
        return;
      }
    }
    const known = new Set(stored ?? []);
    const fresh = unlocked.filter((a) => !known.has(a.id));
    if (fresh.length) {
      fresh.slice(0, 2).forEach((a, i) => setTimeout(() => achievementToast(a.title, a.desc), 600 + i * 900));
      localStorage.setItem(KEY, JSON.stringify([...known, ...fresh.map((a) => a.id)]));
    }
  }, [unlocked, status]);

  return null;
}
