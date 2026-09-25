"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import {
  ArrowLeft,
  Brain,
  Check,
  Hand,
  Layers,
  Lightbulb,
  Play,
  Repeat,
  RotateCcw,
  Shuffle,
  Undo2,
  Volume2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FavoriteButton, Highlight, SpeakButton, WordPartsView } from "@/components/word-bits";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  IconButton,
  IconTile,
  PageHeader,
  PageSkeleton,
  PosBadge,
  ProgressBar,
  ProgressRing,
  SectionTitle,
  Segmented,
  Switch,
} from "@/components/ui";
import { filterBySource, sourceLabel, studyWeight, weightedSample } from "@/lib/learning";
import { maskWord } from "@/lib/quiz-engine";
import { useSettings, type Settings } from "@/lib/settings";
import { useVocab, useVocabStats } from "@/lib/store";
import type { SourceKey, Word } from "@/lib/types";
import { cn, haptic, playTone, shuffle, speak } from "@/lib/utils";

type Front = Settings["flashFront"];
interface SessionConfig {
  ids: number[];
  front: Front;
  deck: SourceKey;
}

const GRADIENTS = [
  "from-brand-500 to-glow-500 shadow-brand-500/30",
  "from-sky-500 to-indigo-500 shadow-sky-500/30",
  "from-teal-500 to-emerald-500 shadow-teal-500/30",
  "from-pink-500 to-rose-500 shadow-pink-500/30",
  "from-amber-500 to-orange-500 shadow-orange-500/30",
  "from-violet-500 to-fuchsia-500 shadow-violet-500/30",
];
const backface: CSSProperties = { backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };

/* ---------------------------------- Setup --------------------------------- */

function FlashSetup({ initialDeck, onStart }: { initialDeck?: SourceKey; onStart: (c: SessionConfig) => void }) {
  const { words } = useVocab();
  const stats = useVocabStats();
  const { settings, update } = useSettings();
  const [deck, setDeck] = useState<SourceKey>(initialDeck ?? settings.flashDeck);
  const deckWords = useMemo(() => filterBySource(words, deck), [words, deck]);

  const decks: { key: SourceKey; label: string; count: number }[] = [
    { key: "all", label: "All words", count: stats.total },
    { key: "due", label: "Due", count: stats.due },
    { key: "new", label: "New", count: stats.new },
    { key: "weak", label: "Weak", count: stats.weak },
    { key: "learning", label: "Learning", count: stats.learning },
    { key: "mastered", label: "Mastered", count: stats.mastered },
    { key: "favorites", label: "Favorites", count: stats.favorites },
    ...stats.tags.slice(0, 8).map((t) => ({ key: `tag:${t}` as SourceKey, label: `#${t}`, count: filterBySource(words, `tag:${t}`).length })),
  ];

  const start = () => {
    let ordered: Word[];
    switch (settings.flashOrder) {
      case "shuffle":
        ordered = shuffle(deckWords);
        break;
      case "newest":
        ordered = deckWords;
        break;
      case "alpha":
        ordered = [...deckWords].sort((a, b) => a.word.localeCompare(b.word));
        break;
      default:
        ordered = weightedSample(deckWords, (w) => studyWeight(w), deckWords.length);
    }
    const list = settings.flashCount ? ordered.slice(0, settings.flashCount) : ordered;
    onStart({ ids: list.map((w) => w.id), front: settings.flashFront, deck });
  };

  if (!words.length)
    return (
      <>
        <PageHeader title="Flashcards" subtitle="Flip, swipe, remember" icon={Layers} tone="pink" />
        <EmptyState icon={Layers} tone="pink" title="No cards yet" text="Add some words first — every word becomes a flashcard automatically.">
          <Link href="/add">
            <Button>Add words</Button>
          </Link>
        </EmptyState>
      </>
    );

  const count = settings.flashCount ? Math.min(settings.flashCount, deckWords.length) : deckWords.length;

  return (
    <>
      <PageHeader title="Flashcards" subtitle="Flip, swipe, remember" icon={Layers} tone="pink" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 [&>*]:min-w-0">
        <div className="lg:order-2 lg:col-span-5">
          <div className="sheen relative animate-fade-up overflow-hidden rounded-[30px] bg-linear-to-br from-pink-500 via-rose-500 to-orange-400 p-6 text-white shadow-2xl shadow-rose-500/30 lg:sticky lg:top-24">
            <div className="pointer-events-none absolute -right-14 -top-14 size-56 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.3),transparent_65%)]" />
            <div className="relative mx-auto mb-6 mt-2 h-40 w-32">
              {[-14, 0, 14].map((deg, i) => (
                <div
                  key={deg}
                  className="absolute inset-0 grid place-items-center rounded-[22px] bg-white/20 shadow-xl ring-1 ring-white/35"
                  style={{ transform: `rotate(${deg}deg) translateY(${i === 1 ? -6 : 0}px)`, zIndex: i === 1 ? 2 : 1 }}
                >
                  {i === 1 && <span className="text-2xl font-extrabold">{deckWords[0]?.word.slice(0, 8) || "Aa"}</span>}
                </div>
              ))}
            </div>
            <div className="relative text-center">
              <h2 className="text-2xl font-extrabold tracking-tight">{sourceLabel(deck)}</h2>
              <p className="mt-1 text-sm text-white/85">
                {count} cards · tap to flip · swipe right if you know it
              </p>
              <button
                type="button"
                onClick={start}
                disabled={!deckWords.length}
                className="mt-5 inline-flex h-14 w-full items-center justify-center gap-2 rounded-[20px] bg-white text-[15px] font-extrabold text-rose-600 shadow-xl transition active:scale-[0.98] disabled:opacity-60"
              >
                <Play className="size-5 fill-current" /> Start session
              </button>
              {!deckWords.length && <p className="mt-2 text-[13px] font-semibold">This deck is empty — pick another.</p>}
            </div>
          </div>
        </div>

        <div className="stagger space-y-4 lg:order-1 lg:col-span-7">
          <Card className="p-4 sm:p-5">
            <SectionTitle title="Choose a deck" className="!px-0" />
            <div className="flex flex-wrap gap-2">
              {decks.map((d) => (
                <Chip
                  key={d.key}
                  active={deck === d.key}
                  count={d.count}
                  disabled={!d.count}
                  onClick={() => {
                    setDeck(d.key);
                    update({ flashDeck: d.key });
                  }}
                >
                  {d.label}
                </Chip>
              ))}
            </div>
          </Card>
          <Card className="space-y-5 p-4 sm:p-5">
            <div>
              <SectionTitle title="Front of card" className="!px-0" />
              <Segmented<Front>
                value={settings.flashFront}
                onChange={(v) => update({ flashFront: v })}
                options={[
                  { value: "word", label: "Word" },
                  { value: "bangla", label: "বাংলা" },
                  { value: "definition", label: "Definition" },
                ]}
              />
            </div>
            <div>
              <SectionTitle title="Order" className="!px-0" />
              <Segmented<Settings["flashOrder"]>
                value={settings.flashOrder}
                onChange={(v) => update({ flashOrder: v })}
                options={[
                  { value: "smart", label: "Smart" },
                  { value: "shuffle", label: "Shuffle" },
                  { value: "newest", label: "Newest" },
                  { value: "alpha", label: "A–Z" },
                ]}
              />
              <p className="mt-2 px-1 text-xs text-muted">Smart order prioritizes due, weak and new words.</p>
            </div>
            <div>
              <SectionTitle title="Cards per session" className="!px-0" />
              <Segmented<number>
                value={settings.flashCount}
                onChange={(v) => update({ flashCount: v })}
                options={[
                  { value: 10, label: "10" },
                  { value: 20, label: "20" },
                  { value: 50, label: "50" },
                  { value: 0, label: "All" },
                ]}
              />
            </div>
          </Card>
          <Card className="flex items-center gap-3 p-4 sm:px-5">
            <IconTile icon={Volume2} tone="sky" size="sm" />
            <div className="flex-1">
              <div className="text-sm font-bold">Auto-pronounce</div>
              <div className="text-xs text-muted">Speak each word as it appears</div>
            </div>
            <Switch checked={settings.autoPronounce} onChange={(v) => update({ autoPronounce: v })} label="Auto-pronounce" />
          </Card>
        </div>
      </div>
    </>
  );
}

/* ------------------------------ Swipeable card ---------------------------- */

function CardFront({ w, front }: { w: Word; front: Front }) {
  const grad = GRADIENTS[w.id % GRADIENTS.length];
  const text = front === "bangla" ? w.banglaMeaning : front === "definition" ? maskWord(w.englishMeaning, w.word) : "";
  return (
    <div className={cn("absolute inset-0 flex flex-col overflow-hidden rounded-[32px] bg-linear-to-br p-6 text-white shadow-2xl", grad)} style={backface}>
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-white/25 via-white/0 to-transparent" />
      <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.3),transparent_65%)]" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 size-72 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.14),transparent_65%)]" />
      <div className="relative flex items-center justify-between">
        <span className="rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wider ring-1 ring-white/25">
          {front === "word" ? w.partOfSpeech || "word" : front === "bangla" ? "বাংলা → English" : "Definition → word"}
        </span>
        <div className="flex items-center rounded-full bg-white/15 ring-1 ring-white/20 [&_button]:text-white">
          <FavoriteButton id={w.id} active={w.isFavorite} size="sm" className={w.isFavorite ? "!text-amber-300" : ""} />
          {front === "word" && <SpeakButton text={w.word} size="sm" />}
        </div>
      </div>
      <div className="relative my-auto px-2 text-center">
        {front === "word" || !text ? (
          <>
            <div className="break-words text-[42px] font-extrabold leading-tight tracking-tight sm:text-5xl">{w.word}</div>
            {w.pronunciation && <div className="mt-2 text-[15px] font-medium text-white/80">{w.pronunciation}</div>}
          </>
        ) : front === "bangla" ? (
          <div className="font-bangla text-[34px] font-semibold leading-snug">{text}</div>
        ) : (
          <div className="text-xl font-semibold leading-relaxed">{text}</div>
        )}
      </div>
      <div className="relative flex items-center justify-center gap-1.5 text-[12px] font-semibold text-white/75">
        <Hand className="size-3.5" /> Tap to flip · swipe to sort
      </div>
    </div>
  );
}

function CardBack({ w }: { w: Word }) {
  return (
    <div
      className="absolute inset-0 flex flex-col overflow-hidden rounded-[32px] border border-[var(--surface-border)] bg-white p-5 shadow-2xl dark:bg-[#131a2e] sm:p-6"
      style={{ ...backface, transform: "rotateY(180deg)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="break-words text-2xl font-extrabold tracking-tight">{w.word}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            {w.pronunciation}
            <PosBadge pos={w.partOfSpeech} />
          </div>
        </div>
        <SpeakButton text={w.word} />
      </div>
      <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
        {w.banglaMeaning && <p className="font-bangla text-[26px] font-semibold leading-snug text-brand-700 dark:text-brand-200">{w.banglaMeaning}</p>}
        {w.englishMeaning && <p className="text-[15px] leading-relaxed text-fg/85">{w.englishMeaning}</p>}
        {w.example && (
          <p className="rounded-2xl bg-amber-500/10 p-3 text-[14px] italic leading-relaxed">
            “<Highlight sentence={w.example} word={w.word} />”
          </p>
        )}
        {w.synonyms.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="mr-1 self-center text-[11px] font-bold uppercase tracking-wider text-muted">Syn</span>
            {w.synonyms.map((s) => (
              <span key={s} className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-[12.5px] font-semibold text-emerald-700 dark:text-emerald-300">
                {s}
              </span>
            ))}
          </div>
        )}
        {w.antonyms.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="mr-1 self-center text-[11px] font-bold uppercase tracking-wider text-muted">Ant</span>
            {w.antonyms.map((s) => (
              <span key={s} className="rounded-full bg-rose-500/12 px-2.5 py-1 text-[12.5px] font-semibold text-rose-700 dark:text-rose-300">
                {s}
              </span>
            ))}
          </div>
        )}
        <WordPartsView w={w} compact />
        {w.mnemonic && (
          <p className="flex gap-2 rounded-2xl bg-linear-to-br from-amber-400/20 to-orange-500/10 p-3 text-[13.5px] font-medium">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" /> {w.mnemonic}
          </p>
        )}
      </div>
    </div>
  );
}

function SwipeCard({
  w,
  front,
  flipped,
  exitDir,
  onFlip,
  onSwipe,
}: {
  w: Word;
  front: Front;
  flipped: boolean;
  exitDir: 0 | 1 | -1;
  onFlip: () => void;
  onSwipe: (known: boolean) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 0, 260], [-16, 0, 16]);
  const knowOpacity = useTransform(x, [25, 120], [0, 1]);
  const learnOpacity = useTransform(x, [-120, -25], [1, 0]);
  const dragging = useRef(false);
  const leaving = useRef(false);

  const fly = useCallback(
    async (dir: 1 | -1) => {
      if (leaving.current) return;
      leaving.current = true;
      await animate(x, dir * (window.innerWidth + 240), { duration: 0.34, ease: [0.2, 0.8, 0.2, 1] });
      onSwipe(dir === 1);
    },
    [x, onSwipe],
  );

  useEffect(() => {
    if (exitDir) void fly(exitDir);
  }, [exitDir, fly]);

  return (
    <motion.div
      className="absolute inset-0 z-20 cursor-grab touch-pan-y active:cursor-grabbing"
      style={{ x, rotate }}
      drag="x"
      dragMomentum={false}
      onDragStart={() => {
        dragging.current = true;
      }}
      onDragEnd={(_, info) => {
        setTimeout(() => {
          dragging.current = false;
        }, 60);
        const power = info.offset.x + info.velocity.x * 0.2;
        if (power > 130) void fly(1);
        else if (power < -130) void fly(-1);
        else void animate(x, 0, { type: "spring", stiffness: 500, damping: 32 });
      }}
      initial={{ scale: 0.94, y: 18 }}
      animate={{ scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
    >
      <div
        className="relative h-full w-full"
        onClick={() => {
          if (!dragging.current) onFlip();
        }}
      >
        <motion.div
          className="relative h-full w-full"
          style={{ transformStyle: "preserve-3d", transformPerspective: 1600 }}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 240, damping: 24 }}
        >
          <CardFront w={w} front={front} />
          <CardBack w={w} />
        </motion.div>
        <motion.div
          style={{ opacity: knowOpacity }}
          className="pointer-events-none absolute left-5 top-6 -rotate-12 rounded-2xl border-[3px] border-emerald-400 bg-emerald-500/90 px-3.5 py-1 text-lg font-extrabold uppercase tracking-wide text-white shadow-lg"
        >
          Know it
        </motion.div>
        <motion.div
          style={{ opacity: learnOpacity }}
          className="pointer-events-none absolute right-5 top-6 rotate-12 rounded-2xl border-[3px] border-orange-300 bg-orange-500/90 px-3.5 py-1 text-lg font-extrabold uppercase tracking-wide text-white shadow-lg"
        >
          Learning
        </motion.div>
      </div>
    </motion.div>
  );
}

/* --------------------------------- Session -------------------------------- */

function FlashSession({
  config,
  onExit,
  onRestart,
}: {
  config: SessionConfig;
  onExit: () => void;
  onRestart: (ids: number[]) => void;
}) {
  const { words, recordReviews } = useVocab();
  const { settings } = useSettings();
  const byId = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);
  const cards = useMemo(() => config.ids.map((id) => byId.get(id)).filter((w): w is Word => !!w), [config.ids, byId]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<{ id: number; known: boolean }[]>([]);
  const [exitDir, setExitDir] = useState<0 | 1 | -1>(0);
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const flushed = useRef(false);
  const done = cards.length > 0 && index >= cards.length;
  const current = cards[index];

  const flush = useCallback(() => {
    const list = resultsRef.current;
    if (flushed.current || !list.length) return;
    flushed.current = true;
    void recordReviews(
      list.map((r) => ({ wordId: r.id, correct: r.known })),
      "flashcard",
    );
  }, [recordReviews]);

  useEffect(() => {
    if (done) {
      flush();
      playTone("complete");
    }
  }, [done, flush]);

  useEffect(() => () => flush(), [flush]);

  const currentWord = current?.word;
  useEffect(() => {
    if (!currentWord || !settings.autoPronounce) return;
    if (config.front === "word" && !flipped) speak(currentWord);
    if (config.front !== "word" && flipped) speak(currentWord);
  }, [currentWord, index, flipped, settings.autoPronounce, config.front]);

  const handleSwipe = useCallback(
    (known: boolean) => {
      setResults((r) => (current ? [...r, { id: current.id, known }] : r));
      if (known) playTone("correct");
      else playTone("tap");
      haptic(10);
      setFlipped(false);
      setExitDir(0);
      setIndex((i) => i + 1);
    },
    [current],
  );

  const undo = useCallback(() => {
    if (!results.length || index === 0 || flushed.current) return;
    setResults((r) => r.slice(0, -1));
    setIndex((i) => i - 1);
    setFlipped(false);
    setExitDir(0);
  }, [results.length, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (done) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " " || e.key === "Enter") {
        if (tag === "BUTTON") return;
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "ArrowRight") setExitDir(1);
      else if (e.key === "ArrowLeft") setExitDir(-1);
      else if (e.key === "Backspace" || e.key.toLowerCase() === "z") undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, undo]);

  const known = results.filter((r) => r.known).length;
  const learning = results.length - known;

  if (!cards.length)
    return (
      <EmptyState icon={Layers} tone="pink" title="No cards in this session" text="The words may have been removed.">
        <Button icon={ArrowLeft} onClick={onExit}>
          Back
        </Button>
      </EmptyState>
    );

  if (done) {
    const pct = Math.round((known / Math.max(1, results.length)) * 100);
    const learningIds = results.filter((r) => !r.known).map((r) => r.id);
    return (
      <Card glass className="mx-auto max-w-lg animate-pop px-6 py-8 text-center">
        <ProgressRing value={pct / 100} size={148} stroke={12} className="mx-auto">
          <div className="leading-none">
            <div className="text-[38px] font-extrabold tabular-nums">{pct}%</div>
            <div className="mt-1.5 text-xs font-semibold text-muted">known</div>
          </div>
        </ProgressRing>
        <h2 className="mt-5 text-2xl font-extrabold tracking-tight">Session complete!</h2>
        <p className="mt-1 text-sm text-muted">
          You reviewed {results.length} cards. Your review schedule has been updated.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-emerald-500/10 py-3 ring-1 ring-emerald-500/20">
            <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-300">{known}</div>
            <div className="text-xs font-semibold text-muted">Known</div>
          </div>
          <div className="rounded-2xl bg-orange-500/10 py-3 ring-1 ring-orange-500/20">
            <div className="text-2xl font-extrabold text-orange-600 dark:text-orange-300">{learning}</div>
            <div className="text-xs font-semibold text-muted">Still learning</div>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-2">
          {learningIds.length > 0 && (
            <Button size="lg" icon={RotateCcw} onClick={() => onRestart(shuffle(learningIds))}>
              Review {learningIds.length} learning cards
            </Button>
          )}
          <Button size="lg" variant={learningIds.length ? "secondary" : "primary"} icon={Shuffle} onClick={() => onRestart(shuffle(config.ids))}>
            Restart deck
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" icon={ArrowLeft} onClick={onExit}>
              Decks
            </Button>
            <Link href="/quiz" className="contents">
              <Button variant="ghost" icon={Brain}>
                Take a quiz
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  const stack = cards.slice(index, index + 3);

  return (
    <div className="mx-auto max-w-md md:max-w-lg">
      <div className="flex items-center gap-3">
        <IconButton icon={X} label="End session" onClick={onExit} />
        <ProgressBar value={index / cards.length} className="h-2.5 flex-1" />
        <span className="min-w-[3.5rem] text-right text-sm font-bold tabular-nums">
          {index + 1}/{cards.length}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between px-1 text-[13px] font-bold">
        <span className="flex items-center gap-1.5 text-orange-600 dark:text-orange-300">
          <span className="size-2 rounded-full bg-orange-500" /> Learning {learning}
        </span>
        <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-300">
          Known {known} <span className="size-2 rounded-full bg-emerald-500" />
        </span>
      </div>

      <div className="relative mt-4 h-[min(52vh,500px)] min-h-[320px] w-full select-none sm:h-[min(56vh,520px)]">
        {stack
          .map((w, depth) =>
            depth === 0 ? (
              <SwipeCard
                key={w.id}
                w={w}
                front={config.front}
                flipped={flipped}
                exitDir={exitDir}
                onFlip={() => setFlipped((f) => !f)}
                onSwipe={handleSwipe}
              />
            ) : (
              <motion.div
                key={w.id}
                className={cn("absolute inset-0 rounded-[32px] bg-linear-to-br opacity-90 shadow-xl", GRADIENTS[w.id % GRADIENTS.length])}
                style={{ zIndex: 10 - depth }}
                initial={false}
                animate={{ scale: 1 - depth * 0.05, y: depth * 16, opacity: 1 - depth * 0.3 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            ),
          )
          .reverse()}
      </div>

      <div className="mt-5 flex items-center justify-center gap-3 sm:mt-7 sm:gap-4">
        <IconButton icon={Undo2} label="Undo" onClick={undo} disabled={!results.length} />
        <button
          type="button"
          aria-label="Still learning"
          onClick={() => setExitDir(-1)}
          className="grid size-16 place-items-center rounded-full bg-white text-orange-500 shadow-xl ring-1 ring-orange-500/20 transition active:scale-90 dark:bg-white/10"
        >
          <X className="size-7" strokeWidth={2.8} />
        </button>
        <button
          type="button"
          aria-label="Flip card"
          onClick={() => setFlipped((f) => !f)}
          className="surface grid size-14 place-items-center rounded-full text-brand-600 transition active:scale-90 dark:text-brand-300"
        >
          <Repeat className="size-6" />
        </button>
        <button
          type="button"
          aria-label="I know it"
          onClick={() => setExitDir(1)}
          className="sheen grid size-16 place-items-center rounded-full bg-linear-to-br from-emerald-500 to-teal-500 text-white shadow-xl shadow-emerald-500/30 transition active:scale-90"
        >
          <Check className="size-7" strokeWidth={2.8} />
        </button>
        <IconButton icon={Volume2} label="Pronounce" onClick={() => current && speak(current.word)} />
      </div>
      <p className="mt-4 hidden text-center text-xs text-muted md:block">
        Keys: <b>Space</b> flip · <b>←</b> learning · <b>→</b> know it · <b>Z</b> undo
      </p>
    </div>
  );
}

/* ---------------------------------- Page ---------------------------------- */

function FlashInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { status, words } = useVocab();
  const { settings } = useSettings();
  const [session, setSession] = useState<SessionConfig | null>(null);
  const [round, setRound] = useState(0);
  const deckParam = (params.get("deck") as SourceKey | null) ?? undefined;
  const idsHandled = useRef(false);

  useEffect(() => {
    const raw = params.get("ids");
    if (!raw || idsHandled.current || status !== "ready") return;
    idsHandled.current = true;
    const want = new Set(raw.split(",").map(Number));
    const ids = words.filter((w) => want.has(w.id)).map((w) => w.id);
    router.replace("/flashcards");
    if (!ids.length) return;
    setSession({ ids: shuffle(ids), front: settings.flashFront, deck: "all" });
    setRound((r) => r + 1);
  }, [params, status, words, settings.flashFront, router]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [session, round]);

  if (status === "loading") return <PageSkeleton />;
  if (session)
    return (
      <FlashSession
        key={round}
        config={session}
        onExit={() => setSession(null)}
        onRestart={(ids) => {
          setSession({ ...session, ids });
          setRound((r) => r + 1);
        }}
      />
    );
  return (
    <FlashSetup
      initialDeck={deckParam}
      onStart={(c) => {
        setSession(c);
        setRound((r) => r + 1);
      }}
    />
  );
}

export default function FlashcardsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FlashInner />
    </Suspense>
  );
}
