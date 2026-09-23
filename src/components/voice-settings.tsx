"use client";

import { AudioLines, BrainCircuit, Check, Download, LoaderCircle, Mic, Play, Smartphone, Trash, Volume2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useSettings } from "@/lib/settings";
import {
  STUDIO_DOWNLOAD_MB,
  STUDIO_VOICES,
  getServerSpeechState,
  getServerStudioState,
  getSpeechState,
  getStudioState,
  listDeviceVoices,
  loadStudioVoice,
  removeStudioVoice,
  studioInstalled,
  subscribeSpeech,
  subscribeStudio,
  type VoiceInfo,
} from "@/lib/tts";
import { cn, speak } from "@/lib/utils";
import { Button, Card, IconTile, Segmented, SectionTitle, Switch, type IconType } from "./ui";

type Engine = "natural" | "studio" | "device";

const ENGINES: { value: Engine; label: string; icon: IconType; text: string }[] = [
  { value: "natural", label: "Natural", icon: Mic, text: "Real human recordings for words, plus the clearest voice on your device for sentences." },
  { value: "studio", label: "AI Studio", icon: BrainCircuit, text: "A neural voice that runs on this device (Kokoro). Very clear, works offline after a one-time download." },
  { value: "device", label: "Device", icon: Smartphone, text: "Only your device's built-in voices. Smallest and fastest." },
];

const QUALITY_BADGE: Record<VoiceInfo["quality"], string> = {
  natural: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  enhanced: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  standard: "bg-black/[0.05] text-muted dark:bg-white/[0.06]",
};

const mb = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

export function VoiceSettingsCard() {
  const { settings, update } = useSettings();
  const speech = useSyncExternalStore(subscribeSpeech, getSpeechState, getServerSpeechState);
  const studio = useSyncExternalStore(subscribeStudio, getStudioState, getServerStudioState);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    let alive = true;
    void listDeviceVoices().then((v) => alive && setVoices(v));
    setInstalled(studioInstalled());
    return () => {
      alive = false;
    };
  }, [settings.voice]);

  useEffect(() => {
    if (studio.status === "ready") setInstalled(true);
    if (studio.status === "error" && studio.error) toast.error("AI voice couldn't be loaded", { id: "vb-studio", description: studio.error });
  }, [studio.status, studio.error]);

  const engine = settings.ttsEngine;
  const studioReady = studio.status === "ready" || installed;
  const voicesForAccent = STUDIO_VOICES.filter((v) => (settings.voice === "en-GB" ? v.accent === "UK" : v.accent === "US"));

  const chooseEngine = (value: Engine) => {
    update({ ttsEngine: value });
    if (value === "studio" && !studioReady && studio.status !== "loading") {
      toast.message(`Download the AI voice (${STUDIO_DOWNLOAD_MB} MB) to use it`, { description: "Until then, VocaBera uses natural recordings and your device's voice." });
    }
  };

  const setAccent = (value: "en-US" | "en-GB") => {
    const current = STUDIO_VOICES.find((v) => v.id === settings.ttsStudioVoice);
    const wanted = value === "en-GB" ? "UK" : "US";
    update({
      voice: value,
      ttsVoiceURI: "",
      ...(current && current.accent !== wanted ? { ttsStudioVoice: wanted === "UK" ? "bf_emma" : "af_heart" } : {}),
    });
  };

  const sourceLabel =
    speech.status === "speaking" ? speech.label : speech.status === "loading" ? "Preparing…" : engine === "studio" && studioReady ? "AI voice ready" : "Ready";

  return (
    <Card className="p-4 sm:p-5">
      <SectionTitle
        title="Voice & pronunciation"
        className="!px-0"
        action={
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold", speech.status !== "idle" ? "bg-brand-500/12 text-brand-700 dark:text-brand-200" : "bg-black/[0.05] text-muted dark:bg-white/[0.06]")}>
            {speech.status === "loading" ? <LoaderCircle className="size-3 animate-spin" /> : <AudioLines className={cn("size-3", speech.status === "speaking" && "animate-pulse")} />}
            {sourceLabel}
          </span>
        }
      />

      <div className="grid grid-cols-3 gap-2">
        {ENGINES.map((e) => {
          const on = engine === e.value;
          return (
            <button
              key={e.value}
              type="button"
              onClick={() => chooseEngine(e.value)}
              aria-pressed={on}
              className={cn(
                "relative flex flex-col items-start rounded-[18px] p-3 text-left transition active:scale-[0.98]",
                on ? "bg-brand-500/10 ring-2 ring-brand-500/60 dark:bg-brand-400/10" : "bg-black/[0.035] hover:bg-black/[0.06] dark:bg-white/[0.05] dark:hover:bg-white/[0.08]",
              )}
            >
              <e.icon className={cn("size-5", on ? "text-brand-600 dark:text-brand-300" : "text-muted")} />
              <span className="mt-1.5 text-[13px] font-bold">{e.label}</span>
              {on && (
                <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full brand-gradient text-white">
                  <Check className="size-3" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 px-1 text-xs leading-relaxed text-muted">{ENGINES.find((e) => e.value === engine)?.text}</p>

      {engine === "studio" && (
        <div className="mt-4 rounded-[20px] bg-linear-to-br from-violet-500/10 to-brand-500/5 p-3.5 ring-1 ring-violet-500/15">
          <div className="flex items-center gap-3">
            <IconTile icon={BrainCircuit} tone="violet" size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">AI Studio voice</div>
              <div className="text-xs text-muted">
                {studio.status === "loading"
                  ? studio.total
                    ? `Downloading… ${mb(studio.loaded)} of ${mb(studio.total)}`
                    : "Starting download…"
                  : studioReady
                    ? "Installed on this device · works offline"
                    : `One-time download · about ${STUDIO_DOWNLOAD_MB} MB (use Wi‑Fi)`}
              </div>
            </div>
            {studioReady && studio.status !== "loading" ? (
              <Button
                size="sm"
                variant="ghost"
                icon={Trash}
                aria-label="Remove AI voice"
                onClick={async () => {
                  await removeStudioVoice();
                  setInstalled(false);
                  toast.message("AI voice removed from this device");
                }}
              />
            ) : (
              <Button size="sm" icon={Download} loading={studio.status === "loading"} onClick={() => loadStudioVoice()}>
                Download
              </Button>
            )}
          </div>
          {studio.status === "loading" && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/10">
              <div className="h-full rounded-full brand-gradient transition-[width] duration-300" style={{ width: `${Math.max(3, Math.round(studio.progress * 100))}%` }} />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {voicesForAccent.map((v) => {
              const on = settings.ttsStudioVoice === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => update({ ttsStudioVoice: v.id })}
                  aria-pressed={on}
                  className={cn(
                    "inline-flex h-8 items-center gap-1 rounded-full px-3 text-[12.5px] font-semibold transition",
                    on ? "brand-gradient text-white shadow-md shadow-brand-500/25" : "surface text-fg/80 hover:text-fg",
                  )}
                >
                  {v.label}
                  <span className={cn("text-[10.5px] font-medium", on ? "text-white/80" : "text-muted")}>{v.gender}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="mb-2 px-1 text-[13px] font-semibold text-fg/80">Accent</div>
        <Segmented<"en-US" | "en-GB">
          value={settings.voice}
          onChange={setAccent}
          options={[
            { value: "en-US", label: "American" },
            { value: "en-GB", label: "British" },
          ]}
        />
      </div>

      {engine !== "studio" && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[13px] font-semibold text-fg/80">Device voice</span>
            <span className="text-[11px] text-muted">{voices.length ? `${voices.length} English voices` : "Loading voices…"}</span>
          </div>
          <select
            aria-label="Device voice"
            value={settings.ttsVoiceURI}
            onChange={(e) => update({ ttsVoiceURI: e.target.value })}
            className="field h-11 w-full appearance-none px-3.5 text-sm font-medium"
          >
            <option value="">Automatic — clearest available</option>
            {voices.map((v) => (
              <option key={v.uri} value={v.uri}>
                {v.name} · {v.lang}
                {v.quality === "natural" ? " · Natural" : v.quality === "enhanced" ? " · Enhanced" : ""}
              </option>
            ))}
          </select>
          {voices[0] && !settings.ttsVoiceURI && (
            <p className="mt-1.5 flex items-center gap-1.5 px-1 text-xs text-muted">
              Best match: <b className="text-fg">{voices[0].name}</b>
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold capitalize", QUALITY_BADGE[voices[0].quality])}>{voices[0].quality}</span>
            </p>
          )}
        </div>
      )}

      {engine !== "device" && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-black/[0.035] px-4 py-3 dark:bg-white/[0.05]">
          <span className="min-w-0">
            <span className="block text-sm font-bold">Real recordings for words</span>
            <span className="block text-xs text-muted">Native-speaker audio from Wiktionary when available</span>
          </span>
          <Switch checked={settings.ttsRecordings} onChange={(v) => update({ ttsRecordings: v })} label="Real recordings for words" />
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-3 px-1">
          <span className="w-12 text-[13px] font-semibold text-muted">Speed</span>
          <input
            type="range"
            min={0.6}
            max={1.3}
            step={0.05}
            value={settings.speechRate}
            onChange={(e) => update({ speechRate: Number(e.target.value) })}
            className="h-2 flex-1 accent-brand-500"
            aria-label="Speech speed"
          />
          <span className="w-10 text-right text-[13px] font-bold tabular-nums">{settings.speechRate.toFixed(2)}×</span>
        </label>
        <label className="flex items-center gap-3 px-1">
          <span className="w-12 text-[13px] font-semibold text-muted">Pitch</span>
          <input
            type="range"
            min={0.8}
            max={1.2}
            step={0.05}
            value={settings.ttsPitch}
            onChange={(e) => update({ ttsPitch: Number(e.target.value) })}
            className="h-2 flex-1 accent-brand-500"
            aria-label="Voice pitch"
            disabled={engine === "studio"}
          />
          <span className="w-10 text-right text-[13px] font-bold tabular-nums">{settings.ttsPitch.toFixed(2)}</span>
        </label>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="soft" icon={Volume2} onClick={() => speak("Serendipity")}>
          Test a word
        </Button>
        <Button variant="soft" icon={Play} onClick={() => speak("Meeting her at the café was pure serendipity, and it changed my life.")}>
          Test a sentence
        </Button>
      </div>
    </Card>
  );
}
