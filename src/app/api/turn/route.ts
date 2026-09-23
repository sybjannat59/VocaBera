// Returns TURN relay servers for device sync. Credentials stay on the server.
// A relay is only needed when two devices can't reach each other directly
// (e.g. routers with "client/AP isolation"). Configure ONE of these in Vercel → Settings → Environment Variables:
//   Cloudflare Realtime TURN (free tier):   CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN
//   Metered Open Relay (free 20 GB/month):  METERED_TURN_APP (e.g. "myapp") + METERED_TURN_API_KEY
//   Any TURN server (e.g. coturn):          TURN_URLS (comma separated) + TURN_USERNAME + TURN_CREDENTIAL
export const dynamic = "force-dynamic";

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

let cached: { servers: IceServer[]; until: number } | null = null;

function clean(list: unknown): IceServer[] {
  const arr = Array.isArray(list) ? list : list && typeof list === "object" ? [list] : [];
  return arr
    .map((s) => s as Record<string, unknown>)
    .filter((s) => typeof s.urls === "string" || (Array.isArray(s.urls) && s.urls.every((u) => typeof u === "string")))
    .map((s) => ({
      urls: s.urls as string | string[],
      ...(typeof s.username === "string" ? { username: s.username } : {}),
      ...(typeof s.credential === "string" ? { credential: s.credential } : {}),
    }));
}

async function cloudflare(): Promise<IceServer[]> {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !token) return [];
  const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl: 86400 }),
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Cloudflare TURN ${res.status}`);
  const data = (await res.json()) as { iceServers?: unknown };
  return clean(data.iceServers);
}

async function metered(): Promise<IceServer[]> {
  const app = process.env.METERED_TURN_APP;
  const key = process.env.METERED_TURN_API_KEY;
  if (!app || !key) return [];
  const host = app.includes(".") ? app : `${app}.metered.live`;
  const res = await fetch(`https://${host}/api/v1/turn/credentials?apiKey=${encodeURIComponent(key)}`, {
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Metered TURN ${res.status}`);
  return clean(await res.json());
}

function staticTurn(): IceServer[] {
  const urls = (process.env.TURN_URLS || "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  if (!urls.length) return [];
  return [{ urls, username: process.env.TURN_USERNAME || undefined, credential: process.env.TURN_CREDENTIAL || undefined }];
}

export async function GET() {
  if (cached && cached.until > Date.now()) {
    return Response.json({ iceServers: cached.servers, configured: cached.servers.length > 0 }, { headers: { "Cache-Control": "no-store" } });
  }
  const servers: IceServer[] = [...staticTurn()];
  for (const source of [cloudflare, metered]) {
    try {
      servers.push(...(await source()));
    } catch (err) {
      console.warn("TURN credentials unavailable:", err instanceof Error ? err.message : err);
    }
  }
  cached = { servers, until: Date.now() + (servers.length ? 6 * 3600_000 : 60_000) };
  return Response.json({ iceServers: servers, configured: servers.length > 0 }, { headers: { "Cache-Control": "no-store" } });
}
