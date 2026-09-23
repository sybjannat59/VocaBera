import { getBootstrap } from "@/lib/server/words";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getBootstrap();
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.warn("Bootstrap fallback to empty list:", err);
    return Response.json({ words: [], activity: [], sessions: [] });
  }
}
