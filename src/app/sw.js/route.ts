// Service worker served from the site root (/sw.js). Prerendered at build time, so every
// deployment gets a new VERSION; old caches are removed when the new worker activates.
export const dynamic = "force-static";

const VERSION = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || Date.now().toString(36)).slice(0, 12);

const CORE_PAGES = ["/", "/words", "/add", "/quiz", "/flashcards", "/progress", "/manage", "/offline"];
const CORE_ASSETS = [
  "/manifest.webmanifest",
  "/icon.svg",
  "/icons/icon.svg",
  "/icons/icon-maskable.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

const source = String.raw`/* VocaBera service worker · build ${VERSION} */
const VERSION = ${JSON.stringify(VERSION)};
const PAGES = "vb-pages-" + VERSION;
const STATIC = "vb-static-" + VERSION;
const ASSETS = "vb-assets-v2";
const KEEP = [PAGES, STATIC, ASSETS];
const CORE_PAGES = ${JSON.stringify(CORE_PAGES)};
const CORE_ASSETS = ${JSON.stringify(CORE_ASSETS)};
const ASSET_RE = /(?:\/_next\/)?(static\/(?:chunks|media|css)\/[\w\-.~\/]+?\.(?:js|css|woff2?|ttf|otf|png|svg|jpe?g|webp))/g;
const NETWORK_TIMEOUT_MS = 12000;

function isHtml(res) {
  return !!res && res.ok && (res.headers.get("content-type") || "").indexOf("text/html") !== -1;
}

async function stripRedirect(res) {
  if (!res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

async function precache() {
  const pages = await caches.open(PAGES);
  const statics = await caches.open(STATIC);
  const assets = await caches.open(ASSETS);
  const found = new Set();
  await Promise.all(CORE_PAGES.map(async (path) => {
    try {
      const res = await fetch(path, { cache: "reload", credentials: "same-origin" });
      if (!isHtml(res)) return;
      const html = await res.clone().text();
      await pages.put(path, await stripRedirect(res));
      for (const m of html.matchAll(ASSET_RE)) found.add("/_next/" + m[1]);
    } catch (err) {}
  }));
  await Promise.all([...found].map(async (url) => {
    try {
      const res = await fetch(url);
      if (res.ok) await statics.put(url, res);
    } catch (err) {}
  }));
  await Promise.all(CORE_ASSETS.map(async (url) => {
    try {
      const res = await fetch(url, { cache: "reload" });
      if (res.ok) await assets.put(url, res);
    } catch (err) {}
  }));
}

self.addEventListener("install", (event) => {
  // Take over as soon as the new version is cached: a waiting worker would keep serving an old app.
  self.skipWaiting();
  event.waitUntil(precache());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.indexOf("vb-") === 0 && KEEP.indexOf(k) === -1).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (err) {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  if (data.type === "GET_VERSION" && event.ports && event.ports[0]) event.ports[0].postMessage(VERSION);
});

function offlineFallback() {
  return new Response(
    "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Offline · VocaBera</title>" +
    "<body style='margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui;background:#f4f6fc;color:#0f172a'>" +
    "<div style='text-align:center;padding:24px'><h1>You are offline</h1><p>Reconnect to the internet and try again.</p></div></body>",
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Pages: always the network while online, so a page can never be older than the server.
// The cached copy (same build as this worker) is only used when there is no connection.
async function navigate(event) {
  const req = event.request;
  const url = new URL(req.url);
  const key = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : "/";
  const cache = await caches.open(PAGES);
  if (self.navigator && self.navigator.onLine === false) {
    const hit = await cache.match(key, { ignoreVary: true });
    if (hit) return hit;
  }
  try {
    const preloaded = event.preloadResponse ? await event.preloadResponse.catch(() => undefined) : undefined;
    const res = preloaded || (await fetchWithTimeout(req, NETWORK_TIMEOUT_MS));
    if (isHtml(res)) {
      const copy = res.clone();
      event.waitUntil(stripRedirect(copy).then((r) => cache.put(key, r)).catch(() => {}));
    }
    return res;
  } catch (err) {
    const hit = await cache.match(key, { ignoreVary: true });
    if (hit) return hit;
    const offline = await cache.match("/offline", { ignoreVary: true });
    if (offline && key !== "/offline") return Response.redirect("/offline?from=" + encodeURIComponent(url.pathname + url.search), 302);
    return offlineFallback();
  }
}

// Build files have content hashes and never change: serve from cache, fill the cache on first use.
async function staticAsset(event, req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) event.waitUntil(cache.put(req, res.clone()).catch(() => {}));
  return res;
}

// Icons, manifest and fonts: cached copy instantly, refreshed in the background.
async function asset(event, req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req, { ignoreSearch: true });
  const update = fetch(req).then((res) => {
    if (res.ok) return cache.put(req, res.clone()).then(() => res, () => res);
    return res;
  });
  event.waitUntil(update.then(() => {}, () => {}));
  return hit || update;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf("/api/") === 0 || url.pathname === "/sw.js") return; // live data always uses the network
  if (req.headers.get("RSC") || req.headers.get("Next-Router-Prefetch") || url.searchParams.has("_rsc")) return; // app navigation data
  if (url.pathname.indexOf("/_next/static/") === 0) { event.respondWith(staticAsset(event, req)); return; }
  if (req.mode === "navigate") { event.respondWith(navigate(event)); return; }
  if (url.pathname === "/tts-worker.js" || /\.(?:png|svg|ico|jpe?g|webp|woff2?|webmanifest)$/.test(url.pathname)) event.respondWith(asset(event, req));
});
`;

export function GET() {
  return new Response(source, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
