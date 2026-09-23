"use client";

import { Volume1, Volume2, Wand2, Sparkles, Play, Pause, Mic, Gem, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSettings } from "@/lib/settings";
import { getVoiceCatalog, currentVoice, setPreferredVoice, speakText, subscribe, type Voice } from "@/lib/tts";
import { cn, speak } from "@/lib/utils";
import { Button, Card, SectionTitle, Segmented, Switch, IconTile } from "./ui";

function VoiceChip({ voice, active, onSelect }: { voice: Voice; active: boolean; onSelect: () => void }) {
  const premium = voice.quality.microsoftNeural || voice.quality.googleNeural;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "surface flex min-w-0 flex-col rounded-[18px] p-3 text-left transition active:scale-[0.98]",
        active && "brand-gradient !border-transparent !text-white shadow-lg shadow-brand-500/25",
        !active && "hover:-translate-y-0.5",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {premium && <Gem className={cn("size-3.5 shrink-0", !active && "text-brand-500")} />}
        <span className="truncate text-[13px] font-bold leading-tight">{voice.shortName}</span>
        {voice.default && (
          <span className={cn("rounded-full px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide", active ? "bg-white/20" : "bg-black/[0.05] dark:bg-white/10")}>
            Default
          </span>
        )}
      </div>
      <div className={cn("mt-1 text-[11px] leading-snug", active ? "text-white/85" : "text-muted")}>
        {voice.quality.why}
      </div>
      <div className={cn("mt-2 flex items-center justify-between text-[10.5px] font-semibold", active ? "text-white/80" : "text-muted")}>
        <span className="uppercase tracking-wider">{voice.lang}</span>
        <span>{voice.localService ? "On-device" : "Online"}</span>
      </div>
    </button>
  );
}

export function TtsSettingsCard() {
  const { settings, update } = useSettings();
  const [catalog, setCatalog] = useState<ReturnType<typeof getVoiceCatalog>>({ loaded: false, voices: [] });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [testing, setTesting] = useState<"normal" | "slow" | "fast" | null>(null);

  useEffect(() => subscribe(() => setCatalog(getVoiceCatalog())), []);
  useEffect(() => {
    const cur = currentVoice();
    if (cur) setActiveId(cur.id);
  }, [catalog]);

  const topVoices = useMemo(() => catalog.voices.slice(0, 6), [catalog.voices]);
  const using = catalog.voices.find((v) => v.id === activeId);

  const test = async (which: "normal" | "slow" | "fast") => {
    setTesting(which);
    try {
      const line = using
        ? `Hi, I'm ${using.shortName}. This is how VocaBera sounds with my voice.`
        : "Hello from VocaBera. I'm your clear vocabulary voice.";
      const rate = which === "slow" ? Math.max(0.6, settings.speechRate - 0.25) : which === "fast" ? Math.min(1.6, settings.speechRate + 0.25) : settings.speechRate;
      speakText(line, { rate, voiceId: activeId ?? undefined });
    } catch {
      toast.error("Speech synthesis is not supported in this browser");
    } finally {
      setTimeout(() => setTesting(null), 2200);
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <SectionTitle
        title="Pronunciation voice"
        className="!px-0"
        action={
          <Button size="sm" variant="soft" icon={Volume2} onClick={() => speak("VocaBera makes vocabulary effortless to learn.")}>
            Quick test
          </Button>
        }
      />

      <div className="mb-3 flex items-center gap-2 rounded-2xl bg-black/[0.035] px-3.5 py-3 dark:bg-white/[0.05]">
        <IconTile icon={Sparkles} tone="brand" size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">
            {using ? `${using.shortName} selected` : "Automatically picks the clearest voice on your device"}
          </div>
          <div className="text-xs text-muted">
            {using ? using.quality.why : "Uses Microsoft Edge and Google neural voices when available, then your system's best voice."}
          </div>
        </div>
      </div>

      {catalog.loaded && topVoices.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {topVoices.map((v) => (
            <VoiceChip
              key={v.id}
              voice={v}
              active={activeId === v.id}
              onSelect={() => {
                setActiveId(v.id);
                setPreferredVoice(v.id);
                toast.success(`Using ${v.shortName}`, { description: v.quality.why });
              }}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl bg-black/[0.035] px-4 py-4 text-center text-[13px] text-muted dark:bg-white/[0.05]">
          Loading voices from this device… If none appear shortly, pronunciation uses the browser's default voice.
        </p>
      )}

      <div className="mt-4 border-t border-[var(--line)] pt-4">
        <Segmented<"en-US" | "en-GB">
          value={settings.voice}
          onChange={(v) => {
            update({ voice: v });
            setPreferredVoice(null);
            const text = v === "en-GB" ? "Hello, I'm your clear British guide." : "Hi, I'm your clear American guide.";
            speakText(text);
          }}
          options={[
            { value: "en-US", label: "American", icon: Mic },
            { value: "en-GB", label: "British", icon: Wand2 },
          ]}
        />

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between px-1 text-[12.5px] font-semibold text-muted">
            <span>Speech speed</span>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => test("slow")} aria-label="Play slower sample" title="Slower" className="grid size-8 place-items-center rounded-full surface text-muted hover:text-fg">
                {testing === "slow" ? <Pause className="size-4" /> : <Play className="size-4" />}
              </button>
              <button type="button" onClick={() => test("normal")} aria-label="Play normal sample" title="Normal" className="grid size-8 place-items-center rounded-full surface text-muted hover:text-fg">
                {testing === "normal" ? <Pause className="size-4" /> : <Play className="size-4" />}
              </button>
              <button type="button" onClick={() => test("fast")} aria-label="Play faster sample" title="Faster" className="grid size-8 place-items-center rounded-full surface text-muted hover:text-fg">
                {testing === "fast" ? <Pause className="size-4" /> : <Play className="size-4" />}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 px-1">
            <Volume1 className="size-4 text-muted" />
            <input
              type="range"
              min={0.6}
              max={1.4}
              step={0.05}
              value={settings.speechRate}
              onChange={(e) => update({ speechRate: Number(e.target.value) })}
              className="h-2 flex-1 accent-brand-500"
              aria-label="Speech speed"
            />
            <span className="w-10 text-right text-[13px] font-bold tabular-nums">{settings.speechRate.toFixed(2)}×</span>
          </div>
        </div>

        {catalog.voices.some((v) => v.quality.microsoftNeural || v.quality.googleNeural) && (
          <p className="mt-3 flex items-start gap-1.5 rounded-2xl bg-emerald-500/10 px-3 py-2.5 text-[12px] font-semibold text-emerald-700 dark:text-emerald-300">
            <RotateCcw className="mt-0.5 size-3.5 shrink-0" />
            Great! Your browser has a natural-sounding online voice installed, so VocaBera sounds much clearer.
          </p>
        )}
      </div>
    </Card>
  );
}
