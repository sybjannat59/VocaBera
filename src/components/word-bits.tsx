"use client";

import {
  BookOpen,
  CalendarDays,
  Copy,
  Hash,
  Languages,
  Lightbulb,
  Link2,
  PenLine,
  Pencil,
  Puzzle,
  Quote,
  Split,
  Star,
  Tag,
  Trash,
  Volume2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { STATUS_META, accuracyOf, isDue, relativeTime, wordStatus } from "@/lib/learning";
import { useVocab, useWordSheet } from "@/lib/store";
import type { Word, WordHistoryItem } from "@/lib/types";
import { cn, findWordInSentence, haptic, speak } from "@/lib/utils";
import { useConfirm } from "./providers";
import { Badge, Button, DifficultyBadge, IconTile, MasteryDots, PosBadge, Sheet, type IconType, type Tone } from "./ui";

export function SpeakButton({ text, size = "md", className }: { text: string; size?: "sm" | "md"; className?: string }) {
  const [on, setOn] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Pronounce ${text}`}
      title="Pronounce"
      onClick={(e) => {
        e.stopPropagation();
        if (speak(text)) {
          setOn(true);
          setTimeout(() => setOn(false), 900);
        } else toast.error("Speech is not supported in this browser");
      }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full transition active:scale-90",
        size === "sm" ? "size-8" : "size-10",
        on ? "bg-brand-500/15 text-brand-600 dark:text-brand-300" : "text-muted hover:bg-black/5 hover:text-fg dark:hover:bg-white/10",
        className,
      )}
    >
      <Volume2 className={cn(size === "sm" ? "size-4" : "size-[19px]", on && "animate-pulse")} />
    </button>
  );
}

export function FavoriteButton({
  id,
  active,
  size = "md",
  className,
}: {
  id: number;
  active: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const { toggleFavorite } = useVocab();
  return (
    <button
      type="button"
      aria-label={active ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation();
        haptic(8);
        toggleFavorite(id);
      }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full transition active:scale-75",
        size === "sm" ? "size-8" : "size-10",
        active ? "text-amber-500" : "text-muted hover:bg-black/5 hover:text-amber-500 dark:hover:bg-white/10",
        className,
      )}
    >
      <Star className={cn(size === "sm" ? "size-4" : "size-[19px]", active && "fill-current")} />
    </button>
  );
}

export function Highlight({ sentence, word, className }: { sentence: string; word: string; className?: string }) {
  const m = findWordInSentence(sentence, word);
  if (!m) return <span className={className}>{sentence}</span>;
  return (
    <span className={className}>
      {sentence.slice(0, m.index)}
      <mark className="rounded-md bg-brand-500/15 px-1 font-semibold text-brand-700 dark:text-brand-200">{m.match}</mark>
      {sentence.slice(m.index + m.length)}
    </span>
  );
}

export function WordPartsView({ w, compact }: { w: Pick<Word, "prefix" | "rootWord" | "suffix">; compact?: boolean }) {
  const parts = [
    { label: "Prefix", value: w.prefix, cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/20" },
    { label: "Root", value: w.rootWord, cls: "bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-500/20" },
    { label: "Suffix", value: w.suffix, cls: "bg-pink-500/10 text-pink-700 dark:text-pink-300 ring-pink-500/20" },
  ].filter((p) => p.value.trim());
  if (!parts.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {parts.map((p, i) => (
        <div key={p.label} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-sm font-bold text-muted">+</span>}
          <div className={cn("rounded-2xl px-3 ring-1", compact ? "py-1" : "py-1.5", p.cls)}>
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{p.label}</div>
            <div className="text-[13px] font-semibold">{p.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

const LETTER_TONES = [
  "bg-sky-500/12 text-sky-600 dark:text-sky-300",
  "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300",
  "bg-violet-500/12 text-violet-600 dark:text-violet-300",
  "bg-amber-500/12 text-amber-600 dark:text-amber-300",
  "bg-pink-500/12 text-pink-600 dark:text-pink-300",
  "bg-teal-500/12 text-teal-600 dark:text-teal-300",
  "bg-indigo-500/12 text-indigo-600 dark:text-indigo-300",
  "bg-rose-500/12 text-rose-600 dark:text-rose-300",
];
export const letterTone = (s: string) => LETTER_TONES[(s.toUpperCase().charCodeAt(0) || 0) % LETTER_TONES.length];

export function StatusPill({ w }: { w: Word }) {
  const meta = STATUS_META[wordStatus(w)];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-semibold", meta.text)}>
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

export const WordCard = memo(function WordCard({
  w,
  view,
  onOpen,
}: {
  w: Word;
  view: "list" | "grid";
  onOpen: (id: number) => void;
}) {
  const open = () => onOpen(w.id);
  const due = isDue(w);
  if (view === "grid") {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => e.key === "Enter" && open()}
        className="surface cv-auto group flex min-h-[138px] cursor-pointer flex-col rounded-[22px] p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]"
      >
        <div className="flex items-start justify-between gap-1">
          <h3 className="break-words text-[17px] font-bold leading-tight tracking-tight">{w.word}</h3>
          <FavoriteButton id={w.id} active={w.isFavorite} size="sm" className="-mr-2 -mt-1.5" />
        </div>
        <p className="mt-1 line-clamp-2 font-bangla text-[15px] leading-snug text-fg/80">{w.banglaMeaning || w.englishMeaning}</p>
        <div className="mt-auto flex items-center justify-between pt-3">
          <StatusPill w={w} />
          <MasteryDots level={w.mastery} />
        </div>
      </div>
    );
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === "Enter" && open()}
      className="surface cv-auto flex cursor-pointer items-start gap-3 rounded-[22px] p-3.5 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.99] sm:p-4"
    >
      <div className={cn("mt-0.5 grid size-11 shrink-0 place-items-center rounded-[14px] text-[17px] font-extrabold", letterTone(w.word))}>
        {w.word[0]?.toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <h3 className="text-[17px] font-bold tracking-tight">{w.word}</h3>
          <PosBadge pos={w.partOfSpeech} />
        </div>
        {w.banglaMeaning && <p className="mt-0.5 line-clamp-1 font-bangla text-[15px] text-fg/85">{w.banglaMeaning}</p>}
        {w.englishMeaning && <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">{w.englishMeaning}</p>}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusPill w={w} />
          <MasteryDots level={w.mastery} />
          {due && <Badge className="bg-amber-500/12 text-amber-700 dark:text-amber-300">Due</Badge>}
        </div>
      </div>
      <div className="-mr-1 -mt-1 flex flex-col items-center">
        <FavoriteButton id={w.id} active={w.isFavorite} size="sm" />
        <SpeakButton text={w.word} size="sm" />
      </div>
    </div>
  );
});

/* ------------------------------ Detail sheet ------------------------------ */

function Section({ icon, tone, title, children }: { icon: IconType; tone: Tone; title: string; children: ReactNode }) {
  return (
    <div className="surface rounded-[22px] p-4">
      <div className="mb-2 flex items-center gap-2">
        <IconTile icon={icon} tone={tone} size="sm" />
        <h4 className="text-[13px] font-bold uppercase tracking-wider text-muted">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function RelationChips({
  items,
  tone,
  lookup,
  onOpen,
}: {
  items: string[];
  tone: "emerald" | "rose";
  lookup: Map<string, number>;
  onOpen: (id: number) => void;
}) {
  const cls = tone === "emerald" ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/12 text-rose-700 dark:text-rose-300";
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => {
        const id = lookup.get(s.toLowerCase());
        return id ? (
          <button key={s} type="button" onClick={() => onOpen(id)} className={cn("h-8 rounded-full px-3 text-[13px] font-semibold underline decoration-dotted underline-offset-4", cls)}>
            {s}
          </button>
        ) : (
          <span key={s} className={cn("inline-flex h-8 items-center rounded-full px-3 text-[13px] font-semibold", cls)}>
            {s}
          </span>
        );
      })}
    </div>
  );
}

function WordDetail({ w, onClose }: { w: Word; onClose: () => void }) {
  const { words, deleteWord } = useVocab();
  const { openWord } = useWordSheet();
  const confirm = useConfirm();
  const router = useRouter();
  const lookup = useMemo(() => new Map(words.map((x) => [x.word.toLowerCase(), x.id])), [words]);
  const acc = accuracyOf(w);
  const [history, setHistory] = useState<WordHistoryItem[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/words/${w.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ history?: WordHistoryItem[] }>) : null))
      .then((d) => alive && setHistory(d?.history ?? []))
      .catch(() => alive && setHistory([]));
    return () => {
      alive = false;
    };
  }, [w.id, w.timesReviewed]);
  const hasParts = !!(w.prefix || w.rootWord || w.suffix);

  const copy = async () => {
    const text = [
      `${w.word}${w.partOfSpeech ? ` (${w.partOfSpeech})` : ""}${w.pronunciation ? ` ${w.pronunciation}` : ""}`,
      w.banglaMeaning && `বাংলা: ${w.banglaMeaning}`,
      w.englishMeaning && `Meaning: ${w.englishMeaning}`,
      w.synonyms.length ? `Synonyms: ${w.synonyms.join(", ")}` : "",
      w.antonyms.length ? `Antonyms: ${w.antonyms.join(", ")}` : "",
      w.example && `Example: ${w.example}`,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy");
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${w.word}”?`,
      message: "This word and its learning progress will be removed.",
      confirmText: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    onClose();
    await deleteWord(w.id);
  };

  return (
    <div className="pb-4">
      <div className="relative px-5 pb-4 pt-3 sm:px-6 sm:pt-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-linear-to-b from-brand-500/10 to-transparent" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <PosBadge pos={w.partOfSpeech} />
              <DifficultyBadge level={w.difficulty} />
              <StatusPill w={w} />
            </div>
            <h2 className="mt-2 break-words text-[34px] font-extrabold leading-tight tracking-tight">{w.word}</h2>
            {w.pronunciation && <p className="text-sm font-medium text-muted">{w.pronunciation}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <SpeakButton text={w.word} className="surface" />
            <FavoriteButton id={w.id} active={w.isFavorite} className="surface" />
          </div>
        </div>
        <div className="relative mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
          <MasteryDots level={w.mastery} />
          <span>Next review: {w.timesReviewed ? relativeTime(w.nextReviewAt) : "not started"}</span>
        </div>
      </div>

      <div className="space-y-3 px-4 sm:px-6">
        {w.banglaMeaning && (
          <Section icon={Languages} tone="emerald" title="Bangla meaning">
            <p className="font-bangla text-xl font-medium leading-relaxed">{w.banglaMeaning}</p>
          </Section>
        )}
        {w.englishMeaning && (
          <Section icon={BookOpen} tone="sky" title="Definition">
            <p className="text-[15px] leading-relaxed">{w.englishMeaning}</p>
          </Section>
        )}
        {w.example && (
          <Section icon={Quote} tone="amber" title="Example">
            <div className="flex items-start gap-2">
              <p className="flex-1 text-[15px] italic leading-relaxed">
                “<Highlight sentence={w.example} word={w.word} />”
              </p>
              <SpeakButton text={w.example} size="sm" />
            </div>
          </Section>
        )}
        {(w.synonyms.length > 0 || w.antonyms.length > 0) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {w.synonyms.length > 0 && (
              <Section icon={Link2} tone="teal" title="Synonyms">
                <RelationChips items={w.synonyms} tone="emerald" lookup={lookup} onOpen={openWord} />
              </Section>
            )}
            {w.antonyms.length > 0 && (
              <Section icon={Split} tone="rose" title="Antonyms">
                <RelationChips items={w.antonyms} tone="rose" lookup={lookup} onOpen={openWord} />
              </Section>
            )}
          </div>
        )}
        {hasParts && (
          <Section icon={Puzzle} tone="violet" title="Word parts">
            <WordPartsView w={w} />
          </Section>
        )}
        {w.mnemonic && (
          <div className="sheen relative overflow-hidden rounded-[22px] bg-linear-to-br from-amber-400 to-orange-500 p-4 text-white shadow-lg shadow-orange-500/25">
            <div className="mb-1.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-white/85">
              <Lightbulb className="size-4" /> Memory trick
            </div>
            <p className="text-[15px] font-medium leading-relaxed">{w.mnemonic}</p>
          </div>
        )}
        {w.etymology && (
          <Section icon={Hash} tone="slate" title="Origin">
            <p className="text-sm leading-relaxed text-fg/85">{w.etymology}</p>
          </Section>
        )}
        {w.notes && (
          <Section icon={PenLine} tone="indigo" title="Notes">
            <p className="whitespace-pre-line text-sm leading-relaxed text-fg/85">{w.notes}</p>
          </Section>
        )}
        {w.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            <Tag className="size-4 text-muted" />
            {w.tags.map((t) => (
              <Badge key={t} className="bg-brand-500/10 text-brand-700 normal-case dark:text-brand-200">
                #{t}
              </Badge>
            ))}
          </div>
        )}

        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Reviews", value: w.timesReviewed },
            { label: "Correct", value: w.timesCorrect },
            { label: "Wrong", value: w.timesWrong },
            { label: "Accuracy", value: acc === null ? "—" : `${acc}%` },
          ].map((s) => (
            <div key={s.label} className="surface rounded-2xl px-2 py-3 text-center">
              <div className="text-lg font-extrabold tabular-nums">{s.value}</div>
              <div className="text-[11px] font-medium text-muted">{s.label}</div>
            </div>
          ))}
        </div>
        {history && history.length > 0 && (
          <div className="surface rounded-[22px] p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <h4 className="text-[13px] font-bold uppercase tracking-wider text-muted">Recent answers</h4>
              <span className="text-[11px] font-semibold text-muted">
                last {history.length} · {Math.round((history.filter((h) => h.correct).length / history.length) * 100)}% right
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {history.map((h, i) => (
                <span
                  key={i}
                  title={`${h.correct ? "Correct" : "Missed"} · ${h.source}${h.qtype ? ` (${h.qtype})` : ""} · ${new Date(h.createdAt).toLocaleString()}`}
                  className={cn("size-4 rounded-[5px]", h.correct ? "bg-emerald-500" : "bg-rose-500", i === history.length - 1 && "ring-2 ring-brand-500/50 ring-offset-1 ring-offset-[var(--bg)]")}
                />
              ))}
            </div>
            <div className="mt-2 text-[11px] text-muted">Oldest → newest · last answered {relativeTime(history[history.length - 1].createdAt)}</div>
          </div>
        )}
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
          <CalendarDays className="size-3.5" /> Added {new Date(w.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
        </p>
      </div>

      <div className="sticky bottom-0 mt-4 flex gap-2 border-t border-[var(--line)] bg-[rgba(248,250,255,0.92)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:px-6 dark:bg-[rgba(16,21,37,0.92)]">
        <Button
          className="flex-1"
          icon={Pencil}
          onClick={() => {
            onClose();
            router.push(`/edit/${w.id}`);
          }}
        >
          Edit
        </Button>
        <Button variant="secondary" icon={Copy} onClick={copy} aria-label="Copy">
          <span className="hidden sm:inline">Copy</span>
        </Button>
        <Button variant="secondary" icon={Trash} onClick={remove} className="text-rose-600 dark:text-rose-400" aria-label="Delete">
          <span className="hidden sm:inline">Delete</span>
        </Button>
      </div>
    </div>
  );
}

export function WordSheet() {
  const { openWordId, closeWord } = useWordSheet();
  const { words } = useVocab();
  const word = openWordId != null ? words.find((w) => w.id === openWordId) : undefined;
  const lastRef = useRef<Word | undefined>(undefined);
  if (word) lastRef.current = word;
  const shown = word ?? lastRef.current;
  return (
    <Sheet open={!!word} onClose={closeWord} label={shown ? `Details for ${shown.word}` : "Word details"}>
      {shown && <WordDetail key={shown.id} w={shown} onClose={closeWord} />}
    </Sheet>
  );
}
