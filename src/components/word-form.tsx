"use client";

import {
  BookOpen,
  ChevronDown,
  CircleCheck,
  CirclePlus,
  Eye,
  Keyboard,
  Languages,
  Lightbulb,
  Link2,
  Pencil,
  Puzzle,
  Quote,
  RotateCcw,
  Save,
  Sparkles,
  Star,
  Tag,
  TriangleAlert,
  Type,
  WandSparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useVocab, useVocabStats, useWordSheet } from "@/lib/store";
import { EMPTY_WORD_INPUT, PARTS_OF_SPEECH, type Difficulty, type Word, type WordInput } from "@/lib/types";
import { capitalizeFirst, sentenceCase } from "@/lib/text-format";
import { cn, findWordInSentence, haptic, playTone } from "@/lib/utils";
import { AiAssistantPanel, EMPTY_ASSISTANT, type AssistantState, type AutofillAlternatives, type AutofillSource } from "./ai-assistant";
import { Highlight, WordPartsView } from "./word-bits";
import { Button, Card, Chip, Field, IconTile, PageHeader, Segmented, Switch, TagInput, inputCls, type IconType, type Tone } from "./ui";

function CardHead({ icon, tone, title, subtitle }: { icon: IconType; tone: Tone; title: string; subtitle?: string }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <IconTile icon={icon} tone={tone} size="sm" />
      <div>
        <h2 className="font-bold leading-tight">{title}</h2>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
    </div>
  );
}

const toInput = (w: Word): WordInput => ({
  word: capitalizeFirst(w.word),
  pronunciation: w.pronunciation,
  partOfSpeech: w.partOfSpeech,
  banglaMeaning: w.banglaMeaning,
  englishMeaning: sentenceCase(w.englishMeaning),
  synonyms: w.synonyms.map(capitalizeFirst),
  antonyms: w.antonyms.map(capitalizeFirst),
  example: sentenceCase(w.example),
  prefix: w.prefix,
  rootWord: w.rootWord,
  suffix: w.suffix,
  mnemonic: w.mnemonic,
  etymology: w.etymology,
  notes: w.notes,
  tags: w.tags,
  difficulty: w.difficulty,
  isFavorite: w.isFavorite,
});

function Preview({ form }: { form: WordInput }) {
  const [flipped, setFlipped] = useState(false);
  const face = "absolute inset-0 flex flex-col rounded-[30px] p-6 [backface-visibility:hidden]";
  return (
    <div className="[perspective:1400px]">
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label="Flip preview card"
        className="relative block h-[22rem] w-full text-left transition-transform duration-700 [transform-style:preserve-3d]"
        style={{ transform: flipped ? "rotateY(180deg)" : "none", transitionTimingFunction: "cubic-bezier(.2,.8,.2,1)" }}
      >
        <div className={cn(face, "overflow-hidden brand-gradient text-white shadow-2xl shadow-brand-500/30")}>
          <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-white/25 via-white/0 to-transparent" />
          <div className="pointer-events-none absolute -right-16 -top-16 size-60 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.28),transparent_65%)]" />
          <span className="relative w-fit rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wider ring-1 ring-white/25">
            {form.partOfSpeech || "Preview"}
          </span>
          <div className="relative my-auto text-center">
            <div className="break-words text-4xl font-extrabold tracking-tight">{form.word || "Your word"}</div>
            {form.pronunciation && <div className="mt-2 text-sm text-white/80">{form.pronunciation}</div>}
          </div>
          <div className="relative text-center text-xs font-semibold text-white/75">Tap to flip</div>
        </div>
        <div className={cn(face, "surface gap-3 overflow-y-auto [transform:rotateY(180deg)]")}>
          <div className="font-bangla text-2xl font-semibold text-brand-700 dark:text-brand-200">{form.banglaMeaning || "বাংলা অর্থ"}</div>
          <p className="text-sm leading-relaxed text-fg/85">{form.englishMeaning || "English definition appears here."}</p>
          {form.example && (
            <p className="rounded-2xl bg-black/[0.035] p-3 text-sm italic dark:bg-white/[0.05]">
              “<Highlight sentence={form.example} word={form.word} />”
            </p>
          )}
          {form.synonyms.length > 0 && <p className="text-xs text-muted"><b className="text-emerald-600 dark:text-emerald-300">Syn:</b> {form.synonyms.join(", ")}</p>}
          {form.antonyms.length > 0 && <p className="text-xs text-muted"><b className="text-rose-600 dark:text-rose-300">Ant:</b> {form.antonyms.join(", ")}</p>}
          <WordPartsView w={form} compact />
        </div>
      </button>
    </div>
  );
}

export function WordForm({ initial }: { initial?: Word }) {
  const router = useRouter();
  const { words, addWord, updateWord } = useVocab();
  const stats = useVocabStats();
  const { openWord } = useWordSheet();
  const [form, setForm] = useState<WordInput>(() => (initial ? toInput(initial) : EMPTY_WORD_INPUT));
  const [showMore, setShowMore] = useState(
    () => !!initial && !!(initial.prefix || initial.rootWord || initial.suffix || initial.mnemonic || initial.etymology || initial.notes),
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ word?: string; meaning?: string }>({});
  const wordRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<(again?: boolean) => void>(() => {});

  const set = <K extends keyof WordInput>(k: K, v: WordInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (k === "word") setErrors((e) => ({ ...e, word: undefined }));
    if (k === "banglaMeaning" || k === "englishMeaning") setErrors((e) => ({ ...e, meaning: undefined }));
  };

  const duplicate = useMemo(() => {
    const k = form.word.trim().toLowerCase();
    return k ? words.find((w) => w.word.toLowerCase() === k && w.id !== initial?.id) ?? null : null;
  }, [form.word, words, initial?.id]);

  const exampleOk = !!form.example && !!form.word && !!findWordInSentence(form.example, form.word);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial ? toInput(initial) : EMPTY_WORD_INPUT);

  const [assistant, setAssistant] = useState<AssistantState>(EMPTY_ASSISTANT);
  const autoSet = useRef<Partial<Record<keyof WordInput, string>>>({});
  const beforeAutofill = useRef<WordInput | null>(null);
  const runId = useRef(0);
  const filling = assistant.phase === "sources" || assistant.phase === "ai";

  type Fillable = Partial<Record<keyof WordInput, string | string[]>>;
  const serial = (v: unknown) => (Array.isArray(v) ? v.join("|") : String(v ?? ""));

  /** Fill fields that are empty, or that still hold a value autofill itself set earlier. */
  const applyFields = (incoming: Fillable, run: number) => {
    if (run !== runId.current) return [] as string[];
    const changed: string[] = [];
    setForm((f) => {
      const next = { ...f } as WordInput;
      for (const [k, raw] of Object.entries(incoming) as [keyof WordInput, string | string[]][]) {
        if (raw === undefined || raw === null) continue;
        let v: string | string[] = raw;
        if (k === "englishMeaning" || k === "example") v = sentenceCase(String(raw));
        if (k === "synonyms" || k === "antonyms") v = (Array.isArray(raw) ? raw : String(raw).split(",")).map((x) => capitalizeFirst(x.trim())).filter(Boolean);
        if (k === "partOfSpeech" && !(PARTS_OF_SPEECH as readonly string[]).includes(String(v))) continue;
        if (k === "difficulty" && !["easy", "medium", "hard"].includes(String(v))) continue;
        if (Array.isArray(v) ? !v.length : !String(v).trim()) continue;
        const cur = serial(next[k]);
        const mine = autoSet.current[k];
        const empty = Array.isArray(next[k]) ? !(next[k] as string[]).length : !String(next[k] ?? "").trim();
        const untouchedAuto = mine !== undefined && mine === cur;
        const replaceDifficulty = k === "difficulty" && (mine === undefined ? cur === "medium" : untouchedAuto);
        if (!(empty || untouchedAuto || replaceDifficulty)) continue;
        if (serial(v) === cur) continue;
        (next as unknown as Record<string, unknown>)[k] = v;
        autoSet.current[k] = serial(v);
        changed.push(k);
      }
      return next;
    });
    return changed;
  };

  const autofill = async () => {
    const word = form.word.trim();
    if (!word) {
      toast.error("Type a word first");
      wordRef.current?.focus();
      return;
    }
    if (!/^[A-Za-z][A-Za-z' -]*$/.test(word)) {
      toast.error("Auto-fill works with English letters only");
      return;
    }
    const run = ++runId.current;
    beforeAutofill.current = form;
    autoSet.current = {};
    const filled = new Set<string>();
    setAssistant({ ...EMPTY_ASSISTANT, phase: "sources", word });
    if (form.prefix || form.rootWord || form.suffix || form.mnemonic) setShowMore(true);

    let draftOk = false;
    try {
      const res = await fetch(`/api/autofill?word=${encodeURIComponent(word)}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        found?: boolean;
        fields?: Fillable;
        alternatives?: AutofillAlternatives;
        sources?: AutofillSource[];
        error?: string;
      };
      if (run !== runId.current) return;
      if (!res.ok || !data.found || !data.fields) {
        setAssistant((a) => ({ ...a, phase: "error", sources: data.sources ?? [], error: data.error ?? `No dictionary entry found for “${word}”. Check the spelling.` }));
        return;
      }
      draftOk = true;
      for (const k of applyFields(data.fields, run)) filled.add(k);
      const f = data.fields;
      if (f.prefix || f.rootWord || f.suffix || f.mnemonic) setShowMore(true);
      setAssistant((a) => ({
        ...a,
        phase: "ai",
        sources: data.sources ?? [],
        alternatives: data.alternatives ?? a.alternatives,
        filled: [...filled],
      }));
    } catch {
      if (run !== runId.current) return;
      setAssistant((a) => ({ ...a, phase: "error", error: "Couldn't reach the dictionaries. Check your connection." }));
      return;
    }

    if (!draftOk) return;
    try {
      const res = await fetch("/api/autofill/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word }),
      });
      const data = (await res.json().catch(() => ({}))) as { fields?: Fillable; provider?: string; ai?: boolean; error?: string };
      if (run !== runId.current) return;
      if (res.ok && data.fields) {
        for (const k of applyFields(data.fields, run)) filled.add(k);
        const f = data.fields;
        if (f.prefix || f.rootWord || f.suffix || f.mnemonic) setShowMore(true);
        setAssistant((a) => ({
          ...a,
          phase: "done",
          provider: data.provider ?? "",
          aiUsed: !!data.ai,
          filled: [...filled],
          alternatives: {
            ...a.alternatives,
            definitions: [...new Set([...(typeof f.englishMeaning === "string" ? [sentenceCase(f.englishMeaning)] : []), ...a.alternatives.definitions])].slice(0, 6),
            bangla: [...new Set([...(typeof f.banglaMeaning === "string" ? [f.banglaMeaning] : []), ...a.alternatives.bangla])].slice(0, 6),
            examples: [...new Set([...(typeof f.example === "string" ? [sentenceCase(f.example)] : []), ...a.alternatives.examples])].slice(0, 6),
          },
        }));
        playTone("correct");
      } else {
        setAssistant((a) => ({ ...a, phase: "done", aiUsed: false, provider: "", filled: [...filled] }));
      }
    } catch {
      if (run !== runId.current) return;
      setAssistant((a) => ({ ...a, phase: "done", aiUsed: false, filled: [...filled] }));
    }
  };

  const undoAutofill = () => {
    runId.current++;
    if (beforeAutofill.current) setForm(beforeAutofill.current);
    autoSet.current = {};
    setAssistant(EMPTY_ASSISTANT);
    toast.message("Auto-fill undone");
  };

  const submit = async (again = false) => {
    const errs: typeof errors = {};
    if (!form.word.trim()) errs.word = "Please enter a word";
    if (!form.banglaMeaning.trim() && !form.englishMeaning.trim()) errs.meaning = "Add a Bangla meaning or an English definition";
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error(errs.word ?? errs.meaning);
      haptic([10, 40, 10]);
      return;
    }
    setSaving(true);
    const res = initial ? await updateWord(initial.id, form) : await addWord(form);
    setSaving(false);
    if (!res) return;
    playTone("correct");
    haptic(15);
    if (initial) {
      toast.success("Changes saved");
      router.push("/words");
      return;
    }
    toast.success(`“${res.word}” added to your list`, { action: { label: "View", onClick: () => openWord(res.id) } });
    if (again) {
      setForm({ ...EMPTY_WORD_INPUT, tags: form.tags, difficulty: form.difficulty });
      runId.current++;
      autoSet.current = {};
      setAssistant(EMPTY_ASSISTANT);
      setShowMore(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => wordRef.current?.focus(), 250);
    } else router.push("/words");
  };
  submitRef.current = submit;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        submitRef.current(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const moreCount = [form.prefix, form.rootWord, form.suffix, form.mnemonic, form.etymology, form.notes].filter((v) => v.trim()).length;

  return (
    <>
      <PageHeader
        title={initial ? "Edit word" : "Add word"}
        subtitle={initial ? `Editing “${initial.word}”` : "Build your personal dictionary"}
        icon={initial ? Pencil : CirclePlus}
        tone="emerald"
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 [&>*]:min-w-0">
        <form
          className="stagger space-y-4 lg:col-span-7"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
        >
          <Card className="p-4 sm:p-5">
            <CardHead icon={Type} tone="emerald" title="Word" subtitle="The English word or phrase" />
            <Field
              label="Word"
              required
              htmlFor="f-word"
              action={
                <button
                  type="button"
                  onClick={() => void autofill()}
                  disabled={filling}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-500/10 px-3 text-[12.5px] font-bold text-brand-700 transition hover:bg-brand-500/15 active:scale-95 disabled:opacity-60 dark:text-brand-200"
                >
                  <WandSparkles className={cn("size-3.5", filling && "animate-spin")} />
                  {filling ? "Researching…" : "AI Auto-fill"}
                </button>
              }
            >
              <input
                id="f-word"
                ref={wordRef}
                value={form.word}
                onChange={(e) => set("word", capitalizeFirst(e.target.value))}
                placeholder="e.g. Serendipity"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className={cn(inputCls, "text-lg font-bold", errors.word && "!border-rose-400")}
              />
            </Field>
            {errors.word && <p className="mt-1.5 px-1 text-xs font-semibold text-rose-500">{errors.word}</p>}
            {duplicate && (
              <div className="mt-2.5 flex items-center gap-2 rounded-2xl bg-amber-500/10 px-3 py-2.5 text-[13px] font-medium text-amber-700 dark:text-amber-300">
                <TriangleAlert className="size-4 shrink-0" />
                <span className="min-w-0 flex-1">“{duplicate.word}” is already in your list.</span>
                <button type="button" onClick={() => openWord(duplicate.id)} className="shrink-0 font-bold underline underline-offset-2">
                  View
                </button>
              </div>
            )}
            <Field label="Pronunciation" htmlFor="f-pron" className="mt-4">
              <input
                id="f-pron"
                value={form.pronunciation}
                onChange={(e) => set("pronunciation", e.target.value)}
                placeholder="/ˌser.ənˈdɪp.ə.ti/"
                className={inputCls}
              />
            </Field>
            <Field label="Part of speech" className="mt-4">
              <div className="flex flex-wrap gap-2">
                {PARTS_OF_SPEECH.map((p) => (
                  <Chip key={p} active={form.partOfSpeech === p} onClick={() => set("partOfSpeech", form.partOfSpeech === p ? "" : p)} className="capitalize">
                    {p}
                  </Chip>
                ))}
              </div>
            </Field>
          </Card>

          {assistant.phase !== "idle" && (filling || assistant.word.toLowerCase() === form.word.trim().toLowerCase()) && (
            <AiAssistantPanel
              state={assistant}
              current={{ englishMeaning: form.englishMeaning, banglaMeaning: form.banglaMeaning, example: form.example }}
              onPick={(field, value) => {
                const v = field === "banglaMeaning" ? value : sentenceCase(value);
                set(field, v);
                autoSet.current[field] = v;
              }}
              onUndo={undoAutofill}
              onClose={() => setAssistant(EMPTY_ASSISTANT)}
            />
          )}

          <Card className="p-4 sm:p-5">
            <CardHead icon={Languages} tone="sky" title="Meaning" subtitle="At least one is required" />
            <Field label="Bangla meaning" htmlFor="f-bn" icon={Languages}>
              <input
                id="f-bn"
                lang="bn"
                value={form.banglaMeaning}
                onChange={(e) => set("banglaMeaning", e.target.value)}
                placeholder="যেমন: আকস্মিক সৌভাগ্য"
                className={cn(inputCls, "font-bangla text-[17px]", errors.meaning && "!border-rose-400")}
              />
            </Field>
            <Field label="English meaning / definition" htmlFor="f-en" icon={BookOpen} className="mt-4">
              <textarea
                id="f-en"
                rows={3}
                value={form.englishMeaning}
                onChange={(e) => set("englishMeaning", sentenceCase(e.target.value))}
                placeholder="The occurrence of events by chance in a happy or beneficial way."
                className={cn(inputCls, "resize-none leading-relaxed", errors.meaning && "!border-rose-400")}
              />
            </Field>
            {errors.meaning && <p className="mt-1.5 px-1 text-xs font-semibold text-rose-500">{errors.meaning}</p>}
          </Card>

          <Card className="p-4 sm:p-5">
            <CardHead icon={Link2} tone="teal" title="Synonyms & antonyms" subtitle="Press Enter or comma to add" />
            <Field label="Synonyms" htmlFor="f-syn">
              <TagInput id="f-syn" value={form.synonyms} onChange={(v) => set("synonyms", v)} placeholder="fluke, chance, luck…" tone="emerald" />
            </Field>
            <Field label="Antonyms" htmlFor="f-ant" className="mt-4">
              <TagInput id="f-ant" value={form.antonyms} onChange={(v) => set("antonyms", v)} placeholder="misfortune, bad luck…" tone="rose" />
            </Field>
          </Card>

          <Card className="p-4 sm:p-5">
            <CardHead icon={Quote} tone="amber" title="Example sentence" subtitle="Shows the word in context" />
            <textarea
              aria-label="Example sentence"
              rows={3}
              value={form.example}
              onChange={(e) => set("example", e.target.value)}
              placeholder="Finding that café was pure serendipity."
              className={cn(inputCls, "resize-none leading-relaxed")}
            />
            {form.example && (
              <p className={cn("mt-2 flex items-center gap-1.5 px-1 text-xs font-medium", exampleOk ? "text-emerald-600 dark:text-emerald-400" : "text-muted")}>
                {exampleOk ? <CircleCheck className="size-3.5" /> : <Lightbulb className="size-3.5" />}
                {exampleOk ? "Great — this sentence will power fill-in-the-blank quizzes." : "Include the word in the sentence to unlock fill-in-the-blank quizzes."}
              </p>
            )}
          </Card>

          <Card className="overflow-hidden">
            <button
              type="button"
              onClick={() => setShowMore((s) => !s)}
              aria-expanded={showMore}
              className="flex w-full items-center gap-2.5 p-4 text-left sm:p-5"
            >
              <IconTile icon={Puzzle} tone="violet" size="sm" />
              <div className="flex-1">
                <h2 className="font-bold leading-tight">Other info</h2>
                <p className="text-xs text-muted">Prefix, root word, suffix, mnemonic, origin & notes</p>
              </div>
              {moreCount > 0 && <span className="rounded-full bg-violet-500/12 px-2 py-0.5 text-[11px] font-bold text-violet-600 dark:text-violet-300">{moreCount}</span>}
              <ChevronDown className={cn("size-5 text-muted transition-transform duration-300", showMore && "rotate-180")} />
            </button>
            <div className={cn("grid transition-[grid-template-rows] duration-300 ease-out", showMore ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
              <div className="overflow-hidden">
                <div className="space-y-4 px-4 pb-5 sm:px-5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field label="Prefix" htmlFor="f-pre">
                      <input id="f-pre" value={form.prefix} onChange={(e) => set("prefix", e.target.value)} placeholder="bene- (well)" className={inputCls} />
                    </Field>
                    <Field label="Root word" htmlFor="f-root">
                      <input id="f-root" value={form.rootWord} onChange={(e) => set("rootWord", e.target.value)} placeholder="vol (wish)" className={inputCls} />
                    </Field>
                    <Field label="Suffix" htmlFor="f-suf">
                      <input id="f-suf" value={form.suffix} onChange={(e) => set("suffix", e.target.value)} placeholder="-ent" className={inputCls} />
                    </Field>
                  </div>
                  <WordPartsView w={form} compact />
                  <Field label="Mnemonic / memory trick" htmlFor="f-mn" icon={Lightbulb}>
                    <textarea id="f-mn" rows={2} value={form.mnemonic} onChange={(e) => set("mnemonic", e.target.value)} placeholder="A catchy trick to remember the word…" className={cn(inputCls, "resize-none")} />
                  </Field>
                  <Field label="Origin / etymology" htmlFor="f-ety">
                    <input id="f-ety" value={form.etymology} onChange={(e) => set("etymology", e.target.value)} placeholder="Latin benevolens…" className={inputCls} />
                  </Field>
                  <Field label="Notes" htmlFor="f-notes">
                    <textarea id="f-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Usage notes, collocations, related words…" className={cn(inputCls, "resize-none")} />
                  </Field>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <CardHead icon={Tag} tone="pink" title="Organize" subtitle="Difficulty, tags & favorites" />
            <Field label="Difficulty">
              <Segmented<Difficulty>
                value={form.difficulty}
                onChange={(v) => set("difficulty", v)}
                options={[
                  { value: "easy", label: "Easy" },
                  { value: "medium", label: "Medium" },
                  { value: "hard", label: "Hard" },
                ]}
              />
            </Field>
            <Field label="Tags" htmlFor="f-tags" className="mt-4">
              <TagInput id="f-tags" value={form.tags} onChange={(v) => set("tags", v)} placeholder="GRE, IELTS, Chapter 3…" tone="brand" suggestions={stats.tags} />
            </Field>
            <div className="mt-4 flex items-center justify-between rounded-2xl bg-black/[0.035] px-4 py-3 dark:bg-white/[0.05]">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Star className={cn("size-4", form.isFavorite ? "fill-amber-400 text-amber-500" : "text-muted")} /> Mark as favorite
              </span>
              <Switch checked={form.isFavorite} onChange={(v) => set("isFavorite", v)} label="Favorite" />
            </div>
          </Card>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" size="lg" loading={saving} icon={Save} className="sm:flex-1">
              {initial ? "Save changes" : "Save word"}
            </Button>
            {!initial && (
              <Button variant="secondary" size="lg" icon={Sparkles} disabled={saving} onClick={() => void submit(true)}>
                Save & add another
              </Button>
            )}
            <Button
              variant="ghost"
              size="lg"
              icon={RotateCcw}
              disabled={!dirty || saving}
              onClick={() => {
                setForm(initial ? toInput(initial) : EMPTY_WORD_INPUT);
                setErrors({});
              }}
            >
              Reset
            </Button>
          </div>
          <p className="hidden items-center justify-center gap-1.5 text-xs text-muted md:flex">
            <Keyboard className="size-3.5" /> Press <kbd className="rounded border border-[var(--field-border)] px-1 font-semibold">Ctrl</kbd> +{" "}
            <kbd className="rounded border border-[var(--field-border)] px-1 font-semibold">Enter</kbd> to save
          </p>
        </form>

        <aside className="hidden lg:col-span-5 lg:block">
          <div className="sticky top-24 space-y-4">
            <div className="flex items-center gap-2 px-1 text-sm font-bold text-muted">
              <Eye className="size-4" /> Live flashcard preview
            </div>
            <Preview form={form} />
            <Card className="p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <Lightbulb className="size-4 text-amber-500" /> Tips for better quizzes
              </h3>
              <ul className="mt-2 space-y-1.5 text-[13px] text-muted">
                <li>• Add synonyms & antonyms to unlock relation questions.</li>
                <li>• Use the word inside the example for fill-in-the-blank.</li>
                <li>• Prefix, root & suffix enable word-building questions.</li>
                <li>• A vivid mnemonic makes words stick for longer.</li>
              </ul>
            </Card>
          </div>
        </aside>
      </div>
    </>
  );
}
