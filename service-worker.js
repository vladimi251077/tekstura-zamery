const CACHE_VERSION = "tekstura-offline-shell-v31";
const APP_SHELL_CACHE = `${CACHE_VERSION}-app-shell`;
const OFFLINE_FALLBACK_URLS = [
  "/offline-fallback.html",
  "./offline-fallback.html",
];
const OFFLINE_DIAGNOSTICS_URLS = [
  "/offline-diagnostics.html",
  "./offline-diagnostics.html",
];
const IOS_INDEX_URLS = [
  "./index.html",
  "/index.html",
  new URL("./index.html", self.registration.scope).href,
  new URL("/index.html", self.location.origin).href,
];

const IOS_ROOT_URLS = [
  "./",
  "/",
  new URL("/", self.location.origin).href,
];

const IOS_START_URLS = [
  ...IOS_INDEX_URLS,
  ...IOS_ROOT_URLS,
];

const NAVIGATION_FALLBACK_URLS = [
  "/index.html",
  "./index.html",
  "/",
  "./",
  new URL("./index.html", self.registration.scope).href,
  new URL("/index.html", self.location.origin).href,
  new URL("/", self.location.origin).href,
  ...OFFLINE_DIAGNOSTICS_URLS,
  ...OFFLINE_FALLBACK_URLS,
];

const APP_SHELL_URLS = [
  ...IOS_START_URLS,
  ...OFFLINE_FALLBACK_URLS,
  ...OFFLINE_DIAGNOSTICS_URLS,
  "/offline-test.html",
  "./offline-test.html",
  "/styles.css?v=20260518-trash-bulk",
  "./styles.css?v=20260518-trash-bulk",
  "/app.js?v=20260604-runtime-error-fallback-v2",
  "./app.js?v=20260604-runtime-error-fallback-v2",
  "/offline-db.js?v=20260517-v4",
  "./offline-db.js?v=20260517-v4",
  "/vendor/supabase-js.js",
  "./vendor/supabase-js.js",
  "/photo-preview.js?v=20260515-v14",
  "/details-enhance.js?v=20260515-v14",
  "/scheme-sketch.js?v=20260506-disabled",
  "/drawing-bridge.js?v=20260517-v15",
  "/manifest.webmanifest",
  "./manifest.webmanifest",
  "/icon-192.png",
  "./icon-192.png",
  "/icon-512.png",
  "./icon-512.png",
];

const REQUIRED_APP_SHELL_URLS = new Set([
  ...IOS_START_URLS,
  ...OFFLINE_FALLBACK_URLS,
  ...OFFLINE_DIAGNOSTICS_URLS,
  "/offline-test.html",
  "./offline-test.html",
  "/styles.css?v=20260518-trash-bulk",
  "./styles.css?v=20260518-trash-bulk",
  "/app.js?v=20260604-runtime-error-fallback-v2",
  "./app.js?v=20260604-runtime-error-fallback-v2",
  "/offline-db.js?v=20260517-v4",
  "./offline-db.js?v=20260517-v4",
  "/vendor/supabase-js.js",
  "./vendor/supabase-js.js",
  "/manifest.webmanifest",
  "./manifest.webmanifest",
  "/icon-192.png",
  "./icon-192.png",
  "/icon-512.png",
  "./icon-512.png",
]);

const LOCAL_CACHEABLE_DESTINATIONS = new Set(["document", "script", "style", "manifest", "image"]);
const CACHE_FIRST_DESTINATIONS = new Set(["manifest", "image"]);

function isSupabaseRequest(url) {
  return url.hostname.endsWith(".supabase.co") || url.hostname.includes("supabase");
}

function isLocalRequest(url) {
  return url.origin === self.location.origin;
}

function isExcludedLocalPath(url) {
  return url.pathname.endsWith("/production.html") || url.pathname.endsWith("/production.js") || url.pathname.endsWith("/production.css") || url.pathname.includes("/svg-constructor/");
}

function isNavigationRequest(request) {
  return request.mode === "navigate" || request.destination === "document" || request.headers.get("accept")?.includes("text/html");
}

function offlineFallbackResponse(status = 503) {
  return new Response(`<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tekstura Замеры — офлайн</title>
  </head>
  <body>
    <h1>Tekstura Замеры</h1>
    <p>Приложение Tekstura Замеры открыто офлайн, но кэш оболочки повреждён. Включите интернет и нажмите Обновить.</p>
  </body>
</html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
    status,
  });
}

async function cacheShellUrl(cache, url) {
  if (OFFLINE_FALLBACK_URLS.includes(url)) {
    await cache.put(url, offlineFallbackResponse(200));
    return null;
  }
  const request = new Request(url, { cache: "reload" });
  const response = await fetch(request);
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  await cache.put(request, response.clone());
  await cache.put(url, response.clone());
  return response;
}

async function cacheIosStartUrls(cache) {
  const indexRequest = new Request(new URL("./index.html", self.registration.scope).href, { cache: "reload" });
  const indexResponse = await fetch(indexRequest);
  if (!indexResponse.ok) throw new Error(`HTTP ${indexResponse.status} ${indexRequest.url}`);
  for (const url of [...IOS_INDEX_URLS, ...IOS_ROOT_URLS]) {
    await cache.put(url, indexResponse.clone());
  }
}

async function cacheOfflineFallback(cache) {
  const fallback = offlineFallbackResponse(200);
  await cache.put("/offline-fallback.html", fallback.clone());
  await cache.put("./offline-fallback.html", fallback.clone());
}

async function cachedNavigationFallback(cache, request) {
  const direct = await cache.match(request, { ignoreSearch: true });
  if (direct) return direct;
  for (const url of NAVIGATION_FALLBACK_URLS) {
    const cached = await cache.match(url, { ignoreSearch: true });
    if (cached) return cached;
  }
  return null;
}

async function handleNavigationRequest(event) {
  const { request } = event;
  const cache = await caches.open(APP_SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    return await cachedNavigationFallback(cache, request) || offlineFallbackResponse();
  }
}

async function networkFirst(request) {
  const cache = await caches.open(APP_SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (isNavigationRequest(request)) {
      return await cachedNavigationFallback(cache, request) || offlineFallbackResponse();
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(APP_SHELL_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await self.skipWaiting();
    const cache = await caches.open(APP_SHELL_CACHE);
    await cacheOfflineFallback(cache);
    try {
      await cacheIosStartUrls(cache);
    } catch (error) {
      console.error("[SW] start URL precache failed", error);
    }
    for (const url of APP_SHELL_URLS) {
      try {
        await cacheShellUrl(cache, url);
      } catch (error) {
        const required = REQUIRED_APP_SHELL_URLS.has(url);
        const level = required ? "error" : "warn";
        console[level](`[SW] precache failed (${required ? "required" : "optional"})`, url, error);
      }
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.disable();
    }
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith("tekstura-offline-shell-") && key !== APP_SHELL_CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || isSupabaseRequest(url) || !isLocalRequest(url) || isExcludedLocalPath(url)) {
    return;
  }

  if (!LOCAL_CACHEABLE_DESTINATIONS.has(request.destination) && !isNavigationRequest(request)) {
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(handleNavigationRequest(event));
    return;
  }

  if (request.destination === "script" || request.destination === "style") {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (CACHE_FIRST_DESTINATIONS.has(request.destination)) {
    event.respondWith(cacheFirst(request));
  }
});
