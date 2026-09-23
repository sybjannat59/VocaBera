export const dynamic = "force-static";

// Changes on every build/deploy so installed apps pick up the new version.
const VERSION = (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 8) || Date.now().toString(36);

const PAGES = ["/", "/words", "/add", "/quiz", "/flashcards", "/progress", "/manage", "/offline"];

const script = `/* VocaBera service worker · ${VERSION} */
const VERSION = ${JSON.stringify(VERSION)};
const PAGE_CACHE = "vb-pages-" + VERSION;
const STATIC_CACHE = "vb-static-v1";
const ASSET_CACHE = "vb-assets-v1";
const PAGES = ${JSON.stringify(PAGES)};
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const pages = await caches.open(PAGE_CACHE);
    const statics = await caches.open(STATIC_CACHE);
    const assets = new Set();
    await Promise.all(PAGES.map(async (url) => {
      try {
        const res = await fetch(url, { cache: "no-cache", credentials: "same-origin" });
        if (!res.ok) return;
        const html = await res.clone().text();
        await pages.put(url, res);
        for (const m of html.matchAll(/\\/_next\\/static\\/[^"'\\s)\\\\]+/g)) assets.add(m[0]);
      } catch (e) {}
    }));
    await Promise.all([...assets].map((u) => statics.add(u).catch(() => {})));
    await caches.open(ASSET_CACHE).then((c) => c.addAll(["/icons/icon.svg", "/icons/maskable.svg", "/manifest.webmanifest"]).catch(() => {}));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([PAGE_CACHE, STATIC_CACHE, ASSET_CACHE]);
    for (const key of await caches.keys()) if (key.startsWith("vb-") && !keep.has(key)) await caches.delete(key);
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function networkFirstPage(event) {
  const req = event.request;
  const url = new URL(req.url);
  const cache = await caches.open(PAGE_CACHE);
  const key = url.pathname.replace(/\\/$/, "") || "/";
  try {
    const preload = event.preloadResponse ? await event.preloadResponse : null;
    const res = preload || (await withTimeout(fetch(req), 6000));
    if (res && res.ok && res.type === "basic") cache.put(key, res.clone());
    return res;
  } catch (e) {
    const cached = (await cache.match(key)) || (key.startsWith("/edit/") ? await cache.match("/words") : null);
    return cached || (await cache.match(OFFLINE_URL)) || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

async function networkFirstRsc(req) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const res = await withTimeout(fetch(req), 6000);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    // Let Next.js fall back to a full navigation, which the page handler serves from cache.
    return (await cache.match(req)) || Response.error();
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(req);
  const network = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return; // always live

  if (req.mode === "navigate") return event.respondWith(networkFirstPage(event));
  if (req.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return event.respondWith(networkFirstRsc(req));
  if (url.pathname.startsWith("/_next/static/")) return event.respondWith(cacheFirst(req, STATIC_CACHE));
  if (/\\.(?:svg|png|ico|webmanifest|woff2?)$/.test(url.pathname) || url.pathname.startsWith("/pwa-icon/") || url.pathname === "/manifest.webmanifest") {
    return event.respondWith(staleWhileRevalidate(req));
  }
});
`;

export function GET() {
  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
