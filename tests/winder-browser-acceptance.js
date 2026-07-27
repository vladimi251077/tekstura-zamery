"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { SVG_VARIANT_FIXTURES } = require("./fixtures/svg-variants.js");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.resolve(process.argv[2] || path.join(ROOT, "artifacts", "winder-radial-geometry"));
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
];
const PHONE_VIEWPORTS = VIEWPORTS.slice(0, 2);
const COUNTS = [3, 4, 5];
const WINDERS = SVG_VARIANT_FIXTURES.filter((fixture) => fixture.type.includes("winder"));

function instrumentDrawingBridge() {
  const source = process.env.WINDER_DRAWING_REF
    ? execFileSync("git", ["show", `${process.env.WINDER_DRAWING_REF}:drawing-bridge.js`], { cwd: ROOT, encoding: "utf8" })
    : fs.readFileSync(path.join(ROOT, "drawing-bridge.js"), "utf8");
  const closeIndex = source.lastIndexOf("\n})();");
  assert.notEqual(closeIndex, -1, "drawing-bridge.js IIFE terminator changed");
  const hook = `
  window.__WinderAcceptance = {
    setState(project) {
      projectState = mergeDeep(DEFAULT_PROJECT, project || {});
      finishState = mergeDeep(DEFAULT_FINISH, {});
      loadedKey = "Winder browser acceptance";
      lastSvg = "";
    },
    buildGeometry,
    injectStyle,
    renderSvg,
  };
`;
  return `${source.slice(0, closeIndex)}\n${hook}${source.slice(closeIndex)}`;
}

function pageMarkup() {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; font-family: system-ui, sans-serif; background: #e8eef6; }
    #measurement-form, [data-panel="sizes"] { display: none; }
    main { width: 100vw; min-height: 100vh; padding: 8px; }
    .evidence { height: calc(100vh - 16px); display: flex; flex-direction: column; overflow: hidden; background: white; border: 1px solid #b7c5d8; border-radius: 10px; }
    .evidence h1 { flex: 0 0 auto; margin: 0; padding: 8px 12px; font-size: 15px; color: #12213a; background: #f5f8fc; border-bottom: 1px solid #d7e0ec; }
    .editor-svg, .production-svg { flex: 1 1 auto; min-height: 0; display: flex; align-items: stretch; justify-content: stretch; }
    .editor-svg svg, .production-svg svg { width: 100%; height: 100%; min-height: 0; }
    .production-svg { display: none; }
    @media print {
      @page { size: landscape; margin: 8mm; }
      body { background: white; }
      main { padding: 0; }
      .evidence { height: 180mm; break-after: page; border: 0; }
      .evidence h1 { display: none; }
      .editor-svg { display: none; }
      .production-svg { display: flex; }
    }
  </style>
</head>
<body>
  <form id="measurement-form" class="hidden"></form>
  <section data-panel="sizes" class="hidden"></section>
  <div id="form-title">Winder browser acceptance</div>
  <main><article class="evidence"><h1></h1><div class="editor-svg"></div><div class="production-svg"></div></article></main>
</body>
</html>`;
}

async function configurePage(page, fixture, count) {
  await page.evaluate(({ fields, project, type, count }) => {
    const form = document.querySelector("#measurement-form");
    form.replaceChildren();
    const values = {
      ...fields,
      winder_steps_count: String(count),
      drawing_project_json: JSON.stringify(project),
      drawing_svg: "",
      finish_dimensions_json: "{}",
    };
    Object.entries(values).forEach(([name, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = String(value);
      form.append(input);
    });
    window.__WinderAcceptance.setState(project);
    const geometry = window.__WinderAcceptance.buildGeometry();
    const svg = window.__WinderAcceptance.renderSvg(geometry);
    document.querySelector(".evidence h1").textContent = `${type} · ZN=${count}`;
    document.querySelector(".editor-svg").innerHTML = svg;
    document.querySelector(".production-svg").innerHTML = svg;
    window.__CURRENT_WINDER_GEOMETRY = geometry;
  }, { fields: fixture.fields, project: fixture.project, type: fixture.type, count });
}

async function assertBrowserGeometry(page, fixture, viewport, count) {
  const result = await page.evaluate(() => {
    const geometry = window.__CURRENT_WINDER_GEOMETRY;
    const turn = geometry.rects.find((rect) => rect.id === "turn");
    const steps = geometry.winders.filter((item) => item.kind === "step");
    const center = { x: turn.x + turn.w / 2, y: turn.y + turn.h / 2 };
    const origins = steps.map((step) => step.points[0]);
    const editor = document.querySelector(".editor-svg svg");
    const labelsInside = [...document.querySelectorAll(".editor-svg .winder-step")].every((polygon, index) => {
      const label = editor.querySelector(`[data-winder-step="${index + 1}"]`) || polygon.parentElement.querySelector(".step-no");
      return polygon.isPointInFill(new DOMPoint(Number(label.getAttribute("x")), Number(label.getAttribute("y")) - 4));
    });
    const production = document.querySelector(".production-svg svg");
    const editorPolygons = [...editor.querySelectorAll(".winder-step")].map((node) => node.getAttribute("points"));
    const productionPolygons = [...production.querySelectorAll(".winder-step")].map((node) => node.getAttribute("points"));
    return {
      count: steps.length,
      centerMatches: origins.every((point) => Math.abs(point.x - center.x) < 0.001 && Math.abs(point.y - center.y) < 0.001),
      oneOrigin: new Set(origins.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`)).size === 1,
      labelsInside,
      viewBox: editor.getAttribute("viewBox"),
      parity: JSON.stringify(editorPolygons) === JSON.stringify(productionPolygons)
        && editor.getAttribute("viewBox") === production.getAttribute("viewBox"),
      finite: !/\\b(?:NaN|Infinity|undefined|null)\\b/.test(editor.outerHTML),
    };
  });
  const expectedViewBox = viewport.width <= 430 ? "0 0 820 1100" : viewport.width <= 1000 ? "0 0 960 780" : "0 0 1100 760";
  assert.equal(result.count, count, `${fixture.type} ZN=${count} ${viewport.width}x${viewport.height} tread count`);
  assert.equal(result.centerMatches, true, `${fixture.type} ${viewport.width}x${viewport.height} center`);
  assert.equal(result.oneOrigin, true, `${fixture.type} ${viewport.width}x${viewport.height} common origin`);
  assert.equal(result.labelsInside, true, `${fixture.type} ${viewport.width}x${viewport.height} labels`);
  assert.equal(result.viewBox, expectedViewBox, `${fixture.type} ${viewport.width}x${viewport.height} viewBox`);
  assert.equal(result.parity, true, `${fixture.type} ${viewport.width}x${viewport.height} editor/production parity`);
  assert.equal(result.finite, true, `${fixture.type} ${viewport.width}x${viewport.height} finite SVG`);
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  });
  const page = await browser.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.setContent(pageMarkup(), { waitUntil: "load" });
  await page.addScriptTag({ content: instrumentDrawingBridge() });
  await page.evaluate(() => window.__WinderAcceptance.injectStyle());
  assert.equal(await page.locator("body").innerText().then((text) => text.trim().length > 0), true, "acceptance page must not be blank");
  assert.equal(await page.locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay").count(), 0, "no browser error overlay");

  const report = [];
  for (const fixture of WINDERS) {
    for (const count of COUNTS) {
      const viewports = count === 3 ? VIEWPORTS : PHONE_VIEWPORTS;
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await configurePage(page, fixture, count);
        await assertBrowserGeometry(page, fixture, viewport, count);
        const filename = `${fixture.type}-zn${count}-${viewport.width}x${viewport.height}.png`;
        await page.screenshot({ path: path.join(OUTPUT_DIR, filename), fullPage: false });
        report.push({ fixture: fixture.type, count, viewport: `${viewport.width}x${viewport.height}`, screenshot: filename, status: "PASS" });
      }
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const fixture of WINDERS) {
    await configurePage(page, fixture, 3);
    await page.pdf({
      path: path.join(OUTPUT_DIR, `${fixture.type}-zn3-print.pdf`),
      format: "A4",
      landscape: true,
      printBackground: true,
      preferCSSPageSize: false,
    });
  }
  fs.writeFileSync(path.join(OUTPUT_DIR, "browser-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  assert.deepEqual(browserErrors, [], "Chromium console and page errors");
  await browser.close();
  process.stdout.write(`Chromium winder acceptance PASS: ${report.length} viewport/count checks; ${WINDERS.length} ZN=3 print PDFs\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
