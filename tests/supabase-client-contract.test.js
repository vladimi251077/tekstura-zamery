const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repositoryRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

test("the page uses one shared Supabase client and never reparses app.js", () => {
  const appSource = read("app.js");
  const previewSource = read("photo-preview.js");
  const activeSources = `${appSource}\n${previewSource}`;
  const violations = [];

  const clientCreationCount = (activeSources.match(/window\.supabase(?:\?\.)?\.createClient\s*\(/g) || []).length;
  if (clientCreationCount !== 1) violations.push(`expected one createClient call, found ${clientCreationCount}`);
  if (/fetch\s*\(\s*["']\.\/app\.js/.test(previewSource)) violations.push("photo-preview.js fetches app.js at runtime");
  if (/SUPABASE_(?:URL|ANON_KEY)/.test(previewSource)) violations.push("photo-preview.js reparses Supabase configuration");
  if (!/window\.TeksturaSupabaseClient\s*=\s*supabaseClient/.test(appSource)) violations.push("app.js does not publish its client");
  if (!/window\.TeksturaSupabaseClient\s*\|\|\s*null/.test(previewSource)) violations.push("photo-preview.js does not consume the shared client");

  assert.deepEqual(violations, []);
});

test("app.js loads before photo-preview.js", () => {
  const html = read("index.html");
  const appIndex = html.indexOf('src="./app.js');
  const previewIndex = html.indexOf('src="./photo-preview.js');

  assert.notEqual(appIndex, -1, "app.js script tag is missing");
  assert.notEqual(previewIndex, -1, "photo-preview.js script tag is missing");
  assert.ok(appIndex < previewIndex, "photo-preview.js loads before app.js publishes the client");
});

test("photo preview keeps the exact client instance published by app.js", () => {
  const previewSource = read("photo-preview.js");
  const sharedClient = { storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) } };
  const listeners = new Map();
  const sandbox = {
    window: {
      TeksturaSupabaseClient: sharedClient,
      addEventListener: (name, callback) => listeners.set(name, callback),
    },
    document: {
      addEventListener: (name, callback) => listeners.set(name, callback),
      querySelectorAll: () => [],
    },
    MutationObserver: class { observe() {} },
    setInterval: () => 1,
    URL,
    console,
  };

  vm.runInNewContext(previewSource, sandbox);
  assert.equal(typeof listeners.get("load"), "function");
  assert.equal(sandbox.window.TeksturaSupabaseClient, sharedClient);
});
