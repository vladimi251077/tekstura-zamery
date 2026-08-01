const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");

test("the page uses one shared Supabase client and never reparses credentials from app.js", () => {
  const appSource = fs.readFileSync(path.join(repositoryRoot, "app.js"), "utf8");
  const previewSource = fs.readFileSync(path.join(repositoryRoot, "photo-preview.js"), "utf8");
  const activeSources = `${appSource}\n${previewSource}`;
  const violations = [];

  const clientCreationCount = (activeSources.match(/window\.supabase\.createClient\s*\(/g) || []).length;
  if (clientCreationCount !== 1) violations.push(`expected one createClient call, found ${clientCreationCount}`);
  if (/fetch\s*\(\s*["']\.\/app\.js/.test(previewSource)) violations.push("photo-preview.js fetches app.js at runtime");
  if (/SUPABASE_(?:URL|ANON_KEY)/.test(previewSource)) violations.push("photo-preview.js reparses Supabase configuration");

  assert.deepEqual(violations, []);
});
