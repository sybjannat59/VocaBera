import { getBootstrap, jsonError } from "@/lib/server/words";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getBootstrap();
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("bootstrap failed", err);
    return jsonError("Could not load your vocabulary. Please try again.", 500);
  }
}
