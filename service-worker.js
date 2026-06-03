const CACHE_VERSION = "tekstura-offline-shell-v19";
const APP_SHELL_CACHE = `${CACHE_VERSION}-app-shell`;

const APP_SHELL_URLS = [
  "/",
  "/index.html",
  "./",
  "./index.html",
  "/offline-test.html",
  "./offline-test.html",
  "/styles.css?v=20260518-trash-bulk",
  "./styles.css?v=20260518-trash-bulk",
  "/app.js?v=20260603-ios-offline-hotfix",
  "./app.js?v=20260603-ios-offline-hotfix",
  "/offline-db.js?v=20260517-v4",
  "./offline-db.js?v=20260517-v4",
  "/photo-preview.js?v=20260515-v14",
  "/details-enhance.js?v=20260515-v14",
  "/scheme-sketch.js?v=20260506-disabled",
  "/drawing-bridge.js?v=20260517-v15",
  "/manifest.webmanifest",
  "./manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

const REQUIRED_APP_SHELL_URLS = new Set([
  "/",
  "/index.html",
  "./",
  "./index.html",
  "/offline-test.html",
  "./offline-test.html",
  "/styles.css?v=20260518-trash-bulk",
  "./styles.css?v=20260518-trash-bulk",
  "/app.js?v=20260603-ios-offline-hotfix",
  "./app.js?v=20260603-ios-offline-hotfix",
  "/offline-db.js?v=20260517-v4",
  "./offline-db.js?v=20260517-v4",
  "/manifest.webmanifest",
  "./manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
]);

const NAVIGATION_FALLBACK_URLS = [
  "/",
  "/index.html",
  "./",
  "./index.html",
  new URL("/", self.location.origin).href,
  new URL("/index.html", self.location.origin).href,
];

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

function offlineFallbackResponse() {
  return new Response(`<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tekstura Замеры — офлайн</title>
  </head>
  <body>
    <h1>Офлайн-кэш ещё не подготовлен</h1>
    <p>Откройте приложение с интернетом, нажмите «Обновить» 5 раз и проверьте офлайн-доступ.</p>
  </body>
</html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
    status: 503,
  });
}

async function cacheShellUrl(cache, url) {
  const request = new Request(url, { cache: "reload" });
  const response = await fetch(request);
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  await cache.put(request, response.clone());
  await cache.put(url, response.clone());
  return response;
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
    for (const url of APP_SHELL_URLS) {
      try {
        await cacheShellUrl(cache, url);
      } catch (error) {
        const required = REQUIRED_APP_SHELL_URLS.has(url);
        const level = required ? "error" : "warn";
        console[level](`[SW] precache failed (${required ? "required" : "optional"})`, url, error);
        if (required) throw error;
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
