import {
  ACTIVITY_FIELDS,
  combinedActivity,
  initLocalDatabase,
  readTombstones,
  reqToPromise,
  tx,
  wordKey,
  writeTombstones,
  type PeerActivityRow,
} from "./idb";
import type { BootstrapData, DailyActivity, Difficulty, QuizSession, Word } from "./types";

/**
 * Device-to-device sync model.
 *
 *  - Words are matched by their text (IDs differ between devices).
 *  - Content fields: the most recent edit (`updatedAt`) wins.
 *  - Learning progress: the most recent review or reset wins.
 *  - Deletions travel as tombstones.
 *  - Quiz sessions and answer logs are unioned (never duplicated).
 *  - Daily activity is kept per device and summed, so it is never double counted.
 *
 * Merging is idempotent and commutative, so repeated syncs always converge.
 */

export const SYNC_VERSION = 3;

export type SyncWord = Omit<Word, "id">;
export interface SyncActivity extends DailyActivity {
  device: string;
}
export interface SyncLog {
  k: string;
  correct: boolean;
  source: string;
  qtype: string;
  day: string;
  createdAt: string;
}
export type SyncSession = Omit<QuizSession, "id">;

export interface SyncSnapshot {
  app: "VocaBera";
  kind: "sync";
  v: number;
  device: string;
  name: string;
  at: string;
  words: SyncWord[];
  tombstones: { k: string; at: string }[];
  activity: SyncActivity[];
  sessions: SyncSession[];
  logs: SyncLog[];
}

export interface MergeResult {
  added: number;
  updated: number;
  removed: number;
  sessions: number;
  logs: number;
  activity: number;
  changed: boolean;
  data: BootstrapData;
  digest: string;
}

/* ------------------------------- Device identity ------------------------------- */

let deviceIdCache: string | null = null;

export function getDeviceId(): string {
  if (deviceIdCache) return deviceIdCache;
  let id = "";
  try {
    id = localStorage.getItem("vb-device-id") || "";
  } catch {
    /* storage unavailable */
  }
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    try {
      localStorage.setItem("vb-device-id", id);
    } catch {
      /* keep in memory only */
    }
  }
  deviceIdCache = id;
  return id;
}

/* ---------------------------------- Hashing ---------------------------------- */

function fnv1a(text: string, seed: number) {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** 64-bit (two independent 32-bit FNV-1a passes) content hash. */
export function hashText(text: string) {
  return fnv1a(text, 0x811c9dc5) + fnv1a(text, 0x9e3779b9);
}

const progressStamp = (w: Pick<Word, "lastReviewedAt" | "progressResetAt">) => {
  const reviewed = w.lastReviewedAt ?? "";
  const reset = w.progressResetAt ?? "";
  return reviewed > reset ? reviewed : reset;
};

/** Identical logical data produces an identical digest on every device. */
export function snapshotDigest(s: SyncSnapshot): string {
  const words = s.words
    .map((w) => [wordKey(w.word), w.updatedAt, progressStamp(w), w.timesReviewed ?? 0].join("~"))
    .sort()
    .join("|");
  const tombs = s.tombstones.map((t) => `${t.k}~${t.at}`).sort().join("|");
  const sessions = s.sessions.map((x) => x.createdAt).sort().join("|");
  const logs = s.logs.map((l) => `${l.k}~${l.createdAt}~${l.source}~${l.qtype}~${l.correct ? 1 : 0}`).sort().join("|");
  const activity = s.activity
    .map((a) => [a.device, a.day, ...ACTIVITY_FIELDS.map((f) => a[f] ?? 0)].join("~"))
    .sort()
    .join("|");
  return [words, tombs, sessions, logs, activity].map(hashText).join("");
}

export function isSyncSnapshot(x: unknown): x is SyncSnapshot {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  return (
    s.app === "VocaBera" &&
    s.kind === "sync" &&
    typeof s.device === "string" &&
    Array.isArray(s.words) &&
    Array.isArray(s.tombstones) &&
    Array.isArray(s.activity) &&
    Array.isArray(s.sessions) &&
    Array.isArray(s.logs)
  );
}

/* ---------------------------------- Export ---------------------------------- */

interface LogRow {
  id?: number;
  wordId: number;
  correct: boolean;
  source: string;
  qtype: string;
  day: string;
  createdAt: string;
}

export async function exportSyncSnapshot(name = ""): Promise<SyncSnapshot> {
  await initLocalDatabase();
  const device = getDeviceId();
  return tx(["words", "daily_activity", "peer_activity", "quiz_sessions", "review_logs", "meta"], "readonly", async (t) => {
    const [words, own, peers, sessions, logs] = await Promise.all([
      reqToPromise(t.objectStore("words").getAll()) as Promise<Word[]>,
      reqToPromise(t.objectStore("daily_activity").getAll()) as Promise<DailyActivity[]>,
      reqToPromise(t.objectStore("peer_activity").getAll()) as Promise<PeerActivityRow[]>,
      reqToPromise(t.objectStore("quiz_sessions").getAll()) as Promise<QuizSession[]>,
      reqToPromise(t.objectStore("review_logs").getAll()) as Promise<LogRow[]>,
    ]);
    const tombstones = await readTombstones(t);
    const keyById = new Map(words.map((w) => [w.id, wordKey(w.word)]));
    return {
      app: "VocaBera",
      kind: "sync",
      v: SYNC_VERSION,
      device,
      name,
      at: new Date().toISOString(),
      words: words.map((w) => {
        const rest: Partial<Word> = { ...w };
        delete rest.id;
        return { ...(rest as SyncWord), progressResetAt: w.progressResetAt ?? null };
      }),
      tombstones: Object.entries(tombstones).map(([k, at]) => ({ k, at })),
      activity: [
        ...own.map((a) => ({ ...activityOf(a), device })),
        ...peers.map((p) => ({ ...activityOf(p), device: p.device })),
      ],
      sessions: sessions.map((s) => {
        const rest: Partial<QuizSession> = { ...s };
        delete rest.id;
        return rest as SyncSession;
      }),
      logs: logs
        .filter((l) => keyById.has(l.wordId))
        .map((l) => ({
          k: keyById.get(l.wordId) as string,
          correct: !!l.correct,
          source: l.source || "quiz",
          qtype: l.qtype || "",
          day: l.day,
          createdAt: l.createdAt,
        })),
    };
  });
}

function activityOf(a: Partial<DailyActivity> & { day: string }): DailyActivity {
  return {
    day: a.day,
    reviews: Number(a.reviews) || 0,
    correct: Number(a.correct) || 0,
    wordsAdded: Number(a.wordsAdded) || 0,
    quizzes: Number(a.quizzes) || 0,
    flashcards: Number(a.flashcards) || 0,
  };
}

/* ---------------------------------- Merge ---------------------------------- */

const CONTENT_KEYS = [
  "word",
  "pronunciation",
  "partOfSpeech",
  "banglaMeaning",
  "englishMeaning",
  "synonyms",
  "antonyms",
  "example",
  "prefix",
  "rootWord",
  "suffix",
  "mnemonic",
  "etymology",
  "notes",
  "tags",
  "difficulty",
  "isFavorite",
  "updatedAt",
] as const;

const PROGRESS_KEYS = ["mastery", "timesReviewed", "timesCorrect", "timesWrong", "lastReviewedAt", "nextReviewAt", "progressResetAt"] as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function contentWinsIncoming(local: Word, incoming: SyncWord) {
  if (incoming.updatedAt !== local.updatedAt) return incoming.updatedAt > local.updatedAt;
  // Same timestamp but different content: pick deterministically so both devices agree.
  const a = JSON.stringify(CONTENT_KEYS.map((k) => local[k] ?? null));
  const b = JSON.stringify(CONTENT_KEYS.map((k) => incoming[k] ?? null));
  return b > a;
}

function progressWinsIncoming(local: Word, incoming: SyncWord) {
  const a = progressStamp(local);
  const b = progressStamp(incoming);
  if (a !== b) return b > a;
  return (incoming.timesReviewed ?? 0) > (local.timesReviewed ?? 0);
}

/**
 * Returns the merged word, or null when nothing changed. `meaningful` is false when only
 * timestamps were aligned (e.g. the same sample word seeded on two devices).
 */
function mergeWord(local: Word, incoming: SyncWord): { word: Word; meaningful: boolean } | null {
  const merged: Word = { ...local, progressResetAt: local.progressResetAt ?? null };
  if (contentWinsIncoming(local, incoming)) for (const k of CONTENT_KEYS) (merged as unknown as Record<string, unknown>)[k] = incoming[k];
  if (progressWinsIncoming(local, incoming)) for (const k of PROGRESS_KEYS) (merged as unknown as Record<string, unknown>)[k] = incoming[k] ?? (k.endsWith("At") ? null : 0);
  if (incoming.createdAt && incoming.createdAt < merged.createdAt) merged.createdAt = incoming.createdAt;
  const contentChanged = CONTENT_KEYS.some((k) => k !== "updatedAt" && !same(merged[k], local[k]));
  const progressChanged = PROGRESS_KEYS.some((k) => !same(merged[k], local[k]));
  const stampChanged = merged.updatedAt !== local.updatedAt || merged.createdAt !== local.createdAt;
  if (!contentChanged && !progressChanged && !stampChanged) return null;
  return { word: merged, meaningful: contentChanged || progressChanged };
}

const str = (v: unknown, max = 4000) => (typeof v === "string" ? v.slice(0, max) : "");
const list = (v: unknown, max = 24) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 80)).slice(0, max) : [];
const count = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};
const isoOrNull = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);

function normalizeIncomingWord(raw: unknown): SyncWord | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const word = str(b.word, 120).trim();
  if (!word) return null;
  const createdAt = isoOrNull(b.createdAt) ?? new Date(0).toISOString();
  return {
    word,
    pronunciation: str(b.pronunciation, 200),
    partOfSpeech: str(b.partOfSpeech, 40),
    banglaMeaning: str(b.banglaMeaning),
    englishMeaning: str(b.englishMeaning),
    synonyms: list(b.synonyms),
    antonyms: list(b.antonyms),
    example: str(b.example),
    prefix: str(b.prefix, 200),
    rootWord: str(b.rootWord, 200),
    suffix: str(b.suffix, 200),
    mnemonic: str(b.mnemonic),
    etymology: str(b.etymology),
    notes: str(b.notes),
    tags: list(b.tags, 12),
    difficulty: (["easy", "medium", "hard"].includes(String(b.difficulty)) ? b.difficulty : "medium") as Difficulty,
    isFavorite: b.isFavorite === true,
    mastery: Math.min(5, count(b.mastery)),
    timesReviewed: count(b.timesReviewed),
    timesCorrect: count(b.timesCorrect),
    timesWrong: count(b.timesWrong),
    lastReviewedAt: isoOrNull(b.lastReviewedAt),
    nextReviewAt: isoOrNull(b.nextReviewAt),
    progressResetAt: isoOrNull(b.progressResetAt),
    createdAt,
    updatedAt: isoOrNull(b.updatedAt) ?? createdAt,
  };
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const logSig = (key: string, l: { createdAt: string; source: string; qtype: string; correct: boolean }) =>
  `${key}|${l.createdAt}|${l.source}|${l.qtype}|${l.correct ? 1 : 0}`;

export async function mergeSyncSnapshot(snap: SyncSnapshot, myDevice = getDeviceId()): Promise<MergeResult> {
  await initLocalDatabase();
  const result = await tx(
    ["words", "daily_activity", "peer_activity", "quiz_sessions", "review_logs", "meta"],
    "readwrite",
    async (t) => {
      const wordsStore = t.objectStore("words");
      const logsStore = t.objectStore("review_logs");
      const sessStore = t.objectStore("quiz_sessions");
      const actStore = t.objectStore("daily_activity");
      const peerStore = t.objectStore("peer_activity");

      /* ----- tombstones (union, newest deletion time wins) ----- */
      const tombs = await readTombstones(t);
      let tombsChanged = false;
      for (const tb of snap.tombstones) {
        if (!tb || typeof tb.k !== "string" || !isoOrNull(tb.at)) continue;
        if (!tombs[tb.k] || tombs[tb.k] < tb.at) {
          tombs[tb.k] = tb.at;
          tombsChanged = true;
        }
      }

      /* ----- words ----- */
      const localWords = (await reqToPromise(wordsStore.getAll())) as Word[];
      const byKey = new Map(localWords.map((w) => [wordKey(w.word), w]));
      let maxId = localWords.reduce((max, w) => Math.max(max, w.id || 0), 0);
      let added = 0;
      let updated = 0;
      let removed = 0;
      let aligned = 0; // timestamp-only changes: stored (so devices converge) but not reported

      for (const raw of snap.words) {
        const incoming = normalizeIncomingWord(raw);
        if (!incoming) continue;
        const key = wordKey(incoming.word);
        const tomb = tombs[key];
        if (tomb && tomb >= incoming.updatedAt) continue; // deleted after this version was written
        const local = byKey.get(key);
        if (local) {
          const merged = mergeWord(local, incoming);
          if (merged) {
            wordsStore.put(merged.word);
            byKey.set(key, merged.word);
            if (merged.meaningful) updated++;
            else aligned++;
          }
        } else {
          const fresh: Word = { ...incoming, id: ++maxId };
          wordsStore.put(fresh);
          byKey.set(key, fresh);
          added++;
        }
      }

      const removedIds = new Set<number>();
      for (const [key, w] of [...byKey]) {
        const tomb = tombs[key];
        if (tomb && tomb >= w.updatedAt) {
          wordsStore.delete(w.id);
          byKey.delete(key);
          removedIds.add(w.id);
          removed++;
        }
      }
      if (tombsChanged) writeTombstones(t, tombs);

      /* ----- answer logs (union by signature) ----- */
      const localLogs = (await reqToPromise(logsStore.getAll())) as LogRow[];
      const keyById = new Map([...byKey].map(([key, w]) => [w.id, key]));
      const sigs = new Set<string>();
      for (const l of localLogs) {
        if (removedIds.has(l.wordId)) {
          if (l.id !== undefined) logsStore.delete(l.id);
          continue;
        }
        sigs.add(logSig(keyById.get(l.wordId) ?? `#${l.wordId}`, l));
      }
      let logsAdded = 0;
      for (const l of snap.logs) {
        if (!l || typeof l.k !== "string" || !isoOrNull(l.createdAt)) continue;
        const target = byKey.get(l.k);
        if (!target) continue;
        const entry = {
          correct: !!l.correct,
          source: str(l.source, 20) || "quiz",
          qtype: str(l.qtype, 40),
          createdAt: l.createdAt,
        };
        const sig = logSig(l.k, entry);
        if (sigs.has(sig)) continue;
        sigs.add(sig);
        logsStore.add({ wordId: target.id, ...entry, day: DAY_RE.test(l.day) ? l.day : l.createdAt.slice(0, 10) });
        logsAdded++;
      }

      /* ----- quiz sessions (union by creation time) ----- */
      const localSessions = (await reqToPromise(sessStore.getAll())) as QuizSession[];
      const sessionKeys = new Set(localSessions.map((s) => s.createdAt));
      let sessionsAdded = 0;
      for (const s of snap.sessions) {
        if (!s || !isoOrNull(s.createdAt) || sessionKeys.has(s.createdAt)) continue;
        sessionKeys.add(s.createdAt);
        sessStore.add({
          total: count(s.total),
          correct: count(s.correct),
          durationSec: count(s.durationSec),
          bestStreak: count(s.bestStreak),
          xp: count(s.xp),
          source: str(s.source, 60) || "all",
          types: list(s.types, 20),
          typeStats: s.typeStats && typeof s.typeStats === "object" ? s.typeStats : {},
          createdAt: s.createdAt,
        });
        sessionsAdded++;
      }

      /* ----- activity (per device, max per counter) ----- */
      let activityChanged = 0;
      for (const a of snap.activity) {
        if (!a || typeof a.device !== "string" || !a.device || !DAY_RE.test(a.day)) continue;
        if (a.device === myDevice) {
          // Our own counters echoed back: only ever raise them (restores history after a reset).
          const cur = (await reqToPromise(actStore.get(a.day))) as DailyActivity | undefined;
          const next = activityOf({ day: a.day });
          for (const f of ACTIVITY_FIELDS) next[f] = Math.max(cur?.[f] ?? 0, count(a[f]));
          if (!cur || ACTIVITY_FIELDS.some((f) => (cur[f] ?? 0) !== next[f])) {
            actStore.put(next);
            activityChanged++;
          }
        } else {
          const id = `${a.device}|${a.day}`;
          const cur = (await reqToPromise(peerStore.get(id))) as PeerActivityRow | undefined;
          const next: PeerActivityRow = { id, device: a.device, ...activityOf({ day: a.day }) };
          for (const f of ACTIVITY_FIELDS) next[f] = Math.max(cur?.[f] ?? 0, count(a[f]));
          if (!cur || ACTIVITY_FIELDS.some((f) => (cur[f] ?? 0) !== next[f])) {
            peerStore.put(next);
            activityChanged++;
          }
        }
      }

      /* ----- fresh data for the UI ----- */
      const ownAct = (await reqToPromise(actStore.getAll())) as DailyActivity[];
      const sessionsAll = (await reqToPromise(sessStore.getAll())) as QuizSession[];
      return {
        added,
        updated,
        removed,
        sessions: sessionsAdded,
        logs: logsAdded,
        activity: activityChanged,
        changed: added + updated + removed + aligned + sessionsAdded + logsAdded + activityChanged > 0 || tombsChanged,
        data: {
          words: [...byKey.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          activity: await combinedActivity(t, ownAct),
          sessions: sessionsAll.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        },
      };
    },
  );
  const digest = snapshotDigest(await exportSyncSnapshot());
  return { ...result, digest };
}
