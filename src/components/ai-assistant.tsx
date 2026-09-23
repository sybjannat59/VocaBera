"use client";

import { BookOpen, BrainCircuit, Check, CircleCheck, CircleX, Languages, LoaderCircle, Quote, Sparkles, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AutofillSource {
  id: string;
  name: string;
  ok: boolean;
  count: number;
  ms: number;
}

export interface AutofillAlternatives {
  definitions: string[];
  examples: string[];
  bangla: string[];
}

export type AssistantPhase = "idle" | "sources" | "ai" | "done" | "error";

export interface AssistantState {
  phase: AssistantPhase;
  word: string;
  sources: AutofillSource[];
  provider: string;
  aiUsed: boolean;
  filled: string[];
  alternatives: AutofillAlternatives;
  error: string;
}

export const EMPTY_ASSISTANT: AssistantState = {
  phase: "idle",
  word: "",
  sources: [],
  provider: "",
  aiUsed: false,
  filled: [],
  alternatives: { definitions: [], examples: [], bangla: [] },
  error: "",
};

const FIELD_LABELS: Record<string, string> = {
  pronunciation: "Pronunciation",
  partOfSpeech: "Part of speech",
  banglaMeaning: "Bangla",
  englishMeaning: "Definition",
  synonyms: "Synonyms",
  antonyms: "Antonyms",
  example: "Example",
  prefix: "Prefix",
  rootWord: "Root",
  suffix: "Suffix",
  mnemonic: "Mnemonic",
  etymology: "Origin",
  notes: "Notes",
  difficulty: "Difficulty",
};

function Step({ state, label, detail }: { state: "wait" | "run" | "ok" | "warn"; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={cn(
          "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
          state === "ok" && "bg-emerald-500 text-white",
          state === "warn" && "bg-amber-500 text-white",
          state === "run" && "bg-brand-500/15 text-brand-600 dark:text-brand-300",
          state === "wait" && "bg-black/[0.06] text-muted dark:bg-white/10",
        )}
      >
        {state === "run" ? <LoaderCircle className="size-3.5 animate-spin" /> : state === "ok" ? <Check className="size-3.5" strokeWidth={3} /> : state === "warn" ? <Sparkles className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-bold">{label}</div>
        {detail && <div className="text-[11.5px] leading-snug text-muted">{detail}</div>}
      </div>
    </div>
  );
}

function AltList({
  icon: Icon,
  title,
  items,
  current,
  bangla,
  onPick,
}: {
  icon: typeof BookOpen;
  title: string;
  items: string[];
  current: string;
  bangla?: boolean;
  onPick: (v: string) => void;
}) {
  const list = items.filter(Boolean);
  if (list.length < 2 && (list[0] ?? "") === current) return null;
  if (!list.length) return null;
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
        <Icon className="size-3.5" /> {title}
      </div>
      <div className={cn(bangla ? "flex flex-wrap gap-1.5" : "space-y-1.5")}>
        {list.map((v) => {
          const active = v.trim() === current.trim();
          return (
            <button
              key={v}
              type="button"
              onClick={() => onPick(v)}
              aria-pressed={active}
              className={cn(
                "text-left transition active:scale-[0.99]",
                bangla ? "rounded-full px-3 py-1.5 font-bangla text-[14px]" : "block w-full rounded-2xl px-3 py-2 text-[13px] leading-snug",
                active ? "bg-brand-500/15 text-brand-800 ring-1 ring-brand-500/40 dark:text-brand-100" : "bg-black/[0.035] hover:bg-black/[0.06] dark:bg-white/[0.05] dark:hover:bg-white/[0.08]",
              )}
            >
              {active && <Check className="mr-1 inline size-3.5 text-brand-600 dark:text-brand-300" strokeWidth={3} />}
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AiAssistantPanel({
  state,
  current,
  onPick,
  onUndo,
  onClose,
}: {
  state: AssistantState;
  current: { englishMeaning: string; banglaMeaning: string; example: string };
  onPick: (field: "englishMeaning" | "banglaMeaning" | "example", value: string) => void;
  onUndo: () => void;
  onClose: () => void;
}) {
  if (state.phase === "idle") return null;
  const okSources = state.sources.filter((s) => s.ok);
  const sourcesStep = state.phase === "sources" ? "run" : state.phase === "error" && !state.sources.length ? "warn" : "ok";
  const aiStep = state.phase === "ai" ? "run" : state.phase === "done" ? (state.aiUsed ? "ok" : "warn") : state.phase === "error" ? "warn" : "wait";

  return (
    <div className="animate-fade-up overflow-hidden rounded-[26px] border border-brand-500/20 bg-linear-to-br from-brand-500/[0.08] via-transparent to-glow-500/[0.08] shadow-[var(--surface-shadow)]">
      <div className="flex items-center gap-2.5 border-b border-[var(--line)] px-4 py-3 sm:px-5">
        <span className="sheen grid size-9 place-items-center rounded-[12px] brand-gradient text-white shadow-lg shadow-brand-500/30">
          <BrainCircuit className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-extrabold tracking-tight">AI assistant</div>
          <div className="truncate text-[11.5px] text-muted">
            {state.phase === "done" ? `Filled ${state.filled.length} field${state.filled.length === 1 ? "" : "s"} for “${state.word}”` : state.phase === "error" ? state.error : `Researching “${state.word}”…`}
          </div>
        </div>
        {state.filled.length > 0 && state.phase !== "sources" && (
          <button type="button" onClick={onUndo} className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12px] font-bold text-muted hover:bg-black/5 hover:text-fg dark:hover:bg-white/10">
            <Undo2 className="size-3.5" /> Undo
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="Close assistant" className="grid size-8 place-items-center rounded-full text-muted hover:bg-black/5 dark:hover:bg-white/10">
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-3 px-4 py-4 sm:px-5">
        <Step
          state={sourcesStep}
          label="Dictionary research"
          detail={state.sources.length ? `${okSources.length} of ${state.sources.length} sources answered` : "Wiktionary · Datamuse · Tatoeba · MyMemory NMT"}
        />
        {state.sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-8">
            {state.sources.map((s) => (
              <span
                key={s.id}
                title={`${s.ok ? `${s.count} results` : "No data"} · ${s.ms} ms`}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  s.ok ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-black/[0.05] text-muted line-through dark:bg-white/[0.06]",
                )}
              >
                {s.ok ? <CircleCheck className="size-3" /> : <CircleX className="size-3" />}
                {s.name}
              </span>
            ))}
          </div>
        )}
        <Step
          state={aiStep}
          label="AI refinement"
          detail={
            state.phase === "ai"
              ? "Writing a learner-friendly definition, Bangla meaning, word parts & mnemonic — keep editing meanwhile"
              : state.phase === "done"
                ? state.aiUsed
                  ? `Verified by ${state.provider}`
                  : "AI busy — used the built-in morphology engine instead"
                : state.phase === "error"
                  ? "Skipped"
                  : "Waiting for evidence"
          }
        />
        {state.filled.length > 0 && (
          <div className="flex flex-wrap gap-1 pl-8">
            {state.filled.map((f) => (
              <span key={f} className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10.5px] font-bold text-brand-700 dark:text-brand-200">
                {FIELD_LABELS[f] ?? f}
              </span>
            ))}
          </div>
        )}

        {(state.phase === "ai" || state.phase === "done") && (
          <div className="space-y-3 border-t border-[var(--line)] pt-3">
            <AltList icon={Languages} title="Bangla options" items={state.alternatives.bangla} current={current.banglaMeaning} bangla onPick={(v) => onPick("banglaMeaning", v)} />
            <AltList icon={BookOpen} title="Other definitions" items={state.alternatives.definitions} current={current.englishMeaning} onPick={(v) => onPick("englishMeaning", v)} />
            <AltList icon={Quote} title="Real example sentences" items={state.alternatives.examples} current={current.example} onPick={(v) => onPick("example", v)} />
          </div>
        )}
      </div>
    </div>
  );
}
