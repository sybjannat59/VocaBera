import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { syncRooms } from "@/db/schema";
import { ensureSchema, hasDatabase } from "./words";

export interface SyncRoom {
  code: string;
  hostToken: string;
  guestToken: string | null;
  hostName: string;
  guestName: string | null;
  offer: Record<string, unknown> | null;
  answer: Record<string, unknown> | null;
  hostCandidates: Record<string, unknown>[];
  guestCandidates: Record<string, unknown>[];
  expiresAt: Date;
  createdAt: Date;
}

// In-memory global store (shared across function invocations in the same process/lambda)
const globalStore = globalThis as unknown as {
  __vocaberaMemoryRooms?: Map<string, SyncRoom>;
};

if (!globalStore.__vocaberaMemoryRooms) {
  globalStore.__vocaberaMemoryRooms = new Map();
}

const memoryRooms = globalStore.__vocaberaMemoryRooms;

/** Rooms stay joinable for 30 minutes, and every poll/update pushes the expiry forward. */
const ROOM_TTL_MS = 30 * 60_000;
const ttl = () => new Date(Date.now() + ROOM_TTL_MS);

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const generateRoomCode = () =>
  Array.from(randomBytes(5), (n) => ALPHABET[n & 31]).join("");
export const generateToken = () => randomBytes(24).toString("base64url");

export function cleanDeviceName(v: unknown) {
  return typeof v === "string"
    ? v.trim().replace(/[<>\u0000-\u001f]/g, "").slice(0, 48) || "VocaBera device"
    : "VocaBera device";
}

function cleanExpired() {
  const now = Date.now();
  for (const [code, r] of memoryRooms.entries()) {
    if (r.expiresAt.getTime() <= now) {
      memoryRooms.delete(code);
    }
  }
}

export async function createSignalingRoom(hostName: string): Promise<{ code: string; token: string }> {
  cleanExpired();
  const secret = generateToken();
  const expiresAt = ttl();
  const now = new Date();

  for (let i = 0; i < 10; i++) {
    const invite = generateRoomCode();
    if (memoryRooms.has(invite)) continue;

    const roomObj: SyncRoom = {
      code: invite,
      hostToken: secret,
      guestToken: null,
      hostName,
      guestName: null,
      offer: null,
      answer: null,
      hostCandidates: [],
      guestCandidates: [],
      expiresAt,
      createdAt: now,
    };

    memoryRooms.set(invite, roomObj);

    // Optional DB persistence if available
    if (hasDatabase()) {
      try {
        await ensureSchema();
        await db.delete(syncRooms).where(lt(syncRooms.expiresAt, new Date(Date.now() - 3_600_000))).catch(() => undefined);
        await db
          .insert(syncRooms)
          .values({
            code: invite,
            hostToken: secret,
            hostName,
            expiresAt,
          })
          .onConflictDoNothing();
      } catch (err) {
        console.warn("Database sync room persistence skipped:", err instanceof Error ? err.message : err);
      }
    }

    return { code: invite, token: secret };
  }

  throw new Error("Could not allocate a room code. Please try again.");
}

export async function joinSignalingRoom(
  inviteCode: string,
  guestName: string,
): Promise<{ success: boolean; hostName?: string; token?: string; error?: string; status?: number }> {
  cleanExpired();
  const code = inviteCode.trim().toUpperCase();
  const secret = generateToken();
  const refresh = ttl();

  // Check memory first
  const memRoom = memoryRooms.get(code);
  if (memRoom) {
    if (memRoom.expiresAt.getTime() <= Date.now()) {
      memoryRooms.delete(code);
      return { success: false, error: "Room not found or expired. Ask the other device for a new code.", status: 404 };
    }
    if (memRoom.guestToken) {
      return { success: false, error: "This room already has a paired device", status: 409 };
    }

    memRoom.guestToken = secret;
    memRoom.guestName = guestName;
    memRoom.expiresAt = refresh;

    if (hasDatabase()) {
      try {
        await ensureSchema();
        await db
          .update(syncRooms)
          .set({ guestToken: secret, guestName, expiresAt: refresh })
          .where(eq(syncRooms.code, code));
      } catch {
        /* fallback to memory */
      }
    }

    return { success: true, hostName: memRoom.hostName, token: secret };
  }

  // If not in memory but DB is configured, try DB
  if (hasDatabase()) {
    try {
      await ensureSchema();
      const [row] = await db
        .update(syncRooms)
        .set({ guestToken: secret, guestName, expiresAt: refresh })
        .where(and(eq(syncRooms.code, code), isNull(syncRooms.guestToken), gt(syncRooms.expiresAt, new Date())))
        .returning({ code: syncRooms.code, hostName: syncRooms.hostName, hostToken: syncRooms.hostToken });

      if (row) {
        // Sync into memory as well
        memoryRooms.set(code, {
          code: row.code,
          hostToken: row.hostToken,
          guestToken: secret,
          hostName: row.hostName,
          guestName,
          offer: null,
          answer: null,
          hostCandidates: [],
          guestCandidates: [],
          expiresAt: refresh,
          createdAt: new Date(),
        });
        return { success: true, hostName: row.hostName, token: secret };
      }

      const [existing] = await db.select().from(syncRooms).where(eq(syncRooms.code, code));
      if (!existing || existing.expiresAt.getTime() <= Date.now()) {
        return { success: false, error: "Room not found or expired. Ask the other device for a new code.", status: 404 };
      }
      return { success: false, error: existing.guestToken ? "This room already has a paired device" : "Couldn't join this room.", status: 409 };
    } catch {
      /* continue to error */
    }
  }

  return { success: false, error: "Room not found or expired. Ask the other device for a new code.", status: 404 };
}

/**
 * Re-registers a room that the host already created but that vanished
 * (serverless instances do not share memory). The host's token is preserved,
 * so an in-flight session keeps working.
 */
export async function registerSignalingRoom(input: {
  code: string;
  token: string;
  hostName: string;
  guestToken?: string | null;
  guestName?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  cleanExpired();
  const code = input.code.trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) return { ok: false, error: "Invalid room code" };

  const existing = memoryRooms.get(code);
  if (existing) {
    // Already here: keep the host token authoritative and refresh the deadline.
    existing.expiresAt = ttl();
    existing.hostName = input.hostName;
    if (input.guestToken && !existing.guestToken) {
      existing.guestToken = input.guestToken;
      existing.guestName = input.guestName ?? existing.guestName;
    }
    return { ok: true };
  }

  const room: SyncRoom = {
    code,
    hostToken: input.token,
    guestToken: input.guestToken ?? null,
    hostName: input.hostName,
    guestName: input.guestName ?? null,
    offer: null,
    answer: null,
    hostCandidates: [],
    guestCandidates: [],
    expiresAt: ttl(),
    createdAt: new Date(),
  };
  memoryRooms.set(code, room);

  if (hasDatabase()) {
    try {
      await ensureSchema();
      await db
        .insert(syncRooms)
        .values({
          code,
          hostToken: input.token,
          guestToken: input.guestToken ?? null,
          guestName: input.guestName ?? null,
          hostName: input.hostName,
          expiresAt: room.expiresAt,
        })
        .onConflictDoUpdate({
          target: syncRooms.code,
          set: {
            hostName: input.hostName,
            guestToken: input.guestToken ?? null,
            guestName: input.guestName ?? null,
            expiresAt: room.expiresAt,
          },
        });
    } catch (err) {
      console.warn("Room re-registration could not reach the database:", err instanceof Error ? err.message : err);
    }
  }
  return { ok: true };
}

export async function getSignalingRoom(
  code: string,
  role: "host" | "guest",
  token: string,
): Promise<{ room: SyncRoom | null; valid: boolean }> {
  cleanExpired();
  let r = memoryRooms.get(code);

  if (!r && hasDatabase()) {
    try {
      await ensureSchema();
      const [dbRow] = await db
        .select()
        .from(syncRooms)
        .where(and(eq(syncRooms.code, code), gt(syncRooms.expiresAt, new Date())));

      if (dbRow) {
        r = {
          code: dbRow.code,
          hostToken: dbRow.hostToken,
          guestToken: dbRow.guestToken,
          hostName: dbRow.hostName,
          guestName: dbRow.guestName,
          offer: dbRow.offer,
          answer: dbRow.answer,
          hostCandidates: Array.isArray(dbRow.hostCandidates) ? dbRow.hostCandidates : [],
          guestCandidates: Array.isArray(dbRow.guestCandidates) ? dbRow.guestCandidates : [],
          expiresAt: dbRow.expiresAt,
          createdAt: dbRow.createdAt,
        };
        memoryRooms.set(code, r);
      }
    } catch {
      /* ignore */
    }
  }

  if (!r || r.expiresAt.getTime() <= Date.now()) return { room: null, valid: false };

  const valid = role === "host" ? r.hostToken === token : r.guestToken === token;
  // A device that is actively polling keeps the room alive, so it can never expire mid-pairing.
  if (valid) {
    r.expiresAt = ttl();
    if (hasDatabase()) {
      db.update(syncRooms).set({ expiresAt: r.expiresAt }).where(eq(syncRooms.code, code)).catch(() => undefined);
    }
  }
  return { room: r, valid };
}

export async function updateSignalingRoom(
  code: string,
  role: "host" | "guest",
  token: string,
  action: "touch" | "end" | "offer" | "answer" | "candidate",
  payload?: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const { room, valid } = await getSignalingRoom(code, role, token);
  if (!room) return { ok: false, error: "This room has expired" };
  if (!valid) return { ok: false, error: "Unauthorized" };

  const refresh = ttl();
  room.expiresAt = refresh;

  if (action === "touch") {
    if (hasDatabase()) {
      db.update(syncRooms).set({ expiresAt: refresh }).where(eq(syncRooms.code, code)).catch(() => undefined);
    }
    return { ok: true };
  }

  if (action === "end") {
    memoryRooms.delete(code);
    if (hasDatabase()) {
      db.delete(syncRooms).where(eq(syncRooms.code, code)).catch(() => undefined);
    }
    return { ok: true };
  }

  if (action === "offer") {
    if (role !== "host" || !payload?.description) return { ok: false, error: "Invalid offer" };
    room.offer = payload.description as Record<string, unknown>;
    if (hasDatabase()) {
      db.update(syncRooms).set({ offer: room.offer, expiresAt: refresh }).where(eq(syncRooms.code, code)).catch(() => undefined);
    }
    return { ok: true };
  }

  if (action === "answer") {
    if (role !== "guest" || !payload?.description) return { ok: false, error: "Invalid answer" };
    room.answer = payload.description as Record<string, unknown>;
    if (hasDatabase()) {
      db.update(syncRooms).set({ answer: room.answer, expiresAt: refresh }).where(eq(syncRooms.code, code)).catch(() => undefined);
    }
    return { ok: true };
  }

  if (action === "candidate") {
    const c = payload?.candidate as Record<string, unknown> | undefined;
    if (!c || typeof c.candidate !== "string") return { ok: false, error: "Invalid candidate" };
    const cand = {
      candidate: c.candidate,
      sdpMid: typeof c.sdpMid === "string" ? c.sdpMid.slice(0, 120) : null,
      sdpMLineIndex: Number.isInteger(c.sdpMLineIndex) ? c.sdpMLineIndex : null,
      usernameFragment: typeof c.usernameFragment === "string" ? c.usernameFragment.slice(0, 120) : null,
    };

    if (role === "host") {
      room.hostCandidates.push(cand);
      if (hasDatabase()) {
        db.update(syncRooms)
          .set({ hostCandidates: sql`${syncRooms.hostCandidates} || jsonb_build_array(${JSON.stringify(cand)}::jsonb)`, expiresAt: refresh })
          .where(eq(syncRooms.code, code))
          .catch(() => undefined);
      }
    } else {
      room.guestCandidates.push(cand);
      if (hasDatabase()) {
        db.update(syncRooms)
          .set({ guestCandidates: sql`${syncRooms.guestCandidates} || jsonb_build_array(${JSON.stringify(cand)}::jsonb)`, expiresAt: refresh })
          .where(eq(syncRooms.code, code))
          .catch(() => undefined);
      }
    }
    return { ok: true };
  }

  return { ok: false, error: "Unknown action" };
}
