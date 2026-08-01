const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repositoryRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

test("every required service-worker app-shell URL exists in the release source", () => {
  const source = read("service-worker.js");
  const declarationsEnd = source.indexOf('self.addEventListener("install"');
  assert.notEqual(declarationsEnd, -1, "service-worker install handler was not found");

  const sandbox = {
    URL,
    Request,
    Response,
    self: {
      location: { origin: "https://zamery.test" },
      registration: { scope: "https://zamery.test/" },
    },
  };

  vm.runInNewContext(
    `${source.slice(0, declarationsEnd)}\n`+
      "globalThis.__requiredAppShellUrls = Array.from(REQUIRED_APP_SHELL_URLS);",
    sandbox,
  );

  const missing = [...new Set(sandbox.__requiredAppShellUrls
    .map((url) => new URL(url, "https://zamery.test/").pathname)
    .map((pathname) => (pathname === "/" ? "index.html" : pathname.replace(/^\//, "")))
    .filter((pathname) => !fs.existsSync(path.join(repositoryRoot, pathname))))]
    .sort();

  assert.deepEqual(missing, [], `required app-shell files are absent: ${missing.join(", ")}`);
});

test("service worker and diagnostics agree on the upgraded cache version", () => {
  const serviceWorkerSource = read("service-worker.js");
  const appSource = read("app.js");
  const serviceWorkerVersion = serviceWorkerSource.match(/const CACHE_VERSION = "([^"]+)"/)?.[1];
  const diagnosticsCache = appSource.match(/const OFFLINE_SHELL_CACHE_NAME = "([^"]+)"/)?.[1];

  assert.equal(serviceWorkerVersion, "tekstura-offline-shell-v38");
  assert.equal(diagnosticsCache, `${serviceWorkerVersion}-app-shell`);
});

test("offline fallback is fetched from source and cache cleanup cannot touch IndexedDB", () => {
  const serviceWorkerSource = read("service-worker.js");
  const fallbackSource = read("offline-fallback.html");

  assert.match(fallbackSource, /Нет подключения к интернету/);
  assert.match(fallbackSource, /Не очищайте данные сайта/);
  assert.doesNotMatch(serviceWorkerSource, /OFFLINE_FALLBACK_URLS\.includes\(url\)/);
  assert.doesNotMatch(serviceWorkerSource, /indexedDB|deleteDatabase/);
  assert.match(serviceWorkerSource, /fetch\(request\)/);
  assert.match(serviceWorkerSource, /caches\.delete\(key\)/);
});
