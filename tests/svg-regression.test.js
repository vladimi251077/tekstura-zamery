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
const ACCEPTED_WINDER_HASHES = Object.freeze({
  ready_l_left_winder: Object.freeze({ 4: "44c032d4c8b201a2", 5: "5b39f8c3c52368ec" }),
  ready_l_right_winder: Object.freeze({ 4: "91a051d094798d3f", 5: "50e342b0d8717da9" }),
  ready_u_winder_left: Object.freeze({ 4: "1ad10e53b70702c6", 5: "797c1a249ffc491b" }),
  ready_u_winder_right: Object.freeze({ 4: "e6408b83c0db09bb", 5: "2126b41c509939e1" }),
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
      center: winder.center ? roundedPoint(winder.center) : null,
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

function pointsEqual(a, b, epsilon = 0.001) {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

function polygonArea(points) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
}

function orientation(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(point, start, end, epsilon = 0.001) {
  return Math.abs(orientation(start, end, point)) <= epsilon
    && point.x >= Math.min(start.x, end.x) - epsilon
    && point.x <= Math.max(start.x, end.x) + epsilon
    && point.y >= Math.min(start.y, end.y) - epsilon
    && point.y <= Math.max(start.y, end.y) + epsilon;
}

function segmentsProperlyIntersect(a, b, c, d, epsilon = 0.001) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return ((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon))
    && ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon));
}

function assertSimplePolygon(points, label) {
  assert.ok(points.length >= 3, `${label} must contain at least three points`);
  assert.ok(polygonArea(points) > 0.001, `${label} must have non-zero area`);
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    for (let j = i + 1; j < points.length; j += 1) {
      if (j === i || j === (i + 1) % points.length || (j + 1) % points.length === i) continue;
      const c = points[j];
      const d = points[(j + 1) % points.length];
      assert.equal(segmentsProperlyIntersect(a, b, c, d), false, `${label} edges must not self-intersect`);
    }
  }
}

function pointInPolygon(point, polygon) {
  if (polygon.some((start, index) => pointOnSegment(point, start, polygon[(index + 1) % polygon.length]))) return true;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function polygonLabelPoint(points) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function pointOnRectBoundary(point, rect, epsilon = 0.001) {
  const insideX = point.x >= rect.x - epsilon && point.x <= rect.x + rect.w + epsilon;
  const insideY = point.y >= rect.y - epsilon && point.y <= rect.y + rect.h + epsilon;
  const onVertical = Math.abs(point.x - rect.x) <= epsilon || Math.abs(point.x - (rect.x + rect.w)) <= epsilon;
  const onHorizontal = Math.abs(point.y - rect.y) <= epsilon || Math.abs(point.y - (rect.y + rect.h)) <= epsilon;
  return insideX && insideY && (onVertical || onHorizontal);
}

function assertRadialWinderGeometry(fixture, geometry, count) {
  const turn = geometry.rects.find((rect) => rect.id === "turn");
  const steps = geometry.winders.filter((item) => item.kind === "step");
  const expectedCenter = { x: turn.x + turn.w / 2, y: turn.y + turn.h / 2 };
  assert.equal(steps.length, count, `${fixture.type} must render ZN=${count} tread regions`);
  assert.equal(new Set(steps.map((step) => `${rounded(step.points[0].x)},${rounded(step.points[0].y)}`)).size, 1, `${fixture.type} must not shift separator apexes`);
  let area = 0;
  steps.forEach((step, index) => {
    assert.ok(pointsEqual(step.center, expectedCenter), `${fixture.type} step ${index + 1} center metadata`);
    assert.ok(pointsEqual(step.points[0], expectedCenter), `${fixture.type} step ${index + 1} radial origin`);
    assert.ok(pointOnRectBoundary(step.points[1], turn), `${fixture.type} step ${index + 1} first ray boundary hit`);
    assert.ok(pointOnRectBoundary(step.points.at(-1), turn), `${fixture.type} step ${index + 1} second ray boundary hit`);
    assertSimplePolygon(step.points, `${fixture.type} step ${index + 1}`);
    assert.ok(pointInPolygon(polygonLabelPoint(step.points), step.points), `${fixture.type} label ${index + 1} must remain inside its tread`);
    area += polygonArea(step.points);
  });
  assert.ok(Math.abs(area - turn.w * turn.h) <= 0.01, `${fixture.type} tread regions must cover the rectangular turn`);
}

function normalizedWinderSteps(geometry, mirror = false) {
  const turn = geometry.rects.find((rect) => rect.id === "turn");
  return geometry.winders.filter((item) => item.kind === "step").map((step) => step.points.map((point) => ({
    x: rounded(mirror ? 1 - (point.x - turn.x) / turn.w : (point.x - turn.x) / turn.w),
    y: rounded((point.y - turn.y) / turn.h),
  })));
}

function lineIntersection(a, b, c, d) {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const cdX = d.x - c.x;
  const cdY = d.y - c.y;
  const denominator = abX * cdY - abY * cdX;
  if (Math.abs(denominator) < 0.001) return b;
  const ratio = ((c.x - a.x) * cdY - (c.y - a.y) * cdX) / denominator;
  return { x: a.x + ratio * abX, y: a.y + ratio * abY };
}

function signedPolygonArea(points) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function convexIntersection(subject, clip) {
  const clipDirection = Math.sign(signedPolygonArea(clip)) || 1;
  let output = subject.slice();
  for (let i = 0; i < clip.length && output.length; i += 1) {
    const edgeStart = clip[i];
    const edgeEnd = clip[(i + 1) % clip.length];
    const input = output;
    output = [];
    let previous = input[input.length - 1];
    let previousInside = clipDirection * orientation(edgeStart, edgeEnd, previous) >= -0.001;
    input.forEach((current) => {
      const currentInside = clipDirection * orientation(edgeStart, edgeEnd, current) >= -0.001;
      if (currentInside !== previousInside) output.push(lineIntersection(previous, current, edgeStart, edgeEnd));
      if (currentInside) output.push(current);
      previous = current;
      previousInside = currentInside;
    });
  }
  return output;
}

function polygonOverlapArea(a, b) {
  const overlap = convexIntersection(a, b);
  return overlap.length >= 3 ? Math.abs(signedPolygonArea(overlap)) : 0;
}

function polygonEdges(points) {
  return points.map((start, index) => ({ start, end: points[(index + 1) % points.length] }));
}

function sharedEdge(a, b) {
  return polygonEdges(a).some((edgeA) => polygonEdges(b).some((edgeB) => (
    (pointsEqual(edgeA.start, edgeB.start) && pointsEqual(edgeA.end, edgeB.end))
    || (pointsEqual(edgeA.start, edgeB.end) && pointsEqual(edgeA.end, edgeB.start))
  )));
}

function rectAttachmentSegment(turn, flight) {
  if (Math.abs(flight.y - (turn.y + turn.h)) <= 0.001) {
    return { start: { x: flight.x, y: flight.y }, end: { x: flight.x + flight.w, y: flight.y } };
  }
  if (Math.abs(flight.x - (turn.x + turn.w)) <= 0.001) {
    return { start: { x: flight.x, y: flight.y }, end: { x: flight.x, y: flight.y + flight.h } };
  }
  if (Math.abs(flight.x + flight.w - turn.x) <= 0.001) {
    return { start: { x: turn.x, y: flight.y }, end: { x: turn.x, y: flight.y + flight.h } };
  }
  throw new Error("Flight does not attach to turn rectangle");
}

function boundaryOverlapLength(points, attachment) {
  return polygonEdges(points).reduce((sum, edge) => {
    if (Math.abs(orientation(attachment.start, attachment.end, edge.start)) > 0.001
      || Math.abs(orientation(attachment.start, attachment.end, edge.end)) > 0.001) return sum;
    const horizontal = Math.abs(attachment.start.y - attachment.end.y) <= 0.001;
    const attachmentFrom = horizontal ? Math.min(attachment.start.x, attachment.end.x) : Math.min(attachment.start.y, attachment.end.y);
    const attachmentTo = horizontal ? Math.max(attachment.start.x, attachment.end.x) : Math.max(attachment.start.y, attachment.end.y);
    const edgeFrom = horizontal ? Math.min(edge.start.x, edge.end.x) : Math.min(edge.start.y, edge.end.y);
    const edgeTo = horizontal ? Math.max(edge.start.x, edge.end.x) : Math.max(edge.start.y, edge.end.y);
    return sum + Math.max(0, Math.min(attachmentTo, edgeTo) - Math.max(attachmentFrom, edgeFrom));
  }, 0);
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

test("all protected winders use the rectangle center as one radial origin for ZN 2, 3, 4, and 5", () => {
  const harness = createDrawingHarness();
  const fixtures = SVG_VARIANT_FIXTURES.filter((fixture) => fixture.type.includes("winder"));
  for (const fixture of fixtures) {
    for (const count of [2, 3, 4, 5]) {
      configureFixture(harness, fixture);
      harness.setField("winder_steps_count", count);
      const geometry = clone(harness.hook.buildGeometry());
      const svg = harness.hook.renderSvg(geometry);
      assertRadialWinderGeometry(fixture, geometry, count);
      assert.equal(classCount(svg, "winder-step"), count);
      assert.doesNotMatch(svg, FORBIDDEN_OUTPUT);
    }
  }
});

test("left and right L/U winder tread regions are exact mirrors", () => {
  const harness = createDrawingHarness();
  const pairs = [
    ["ready_l_left_winder", "ready_l_right_winder"],
    ["ready_u_winder_left", "ready_u_winder_right"],
  ];
  for (const [leftType, rightType] of pairs) {
    const left = SVG_VARIANT_FIXTURES.find((fixture) => fixture.type === leftType);
    const right = SVG_VARIANT_FIXTURES.find((fixture) => fixture.type === rightType);
    for (const count of [2, 3, 4, 5]) {
      configureFixture(harness, left);
      harness.setField("winder_steps_count", count);
      const leftGeometry = clone(harness.hook.buildGeometry());
      configureFixture(harness, right);
      harness.setField("winder_steps_count", count);
      const rightGeometry = clone(harness.hook.buildGeometry());
      assert.deepEqual(normalizedWinderSteps(leftGeometry, true), normalizedWinderSteps(rightGeometry));
    }
  }
});

test("ZN=3 uses ordered T-fan regions with clean sequential topology", () => {
  const harness = createDrawingHarness();
  const fixtures = SVG_VARIANT_FIXTURES.filter((fixture) => fixture.type.includes("winder"));
  for (const fixture of fixtures) {
    const { geometry } = configureFixture(harness, fixture);
    const turn = geometry.rects.find((rect) => rect.id === "turn");
    const flight1 = geometry.rects.find((rect) => rect.id === "flight1");
    const flight2 = geometry.rects.find((rect) => rect.id === "flight2");
    const steps = geometry.winders.filter((item) => item.kind === "step");
    const center = { x: turn.x + turn.w / 2, y: turn.y + turn.h / 2 };
    const leftToRight = fixture.expected.orientation === "left";
    const bottom = { x: center.x, y: turn.y + turn.h };
    const left = { x: turn.x, y: center.y };
    const right = { x: turn.x + turn.w, y: center.y };
    const expectedAnchors = leftToRight
      ? [[bottom, left], [left, right], [right, bottom]]
      : [[bottom, right], [right, left], [left, bottom]];

    assert.equal(steps.length, 3);
    steps.forEach((step, index) => {
      assert.ok(pointsEqual(step.points[0], center), `${fixture.type} step ${index + 1} center`);
      assert.ok(pointsEqual(step.points[1], expectedAnchors[index][0]), `${fixture.type} step ${index + 1} ordered start anchor`);
      assert.ok(pointsEqual(step.points.at(-1), expectedAnchors[index][1]), `${fixture.type} step ${index + 1} ordered end anchor`);
      assertSimplePolygon(step.points, `${fixture.type} ZN3 step ${index + 1}`);
      assert.ok(pointInPolygon(step.labelPoint, step.points), `${fixture.type} ZN3 label ${index + 1}`);
    });

    const areas = steps.map((step) => polygonArea(step.points));
    assert.deepEqual(areas.map((area) => rounded(area / (turn.w * turn.h))), [0.25, 0.5, 0.25]);
    assert.ok(pointsEqual(steps[1].labelPoint, { x: center.x, y: turn.y + turn.h / 4 }));
    assert.ok(pointInPolygon({ x: center.x - turn.w / 10, y: center.y - turn.h / 10 }, steps[1].points));
    assert.ok(pointInPolygon({ x: center.x + turn.w / 10, y: center.y - turn.h / 10 }, steps[1].points));

    let overlapArea = 0;
    for (let i = 0; i < steps.length; i += 1) {
      for (let j = i + 1; j < steps.length; j += 1) overlapArea += polygonOverlapArea(steps[i].points, steps[j].points);
    }
    assert.ok(overlapArea <= 0.001, `${fixture.type} ZN3 polygons must not overlap`);
    assert.equal(sharedEdge(steps[0].points, steps[1].points), true, `${fixture.type} steps 1-2 adjacency`);
    assert.equal(sharedEdge(steps[1].points, steps[2].points), true, `${fixture.type} steps 2-3 adjacency`);
    assert.ok(polygonOverlapArea(steps[0].points, steps[2].points) <= 0.001, `${fixture.type} steps 1 and 3 must not overlap`);
    assert.ok(boundaryOverlapLength(steps[0].points, rectAttachmentSegment(turn, flight1)) > 0, `${fixture.type} step 1 connects to entering flight`);
    assert.ok(boundaryOverlapLength(steps[2].points, rectAttachmentSegment(turn, flight2)) > 0, `${fixture.type} step 3 connects to exiting flight`);
    let outerTreadCrossings = 0;
    polygonEdges(steps[0].points).forEach((edge1) => polygonEdges(steps[2].points).forEach((edge3) => {
      if (segmentsProperlyIntersect(edge1.start, edge1.end, edge3.start, edge3.end)) outerTreadCrossings += 1;
    }));
    assert.equal(outerTreadCrossings, 0, `${fixture.type} steps 1 and 3 must not improperly intersect`);

    const uniqueAnchors = [bottom, left, right];
    let separatorCrossings = 0;
    for (let i = 0; i < uniqueAnchors.length; i += 1) {
      for (let j = i + 1; j < uniqueAnchors.length; j += 1) {
        if (segmentsProperlyIntersect(center, uniqueAnchors[i], center, uniqueAnchors[j])) separatorCrossings += 1;
      }
    }
    assert.equal(separatorCrossings, 0, `${fixture.type} ZN3 separator crossings`);
    assert.deepEqual(
      uniqueAnchors.map((point) => [rounded((point.x - turn.x) / turn.w), rounded((point.y - turn.y) / turn.h)]).sort(),
      [[0, 0.5], [0.5, 1], [1, 0.5]],
      `${fixture.type} ZN3 uses T anchors rather than X topology`,
    );
  }
});

test("accepted ZN=4 and ZN=5 normalized geometry hashes remain unchanged", () => {
  const harness = createDrawingHarness();
  for (const fixture of SVG_VARIANT_FIXTURES.filter((item) => item.type.includes("winder"))) {
    for (const count of [4, 5]) {
      configureFixture(harness, fixture);
      harness.setField("winder_steps_count", count);
      const geometry = clone(harness.hook.buildGeometry());
      assert.equal(geometryHash(geometry), ACCEPTED_WINDER_HASHES[fixture.type][count], `${fixture.type} ZN=${count}`);
    }
  }
});

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
