import { getSignalingRoom, updateSignalingRoom } from "@/lib/server/rooms";
import { jsonError } from "@/lib/server/words";

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

export async function GET(req: Request, { params }: Ctx) {
  const invite = (await params).code.toUpperCase();
  const auth = getAuth(req);
  if (!auth.role || !auth.token) return jsonError("Unauthorized", 401);

  const { room, valid } = await getSignalingRoom(invite, auth.role, auth.token);
  if (!room) return jsonError("This room has expired", 404);
  if (!valid) return jsonError("Unauthorized", 401);

  return Response.json({
    code: room.code,
    hostName: room.hostName,
    guestName: room.guestName,
    offer: room.offer,
    answer: room.answer,
    remoteCandidates: auth.role === "host" ? room.guestCandidates : room.hostCandidates,
    connected: !!room.guestToken,
    expiresAt: room.expiresAt.toISOString(),
  });
}

export async function POST(req: Request, { params }: Ctx) {
  const invite = (await params).code.toUpperCase();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("Invalid request");
  const auth = getAuth(req, body);
  if (!auth.role || !auth.token) return jsonError("Unauthorized", 401);

  const action = String(body.action) as "touch" | "end" | "offer" | "answer" | "candidate";
  const result = await updateSignalingRoom(invite, auth.role, auth.token, action, body);

  if (!result.ok) {
    const status = result.error === "Unauthorized" ? 401 : result.error?.includes("expired") ? 404 : 400;
    return jsonError(result.error || "Action failed", status);
  }

  return Response.json({ ok: true });
}
