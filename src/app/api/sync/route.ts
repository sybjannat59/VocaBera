import { cleanDeviceName, createSignalingRoom, joinSignalingRoom } from "@/lib/server/rooms";
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

    return jsonError("Unknown action");
  } catch (err) {
    console.error("Signaling error:", err);
    return jsonError("Signaling service temporarily busy. Please try again.", 500);
  }
}
