import { computeReview, localDay } from "./learning";
import { SAMPLE_WORDS } from "./sample-words";
import { capitalizeFirst, sentenceCase } from "./text-format";
import type {
  BackupImportResult,
  BootstrapData,
  DailyActivity,
  Difficulty,
  ProgressData,
  QuizSession,
  RecapData,
  RecapItem,
  ReviewItem,
  ReviewSource,
  Word,
  WordHistoryItem,
  WordInput,
} from "./types";
import { uniqueCI } from "./utils";

const DB_NAME = "vocabera_local_db";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (!isBrowser()) {
    return Promise.reject(new Error("IndexedDB is only available in browser"));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      // 1. Words store
      if (!db.objectStoreNames.contains("words")) {
        const wordsStore = db.createObjectStore("words", { keyPath: "id" });
        wordsStore.createIndex("word", "word", { unique: false });
        wordsStore.createIndex("createdAt", "createdAt", { unique: false });
        wordsStore.createIndex("isFavorite", "isFavorite", { unique: false });
        wordsStore.createIndex("mastery", "mastery", { unique: false });
      }

      // 2. Daily activity store
      if (!db.objectStoreNames.contains("daily_activity")) {
        db.createObjectStore("daily_activity", { keyPath: "day" });
      }

      // 3. Quiz sessions store
      if (!db.objectStoreNames.contains("quiz_sessions")) {
        const sessStore = db.createObjectStore("quiz_sessions", {
          keyPath: "id",
          autoIncrement: true,
        });
        sessStore.createIndex("createdAt", "createdAt", { unique: false });
      }

      // 4. Review logs store (for history, recap & progress)
      if (!db.objectStoreNames.contains("review_logs")) {
        const logsStore = db.createObjectStore("review_logs", {
          keyPath: "id",
          autoIncrement: true,
        });
        logsStore.createIndex("day", "day", { unique: false });
        logsStore.createIndex("wordId", "wordId", { unique: false });
        logsStore.createIndex("createdAt", "createdAt", { unique: false });
      }

      // 5. Meta store (seeded flag, settings cache)
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error("Failed to open IndexedDB"));
    };
  });

  return dbPromise;
}

// Generic transaction helper
async function tx<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  callback: (transaction: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeNames, mode);
    let result: T;

    transaction.onerror = () => reject(transaction.error || new Error("Transaction failed"));
    transaction.onabort = () => reject(new Error("Transaction aborted"));

    Promise.resolve(callback(transaction))
      .then((res) => {
        result = res;
      })
      .catch((err) => {
        try {
          transaction.abort();
        } catch {
          /* ignore */
        }
        reject(err);
      });

    transaction.oncomplete = () => resolve(result);
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB request failed"));
  });
}

/* ------------------------------- Initial Seeding ------------------------------- */

export async function initLocalDatabase(): Promise<void> {
  if (!isBrowser()) return;
  const db = await openDb();

  return tx(["words", "meta"], "readwrite", async (transaction) => {
    const metaStore = transaction.objectStore("meta");
    const wordsStore = transaction.objectStore("words");

    const metaReq = metaStore.get("initialized");
    const initMeta = await reqToPromise(metaReq);

    const countReq = wordsStore.count();
    const count = await reqToPromise(countReq);

    if (!initMeta && count === 0) {
      // First time launch: seed default sample words so the app is instantly rich with content
      const now = Date.now();
      SAMPLE_WORDS.forEach((w, index) => {
        const id = index + 1;
        const wordObj: Word = {
          id,
          word: capitalizeFirst(w.word),
          pronunciation: w.pronunciation || "",
          partOfSpeech: w.partOfSpeech || "",
          banglaMeaning: w.banglaMeaning || "",
          englishMeaning: sentenceCase(w.englishMeaning || ""),
          synonyms: (w.synonyms || []).map(capitalizeFirst),
          antonyms: (w.antonyms || []).map(capitalizeFirst),
          example: sentenceCase(w.example || ""),
          prefix: w.prefix || "",
          rootWord: w.rootWord || "",
          suffix: w.suffix || "",
          mnemonic: w.mnemonic ? sentenceCase(w.mnemonic) : "",
          etymology: w.etymology ? sentenceCase(w.etymology) : "",
          notes: w.notes || "",
          tags: w.tags || [],
          difficulty: w.difficulty || "medium",
          isFavorite: !!w.isFavorite,
          mastery: 0,
          timesReviewed: 0,
          timesCorrect: 0,
          timesWrong: 0,
          lastReviewedAt: null,
          nextReviewAt: null,
          createdAt: new Date(now - index * 1000).toISOString(),
          updatedAt: new Date(now).toISOString(),
        };
        wordsStore.put(wordObj);
      });
      metaStore.put({ key: "initialized", value: true, seededAt: new Date().toISOString() });
    }
  });
}

/* ------------------------------- Bootstrap Data ------------------------------- */

export async function getLocalBootstrap(): Promise<BootstrapData> {
  await initLocalDatabase();

  return tx(["words", "daily_activity", "quiz_sessions"], "readonly", async (transaction) => {
    const wordsStore = transaction.objectStore("words");
    const actStore = transaction.objectStore("daily_activity");
    const sessStore = transaction.objectStore("quiz_sessions");

    const [wordsRaw, actRaw, sessRaw] = await Promise.all([
      reqToPromise(wordsStore.getAll()),
      reqToPromise(actStore.getAll()),
      reqToPromise(sessStore.getAll()),
    ]);

    const words = (wordsRaw as Word[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const activity = (actRaw as DailyActivity[]).sort((a, b) => b.day.localeCompare(a.day));
    const sessions = (sessRaw as QuizSession[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return { words, activity, sessions };
  });
}

/* --------------------------------- Word CRUD --------------------------------- */

export async function addLocalWord(
  input: WordInput,
  today = localDay(),
): Promise<{ word: Word; activity: DailyActivity }> {
  await initLocalDatabase();

  return tx(["words", "daily_activity"], "readwrite", async (transaction) => {
    const wordsStore = transaction.objectStore("words");
    const actStore = transaction.objectStore("daily_activity");

    const allWords = (await reqToPromise(wordsStore.getAll())) as Word[];
    const maxId = allWords.reduce((max, w) => Math.max(max, w.id || 0), 0);
    const id = maxId + 1;

    const nowIso = new Date().toISOString();
    const newWord: Word = {
      id,
      word: capitalizeFirst(input.word.trim()),
      pronunciation: input.pronunciation?.trim() || "",
      partOfSpeech: input.partOfSpeech?.trim() || "",
      banglaMeaning: input.banglaMeaning?.trim() || "",
      englishMeaning: sentenceCase(input.englishMeaning?.trim() || ""),
      synonyms: (input.synonyms || []).map((s) => capitalizeFirst(s.trim())).filter(Boolean),
      antonyms: (input.antonyms || []).map((s) => capitalizeFirst(s.trim())).filter(Boolean),
      example: sentenceCase(input.example?.trim() || ""),
      prefix: input.prefix?.trim() || "",
      rootWord: input.rootWord?.trim() || "",
      suffix: input.suffix?.trim() || "",
      mnemonic: input.mnemonic?.trim() ? sentenceCase(input.mnemonic.trim()) : "",
      etymology: input.etymology?.trim() ? sentenceCase(input.etymology.trim()) : "",
      notes: input.notes?.trim() || "",
      tags: uniqueCI(input.tags || []),
      difficulty: input.difficulty || "medium",
      isFavorite: !!input.isFavorite,
      mastery: 0,
      timesReviewed: 0,
      timesCorrect: 0,
      timesWrong: 0,
      lastReviewedAt: null,
      nextReviewAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    wordsStore.put(newWord);

    // Bump daily activity wordsAdded
    const actReq = actStore.get(today);
    const existingAct = (await reqToPromise(actReq)) as DailyActivity | undefined;
    const updatedAct: DailyActivity = existingAct
      ? { ...existingAct, wordsAdded: existingAct.wordsAdded + 1 }
      : { day: today, reviews: 0, correct: 0, wordsAdded: 1, quizzes: 0, flashcards: 0 };

    actStore.put(updatedAct);

    return { word: newWord, activity: updatedAct };
  });
}

export async function updateLocalWord(
  id: number,
  patch: Partial<WordInput>,
): Promise<Word | null> {
  return tx(["words"], "readwrite", async (transaction) => {
    const wordsStore = transaction.objectStore("words");
    const existing = (await reqToPromise(wordsStore.get(id))) as Word | undefined;
    if (!existing) return null;

    const updated: Word = {
      ...existing,
      ...patch,
      word: patch.word !== undefined ? capitalizeFirst(patch.word.trim()) : existing.word,
      englishMeaning:
        patch.englishMeaning !== undefined
          ? sentenceCase(patch.englishMeaning.trim())
          : existing.englishMeaning,
      example: patch.example !== undefined ? sentenceCase(patch.example.trim()) : existing.example,
      synonyms:
        patch.synonyms !== undefined
          ? patch.synonyms.map(capitalizeFirst)
          : existing.synonyms,
      antonyms:
        patch.antonyms !== undefined
          ? patch.antonyms.map(capitalizeFirst)
          : existing.antonyms,
      updatedAt: new Date().toISOString(),
    };

    wordsStore.put(updated);
    return updated;
  });
}

export async function deleteLocalWord(id: number): Promise<boolean> {
  return tx(["words", "review_logs"], "readwrite", async (transaction) => {
    const wordsStore = transaction.objectStore("words");
    const logsStore = transaction.objectStore("review_logs");

    const existing = await reqToPromise(wordsStore.get(id));
    if (!existing) return false;

    wordsStore.delete(id);

    // Clean up review logs for this word
    const index = logsStore.index("wordId");
    const request = index.openCursor(IDBKeyRange.only(id));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    return true;
  });
}

/* ------------------------------- Bulk Operations ------------------------------- */

export async function bulkAddLocalWords(
  items: unknown[],
  today = localDay(),
): Promise<{ inserted: Word[]; skipped: number; activity: DailyActivity }> {
  await initLocalDatabase();

  return tx(["words", "daily_activity"], "readwrite", async (transaction) => {
    const wordsStore = transaction.objectStore("words");
    const actStore = transaction.objectStore("daily_activity");

    const allExisting = (await reqToPromise(wordsStore.getAll())) as Word[];
    const have = new Set(allExisting.map((w) => w.word.toLowerCase()));
    let maxId = allExisting.reduce((max, w) => Math.max(max, w.id || 0), 0);

    const inserted: Word[] = [];
    let skipped = 0;
    const nowIso = new Date().toISOString();

    for (const item of items) {
      if (!item || typeof item !== "object") {
        skipped++;
        continue;
      }
      const b = item as Record<string, unknown>;
      const rawWord = typeof b.word === "string" ? b.word.trim() : "";
      if (!rawWord) {
        skipped++;
        continue;
      }

      const key = rawWord.toLowerCase();
      if (have.has(key)) {
        skipped++;
        continue;
      }
      have.add(key);

      maxId++;
      const id = maxId;

      const bn = typeof b.banglaMeaning === "string" ? b.banglaMeaning.trim() : "";
      const en = typeof b.englishMeaning === "string" ? sentenceCase(b.englishMeaning.trim()) : "";
      if (!bn && !en) {
        skipped++;
        continue;
      }

      const synRaw = Array.isArray(b.synonyms)
        ? b.synonyms
        : typeof b.synonyms === "string"
          ? b.synonyms.split(/[,;]/)
          : [];
      const antRaw = Array.isArray(b.antonyms)
        ? b.antonyms
        : typeof b.antonyms === "string"
          ? b.antonyms.split(/[,;]/)
          : [];
      const tagsRaw = Array.isArray(b.tags)
        ? b.tags
        : typeof b.tags === "string"
          ? b.tags.split(/[,;]/)
          : [];

      const newWord: Word = {
        id,
        word: capitalizeFirst(rawWord),
        pronunciation: typeof b.pronunciation === "string" ? b.pronunciation.trim() : "",
        partOfSpeech: typeof b.partOfSpeech === "string" ? b.partOfSpeech.trim().toLowerCase() : "",
        banglaMeaning: bn,
        englishMeaning: en,
        synonyms: synRaw.map((s) => capitalizeFirst(String(s).trim())).filter(Boolean),
        antonyms: antRaw.map((s) => capitalizeFirst(String(s).trim())).filter(Boolean),
        example: typeof b.example === "string" ? sentenceCase(b.example.trim()) : "",
        prefix: typeof b.prefix === "string" ? b.prefix.trim() : "",
        rootWord: typeof b.rootWord === "string" ? b.rootWord.trim() : "",
        suffix: typeof b.suffix === "string" ? b.suffix.trim() : "",
        mnemonic: typeof b.mnemonic === "string" ? sentenceCase(b.mnemonic.trim()) : "",
        etymology: typeof b.etymology === "string" ? sentenceCase(b.etymology.trim()) : "",
        notes: typeof b.notes === "string" ? b.notes.trim() : "",
        tags: uniqueCI(tagsRaw.map(String)),
        difficulty: (["easy", "medium", "hard"].includes(String(b.difficulty))
          ? String(b.difficulty)
          : "medium") as Difficulty,
        isFavorite: b.isFavorite === true || b.isFavorite === "true",
        mastery: Number(b.mastery) || 0,
        timesReviewed: Number(b.timesReviewed) || 0,
        timesCorrect: Number(b.timesCorrect) || 0,
        timesWrong: Number(b.timesWrong) || 0,
        lastReviewedAt: typeof b.lastReviewedAt === "string" ? b.lastReviewedAt : null,
        nextReviewAt: typeof b.nextReviewAt === "string" ? b.nextReviewAt : null,
        createdAt: typeof b.createdAt === "string" ? b.createdAt : nowIso,
        updatedAt: nowIso,
      };

      wordsStore.put(newWord);
      inserted.push(newWord);
    }

    // Bump daily activity
    const actReq = actStore.get(today);
    const existingAct = (await reqToPromise(actReq)) as DailyActivity | undefined;
    const updatedAct: DailyActivity = existingAct
      ? { ...existingAct, wordsAdded: existingAct.wordsAdded + inserted.length }
      : { day: today, reviews: 0, correct: 0, wordsAdded: inserted.length, quizzes: 0, flashcards: 0 };

    if (inserted.length > 0) {
      actStore.put(updatedAct);
    }

    return { inserted, skipped, activity: updatedAct };
  });
}

export async function bulkDeleteLocalWords(ids: number[]): Promise<void> {
  const set = new Set(ids);
  return tx(["words", "review_logs"], "readwrite", async (transaction) => {
    const wordsStore = transaction.objectStore("words");
    const logsStore = transaction.objectStore("review_logs");

    set.forEach((id) => {
      wordsStore.delete(id);
    });

    const index = logsStore.index("wordId");
    set.forEach((id) => {
      const req = index.openCursor(IDBKeyRange.only(id));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    });
  });
}

export async function bulkUpdateLocalWords(
  ids: number[],
  patch: { isFavorite?: boolean; difficulty?: string },
): Promise<Word[]> {
  const set = new Set(ids);
  return tx(["words"], "readwrite", async (transaction) => {
    const wordsStore = transaction.objectStore("words");
    const all = (await reqToPromise(wordsStore.getAll())) as Word[];
    const updated: Word[] = [];
    const nowIso = new Date().toISOString();

    for (const w of all) {
      if (!set.has(w.id)) continue;
      const u: Word = {
        ...w,
        ...(patch.isFavorite !== undefined ? { isFavorite: patch.isFavorite } : {}),
        ...(patch.difficulty !== undefined ? { difficulty: patch.difficulty as Difficulty } : {}),
        updatedAt: nowIso,
      };
      wordsStore.put(u);
      updated.push(u);
    }

    return updated;
  });
}

export async function bulkResetLocalProgress(ids: number[]): Promise<Word[]> {
  const set = new Set(ids);
  return tx(["words"], "readwrite", async (transaction) => {
    const wordsStore = transaction.objectStore("words");
    const all = (await reqToPromise(wordsStore.getAll())) as Word[];
    const updated: Word[] = [];
    const nowIso = new Date().toISOString();

    for (const w of all) {
      if (!set.has(w.id)) continue;
      const u: Word = {
        ...w,
        mastery: 0,
        timesReviewed: 0,
        timesCorrect: 0,
        timesWrong: 0,
        lastReviewedAt: null,
        nextReviewAt: null,
        updatedAt: nowIso,
      };
      wordsStore.put(u);
      updated.push(u);
    }

    return updated;
  });
}

/* ------------------------------- Record Reviews ------------------------------- */

export interface SessionPayload {
  total: number;
  correct: number;
  durationSec: number;
  bestStreak: number;
  xp: number;
  source: string;
  types: string[];
}

export async function recordLocalReviews(
  items: ReviewItem[],
  source: ReviewSource,
  session?: SessionPayload,
  today = localDay(),
): Promise<{ words: Word[]; activity: DailyActivity; session: QuizSession | null }> {
  await initLocalDatabase();

  return tx(
    ["words", "daily_activity", "quiz_sessions", "review_logs"],
    "readwrite",
    async (transaction) => {
      const wordsStore = transaction.objectStore("words");
      const actStore = transaction.objectStore("daily_activity");
      const sessStore = transaction.objectStore("quiz_sessions");
      const logsStore = transaction.objectStore("review_logs");

      const now = new Date();
      const updatedWords: Word[] = [];

      // Update words with spaced repetition
      for (const item of items) {
        const w = (await reqToPromise(wordsStore.get(item.wordId))) as Word | undefined;
        if (!w) continue;

        const rev = computeReview(w, item.correct, now);
        const u: Word = {
          ...w,
          mastery: rev.mastery,
          timesReviewed: rev.timesReviewed,
          timesCorrect: rev.timesCorrect,
          timesWrong: rev.timesWrong,
          lastReviewedAt: rev.lastReviewedAt.toISOString(),
          nextReviewAt: rev.nextReviewAt.toISOString(),
          updatedAt: now.toISOString(),
        };

        wordsStore.put(u);
        updatedWords.push(u);

        // Add review log
        logsStore.add({
          wordId: item.wordId,
          correct: item.correct,
          source,
          qtype: item.type || "",
          day: today,
          createdAt: now.toISOString(),
        });
      }

      // Update / insert quiz session if provided
      let savedSession: QuizSession | null = null;
      if (source === "quiz" && session) {
        const typeStats: Record<string, { total: number; correct: number }> = {};
        for (const i of items) {
          if (!i.type) continue;
          const t = (typeStats[i.type] ??= { total: 0, correct: 0 });
          t.total++;
          if (i.correct) t.correct++;
        }

        const sessObj = {
          total: session.total,
          correct: session.correct,
          durationSec: session.durationSec,
          bestStreak: session.bestStreak,
          xp: session.xp,
          source: session.source || "all",
          types: session.types || [],
          typeStats,
          createdAt: now.toISOString(),
        };

        const idReq = sessStore.add(sessObj);
        const newId = (await reqToPromise(idReq)) as number;
        savedSession = { id: newId, ...sessObj };
      }

      // Bump daily activity
      const correctCount = items.filter((i) => i.correct).length;
      const actReq = actStore.get(today);
      const existingAct = (await reqToPromise(actReq)) as DailyActivity | undefined;

      const updatedAct: DailyActivity = existingAct
        ? {
            day: today,
            reviews: existingAct.reviews + items.length,
            correct: existingAct.correct + correctCount,
            wordsAdded: existingAct.wordsAdded,
            quizzes: existingAct.quizzes + (savedSession ? 1 : 0),
            flashcards: existingAct.flashcards + (source === "flashcard" ? items.length : 0),
          }
        : {
            day: today,
            reviews: items.length,
            correct: correctCount,
            wordsAdded: 0,
            quizzes: savedSession ? 1 : 0,
            flashcards: source === "flashcard" ? items.length : 0,
          };

      actStore.put(updatedAct);

      return { words: updatedWords, activity: updatedAct, session: savedSession };
    },
  );
}

/* ------------------------------- Local Recap Data ------------------------------- */

export async function getLocalRecap(today = localDay()): Promise<RecapData> {
  await initLocalDatabase();

  return tx(["daily_activity", "review_logs"], "readonly", async (transaction) => {
    const actStore = transaction.objectStore("daily_activity");
    const logsStore = transaction.objectStore("review_logs");

    const allAct = ((await reqToPromise(actStore.getAll())) as DailyActivity[])
      .filter((a) => a.day < today && (a.reviews > 0 || a.wordsAdded > 0))
      .sort((a, b) => b.day.localeCompare(a.day));

    const day = allAct[0]?.day ?? null;
    if (!day) return { day: null, activity: null, items: [] };

    const act = allAct[0];

    const dayIndex = logsStore.index("day");
    const logsReq = dayIndex.getAll(IDBKeyRange.only(day));
    const dayLogs = ((await reqToPromise(logsReq)) as Array<{
      wordId: number;
      correct: boolean;
      createdAt: string;
    }>) || [];

    // Group logs by wordId
    const wordMap = new Map<number, { reviews: number; correct: number; lastCorrect: boolean; lastAt: string }>();
    for (const log of dayLogs) {
      const cur = wordMap.get(log.wordId);
      if (!cur) {
        wordMap.set(log.wordId, {
          reviews: 1,
          correct: log.correct ? 1 : 0,
          lastCorrect: log.correct,
          lastAt: log.createdAt,
        });
      } else {
        cur.reviews++;
        if (log.correct) cur.correct++;
        if (log.createdAt >= cur.lastAt) {
          cur.lastCorrect = log.correct;
          cur.lastAt = log.createdAt;
        }
      }
    }

    const items: RecapItem[] = Array.from(wordMap.entries()).map(([wordId, v]) => ({
      wordId,
      reviews: v.reviews,
      correct: v.correct,
      lastCorrect: v.lastCorrect,
    }));

    return { day, activity: act, items };
  });
}

/* ----------------------------- Local Progress Insights ----------------------------- */

export async function getLocalProgress(tzMinutes = 0): Promise<ProgressData> {
  await initLocalDatabase();

  return tx(["review_logs", "quiz_sessions"], "readonly", async (transaction) => {
    const logsStore = transaction.objectStore("review_logs");
    const sessStore = transaction.objectStore("quiz_sessions");

    const [allLogs, allSessions] = await Promise.all([
      reqToPromise(logsStore.getAll()) as Promise<
        Array<{
          wordId: number;
          correct: boolean;
          source: string;
          qtype: string;
          day: string;
          createdAt: string;
        }>
      >,
      reqToPromise(sessStore.getAll()) as Promise<QuizSession[]>,
    ]);

    // Question type stats
    const typeMap = new Map<string, { total: number; correct: number }>();
    const sourceMap = new Map<string, { total: number; correct: number }>();
    const hours = Array.from({ length: 24 }, () => 0);

    for (const log of allLogs) {
      // Type stats
      if (log.source === "quiz" && log.qtype) {
        const t = typeMap.get(log.qtype) ?? { total: 0, correct: 0 };
        t.total++;
        if (log.correct) t.correct++;
        typeMap.set(log.qtype, t);
      }

      // Source stats
      if (log.source) {
        const s = sourceMap.get(log.source) ?? { total: 0, correct: 0 };
        s.total++;
        if (log.correct) s.correct++;
        sourceMap.set(log.source, s);
      }

      // Study hour (adjusted for user timezone)
      if (log.createdAt) {
        const d = new Date(log.createdAt);
        // adjust minutes
        const localHour = new Date(d.getTime() - tzMinutes * 60_000).getUTCHours();
        if (localHour >= 0 && localHour < 24) {
          hours[localHour]++;
        }
      }
    }

    const typeStats = Array.from(typeMap.entries()).map(([type, v]) => ({
      type,
      total: v.total,
      correct: v.correct,
    }));

    const sourceStats = Array.from(sourceMap.entries()).map(([source, v]) => ({
      source,
      total: v.total,
      correct: v.correct,
    }));

    const sessions = allSessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);

    return { typeStats, sourceStats, hours, sessions };
  });
}

/* ---------------------------- Local Word Review History ---------------------------- */

export async function getLocalWordHistory(wordId: number): Promise<WordHistoryItem[]> {
  await initLocalDatabase();

  return tx(["review_logs"], "readonly", async (transaction) => {
    const logsStore = transaction.objectStore("review_logs");
    const index = logsStore.index("wordId");
    const logsReq = index.getAll(IDBKeyRange.only(wordId));
    const logs = ((await reqToPromise(logsReq)) as Array<{
      correct: boolean;
      source: string;
      qtype: string;
      createdAt: string;
    }>) || [];

    return logs
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-30)
      .map((l) => ({
        correct: l.correct,
        source: l.source,
        qtype: l.qtype,
        createdAt: l.createdAt,
      }));
  });
}

/* ------------------------------- Export / Import ------------------------------- */

export async function exportLocalData(): Promise<Record<string, unknown>> {
  await initLocalDatabase();

  return tx(
    ["words", "daily_activity", "quiz_sessions", "review_logs"],
    "readonly",
    async (transaction) => {
      const words = await reqToPromise(transaction.objectStore("words").getAll());
      const activity = await reqToPromise(transaction.objectStore("daily_activity").getAll());
      const sessions = await reqToPromise(transaction.objectStore("quiz_sessions").getAll());
      const logs = await reqToPromise(transaction.objectStore("review_logs").getAll());

      return {
        app: "VocaBera",
        version: 2,
        exportedAt: new Date().toISOString(),
        words,
        activity,
        sessions,
        logs,
      };
    },
  );
}

export async function importLocalBackup(
  data: unknown,
  mode: "merge" | "replace",
): Promise<BackupImportResult & { snapshot: BootstrapData }> {
  await initLocalDatabase();

  return tx(
    ["words", "daily_activity", "quiz_sessions", "review_logs"],
    "readwrite",
    async (transaction) => {
      const wordsStore = transaction.objectStore("words");
      const actStore = transaction.objectStore("daily_activity");
      const sessStore = transaction.objectStore("quiz_sessions");
      const logsStore = transaction.objectStore("review_logs");

      if (mode === "replace") {
        wordsStore.clear();
        actStore.clear();
        sessStore.clear();
        logsStore.clear();
      }

      const obj = (Array.isArray(data) ? { words: data } : data) as Record<string, unknown>;
      const rawWords = Array.isArray(obj?.words) ? obj.words : [];
      const rawAct = Array.isArray(obj?.activity) ? obj.activity : [];
      const rawSess = Array.isArray(obj?.sessions) ? obj.sessions : [];
      const rawLogs = Array.isArray(obj?.logs) ? obj.logs : [];

      const result: BackupImportResult = {
        words: 0,
        skipped: 0,
        activity: 0,
        sessions: 0,
        logs: 0,
      };

      const existingWords = (await reqToPromise(wordsStore.getAll())) as Word[];
      const haveWord = new Map<string, number>(existingWords.map((w) => [w.word.toLowerCase(), w.id]));
      let maxId = existingWords.reduce((max, w) => Math.max(max, w.id || 0), 0);
      const oldToNewId = new Map<number, number>();

      for (const item of rawWords) {
        if (!item || typeof item !== "object") {
          result.skipped++;
          continue;
        }
        const b = item as Record<string, unknown>;
        const rawW = typeof b.word === "string" ? b.word.trim() : "";
        if (!rawW) {
          result.skipped++;
          continue;
        }

        const key = rawW.toLowerCase();
        const existingId = haveWord.get(key);
        const oldId = Number(b.id);

        if (existingId !== undefined) {
          if (oldId) oldToNewId.set(oldId, existingId);
          result.skipped++;
          continue;
        }

        maxId++;
        const newId = maxId;
        if (oldId) oldToNewId.set(oldId, newId);
        haveWord.set(key, newId);

        const newWord: Word = {
          id: newId,
          word: capitalizeFirst(rawW),
          pronunciation: typeof b.pronunciation === "string" ? b.pronunciation : "",
          partOfSpeech: typeof b.partOfSpeech === "string" ? b.partOfSpeech.toLowerCase() : "",
          banglaMeaning: typeof b.banglaMeaning === "string" ? b.banglaMeaning : "",
          englishMeaning: typeof b.englishMeaning === "string" ? sentenceCase(b.englishMeaning) : "",
          synonyms: (Array.isArray(b.synonyms) ? b.synonyms : []).map((s) => capitalizeFirst(String(s))),
          antonyms: (Array.isArray(b.antonyms) ? b.antonyms : []).map((s) => capitalizeFirst(String(s))),
          example: typeof b.example === "string" ? sentenceCase(b.example) : "",
          prefix: typeof b.prefix === "string" ? b.prefix : "",
          rootWord: typeof b.rootWord === "string" ? b.rootWord : "",
          suffix: typeof b.suffix === "string" ? b.suffix : "",
          mnemonic: typeof b.mnemonic === "string" ? sentenceCase(b.mnemonic) : "",
          etymology: typeof b.etymology === "string" ? sentenceCase(b.etymology) : "",
          notes: typeof b.notes === "string" ? b.notes : "",
          tags: Array.isArray(b.tags) ? b.tags.map(String) : [],
          difficulty: (b.difficulty as Difficulty) || "medium",
          isFavorite: !!b.isFavorite,
          mastery: Number(b.mastery) || 0,
          timesReviewed: Number(b.timesReviewed) || 0,
          timesCorrect: Number(b.timesCorrect) || 0,
          timesWrong: Number(b.timesWrong) || 0,
          lastReviewedAt: typeof b.lastReviewedAt === "string" ? b.lastReviewedAt : null,
          nextReviewAt: typeof b.nextReviewAt === "string" ? b.nextReviewAt : null,
          createdAt: typeof b.createdAt === "string" ? b.createdAt : new Date().toISOString(),
          updatedAt: typeof b.updatedAt === "string" ? b.updatedAt : new Date().toISOString(),
        };

        wordsStore.put(newWord);
        result.words++;
      }

      // Merge activity
      for (const a of rawAct) {
        if (!a || typeof a !== "object") continue;
        const b = a as Record<string, unknown>;
        const day = typeof b.day === "string" ? b.day : "";
        if (!day) continue;

        const cur = (await reqToPromise(actStore.get(day))) as DailyActivity | undefined;
        const entry: DailyActivity = {
          day,
          reviews: Math.max(Number(b.reviews) || 0, cur?.reviews || 0),
          correct: Math.max(Number(b.correct) || 0, cur?.correct || 0),
          wordsAdded: Math.max(Number(b.wordsAdded) || 0, cur?.wordsAdded || 0),
          quizzes: Math.max(Number(b.quizzes) || 0, cur?.quizzes || 0),
          flashcards: Math.max(Number(b.flashcards) || 0, cur?.flashcards || 0),
        };
        actStore.put(entry);
        result.activity++;
      }

      // Sessions
      for (const s of rawSess) {
        if (!s || typeof s !== "object") continue;
        const b = s as Record<string, unknown>;
        sessStore.add({
          total: Number(b.total) || 0,
          correct: Number(b.correct) || 0,
          durationSec: Number(b.durationSec) || 0,
          bestStreak: Number(b.bestStreak) || 0,
          xp: Number(b.xp) || 0,
          source: typeof b.source === "string" ? b.source : "all",
          types: Array.isArray(b.types) ? b.types : [],
          typeStats: typeof b.typeStats === "object" && b.typeStats ? b.typeStats : {},
          createdAt: typeof b.createdAt === "string" ? b.createdAt : new Date().toISOString(),
        });
        result.sessions++;
      }

      // Review logs
      for (const l of rawLogs) {
        if (!l || typeof l !== "object") continue;
        const b = l as Record<string, unknown>;
        const oldId = Number(b.wordId);
        const mappedId = oldToNewId.get(oldId);
        if (!mappedId) continue;

        logsStore.add({
          wordId: mappedId,
          correct: !!b.correct,
          source: typeof b.source === "string" ? b.source : "quiz",
          qtype: typeof b.qtype === "string" ? b.qtype : "",
          day: typeof b.day === "string" ? b.day : localDay(),
          createdAt: typeof b.createdAt === "string" ? b.createdAt : new Date().toISOString(),
        });
        result.logs++;
      }

      // Return updated bootstrap snapshot
      const wordsAll = ((await reqToPromise(wordsStore.getAll())) as Word[]).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
      const actAll = ((await reqToPromise(actStore.getAll())) as DailyActivity[]).sort((a, b) =>
        b.day.localeCompare(a.day),
      );
      const sessAll = ((await reqToPromise(sessStore.getAll())) as QuizSession[]).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );

      return {
        ...result,
        snapshot: { words: wordsAll, activity: actAll, sessions: sessAll },
      };
    },
  );
}

/* -------------------------------- Reset / Data Actions -------------------------------- */

export async function localDataAction(
  action: "seed" | "reset-progress" | "delete-all",
): Promise<BootstrapData> {
  await initLocalDatabase();

  return tx(
    ["words", "daily_activity", "quiz_sessions", "review_logs", "meta"],
    "readwrite",
    async (transaction) => {
      const wordsStore = transaction.objectStore("words");
      const actStore = transaction.objectStore("daily_activity");
      const sessStore = transaction.objectStore("quiz_sessions");
      const logsStore = transaction.objectStore("review_logs");
      const metaStore = transaction.objectStore("meta");

      const now = Date.now();

      if (action === "delete-all") {
        wordsStore.clear();
        actStore.clear();
        sessStore.clear();
        logsStore.clear();
        metaStore.put({ key: "initialized", value: true, clearedAt: new Date().toISOString() });
        return { words: [], activity: [], sessions: [] };
      }

      if (action === "reset-progress") {
        const allWords = (await reqToPromise(wordsStore.getAll())) as Word[];
        for (const w of allWords) {
          const u: Word = {
            ...w,
            mastery: 0,
            timesReviewed: 0,
            timesCorrect: 0,
            timesWrong: 0,
            lastReviewedAt: null,
            nextReviewAt: null,
            updatedAt: new Date().toISOString(),
          };
          wordsStore.put(u);
        }
        actStore.clear();
        sessStore.clear();
        logsStore.clear();

        const words = ((await reqToPromise(wordsStore.getAll())) as Word[]).sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        );
        return { words, activity: [], sessions: [] };
      }

      if (action === "seed") {
        const allWords = (await reqToPromise(wordsStore.getAll())) as Word[];
        const have = new Set(allWords.map((w) => w.word.toLowerCase()));
        let maxId = allWords.reduce((max, w) => Math.max(max, w.id || 0), 0);

        SAMPLE_WORDS.forEach((w, index) => {
          if (have.has(w.word.toLowerCase())) return;
          maxId++;
          const id = maxId;
          const wordObj: Word = {
            id,
            word: capitalizeFirst(w.word),
            pronunciation: w.pronunciation || "",
            partOfSpeech: w.partOfSpeech || "",
            banglaMeaning: w.banglaMeaning || "",
            englishMeaning: sentenceCase(w.englishMeaning || ""),
            synonyms: (w.synonyms || []).map(capitalizeFirst),
            antonyms: (w.antonyms || []).map(capitalizeFirst),
            example: sentenceCase(w.example || ""),
            prefix: w.prefix || "",
            rootWord: w.rootWord || "",
            suffix: w.suffix || "",
            mnemonic: w.mnemonic ? sentenceCase(w.mnemonic) : "",
            etymology: w.etymology ? sentenceCase(w.etymology) : "",
            notes: w.notes || "",
            tags: w.tags || [],
            difficulty: w.difficulty || "medium",
            isFavorite: !!w.isFavorite,
            mastery: 0,
            timesReviewed: 0,
            timesCorrect: 0,
            timesWrong: 0,
            lastReviewedAt: null,
            nextReviewAt: null,
            createdAt: new Date(now - index * 1000).toISOString(),
            updatedAt: new Date(now).toISOString(),
          };
          wordsStore.put(wordObj);
        });

        const words = ((await reqToPromise(wordsStore.getAll())) as Word[]).sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        );
        const activity = ((await reqToPromise(actStore.getAll())) as DailyActivity[]).sort((a, b) =>
          b.day.localeCompare(a.day),
        );
        const sessions = ((await reqToPromise(sessStore.getAll())) as QuizSession[]).sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        );

        return { words, activity, sessions };
      }

      return { words: [], activity: [], sessions: [] };
    },
  );
}
