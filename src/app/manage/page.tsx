"use client";

import {
  Activity,
  CalendarCheck,
  Wifi,
  ChartColumn,
  HardDriveDownload,
  HardDriveUpload,
  Award,
  BookOpen,
  Check,
  Database,
  Download,
  FileBraces,
  FileSpreadsheet,
  Flame,
  GraduationCap,
  Info,
  Keyboard,
  ListChecks,
  Monitor,
  Moon,
  Palette,
  Pencil,
  RotateCcw,
  Search,
  Settings2 as ManageIcon,
  SlidersHorizontal,
  Square,
  SquareCheck,
  Star,
  Sun,
  Target,
  Trash,
  Trophy,
  Upload,
  Vibrate,
  Volume2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useDeferredValue, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/providers";
import { openRecap } from "@/components/daily-recap";
import { SyncPanel } from "@/components/sync-panel";
import { InstallSettingsCard } from "@/components/install-app";
import { exportWordsExcel, openExcelImport } from "@/components/excel-import";
import { exportLocalData } from "@/lib/idb";
import { StatusPill } from "@/components/word-bits";
import {
  Button,
  Sheet,
  Card,
  IconTile,
  PageHeader,
  PageSkeleton,
  ProgressBar,
  SectionTitle,
  Segmented,
  Switch,
  type IconType,
  type Tone,
} from "@/components/ui";
import { localDay } from "@/lib/learning";
import { ACCENTS, DEFAULT_SETTINGS, useSettings, type Settings, type ThemeMode } from "@/lib/settings";
import { useVocab, useVocabStats } from "@/lib/store";
import { cn, downloadFile, parseCsv, plural, speak, wordsToCsv } from "@/lib/utils";

function Row({ icon, tone, title, text, children }: { icon: IconType; tone: Tone; title: string; text?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-4">
      <IconTile icon={icon} tone={tone} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">{title}</div>
        {text && <div className="text-xs text-muted">{text}</div>}
      </div>
      {children}
    </div>
  );
}

function SettingsTab() {
  const { settings, update } = useSettings();
  const stats = useVocabStats();

  const overview: { label: string; value: string | number; icon: IconType; tone: Tone }[] = [
    { label: "Words", value: stats.total, icon: BookOpen, tone: "sky" },
    { label: "Mastered", value: stats.mastered, icon: Trophy, tone: "emerald" },
    { label: "Accuracy", value: stats.totalReviews ? `${stats.accuracy}%` : "—", icon: Target, tone: "pink" },
    { label: "Reviews", value: stats.totalReviews, icon: Activity, tone: "violet" },
    { label: "Quizzes", value: stats.quizzes, icon: Award, tone: "amber" },
    { label: "Best streak", value: `${stats.streak.best}d`, icon: Flame, tone: "rose" },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <div className="space-y-4">
        <div className="sheen relative overflow-hidden rounded-[28px] brand-gradient p-5 text-white shadow-2xl shadow-brand-500/30">
          <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.3),transparent_65%)]" />
          <div className="relative flex items-center gap-4">
            <div className="grid size-16 place-items-center rounded-[20px] bg-white/20 ring-1 ring-white/30">
              <GraduationCap className="size-8" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold uppercase tracking-wider text-white/80">Your level</div>
              <div className="text-3xl font-extrabold">Level {stats.level.level}</div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/25">
                <div className="h-full rounded-full bg-white transition-[width] duration-700" style={{ width: `${stats.level.progress * 100}%` }} />
              </div>
              <div className="mt-1.5 text-xs font-semibold text-white/85">
                {stats.xp.toLocaleString()} XP total · {stats.level.needed - stats.level.current} XP to next level
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {overview.map((o) => (
            <Card key={o.label} className="p-3.5">
              <IconTile icon={o.icon} tone={o.tone} size="sm" />
              <div className="mt-2.5 text-xl font-extrabold tabular-nums">{o.value}</div>
              <div className="text-[12px] font-medium text-muted">{o.label}</div>
            </Card>
          ))}
        </div>

        <Card className="p-4 sm:p-5">
          <SectionTitle title="Appearance" className="!px-0" />
          <Segmented<ThemeMode>
            value={settings.theme}
            onChange={(v) => update({ theme: v })}
            options={[
              { value: "light", label: "Light", icon: Sun },
              { value: "dark", label: "Dark", icon: Moon },
              { value: "system", label: "Auto", icon: Monitor },
            ]}
          />
          <div className="mt-5 flex items-center gap-2 px-1 text-[13px] font-semibold text-fg/80">
            <Palette className="size-4 text-muted" /> Accent color
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {ACCENTS.map((a) => {
              const on = settings.accent === a.id;
              return (
                <button key={a.id} type="button" onClick={() => update({ accent: a.id })} className="flex flex-col items-center gap-1.5" aria-pressed={on}>
                  <span
                    className={cn("grid size-12 place-items-center rounded-2xl text-white shadow-lg transition active:scale-90", on && "ring-4 ring-offset-2 ring-offset-[var(--bg)]")}
                    style={{ backgroundImage: `linear-gradient(135deg, ${a.from}, ${a.to})`, ["--tw-ring-color" as string]: `${a.from}66` }}
                  >
                    {on && <Check className="size-5" strokeWidth={3} />}
                  </span>
                  <span className={cn("text-[11.5px] font-semibold", on ? "text-fg" : "text-muted")}>{a.label}</span>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <InstallSettingsCard />
        <Card className="divide-y divide-[var(--line)] px-4 sm:px-5">
          <div className="py-4">
            <div className="mb-3 flex items-center gap-3">
              <IconTile icon={Target} tone="emerald" size="sm" />
              <div>
                <div className="text-sm font-bold">Daily goal</div>
                <div className="text-xs text-muted">Reviews per day (quiz answers + flashcards)</div>
              </div>
            </div>
            <Segmented<number>
              value={settings.dailyGoal}
              onChange={(v) => update({ dailyGoal: v })}
              options={[10, 20, 30, 50, 100].map((n) => ({ value: n, label: String(n) }))}
            />
          </div>
          <Row icon={Volume2} tone="sky" title="Sound effects" text="Chimes for correct & wrong answers">
            <Switch checked={settings.sound} onChange={(v) => update({ sound: v })} label="Sound effects" />
          </Row>
          <Row icon={Vibrate} tone="violet" title="Haptic feedback" text="Vibration on supported phones">
            <Switch checked={settings.haptics} onChange={(v) => update({ haptics: v })} label="Haptics" />
          </Row>
          <Row icon={Volume2} tone="pink" title="Auto-pronounce flashcards" text="Speak each word as it appears">
            <Switch checked={settings.autoPronounce} onChange={(v) => update({ autoPronounce: v })} label="Auto-pronounce" />
          </Row>
          <Row icon={CalendarCheck} tone="amber" title="Daily recap popup" text="Summary of your last study day when you open the app">
            <Switch checked={settings.showRecap} onChange={(v) => update({ showRecap: v })} label="Daily recap popup" />
          </Row>
        </Card>

        <Card className="p-4 sm:p-5">
          <SectionTitle
            title="Pronunciation"
            className="!px-0"
            action={
              <Button size="sm" variant="soft" icon={Volume2} onClick={() => speak("VocaBera makes vocabulary effortless.")}>
                Test
              </Button>
            }
          />
          <Segmented<"en-US" | "en-GB">
            value={settings.voice}
            onChange={(v) => update({ voice: v })}
            options={[
              { value: "en-US", label: "American" },
              { value: "en-GB", label: "British" },
            ]}
          />
          <div className="mt-4 flex items-center gap-3 px-1">
            <span className="text-[13px] font-semibold text-muted">Speed</span>
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
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <SectionTitle title="Keyboard shortcuts" className="!px-0" action={<Keyboard className="size-4 text-muted" />} />
          <div className="grid gap-1.5 text-[13px]">
            {[
              ["/", "Search words"],
              ["Ctrl + Enter", "Save word"],
              ["1 – 4 / T · F", "Answer quiz questions"],
              ["Enter", "Continue to next question"],
              ["Space", "Flip flashcard"],
              ["← / →", "Still learning / Know it"],
              ["Z", "Undo last card"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
                <span className="text-muted">{v}</span>
                <kbd className="rounded-md border border-[var(--field-border)] bg-[var(--field)] px-2 py-0.5 text-[11.5px] font-bold">{k}</kbd>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function WordsTab() {
  const { words, bulkDelete, bulkUpdate, bulkResetProgress } = useVocab();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [limit, setLimit] = useState(60);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    const s = dq.trim().toLowerCase();
    return s ? words.filter((w) => w.word.toLowerCase().includes(s) || w.banglaMeaning.includes(s) || w.tags.some((t) => t.toLowerCase().includes(s))) : words;
  }, [words, dq]);

  const ids = useMemo(() => words.filter((w) => selected.has(w.id)).map((w) => w.id), [words, selected]);
  const allSelected = list.length > 0 && list.every((w) => selected.has(w.id));

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected((s) => {
      const n = new Set(s);
      if (allSelected) list.forEach((w) => n.delete(w.id));
      else list.forEach((w) => n.add(w.id));
      return n;
    });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="field flex h-11 flex-1 items-center gap-2 px-3.5">
          <Search className="size-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter words or tags…" aria-label="Filter words" className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted/70" />
        </div>
        <button type="button" onClick={toggleAll} className="inline-flex h-11 items-center gap-2 rounded-2xl px-3 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10">
          {allSelected ? <SquareCheck className="size-5 text-brand-500" /> : <Square className="size-5 text-muted" />}
          Select all ({list.length})
        </button>
      </div>

      {ids.length > 0 && (
        <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-20 flex animate-fade-up flex-wrap items-center gap-2 border-b border-[var(--line)] bg-page/85 px-4 py-3 backdrop-blur-xl sm:px-5">
          <span className="mr-auto text-sm font-bold">{ids.length} selected</span>
          <Button size="sm" variant="secondary" icon={Star} disabled={busy} onClick={() => void run(() => bulkUpdate(ids, { isFavorite: true }))}>
            Favorite
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => bulkUpdate(ids, { isFavorite: false }))}>
            Unfavorite
          </Button>
          <select
            aria-label="Set difficulty"
            disabled={busy}
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (v) void run(() => bulkUpdate(ids, { difficulty: v }));
            }}
            className="field h-9 !rounded-xl px-2.5 text-[13px] font-semibold outline-none"
          >
            <option value="">Difficulty…</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          <Button
            size="sm"
            variant="secondary"
            icon={RotateCcw}
            disabled={busy}
            onClick={async () => {
              if (await confirm({ title: `Reset progress for ${plural(ids.length, "word")}?`, message: "Mastery and review history for these words will start over.", confirmText: "Reset" }))
                void run(() => bulkResetProgress(ids));
            }}
          >
            Reset
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={Trash}
            disabled={busy}
            onClick={async () => {
              if (await confirm({ title: `Delete ${plural(ids.length, "word")}?`, message: "This cannot be undone.", confirmText: "Delete", tone: "danger" })) {
                await run(() => bulkDelete(ids));
                setSelected(new Set());
              }
            }}
          >
            Delete
          </Button>
        </div>
      )}

      {list.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted">{words.length ? "No words match your filter." : "No words yet."}</p>
      ) : (
        <div className="divide-y divide-[var(--line)]">
          {list.slice(0, limit).map((w) => {
            const on = selected.has(w.id);
            return (
              <div key={w.id} className={cn("flex items-center gap-3 px-4 py-3 transition-colors sm:px-5", on && "bg-brand-500/[0.07]")}>
                <button type="button" onClick={() => toggle(w.id)} aria-label={`Select ${w.word}`} className="shrink-0">
                  {on ? <SquareCheck className="size-5 text-brand-500" /> : <Square className="size-5 text-muted" />}
                </button>
                <button type="button" onClick={() => toggle(w.id)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-bold">{w.word}</span>
                    {w.isFavorite && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-500" />}
                  </div>
                  <div className="truncate font-bangla text-[13px] text-muted">{w.banglaMeaning || w.englishMeaning}</div>
                </button>
                <div className="hidden sm:block">
                  <StatusPill w={w} />
                </div>
                <Link href={`/edit/${w.id}`} aria-label={`Edit ${w.word}`} className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-black/5 hover:text-fg dark:hover:bg-white/10">
                  <Pencil className="size-4" />
                </Link>
              </div>
            );
          })}
        </div>
      )}
      {list.length > limit && (
        <div className="border-t border-[var(--line)] p-3 text-center">
          <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + 100)}>
            Show more ({list.length - limit} remaining)
          </Button>
        </div>
      )}
    </Card>
  );
}

interface ParsedBackup {
  name: string;
  data: unknown;
  words: number;
  activity: number;
  sessions: number;
  logs: number;
  settings: Partial<Settings> | null;
  exportedAt: string | null;
}

function parseBackup(name: string, text: string): ParsedBackup {
  const raw = JSON.parse(text) as unknown;
  const obj = (Array.isArray(raw) ? { words: raw } : raw) as Record<string, unknown>;
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  if (!obj || typeof obj !== "object" || (!len(obj.words) && !len(obj.activity) && !len(obj.sessions) && !obj.settings)) {
    throw new Error("empty");
  }
  const settings = obj.settings && typeof obj.settings === "object" ? (obj.settings as Partial<Settings>) : null;
  return {
    name,
    data: Array.isArray(raw) ? raw : obj,
    words: len(obj.words),
    activity: len(obj.activity),
    sessions: len(obj.sessions),
    logs: len(obj.logs),
    settings,
    exportedAt: typeof obj.exportedAt === "string" ? obj.exportedAt : null,
  };
}

function DataTab() {
  const { words, importWords, importBackup, dataAction } = useVocab();
  const { settings, update } = useSettings();
  const confirm = useConfirm();
  const csvRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<ParsedBackup | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [withSettings, setWithSettings] = useState(true);
  const stamp = localDay();

  const exportFull = async () => {
    setBusy("full");
    try {
      let data: Record<string, unknown>;
      try {
        data = await exportLocalData();
      } catch {
        const res = await fetch("/api/backup", { cache: "no-store" });
        if (!res.ok) throw new Error();
        data = (await res.json()) as Record<string, unknown>;
      }
      downloadFile(`vocabera-app-data-${stamp}.json`, JSON.stringify({ ...data, settings }, null, 2), "application/json");
      toast.success("App data exported");
    } catch {
      toast.error("Export failed");
    } finally {
      setBusy(null);
    }
  };

  const onJson = async (file: File) => {
    try {
      const parsed = parseBackup(file.name, await file.text());
      setMode("merge");
      setWithSettings(!!parsed.settings);
      setPending(parsed);
    } catch {
      toast.error("That file isn't a valid VocaBera JSON backup");
    } finally {
      if (jsonRef.current) jsonRef.current.value = "";
    }
  };

  const runImport = async () => {
    if (!pending) return;
    if (mode === "replace") {
      const ok = await confirm({
        title: "Replace all app data?",
        message: `Your current ${plural(words.length, "word")} and all progress will be replaced by this backup.`,
        confirmText: "Replace",
        tone: "danger",
      });
      if (!ok) return;
    }
    setBusy("json");
    let result = null;
    if (pending.words || pending.activity || pending.sessions) result = await importBackup(pending.data, mode);
    if (withSettings && pending.settings) {
      const allowed = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];
      const patch = Object.fromEntries(Object.entries(pending.settings).filter(([k]) => allowed.includes(k as keyof Settings))) as Partial<Settings>;
      update(patch);
    }
    setBusy(null);
    if (result || (withSettings && pending.settings)) {
      toast.success(
        result
          ? `Imported ${plural(result.words, "word")}, ${plural(result.activity, "day")} of activity, ${plural(result.sessions, "quiz", "quizzes")}${result.skipped ? ` · ${result.skipped} duplicates skipped` : ""}`
          : "Settings restored",
      );
      setPending(null);
    }
  };

  const onCsv = async (file: File) => {
    setBusy("csv-import");
    try {
      const items = parseCsv(await file.text());
      if (!items.length) {
        toast.error("No words found in that file");
        return;
      }
      const res = await importWords(items);
      if (res) toast.success(`Imported ${plural(res.inserted, "word")}${res.skipped ? ` · ${res.skipped} skipped (duplicates/invalid)` : ""}`);
    } catch {
      toast.error("Could not read that CSV file");
    } finally {
      setBusy(null);
      if (csvRef.current) csvRef.current.value = "";
    }
  };

  const tiles: { label: string; text: string; icon: IconType; tone: Tone; onClick: () => void; disabled?: boolean; key: string }[] = [
    { key: "full", label: "Export app data", text: "JSON · words, progress, history & settings", icon: HardDriveDownload, tone: "indigo", onClick: () => void exportFull() },
    { key: "json", label: "Import app data", text: "Restore or merge a JSON backup", icon: HardDriveUpload, tone: "violet", onClick: () => jsonRef.current?.click() },
    {
      key: "csv",
      label: "Export CSV",
      text: "Words for Excel / Sheets",
      icon: FileSpreadsheet,
      tone: "emerald",
      disabled: !words.length,
      onClick: () => {
        downloadFile(`vocabera-words-${stamp}.csv`, wordsToCsv(words), "text/csv;charset=utf-8");
        toast.success("CSV downloaded");
      },
    },
    { key: "excel-import", label: "Import Excel", text: "Bulk add words from .xlsx", icon: FileSpreadsheet, tone: "emerald", onClick: openExcelImport },
    {
      key: "excel-export",
      label: "Export Excel",
      text: "Words as .xlsx (re-importable)",
      icon: FileSpreadsheet,
      tone: "teal",
      disabled: !words.length,
      onClick: () => {
        setBusy("excel-export");
        exportWordsExcel(words)
          .then(() => toast.success("Excel file downloaded"))
          .catch(() => toast.error("Could not create the Excel file"))
          .finally(() => setBusy(null));
      },
    },
    { key: "csv-import", label: "Import CSV", text: "Bulk add words", icon: Upload, tone: "sky", onClick: () => csvRef.current?.click() },
    {
      key: "words-json",
      label: "Export words",
      text: "JSON · word list only",
      icon: FileBraces,
      tone: "teal",
      disabled: !words.length,
      onClick: () => {
        downloadFile(`vocabera-words-${stamp}.json`, JSON.stringify({ app: "VocaBera", version: 2, exportedAt: new Date().toISOString(), words }, null, 2), "application/json");
        toast.success("Words exported");
      },
    },
    {
      key: "template",
      label: "CSV template",
      text: "Start a bulk list",
      icon: Download,
      tone: "amber",
      onClick: () =>
        downloadFile(
          "vocabera-template.csv",
          "\uFEFFword,partOfSpeech,banglaMeaning,englishMeaning,synonyms,antonyms,example,prefix,rootWord,suffix,mnemonic,tags,difficulty\r\nSerendipity,noun,আকস্মিক সৌভাগ্য,The occurrence of events by chance in a happy way.,fluke; chance,misfortune,Meeting her was pure serendipity.,,,,,GRE,medium\r\n",
          "text/csv;charset=utf-8",
        ),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <Card className="p-4 sm:p-5">
        <SectionTitle title="Backup & transfer" className="!px-0" />
        <div className="grid grid-cols-2 gap-2.5">
          {tiles.map((t) => (
            <button
              key={t.key}
              type="button"
              disabled={t.disabled || busy === t.key}
              onClick={t.onClick}
              className="surface flex flex-col items-start rounded-[20px] p-3.5 text-left transition hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50"
            >
              <IconTile icon={t.icon} tone={t.tone} size="sm" />
              <span className="mt-2.5 text-sm font-bold">{busy === t.key ? "Working…" : t.label}</span>
              <span className="text-xs leading-snug text-muted">{t.text}</span>
            </button>
          ))}
        </div>
        <input ref={jsonRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void onJson(e.target.files[0])} />
        <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && void onCsv(e.target.files[0])} />
        <p className="mt-3 flex gap-1.5 px-1 text-xs text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" /> App-data backups include every word, learning progress, streak history, quiz results, answer logs and your settings.
        </p>
      </Card>

      <div className="space-y-4">
        <Card className="divide-y divide-[var(--line)] px-4 sm:px-5">
          <Row icon={CalendarCheck} tone="teal" title="Daily recap" text="See what you studied on your last day">
            <Button size="sm" variant="soft" onClick={openRecap}>
              Open
            </Button>
          </Row>
          <Row icon={ChartColumn} tone="violet" title="Progress & insights" text="Charts, heatmap & achievements">
            <Link href="/progress">
              <Button size="sm" variant="soft">
                View
              </Button>
            </Link>
          </Row>
          <Row icon={Database} tone="indigo" title="Sample words" text="Add 32 curated GRE / IELTS words">
            <Button
              size="sm"
              variant="soft"
              loading={busy === "seed"}
              onClick={async () => {
                setBusy("seed");
                await dataAction("seed");
                setBusy(null);
              }}
            >
              Load
            </Button>
          </Row>
          <Row icon={RotateCcw} tone="amber" title="Reset learning progress" text="Keep words, clear mastery, streaks & history">
            <Button
              size="sm"
              variant="secondary"
              loading={busy === "reset"}
              onClick={async () => {
                const ok = await confirm({ title: "Reset all progress?", message: "Mastery, reviews, streaks, XP and quiz history will be cleared. Your words stay.", confirmText: "Reset", tone: "danger" });
                if (!ok) return;
                setBusy("reset");
                await dataAction("reset-progress");
                setBusy(null);
              }}
            >
              Reset
            </Button>
          </Row>
          <Row icon={Trash} tone="rose" title="Delete everything" text="Permanently remove all words & data">
            <Button
              size="sm"
              variant="danger"
              loading={busy === "delete"}
              onClick={async () => {
                const ok = await confirm({
                  title: "Delete all data?",
                  message: `This permanently deletes ${plural(words.length, "word")} and all progress. Consider exporting a backup first.`,
                  confirmText: "Delete all",
                  tone: "danger",
                  requireText: "DELETE",
                });
                if (!ok) return;
                setBusy("delete");
                await dataAction("delete-all");
                setBusy(null);
              }}
            >
              Delete
            </Button>
          </Row>
        </Card>
      </div>

      <Sheet open={!!pending} onClose={() => setPending(null)} label="Import app data">
        {pending && (
          <div className="p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <IconTile icon={HardDriveUpload} tone="violet" size="lg" />
              <div className="min-w-0">
                <h3 className="text-lg font-extrabold tracking-tight">Import app data</h3>
                <p className="truncate text-xs text-muted">
                  {pending.name}
                  {pending.exportedAt ? ` · exported ${new Date(pending.exportedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}` : ""}
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-4 gap-2">
              {[
                { label: "Words", value: pending.words },
                { label: "Days", value: pending.activity },
                { label: "Quizzes", value: pending.sessions },
                { label: "Answers", value: pending.logs },
              ].map((s) => (
                <div key={s.label} className="surface rounded-2xl px-1 py-3 text-center">
                  <div className="text-lg font-extrabold tabular-nums">{s.value}</div>
                  <div className="text-[11px] font-medium text-muted">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <div className="mb-2 px-1 text-[13px] font-semibold text-fg/80">Import mode</div>
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: "merge", label: "Merge" },
                  { value: "replace", label: "Replace all" },
                ]}
              />
              <p className="mt-2 px-1 text-xs leading-relaxed text-muted">
                {mode === "merge"
                  ? "Adds new words (duplicates are skipped) and merges activity & quiz history with your current data."
                  : "Deletes everything currently in the app and restores this backup exactly."}
              </p>
            </div>
            {pending.settings && (
              <div className="mt-4 flex items-center justify-between rounded-2xl bg-black/[0.035] px-4 py-3 dark:bg-white/[0.05]">
                <span className="text-sm font-semibold">Also restore settings</span>
                <Switch checked={withSettings} onChange={setWithSettings} label="Restore settings" />
              </div>
            )}
            <div className="mt-6 grid grid-cols-2 gap-2 pb-[env(safe-area-inset-bottom)]">
              <Button variant="secondary" onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button variant={mode === "replace" ? "danger" : "primary"} icon={HardDriveUpload} loading={busy === "json"} onClick={() => void runImport()}>
                Import
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

export default function ManagePage() {
  const { status } = useVocab();
  const [tab, setTab] = useState<"settings" | "words" | "data" | "sync">("settings");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.has("sync")) {
        setTab("sync");
      }
    }
  }, []);
  if (status === "loading") return <PageSkeleton />;
  return (
    <>
      <PageHeader title="Manage" subtitle="Settings, words & data" icon={ManageIcon} tone="indigo" />
      <Segmented
        className="mb-5 max-w-md animate-fade-up"
        value={tab}
        onChange={setTab}
        options={[
          { value: "settings", label: "Settings", icon: SlidersHorizontal },
          { value: "words", label: "Words", icon: ListChecks },
          { value: "data", label: "Data", icon: Database },
          { value: "sync", label: "Sync", icon: Wifi },
        ]}
      />
      <div key={tab} className="animate-fade-up">
        {tab === "settings" && <SettingsTab />}
        {tab === "words" && <WordsTab />}
        {tab === "data" && <DataTab />}
        {tab === "sync" && <SyncPanel />}
      </div>
    </>
  );
}
