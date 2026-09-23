import { desc, sql } from "drizzle-orm";
import { DATABASE_URL_MISSING, db } from "@/db";
import {
  dailyActivity,
  quizSessions,
  words,
  type DailyActivityRow,
  type NewWordRow,
  type QuizSessionRow,
  type WordRow,
} from "@/db/schema";
import type { BootstrapData, DailyActivity, Difficulty, QuizSession, Word } from "@/lib/types";

const DIFFS = ["easy", "medium", "hard"];

export function serializeWord(r: WordRow): Word {
  return {
    ...r,
    difficulty: (DIFFS.includes(r.difficulty) ? r.difficulty : "medium") as Difficulty,
    synonyms: Array.isArray(r.synonyms) ? r.synonyms : [],
    antonyms: Array.isArray(r.antonyms) ? r.antonyms : [],
    tags: Array.isArray(r.tags) ? r.tags : [],
    lastReviewedAt: r.lastReviewedAt ? r.lastReviewedAt.toISOString() : null,
    nextReviewAt: r.nextReviewAt ? r.nextReviewAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function serializeSession(r: QuizSessionRow): QuizSession {
  return {
    ...r,
    types: Array.isArray(r.types) ? r.types : [],
    typeStats: r.typeStats && typeof r.typeStats === "object" && !Array.isArray(r.typeStats) ? r.typeStats : {},
    createdAt: r.createdAt.toISOString(),
  };
}

export function serializeActivity(r: DailyActivityRow): DailyActivity {
  return { ...r };
}

const str = (v: unknown, max = 2000) =>
  typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "";

const list = (v: unknown, maxItems = 24): string[] => {
  const raw = Array.isArray(v) ? v.map((x) => String(x ?? "")) : typeof v === "string" ? v.split(/[,;|\n]/) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const t = item.trim().slice(0, 80);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= maxItems) break;
  }
  return out;
};

const bool = (v: unknown) => v === true || v === 1 || (typeof v === "string" && ["true", "1", "yes", "y"].includes(v.toLowerCase()));

const TEXT_FIELDS = [
  "pronunciation",
  "banglaMeaning",
  "englishMeaning",
  "example",
  "prefix",
  "rootWord",
  "suffix",
  "mnemonic",
  "etymology",
  "notes",
] as const;

export function sanitizeWordInput(
  body: unknown,
  opts: { partial?: boolean; requireMeaning?: boolean } = {},
): { data?: Partial<NewWordRow>; error?: string } {
  const { partial = false, requireMeaning = true } = opts;
  if (!body || typeof body !== "object") return { error: "Invalid request body" };
  const b = body as Record<string, unknown>;
  const has = (k: string) => k in b && b[k] !== undefined;
  const out: Partial<NewWordRow> = {};

  if (!partial || has("word")) {
    const w = str(b.word, 120);
    if (!w) return { error: "Word is required" };
    out.word = w;
  }
  for (const k of TEXT_FIELDS) if (!partial || has(k)) out[k] = str(b[k]);
  if (!partial || has("partOfSpeech")) out.partOfSpeech = str(b.partOfSpeech, 40).toLowerCase();
  if (!partial || has("synonyms")) out.synonyms = list(b.synonyms);
  if (!partial || has("antonyms")) out.antonyms = list(b.antonyms);
  if (!partial || has("tags")) out.tags = list(b.tags, 12);
  if (!partial || has("difficulty")) {
    const d = str(b.difficulty).toLowerCase();
    out.difficulty = DIFFS.includes(d) ? d : "medium";
  }
  if (!partial || has("isFavorite")) out.isFavorite = bool(b.isFavorite);

  if (!partial && requireMeaning && !out.banglaMeaning && !out.englishMeaning) {
    return { error: "Add a Bangla meaning or an English definition" };
  }
  return { data: out };
}

const int = (v: unknown, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
};
const date = (v: unknown) => {
  if (typeof v !== "string" || !v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/** Import accepts optional learning progress so backups can be restored. */
export function sanitizeImportItem(item: unknown): Partial<NewWordRow> | null {
  const { data } = sanitizeWordInput(item, { requireMeaning: false });
  if (!data) return null;
  const b = item as Record<string, unknown>;
  const mastery = int(b.mastery, 0, 5);
  const timesReviewed = int(b.timesReviewed, 0, 1_000_000);
  const timesCorrect = int(b.timesCorrect, 0, 1_000_000);
  const timesWrong = int(b.timesWrong, 0, 1_000_000);
  if (mastery !== undefined) data.mastery = mastery;
  if (timesReviewed !== undefined) data.timesReviewed = timesReviewed;
  if (timesCorrect !== undefined) data.timesCorrect = timesCorrect;
  if (timesWrong !== undefined) data.timesWrong = timesWrong;
  const last = date(b.lastReviewedAt);
  const next = date(b.nextReviewAt);
  const created = date(b.createdAt);
  if (last) data.lastReviewedAt = last;
  if (next) data.nextReviewAt = next;
  if (created) data.createdAt = created;
  return data;
}

export function safeDay(v: unknown) {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return new Date().toISOString().slice(0, 10);
}

type ActivityInc = Partial<Record<"reviews" | "correct" | "wordsAdded" | "quizzes" | "flashcards", number>>;

export async function bumpActivity(day: string, inc: ActivityInc): Promise<DailyActivity> {
  const v = {
    reviews: inc.reviews ?? 0,
    correct: inc.correct ?? 0,
    wordsAdded: inc.wordsAdded ?? 0,
    quizzes: inc.quizzes ?? 0,
    flashcards: inc.flashcards ?? 0,
  };
  const [row] = await db
    .insert(dailyActivity)
    .values({ day, ...v })
    .onConflictDoUpdate({
      target: dailyActivity.day,
      set: {
        reviews: sql`${dailyActivity.reviews} + ${v.reviews}::int`,
        correct: sql`${dailyActivity.correct} + ${v.correct}::int`,
        wordsAdded: sql`${dailyActivity.wordsAdded} + ${v.wordsAdded}::int`,
        quizzes: sql`${dailyActivity.quizzes} + ${v.quizzes}::int`,
        flashcards: sql`${dailyActivity.flashcards} + ${v.flashcards}::int`,
      },
    })
    .returning();
  return serializeActivity(row);
}

const DDL = `
CREATE TABLE IF NOT EXISTS "words" (
  "id" serial PRIMARY KEY NOT NULL,
  "word" text NOT NULL,
  "pronunciation" text DEFAULT '' NOT NULL,
  "part_of_speech" text DEFAULT '' NOT NULL,
  "bangla_meaning" text DEFAULT '' NOT NULL,
  "english_meaning" text DEFAULT '' NOT NULL,
  "synonyms" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "antonyms" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "example" text DEFAULT '' NOT NULL,
  "prefix" text DEFAULT '' NOT NULL,
  "root_word" text DEFAULT '' NOT NULL,
  "suffix" text DEFAULT '' NOT NULL,
  "mnemonic" text DEFAULT '' NOT NULL,
  "etymology" text DEFAULT '' NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "difficulty" text DEFAULT 'medium' NOT NULL,
  "is_favorite" boolean DEFAULT false NOT NULL,
  "mastery" integer DEFAULT 0 NOT NULL,
  "times_reviewed" integer DEFAULT 0 NOT NULL,
  "times_correct" integer DEFAULT 0 NOT NULL,
  "times_wrong" integer DEFAULT 0 NOT NULL,
  "last_reviewed_at" timestamp with time zone,
  "next_review_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "words_created_idx" ON "words" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "words_word_idx" ON "words" USING btree ("word");
CREATE TABLE IF NOT EXISTS "daily_activity" (
  "day" text PRIMARY KEY NOT NULL,
  "reviews" integer DEFAULT 0 NOT NULL,
  "correct" integer DEFAULT 0 NOT NULL,
  "words_added" integer DEFAULT 0 NOT NULL,
  "quizzes" integer DEFAULT 0 NOT NULL,
  "flashcards" integer DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS "quiz_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "total" integer NOT NULL,
  "correct" integer NOT NULL,
  "duration_sec" integer DEFAULT 0 NOT NULL,
  "best_streak" integer DEFAULT 0 NOT NULL,
  "xp" integer DEFAULT 0 NOT NULL,
  "source" text DEFAULT 'all' NOT NULL,
  "types" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "quiz_sessions" ADD COLUMN IF NOT EXISTS "type_stats" jsonb DEFAULT '{}'::jsonb NOT NULL;
CREATE TABLE IF NOT EXISTS "review_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "word_id" integer NOT NULL,
  "correct" boolean NOT NULL,
  "source" text DEFAULT 'quiz' NOT NULL,
  "qtype" text DEFAULT '' NOT NULL,
  "day" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "review_logs_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS "review_logs_day_idx" ON "review_logs" USING btree ("day");
CREATE INDEX IF NOT EXISTS "review_logs_word_idx" ON "review_logs" USING btree ("word_id");
CREATE TABLE IF NOT EXISTS "sync_rooms" (
  "code" varchar(5) PRIMARY KEY NOT NULL,
  "host_token" text NOT NULL,
  "guest_token" text,
  "host_name" text NOT NULL,
  "guest_name" text,
  "offer" jsonb,
  "answer" jsonb,
  "host_candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "guest_candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "sync_rooms_expiry_idx" ON "sync_rooms" USING btree ("expires_at");`;

let schemaReady: Promise<void> | null = null;

/** Idempotently creates tables so the app self-heals on a fresh database. Runs once per process. */
export function ensureSchema() {
  if (!process.env.DATABASE_URL) return Promise.reject(new Error(DATABASE_URL_MISSING));
  schemaReady ??= db
    .execute(sql.raw(DDL))
    .then(() => undefined)
    .catch((err) => {
      schemaReady = null;
      throw err;
    });
  return schemaReady;
}

export async function getBootstrap(): Promise<BootstrapData> {
  await ensureSchema();
  const [ws, act, sess] = await Promise.all([
    db.select().from(words).orderBy(desc(words.createdAt), desc(words.id)),
    db.select().from(dailyActivity).orderBy(desc(dailyActivity.day)).limit(400),
    db.select().from(quizSessions).orderBy(desc(quizSessions.createdAt)).limit(30),
  ]);
  return {
    words: ws.map(serializeWord),
    activity: act.map(serializeActivity),
    sessions: sess.map(serializeSession),
  };
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
