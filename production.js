const SUPABASE_URL = "https://rhnlykqqhwweaywjopvm.supabase.co";
const PRODUCTION_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobmx5a3FxaHd3ZWF5d2pvcHZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODE0NjksImV4cCI6MjA5MTc1NzQ2OX0.a0K1q7VKDBRW_7A6fbf5jyMOqO0KpRXQdn8XMBeXfwg";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, PRODUCTION_SUPABASE_ANON_KEY);
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = { user: null, profile: null, measurements: [], selected: null, photos: [], listOpen: true };

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseJson(raw, fallback = {}) {
  if (!raw) return fallback;
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function isPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function rawNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function num(value, fallback = "—") {
  return isPositiveNumber(value) ? `${Math.round(Number(value))} мм` : fallback;
}

function val(value, fallback = "—") {
  if (value === null || value === undefined || value === "" || value === 0 || value === "0") return fallback;
  return String(value);
}

function productionMeasurementMode(project) {
  return project?.measurementMode === "detailed" ? "detailed" : "simple";
}

function measurementMeasurerName(measurement) {
  return String(measurement?.measurer_name || "").trim();
}

function setMessage(el, message, type = "") {
  if (!el) return;
  el.textContent = message || "";
  el.className = `form-message ${type}`.trim();
}

async function login() {
  const email = $("#prod-email").value.trim();
  const password = $("#prod-password").value;
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  state.user = data.user;
  await loadProfile();
  showApp(true);
  await loadMeasurements();
}

async function logout() {
  await supabaseClient.auth.signOut();
  state.user = null;
  state.profile = null;
  state.measurements = [];
  state.selected = null;
  state.listOpen = true;
  showApp(false);
}


const PRODUCTION_STATUSES = ["Готов к производству", "В работе", "На покраске", "Готово", "Отгружено", "Монтаж", "Закрыто"];

async function loadProfile() {
  if (!state.user?.id) {
    state.profile = null;
    return;
  }
  const { data } = await supabaseClient.from("profiles").select("*").eq("id", state.user.id).maybeSingle();
  state.profile = data || { id: state.user.id, role: "production", full_name: state.user.email?.split("@")[0] || "Производство" };
}

function currentRole() {
  return String(state.profile?.role || "production").toLowerCase();
}

function canChangeProductionStatus() {
  const role = currentRole();
  return ["admin", "manager", "production", "prod", "цех", "производ", "montage", "монтаж"].some((part) => role.includes(part));
}

function syncProductionLayoutState() {
  const app = $("#production-app");
  const toggle = $("#prod-toggle-list");
  if (!app) return;
  const hasSelection = Boolean(state.selected);
  app.classList.toggle("has-selection", hasSelection);
  app.classList.toggle("list-open", state.listOpen || !hasSelection);
  if (toggle) {
    const expanded = state.listOpen || !hasSelection;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = expanded ? "Свернуть" : "Список";
  }
}

function showApp(isAuthed) {
  $("#production-auth").classList.toggle("hidden", isAuthed);
  $("#production-app").classList.toggle("hidden", !isAuthed);
  $("#production-logout").classList.toggle("hidden", !isAuthed);
  $("#production-user").textContent = isAuthed ? (state.user?.email || "Вошли") : "Не вошли";
  syncProductionLayoutState();
}

async function init() {
  const { data } = await supabaseClient.auth.getSession();
  state.user = data.session?.user || null;
  if (state.user) await loadProfile();
  showApp(Boolean(state.user));
  if (state.user) await loadMeasurements();
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  if (id && state.user) selectMeasurement(id);
}

function isProductionReady(measurement) {
  if (measurement.is_deleted || measurement.is_archived || measurement.status === "Архив") return false;
  return ["Готовый замер", "Готов к производству", "В работе", "На покраске", "Готово", "Отгружено", "Монтаж", "Закрыто"].includes(measurement.status);
}

async function loadMeasurements() {
  const { data, error } = await supabaseClient
    .from("measurements")
    .select("*, clients(*)")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  state.measurements = (data || []).filter(isProductionReady);
  renderList();
}

function renderList() {
  const search = $("#prod-search").value.trim().toLowerCase();
  const list = $("#prod-list");
  const items = state.measurements.filter((m) => {
    const c = m.clients || {};
    const hay = `${m.number || ""} ${c.name || ""} ${c.address || ""} ${m.status || ""}`.toLowerCase();
    return !search || hay.includes(search);
  });
  if (!items.length) {
    list.innerHTML = `<p class="muted-text">Готовых замеров пока нет.</p>`;
    return;
  }
  list.innerHTML = items.map((m) => {
    const c = m.clients || {};
    const active = state.selected?.id === m.id ? "active" : "";
    return `<button type="button" class="production-order-btn ${active}" data-id="${escapeHtml(m.id)}">
      <b>${escapeHtml(m.number || "Без номера")}</b>
      <span>${escapeHtml(c.name || "Без имени")}</span>
      <span>${escapeHtml(c.address || "Адрес не указан")}</span>
      <span>${escapeHtml(m.status || "")}</span>
    </button>`;
  }).join("");
}

async function selectMeasurement(id) {
  const measurement = state.measurements.find((m) => m.id === id);
  if (!measurement) return;
  state.selected = measurement;
  state.listOpen = false;
  syncProductionLayoutState();
  renderList();
  await loadPhotos(measurement);
  renderCard();
  history.replaceState(null, "", `./production.html?id=${encodeURIComponent(id)}`);
}

function photoPathBelongsToMeasurement(photo, measurement) {
  if (!photo || !measurement?.id) return false;
  if (photo.measurement_id !== measurement.id) return false;
  const path = String(photo.file_path || "");
  if (!path) return true;
  const number = String(measurement.number || "");
  const strictPrefix = `${number}_${measurement.id}/`;
  const legacyPrefix = `${number}/`;
  return path.startsWith(strictPrefix) || path.startsWith(legacyPrefix) || !number;
}

async function loadPhotos(measurement) {
  state.photos = [];
  if (!measurement?.id) return;
  const { data, error } = await supabaseClient
    .from("measurement_photos")
    .select("*")
    .eq("measurement_id", measurement.id)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("Не удалось загрузить фото", error);
    return;
  }
  const filtered = (data || []).filter((photo) => photoPathBelongsToMeasurement(photo, measurement));
  state.photos = await Promise.all(filtered.map(async (photo) => ({ ...photo, url: await signedPhotoUrl(photo.file_path) })));
}

function normalizePhotoStoragePath(path) {
  const normalized = String(path || "").trim().replace(/^\/+/, "");
  return normalized.startsWith("measurement-photos/") ? normalized.slice("measurement-photos/".length) : normalized;
}

async function signedPhotoUrl(path) {
  const filePath = normalizePhotoStoragePath(path);
  if (!filePath) return "";
  try {
    const { data, error } = await supabaseClient.storage.from("measurement-photos").createSignedUrl(filePath, 60 * 60);
    if (error) {
      console.warn("Не удалось создать signed URL для фото", { filePath, error });
      return "";
    }
    return data?.signedUrl || "";
  } catch (error) {
    console.warn("Не удалось создать signed URL для фото", { filePath, error });
    return "";
  }
}

function kv(label, value) {
  return `<div class="production-kv"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`;
}

function section(title, body) {
  return `<section class="production-section"><h3>${escapeHtml(title)}</h3>${body}</section>`;
}

function table(headers, rows) {
  if (!rows.length) return `<p class="production-empty-line">Нет данных.</p>`;
  return `<div class="production-table-wrap"><table class="production-table"><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function finishRows(items, type) {
  return (items || []).filter((item) => item && Object.values(item).some((value) => val(value, ""))).map((item) => {
    const title = item.title || item.name || type;
    const length = item.length_mm ?? item.depth_mm ?? "";
    const width = item.width_mm ?? "";
    const height = item.height_mm ?? "";
    return `<tr>
      <td><b>${escapeHtml(title)}</b><br><small>${escapeHtml(item.comment || "")}</small></td>
      <td>${escapeHtml(val(item.count, "—"))}</td>
      <td>${escapeHtml(num(length))}</td>
      <td>${escapeHtml(num(width))}</td>
      <td>${escapeHtml(num(height || item.thickness_mm))}</td>
      <td>${escapeHtml(item.material || "—")}</td>
      <td>${escapeHtml(item.finish || "—")}</td>
    </tr>`;
  });
}

function pickNumber(...values) {
  for (const value of values) {
    if (isPositiveNumber(value)) return Number(value);
  }
  return null;
}


function productionStepCountLabels(measurement, project) {
  const type = String(project?.type || "");
  if (!type.startsWith("ready")) return [];
  const p = project?.params || {};
  const labels = [];
  const n1 = pickNumber(p.N1, p.firstFlightSteps, measurement?.flight1_steps_count);
  const n2 = pickNumber(p.N2, p.secondFlightSteps, measurement?.flight2_steps_count);
  if (type === "ready_straight") {
    if (n1) labels.push({ flightId: "flight1", code: "N1", value: Math.round(n1) });
    return labels;
  }
  if (n1) labels.push({ flightId: "flight1", code: "N1", value: Math.round(n1) });
  if (n2) labels.push({ flightId: "flight2", code: "N2", value: Math.round(n2) });
  return labels;
}

function flightStepLabelPosition(box) {
  return {
    x: box.x + box.w / 2,
    y: box.y + Math.min(Math.max(54, box.h * 0.48), Math.max(22, box.h - 12)),
  };
}

function renderProductionStepCountNode(doc, box, item) {
  const ns = "http://www.w3.org/2000/svg";
  const group = doc.createElementNS(ns, "g");
  const label = `${item.code} ${item.value} ступ.`;
  const { x, y } = flightStepLabelPosition(box);
  const textWidth = Math.max(78, label.length * 7.4);
  const textHeight = 24;
  group.setAttribute("class", "flight-step-count");
  group.setAttribute("data-flight", item.flightId);
  group.setAttribute("data-param", item.code);
  const rect = doc.createElementNS(ns, "rect");
  rect.setAttribute("class", "flight-step-count-bg");
  rect.setAttribute("x", String(x - textWidth / 2));
  rect.setAttribute("y", String(y - textHeight + 5));
  rect.setAttribute("width", String(textWidth));
  rect.setAttribute("height", String(textHeight));
  rect.setAttribute("rx", "7");
  rect.setAttribute("ry", "7");
  const text = doc.createElementNS(ns, "text");
  text.setAttribute("class", "flight-step-count-text");
  text.setAttribute("x", String(x));
  text.setAttribute("y", String(y));
  text.setAttribute("text-anchor", "middle");
  text.textContent = label;
  group.append(rect, text);
  return group;
}

const PRODUCTION_SVG_STYLE_ID = "production-svg-safe-style";
const PRODUCTION_SVG_STYLE = `
  .flight,.landing,.platform,.turn,.step,.opening,.zone{fill:#f8fafc;stroke:#0f172a;stroke-width:2;vector-effect:non-scaling-stroke;}
  .turn,.landing,.platform,.zone.turn{fill:#eef6ff;}
  .step,.tread,.step-line{fill:none;stroke:#1e293b;stroke-width:1.4;vector-effect:non-scaling-stroke;}
  .opening,.outline{fill:#fff;stroke:#0f172a;stroke-width:2.2;vector-effect:non-scaling-stroke;}
  .wall,.wall-line,.wall-mark{fill:none;stroke:#94a3b8;stroke-width:9;stroke-linecap:round;vector-effect:non-scaling-stroke;}
  .dimension line,.dimension path,.dim,.route{fill:none;stroke:#0f172a;stroke-width:1.8;vector-effect:non-scaling-stroke;}
  .dimension text,.label,.caption{font:800 15px system-ui,sans-serif;fill:#0f172a;paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round;}
  .zone-hit,.dim-hit,.wall-hit,.window-hit,.ascent-hit{fill:transparent!important;stroke:transparent!important;display:none!important;}
  .winder-step{fill:#eef6ff;stroke:#1e293b;stroke-width:1.4;vector-effect:non-scaling-stroke;}
  .winder-envelope{fill:#e0f2fe;stroke:#0f172a;stroke-width:2;vector-effect:non-scaling-stroke;}
  .window-mark{fill:#e0f2fe;stroke:#0284c7;stroke-width:3;vector-effect:non-scaling-stroke;}
  .obstacle-mark{fill:#fff7ed;stroke:#ea580c;stroke-width:3;vector-effect:non-scaling-stroke;}
  .flight-step-count-bg{fill:#fff;stroke:#cbd5e1;stroke-width:1.2;opacity:.92;vector-effect:non-scaling-stroke;}
  .flight-step-count-text{font:950 13px system-ui,sans-serif;fill:#0f172a;paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round;}
`;

function svgClassList(node) {
  return String(node.getAttribute("class") || "").split(/\s+/).filter(Boolean);
}

function svgHasAnyClass(node, classes) {
  const nodeClasses = svgClassList(node);
  return classes.some((name) => nodeClasses.includes(name));
}

function svgHasPaint(node) {
  return node.hasAttribute("fill") || node.hasAttribute("stroke") || node.hasAttribute("style");
}

function ensureProductionSvgStyle(parsed, svg) {
  const existing = svg.querySelector(`style#${PRODUCTION_SVG_STYLE_ID}`);
  if (existing) {
    existing.textContent = PRODUCTION_SVG_STYLE;
    return;
  }
  const style = parsed.createElementNS("http://www.w3.org/2000/svg", "style");
  style.setAttribute("id", PRODUCTION_SVG_STYLE_ID);
  style.textContent = PRODUCTION_SVG_STYLE;
  const first = svg.firstChild;
  if (first) svg.insertBefore(style, first);
  else svg.appendChild(style);
}

function hardenProductionSvgPaint(svg) {
  svg.querySelectorAll("rect.zone-hit, polygon.zone-hit, path.zone-hit, .zone-hit, .dim-hit, .wall-hit, .window-hit, .ascent-hit").forEach((node) => {
    node.setAttribute("fill", "transparent");
    node.setAttribute("stroke", "transparent");
    node.setAttribute("display", "none");
  });

  svg.querySelectorAll("rect, polygon, path").forEach((node) => {
    if (svgHasAnyClass(node, ["zone-hit", "dim-hit", "wall-hit", "window-hit", "ascent-hit"])) return;
    if (svgHasPaint(node)) return;
    const tag = node.nodeName.toLowerCase();
    if (svgHasAnyClass(node, ["step", "tread", "step-line", "dimension", "dim", "route", "wall", "wall-line", "wall-mark"])) {
      node.setAttribute("fill", "none");
      node.setAttribute("stroke", "#1e293b");
      return;
    }
    if (tag === "path") {
      node.setAttribute("fill", "#f8fafc");
      node.setAttribute("stroke", "#0f172a");
      return;
    }
    node.setAttribute("fill", svgHasAnyClass(node, ["turn", "landing", "platform"]) ? "#eef6ff" : "#f8fafc");
    node.setAttribute("stroke", "#0f172a");
  });
}

function enhanceProductionSvg(svgText, measurement, project) {
  if (!svgText || typeof DOMParser === "undefined") return svgText || "";
  const labels = productionStepCountLabels(measurement, project);
  const parsed = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = parsed.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== "svg") return svgText;
  ensureProductionSvgStyle(parsed, svg);
  hardenProductionSvgPaint(svg);
  svg.querySelectorAll(".flight-step-count").forEach((node) => node.remove());
  labels.forEach((item) => {
    const rect = svg.querySelector(`rect[data-zone="${item.flightId}"]:not(.zone-hit)`);
    if (!rect) return;
    const box = {
      x: rawNumber(rect.getAttribute("x")) || 0,
      y: rawNumber(rect.getAttribute("y")) || 0,
      w: rawNumber(rect.getAttribute("width")) || 0,
      h: rawNumber(rect.getAttribute("height")) || 0,
    };
    if (box.w <= 0 || box.h <= 0) return;
    svg.appendChild(renderProductionStepCountNode(parsed, box, item));
  });
  return new XMLSerializer().serializeToString(svg);
}

function dimKv(label, value) {
  return isPositiveNumber(value) ? kv(label, num(value)) : "";
}

function countKv(label, value) {
  return val(value, "") ? kv(label, val(value)) : "";
}

function productionVariant(project) {
  const type = String(project.type || "");
  const mode = !type || type.startsWith("empty") ? "empty" : "ready";
  const opening = type.includes("straight") ? "straight" : type.includes("_u_") ? "u" : type.includes("_l_") ? "l" : "";
  const turn = type.includes("winder") ? "winder" : type.includes("landing") ? "landing" : "";
  return { type, mode, opening, turn };
}

function productionDims(measurement, project) {
  const p = project.params || {};
  return {
    M1: pickNumber(p.M1, p.firstFlightLength, measurement.flight1_length_mm),
    B1: pickNumber(p.B1, p.firstFlightWidth, measurement.flight1_width_mm),
    N1: pickNumber(p.N1, p.firstFlightSteps, measurement.flight1_steps_count),
    M2: pickNumber(p.M2, p.secondFlightLength, measurement.flight2_length_mm),
    B2: pickNumber(p.B2, p.secondFlightWidth, measurement.flight2_width_mm),
    N2: pickNumber(p.N2, p.secondFlightSteps, measurement.flight2_steps_count),
    ZL: pickNumber(p.ZL, p.turnLength, measurement.corner_zone_length_mm),
    ZW: pickNumber(p.ZW, p.turnWidth, measurement.corner_zone_width_mm),
    ZN: pickNumber(p.ZN, p.winderSteps, measurement.winder_steps_count),
    H: pickNumber(p.H, p.height, measurement.height_clean_to_clean_mm),
    T: pickNumber(p.T, p.slabThickness, measurement.slab_thickness_mm),
    L: pickNumber(p.L, p.openingLength, measurement.opening_length_mm),
    W: pickNumber(p.W, p.openingWidth, measurement.opening_width_mm),
  };
}

const PRODUCTION_FIELD_MATRIX = {
  empty: {
    simple: {
      straight: ["L", "W", "H", "T"],
      turn: ["M1", "B1", "M2", "B2", "ZL", "ZW", "H", "T"],
    },
    detailed: {
      straight: ["L", "W", "H", "T"],
      turn: ["M1", "B1", "M2", "B2", "ZL", "ZW", "H", "T"],
    },
  },
  ready: {
    simple: {
      straight: ["B1", "N1", "b", "h", "M1"],
      landing: ["B1", "N1", "B2", "N2", "b", "h", "M1", "M2"],
      winder: ["B1", "N1", "B2", "N2", "ZN", "b", "h", "M1", "M2"],
    },
    detailed: {
      straight: ["B1", "N1", "h", "tread1", "M1"],
      landing: ["B1", "N1", "B2", "N2", "h", "tread", "M1", "M2"],
      winder: ["B1", "N1", "B2", "N2", "ZN", "h", "tread", "M1", "M2"],
    },
  },
};

const PRODUCTION_REQUIRED_OVERRIDES = {
  ready: {
    simple: {
      straight: ["B1", "N1"],
      landing: ["B1", "N1", "B2", "N2"],
      winder: ["B1", "N1", "B2", "N2", "ZN"],
    },
    detailed: {
      straight: ["B1", "N1", "h", "tread1"],
      landing: ["B1", "N1", "B2", "N2", "h", "tread"],
      winder: ["B1", "N1", "B2", "N2", "ZN", "h", "tread"],
    },
  },
};

const PRODUCTION_FIELD_LABELS = {
  L: "L — длина проёма",
  W: "W — ширина проёма",
  H: "H — высота от пола до пола",
  T: "T — толщина перекрытия/проёма",
  M1: "Марш 1 M1 расчёт",
  B1: "Марш 1 B1",
  N1: "Марш 1: N1",
  M2: "Марш 2 M2 расчёт",
  B2: "Марш 2 B2",
  N2: "Марш 2: N2",
  ZL: "Поворот ZL",
  ZW: "Поворот ZW",
  ZN: "Забежные: ZN",
  h: "Подступёнок h",
  b: "Проступь b",
  b1: "Проступь b1",
  b2: "Проступь b2",
};

function productionMatrixShape(v) {
  if (v.opening === "straight") return "straight";
  return v.turn === "winder" ? "winder" : "landing";
}

function isReadyULandingType(type) {
  const text = String(type || "");
  return text === "ready_u_landing_left" || text === "ready_u_landing_right";
}

function withReadyULandingFields(fields, v) {
  if (!isReadyULandingType(v?.type) || v?.mode !== "ready") return fields;
  return [...fields, "ZL", "ZW"];
}

function productionMatrixFields(project, v, options = {}) {
  const mode = productionMeasurementMode(project);
  const shape = productionMatrixShape(v);
  const source = options.required ? PRODUCTION_REQUIRED_OVERRIDES : PRODUCTION_FIELD_MATRIX;
  const baseFields = source[v.mode]?.[mode]?.[shape] || PRODUCTION_FIELD_MATRIX[v.mode]?.[mode]?.[shape] || [];
  const fields = withReadyULandingFields(baseFields, v);
  const sameTread = project?.treadMode?.sameTread !== false;
  return fields.flatMap((code) => {
    if (code === "tread") return sameTread ? ["b"] : ["b1", "b2"];
    if (code === "tread1") return sameTread ? ["b"] : ["b1"];
    return [code];
  });
}

function productionFieldValues(measurement, project, dims = productionDims(measurement, project)) {
  const p = project.params || {};
  const treadMode = project.treadMode || {};
  const sameTread = treadMode.sameTread !== false;
  const b = pickNumber(p.b, p.treadDepth, treadMode.b1, measurement.tread_depth_mm, 250);
  const b1 = sameTread ? b : pickNumber(p.b1, p.treadDepthFlight1, treadMode.b1, measurement.tread_depth_mm, b);
  const b2 = sameTread ? b : pickNumber(p.b2, p.treadDepthFlight2, treadMode.b2, measurement.tread_depth_mm, b);
  const h = pickNumber(p.h, p.riserHeight, measurement.riser_height_mm, 180);
  const v = productionVariant(project);
  const calcM1 = isPositiveNumber(dims.N1) && isPositiveNumber(b1) ? dims.N1 * b1 : dims.M1;
  const calcM2 = isPositiveNumber(dims.N2) && isPositiveNumber(b2) ? dims.N2 * b2 : dims.M2;
  return {
    ...dims,
    M1: v.mode === "ready" ? calcM1 : dims.M1,
    M2: v.mode === "ready" ? calcM2 : dims.M2,
    h,
    b,
    b1,
    b2,
  };
}

function collectIssues(measurement, project, finish, svg) {
  const dims = productionDims(measurement, project);
  const values = productionFieldValues(measurement, project, dims);
  const v = productionVariant(project);
  const detailed = productionMeasurementMode(project) === "detailed";
  const missing = [];
  const addIf = (label, value) => { if (!isPositiveNumber(value)) missing.push(`${label} не заполнен`); };
  const c = measurement.clients || {};
  if (!String(c.name || "").trim()) missing.push("клиент не заполнен");
  if (!String(c.phone || "").trim()) missing.push("телефон не заполнен");
  if (!String(c.address || "").trim()) missing.push("адрес не заполнен");
  if (!project.type) missing.push("схема не выбрана");
  if (!svg) missing.push("сохранённая схема/SVG не заполнена");
  productionMatrixFields(project, v, { required: true }).forEach((code) => addIf(code, values[code]));
  if (v.mode === "ready" && detailed && !(finish.steps?.length || finish.landings?.length || finish.boots?.length)) {
    missing.push("чистовые детали не заполнены");
  }
  return [...new Set(missing)];
}

function renderIssues(issues) {
  if (!issues.length) return `<div class="production-ok">Критичных незаполненных данных не найдено.</div>`;
  return `<div class="production-issue"><b>Требует уточнения перед производством:</b><ul>${issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul></div>`;
}

function productionFieldLabel(code, v) {
  if (isReadyULandingType(v?.type)) {
    if (code === "ZL") return "Площадка длина";
    if (code === "ZW") return "Площадка ширина";
  }
  return PRODUCTION_FIELD_LABELS[code] || code;
}

function renderDimensions(measurement, project) {
  const dims = productionDims(measurement, project);
  const values = productionFieldValues(measurement, project, dims);
  const v = productionVariant(project);
  const rows = productionMatrixFields(project, v).map((code) => {
    const label = productionFieldLabel(code, v);
    if (["N1", "N2", "ZN"].includes(code)) {
      return isPositiveNumber(values[code]) ? countKv(label, `${values[code]} шт`) : "";
    }
    return dimKv(label, values[code]);
  }).filter(Boolean);
  return rows.length ? `<div class="production-grid">${rows.join("")}</div>` : `<p class="production-empty-line">Рабочие размеры не заполнены.</p>`;
}

function renderFinish(finish) {
  const settings = finish.settings || {};
  const stepRows = finishRows(finish.steps, "Ступени");
  const landingRows = finishRows(finish.landings, "Площадка");
  const bootRows = finishRows(finish.boots, "Сапожок");
  const comments = (finish.comments || [])
    .map((item) => item.text || item.comment || "")
    .filter(Boolean)
    .map((text) => `<div class="production-warning">${escapeHtml(text)}</div>`)
    .join("");
  const headerRows = [
    dimKv("Боковой вылет", settings.side_overhang_mm ?? settings.tread_overhang_mm),
    dimKv("Передний вылет", settings.front_overhang_mm ?? settings.tread_overhang_mm),
    settings.add_boots_by_walls || bootRows.length ? kv("Сапожки у стен", settings.add_boots_by_walls ? "да" : "по списку ниже") : "",
  ].filter(Boolean);
  const parts = [];
  if (headerRows.length) parts.push(`<div class="production-grid">${headerRows.join("")}</div>`);
  if (stepRows.length) parts.push(`<h4>Ступени</h4>${table(["Деталь", "Кол-во", "Глубина/длина", "Ширина", "Толщина/высота", "Материал", "Отделка"], stepRows)}`);
  if (landingRows.length) parts.push(`<h4>Площадки</h4>${table(["Деталь", "Кол-во", "Длина", "Ширина", "Толщина", "Материал", "Отделка"], landingRows)}`);
  if (bootRows.length) parts.push(`<h4>Сапожки</h4>${table(["Деталь", "Кол-во", "Длина", "Ширина", "Высота/толщина", "Материал", "Отделка"], bootRows)}`);
  if (comments) parts.push(`<h4>Комментарии к деталям</h4>${comments}`);
  return parts.length ? parts.join("") : `<p class="production-empty-line">Чистовые детали и сапожки не заполнены.</p>`;
}

function renderMarks(project) {
  const blocks = [];
  if (project.ascent?.show || project.siteMarks?.ascent?.show) blocks.push(kv("Направление подъёма", "отмечено на схеме"));
  const bal = project.topBalustrade || project.siteMarks?.topBalustrade;
  if (bal?.enabled) blocks.push(kv("Верхняя балюстрада", `${(bal.sides || []).join(", ") || "стороны не указаны"}; ${bal.length_mm ? `${bal.length_mm} мм` : "длина не указана"}`));
  else blocks.push(kv("Верхняя балюстрада", "отсутствует / не указана"));
  const walls = project.walls || {};
  const wallText = ["flight1", "flight2", "turn"].flatMap((key) => Object.entries(walls[key] || {}).filter(([,v]) => v).map(([side]) => `${key}.${side}`));
  if (wallText.length) blocks.push(kv("Стены", wallText.join(", ")));
  const obstacles = project.obstacles || project.siteMarks?.obstacles || [];
  if (obstacles.length) blocks.push(kv("Препятствия", `${obstacles.length} шт`));
  const windows = project.windows || [];
  if (windows.length) blocks.push(kv("Окна", `${windows.length} шт`));
  return blocks.length ? `<div class="production-grid">${blocks.join("")}</div>` : `<p class="production-empty-line">Метки объекта не заполнены.</p>`;
}

function renderPhotoFallback(message, filePath, hidden = false) {
  return `<div class="production-photo-fallback ${hidden ? "hidden" : ""}">
    <strong>${escapeHtml(message)}</strong>
    ${filePath ? `<small>${escapeHtml(filePath)}</small>` : ""}
  </div>`;
}

function renderPhotos() {
  if (!state.photos.length) return `<p class="production-empty-line">Фото для этого замера не загружены.</p>`;
  return `<div class="production-photo-grid">${state.photos.map((p) => {
    const filePath = p.file_path || "";
    const title = p.photo_type || "Фото";
    const media = p.url
      ? `<div class="production-photo-media" data-file-path="${escapeHtml(filePath)}">
          <img src="${escapeHtml(p.url)}" alt="${escapeHtml(title)}">
          ${renderPhotoFallback("Файл не открылся", filePath, true)}
        </div>`
      : `<div class="production-photo-media is-error" data-file-path="${escapeHtml(filePath)}">
          ${renderPhotoFallback("Фото есть в базе, но файл недоступен в Storage. Проверьте доступ bucket measurement-photos.", filePath)}
        </div>`;
    const caption = `<div class="production-photo-caption"><b>${escapeHtml(title)}</b><br><small>${escapeHtml(filePath)}</small></div>`;
    return p.url
      ? `<a class="production-photo" href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${media}${caption}</a>`
      : `<div class="production-photo">${media}${caption}</div>`;
  }).join("")}</div>`;
}

function bindProductionPhotoFallbacks() {
  $$(".production-photo img").forEach((img) => {
    img.onerror = () => {
      const media = img.closest(".production-photo-media");
      if (!media) return;
      media.classList.add("is-error");
      img.removeAttribute("src");
      img.classList.add("hidden");
      media.querySelector(".production-photo-fallback")?.classList.remove("hidden");
    };
  });
}

function renderProductionStatusControl(measurement) {
  if (!canChangeProductionStatus()) return "";
  const current = measurement.status || "Готовый замер";
  const options = PRODUCTION_STATUSES.map((status) => `<option value="${escapeHtml(status)}" ${status === current ? "selected" : ""}>${escapeHtml(status)}</option>`).join("");
  return `<div class="production-status-control no-print">
    <label for="production-status-select">Статус производства</label>
    <div class="production-status-row">
      <select id="production-status-select">
        <option value="Готовый замер" ${current === "Готовый замер" ? "selected" : ""}>Готовый замер</option>
        ${options}
      </select>
      <button type="button" class="btn secondary" id="save-production-status">Сохранить статус</button>
    </div>
    <small>Изготовитель меняет только производственный статус, без редактирования замера.</small>
  </div>`;
}

async function updateProductionStatus(status) {
  if (!state.selected?.id) return;
  const { data, error } = await supabaseClient
    .from("measurements")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", state.selected.id)
    .select("*, clients(*)")
    .single();
  if (error) throw error;
  state.selected = data;
  state.measurements = state.measurements.map((m) => m.id === data.id ? data : m).filter(isProductionReady);
  renderList();
  await loadPhotos(data);
  renderCard();
}

function renderCard() {
  const card = $("#prod-card");
  const empty = $("#prod-empty");
  const m = state.selected;
  if (!m) return;
  const c = m.clients || {};
  const project = parseJson(m.drawing_project_json, {});
  const finish = parseJson(m.finish_dimensions_json, { settings: {}, steps: [], landings: [], boots: [], comments: [] });
  card.classList.remove("hidden");
  empty.classList.add("hidden");
  syncProductionLayoutState();
  const svg = enhanceProductionSvg(m.drawing_svg || "", m, project);
  const issues = collectIssues(m, project, finish, svg);
  const detailed = productionMeasurementMode(project) === "detailed";
  card.innerHTML = `
    <header class="production-card-head">
      <div>
        <h2>${escapeHtml(m.number || "Задание")}</h2>
        <p><b>Клиент:</b> ${escapeHtml(c.name || "Без имени")}</p>
        <p><b>Адрес:</b> ${escapeHtml(c.address || "Адрес не указан")}</p>
        <p><b>Телефон:</b> ${escapeHtml(c.phone || "—")}</p>
        ${measurementMeasurerName(m) ? `<p><b>Замерщик:</b> ${escapeHtml(measurementMeasurerName(m))}</p>` : ""}
        <p><b>Тип объекта / схема:</b> ${escapeHtml(m.site_situation || m.object_type || "Тип объекта не указан")} · ${escapeHtml(project.type || m.opening_type || "Схема не выбрана")}</p>
        <div class="production-badges"><span class="production-badge">${escapeHtml(m.status || "Готовый замер")}</span><span class="production-badge">${escapeHtml(project.measurementMode === "detailed" ? "Детальный" : "Простой")}</span><span class="production-badge">${escapeHtml(project.type || m.opening_type || "Схема")}</span></div>
        ${renderProductionStatusControl(m)}
      </div>
      <div class="production-actions no-print">
        <button class="btn secondary" onclick="window.print()">Печать</button>
        <button class="btn secondary" id="back-prod-btn">Назад</button>
        <button class="btn secondary" id="copy-prod-link">Скопировать ссылку</button>
      </div>
    </header>
    ${section("Итоговая схема", svg ? `<div class="production-svg">${svg}</div>` : `<p class="production-empty-line">Схема не сохранена.</p>`)}
    ${section("Требует уточнения", renderIssues(issues))}
    ${section("Размеры каркаса", renderDimensions(m, project))}
    ${section("Условия объекта", renderMarks(project))}
    ${detailed ? section("Чистовые детали", renderFinish(finish)) : ""}
    ${section("Фото объекта", renderPhotos())}
    ${section("Комментарии", `<div class="production-note">${escapeHtml(m.general_comment || m.obstacles_comment || "Комментариев нет.")}</div>`)}
  `;
  bindProductionPhotoFallbacks();
  $("#back-prod-btn")?.addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.href = "./index.html";
  });
  $("#copy-prod-link")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(location.href); alert("Ссылка скопирована"); } catch { alert(location.href); }
  });
  $("#save-production-status")?.addEventListener("click", async () => {
    const status = $("#production-status-select")?.value;
    if (!status) return;
    try { await updateProductionStatus(status); alert("Статус производства обновлён"); } catch (e) { alert(e.message); }
  });
}

function bind() {
  $("#prod-login").addEventListener("click", () => login().catch((e) => setMessage($("#prod-auth-message"), e.message, "error")));
  $("#production-logout").addEventListener("click", logout);
  $("#prod-refresh").addEventListener("click", () => loadMeasurements().catch((e) => alert(e.message)));
  $("#prod-toggle-list")?.addEventListener("click", () => {
    state.listOpen = !state.listOpen;
    syncProductionLayoutState();
  });
  $("#prod-search").addEventListener("input", renderList);
  $("#prod-list").addEventListener("click", (event) => {
    const id = event.target.closest("[data-id]")?.dataset.id;
    if (id) selectMeasurement(id).catch((e) => alert(e.message));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !$("#production-auth").classList.contains("hidden")) {
      login().catch((e) => setMessage($("#prod-auth-message"), e.message, "error"));
    }
  });
}

bind();
init().catch((error) => {
  console.error(error);
  setMessage($("#prod-auth-message"), error.message, "error");
});
