import { cleanDeviceName, createSignalingRoom, joinSignalingRoom, registerSignalingRoom } from "@/lib/server/rooms";
import { jsonError } from "@/lib/server/words";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return jsonError("Invalid request");
    const name = cleanDeviceName(body.name);

    if (body.action === "create") {
      const res = await createSignalingRoom(name);
      return Response.json({ code: res.code, token: res.token, role: "host" }, { status: 201 });
    }

    if (body.action === "join") {
      const invite = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
      if (!invite) return jsonError("Enter a room code");

      const res = await joinSignalingRoom(invite, name);
      if (!res.success) {
        return jsonError(res.error || "Could not join room", res.status || 400);
      }

      return Response.json({
        code: invite,
        token: res.token,
        role: "guest",
        hostName: res.hostName,
      });
    }

    // A host can re-register a room it already owns. Serverless instances do not share
    // memory, so this heals the session instead of showing "room expired".
    if (body.action === "register") {
      const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
      const token = typeof body.token === "string" ? body.token : "";
      if (!code || !token) return jsonError("Missing room credentials");
      const res = await registerSignalingRoom({
        code,
        token,
        hostName: name,
        guestToken: typeof body.guestToken === "string" ? body.guestToken : null,
        guestName: typeof body.guestName === "string" ? body.guestName : null,
      });
      if (!res.ok) return jsonError(res.error || "Could not re-register room", 400);
      return Response.json({ ok: true, code });
    }

    return jsonError("Unknown action");
  } catch (err) {
    console.error("Signaling error:", err);
    return jsonError("Signaling service temporarily busy. Please try again.", 500);
  }
}
