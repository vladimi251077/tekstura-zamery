const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const origin = "https://zamery.test";
const serviceWorkerSource = fs.readFileSync(path.resolve(__dirname, "../service-worker.js"), "utf8");

function createRequest(pathname, {
  mode = "navigate",
  destination = "document",
  accept = "text/html",
} = {}) {
  return {
    url: new URL(pathname, origin).href,
    method: "GET",
    mode,
    destination,
    headers: new Headers({ accept }),
  };
}

function cacheKey(request, ignoreSearch = false) {
  const url = new URL(typeof request === "string" ? request : request.url, `${origin}/`);
  if (ignoreSearch) url.search = "";
  return url.href;
}

function createHarness(fetchImplementation) {
  const listeners = new Map();
  const entries = new Map([
    [
      `${origin}/index.html`,
      new Response('<!doctype html><title>Tekstura cached app shell</title><div id="app"></div>', {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-Tekstura-Test-Fallback": "index.html",
        },
      }),
    ],
  ]);
  const cache = {
    async match(request, options = {}) {
      return entries.get(cacheKey(request, options.ignoreSearch))?.clone() || null;
    },
    async put(request, response) {
      entries.set(cacheKey(request), response.clone());
    },
  };
  const sandbox = {
    URL,
    Request,
    Response,
    Headers,
    console,
    fetch: fetchImplementation,
    caches: {
      async open() { return cache; },
      async keys() { return []; },
      async delete() { return true; },
    },
    self: {
      location: { origin },
      registration: {
        scope: `${origin}/`,
        navigationPreload: { async disable() {} },
      },
      clients: { async claim() {} },
      async skipWaiting() {},
      addEventListener(type, listener) { listeners.set(type, listener); },
    },
  };

  vm.runInNewContext(serviceWorkerSource, sandbox);

  async function dispatchFetch(request) {
    let responsePromise;
    listeners.get("fetch")({
      request,
      respondWith(value) { responsePromise = Promise.resolve(value); },
    });
    return responsePromise ? await responsePromise : null;
  }

  return { dispatchFetch, entries };
}

test("uncached same-origin navigation falls back to HTTP 200 app shell on a network exception", async () => {
  const { dispatchFetch } = createHarness(async () => {
    throw new TypeError("physical network is unavailable");
  });

  const response = await dispatchFetch(createRequest("/uncached-offline-deep-link"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Tekstura-Test-Fallback"), "index.html");
  assert.match(await response.text(), /Tekstura cached app shell/);
});

test("uncached same-origin navigation falls back to HTTP 200 app shell on network 404", async () => {
  const { dispatchFetch } = createHarness(async () => new Response("server 404", {
    status: 404,
    headers: { "Content-Type": "text/plain" },
  }));

  const response = await dispatchFetch(createRequest("/uncached-offline-deep-link"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Tekstura-Test-Fallback"), "index.html");
  assert.match(await response.text(), /id="app"/);
});

test("successful navigation stays network-first and is cached", async () => {
  const request = createRequest("/existing-page");
  const { dispatchFetch, entries } = createHarness(async () => new Response("network page", {
    status: 200,
    headers: { "Content-Type": "text/html" },
  }));

  const response = await dispatchFetch(request);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "network page");
  assert.equal(entries.has(request.url), true);
});

test("Supabase, local API, admin, production, constructor, and direct static navigation stay excluded", async () => {
  let fetchCalls = 0;
  const { dispatchFetch } = createHarness(async () => {
    fetchCalls += 1;
    return new Response("unexpected", { status: 404 });
  });

  const excluded = [
    createRequest("https://project.supabase.co/rest/v1/clients"),
    createRequest("/api/health"),
    createRequest("/rest/v1/clients"),
    createRequest("/admin/audit"),
    createRequest("/production.html"),
    createRequest("/svg-constructor/embedded.html"),
    createRequest("/missing.js"),
  ];

  for (const request of excluded) {
    assert.equal(await dispatchFetch(request), null, `request unexpectedly received fallback: ${request.url}`);
  }
  assert.equal(fetchCalls, 0);
});

test("ordinary API and static asset 404 responses never become HTML fallbacks", async () => {
  const { dispatchFetch } = createHarness(async (request) => new Response(`missing ${request.url}`, {
    status: 404,
    headers: { "Content-Type": "text/javascript" },
  }));

  const apiResponse = await dispatchFetch(createRequest("/api/data", {
    mode: "cors",
    destination: "",
    accept: "application/json",
  }));
  assert.equal(apiResponse, null);

  const assetResponse = await dispatchFetch(createRequest("/missing.js", {
    mode: "cors",
    destination: "script",
    accept: "*/*",
  }));
  assert.equal(assetResponse.status, 404);
  assert.equal(assetResponse.headers.get("Content-Type"), "text/javascript");
  assert.doesNotMatch(await assetResponse.text(), /Tekstura cached app shell/);
});
