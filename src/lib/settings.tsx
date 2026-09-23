"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { QuestionType } from "./quiz-engine";
import type { SourceKey } from "./types";
import { prefs } from "./utils";

export type ThemeMode = "light" | "dark" | "system";
export type Accent = "indigo" | "ocean" | "emerald" | "sunset" | "rose";

export interface Settings {
  theme: ThemeMode;
  accent: Accent;
  dailyGoal: number;
  quizLength: number;
  quizTimer: boolean;
  quizAdaptive: boolean;
  quizTypes: QuestionType[];
  quizSource: SourceKey;
  flashFront: "word" | "bangla" | "definition";
  flashDeck: SourceKey;
  flashOrder: "smart" | "shuffle" | "newest" | "alpha";
  flashCount: number;
  autoPronounce: boolean;
  voice: "en-US" | "en-GB";
  speechRate: number;
  sound: boolean;
  haptics: boolean;
  wordsView: "list" | "grid";
  showRecap: boolean;
  matchPairs: number;
  matchRounds: number;
  matchMeaning: "bangla" | "definition";
  autoSync: boolean;
  /** Only allow direct connections inside the local network (no internet relay). */
  syncLocalOnly: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  accent: "indigo",
  dailyGoal: 20,
  quizLength: 10,
  quizTimer: false,
  quizAdaptive: true,
  quizTypes: [
    "word-bangla",
    "bangla-word",
    "word-definition",
    "definition-word",
    "synonym",
    "antonym",
    "fill-blank",
    "word-parts",
    "spelling",
    "listening",
    "true-false",
  ],
  quizSource: "all",
  flashFront: "word",
  flashDeck: "all",
  flashOrder: "smart",
  flashCount: 20,
  autoPronounce: false,
  voice: "en-US",
  speechRate: 0.95,
  sound: true,
  haptics: true,
  wordsView: "list",
  showRecap: true,
  matchPairs: 6,
  matchRounds: 3,
  matchMeaning: "bangla",
  autoSync: true,
  syncLocalOnly: false,
};

export const ACCENTS: { id: Accent; label: string; from: string; to: string }[] = [
  { id: "indigo", label: "Aurora", from: "#6366f1", to: "#8b5cf6" },
  { id: "ocean", label: "Ocean", from: "#0ea5e9", to: "#6366f1" },
  { id: "emerald", label: "Lagoon", from: "#10b981", to: "#06b6d4" },
  { id: "sunset", label: "Sunset", from: "#f97316", to: "#ec4899" },
  { id: "rose", label: "Blossom", from: "#f43f5e", to: "#a855f7" },
];

const KEY = "vb-settings";

function applyTheme(theme: ThemeMode, accent: Accent) {
  const root = document.documentElement;
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  root.dataset.accent = accent;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#070a14" : "#f4f6fc");
}

interface SettingsCtx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  ready: boolean;
}

const Ctx = createContext<SettingsCtx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) });
    } catch {
      /* ignore corrupt settings */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* storage full */
    }
    applyTheme(settings.theme, settings.accent);
    Object.assign(prefs, {
      lang: settings.voice,
      rate: settings.speechRate,
      sound: settings.sound,
      haptics: settings.haptics,
    });
  }, [settings, ready]);

  useEffect(() => {
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system", settings.accent);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [settings.theme, settings.accent]);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const value = useMemo(() => ({ settings, update, ready }), [settings, update, ready]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
