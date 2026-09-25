export type Difficulty = "easy" | "medium" | "hard";

export interface Word {
  id: number;
  word: string;
  pronunciation: string;
  partOfSpeech: string;
  banglaMeaning: string;
  englishMeaning: string;
  synonyms: string[];
  antonyms: string[];
  example: string;
  prefix: string;
  rootWord: string;
  suffix: string;
  mnemonic: string;
  etymology: string;
  notes: string;
  tags: string[];
  difficulty: Difficulty;
  isFavorite: boolean;
  mastery: number;
  timesReviewed: number;
  timesCorrect: number;
  timesWrong: number;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  /** Set when learning progress is reset, so the reset wins over older progress during device sync. */
  progressResetAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type WordInput = Pick<
  Word,
  | "word"
  | "pronunciation"
  | "partOfSpeech"
  | "banglaMeaning"
  | "englishMeaning"
  | "synonyms"
  | "antonyms"
  | "example"
  | "prefix"
  | "rootWord"
  | "suffix"
  | "mnemonic"
  | "etymology"
  | "notes"
  | "tags"
  | "difficulty"
  | "isFavorite"
>;

export interface DailyActivity {
  day: string;
  reviews: number;
  correct: number;
  wordsAdded: number;
  quizzes: number;
  flashcards: number;
}

export interface QuizSession {
  id: number;
  total: number;
  correct: number;
  durationSec: number;
  bestStreak: number;
  xp: number;
  source: string;
  types: string[];
  typeStats: Record<string, { total: number; correct: number }>;
  createdAt: string;
}

export interface BootstrapData {
  words: Word[];
  activity: DailyActivity[];
  sessions: QuizSession[];
}

export interface ReviewItem {
  wordId: number;
  correct: boolean;
  type?: string;
}

export type ReviewSource = "quiz" | "flashcard" | "match";

export interface RecapItem {
  wordId: number;
  reviews: number;
  correct: number;
  lastCorrect: boolean;
}

export interface RecapData {
  day: string | null;
  activity: DailyActivity | null;
  items: RecapItem[];
}

export interface ProgressData {
  typeStats: { type: string; total: number; correct: number }[];
  sourceStats: { source: string; total: number; correct: number }[];
  hours: number[];
  sessions: QuizSession[];
}

export interface WordHistoryItem {
  correct: boolean;
  source: string;
  qtype: string;
  createdAt: string;
}

export interface BackupImportResult {
  words: number;
  skipped: number;
  activity: number;
  sessions: number;
  logs: number;
}

export const PARTS_OF_SPEECH = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "interjection",
  "phrase",
  "idiom",
] as const;

export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

export const EMPTY_WORD_INPUT: WordInput = {
  word: "",
  pronunciation: "",
  partOfSpeech: "",
  banglaMeaning: "",
  englishMeaning: "",
  synonyms: [],
  antonyms: [],
  example: "",
  prefix: "",
  rootWord: "",
  suffix: "",
  mnemonic: "",
  etymology: "",
  notes: "",
  tags: [],
  difficulty: "medium",
  isFavorite: false,
};

export type WordStatus = "new" | "learning" | "reviewing" | "mastered";

export type SourceKey = "all" | "due" | "weak" | "new" | "learning" | "mastered" | "favorites" | `tag:${string}`;
