const SHELL_CACHE = "tekstura-zamery-shell-v1";

const APP_SHELL_URLS = [
  "./",
  "./index.html",
  "./styles.css?v=20260517-pwa-share",
  "./app.js?v=20260517-v26-offline-shell",
  "./offline-db.js?v=20260517-v1",
  "./drawing-bridge.js?v=20260517-v15",
  "./photo-preview.js?v=20260515-v14",
  "./details-enhance.js?v=20260515-v14",
  "./scheme-sketch.js?v=20260506-disabled",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
];

function isSupabaseRequest(url) {
  return url.hostname === "supabase.co" || url.hostname.endsWith(".supabase.co");
}

function isNavigationRequest(request) {
  return request.mode === "navigate" || (request.method === "GET" && request.headers.get("accept")?.includes("text/html"));
}

function isScriptOrStyleRequest(url, request) {
  if (url.origin !== self.location.origin || request.method !== "GET") return false;
  return ["script", "style"].includes(request.destination) || /\.(?:css|js)$/i.test(url.pathname);
}

function isCacheFirstShellAsset(url, request) {
  if (url.origin !== self.location.origin || request.method !== "GET") return false;
  return ["image", "manifest"].includes(request.destination)
    || /\.(?:png|jpg|jpeg|gif|svg|webp|ico|webmanifest)$/i.test(url.pathname);
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;
    throw error;
  }
}

async function navigationNetworkFirst(request) {
  try {
    return await networkFirst(request);
  } catch (error) {
    const cachedIndex = await caches.match("./index.html", { cacheName: SHELL_CACHE });
    if (cachedIndex) return cachedIndex;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) return cachedResponse;

  const response = await fetch(request);
  if (response && response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== SHELL_CACHE)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (isSupabaseRequest(url)) return;
  if (request.method !== "GET") return;

  if (isNavigationRequest(request)) {
    event.respondWith(navigationNetworkFirst(request));
    return;
  }

  if (isScriptOrStyleRequest(url, request)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isCacheFirstShellAsset(url, request)) {
    event.respondWith(cacheFirst(request));
  }
});
