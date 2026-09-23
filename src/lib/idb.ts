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
/** v2 adds `peer_activity` (study activity reported by paired devices). */
const DB_VERSION = 2;

let dbPromise: Promise<IDBDatabase> | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

export function openDb(): Promise<IDBDatabase> {
  if (!isBrowser()) return Promise.reject(new Error("IndexedDB is only available in the browser"));
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("words")) {
        const words = db.createObjectStore("words", { keyPath: "id" });
        words.createIndex("word", "word", { unique: false });
        words.createIndex("createdAt", "createdAt", { unique: false });
        words.createIndex("isFavorite", "isFavorite", { unique: false });
        words.createIndex("mastery", "mastery", { unique: false });
      }
      if (!db.objectStoreNames.contains("daily_activity")) {
        db.createObjectStore("daily_activity", { keyPath: "day" });
      }
      if (!db.objectStoreNames.contains("quiz_sessions")) {
        const sessions = db.createObjectStore("quiz_sessions", { keyPath: "id", autoIncrement: true });
        sessions.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("review_logs")) {
        const logs = db.createObjectStore("review_logs", { keyPath: "id", autoIncrement: true });
        logs.createIndex("day", "day", { unique: false });
        logs.createIndex("wordId", "wordId", { unique: false });
        logs.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
      // Activity from other devices is stored per device, so it is added (not double counted).
      if (!db.objectStoreNames.contains("peer_activity")) {
        const peer = db.createObjectStore("peer_activity", { keyPath: "id" });
        peer.createIndex("day", "day", { unique: false });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // Let a newer version of the app (another tab) upgrade the database.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onblocked = () => console.warn("VocaBera: close other VocaBera tabs to finish updating the local database.");
    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error("Failed to open IndexedDB"));
    };
  });

  return dbPromise;
}

/** Runs `callback` inside one IndexedDB transaction and resolves when it commits. */
export async function tx<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  callback: (transaction: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeNames, mode);
    let result: T;
    transaction.onerror = () => reject(transaction.error || new Error("Transaction failed"));
    transaction.onabort = () => reject(transaction.error || new Error("Transaction aborted"));
    Promise.resolve(callback(transaction))
      .then((res) => {
        result = res;
      })
      .catch((err) => {
        try {
          transaction.abort();
        } catch {
          /* already finished */
        }
        reject(err);
      });
    transaction.oncomplete = () => resolve(result);
  });
}

export function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB request failed"));
  });
}

/* --------------------------------- Helpers -------------------------------- */

/** Device-independent identity of a word (IDs differ between devices). */
export const wordKey = (word: string) => word.trim().toLowerCase().replace(/\s+/g, " ");

export const ACTIVITY_FIELDS = ["reviews", "correct", "wordsAdded", "quizzes", "flashcards"] as const;

export interface PeerActivityRow extends DailyActivity {
  id: string;
  device: string;
}

const emptyDay = (day: string): DailyActivity => ({ day, reviews: 0, correct: 0, wordsAdded: 0, quizzes: 0, flashcards: 0 });
const byDayDesc = (a: DailyActivity, b: DailyActivity) => b.day.localeCompare(a.day);

function addInto(target: DailyActivity, row: Partial<DailyActivity>) {
  for (const f of ACTIVITY_FIELDS) target[f] += Number(row[f]) || 0;
}

/** This device's activity plus every paired device's activity, summed per day. */
export async function combinedActivity(t: IDBTransaction, own: DailyActivity[]): Promise<DailyActivity[]> {
  if (!t.objectStoreNames.contains("peer_activity")) return [...own].sort(byDayDesc);
  const peers = (await reqToPromise(t.objectStore("peer_activity").getAll())) as PeerActivityRow[];
  if (!peers.length) return [...own].sort(byDayDesc);
  const days = new Map<string, DailyActivity>();
  for (const row of own) days.set(row.day, { ...emptyDay(row.day), ...row });
  for (const row of peers) {
    const cur = days.get(row.day) ?? emptyDay(row.day);
    addInto(cur, row);
    days.set(row.day, cur);
  }
  return [...days.values()].sort(byDayDesc);
}

/** Combined (all devices) totals for one day. */
export async function combinedDay(t: IDBTransaction, own: DailyActivity): Promise<DailyActivity> {
  if (!t.objectStoreNames.contains("peer_activity")) return own;
  const rows = (await reqToPromise(t.objectStore("peer_activity").index("day").getAll(own.day))) as PeerActivityRow[];
  if (!rows.length) return own;
  const out = { ...own };
  for (const row of rows) addInto(out, row);
  return out;
}

const TOMBSTONE_KEY = "tombstones";
const TOMBSTONE_TTL_MS = 180 * 86_400_000;
const TOMBSTONE_MAX = 5000;

/** Deleted word keys → deletion time. Lets deletions travel to paired devices. */
export async function readTombstones(t: IDBTransaction): Promise<Record<string, string>> {
  const row = (await reqToPromise(t.objectStore("meta").get(TOMBSTONE_KEY))) as { value?: Record<string, string> } | undefined;
  return row?.value && typeof row.value === "object" ? { ...row.value } : {};
}

export function writeTombstones(t: IDBTransaction, value: Record<string, string>) {
  const cutoff = new Date(Date.now() - TOMBSTONE_TTL_MS).toISOString();
  const kept = Object.entries(value)
    .filter(([k, at]) => k && typeof at === "string" && at >= cutoff)
    .sort((a, b) => b[1].localeCompare(a[1]))
    .slice(0, TOMBSTONE_MAX);
  t.objectStore("meta").put({ key: TOMBSTONE_KEY, value: Object.fromEntries(kept) });
}

async function addTombstones(t: IDBTransaction, keys: string[]) {
  if (!keys.length) return;
  const current = await readTombstones(t);
  const now = new Date().toISOString();
  for (const k of keys) current[k] = now;
  writeTombstones(t, current);
}

function buildSampleWord(w: WordInput, id: number, createdAt: string, now: string): Word {
  return {
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
    progressResetAt: null,
    createdAt,
    updatedAt: now,
  };
}

const sortWords = (list: Word[]) => list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
const sortSessions = (list: QuizSession[]) => list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/* ------------------------------- Initial seeding ------------------------------- */

export async function initLocalDatabase(): Promise<void> {
  if (!isBrowser()) return;
  await openDb();
  return tx(["words", "meta"], "readwrite", async (t) => {
    const meta = t.objectStore("meta");
    const words = t.objectStore("words");
    const initialized = await reqToPromise(meta.get("initialized"));
    const count = await reqToPromise(words.count());
    if (!initialized && count === 0) {
      // First launch: seed curated sample words so the app is useful immediately.
      const now = Date.now();
      SAMPLE_WORDS.forEach((w, index) => {
        words.put(buildSampleWord(w, index + 1, new Date(now - index * 1000).toISOString(), new Date(now).toISOString()));
      });
      meta.put({ key: "initialized", value: true, seededAt: new Date().toISOString() });
    }
  });
}

/* ------------------------------- Bootstrap data ------------------------------- */

export async function getLocalBootstrap(): Promise<BootstrapData> {
  await initLocalDatabase();
  return tx(["words", "daily_activity", "peer_activity", "quiz_sessions"], "readonly", async (t) => {
    const [wordsRaw, actRaw, sessRaw] = await Promise.all([
      reqToPromise(t.objectStore("words").getAll()),
      reqToPromise(t.objectStore("daily_activity").getAll()),
      reqToPromise(t.objectStore("quiz_sessions").getAll()),
    ]);
    return {
      words: sortWords(wordsRaw as Word[]),
      activity: await combinedActivity(t, actRaw as DailyActivity[]),
      sessions: sortSessions(sessRaw as QuizSession[]),
    };
  });
}

/* --------------------------------- Word CRUD --------------------------------- */

export async function addLocalWord(input: WordInput, today = localDay()): Promise<{ word: Word; activity: DailyActivity }> {
  await initLocalDatabase();
  return tx(["words", "daily_activity", "peer_activity"], "readwrite", async (t) => {
    const wordsStore = t.objectStore("words");
    const actStore = t.objectStore("daily_activity");
    const all = (await reqToPromise(wordsStore.getAll())) as Word[];
    const id = all.reduce((max, w) => Math.max(max, w.id || 0), 0) + 1;
    const nowIso = new Date().toISOString();
    const word: Word = {
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
      progressResetAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    wordsStore.put(word);

    const existing = (await reqToPromise(actStore.get(today))) as DailyActivity | undefined;
    const own: DailyActivity = existing ? { ...existing, wordsAdded: existing.wordsAdded + 1 } : { ...emptyDay(today), wordsAdded: 1 };
    actStore.put(own);
    return { word, activity: await combinedDay(t, own) };
  });
}

export async function updateLocalWord(id: number, patch: Partial<WordInput>): Promise<Word | null> {
  return tx(["words", "meta"], "readwrite", async (t) => {
    const wordsStore = t.objectStore("words");
    const existing = (await reqToPromise(wordsStore.get(id))) as Word | undefined;
    if (!existing) return null;
    const updated: Word = {
      ...existing,
      ...patch,
      word: patch.word !== undefined ? capitalizeFirst(patch.word.trim()) : existing.word,
      englishMeaning: patch.englishMeaning !== undefined ? sentenceCase(patch.englishMeaning.trim()) : existing.englishMeaning,
      example: patch.example !== undefined ? sentenceCase(patch.example.trim()) : existing.example,
      synonyms: patch.synonyms !== undefined ? patch.synonyms.map(capitalizeFirst) : existing.synonyms,
      antonyms: patch.antonyms !== undefined ? patch.antonyms.map(capitalizeFirst) : existing.antonyms,
      updatedAt: new Date().toISOString(),
    };
    wordsStore.put(updated);
    // A renamed word must disappear under its old name on paired devices.
    const oldKey = wordKey(existing.word);
    if (oldKey !== wordKey(updated.word)) await addTombstones(t, [oldKey]);
    return updated;
  });
}

function deleteLogsForWord(logsStore: IDBObjectStore, wordId: number) {
  const request = logsStore.index("wordId").openCursor(IDBKeyRange.only(wordId));
  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
}

export async function deleteLocalWord(id: number): Promise<boolean> {
  return tx(["words", "review_logs", "meta"], "readwrite", async (t) => {
    const wordsStore = t.objectStore("words");
    const existing = (await reqToPromise(wordsStore.get(id))) as Word | undefined;
    if (!existing) return false;
    wordsStore.delete(id);
    deleteLogsForWord(t.objectStore("review_logs"), id);
    await addTombstones(t, [wordKey(existing.word)]);
    return true;
  });
}

/* ------------------------------- Bulk operations ------------------------------- */

export async function bulkAddLocalWords(
  items: unknown[],
  today = localDay(),
): Promise<{ inserted: Word[]; skipped: number; activity: DailyActivity }> {
  await initLocalDatabase();
  return tx(["words", "daily_activity", "peer_activity"], "readwrite", async (t) => {
    const wordsStore = t.objectStore("words");
    const actStore = t.objectStore("daily_activity");
    const allExisting = (await reqToPromise(wordsStore.getAll())) as Word[];
    const have = new Set(allExisting.map((w) => wordKey(w.word)));
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
      if (!rawWord || have.has(wordKey(rawWord))) {
        skipped++;
        continue;
      }
      const bn = typeof b.banglaMeaning === "string" ? b.banglaMeaning.trim() : "";
      const en = typeof b.englishMeaning === "string" ? sentenceCase(b.englishMeaning.trim()) : "";
      if (!bn && !en) {
        skipped++;
        continue;
      }
      have.add(wordKey(rawWord));
      const list = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;]/) : []);
      const word: Word = {
        id: ++maxId,
        word: capitalizeFirst(rawWord),
        pronunciation: typeof b.pronunciation === "string" ? b.pronunciation.trim() : "",
        partOfSpeech: typeof b.partOfSpeech === "string" ? b.partOfSpeech.trim().toLowerCase() : "",
        banglaMeaning: bn,
        englishMeaning: en,
        synonyms: list(b.synonyms).map((s) => capitalizeFirst(String(s).trim())).filter(Boolean),
        antonyms: list(b.antonyms).map((s) => capitalizeFirst(String(s).trim())).filter(Boolean),
        example: typeof b.example === "string" ? sentenceCase(b.example.trim()) : "",
        prefix: typeof b.prefix === "string" ? b.prefix.trim() : "",
        rootWord: typeof b.rootWord === "string" ? b.rootWord.trim() : "",
        suffix: typeof b.suffix === "string" ? b.suffix.trim() : "",
        mnemonic: typeof b.mnemonic === "string" ? sentenceCase(b.mnemonic.trim()) : "",
        etymology: typeof b.etymology === "string" ? sentenceCase(b.etymology.trim()) : "",
        notes: typeof b.notes === "string" ? b.notes.trim() : "",
        tags: uniqueCI(list(b.tags).map(String)),
        difficulty: (["easy", "medium", "hard"].includes(String(b.difficulty)) ? String(b.difficulty) : "medium") as Difficulty,
        isFavorite: b.isFavorite === true || b.isFavorite === "true",
        mastery: Number(b.mastery) || 0,
        timesReviewed: Number(b.timesReviewed) || 0,
        timesCorrect: Number(b.timesCorrect) || 0,
        timesWrong: Number(b.timesWrong) || 0,
        lastReviewedAt: typeof b.lastReviewedAt === "string" ? b.lastReviewedAt : null,
        nextReviewAt: typeof b.nextReviewAt === "string" ? b.nextReviewAt : null,
        progressResetAt: null,
        createdAt: typeof b.createdAt === "string" ? b.createdAt : nowIso,
        updatedAt: nowIso,
      };
      wordsStore.put(word);
      inserted.push(word);
    }

    const existing = (await reqToPromise(actStore.get(today))) as DailyActivity | undefined;
    const own: DailyActivity = existing
      ? { ...existing, wordsAdded: existing.wordsAdded + inserted.length }
      : { ...emptyDay(today), wordsAdded: inserted.length };
    if (inserted.length > 0) actStore.put(own);
    return { inserted, skipped, activity: await combinedDay(t, own) };
  });
}

export async function bulkDeleteLocalWords(ids: number[]): Promise<void> {
  const set = new Set(ids);
  return tx(["words", "review_logs", "meta"], "readwrite", async (t) => {
    const wordsStore = t.objectStore("words");
    const logsStore = t.objectStore("review_logs");
    const all = (await reqToPromise(wordsStore.getAll())) as Word[];
    const keys: string[] = [];
    for (const w of all) {
      if (!set.has(w.id)) continue;
      keys.push(wordKey(w.word));
      wordsStore.delete(w.id);
      deleteLogsForWord(logsStore, w.id);
    }
    await addTombstones(t, keys);
  });
}

export async function bulkUpdateLocalWords(ids: number[], patch: { isFavorite?: boolean; difficulty?: string }): Promise<Word[]> {
  const set = new Set(ids);
  return tx(["words"], "readwrite", async (t) => {
    const wordsStore = t.objectStore("words");
    const all = (await reqToPromise(wordsStore.getAll())) as Word[];
    const nowIso = new Date().toISOString();
    const updated: Word[] = [];
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

function resetProgress(w: Word, nowIso: string): Word {
  return {
    ...w,
    mastery: 0,
    timesReviewed: 0,
    timesCorrect: 0,
    timesWrong: 0,
    lastReviewedAt: null,
    nextReviewAt: null,
    progressResetAt: nowIso,
  };
}

export async function bulkResetLocalProgress(ids: number[]): Promise<Word[]> {
  const set = new Set(ids);
  return tx(["words"], "readwrite", async (t) => {
    const wordsStore = t.objectStore("words");
    const all = (await reqToPromise(wordsStore.getAll())) as Word[];
    const nowIso = new Date().toISOString();
    const updated: Word[] = [];
    for (const w of all) {
      if (!set.has(w.id)) continue;
      const u = resetProgress(w, nowIso);
      wordsStore.put(u);
      updated.push(u);
    }
    return updated;
  });
}

/* ------------------------------- Record reviews ------------------------------- */

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
  return tx(["words", "daily_activity", "peer_activity", "quiz_sessions", "review_logs"], "readwrite", async (t) => {
    const wordsStore = t.objectStore("words");
    const actStore = t.objectStore("daily_activity");
    const sessStore = t.objectStore("quiz_sessions");
    const logsStore = t.objectStore("review_logs");
    const now = new Date();
    const updatedWords = new Map<number, Word>();

    for (const item of items) {
      const w = updatedWords.get(item.wordId) ?? ((await reqToPromise(wordsStore.get(item.wordId))) as Word | undefined);
      if (!w) continue;
      const rev = computeReview(w, item.correct, now);
      // `updatedAt` tracks content edits only; progress is ordered by `lastReviewedAt` during sync.
      const u: Word = {
        ...w,
        mastery: rev.mastery,
        timesReviewed: rev.timesReviewed,
        timesCorrect: rev.timesCorrect,
        timesWrong: rev.timesWrong,
        lastReviewedAt: rev.lastReviewedAt.toISOString(),
        nextReviewAt: rev.nextReviewAt.toISOString(),
      };
      wordsStore.put(u);
      updatedWords.set(u.id, u);
      logsStore.add({
        wordId: item.wordId,
        correct: item.correct,
        source,
        qtype: item.type || "",
        day: today,
        createdAt: now.toISOString(),
      });
    }

    let savedSession: QuizSession | null = null;
    if (source === "quiz" && session) {
      const typeStats: Record<string, { total: number; correct: number }> = {};
      for (const i of items) {
        if (!i.type) continue;
        const s = (typeStats[i.type] ??= { total: 0, correct: 0 });
        s.total++;
        if (i.correct) s.correct++;
      }
      const record = {
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
      const newId = (await reqToPromise(sessStore.add(record))) as number;
      savedSession = { id: newId, ...record };
    }

    const correctCount = items.filter((i) => i.correct).length;
    const existing = (await reqToPromise(actStore.get(today))) as DailyActivity | undefined;
    const base = existing ?? emptyDay(today);
    const own: DailyActivity = {
      day: today,
      reviews: base.reviews + items.length,
      correct: base.correct + correctCount,
      wordsAdded: base.wordsAdded,
      quizzes: base.quizzes + (savedSession ? 1 : 0),
      flashcards: base.flashcards + (source === "flashcard" ? items.length : 0),
    };
    actStore.put(own);
    return { words: [...updatedWords.values()], activity: await combinedDay(t, own), session: savedSession };
  });
}

/* ------------------------------- Local recap data ------------------------------- */

export async function getLocalRecap(today = localDay()): Promise<RecapData> {
  await initLocalDatabase();
  return tx(["daily_activity", "peer_activity", "review_logs"], "readonly", async (t) => {
    const own = (await reqToPromise(t.objectStore("daily_activity").getAll())) as DailyActivity[];
    const days = (await combinedActivity(t, own)).filter((a) => a.day < today && (a.reviews > 0 || a.wordsAdded > 0));
    const act = days[0];
    if (!act) return { day: null, activity: null, items: [] };

    const dayLogs = ((await reqToPromise(t.objectStore("review_logs").index("day").getAll(IDBKeyRange.only(act.day)))) || []) as Array<{
      wordId: number;
      correct: boolean;
      createdAt: string;
    }>;
    const perWord = new Map<number, { reviews: number; correct: number; lastCorrect: boolean; lastAt: string }>();
    for (const log of dayLogs) {
      const cur = perWord.get(log.wordId);
      if (!cur) {
        perWord.set(log.wordId, { reviews: 1, correct: log.correct ? 1 : 0, lastCorrect: log.correct, lastAt: log.createdAt });
      } else {
        cur.reviews++;
        if (log.correct) cur.correct++;
        if (log.createdAt >= cur.lastAt) {
          cur.lastCorrect = log.correct;
          cur.lastAt = log.createdAt;
        }
      }
    }
    const items: RecapItem[] = [...perWord.entries()].map(([wordId, v]) => ({
      wordId,
      reviews: v.reviews,
      correct: v.correct,
      lastCorrect: v.lastCorrect,
    }));
    return { day: act.day, activity: act, items };
  });
}

/* ----------------------------- Local progress insights ----------------------------- */

export async function getLocalProgress(tzMinutes = 0): Promise<ProgressData> {
  await initLocalDatabase();
  return tx(["review_logs", "quiz_sessions"], "readonly", async (t) => {
    const [allLogs, allSessions] = await Promise.all([
      reqToPromise(t.objectStore("review_logs").getAll()) as Promise<
        Array<{ wordId: number; correct: boolean; source: string; qtype: string; day: string; createdAt: string }>
      >,
      reqToPromise(t.objectStore("quiz_sessions").getAll()) as Promise<QuizSession[]>,
    ]);
    const typeMap = new Map<string, { total: number; correct: number }>();
    const sourceMap = new Map<string, { total: number; correct: number }>();
    const hours = Array.from({ length: 24 }, () => 0);
    for (const log of allLogs) {
      if (log.source === "quiz" && log.qtype) {
        const s = typeMap.get(log.qtype) ?? { total: 0, correct: 0 };
        s.total++;
        if (log.correct) s.correct++;
        typeMap.set(log.qtype, s);
      }
      if (log.source) {
        const s = sourceMap.get(log.source) ?? { total: 0, correct: 0 };
        s.total++;
        if (log.correct) s.correct++;
        sourceMap.set(log.source, s);
      }
      if (log.createdAt) {
        const hour = new Date(new Date(log.createdAt).getTime() - tzMinutes * 60_000).getUTCHours();
        if (hour >= 0 && hour < 24) hours[hour]++;
      }
    }
    return {
      typeStats: [...typeMap.entries()].map(([type, v]) => ({ type, total: v.total, correct: v.correct })),
      sourceStats: [...sourceMap.entries()].map(([source, v]) => ({ source, total: v.total, correct: v.correct })),
      hours,
      sessions: sortSessions(allSessions).slice(0, 100),
    };
  });
}

/* ---------------------------- Local word review history ---------------------------- */

export async function getLocalWordHistory(wordId: number): Promise<WordHistoryItem[]> {
  await initLocalDatabase();
  return tx(["review_logs"], "readonly", async (t) => {
    const logs = ((await reqToPromise(t.objectStore("review_logs").index("wordId").getAll(IDBKeyRange.only(wordId)))) || []) as Array<{
      correct: boolean;
      source: string;
      qtype: string;
      createdAt: string;
    }>;
    return logs
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-30)
      .map((l) => ({ correct: l.correct, source: l.source, qtype: l.qtype, createdAt: l.createdAt }));
  });
}

/* ------------------------------- Backup export / import ------------------------------- */

export async function exportLocalData(): Promise<Record<string, unknown>> {
  await initLocalDatabase();
  return tx(["words", "daily_activity", "quiz_sessions", "review_logs"], "readonly", async (t) => {
    const [words, activity, sessions, logs] = await Promise.all([
      reqToPromise(t.objectStore("words").getAll()),
      reqToPromise(t.objectStore("daily_activity").getAll()),
      reqToPromise(t.objectStore("quiz_sessions").getAll()),
      reqToPromise(t.objectStore("review_logs").getAll()),
    ]);
    return { app: "VocaBera", version: 2, exportedAt: new Date().toISOString(), words, activity, sessions, logs };
  });
}

export async function importLocalBackup(data: unknown, mode: "merge" | "replace"): Promise<BackupImportResult & { snapshot: BootstrapData }> {
  await initLocalDatabase();
  return tx(["words", "daily_activity", "peer_activity", "quiz_sessions", "review_logs"], "readwrite", async (t) => {
    const wordsStore = t.objectStore("words");
    const actStore = t.objectStore("daily_activity");
    const sessStore = t.objectStore("quiz_sessions");
    const logsStore = t.objectStore("review_logs");

    if (mode === "replace") {
      wordsStore.clear();
      actStore.clear();
      sessStore.clear();
      logsStore.clear();
      t.objectStore("peer_activity").clear();
    }

    const obj = (Array.isArray(data) ? { words: data } : data) as Record<string, unknown>;
    const rawWords = Array.isArray(obj?.words) ? obj.words : [];
    const rawAct = Array.isArray(obj?.activity) ? obj.activity : [];
    const rawSess = Array.isArray(obj?.sessions) ? obj.sessions : [];
    const rawLogs = Array.isArray(obj?.logs) ? obj.logs : [];
    const result: BackupImportResult = { words: 0, skipped: 0, activity: 0, sessions: 0, logs: 0 };

    const existingWords = mode === "replace" ? [] : ((await reqToPromise(wordsStore.getAll())) as Word[]);
    const haveWord = new Map<string, number>(existingWords.map((w) => [wordKey(w.word), w.id]));
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
      const key = wordKey(rawW);
      const existingId = haveWord.get(key);
      const oldId = Number(b.id);
      if (existingId !== undefined) {
        if (oldId) oldToNewId.set(oldId, existingId);
        result.skipped++;
        continue;
      }
      const newId = ++maxId;
      if (oldId) oldToNewId.set(oldId, newId);
      haveWord.set(key, newId);
      const nowIso = new Date().toISOString();
      wordsStore.put({
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
        progressResetAt: typeof b.progressResetAt === "string" ? b.progressResetAt : null,
        createdAt: typeof b.createdAt === "string" ? b.createdAt : nowIso,
        updatedAt: typeof b.updatedAt === "string" ? b.updatedAt : nowIso,
      } satisfies Word);
      result.words++;
    }

    for (const a of rawAct) {
      if (!a || typeof a !== "object") continue;
      const b = a as Record<string, unknown>;
      const day = typeof b.day === "string" ? b.day : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      const cur = (await reqToPromise(actStore.get(day))) as DailyActivity | undefined;
      const row = emptyDay(day);
      for (const f of ACTIVITY_FIELDS) row[f] = Math.max(Number(b[f]) || 0, cur?.[f] || 0);
      actStore.put(row);
      result.activity++;
    }

    // Merging the same backup twice must not duplicate quiz history.
    const sessionKeys = new Set(
      mode === "replace" ? [] : ((await reqToPromise(sessStore.getAll())) as QuizSession[]).map((s) => s.createdAt),
    );
    for (const s of rawSess) {
      if (!s || typeof s !== "object") continue;
      const b = s as Record<string, unknown>;
      const createdAt = typeof b.createdAt === "string" ? b.createdAt : new Date().toISOString();
      if (sessionKeys.has(createdAt)) continue;
      sessionKeys.add(createdAt);
      sessStore.add({
        total: Number(b.total) || 0,
        correct: Number(b.correct) || 0,
        durationSec: Number(b.durationSec) || 0,
        bestStreak: Number(b.bestStreak) || 0,
        xp: Number(b.xp) || 0,
        source: typeof b.source === "string" ? b.source : "all",
        types: Array.isArray(b.types) ? b.types : [],
        typeStats: typeof b.typeStats === "object" && b.typeStats ? b.typeStats : {},
        createdAt,
      });
      result.sessions++;
    }

    const sig = (wordId: number, l: { correct?: unknown; source?: unknown; qtype?: unknown; createdAt?: unknown }) =>
      `${wordId}|${String(l.createdAt)}|${String(l.source)}|${String(l.qtype)}|${l.correct ? 1 : 0}`;
    const logKeys = new Set(
      mode === "replace"
        ? []
        : ((await reqToPromise(logsStore.getAll())) as Array<{ wordId: number; correct: boolean; source: string; qtype: string; createdAt: string }>).map(
            (l) => sig(l.wordId, l),
          ),
    );
    for (const l of rawLogs) {
      if (!l || typeof l !== "object") continue;
      const b = l as Record<string, unknown>;
      const mappedId = oldToNewId.get(Number(b.wordId));
      if (!mappedId) continue;
      const entry = {
        wordId: mappedId,
        correct: !!b.correct,
        source: typeof b.source === "string" ? b.source : "quiz",
        qtype: typeof b.qtype === "string" ? b.qtype : "",
        day: typeof b.day === "string" ? b.day : localDay(),
        createdAt: typeof b.createdAt === "string" ? b.createdAt : new Date().toISOString(),
      };
      const k = sig(mappedId, entry);
      if (logKeys.has(k)) continue;
      logKeys.add(k);
      logsStore.add(entry);
      result.logs++;
    }

    const [wordsAll, ownAct, sessAll] = await Promise.all([
      reqToPromise(wordsStore.getAll()) as Promise<Word[]>,
      reqToPromise(actStore.getAll()) as Promise<DailyActivity[]>,
      reqToPromise(sessStore.getAll()) as Promise<QuizSession[]>,
    ]);
    return {
      ...result,
      snapshot: { words: sortWords(wordsAll), activity: await combinedActivity(t, ownAct), sessions: sortSessions(sessAll) },
    };
  });
}

/* -------------------------------- Reset / data actions -------------------------------- */

export async function localDataAction(action: "seed" | "reset-progress" | "delete-all"): Promise<BootstrapData> {
  await initLocalDatabase();
  return tx(["words", "daily_activity", "peer_activity", "quiz_sessions", "review_logs", "meta"], "readwrite", async (t) => {
    const wordsStore = t.objectStore("words");
    const actStore = t.objectStore("daily_activity");
    const peerStore = t.objectStore("peer_activity");
    const sessStore = t.objectStore("quiz_sessions");
    const logsStore = t.objectStore("review_logs");
    const metaStore = t.objectStore("meta");

    if (action === "delete-all") {
      wordsStore.clear();
      actStore.clear();
      peerStore.clear();
      sessStore.clear();
      logsStore.clear();
      metaStore.delete(TOMBSTONE_KEY);
      metaStore.put({ key: "initialized", value: true, clearedAt: new Date().toISOString() });
      return { words: [], activity: [], sessions: [] };
    }

    if (action === "reset-progress") {
      const nowIso = new Date().toISOString();
      const all = (await reqToPromise(wordsStore.getAll())) as Word[];
      for (const w of all) wordsStore.put(resetProgress(w, nowIso));
      actStore.clear();
      peerStore.clear();
      sessStore.clear();
      logsStore.clear();
      return { words: sortWords(all.map((w) => resetProgress(w, nowIso))), activity: [], sessions: [] };
    }

    // seed: add any curated sample words that are missing
    const all = (await reqToPromise(wordsStore.getAll())) as Word[];
    const have = new Set(all.map((w) => wordKey(w.word)));
    let maxId = all.reduce((max, w) => Math.max(max, w.id || 0), 0);
    const now = Date.now();
    SAMPLE_WORDS.forEach((w, index) => {
      if (have.has(wordKey(w.word))) return;
      wordsStore.put(buildSampleWord(w, ++maxId, new Date(now - index * 1000).toISOString(), new Date(now).toISOString()));
    });
    const [wordsAll, ownAct, sessAll] = await Promise.all([
      reqToPromise(wordsStore.getAll()) as Promise<Word[]>,
      reqToPromise(actStore.getAll()) as Promise<DailyActivity[]>,
      reqToPromise(sessStore.getAll()) as Promise<QuizSession[]>,
    ]);
    return { words: sortWords(wordsAll), activity: await combinedActivity(t, ownAct), sessions: sortSessions(sessAll) };
  });
}
