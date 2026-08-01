const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repositoryRoot = path.resolve(__dirname, "..");

test("every required service-worker app-shell URL exists in the release source", () => {
  const source = fs.readFileSync(path.join(repositoryRoot, "service-worker.js"), "utf8");
  const declarationsEnd = source.indexOf('self.addEventListener("install"');
  assert.notEqual(declarationsEnd, -1, "service-worker install handler was not found");

  const sandbox = {
    URL,
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
