import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { syncRooms } from "@/db/schema";
import { ensureSchema, jsonError } from "@/lib/server/words";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ code: string }> };
type Role = "host" | "guest";

const getAuth = (req: Request, body?: Record<string, unknown>) => {
  const url = new URL(req.url);
  const role = url.searchParams.get("role") ?? body?.role;
  const token = url.searchParams.get("token") ?? body?.token;
  return {
    role: role === "host" || role === "guest" ? (role as Role) : null,
    token: typeof token === "string" ? token : "",
  };
};

async function roomFor(code: string, role: Role, token: string) {
  const [row] = await db
    .select()
    .from(syncRooms)
    .where(and(eq(syncRooms.code, code), gt(syncRooms.expiresAt, new Date())));
  if (!row) return { row: null, valid: false };
  return {
    row,
    valid: role === "host" ? row.hostToken === token : row.guestToken === token,
  };
}

export async function GET(req: Request, { params }: Ctx) {
  await ensureSchema();
  const invite = (await params).code.toUpperCase();
  const auth = getAuth(req);
  if (!auth.role || !auth.token) return jsonError("Unauthorized", 401);
  const { row, valid } = await roomFor(invite, auth.role, auth.token);
  if (!row) return jsonError("This room has expired", 404);
  if (!valid) return jsonError("Unauthorized", 401);
  return Response.json({
    code: row.code,
    hostName: row.hostName,
    guestName: row.guestName,
    offer: row.offer,
    answer: row.answer,
    remoteCandidates: auth.role === "host" ? row.guestCandidates : row.hostCandidates,
    connected: !!row.guestToken,
    expiresAt: row.expiresAt.toISOString(),
  });
}

export async function POST(req: Request, { params }: Ctx) {
  await ensureSchema();
  const invite = (await params).code.toUpperCase();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("Invalid request");
  const auth = getAuth(req, body);
  if (!auth.role || !auth.token) return jsonError("Unauthorized", 401);
  const { row, valid } = await roomFor(invite, auth.role, auth.token);
  if (!row) return jsonError("This room has expired", 404);
  if (!valid) return jsonError("Unauthorized", 401);
  const refresh = new Date(Date.now() + 10 * 60_000);

  if (body.action === "touch") {
    await db.update(syncRooms).set({ expiresAt: refresh }).where(eq(syncRooms.code, invite));
    return Response.json({ ok: true });
  }
  if (body.action === "end") {
    await db.delete(syncRooms).where(eq(syncRooms.code, invite));
    return Response.json({ ok: true });
  }
  if (body.action === "offer" || body.action === "answer") {
    const correctRole = body.action === "offer" ? auth.role === "host" : auth.role === "guest";
    const desc = body.description as Record<string, unknown> | undefined;
    if (!correctRole || !desc || !["offer", "answer"].includes(String(desc.type)) || typeof desc.sdp !== "string" || desc.sdp.length > 100_000) {
      return jsonError("Invalid WebRTC description");
    }
    const value = { type: desc.type, sdp: desc.sdp };
    await db
      .update(syncRooms)
      .set(body.action === "offer" ? { offer: value, expiresAt: refresh } : { answer: value, expiresAt: refresh })
      .where(eq(syncRooms.code, invite));
    return Response.json({ ok: true });
  }
  if (body.action === "candidate") {
    const c = body.candidate as Record<string, unknown> | undefined;
    if (!c || typeof c.candidate !== "string" || c.candidate.length > 6000) return jsonError("Invalid ICE candidate");
    const candidate = {
      candidate: c.candidate,
      sdpMid: typeof c.sdpMid === "string" ? c.sdpMid.slice(0, 120) : null,
      sdpMLineIndex: Number.isInteger(c.sdpMLineIndex) ? c.sdpMLineIndex : null,
      usernameFragment: typeof c.usernameFragment === "string" ? c.usernameFragment.slice(0, 120) : null,
    };
    const isHost = auth.role === "host";
    const column = isHost ? syncRooms.hostCandidates : syncRooms.guestCandidates;
    await db
      .update(syncRooms)
      .set({
        [isHost ? "hostCandidates" : "guestCandidates"]: sql`${column} || jsonb_build_array(${JSON.stringify(candidate)}::jsonb)`,
        expiresAt: refresh,
      })
      .where(eq(syncRooms.code, invite));
    return Response.json({ ok: true });
  }
  return jsonError("Unknown action");
}
