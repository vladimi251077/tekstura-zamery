const SHELL_CACHE = "tekstura-zamery-shell-v1";

const APP_SHELL_URLS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./offline-db.js",
  "./drawing-bridge.js",
  "./photo-preview.js",
  "./details-enhance.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./scheme-sketch.js",
];

function isSupabaseRequest(url) {
  return url.hostname.endsWith(".supabase.co") || url.hostname.includes("supabase");
}

function isNavigationRequest(request) {
  return request.mode === "navigate" || (request.method === "GET" && request.headers.get("accept")?.includes("text/html"));
}

function isSameOriginStaticRequest(url, request) {
  if (url.origin !== self.location.origin || request.method !== "GET") return false;
  return ["script", "style", "image", "font", "manifest"].includes(request.destination)
    || /\.(?:css|js|png|jpg|jpeg|gif|svg|webp|ico|woff2?|webmanifest)$/i.test(url.pathname);
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
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(() => caches.match("./index.html", { cacheName: SHELL_CACHE }))
    );
    return;
  }

  if (isSameOriginStaticRequest(url, request)) {
    event.respondWith(
      caches.match(request, { cacheName: SHELL_CACHE, ignoreSearch: true })
        .then((cachedResponse) => cachedResponse || fetch(request))
    );
  }
});
