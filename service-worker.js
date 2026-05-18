const CACHE_VERSION = "tekstura-offline-shell-v6";
const APP_SHELL_CACHE = `${CACHE_VERSION}-app-shell`;

const APP_SHELL_URLS = [
  "./",
  "./index.html",
  "./styles.css?v=20260517-offline-drafts",
  "./app.js?v=20260517-v31",
  "./offline-db.js?v=20260517-v4",
  "./photo-preview.js?v=20260515-v14",
  "./details-enhance.js?v=20260515-v14",
  "./scheme-sketch.js?v=20260506-disabled",
  "./drawing-bridge.js?v=20260517-v15",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
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

function isHtmlRequest(request) {
  return request.mode === "navigate" || request.destination === "document" || request.headers.get("accept")?.includes("text/html");
}

async function networkFirst(request) {
  const cache = await caches.open(APP_SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (isHtmlRequest(request)) return cache.match("./index.html");
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(APP_SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("tekstura-offline-shell-") && key !== APP_SHELL_CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || isSupabaseRequest(url) || !isLocalRequest(url) || isExcludedLocalPath(url)) {
    return;
  }

  if (!LOCAL_CACHEABLE_DESTINATIONS.has(request.destination) && !isHtmlRequest(request)) {
    return;
  }

  if (isHtmlRequest(request) || request.destination === "script" || request.destination === "style") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (CACHE_FIRST_DESTINATIONS.has(request.destination)) {
    event.respondWith(cacheFirst(request));
  }
});
