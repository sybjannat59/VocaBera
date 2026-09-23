"use client";

import { prefs } from "./utils";

export interface VoiceQuality {
  score: number;
  why: string;
  chromeNatural?: boolean;
  microsoftNeural?: boolean;
  googleNeural?: boolean;
}

export interface Voice {
  id: string;
  uri: string;
  name: string;
  shortName: string;
  lang: string;
  langFamily: string;
  localService: boolean;
  default: boolean;
  quality: VoiceQuality;
  voice: SpeechSynthesisVoice;
}

/**
 * Advanced TTS engine for clear, natural pronunciation.
 *
 * Priorities (highest quality first where available on the user's device):
 *  1. Microsoft Edge online neural voices  (e.g. Microsoft Jeny, Aria, Libby, Sonia)
 *  2. Chrome / Android premium neural voices (e.g. Google en-US Neural2-A, Google UK English Female)
 *  3. Native OS default (Samantha on iOS/macOS, Google TTS, etc.), nearest the requested locale
 *  4. Any polite fallback that speaks English
 *
 * The engine remembers the best voice for the user's settings, can auto-refresh
 * when the browser loads more voices, and saves the configured rate.
 */

const listeners = new Set<() => void>();
let voices: Voice[] = [];
let loaded = false;
let startedWatching = false;
let current: Voice | null = null;
let deviceHint: "apple" | "windows" | "android" | "other" = "other";

// Strongest-neared match first.
const PREMIUM: { pattern: RegExp; score: number; why: string }[] = [
  { pattern: /jenny|jenny neural/i, score: 99, why: "Edge neural (US, very natural)" },
  { pattern: /aria|aria neural/i, score: 98, why: "Edge neural (US, very natural)" },
  { pattern: /libby/i, score: 98, why: "Edge neural (UK, very clear)" },
  { pattern: /sonia/i, score: 97, why: "Edge neural (UK)" },
  { pattern: /thomas|brian/i, score: 96, why: "Edge neural (UK/US)" },
  { pattern: /neural2-a|en-us-standard-a|en-us-standard-b|en-us-journey/i, score: 95, why: "Google premium neural (US)" },
  { pattern: /google uk english female|google english/i, score: 95, why: "Google UK English (female)" },
  { pattern: /en-gb-standard|en-gb-wavenet|en-gb-neural/i, score: 94, why: "Google premium neural (UK)" },
  { pattern: /samantha/i, score: 93, why: "Apple high-quality voice (US)" },
  { pattern: /karen|moira|tessa|daniel/i, score: 92, why: "Apple high-quality voice (AU/IE/UK/US)" },
  { pattern: /google(?!.*cmn)/i, score: 88, why: "Google Text-to-Speech" },
];

function scoreVoice(v: SpeechSynthesisVoice, langPrefix: string): VoiceQuality {
  const name = v.name.toLowerCase();
  for (const p of PREMIUM) {
    if (p.pattern.test(name) && v.lang.toLowerCase().startsWith(langPrefix)) {
      return { score: p.score, why: p.why, microsoftNeural: /(jenny|aria|libby|sonia|thomas|brian)/i.test(name), googleNeural: /google/i.test(name) };
    }
  }
  // Locale-native voice with high quality hints.
  if (v.lang.toLowerCase().startsWith(langPrefix)) {
    if (name.includes("natural") || name.includes("premium") || name.includes("enhanced") || name.includes("neural")) {
      return { score: 85, why: "Native system neural voice" };
    }
    if (name.includes("female") || name.includes("male")) return { score: 82, why: "Native premium voice" };
    return { score: 78, why: "Native voice" };
  }
  if (v.lang.toLowerCase().startsWith("en-")) return { score: 65, why: "English voice" };
  if (v.lang.toLowerCase().startsWith("en")) return { score: 60, why: "English voice" };
  return { score: 0, why: "Unsupported language" };
}

function shortName(name: string) {
  return name
    .replace(/microsoft\s+/i, "")
    .replace(/google\s+/i, "")
    .replace(/apple\s+/i, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s*-\s*English.*$/i, "")
    .trim();
}

function detectDevice(): "apple" | "windows" | "android" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "apple";
  if (/Windows Phone|Windows/.test(ua)) return "windows";
  if (/Android/.test(ua)) return "android";
  return "other";
}

function refreshVoices() {
  if (typeof speechSynthesis === "undefined") return;
  const raw = speechSynthesis.getVoices();
  voices = raw
    .map((v) => {
      const q = scoreVoice(v, prefs.lang === "en-GB" ? "en-gb" : "en-us");
      return {
        id: v.voiceURI || v.name,
        uri: v.voiceURI || v.name,
        name: v.name,
        shortName: shortName(v.name),
        lang: v.lang,
        langFamily: v.lang.split("-")[0] ?? v.lang,
        localService: v.localService,
        default: v.default,
        quality: q,
        voice: v,
      };
    })
    .sort((a, b) => b.quality.score - a.quality.score);
  loaded = true;
  pickBestVoice();
  for (const fn of listeners) fn();
}

function pickBestVoice() {
  if (!voices.length) return;
  const best = choicesByQuality()[0];
  if (best) {
    current = best;
    Object.assign(prefs, { voice: current.voice });
  }
}

function choicesByQuality(): Voice[] {
  return voices;
}

function ensureWatching() {
  if (startedWatching || typeof speechSynthesis === "undefined") return;
  startedWatching = true;
  refreshVoices();
  speechSynthesis.onvoiceschanged = () => refreshVoices();
}

export function subscribe(fn: () => void) {
  ensureWatching();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getVoiceCatalog(): { loaded: boolean; voices: Voice[] } {
  ensureWatching();
  return { loaded, voices };
}

export function currentVoice(): Voice | null {
  ensureWatching();
  return current;
}

export function setPreferredVoice(voiceId: string | null) {
  if (!voiceId) {
    pickBestVoice();
    return;
  }
  const found = voices.find((v) => v.id === voiceId || v.uri === voiceId || v.name === voiceId);
  if (found) {
    current = found;
    Object.assign(prefs, { voice: found.voice });
    for (const fn of listeners) fn();
  }
}

export function speakText(text: string, opts: { rate?: number; pitch?: number; volume?: number; voiceId?: string } = {}) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return false;
  ensureWatching();
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = prefs.lang;
  u.rate = Math.min(2, Math.max(0.5, opts.rate ?? prefs.rate));
  u.pitch = opts.pitch ?? 1;
  u.volume = opts.volume ?? 1;

  let chosen: SpeechSynthesisVoice | null = null;
  if (opts.voiceId) {
    const found = voices.find((v) => v.id === opts.voiceId || v.uri === opts.voiceId || v.name === opts.voiceId);
    chosen = found?.voice ?? null;
  }
  if (!chosen && current) chosen = current.voice;
  if (!chosen) {
    const q = prefs.lang === "en-GB" ? "en-gb" : "en-us";
    chosen = voices.find((v) => v.lang.toLowerCase().startsWith(q) && v.quality.score)?.voice ?? voices.find((v) => v.lang.toLowerCase().startsWith("en"))?.voice ?? null;
  }
  if (chosen) u.voice = chosen;
  synth.speak(u);
  return true;
}

export function speakFaster() {
  return speakText("Testing a faster, clearer English voice for vocabulary practice.", { rate: Math.min(1.4, prefs.rate + 0.2) });
}

export function speakSlower() {
  return speakText("Testing a slower, clearer English voice for vocabulary practice.", { rate: Math.max(0.6, prefs.rate - 0.2) });
}

export function sampleVoiceText(device = deviceHint, lang = prefs.lang) {
  const isGB = lang === "en-GB";
  if (device === "apple") return isGB ? "Hello! I'm your British pronunciation guide." : "Hi! I'm your American pronunciation guide.";
  if (device === "windows") return isGB ? "Hello, this is Microsoft British voice." : "Hello, this is Microsoft American voice.";
  if (device === "android") return isGB ? "Hello, this is Google's UK English voice." : "Hello, this is Google's US English voice.";
  return isGB ? "Hello! This is a clear British English voice." : "Hello! This is a clear American English voice.";
}
