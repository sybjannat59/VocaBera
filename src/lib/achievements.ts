import {
  Award,
  BookOpen,
  Brain,
  Crown,
  Flame,
  Gem,
  GraduationCap,
  Heart,
  Library,
  Lightbulb,
  Medal,
  Mountain,
  Rocket,
  Sparkles,
  Sprout,
  Star,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import type { ComponentType } from "react";
import type { DailyActivity, QuizSession, Word } from "./types";

export type AchTone = "sky" | "emerald" | "amber" | "pink" | "violet" | "teal" | "rose" | "indigo" | "brand";

export interface AchievementCtx {
  total: number;
  mastered: number;
  streakBest: number;
  reviews: number;
  quizzes: number;
  perfectQuizzes: number;
  level: number;
  favorites: number;
  mnemonics: number;
  activeDays: number;
  bestQuizStreak: number;
}

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  tone: AchTone;
  target: number;
  value: (c: AchievementCtx) => number;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-word", title: "First Step", desc: "Add your first word", icon: Sprout, tone: "emerald", target: 1, value: (c) => c.total },
  { id: "words-10", title: "Getting Started", desc: "Build a list of 10 words", icon: Sprout, tone: "teal", target: 10, value: (c) => c.total },
  { id: "words-25", title: "Word Collector", desc: "Build a list of 25 words", icon: BookOpen, tone: "sky", target: 25, value: (c) => c.total },
  { id: "words-100", title: "Lexicon Builder", desc: "Build a list of 100 words", icon: Library, tone: "indigo", target: 100, value: (c) => c.total },
  { id: "words-250", title: "Vocabulary Architect", desc: "Build a list of 250 words", icon: Library, tone: "violet", target: 250, value: (c) => c.total },
  { id: "words-500", title: "Walking Dictionary", desc: "Build a list of 500 words", icon: Gem, tone: "violet", target: 500, value: (c) => c.total },
  { id: "words-1000", title: "Living Lexicon", desc: "Build a list of 1,000 words", icon: Gem, tone: "pink", target: 1000, value: (c) => c.total },
  { id: "mastered-1", title: "Locked In", desc: "Master your first word", icon: Target, tone: "emerald", target: 1, value: (c) => c.mastered },
  { id: "mastered-5", title: "Solid Ground", desc: "Master 5 words", icon: Target, tone: "teal", target: 5, value: (c) => c.mastered },
  { id: "mastered-25", title: "Memory Master", desc: "Master 25 words", icon: Trophy, tone: "amber", target: 25, value: (c) => c.mastered },
  { id: "mastered-50", title: "Recall Specialist", desc: "Master 50 words", icon: Trophy, tone: "indigo", target: 50, value: (c) => c.mastered },
  { id: "mastered-100", title: "Vocabulary Virtuoso", desc: "Master 100 words", icon: Crown, tone: "amber", target: 100, value: (c) => c.mastered },
  { id: "mastered-250", title: "Mastery Engine", desc: "Master 250 words", icon: Crown, tone: "violet", target: 250, value: (c) => c.mastered },
  { id: "mastered-500", title: "Memory Grandmaster", desc: "Master 500 words", icon: Gem, tone: "pink", target: 500, value: (c) => c.mastered },
  { id: "streak-3", title: "Warming Up", desc: "Reach a 3-day streak", icon: Flame, tone: "rose", target: 3, value: (c) => c.streakBest },
  { id: "streak-7", title: "On Fire", desc: "Reach a 7-day streak", icon: Flame, tone: "rose", target: 7, value: (c) => c.streakBest },
  { id: "streak-14", title: "Fortnight Focus", desc: "Reach a 14-day streak", icon: Flame, tone: "amber", target: 14, value: (c) => c.streakBest },
  { id: "streak-30", title: "Unstoppable", desc: "Reach a 30-day streak", icon: Mountain, tone: "pink", target: 30, value: (c) => c.streakBest },
  { id: "streak-60", title: "Relentless", desc: "Reach a 60-day streak", icon: Mountain, tone: "violet", target: 60, value: (c) => c.streakBest },
  { id: "streak-100", title: "Century Streak", desc: "Reach a 100-day streak", icon: Crown, tone: "amber", target: 100, value: (c) => c.streakBest },
  { id: "reviews-100", title: "Centurion", desc: "Complete 100 reviews", icon: Zap, tone: "brand", target: 100, value: (c) => c.reviews },
  { id: "reviews-250", title: "Review Rhythm", desc: "Complete 250 reviews", icon: Zap, tone: "sky", target: 250, value: (c) => c.reviews },
  { id: "reviews-500", title: "Practice Pro", desc: "Complete 500 reviews", icon: Zap, tone: "teal", target: 500, value: (c) => c.reviews },
  { id: "reviews-1000", title: "Thousand Club", desc: "Complete 1,000 reviews", icon: Rocket, tone: "violet", target: 1000, value: (c) => c.reviews },
  { id: "reviews-2500", title: "Recall Veteran", desc: "Complete 2,500 reviews", icon: Rocket, tone: "pink", target: 2500, value: (c) => c.reviews },
  { id: "reviews-5000", title: "Study Titan", desc: "Complete 5,000 reviews", icon: Rocket, tone: "amber", target: 5000, value: (c) => c.reviews },
  { id: "reviews-10000", title: "Ten Thousand Reps", desc: "Complete 10,000 reviews", icon: Crown, tone: "indigo", target: 10000, value: (c) => c.reviews },
  { id: "quiz-1", title: "Quiz Rookie", desc: "Finish your first quiz", icon: Brain, tone: "amber", target: 1, value: (c) => c.quizzes },
  { id: "quiz-5", title: "Quiz Regular", desc: "Finish 5 quizzes", icon: Brain, tone: "sky", target: 5, value: (c) => c.quizzes },
  { id: "quiz-10", title: "Quiz Habit", desc: "Finish 10 quizzes", icon: Brain, tone: "teal", target: 10, value: (c) => c.quizzes },
  { id: "quiz-25", title: "Quiz Champion", desc: "Finish 25 quizzes", icon: Medal, tone: "teal", target: 25, value: (c) => c.quizzes },
  { id: "quiz-50", title: "Quiz Master", desc: "Finish 50 quizzes", icon: Medal, tone: "violet", target: 50, value: (c) => c.quizzes },
  { id: "quiz-100", title: "Quiz Centurion", desc: "Finish 100 quizzes", icon: Crown, tone: "amber", target: 100, value: (c) => c.quizzes },
  { id: "perfect", title: "Flawless", desc: "Score 100% on a quiz of 5+ questions", icon: Sparkles, tone: "pink", target: 1, value: (c) => c.perfectQuizzes },
  { id: "perfect-5", title: "Clean Sweep", desc: "Score 100% on 5 quizzes of 5+ questions", icon: Sparkles, tone: "teal", target: 5, value: (c) => c.perfectQuizzes },
  { id: "perfect-10", title: "Perfectionist", desc: "Score 100% on 10 quizzes of 5+ questions", icon: Sparkles, tone: "violet", target: 10, value: (c) => c.perfectQuizzes },
  { id: "combo-10", title: "Combo Breaker", desc: "Hit a 10-answer streak in a quiz", icon: Award, tone: "indigo", target: 10, value: (c) => c.bestQuizStreak },
  { id: "combo-20", title: "Flow State", desc: "Hit a 20-answer streak in a quiz", icon: Award, tone: "pink", target: 20, value: (c) => c.bestQuizStreak },
  { id: "level-5", title: "Rising Star", desc: "Reach level 5", icon: GraduationCap, tone: "sky", target: 5, value: (c) => c.level },
  { id: "level-10", title: "Steady Climb", desc: "Reach level 10", icon: GraduationCap, tone: "teal", target: 10, value: (c) => c.level },
  { id: "level-25", title: "Deep Practice", desc: "Reach level 25", icon: Medal, tone: "indigo", target: 25, value: (c) => c.level },
  { id: "level-50", title: "Halfway Hero", desc: "Reach level 50", icon: Trophy, tone: "amber", target: 50, value: (c) => c.level },
  { id: "level-75", title: "Mastery Vanguard", desc: "Reach level 75", icon: Crown, tone: "violet", target: 75, value: (c) => c.level },
  { id: "level-100", title: "VocaBera Legend", desc: "Reach level 100", icon: Gem, tone: "pink", target: 100, value: (c) => c.level },
  { id: "favorites-10", title: "Curator", desc: "Favorite 10 words", icon: Heart, tone: "rose", target: 10, value: (c) => c.favorites },
  { id: "favorites-25", title: "Personal Curator", desc: "Favorite 25 words", icon: Heart, tone: "pink", target: 25, value: (c) => c.favorites },
  { id: "mnemonic-10", title: "Memory Maker", desc: "Write 10 mnemonics", icon: Lightbulb, tone: "amber", target: 10, value: (c) => c.mnemonics },
  { id: "mnemonic-25", title: "Mnemonic Crafter", desc: "Write 25 mnemonics", icon: Lightbulb, tone: "violet", target: 25, value: (c) => c.mnemonics },
  { id: "active-14", title: "Dedicated", desc: "Study on 14 different days", icon: Star, tone: "teal", target: 14, value: (c) => c.activeDays },
  { id: "active-30", title: "Monthly Momentum", desc: "Study on 30 different days", icon: Star, tone: "sky", target: 30, value: (c) => c.activeDays },
];

export function buildAchievementCtx(
  words: Word[],
  activity: DailyActivity[],
  sessions: QuizSession[],
  base: { mastered: number; streakBest: number; level: number; quizzes: number },
): AchievementCtx {
  let reviews = 0;
  let favorites = 0;
  let mnemonics = 0;
  for (const w of words) {
    reviews += w.timesReviewed;
    if (w.isFavorite) favorites++;
    if (w.mnemonic.trim()) mnemonics++;
  }
  return {
    total: words.length,
    mastered: base.mastered,
    streakBest: base.streakBest,
    level: base.level,
    quizzes: Math.max(base.quizzes, activity.reduce((s, a) => s + a.quizzes, 0)),
    reviews: Math.max(reviews, activity.reduce((s, a) => s + a.reviews, 0)),
    perfectQuizzes: sessions.filter((s) => s.total >= 5 && s.correct === s.total).length,
    bestQuizStreak: sessions.reduce((m, s) => Math.max(m, s.bestStreak), 0),
    favorites,
    mnemonics,
    activeDays: activity.filter((a) => a.reviews > 0 || a.wordsAdded > 0).length,
  };
}

export function evaluateAchievements(ctx: AchievementCtx) {
  return ACHIEVEMENTS.map((a) => {
    const v = a.value(ctx);
    return { ...a, current: Math.min(v, a.target), unlocked: v >= a.target, progress: Math.min(1, v / a.target) };
  });
}
