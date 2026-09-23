import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const words = pgTable(
  "words",
  {
    id: serial("id").primaryKey(),
    word: text("word").notNull(),
    pronunciation: text("pronunciation").notNull().default(""),
    partOfSpeech: text("part_of_speech").notNull().default(""),
    banglaMeaning: text("bangla_meaning").notNull().default(""),
    englishMeaning: text("english_meaning").notNull().default(""),
    synonyms: jsonb("synonyms").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    antonyms: jsonb("antonyms").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    example: text("example").notNull().default(""),
    prefix: text("prefix").notNull().default(""),
    rootWord: text("root_word").notNull().default(""),
    suffix: text("suffix").notNull().default(""),
    mnemonic: text("mnemonic").notNull().default(""),
    etymology: text("etymology").notNull().default(""),
    notes: text("notes").notNull().default(""),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    difficulty: text("difficulty").notNull().default("medium"),
    isFavorite: boolean("is_favorite").notNull().default(false),
    mastery: integer("mastery").notNull().default(0),
    timesReviewed: integer("times_reviewed").notNull().default(0),
    timesCorrect: integer("times_correct").notNull().default(0),
    timesWrong: integer("times_wrong").notNull().default(0),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("words_created_idx").on(t.createdAt), index("words_word_idx").on(t.word)],
);

export const dailyActivity = pgTable("daily_activity", {
  day: text("day").primaryKey(), // YYYY-MM-DD (client local date)
  reviews: integer("reviews").notNull().default(0),
  correct: integer("correct").notNull().default(0),
  wordsAdded: integer("words_added").notNull().default(0),
  quizzes: integer("quizzes").notNull().default(0),
  flashcards: integer("flashcards").notNull().default(0),
});

export const quizSessions = pgTable("quiz_sessions", {
  id: serial("id").primaryKey(),
  total: integer("total").notNull(),
  correct: integer("correct").notNull(),
  durationSec: integer("duration_sec").notNull().default(0),
  bestStreak: integer("best_streak").notNull().default(0),
  xp: integer("xp").notNull().default(0),
  source: text("source").notNull().default("all"),
  types: jsonb("types").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  typeStats: jsonb("type_stats")
    .$type<Record<string, { total: number; correct: number }>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviewLogs = pgTable(
  "review_logs",
  {
    id: serial("id").primaryKey(),
    wordId: integer("word_id")
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
    correct: boolean("correct").notNull(),
    source: text("source").notNull().default("quiz"),
    qtype: text("qtype").notNull().default(""),
    day: text("day").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("review_logs_day_idx").on(t.day), index("review_logs_word_idx").on(t.wordId)],
);

export type ReviewLogRow = typeof reviewLogs.$inferSelect;
export type WordRow = typeof words.$inferSelect;
export type NewWordRow = typeof words.$inferInsert;
export type DailyActivityRow = typeof dailyActivity.$inferSelect;
export type QuizSessionRow = typeof quizSessions.$inferSelect;
