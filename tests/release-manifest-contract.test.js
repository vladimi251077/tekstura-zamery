const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repositoryRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function requiredAppShellPaths() {
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
    `${source.slice(0, declarationsEnd)}\n` +
      "globalThis.__requiredAppShellUrls = Array.from(REQUIRED_APP_SHELL_URLS);",
    sandbox,
  );

  return [...new Set(sandbox.__requiredAppShellUrls
    .map((url) => new URL(url, "https://zamery.test/").pathname)
    .map((pathname) => (pathname === "/" ? "index.html" : pathname.replace(/^\//, ""))))]
    .sort();
}

test("production release manifest is sorted, safe, complete, and version controlled", () => {
  const manifestPath = path.join(repositoryRoot, "deploy/runtime-files.txt");
  assert.equal(fs.existsSync(manifestPath), true, "deploy/runtime-files.txt is missing");

  const entries = read("deploy/runtime-files.txt").trim().split("\n");
  assert.deepEqual(entries, [...entries].sort(), "release manifest must remain sorted");
  assert.equal(new Set(entries).size, entries.length, "release manifest contains duplicates");
  assert.equal(entries.includes("offline-fallback.html"), true, "offline fallback is absent from the production release manifest");

  for (const entry of entries) {
    assert.doesNotMatch(entry, /^(?:\/|\.\.\/)|\/\.\.(?:\/|$)/, `unsafe release path: ${entry}`);
    assert.equal(fs.existsSync(path.join(repositoryRoot, entry)), true, `release file is missing: ${entry}`);
  }

  const missingRequired = requiredAppShellPaths().filter((entry) => !entries.includes(entry));
  assert.deepEqual(missingRequired, [], `required app-shell files are absent from the release manifest: ${missingRequired.join(", ")}`);
});
