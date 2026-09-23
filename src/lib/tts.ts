import { prefs } from "./prefs";

/**
 * VocaBera speech engine.
 *
 *  1. Real human recordings (Wiktionary / Wikimedia Commons, US or UK) for single words.
 *  2. Optional on-device AI voice (Kokoro-82M) — natural, clear and offline after a one-time download.
 *  3. The best voice installed on the device (neural/online voices preferred), with fixes for
 *     well-known browser bugs (voices loading late, Chrome cutting long text, cancel+speak races).
 *
 * Every step falls back to the next, so something always speaks.
 */

export type SpeechSource = "recording" | "studio" | "device";

export interface SpeechState {
  status: "idle" | "loading" | "speaking";
  text: string;
  source: SpeechSource | null;
  label: string;
}

export interface StudioState {
  status: "absent" | "loading" | "ready" | "error";
  progress: number;
  loaded: number;
  total: number;
  error: string;
}

export interface VoiceInfo {
  uri: string;
  name: string;
  lang: string;
  quality: "natural" | "enhanced" | "standard";
  local: boolean;
}

/* --------------------------------- tiny stores --------------------------------- */

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (patch: Partial<T>) => {
      value = { ...value, ...patch };
      for (const fn of listeners) fn();
    },
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

const speech = createStore<SpeechState>({ status: "idle", text: "", source: null, label: "" });
export const subscribeSpeech = speech.subscribe;
export const getSpeechState = speech.get;
const IDLE_SPEECH: SpeechState = { status: "idle", text: "", source: null, label: "" };
export const getServerSpeechState = () => IDLE_SPEECH;

const STUDIO_FLAG = "vb-studio-installed";
const studio = createStore<StudioState>({ status: "absent", progress: 0, loaded: 0, total: 0, error: "" });
export const subscribeStudio = studio.subscribe;
export const getStudioState = studio.get;
const ABSENT_STUDIO: StudioState = { status: "absent", progress: 0, loaded: 0, total: 0, error: "" };
export const getServerStudioState = () => ABSENT_STUDIO;

export const STUDIO_VOICES = [
  { id: "af_heart", label: "Heart", accent: "US", gender: "Female" },
  { id: "af_bella", label: "Bella", accent: "US", gender: "Female" },
  { id: "am_michael", label: "Michael", accent: "US", gender: "Male" },
  { id: "am_fenrir", label: "Fenrir", accent: "US", gender: "Male" },
  { id: "bf_emma", label: "Emma", accent: "UK", gender: "Female" },
  { id: "bf_isabella", label: "Isabella", accent: "UK", gender: "Female" },
  { id: "bm_george", label: "George", accent: "UK", gender: "Male" },
  { id: "bm_fable", label: "Fable", accent: "UK", gender: "Male" },
] as const;
export const STUDIO_DOWNLOAD_MB = 92;

/* ---------------------------------- helpers ---------------------------------- */

const isBrowser = () => typeof window !== "undefined";
const isWordLike = (text: string) => /^[A-Za-z][A-Za-z'-]{0,40}$/.test(text.trim());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A 60 ms silent WAV, played inside the tap handler to unlock audio on iOS/Safari. */
let silentUrl = "";
function silentWav() {
  if (silentUrl) return silentUrl;
  const rate = 8000;
  const samples = 480;
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + samples, true);
  w(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  w(36, "data");
  v.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 128);
  silentUrl = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  return silentUrl;
}

function pcmToWav(pcm: Float32Array, rate: number) {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + pcm.length * 2, true);
  w(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

/* ------------------------------ shared audio element ------------------------------ */

let audioEl: HTMLAudioElement | null = null;
let objectUrl = "";

function audio() {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = "auto";
    (audioEl as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
  }
  return audioEl;
}

/** Must run synchronously inside the user's tap so later (async) playback is allowed. */
function unlockAudio() {
  const el = audio();
  if (el.dataset.unlocked === "1") return;
  try {
    el.src = silentWav();
    el.muted = true;
    void el.play().then(
      () => {
        el.pause();
        el.muted = false;
        el.dataset.unlocked = "1";
      },
      () => {
        el.muted = false;
      },
    );
  } catch {
    /* ignore */
  }
}

function playUrl(url: string, rate: number, token: number) {
  return new Promise<void>((resolve, reject) => {
    const el = audio();
    el.pause();
    el.muted = false;
    el.src = url;
    el.playbackRate = rate;
    (el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    const cleanup = () => {
      el.onended = null;
      el.onerror = null;
      el.onpause = null;
    };
    el.onended = () => {
      cleanup();
      resolve();
    };
    el.onpause = () => {
      if (token !== playToken) {
        cleanup();
        resolve();
      }
    };
    el.onerror = () => {
      cleanup();
      reject(new Error("audio error"));
    };
    el.play().catch((err: unknown) => {
      cleanup();
      reject(err instanceof Error ? err : new Error("play failed"));
    });
  });
}

/* --------------------------------- recordings --------------------------------- */

interface Recording {
  url: string;
  accent: "US" | "UK" | "other";
  label: string;
}

const REC_KEY = "vb-recordings-v1";
const REC_TTL = 30 * 86_400_000;
const recMem = new Map<string, { r: Recording[]; t: number }>();
const recInflight = new Map<string, Promise<Recording[]>>();
let recLoaded = false;
let recSaveTimer: ReturnType<typeof setTimeout> | undefined;

function loadRecCache() {
  if (recLoaded || !isBrowser()) return;
  recLoaded = true;
  try {
    const raw = JSON.parse(localStorage.getItem(REC_KEY) || "{}") as Record<string, { r: Recording[]; t: number }>;
    for (const [k, v] of Object.entries(raw)) if (v && Array.isArray(v.r) && Date.now() - v.t < REC_TTL) recMem.set(k, v);
  } catch {
    /* ignore */
  }
}

function saveRecCache() {
  clearTimeout(recSaveTimer);
  recSaveTimer = setTimeout(() => {
    try {
      const entries = [...recMem.entries()].sort((a, b) => b[1].t - a[1].t).slice(0, 600);
      localStorage.setItem(REC_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch {
      /* storage full */
    }
  }, 800);
}

function accentOf(file: string, label: string): Recording["accent"] {
  if (/^en-us-/i.test(file) || /\b(US|GenAm|General American|American|Canada|CA)\b/.test(label)) return /\bCA|Canada/.test(label) ? "other" : "US";
  if (/^en-(uk|gb)-/i.test(file) || /\b(UK|RP|British|England|English|London|Received Pronunciation|Southern England)\b/.test(label)) return "UK";
  return "other";
}

async function wiktionaryFiles(title: string) {
  const url = `https://en.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json&formatversion=2&redirects=1&origin=*`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return [];
  const data = (await res.json()) as { parse?: { wikitext?: string } };
  const text = data.parse?.wikitext ?? "";
  const start = text.indexOf("==English==");
  if (start < 0) return [];
  const rest = text.slice(start + 11);
  const next = rest.search(/\n==[^=]/);
  const english = next > 0 ? rest.slice(0, next) : rest;
  const out: { file: string; label: string }[] = [];
  for (const m of english.matchAll(/\{\{\s*audio\s*\|\s*en\s*\|([^|}]+)((?:\|[^}]*)?)\}\}/gi)) {
    const file = m[1].trim();
    if (!/\.(ogg|oga|mp3|wav|flac|opus)$/i.test(file)) continue;
    const label = (m[2] || "").replace(/^\|/, "").replace(/\ba=/, "").trim();
    out.push({ file, label });
  }
  return out.slice(0, 6);
}

async function commonsUrls(files: { file: string; label: string }[]) {
  const titles = files.map((f) => `File:${f.file}`).join("|");
  const url = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}&prop=videoinfo&viprop=url|derivatives&format=json&formatversion=2&origin=*`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    query?: {
      normalized?: { from: string; to: string }[];
      pages?: { title: string; videoinfo?: { url?: string; derivatives?: { type?: string; src?: string }[] }[] }[];
    };
  };
  const toTitle = new Map((data.query?.normalized ?? []).map((n) => [n.from, n.to]));
  const byTitle = new Map((data.query?.pages ?? []).map((p) => [p.title, p]));
  const canOgg = !!audio().canPlayType('audio/ogg; codecs="vorbis"');
  const out: Recording[] = [];
  for (const f of files) {
    const raw = `File:${f.file}`;
    const page = byTitle.get(toTitle.get(raw) ?? raw) ?? byTitle.get(raw.replace(/_/g, " "));
    const info = page?.videoinfo?.[0];
    if (!info) continue;
    const mp3 = info.derivatives?.find((d) => d.type?.startsWith("audio/mpeg"))?.src;
    const src = mp3 || (canOgg || !/\.og[ga]/i.test(info.url ?? "") ? info.url : undefined);
    if (src) out.push({ url: src, accent: accentOf(f.file, f.label), label: f.label });
  }
  return out;
}

async function resolveRecordings(word: string): Promise<Recording[]> {
  const key = word.trim().toLowerCase();
  loadRecCache();
  const hit = recMem.get(key);
  if (hit) return hit.r;
  let job = recInflight.get(key);
  if (!job) {
    job = (async () => {
      try {
        let files = await wiktionaryFiles(key);
        if (!files.length && word.trim() !== key) files = await wiktionaryFiles(word.trim());
        const recs = files.length ? await commonsUrls(files) : [];
        recMem.set(key, { r: recs, t: Date.now() });
        saveRecCache();
        return recs;
      } catch {
        return []; // offline or blocked — not cached, try again later
      } finally {
        recInflight.delete(key);
      }
    })();
    recInflight.set(key, job);
  }
  return job;
}

function pickRecording(recs: Recording[]) {
  const order: Recording["accent"][] = prefs.lang === "en-GB" ? ["UK", "US", "other"] : ["US", "UK", "other"];
  for (const accent of order) {
    const r = recs.find((x) => x.accent === accent);
    if (r) return r;
  }
  return recs[0] ?? null;
}

/** Warm the cache so the next tap plays instantly. */
export function prefetchPronunciation(word: string) {
  if (!isBrowser() || !prefs.recordings || prefs.engine === "device" || !isWordLike(word) || !navigator.onLine) return;
  void resolveRecordings(word);
}

/* ------------------------------ device voices ------------------------------ */

let voicesCache: SpeechSynthesisVoice[] = [];

function loadVoices(timeout = 1500): Promise<SpeechSynthesisVoice[]> {
  if (!isBrowser() || !("speechSynthesis" in window)) return Promise.resolve([]);
  const now = window.speechSynthesis.getVoices();
  if (now.length) {
    voicesCache = now;
    return Promise.resolve(now);
  }
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      voicesCache = window.speechSynthesis.getVoices();
      resolve(voicesCache);
    };
    const timer = setTimeout(done, timeout);
    window.speechSynthesis.addEventListener("voiceschanged", done);
  });
}

const BAD_VOICE = /compact|espeak|novelty|eloquence|albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|grandma|grandpa|rocko|shelley|flo|reed|sandy/i;

function qualityOf(v: SpeechSynthesisVoice): VoiceInfo["quality"] {
  if (/natural|neural|premium|siri|online/i.test(v.name) || (/google/i.test(v.name) && !v.localService)) return "natural";
  if (/enhanced|google|samantha|daniel|karen|serena|moira|tessa|ava|allison|zoe/i.test(v.name)) return "enhanced";
  return "standard";
}

function scoreVoice(v: SpeechSynthesisVoice, lang: string) {
  const vl = v.lang.replace("_", "-").toLowerCase();
  let s = vl === lang.toLowerCase() ? 60 : vl.startsWith("en") ? 25 : -200;
  const q = qualityOf(v);
  s += q === "natural" ? 45 : q === "enhanced" ? 25 : 0;
  if (!v.localService) s += 6;
  if (v.default) s += 2;
  if (BAD_VOICE.test(v.name)) s -= 80;
  return s;
}

export async function listDeviceVoices(): Promise<VoiceInfo[]> {
  const voices = await loadVoices();
  const lang = prefs.lang;
  return voices
    .filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("en") && !BAD_VOICE.test(v.name))
    .sort((a, b) => scoreVoice(b, lang) - scoreVoice(a, lang))
    .map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang.replace("_", "-"), quality: qualityOf(v), local: v.localService }));
}

function bestVoice() {
  const lang = prefs.lang;
  if (prefs.voiceURI) {
    const chosen = voicesCache.find((v) => v.voiceURI === prefs.voiceURI);
    if (chosen) return chosen;
  }
  return [...voicesCache].sort((a, b) => scoreVoice(b, lang) - scoreVoice(a, lang))[0];
}

/** Splits text into short sentences: long utterances get cut off in Chrome after ~15 s. */
function chunks(text: string) {
  const parts = text.replace(/\s+/g, " ").match(/[^.!?;:]+[.!?;:]*|\S+/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + p).length > 180 && cur) {
      out.push(cur.trim());
      cur = "";
    }
    cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function speakDevice(text: string, rate: number, token: number) {
  if (!("speechSynthesis" in window)) throw new Error("no speech");
  const synth = window.speechSynthesis;
  await loadVoices();
  if (token !== playToken) return;
  synth.cancel();
  await sleep(40); // Chrome drops a speak() that immediately follows cancel()
  const voice = bestVoice();
  speech.set({ status: "speaking", source: "device", label: voice ? voice.name : "Device voice" });
  for (const part of chunks(text)) {
    if (token !== playToken) return;
    await new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(part);
      u.lang = voice?.lang ?? prefs.lang;
      if (voice) u.voice = voice;
      u.rate = rate;
      u.pitch = prefs.pitch;
      const keepAlive = setInterval(() => {
        // Chrome (desktop) pauses long speech silently; nudging keeps it going.
        if (synth.speaking && !synth.paused) {
          synth.pause();
          synth.resume();
        }
      }, 10000);
      const end = () => {
        clearInterval(keepAlive);
        resolve();
      };
      u.onend = end;
      u.onerror = end;
      synth.speak(u);
      if (/Chrome/.test(navigator.userAgent) && synth.paused) synth.resume();
    });
  }
}

/* ------------------------------ studio (AI) voice ------------------------------ */

let worker: Worker | null = null;
let reqId = 0;
const pending = new Map<number, { resolve: (v: { pcm: Float32Array; rate: number }) => void; reject: (e: Error) => void }>();

/** Optional custom model hosts, e.g. localStorage["vb-model-hosts"] = '["https://my-mirror.example/"]'. */
function modelHosts(): string[] | undefined {
  try {
    const v = JSON.parse(localStorage.getItem("vb-model-hosts") || "null") as unknown;
    return Array.isArray(v) && v.every((h) => typeof h === "string" && /^https?:\/\//.test(h)) ? (v as string[]) : undefined;
  } catch {
    return undefined;
  }
}

function getWorker() {
  if (worker) return worker;
  // Prebuilt from scripts/tts-worker.ts (see the note there) — a plain same-origin file, no bundler magic.
  worker = new Worker("/tts-worker.js", { type: "module" });
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data as { type: string; id?: number; pcm?: Float32Array; rate?: number; error?: string; progress?: number; loaded?: number; total?: number };
    if (m.type === "progress") studio.set({ status: "loading", progress: m.progress ?? 0, loaded: m.loaded ?? 0, total: m.total ?? 0 });
    else if (m.type === "ready") {
      studio.set({ status: "ready", progress: 1, error: "" });
      try {
        localStorage.setItem(STUDIO_FLAG, "1");
      } catch {
        /* ignore */
      }
    } else if (m.type === "error") studio.set({ status: "error", error: m.error || "Couldn't load the AI voice" });
    else if (m.type === "audio" && m.id !== undefined) {
      pending.get(m.id)?.resolve({ pcm: m.pcm as Float32Array, rate: m.rate ?? 24000 });
      pending.delete(m.id);
    } else if (m.type === "speak-error" && m.id !== undefined) {
      pending.get(m.id)?.reject(new Error(m.error || "speech failed"));
      pending.delete(m.id);
    }
  };
  worker.onerror = () => {
    studio.set({ status: "error", error: "The AI voice couldn't start on this device." });
    for (const p of pending.values()) p.reject(new Error("worker failed"));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export function studioInstalled() {
  try {
    return localStorage.getItem(STUDIO_FLAG) === "1";
  } catch {
    return false;
  }
}

/** Downloads (first time) and warms up the on-device AI voice. */
export function loadStudioVoice() {
  if (!isBrowser()) return;
  if (studio.get().status === "ready" || studio.get().status === "loading") return;
  studio.set({ status: "loading", progress: 0, error: "" });
  getWorker().postMessage({ type: "load", hosts: modelHosts() });
}

export async function removeStudioVoice() {
  worker?.terminate();
  worker = null;
  try {
    localStorage.removeItem(STUDIO_FLAG);
    await caches.delete("transformers-cache");
    await caches.delete("kokoro-voices");
  } catch {
    /* ignore */
  }
  studio.set({ status: "absent", progress: 0, loaded: 0, total: 0, error: "" });
}

function studioGenerate(text: string, speed: number) {
  return new Promise<{ pcm: Float32Array; rate: number }>((resolve, reject) => {
    const id = ++reqId;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ type: "speak", id, text: text.slice(0, 600), voice: prefs.studioVoice, speed, hosts: modelHosts() });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error("timeout"));
      }
    }, 45000);
  });
}

/* ---------------------------------- public API ---------------------------------- */

let playToken = 0;

export function stopSpeech() {
  playToken++;
  try {
    audioEl?.pause();
  } catch {
    /* ignore */
  }
  if (isBrowser() && "speechSynthesis" in window) window.speechSynthesis.cancel();
  speech.set({ status: "idle", text: "", source: null, label: "" });
}

export function speechSupported() {
  return isBrowser() && ("speechSynthesis" in window || typeof Audio !== "undefined");
}

/**
 * Speaks `text` with the best available engine. Call it directly from a tap/click handler.
 * Returns false only when the browser can't produce speech at all.
 */
export function speakText(text: string, opts: { rate?: number } = {}): boolean {
  const clean = (text || "").trim();
  if (!clean || !speechSupported()) return false;
  unlockAudio();
  stopSpeech();
  const token = ++playToken;
  speech.set({ status: "loading", text: clean, source: null, label: "" });

  void (async () => {
    try {
      // 1. Real recording for single words (natural speed unless a slower rate was asked for).
      if (prefs.recordings && prefs.engine !== "device" && isWordLike(clean) && navigator.onLine) {
        const recs = await Promise.race([resolveRecordings(clean), sleep(1600).then(() => null)]);
        if (token !== playToken) return;
        const rec = recs ? pickRecording(recs) : null;
        if (rec) {
          try {
            speech.set({ status: "speaking", source: "recording", label: `Real recording · ${rec.accent === "other" ? "English" : rec.accent}` });
            await playUrl(rec.url, opts.rate && opts.rate < 0.9 ? Math.max(0.5, opts.rate + 0.1) : 1, token);
            return;
          } catch {
            /* fall through */
          }
        }
      }
      // 2. On-device AI voice.
      if (prefs.engine === "studio" && (studio.get().status === "ready" || studioInstalled())) {
        try {
          if (studio.get().status !== "ready") loadStudioVoice();
          const out = await studioGenerate(clean, Math.min(1.3, Math.max(0.6, (opts.rate ?? prefs.rate) + 0.05)));
          if (token !== playToken) return;
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = URL.createObjectURL(pcmToWav(out.pcm, out.rate));
          speech.set({ status: "speaking", source: "studio", label: "AI voice" });
          await playUrl(objectUrl, 1, token);
          return;
        } catch {
          /* fall through to the device voice */
        }
      }
      // 3. Best device voice.
      if (token !== playToken) return;
      await speakDevice(clean, opts.rate ?? prefs.rate, token);
    } catch {
      /* nothing else to try */
    } finally {
      if (token === playToken) speech.set({ status: "idle", text: "", source: null, label: "" });
    }
  })();
  return true;
}

