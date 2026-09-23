// Service worker served from the site root (/sw.js). Prerendered at build time,
// so every deployment gets a fresh VERSION and old page caches are cleaned up.
export const dynamic = "force-static";

const VERSION = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || Date.now().toString(36)).slice(0, 12);

// Fast hosts skip the network for these, falling back to the cache only on failure.
const OFFLINE_ONLY = ["/quiz", "/flashcards", "/manage"];

const PRECACHE_PAGES = ["/", "/words", "/add", "/progress", "/offline"];
const OFFLINE_PAGES = ["/", ...OFFLINE_ONLY];
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
const STATIC = "vb-static-v1";
const ASSETS = "vb-assets-v1";
const PRECACHE_PAGES = ${JSON.stringify(PRECACHE_PAGES)};
const OFFLINE_PAGES = ${JSON.stringify(OFFLINE_PAGES)};
const CORE_ASSETS = ${JSON.stringify(CORE_ASSETS)};
const OFFLINE_ONLY = ${JSON.stringify(OFFLINE_ONLY)};
const ASSET_RE = /(?:\/_next\/)?(static\/(?:chunks|media|css)\/[\w\-.~\/]+?\.(?:js|css|woff2?|ttf|otf|png|svg|jpe?g|webp))/g;

function cleanResponse(res) {
  if (!res.redirected) return Promise.resolve(res);
  return res.blob().then(function (body) {
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  });
}

function isHtml(res) {
  return !!res && res.ok && (res.headers.get("content-type") || "").indexOf("text/html") !== -1;
}

async function cacheAssetsFromHtml(html, statics, assets) {
  const found = new Set();
  for (const m of html.matchAll(ASSET_RE)) found.add("/_next/" + m[1]);
  await Promise.all(Array.from(found).map(async function (url) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        if (/(woff2?|ttf|otf)$/.test(url)) await assets.put(url, res);
        else await statics.put(url, res);
      }
    } catch (err) {}
  }));
}

async function precache() {
  const pages = await caches.open(PAGES);
  const statics = await caches.open(STATIC);
  const assets = await caches.open(ASSETS);
  for (const path of PRECACHE_PAGES.concat(["/manifest.webmanifest"])) {
    try {
      const res = await fetch(path, { cache: "reload", credentials: "same-origin" });
      if (isHtml(res)) {
        await pages.put(path, await cleanResponse(res));
        await cacheAssetsFromHtml(await res.clone().text(), statics, assets);
      }
    } catch (err) {}
  }
  for (const url of CORE_ASSETS) {
    try {
      const res = await fetch(url, { cache: "reload" });
      if (res.ok) await assets.put(url, res);
    } catch (err) {}
  }
}

async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener("install", function (event) {
  event.waitUntil(precache().catch(function () {})); // never mark the install as failed
});

self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k !== PAGES && k !== STATIC && k !== ASSETS; }).map(function (k) { return caches.delete(k); }));
    await trim(STATIC, 300);
    await trim(ASSETS, 120);
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (err) {}
    }
    await self.clients.claim();
    // Ask open tabs to acknowledge the new version so SKIP_WAITING is only sent
    // when no tab is frozen in an old state.
    try {
      const cls = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of cls) c.postMessage({ type: "SW_ACTIVATED", version: VERSION });
    } catch (err) {}
  })());
});

self.addEventListener("message", function (event) {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  if (data.type === "GET_VERSION" && event.ports && event.ports[0]) event.ports[0].postMessage(VERSION);
});

function fetchSafely(req, event) {
  return (async function () {
    if (event.preloadResponse) {
      const preloaded = await event.preloadResponse.catch(function () { return undefined; });
      if (preloaded) return preloaded;
    }
    return fetch(req);
  })();
}

async function offlineResponse(page, cache) {
  const hit = await cache.match(page, { ignoreVary: true });
  if (hit && page !== "/offline") return Response.redirect("/offline?from=" + encodeURIComponent(page), 302);
  const fallback = await cache.match("/offline", { ignoreVary: true });
  if (fallback) return fallback;
  return new Response(
    "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Offline · VocaBera</title>" +
      "<body style='margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui;background:#f4f6fc;color:#0f172a'>" +
      "<div style='text-align:center;padding:24px'><h1>You are offline</h1><p>Reconnect to the internet and try again.</p></div></body>",
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

// Pages: network first — instantly when content changes, never stuck on a stale copy.
async function navigate(event) {
  const req = event.request;
  const url = new URL(req.url);
  const key = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : "/";
  const offlineOnly = OFFLINE_ONLY.includes(key);
  const cache = await caches.open(PAGES);
  const network = (async function () {
    const res = await fetchSafely(req, event);
    const save = (async function () {
      if (!isHtml(res)) return;
      const copy = res.clone();
      await cache.put(key, await cleanResponse(copy));
      await cacheAssetsFromHtml(await res.clone().text(), await caches.open(STATIC), await caches.open(ASSETS));
    })();
    event.waitUntil(save);
    return res;
  })();

  if (offlineOnly) {
    try { return await network; } catch (err) {}
  }

  const cached = await cache.match(key, { ignoreVary: true });
  if (cached) {
    const reached = network.then(function (res) {
      return res.ok || res.type === "opaqueredirect" || res.status < 500 ? res : cached;
    });
    return reached.catch(function () {
      return cached;
    });
  }
  if (!offlineOnly) {
    try { return await network; } catch (err) {}
  }
  return offlineResponse(key, cache);
}

// Hashed build assets never change: cache first.
function cacheFirst(event, req) {
  return caches.open(STATIC).then(function (cache) {
    return cache.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res.ok) event.waitUntil(cache.put(req, res.clone()).catch(function () {}));
        return res;
      });
    });
  });
}

// Icons, manifest, fonts: serve cached copy instantly, refresh in the background.
function staleWhileRevalidate(event, req) {
  const update = caches.open(ASSETS).then(function (cache) {
    return fetch(req).then(function (res) {
      if (res.ok) return cache.put(req, res.clone()).then(function () { return res; }, function () { return res; });
      return res;
    });
  });
  event.waitUntil(update.then(function () {}, function () {}));
  return caches.open(ASSETS).then(function (cache) {
    return cache.match(req, { ignoreSearch: true });
  }).then(function (hit) {
    return hit || update;
  });
}

self.addEventListener("fetch", function (event) {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf("/api/") === 0 || url.pathname === "/sw.js") return; // APIs & live sync always use the network
  if (url.pathname.indexOf("/_next/static/") === 0) { event.respondWith(cacheFirst(event, req)); return; }
  if (req.mode === "navigate") { event.respondWith(navigate(event).catch(function () { return new Response("", { status: 504 }); })); return; }
  if (req.headers.get("RSC") || url.searchParams.has("_rsc")) return;
  if (/\.(?:png|svg|ico|jpe?g|webp|woff2?|webmanifest)$/.test(url.pathname)) event.respondWith(staleWhileRevalidate(event, req));
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
