"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { SVG_VARIANT_FIXTURES } = require("./fixtures/svg-variants.js");

const ROOT = path.resolve(__dirname, "..");
const DRAWING_BRIDGE_PATH = path.join(ROOT, "drawing-bridge.js");
const DESKTOP_VIEWBOX = "0 0 1100 760";
const TABLET_VIEWBOX = "0 0 960 780";
const PHONE_VIEWBOX = "0 0 820 1100";
const FORBIDDEN_OUTPUT = /\b(?:NaN|Infinity|undefined|null)\b/;
const EXPECTED_DIMENSION_VALUE = Object.freeze({
  L: "3320",
  W: "1180",
  H: "2860",
  T: "220",
  M1: "2750",
  B1: "980",
  N1: "11",
  M2: "2250",
  B2: "920",
  N2: "9",
  ZL: "1120",
  ZW: "1040",
  ZN: "3 шт",
});

function inputRecord(name, value = "") {
  return {
    name,
    value: String(value ?? ""),
    type: "hidden",
    tagName: "INPUT",
    checked: false,
    dispatchEvent() {},
  };
}

function createDrawingHarness() {
  const fields = new Map();
  const form = {
    classList: { contains: () => false },
    querySelector(selector) {
      const match = /^\[name="([^"]+)"\]$/.exec(selector);
      return match ? fields.get(match[1]) || null : null;
    },
    appendChild(input) {
      fields.set(input.name, input);
      return input;
    },
  };
  let viewportWidth = 1200;

  const document = {
    head: { appendChild() {} },
    activeElement: null,
    addEventListener() {},
    querySelector(selector) {
      if (selector === "#measurement-form") return form;
      if (selector === "#form-title") return { textContent: "SVG regression fixture" };
      if (selector === '[data-panel="sizes"]') return { classList: { contains: () => false } };
      return null;
    },
    querySelectorAll() {
      return [];
    },
    createElement(tagName) {
      return inputRecord("", "");
    },
  };
  const window = {
    TeksturaOptionLists: null,
    addEventListener() {},
    matchMedia(query) {
      const max = /max-width:\s*(\d+)px/.exec(query);
      return { matches: max ? viewportWidth <= Number(max[1]) : false };
    },
  };
  const context = vm.createContext({
    window,
    document,
    localStorage: { getItem: () => null, setItem() {} },
    CSS: { escape: (value) => String(value) },
    Event: class Event {
      constructor(type, options = {}) {
        this.type = type;
        this.bubbles = Boolean(options.bubbles);
      }
    },
    clearTimeout() {},
    setTimeout() {
      return 1;
    },
    console,
  });

  const original = fs.readFileSync(DRAWING_BRIDGE_PATH, "utf8");
  const testHook = `
  window.__TeksturaSvgCharacterization = {
    VARIANTS,
    DEFAULT_PROJECT,
    DEFAULT_FINISH,
    FIELD_META,
    setState(project, finish = {}) {
      projectState = mergeDeep(DEFAULT_PROJECT, project || {});
      finishState = mergeDeep(DEFAULT_FINISH, finish || {});
      loadedKey = "SVG regression fixture";
      lastSvg = "";
    },
    clearState() {
      projectState = null;
      finishState = null;
      loadedKey = "";
      lastSvg = "";
      fieldDrafts.clear();
    },
    buildGeometry,
    collectParams,
    currentVariantKeyFromForm,
    drawingViewport,
    fitTransform,
    inferVariantKeyFromForm,
    refreshState,
    renderSvg,
    saveState,
    visibleParams,
    getProject: () => projectState,
  };
`;
  const closeIndex = original.lastIndexOf("\n})();");
  assert.notEqual(closeIndex, -1, "drawing-bridge.js IIFE terminator changed");
  const instrumented = `${original.slice(0, closeIndex)}\n${testHook}${original.slice(closeIndex)}`;
  new vm.Script(instrumented, { filename: "drawing-bridge.js" }).runInContext(context);

  function resetFields(values = {}) {
    fields.clear();
    Object.entries(values).forEach(([name, value]) => fields.set(name, inputRecord(name, value)));
  }

  return {
    hook: window.__TeksturaSvgCharacterization,
    resetFields,
    field(name) {
      return fields.get(name) || null;
    },
    setField(name, value) {
      const existing = fields.get(name) || inputRecord(name);
      existing.value = String(value);
      fields.set(name, existing);
    },
    setViewport(width) {
      viewportWidth = width;
    },
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function configureFixture(harness, fixture, viewportWidth = 1200) {
  const project = clone(fixture.project);
  const fields = {
    ...fixture.fields,
    drawing_project_json: JSON.stringify(project),
    drawing_svg: "",
    finish_dimensions_json: "{}",
  };
  harness.resetFields(fields);
  harness.setViewport(viewportWidth);
  harness.hook.setState(project);
  const geometry = clone(harness.hook.buildGeometry());
  const svg = harness.hook.renderSvg(geometry);
  return { geometry, project, svg };
}

function classCount(svg, className) {
  return [...svg.matchAll(/\bclass="([^"]*)"/g)]
    .filter((match) => match[1].split(/\s+/).includes(className))
    .length;
}

function dimensionMap(svg) {
  const result = new Map();
  const groups = svg.matchAll(/<g class="dimension[^"]*" data-param="([^"]+)">([\s\S]*?)<\/g>/g);
  for (const [, id, body] of groups) {
    const text = /<text[^>]*>([\s\S]*?)<\/text>/.exec(body)?.[1] || "";
    result.set(id, text);
  }
  return result;
}

function viewBox(svg) {
  return /<svg[^>]*\bviewBox="([^"]+)"/.exec(svg)?.[1] || "";
}

function rounded(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function roundedPoint(point) {
  return { x: rounded(point.x), y: rounded(point.y) };
}

function normalizedGeometry(geometry) {
  return {
    title: geometry.title,
    outer: {
      x: rounded(geometry.outer.x),
      y: rounded(geometry.outer.y),
      w: rounded(geometry.outer.w),
      h: rounded(geometry.outer.h),
    },
    rects: geometry.rects.map((rect) => ({
      id: rect.id,
      kind: rect.kind,
      zone: rect.zone,
      x: rounded(rect.x),
      y: rounded(rect.y),
      w: rounded(rect.w),
      h: rounded(rect.h),
    })),
    lines: geometry.lines.map((line) => ({
      kind: line.kind,
      start: roundedPoint(line.start),
      end: roundedPoint(line.end),
    })),
    dimensions: geometry.dimensions.map((dimension) => ({
      id: dimension.id,
      label: dimension.label,
      value: dimension.value,
      side: dimension.side,
      start: roundedPoint(dimension.start),
      end: roundedPoint(dimension.end),
      labelOnly: Boolean(dimension.labelOnly),
    })),
    winders: geometry.winders.map((winder) => ({
      id: winder.id,
      kind: winder.kind,
      number: winder.number || 0,
      points: winder.points.map(roundedPoint),
    })),
    route: geometry.route.map(roundedPoint),
    stepLabels: geometry.stepLabels,
  };
}

function geometryHash(geometry) {
  return crypto.createHash("sha256").update(JSON.stringify(normalizedGeometry(geometry))).digest("hex").slice(0, 16);
}

function assertFiniteGeometry(value, pathLabel = "geometry") {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${pathLabel} must be finite`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertFiniteGeometry(item, `${pathLabel}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => assertFiniteGeometry(item, `${pathLabel}.${key}`));
  }
}

function assertSvgCoordinatesInBounds(svg) {
  const [minX, minY, width, height] = viewBox(svg).split(/\s+/).map(Number);
  assert.ok([minX, minY, width, height].every(Number.isFinite), "viewBox values must be finite");
  const xAttrs = [...svg.matchAll(/\b(?:x|x1|x2|cx|width)="(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)"/gi)].map((match) => Number(match[1]));
  const yAttrs = [...svg.matchAll(/\b(?:y|y1|y2|cy|height)="(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)"/gi)].map((match) => Number(match[1]));
  const pointLists = [...svg.matchAll(/\bpoints="([^"]+)"/g)].flatMap((match) => match[1].trim().split(/\s+/).map((pair) => pair.split(",").map(Number)));
  const pathNumbers = [...svg.matchAll(/\bd="([^"]+)"/g)].flatMap((match) => [...match[1].matchAll(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)].map((item) => Number(item[0])));

  assert.ok(xAttrs.every(Number.isFinite), "all x/width attributes must be finite");
  assert.ok(yAttrs.every(Number.isFinite), "all y/height attributes must be finite");
  assert.ok(pointLists.flat().every(Number.isFinite), "all polygon coordinates must be finite");
  assert.ok(pathNumbers.every(Number.isFinite), "all path coordinates must be finite");
  assert.ok(xAttrs.every((value) => value >= minX && value <= minX + width), "x coordinates must stay inside viewBox");
  assert.ok(yAttrs.every((value) => value >= minY && value <= minY + height), "y coordinates must stay inside viewBox");
  pointLists.forEach(([x, y]) => {
    assert.ok(x >= minX && x <= minX + width, `polygon x ${x} must stay inside viewBox`);
    assert.ok(y >= minY && y <= minY + height, `polygon y ${y} must stay inside viewBox`);
  });
  for (let index = 0; index < pathNumbers.length; index += 2) {
    const x = pathNumbers[index];
    const y = pathNumbers[index + 1];
    assert.ok(x >= minX && x <= minX + width, `path x ${x} must stay inside viewBox`);
    if (y !== undefined) assert.ok(y >= minY && y <= minY + height, `path y ${y} must stay inside viewBox`);
  }
}

function assertCriticalIdsUnique(svg) {
  for (const id of ["db-arrow", "db-ascent-arrow", "db-tick"]) {
    assert.equal((svg.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, `${id} must be defined once`);
  }
}

function assertOrientation(fixture, geometry) {
  if (!fixture.expected.orientation) return;
  const flight1 = geometry.rects.find((rect) => rect.id === "flight1");
  const flight2 = geometry.rects.find((rect) => rect.id === "flight2");
  assert.ok(flight1 && flight2, `${fixture.type} must contain both flights`);
  if (fixture.expected.orientation === "left") {
    assert.ok(flight1.x < flight2.x, `${fixture.type} flight 1 must start left of flight 2`);
  } else {
    assert.ok(flight1.x > flight2.x, `${fixture.type} flight 1 must start right of flight 2`);
  }
}

test("inventory and form-selection rules cover exactly the 12 protected variants", () => {
  const harness = createDrawingHarness();
  const drawingSource = fs.readFileSync(DRAWING_BRIDGE_PATH, "utf8");
  assert.equal(harness.hook.VARIANTS.length, 12);
  assert.deepEqual(
    clone(harness.hook.VARIANTS.map((variant) => variant.key)),
    SVG_VARIANT_FIXTURES.map((fixture) => fixture.type),
  );

  for (const fixture of SVG_VARIANT_FIXTURES) {
    harness.resetFields(fixture.fields);
    assert.equal(harness.hook.inferVariantKeyFromForm(), fixture.type, `${fixture.type} form selection`);
  }

  assert.match(drawingSource, /\.db-svg \.route\{[^}]*marker-end:url\(#db-arrow\)/);
  assert.match(drawingSource, /\.db-svg \.ascent-line\{[^}]*marker-end:url\(#db-ascent-arrow\)/);
  assert.match(drawingSource, /\.db-svg \.dimension line,[^{]+\{[^}]*marker-start:url\(#db-tick\);marker-end:url\(#db-tick\)/);
});

for (const fixture of SVG_VARIANT_FIXTURES) {
  test(`${fixture.type}: semantic SVG characterization`, () => {
    const harness = createDrawingHarness();
    const { geometry, svg } = configureFixture(harness, fixture);
    const dimensions = dimensionMap(svg);
    const actualHash = geometryHash(geometry);

    assert.equal(harness.hook.currentVariantKeyFromForm(), fixture.type);
    assert.equal(geometry.title, fixture.expected.title);
    assert.equal(viewBox(svg), DESKTOP_VIEWBOX);
    assert.match(svg, /^<svg\b/);
    assert.match(svg, /<\/svg>$/);
    assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.doesNotMatch(svg, FORBIDDEN_OUTPUT);
    assertFiniteGeometry(geometry);
    assertSvgCoordinatesInBounds(svg);
    assertCriticalIdsUnique(svg);

    assert.deepEqual([...dimensions.keys()], fixture.expected.dimensions);
    for (const [id, label] of dimensions) {
      if (fixture.type.startsWith("empty_l")) {
        assert.equal(label, id, `${fixture.type} keeps its intentional label-only ${id} dimension`);
      } else {
        assert.match(label, new RegExp(EXPECTED_DIMENSION_VALUE[id]), `${fixture.type} ${id} value`);
      }
    }
    assert.equal(geometry.rects.length, fixture.expected.rects);
    assert.equal(classCount(svg, "dimension"), fixture.expected.dimensions.length);
    assert.equal(classCount(svg, "dim-ext"), fixture.expected.dimensions.length * 2);
    assert.equal(classCount(svg, "dim-hit"), fixture.expected.dimensions.length);
    assert.equal(classCount(svg, "route") > 0, fixture.expected.route);
    assert.equal(classCount(svg, "winder-step"), fixture.expected.winderSteps);
    assert.equal(geometry.winders.filter((item) => item.kind === "step").length, fixture.expected.winderSteps);
    assert.match(svg, /id="db-arrow"/);
    assert.match(svg, /id="db-ascent-arrow"/);
    assert.match(svg, /id="db-tick"/);

    if (fixture.type === "empty_straight") {
      assert.match(dimensions.get("L"), /3320/);
      assert.match(dimensions.get("W"), /1180/);
      assert.match(dimensions.get("H"), /2860/);
      assert.match(dimensions.get("T"), /220/);
      assert.equal(classCount(svg, "outline"), 1);
    }
    if (fixture.type.startsWith("ready_")) {
      assert.ok(geometry.lines.length > 0, `${fixture.type} must contain tread geometry`);
      assert.ok(geometry.stepLabels.length >= 1, `${fixture.type} must contain step-count labels`);
      assert.match(dimensions.get("B1"), /980/);
    }
    if (fixture.type.includes("winder")) assert.match(dimensions.get("ZN"), /3 шт/);

    assertOrientation(fixture, geometry);
    assert.equal(actualHash, fixture.expected.geometryHash);
  });
}

test("desktop, tablet, and phone layouts preserve semantic content without cropping", () => {
  const harness = createDrawingHarness();
  const layouts = [
    { width: 1200, viewBox: DESKTOP_VIEWBOX },
    { width: 800, viewBox: TABLET_VIEWBOX },
    { width: 390, viewBox: PHONE_VIEWBOX },
  ];

  for (const fixture of SVG_VARIANT_FIXTURES) {
    let expectedDimensions = null;
    for (const layout of layouts) {
      const { geometry, svg } = configureFixture(harness, fixture, layout.width);
      assert.equal(viewBox(svg), layout.viewBox, `${fixture.type} at ${layout.width}px`);
      assertSvgCoordinatesInBounds(svg);
      assertOrientation(fixture, geometry);
      const dimensionIds = [...dimensionMap(svg).keys()];
      if (!expectedDimensions) expectedDimensions = dimensionIds;
      else assert.deepEqual(dimensionIds, expectedDimensions, `${fixture.type} dimensions survive responsive layout`);
      assert.match(svg, new RegExp(fixture.expected.title));
    }
  }

  const drawingCss = fs.readFileSync(DRAWING_BRIDGE_PATH, "utf8");
  assert.match(drawingCss, /\.db-svg-wrap svg\{width:100%;height:650px;/);
  assert.match(drawingCss, /@media\(max-width:1000px\)[\s\S]*?\.db-svg-wrap svg\{height:58vh;min-height:520px;width:100%\}/);
  assert.match(drawingCss, /@media\(max-width:430px\)[\s\S]*?\.db-svg-wrap svg\{height:60vh;min-height:540px\}/);
});

test("important field changes redraw labels and geometry while unrelated values stay stable", () => {
  const harness = createDrawingHarness();

  const straight = SVG_VARIANT_FIXTURES.find((fixture) => fixture.type === "empty_straight");
  const straightBefore = configureFixture(harness, straight);
  const straightBeforeLabels = dimensionMap(straightBefore.svg);
  harness.setField("opening_length_mm", "3670");
  const straightAfterGeometry = clone(harness.hook.buildGeometry());
  const straightAfterSvg = harness.hook.renderSvg(straightAfterGeometry);
  const straightAfterLabels = dimensionMap(straightAfterSvg);
  assert.notEqual(straightAfterLabels.get("L"), straightBeforeLabels.get("L"));
  assert.match(straightAfterLabels.get("L"), /3670/);
  assert.equal(straightAfterLabels.get("W"), straightBeforeLabels.get("W"));
  assert.notEqual(straightAfterGeometry.outer.w, straightBefore.geometry.outer.w);
  assert.equal(straightAfterGeometry.outer.h, straightBefore.geometry.outer.h);

  const uWinder = SVG_VARIANT_FIXTURES.find((fixture) => fixture.type === "ready_u_winder_right");
  const winderBefore = configureFixture(harness, uWinder);
  const winderBeforeLabels = dimensionMap(winderBefore.svg);
  harness.setField("flight1_width_mm", "1080");
  const winderAfterGeometry = clone(harness.hook.buildGeometry());
  const winderAfterSvg = harness.hook.renderSvg(winderAfterGeometry);
  const winderAfterLabels = dimensionMap(winderAfterSvg);
  const beforeFlight = winderBefore.geometry.rects.find((rect) => rect.id === "flight1");
  const afterFlight = winderAfterGeometry.rects.find((rect) => rect.id === "flight1");
  assert.notEqual(winderAfterLabels.get("B1"), winderBeforeLabels.get("B1"));
  assert.match(winderAfterLabels.get("B1"), /1080/);
  assert.equal(winderAfterLabels.get("B2"), winderBeforeLabels.get("B2"));
  assert.notEqual(afterFlight.w, beforeFlight.w);
  assert.equal(winderAfterGeometry.params.secondFlightWidth, winderBefore.geometry.params.secondFlightWidth);
});

test("save and reopen preserve every variant, dimension label, and key geometry", () => {
  const harness = createDrawingHarness();

  for (const fixture of SVG_VARIANT_FIXTURES) {
    const before = configureFixture(harness, fixture);
    harness.hook.saveState(before.svg);
    const savedProject = harness.field("drawing_project_json").value;
    const savedSvg = harness.field("drawing_svg").value;
    const savedFinish = harness.field("finish_dimensions_json").value;
    const parsedProject = JSON.parse(savedProject);

    assert.equal(parsedProject.schemaVersion, 2);
    assert.equal(parsedProject.type, fixture.type);
    assert.equal(parsedProject.units, "mm");
    assert.equal(savedSvg, before.svg);

    harness.hook.clearState();
    harness.resetFields({
      ...fixture.fields,
      drawing_project_json: savedProject,
      drawing_svg: savedSvg,
      finish_dimensions_json: savedFinish,
    });
    harness.hook.refreshState(true);
    const reopenedGeometry = clone(harness.hook.buildGeometry());
    const reopenedSvg = harness.hook.renderSvg(reopenedGeometry);

    assert.equal(harness.hook.currentVariantKeyFromForm(), fixture.type);
    assert.equal(geometryHash(reopenedGeometry), geometryHash(before.geometry));
    assert.deepEqual([...dimensionMap(reopenedSvg).entries()], [...dimensionMap(before.svg).entries()]);
    assertOrientation(fixture, reopenedGeometry);
  }
});

test("main preview, production view, and print paths retain saved SVG markup", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const productionSource = fs.readFileSync(path.join(ROOT, "production.js"), "utf8");
  const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const productionStyles = fs.readFileSync(path.join(ROOT, "production.css"), "utf8");

  assert.match(appSource, /enhanceMainPreviewSvg\(m\.drawing_svg\)/);
  assert.match(appSource, /<div class="preview-scheme">\$\{enhanceMainPreviewSvg\(m\.drawing_svg\)/);
  assert.match(appSource, /if \(event\.target\.closest\("\[data-print-preview\]"\)\) window\.print\(\)/);
  assert.match(productionSource, /const svg = enhanceProductionSvg\(m\.drawing_svg \|\| "", m, project\)/);
  assert.match(productionSource, /<div class="production-svg">\$\{svg\}<\/div>/);
  assert.match(productionSource, /onclick="window\.print\(\)"/);
  assert.doesNotMatch(productionSource, /(?:drawImage|toDataURL|canvas\.getContext)\(/);

  assert.match(styles, /\.preview-scheme svg \{ width: 100%; height: auto; max-height: 360px; \}/);
  assert.match(styles, /@media print \{[\s\S]*?\.preview-actions,[\s\S]*?\{ display: none !important; \}/);
  assert.doesNotMatch(styles, /@media print \{[\s\S]*?\.preview-scheme\s*\{[^}]*display:\s*none/);
  assert.match(productionStyles, /\.production-svg svg \{[\s\S]*?width: 100%;[\s\S]*?height: auto;/);
  assert.match(productionStyles, /@media print \{/);
  assert.doesNotMatch(productionStyles, /@media print \{[\s\S]*?\.production-svg\s*\{[^}]*display:\s*none/);

  const harness = createDrawingHarness();
  for (const fixture of SVG_VARIANT_FIXTURES) {
    const { svg } = configureFixture(harness, fixture);
    assert.equal(viewBox(svg), DESKTOP_VIEWBOX);
    assert.match(svg, new RegExp(fixture.expected.title));
    assert.doesNotMatch(svg, /<(?:canvas|img)\b/i);
  }
});
