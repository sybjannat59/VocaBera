import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { syncRooms } from "@/db/schema";
import { ensureSchema, jsonError } from "@/lib/server/words";

export const dynamic = "force-dynamic";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = () => Array.from(randomBytes(5), (n) => ALPHABET[n & 31]).join("");
const token = () => randomBytes(24).toString("base64url");
const nameOf = (v: unknown) => (typeof v === "string" ? v.trim().replace(/[<>\u0000-\u001f]/g, "").slice(0, 48) || "VocaBera device" : "VocaBera device");

export async function POST(req: Request) {
  await ensureSchema();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("Invalid request");
  const name = nameOf(body.name);

  if (body.action === "create") {
    for (let i = 0; i < 8; i++) {
      const invite = code();
      const secret = token();
      const [row] = await db
        .insert(syncRooms)
        .values({ code: invite, hostToken: secret, hostName: name, expiresAt: new Date(Date.now() + 10 * 60_000) })
        .onConflictDoNothing()
        .returning({ code: syncRooms.code });
      if (row) return Response.json({ code: row.code, token: secret, role: "host" }, { status: 201 });
    }
    return jsonError("Couldn't create a room. Please try again.", 503);
  }

  if (body.action === "join") {
    const invite = typeof body.code === "string" ? body.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
    if (!/^[A-HJ-NP-Z2-9]{5}$/.test(invite)) return jsonError("Enter a valid 5-character room code");
    const secret = token();
    const [row] = await db
      .update(syncRooms)
      .set({ guestToken: secret, guestName: name, expiresAt: new Date(Date.now() + 10 * 60_000) })
      .where(and(eq(syncRooms.code, invite), isNull(syncRooms.guestToken), gt(syncRooms.expiresAt, new Date())))
      .returning({ code: syncRooms.code, hostName: syncRooms.hostName });
    if (!row) {
      const [existing] = await db
        .select({ guestToken: syncRooms.guestToken, expiresAt: syncRooms.expiresAt })
        .from(syncRooms)
        .where(eq(syncRooms.code, invite));
      if (!existing || existing.expiresAt.getTime() <= Date.now()) return jsonError("Room not found or expired. Ask the other device for a new code.", 404);
      return jsonError(existing.guestToken ? "This room already has a paired device" : "Couldn't join this room. Try again.", 409);
    }
    return Response.json({ code: row.code, token: secret, role: "guest", hostName: row.hostName });
  }

  return jsonError("Unknown action");
}
