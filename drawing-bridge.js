(() => {
  const ROOT_ID = "drawing-bridge-root";
  const STYLE_ID = "drawing-bridge-style-v14";
  const SECTION_STORAGE_KEY = "tekstura:drawing-bridge:sections:v15-simple";

  const DESKTOP_VIEW = { w: 1100, h: 760 };
  const TABLET_VIEW = { w: 960, h: 780 };
  const PHONE_VIEW = { w: 820, h: 1100 };
  const DEFAULT_STEP_DEPTH = 250;
  const DEFAULT_RISER = 180;
  const DEFAULT_FINISH_THICKNESS = 40;

  const EXTRA_FIELDS = [
    "flight1_steps_count",
    "flight2_steps_count",
    "winder_steps_count",
    "platform_count",
    "riser_height_mm",
    "tread_depth_mm",
    "tread_depth_flight1_mm",
    "tread_depth_flight2_mm",
    "drawing_project_json",
    "drawing_svg",
    "finish_dimensions_json",
  ];

  const VARIANTS = [
    { key: "empty_straight", mode: "empty", label: "Пустой прямой проём", opening: "straight", turn: "" },
    { key: "empty_l_left", mode: "empty", label: "Пустой Г-проём левый", opening: "l_left", turn: "" },
    { key: "empty_l_right", mode: "empty", label: "Пустой Г-проём правый", opening: "l_right", turn: "" },
    { key: "ready_straight", mode: "ready", label: "Прямая лестница", opening: "straight", turn: "" },
    { key: "ready_l_left_landing", mode: "ready", label: "Г-образная левая с площадкой", opening: "l_left", turn: "landing" },
    { key: "ready_l_right_landing", mode: "ready", label: "Г-образная правая с площадкой", opening: "l_right", turn: "landing" },
    { key: "ready_l_left_winder", mode: "ready", label: "Г-образная левая с забежными", opening: "l_left", turn: "winder" },
    { key: "ready_l_right_winder", mode: "ready", label: "Г-образная правая с забежными", opening: "l_right", turn: "winder" },
    { key: "ready_u_landing_left", mode: "ready", label: "П-образная с площадкой, старт слева", opening: "u", turn: "landing", side: "left" },
    { key: "ready_u_landing_right", mode: "ready", label: "П-образная с площадкой, старт справа", opening: "u", turn: "landing", side: "right" },
    { key: "ready_u_winder_left", mode: "ready", label: "П-образная с забежными, старт слева", opening: "u", turn: "winder", side: "left" },
    { key: "ready_u_winder_right", mode: "ready", label: "П-образная с забежными, старт справа", opening: "u", turn: "winder", side: "right" },
  ];

  const DEFAULT_PROJECT = {
    schemaVersion: 2,
    type: "empty_straight",
    units: "mm",
    measurementMode: "simple",
    showFields: true,
    activeParam: "",
    activeZone: "",
    activeWindowId: "",
    autoCalc: {
      flight1Length: true,
      flight2Length: true,
    },
    treadMode: {
      sameTread: true,
      b1: 250,
      b2: 250,
    },
    walls: {
      flight1: { left: false, right: false },
      flight2: { left: false, right: false },
      turn: { left: false, right: false, top: false, bottom: false },
    },
    hasWindows: false,
    windows: [],
    ascent: {
      show: true,
      flight1: "start_to_turn",
      flight2: "turn_to_exit",
    },
    topBalustrade: {
      enabled: false,
      sides: ["top"],
      length_mm: 0,
      height_mm: 900,
      material: "",
      comment: "",
    },
    edgeExtensions: [],
    obstacles: [],
    notes: [],
    params: {},
  };

  const DEFAULT_FINISH = {
    settings: {
      side_overhang_mm: 40,
      front_overhang_mm: 40,
      tread_overhang_mm: 40,
      add_boots_by_walls: false,
    },
    steps: [],
    landings: [],
    boots: [],
    comments: [],
  };

  const OPTION_LIST_IDS = window.TeksturaOptionLists?.optionListIds || {
    stepMaterials: "tekstura-step-materials",
    bootMaterials: "tekstura-boot-materials",
    finishes: "tekstura-finishes",
  };

  let projectState = null;
  let finishState = null;
  let loadedKey = "";
  let renderTimer = null;
  let lastSvg = "";
  const fieldDrafts = new Map();

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  function injectStyle() {
    if ($("#" + STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      body:has(.tab.active[data-tab="sizes"]) .stats-grid,
      body:has(.tab.active[data-tab="sizes"]) .toolbar,
      body:has(.tab.active[data-tab="sizes"]) .list-panel{display:none!important}
      body:has(.tab.active[data-tab="sizes"]) .layout{display:block!important;max-width:none!important}
      body:has(.tab.active[data-tab="sizes"]) .detail-panel{width:100%!important;max-width:none!important}
      body:has(.tab.active[data-tab="sizes"]) .detail-panel.card{padding:12px!important}
      .db-legacy-hidden{display:none!important}
      #${ROOT_ID}{width:100%;color:#0f172a}
      #${ROOT_ID} *{box-sizing:border-box}
      .db-shell{display:grid;grid-template-columns:minmax(320px,430px) minmax(420px,1fr);gap:14px;align-items:start}
      .db-left,.db-right{display:grid;gap:10px}
      .db-section{border:1px solid #d9e2ef;border-radius:14px;background:#fff;box-shadow:0 8px 24px rgba(15,23,42,.04);overflow:hidden}
      .db-section>summary{list-style:none;display:flex;align-items:center;gap:8px;min-height:46px;padding:0 14px;cursor:pointer;font-size:14px;font-weight:950;color:#0f172a;background:#f8fbff;border-bottom:1px solid transparent}
      .db-section>summary::-webkit-details-marker{display:none}
      .db-section[open]>summary{border-bottom-color:#e3ebf5}
      .db-section>summary::before{content:"›";display:inline-grid;place-items:center;width:20px;height:20px;border-radius:999px;background:#e8eef7;color:#334155;font-size:18px;line-height:1;transform:rotate(0deg);transition:.15s}
      .db-section[open]>summary::before{transform:rotate(90deg);background:#0f172a;color:#fff}
      .db-section-body{padding:12px;display:grid;gap:12px}

      .db-mode-empty .db-auto{display:none!important}
      .db-mode-empty .db-field-row{grid-template-columns:minmax(0,1fr)!important}
      .db-mode-empty [data-auto]{display:none!important}
      .db-mode-empty label.db-auto{display:none!important}
      .db-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      .db-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}
      .db-grid.one{grid-template-columns:1fr}
      .db-field{display:grid;gap:5px}
      .db-field label,.db-mini-label{font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.04em;color:#64748b}
      .db-field input,.db-field select,.db-field textarea,.db-card input,.db-card select,.db-card textarea{width:100%;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#0f172a;font-size:14px;font-weight:800;min-height:40px;padding:0 10px;outline:none}
      .db-field textarea,.db-card textarea{min-height:70px;padding:9px 10px;resize:vertical;font-weight:700;line-height:1.3}
      .db-field input:focus,.db-field select:focus,.db-field textarea:focus,.db-card input:focus,.db-card select:focus,.db-card textarea:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.12)}
      .db-field.is-active input,.db-field.is-active select{border-color:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.18)}
      .db-field-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:end}
      .db-auto{display:flex;align-items:center;gap:5px;height:40px;padding:0 8px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;font-size:12px;font-weight:950;color:#334155;white-space:nowrap}
      .db-auto input{width:auto;min-height:auto}
      .db-check{display:flex;align-items:center;gap:8px;min-height:40px;padding:8px 10px;border:1px solid #d9e2ef;border-radius:10px;background:#fbfdff;font-size:13px;font-weight:850;color:#334155}
      .db-check input{width:auto;min-height:auto}
      .db-actions{display:flex;flex-wrap:wrap;gap:8px}
      .db-btn{border:0;border-radius:11px;min-height:40px;padding:0 12px;background:#e8eef7;color:#0f172a;font-size:13px;font-weight:950;cursor:pointer}
      .db-btn.primary{background:#0f172a;color:#fff}
      .db-btn.danger{background:#fee2e2;color:#991b1b}
      .db-btn.ghost{background:#fff;border:1px solid #cbd5e1}
      .db-btn:hover{filter:brightness(.98)}
      .db-svg-wrap{position:relative;min-height:650px;border:1px solid #d9e2ef;border-radius:14px;background:#fff;overflow:hidden;display:grid;grid-template-rows:minmax(650px,1fr) auto}
      .db-svg-wrap svg{width:100%;height:650px;min-height:650px;display:block;background:#fff}
      .db-svg-wrap.fields-hidden .db-on-svg-fields{display:none}
      .db-on-svg-fields{position:relative;inset:auto;display:grid;grid-template-columns:repeat(6,minmax(84px,1fr));gap:7px;pointer-events:auto;padding:10px;background:#f8fbff;border-top:1px solid #d9e2ef}
      .db-mini-input{display:grid;grid-template-columns:36px minmax(0,1fr);align-items:center;border:1px solid #cbd5e1;border-radius:9px;background:rgba(255,255,255,.95);box-shadow:0 8px 18px rgba(15,23,42,.06);overflow:hidden}
      .db-mini-input span{height:34px;display:grid;place-items:center;background:#0f172a;color:#fff;font-size:11px;font-weight:950}
      .db-mini-input input{border:0;border-radius:0;min-height:34px;text-align:center;font-size:13px;font-weight:950;padding:0 4px}
      .db-mini-input.is-active{outline:3px solid rgba(245,158,11,.2)}
      .db-measurement-simple .db-section:not([open])>summary{min-height:40px;background:#fff}
      .db-measurement-simple .db-section-body{gap:8px}
      .db-measurement-simple h4{margin:4px 0 0;font-size:13px}
      .db-card-list{display:grid;gap:8px}
      .db-card{border:1px solid #d9e2ef;border-radius:12px;background:#fbfdff;padding:10px;display:grid;gap:8px}
      .db-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:950;color:#0f172a}
      .db-card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .db-warning{padding:8px 10px;border-radius:10px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:12px;font-weight:800;line-height:1.3}
      .db-muted{font-size:12px;line-height:1.35;color:#64748b;font-weight:750}
      .db-svg .grid-line{stroke:#eef2f7;stroke-width:1}
      .db-svg .outline{fill:#fff;stroke:#0f172a;stroke-width:2.2;vector-effect:non-scaling-stroke}
      .db-svg .zone{fill:#f8fafc;stroke:#0f172a;stroke-width:2;vector-effect:non-scaling-stroke;cursor:pointer}
      .db-svg .zone.turn{fill:#eef6ff}
      .db-svg .zone.active,.db-svg .dimension.active{filter:drop-shadow(0 0 7px rgba(245,158,11,.45))}
      .db-svg .tread{stroke:#64748b;stroke-width:1.25;vector-effect:non-scaling-stroke}
      .db-svg .winder-step{fill:#eef6ff;stroke:#1e293b;stroke-width:1.4;vector-effect:non-scaling-stroke}
      .db-svg .winder-envelope{fill:#e0f2fe;stroke:#0f172a;stroke-width:2;vector-effect:non-scaling-stroke}
      .db-svg .route{fill:none;stroke:#0f172a;stroke-width:2.8;marker-end:url(#db-arrow);vector-effect:non-scaling-stroke}
      .db-svg .dimension line,.db-svg .dimension path{stroke:#0f172a;stroke-width:1.6;marker-start:url(#db-tick);marker-end:url(#db-tick);vector-effect:non-scaling-stroke}
      .db-svg .dimension text{font:800 15px system-ui, sans-serif;fill:#0f172a;paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round;cursor:pointer}
      .db-svg .dim-hit,.db-svg .wall-hit,.db-svg .window-hit,.db-svg .zone-hit{stroke:transparent;stroke-width:18;fill:transparent;cursor:pointer;pointer-events:stroke}
      .db-svg .wall-mark{stroke:#6b7280;stroke-width:9;stroke-linecap:square;vector-effect:non-scaling-stroke}
      .db-svg .wall-label{font:900 12px system-ui, sans-serif;fill:#4b5563;paint-order:stroke;stroke:#fff;stroke-width:4px}
      .db-svg .ascent-line{fill:none;stroke:#2563eb;stroke-width:3.2;stroke-linecap:round;stroke-dasharray:10 6;marker-end:url(#db-ascent-arrow);vector-effect:non-scaling-stroke;cursor:pointer;opacity:.92}
      .db-svg .ascent-hit{stroke:transparent;stroke-width:24;fill:none;cursor:pointer;pointer-events:stroke}
      .db-svg .ascent-text{font:950 12px system-ui,sans-serif;fill:#1d4ed8;paint-order:stroke;stroke:#fff;stroke-width:5px}
      .db-svg .balustrade-line{fill:none;stroke:#2563eb;stroke-width:6;stroke-dasharray:14 8;stroke-linecap:round;vector-effect:non-scaling-stroke}
      .db-svg .balustrade-text{font:900 12px system-ui,sans-serif;fill:#1d4ed8;paint-order:stroke;stroke:#fff;stroke-width:4px}
      .db-svg .edge-extension{fill:none;stroke:#475569;stroke-width:3;stroke-dasharray:10 8;vector-effect:non-scaling-stroke}
      .db-svg .edge-extension-dim{font:900 11px system-ui,sans-serif;fill:#334155;paint-order:stroke;stroke:#fff;stroke-width:4px}
      .db-svg .obstacle-mark{fill:#fff7ed;stroke:#ea580c;stroke-width:3;vector-effect:non-scaling-stroke}
      .db-svg .obstacle-text{font:900 11px system-ui,sans-serif;fill:#9a3412;paint-order:stroke;stroke:#fff;stroke-width:4px}
      .db-card-grid.four{grid-template-columns:repeat(4,minmax(0,1fr))}
      .db-svg .window-line{stroke:#0284c7;stroke-width:5;stroke-linecap:square;vector-effect:non-scaling-stroke}
      .db-svg .window-glass{stroke:#7dd3fc;stroke-width:2;vector-effect:non-scaling-stroke}
      .db-svg .window-text{font:900 13px system-ui, sans-serif;fill:#0369a1;paint-order:stroke;stroke:#fff;stroke-width:4px}
      .db-svg .step-no{font:800 11px system-ui, sans-serif;fill:#475569;paint-order:stroke;stroke:#fff;stroke-width:3px;text-anchor:middle}
      .db-svg .caption{font:900 16px system-ui, sans-serif;fill:#0f172a;paint-order:stroke;stroke:#fff;stroke-width:4px}
      @media(max-width:1000px){
        body:has(.tab.active[data-tab="sizes"]) main{padding:0 2px}
        body:has(.tab.active[data-tab="sizes"]) .detail-panel.card{padding:2px!important}
        .db-shell{grid-template-columns:1fr;gap:6px}
        .db-right{order:-1}
        .db-section{border-radius:14px;box-shadow:none}
        .db-section>summary{padding:10px 12px}
        .db-section-body{padding:8px}
        .db-svg-wrap{min-height:58vh;grid-template-rows:minmax(58vh,auto) auto;padding:2px;border-radius:12px}
        .db-svg-wrap svg{height:58vh;min-height:520px;width:100%}
        .db-on-svg-fields{grid-template-columns:repeat(2,minmax(0,1fr));padding:5px;gap:5px}
        .db-mini-input{min-height:36px;padding:5px 7px;border-radius:10px}.db-mini-input input{height:28px;font-size:16px}
        .db-grid,.db-grid.three,.db-card-grid{grid-template-columns:1fr;gap:8px}
        .db-actions{display:grid;grid-template-columns:1fr;gap:6px}
        .db-btn{min-height:40px;padding:8px 10px;border-radius:12px}
      }
      @media(max-width:430px){
        .db-svg-wrap{min-height:60vh;grid-template-rows:minmax(60vh,auto) auto}
        .db-svg-wrap svg{height:60vh;min-height:540px}
      }
      @media(min-width:721px) and (max-width:1000px){
        .db-svg-wrap{min-height:620px;grid-template-rows:minmax(620px,auto) auto}
        .db-svg-wrap svg{height:620px;min-height:620px}
      }
    `;
    document.head.appendChild(style);
  }

  function form() {
    return $("#measurement-form");
  }

  function panel() {
    return $('[data-panel="sizes"]');
  }

  function isActive() {
    const p = panel();
    return Boolean(p && !p.classList.contains("hidden") && form() && !form().classList.contains("hidden"));
  }

  function selectedKey() {
    return ($("#form-title")?.textContent || "new").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function safeParse(raw, fallback) {
    if (!raw || typeof raw !== "string") return clone(fallback);
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : clone(fallback);
    } catch {
      return clone(fallback);
    }
  }

  function mergeDeep(base, extra) {
    const result = clone(base);
    if (!extra || typeof extra !== "object") return result;
    Object.entries(extra).forEach(([key, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value) && result[key] && typeof result[key] === "object" && !Array.isArray(result[key])) {
        result[key] = mergeDeep(result[key], value);
      } else {
        result[key] = value;
      }
    });
    return result;
  }

  function ensureHidden(name) {
    const f = form();
    if (!f) return null;
    let input = f.querySelector(`[name="${name}"]`);
    if (!input && EXTRA_FIELDS.includes(name)) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      f.appendChild(input);
    }
    return input;
  }

  function ensureExtraFields() {
    EXTRA_FIELDS.forEach(ensureHidden);
  }

  function readField(name) {
    const input = ensureHidden(name);
    if (!input) return "";
    if (input.type === "checkbox") return input.checked ? "1" : "";
    return input.value || "";
  }

  function writeField(name, value, silent = false) {
    const input = ensureHidden(name);
    if (!input) return;
    const next = value === null || value === undefined ? "" : String(value);
    if (input.type === "checkbox") {
      input.checked = Boolean(value);
    } else if (input.value !== next) {
      input.value = next;
    }
    if (!silent) {
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function numberField(name, fallback = 0) {
    const raw = readField(name);
    const value = Number(raw);
    return Number.isFinite(value) && raw !== "" ? value : fallback;
  }

  function intField(name, fallback = 0) {
    return Math.max(0, Math.round(numberField(name, fallback)));
  }

  function containsAny(value, words) {
    const normalized = String(value || "").toLowerCase();
    return words.some((word) => normalized.includes(String(word).toLowerCase()));
  }

  function inferVariantKeyFromForm() {
    const site = readField("site_situation");
    const opening = readField("opening_type");
    const turn = readField("turn_type");
    const direction = readField("stair_direction");
    const ready = containsAny(site, ["Готов", "Р“РѕС‚", "бетон", "Р±РµС‚", "каркас", "РєР°СЂ"]);
    const straight = containsAny(opening, ["Прям", "РџСЂСЏ"]);
    const uShape = containsAny(opening, ["П-", "Рџ-"]);
    const right = containsAny(opening, ["прав", "РїСЂР°РІ"]) || containsAny(direction, ["справа", "СЃРїСЂР°РІ"]);
    const winder = containsAny(turn, ["Заб", "Р—Р°Р±"]);

    if (!ready && straight) return "empty_straight";
    if (!ready) return right ? "empty_l_right" : "empty_l_left";
    if (straight) return "ready_straight";
    if (uShape) {
      if (winder) return right ? "ready_u_winder_right" : "ready_u_winder_left";
      return right ? "ready_u_landing_right" : "ready_u_landing_left";
    }
    if (winder) return right ? "ready_l_right_winder" : "ready_l_left_winder";
    return right ? "ready_l_right_landing" : "ready_l_left_landing";
  }

  function currentVariantKeyFromForm() {
    if (projectState?.type && VARIANTS.some((item) => item.key === projectState.type)) return projectState.type;
    return inferVariantKeyFromForm();
  }

  function variant() {
    const key = currentVariantKeyFromForm();
    return VARIANTS.find((item) => item.key === key) || VARIANTS[0];
  }

  function measurementMode() {
    return projectState?.measurementMode === "detailed" ? "detailed" : "simple";
  }

  function isDetailedMode() {
    return measurementMode() === "detailed";
  }

  function shouldRenderSiteMarks() {
    const currentMode = variant().mode;
    return isDetailedMode() || currentMode === "empty" || currentMode === "ready";
  }

  function setMeasurementMode(mode) {
    projectState.measurementMode = mode === "detailed" ? "detailed" : "simple";
    saveState();
    scheduleRender();
  }

  function setSelectByMatch(name, matchers, fallback) {
    const input = ensureHidden(name);
    if (!input) return;
    if (input.tagName === "SELECT") {
      const option = Array.from(input.options).find((item) => matchers.some((matcher) => matcher(item.value) || matcher(item.textContent || "")));
      if (option) {
        input.value = option.value;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
    }
    writeField(name, fallback);
  }

  function setVariant(key) {
    const next = VARIANTS.find((item) => item.key === key) || VARIANTS[0];
    projectState.type = next.key;
    if (next.mode === "empty") {
      setSelectByMatch("site_situation", [(v) => containsAny(v, ["Пуст", "РџСѓСЃС‚"])], "Пустой проём");
    } else {
      setSelectByMatch("site_situation", [(v) => containsAny(v, ["Готов", "Р“РѕС‚", "бетон", "Р±РµС‚", "каркас", "РєР°СЂ"])], "Готовое основание");
    }

    if (next.opening === "straight") {
      setSelectByMatch("opening_type", [(v) => containsAny(v, ["Прям", "РџСЂСЏ"])], "Прямой");
    } else if (next.opening === "u") {
      setSelectByMatch("opening_type", [(v) => containsAny(v, ["П-", "Рџ-"])], "П-образный");
    } else if (next.opening === "l_right") {
      setSelectByMatch("opening_type", [(v) => containsAny(v, ["Г-", "Р“-"]) && containsAny(v, ["прав", "РїСЂР°РІ"])], "Г-образный правый");
    } else {
      setSelectByMatch("opening_type", [(v) => containsAny(v, ["Г-", "Р“-"]) && containsAny(v, ["лев", "Р»РµРІ"])], "Г-образный левый");
    }

    if (!next.turn) {
      writeField("turn_type", "");
    } else if (next.turn === "winder") {
      setSelectByMatch("turn_type", [(v) => containsAny(v, ["Заб", "Р—Р°Р±"])], "Забежные");
    } else {
      setSelectByMatch("turn_type", [(v) => containsAny(v, ["Площад", "РџР»РѕС‰"])], "Площадка");
    }
    if (next.side) writeField("stair_direction", next.side === "right" ? "Старт справа" : "Старт слева");
    applyAutoCalc();
    scheduleRender();
  }

  function refreshState(force = false) {
    ensureExtraFields();
    const key = selectedKey();
    if (!force && projectState && finishState && loadedKey === key) return;
    loadedKey = key;
    const rawProject = readField("drawing_project_json");
    projectState = mergeDeep(DEFAULT_PROJECT, safeParse(rawProject, DEFAULT_PROJECT));
    finishState = mergeDeep(DEFAULT_FINISH, safeParse(readField("finish_dimensions_json"), DEFAULT_FINISH));
    projectState.measurementMode = projectState.measurementMode === "detailed" ? "detailed" : "simple";
    if (!rawProject || !projectState.type || !VARIANTS.some((item) => item.key === projectState.type)) {
      projectState.type = inferVariantKeyFromForm();
    }
    hydrateFieldsFromProjectParams();
    normalizeTreadMode();
    if (finishState.settings?.tread_overhang_mm && !finishState.settings.side_overhang_mm && !finishState.settings.front_overhang_mm) {
      finishState.settings.side_overhang_mm = Number(finishState.settings.tread_overhang_mm) || 40;
      finishState.settings.front_overhang_mm = Number(finishState.settings.tread_overhang_mm) || 40;
    }
    if (!readField("tread_depth_mm")) writeField("tread_depth_mm", DEFAULT_STEP_DEPTH, true);
    if (!readField("riser_height_mm")) writeField("riser_height_mm", DEFAULT_RISER, true);
    if (!readField("flight1_steps_count")) writeField("flight1_steps_count", 10, true);
    if (!readField("flight2_steps_count")) writeField("flight2_steps_count", 8, true);
    if (!readField("winder_steps_count")) writeField("winder_steps_count", 3, true);
    normalizeTreadMode();
  }

  function hydrateFieldsFromProjectParams() {
    const params = projectState?.params || {};
    const map = {
      height: "height_clean_to_clean_mm",
      slabThickness: "slab_thickness_mm",
      T: "slab_thickness_mm",
      openingLength: "opening_length_mm",
      openingWidth: "opening_width_mm",
      firstFlightLength: "flight1_length_mm",
      firstFlightWidth: "flight1_width_mm",
      firstFlightSteps: "flight1_steps_count",
      secondFlightLength: "flight2_length_mm",
      secondFlightWidth: "flight2_width_mm",
      secondFlightSteps: "flight2_steps_count",
      turnLength: "corner_zone_length_mm",
      turnWidth: "corner_zone_width_mm",
      winderSteps: "winder_steps_count",
      riserHeight: "riser_height_mm",
      treadDepth: "tread_depth_mm",
      b: "tread_depth_mm",
      treadDepthFlight1: "tread_depth_flight1_mm",
      treadDepthFlight2: "tread_depth_flight2_mm",
      b1: "tread_depth_flight1_mm",
      b2: "tread_depth_flight2_mm",
    };
    Object.entries(map).forEach(([paramName, fieldName]) => {
      const value = params[paramName];
      if ((readField(fieldName) === "" || readField(fieldName) === null) && value !== undefined && value !== null && value !== "") {
        writeField(fieldName, value, true);
      }
    });
  }

  function normalizeTreadMode() {
    if (!projectState.treadMode) projectState.treadMode = clone(DEFAULT_PROJECT.treadMode);
    const params = projectState.params || {};
    const fallback = Number(params.b ?? params.treadDepth ?? readField("tread_depth_mm") ?? DEFAULT_STEP_DEPTH) || DEFAULT_STEP_DEPTH;
    const sameTread = projectState.treadMode.sameTread !== false;
    projectState.treadMode.sameTread = sameTread;

    if (!projectState.treadMode.b1) projectState.treadMode.b1 = Number(params.b1 ?? params.treadDepthFlight1 ?? fallback) || fallback;
    if (!projectState.treadMode.b2) projectState.treadMode.b2 = Number(params.b2 ?? params.treadDepthFlight2 ?? fallback) || fallback;
    if (!readField("tread_depth_mm")) writeField("tread_depth_mm", fallback, true);
    if (!readField("tread_depth_flight1_mm")) writeField("tread_depth_flight1_mm", projectState.treadMode.b1, true);
    if (!readField("tread_depth_flight2_mm")) writeField("tread_depth_flight2_mm", projectState.treadMode.b2, true);

    if (sameTread) {
      const common = numberField("tread_depth_mm", fallback);
      projectState.treadMode.b1 = common;
      projectState.treadMode.b2 = common;
      writeField("tread_depth_flight1_mm", common, true);
      writeField("tread_depth_flight2_mm", common, true);
    } else {
      projectState.treadMode.b1 = numberField("tread_depth_flight1_mm", projectState.treadMode.b1 || fallback);
      projectState.treadMode.b2 = numberField("tread_depth_flight2_mm", projectState.treadMode.b2 || fallback);
    }
  }

  function treadValues() {
    normalizeTreadMode();
    const sameTread = !isDetailedMode() || projectState.treadMode.sameTread !== false;
    const common = numberField("tread_depth_mm", projectState.treadMode.b1 || DEFAULT_STEP_DEPTH);
    const b1 = sameTread ? common : numberField("tread_depth_flight1_mm", common);
    const b2 = sameTread ? common : numberField("tread_depth_flight2_mm", common);
    return { sameTread, b: common, b1, b2 };
  }

  function collectParams() {
    const tread = treadValues();
    return {
      height: numberField("height_clean_to_clean_mm", 0),
      slabThickness: numberField("slab_thickness_mm", 0),
      T: numberField("slab_thickness_mm", 0),
      openingLength: numberField("opening_length_mm", 0),
      openingWidth: numberField("opening_width_mm", 0),
      firstFlightLength: numberField("flight1_length_mm", 0),
      firstFlightWidth: numberField("flight1_width_mm", 0),
      firstFlightSteps: intField("flight1_steps_count", 0),
      secondFlightLength: numberField("flight2_length_mm", 0),
      secondFlightWidth: numberField("flight2_width_mm", 0),
      secondFlightSteps: intField("flight2_steps_count", 0),
      turnLength: numberField("corner_zone_length_mm", 0),
      turnWidth: numberField("corner_zone_width_mm", 0),
      winderSteps: intField("winder_steps_count", 0),
      riserHeight: numberField("riser_height_mm", 0),
      treadDepth: tread.b,
      b: tread.b,
      treadDepthFlight1: tread.b1,
      treadDepthFlight2: tread.b2,
      b1: tread.b1,
      b2: tread.b2,
    };
  }

  function saveState(svgText = lastSvg) {
    if (!projectState || !finishState) return;
    projectState.schemaVersion = 2;
    projectState.units = "mm";
    projectState.type = variant().key;
    projectState.params = collectParams();
    writeField("drawing_project_json", JSON.stringify({
      schemaVersion: projectState.schemaVersion,
      type: projectState.type,
      units: projectState.units,
      measurementMode: measurementMode(),
      params: projectState.params,
      autoCalc: projectState.autoCalc,
      treadMode: projectState.treadMode,
      walls: projectState.walls,
      hasWindows: projectState.hasWindows,
      windows: projectState.windows,
      ascent: projectState.ascent,
      topBalustrade: projectState.topBalustrade,
      edgeExtensions: projectState.edgeExtensions,
      obstacles: projectState.obstacles,
      notes: projectState.notes,
      showFields: projectState.showFields,
    }), true);
    writeField("finish_dimensions_json", JSON.stringify(finishState), true);
    if (svgText) writeField("drawing_svg", svgText, true);
  }

  function applyAutoCalc() {
    refreshState();
    const v = variant();
    if (v.mode === "empty") return;
    const tread = treadValues();
    const n1 = intField("flight1_steps_count", 0);
    const n2 = intField("flight2_steps_count", 0);
    const forceSimpleReady = !isDetailedMode();
    if ((forceSimpleReady || projectState.autoCalc.flight1Length) && tread.b1 > 0 && n1 > 0) writeField("flight1_length_mm", n1 * tread.b1, true);
    if ((forceSimpleReady || projectState.autoCalc.flight2Length) && tread.b2 > 0 && n2 > 0) writeField("flight2_length_mm", n2 * tread.b2, true);
  }

  function getSectionState() {
    const defaults = isDetailedMode()
      ? {
          frame: true,
          scheme: true,
          actions: false,
          walls: false,
          windows: false,
          finish: false,
          comments: false,
        }
      : {
          frame: true,
          scheme: true,
          ascent: false,
          upperBalustrade: false,
          siteMarks: false,
          comments: true,
          actions: false,
          walls: false,
          windows: false,
          finish: false,
        };
    const parsed = safeParse(localStorage.getItem(SECTION_STORAGE_KEY), {});
    const state = { ...defaults, ...parsed };
    if (!isDetailedMode()) {
      state.frame = true;
      state.scheme = true;
      state.ascent = Boolean(parsed.ascent);
      state.upperBalustrade = Boolean(parsed.upperBalustrade);
      state.siteMarks = Boolean(parsed.siteMarks);
      state.comments = true;
    }
    return state;
  }

  function saveSectionState(id, open) {
    const state = getSectionState();
    state[id] = open;
    localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(state));
  }

  function section(id, title, content) {
    const state = getSectionState();
    return `<details class="db-section" data-section="${id}" ${state[id] ? "open" : ""}>
      <summary>${escapeHtml(title)}</summary>
      <div class="db-section-body">${content}</div>
    </details>`;
  }

  function visibleParams() {
    const v = variant();
    if (!isDetailedMode()) {
      if (v.key === "empty_straight") return ["L", "W", "H", "T"];
      if (v.mode === "empty") return ["M1", "B1", "M2", "B2", "ZL", "ZW", "H", "T"];
      if (v.key === "ready_straight") return ["B1", "N1"];
      if (v.turn === "winder") return ["B1", "N1", "B2", "N2", "ZN"];
      return ["B1", "N1", "B2", "N2"];
    }
    const tread = projectState?.treadMode?.sameTread !== false ? ["b"] : ["b1", "b2"];
    const withOptionalH = (items) => [...items, "H"];
    if (v.key === "empty_straight") return withOptionalH(["L", "W"]);
    if (v.mode === "empty") return withOptionalH(["M1", "B1", "M2", "B2", "ZL", "ZW"]);
    if (v.key === "ready_straight") return withOptionalH(["M1", "B1", "N1", "h", ...(projectState?.treadMode?.sameTread !== false ? ["b"] : ["b1"])]);
    return withOptionalH(["M1", "B1", "N1", "M2", "B2", "N2", "ZL", "ZW", "ZN", "h", ...tread]);
  }

  const FIELD_META = {
    L: { name: "opening_length_mm", label: "L — длина проёма", unit: "мм" },
    W: { name: "opening_width_mm", label: "W — ширина проёма", unit: "мм" },
    H: { name: "height_clean_to_clean_mm", label: "H — высота от пола до пола", unit: "мм" },
    T: { name: "slab_thickness_mm", label: "T — толщина перекрытия/проёма", unit: "мм" },
    M1: { name: "flight1_length_mm", label: "M1 — длина марша 1", unit: "мм", auto: "flight1Length" },
    B1: { name: "flight1_width_mm", label: "B1 — ширина марша 1", unit: "мм" },
    N1: { name: "flight1_steps_count", label: "N1 — ступени марша 1", unit: "шт" },
    M2: { name: "flight2_length_mm", label: "M2 — длина марша 2", unit: "мм", auto: "flight2Length" },
    B2: { name: "flight2_width_mm", label: "B2 — ширина марша 2", unit: "мм" },
    N2: { name: "flight2_steps_count", label: "N2 — ступени марша 2", unit: "шт" },
    ZL: { name: "corner_zone_length_mm", label: "ZL — длина поворотной зоны", unit: "мм" },
    ZW: { name: "corner_zone_width_mm", label: "ZW — ширина поворотной зоны", unit: "мм" },
    ZN: { name: "winder_steps_count", label: "ZN — забежные ступени", unit: "шт" },
    h: { name: "riser_height_mm", label: "h — подступёнок", unit: "мм" },
    b: { name: "tread_depth_mm", label: "b — проступь каркаса", unit: "мм" },
    b1: { name: "tread_depth_flight1_mm", label: "b1 — проступь марша 1", unit: "мм" },
    b2: { name: "tread_depth_flight2_mm", label: "b2 — проступь марша 2", unit: "мм" },
  };

  function numericInputAttrs() {
    return 'type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off"';
  }

  function cleanNumericDraft(value) {
    return String(value ?? "").replace(/[^\d]/g, "");
  }

  function readDraftField(name) {
    return fieldDrafts.has(name) ? fieldDrafts.get(name) : readField(name);
  }

  function fieldControl(code) {
    const meta = FIELD_META[code];
    const v = variant();
    const isEmptyOpening = v.mode === "empty" || String(projectState.type || "").startsWith("empty_");
    const isActiveField = projectState.activeParam === code || (projectState.activeZone === "flight1" && ["M1", "B1", "N1"].includes(code)) || (projectState.activeZone === "flight2" && ["M2", "B2", "N2"].includes(code)) || (projectState.activeZone === "turn" && ["ZL", "ZW", "ZN"].includes(code));
    const autoKey = isDetailedMode() && !isEmptyOpening && v.mode === "ready" && meta.auto ? meta.auto : "";
    const auto = autoKey ? Boolean(projectState.autoCalc[autoKey]) : false;
    const readonly = autoKey && auto ? "readonly" : "";
    return `<div class="db-field ${isActiveField ? "is-active" : ""}" data-field-wrap="${code}">
      <label for="db-field-${code}">${escapeHtml(meta.label)}</label>
      <div class="${autoKey ? "db-field-row" : ""}">
        <input id="db-field-${code}" data-field="${meta.name}" data-param-code="${code}" ${numericInputAttrs()} value="${escapeHtml(readDraftField(meta.name))}" ${readonly}/>
        ${autoKey ? `<label class="db-auto"><input type="checkbox" data-auto="${autoKey}" ${auto ? "checked" : ""}/> авто</label>` : ""}
      </div>
    </div>`;
  }

  function miniFields() {
    return visibleParams().map((code) => {
      const meta = FIELD_META[code];
      const active = projectState.activeParam === code ? "is-active" : "";
      const vMini = variant();
      const emptyMini = vMini.mode === "empty" || String(projectState.type || "").startsWith("empty_");
      const readonly = isDetailedMode() && !emptyMini && vMini.mode === "ready" && meta.auto && projectState.autoCalc[meta.auto] ? "readonly" : "";
      return `<label class="db-mini-input ${active}" title="${escapeHtml(meta.label)}">
        <span>${escapeHtml(code)}</span>
        <input data-field="${meta.name}" data-param-code="${code}" ${numericInputAttrs()} value="${escapeHtml(readDraftField(meta.name))}" ${readonly}/>
      </label>`;
    }).join("");
  }

  function calculatedLengthRows() {
    const v = variant();
    if (isDetailedMode() || v.mode !== "ready") return "";
    const tread = treadValues();
    const n1 = intField("flight1_steps_count", 0);
    const n2 = intField("flight2_steps_count", 0);
    const row = (label, countLabel, stepLabel, steps, depth) => {
      if (steps > 0 && depth > 0) return `${label} рассчитано: ${countLabel} × ${stepLabel} = ${steps * depth} мм (${steps} × ${depth} мм)`;
      return `${label} рассчитается после ввода ${countLabel}`;
    };
    const rows = [row("M1", "N1", "b1", n1, tread.b1)];
    if (v.opening !== "straight") rows.push(row("M2", "N2", "b2", n2, tread.b2));
    return `<div class="db-muted">${rows.map(escapeHtml).join("<br>")}</div>`;
  }

  function frameSection() {
    const v = variant();
    const mode = v.mode;
    const options = VARIANTS.filter((item) => item.mode === mode).map((item) => `<option value="${item.key}" ${item.key === v.key ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("");
    const fieldCodes = visibleParams();
    const treadSwitch = mode === "ready" && isDetailedMode()
      ? `<label class="db-check"><input type="checkbox" data-tread-same ${projectState.treadMode.sameTread !== false ? "checked" : ""}/> Одинаковая проступь для всех маршей</label>`
      : "";
    const simpleNote = isDetailedMode() ? "" : `<div class="db-muted">Простой режим: показаны только основные размеры, схема и комментарий. Детальные данные не удаляются и появятся при переключении в детальный режим.</div>`;
    const calcRows = calculatedLengthRows();
    const calcNote = !isDetailedMode()
      ? (mode === "empty" || String(projectState.type || "").startsWith("empty_"))
        ? `<div class="db-muted">Пустой проём: M1/M2 — это ручная геометрия проёма/зоны, без авторасчёта ступеней.</div>`
        : `<div class="db-muted">Готовое основание: замерщик вводит ширину и количество ступеней, а M1/M2 считаются автоматически по N×b. Стандартная проступь для расчёта — 250 мм.</div>`
      : (mode === "empty" || String(projectState.type || "").startsWith("empty_"))
        ? `<div class="db-muted">Пустой проём: M1/M2 — это геометрия проёма/зоны, без авторасчёта ступеней.</div>`
        : `<div class="db-muted">M1/M2 считаются от каркасной проступи: M1 = N1 × b, M2 = N2 × b. Вылеты готовых деталей считаются отдельно и не меняют длину каркаса.</div>`;
    return `
      <div class="db-grid">
        <div class="db-field">
          <label>Тип объекта</label>
          <select data-mode>
            <option value="empty" ${mode === "empty" ? "selected" : ""}>Пустой проём</option>
            <option value="ready" ${mode === "ready" ? "selected" : ""}>Готовое основание</option>
          </select>
        </div>
        <div class="db-field">
          <label>Схема</label>
          <select data-variant>${options}</select>
        </div>
      </div>
      ${treadSwitch}
      <div class="db-grid">${fieldCodes.map(fieldControl).join("")}</div>
      ${calcRows}
      ${simpleNote}
      ${calcNote}
    `;
  }

  function schemeSection(svgText) {
    const hidden = projectState.showFields ? "" : "fields-hidden";
    return `
      <div class="db-actions">
        <button type="button" class="db-btn primary" data-action="save">Сохранить</button>
        <button type="button" class="db-btn ghost" data-action="toggle-fields">Поля на схеме: ${projectState.showFields ? "показаны" : "скрыты"}</button>
      </div>
      <div class="db-svg-wrap ${hidden}">
        ${svgText}
        <div class="db-on-svg-fields">${miniFields()}</div>
      </div>
    `;
  }

  function actionsSection() {
    return `
      <div class="db-actions">
        <button type="button" class="db-btn" data-action="download-svg">Скачать чертёж SVG</button>
        <button type="button" class="db-btn" data-action="download-json">Скачать JSON</button>
        <button type="button" class="db-btn" data-action="copy-svg">Скопировать SVG</button>
        <button type="button" class="db-btn ghost" data-action="full-editor">Полный редактор</button>
      </div>
      <div class="db-muted">Полный редактор оставлен отдельным инструментом. Основной рабочий замер теперь ведётся во вкладке «Размеры».</div>
    `;
  }

  function wallCheckbox(path, label) {
    const [zone, side] = path.split(".");
    const checked = projectState.walls?.[zone]?.[side] ? "checked" : "";
    return `<label class="db-check"><input type="checkbox" data-wall-check="${path}" ${checked}/> ${escapeHtml(label)}</label>`;
  }

  function wallsSection() {
    return `
      <div class="db-grid">
        ${wallCheckbox("flight1.left", "Марш 1: стена слева")}
        ${wallCheckbox("flight1.right", "Марш 1: стена справа")}
        ${wallCheckbox("flight2.left", "Марш 2: стена слева")}
        ${wallCheckbox("flight2.right", "Марш 2: стена справа")}
        ${wallCheckbox("turn.left", "Поворот: стена слева")}
        ${wallCheckbox("turn.right", "Поворот: стена справа")}
        ${wallCheckbox("turn.top", "Поворот: стена сверху")}
        ${wallCheckbox("turn.bottom", "Поворот: стена снизу")}
      </div>
      <div class="db-muted">Стороны можно переключать и кликом прямо по схеме. Серой толстой линией показана сторона у стены.</div>
    `;
  }

  function windowWallLooksOpen(wall) {
    const w = projectState.walls || DEFAULT_PROJECT.walls;
    if (wall === "top" || wall === "bottom") return !w.turn?.[wall];
    if (wall === "left") return !(w.flight1?.left || w.flight2?.left || w.turn?.left);
    return !(w.flight1?.right || w.flight2?.right || w.turn?.right);
  }

  function windowsSection(geometry) {
    const windows = projectState.windows || [];
    const warnings = windows.map((item) => {
      const sideLength = sideLengthForWindow(item.wall, geometry);
      const tooLong = Number(item.offset_mm || 0) + Number(item.width_mm || 0) > sideLength;
      const openSide = windowWallLooksOpen(item.wall);
      const messages = [];
      if (openSide) messages.push("Окно обычно указывается на стороне стены. Проверь сторону.");
      if (tooLong) messages.push(`Окно выходит за границу стороны: доступно примерно ${Math.round(sideLength)} мм.`);
      return messages.length ? `<div class="db-warning">${escapeHtml(messages.join(" "))}</div>` : "";
    });

    return `
      <label class="db-check"><input type="checkbox" data-project-bool="hasWindows" ${projectState.hasWindows ? "checked" : ""}/> Есть окна / проёмы в стенах</label>
      <div class="db-actions"><button type="button" class="db-btn" data-action="add-window">+ Добавить окно</button></div>
      <div class="db-card-list">
        ${windows.length ? windows.map((item, index) => windowCard(item, index, warnings[index])).join("") : `<div class="db-muted">Окна пока не добавлены.</div>`}
      </div>
    `;
  }

  function windowCard(item, index, warningHtml) {
    const active = projectState.activeWindowId === item.id ? " style=\"outline:3px solid rgba(245,158,11,.25)\"" : "";
    return `<div class="db-card" data-window-card="${escapeHtml(item.id)}"${active}>
      <div class="db-card-head"><span>Окно ${index + 1}</span><button type="button" class="db-btn danger" data-delete-window="${escapeHtml(item.id)}">Удалить</button></div>
      <div class="db-card-grid">
        <label class="db-field"><span class="db-mini-label">Стена</span><select data-window="${escapeHtml(item.id)}" data-window-field="wall">
          ${["top", "bottom", "left", "right"].map((wall) => `<option value="${wall}" ${item.wall === wall ? "selected" : ""}>${wall}</option>`).join("")}
        </select></label>
        <label class="db-field"><span class="db-mini-label">Отступ, мм</span><input ${numericInputAttrs()} data-window="${escapeHtml(item.id)}" data-window-field="offset_mm" value="${escapeHtml(item.offset_mm)}"/></label>
        <label class="db-field"><span class="db-mini-label">Ширина, мм</span><input ${numericInputAttrs()} data-window="${escapeHtml(item.id)}" data-window-field="width_mm" value="${escapeHtml(item.width_mm)}"/></label>
        <label class="db-field"><span class="db-mini-label">Высота, мм</span><input ${numericInputAttrs()} data-window="${escapeHtml(item.id)}" data-window-field="height_mm" value="${escapeHtml(item.height_mm)}"/></label>
        <label class="db-field"><span class="db-mini-label">Подоконник, мм</span><input ${numericInputAttrs()} data-window="${escapeHtml(item.id)}" data-window-field="sill_height_mm" value="${escapeHtml(item.sill_height_mm)}"/></label>
        <label class="db-field"><span class="db-mini-label">Комментарий</span><input data-window="${escapeHtml(item.id)}" data-window-field="comment" value="${escapeHtml(item.comment)}"/></label>
      </div>
      ${warningHtml || ""}
    </div>`;
  }

  function finishSettingsSection() {
    const settings = finishState.settings;
    return `
      <div class="db-grid">
        <label class="db-field"><span class="db-mini-label">Боковой вылет, мм</span><input ${numericInputAttrs()} data-finish-setting="side_overhang_mm" value="${escapeHtml(settings.side_overhang_mm)}"/></label>
        <label class="db-field"><span class="db-mini-label">Передний вылет, мм</span><input ${numericInputAttrs()} data-finish-setting="front_overhang_mm" value="${escapeHtml(settings.front_overhang_mm)}"/></label>
        <label class="db-check"><input type="checkbox" data-finish-setting-check="add_boots_by_walls" ${settings.add_boots_by_walls ? "checked" : ""}/> Добавлять сапожок у стен</label>
      </div>
      <div class="db-actions">
        <button type="button" class="db-btn primary" data-action="fill-finish">Заполнить по схеме</button>
        <button type="button" class="db-btn" data-action="add-step">+ Добавить ступень</button>
        <button type="button" class="db-btn" data-action="add-landing">+ Добавить площадку</button>
        <button type="button" class="db-btn" data-action="add-boot">+ Добавить сапожок</button>
        <button type="button" class="db-btn" data-action="add-finish-comment">+ Добавить комментарий</button>
      </div>
      <div class="db-muted">Готовая глубина ступени = b + передний вылет. Готовая ширина = B + боковые вылеты только с открытых сторон.</div>
      <h4>Ступени</h4>
      <div class="db-card-list">${finishState.steps.length ? finishState.steps.map((item) => finishCard("steps", item)).join("") : `<div class="db-muted">Ступени не заполнены.</div>`}</div>
      <h4>Площадки</h4>
      <div class="db-card-list">${finishState.landings.length ? finishState.landings.map((item) => finishCard("landings", item)).join("") : `<div class="db-muted">Площадки не заполнены.</div>`}</div>
      <h4>Сапожки</h4>
      <div class="db-card-list">${finishState.boots.length ? finishState.boots.map((item) => finishCard("boots", item)).join("") : `<div class="db-muted">Сапожки не заполнены.</div>`}</div>
      <h4>Комментарии</h4>
      <div class="db-card-list">${finishState.comments.length ? finishState.comments.map((item) => finishCommentCard(item)).join("") : `<div class="db-muted">Комментариев к чистовым размерам нет.</div>`}</div>
    `;
  }

  function finishCard(kind, item) {
    const title = kind === "steps" ? "Ступень" : kind === "landings" ? "Площадка" : "Сапожок";
    const fields = kind === "steps"
      ? [
          ["name", "Название/группа"], ["count", "Количество"], ["depth_mm", "Глубина, мм"], ["width_mm", "Ширина, мм"], ["thickness_mm", "Толщина, мм"], ["material", "Материал"], ["finish", "Отделка"], ["comment", "Комментарий"],
        ]
      : kind === "landings"
        ? [
            ["name", "Название"], ["count", "Количество"], ["length_mm", "Длина, мм"], ["width_mm", "Ширина, мм"], ["thickness_mm", "Толщина, мм"], ["material", "Материал"], ["finish", "Отделка"], ["comment", "Комментарий"],
          ]
        : [
            ["name", "Название"], ["count", "Количество"], ["length_mm", "Длина, мм"], ["height_mm", "Высота, мм"], ["thickness_mm", "Толщина, мм"], ["side", "Сторона"], ["material", "Материал"], ["finish", "Отделка"], ["comment", "Комментарий"],
          ];
    return `<div class="db-card">
      <div class="db-card-head"><span>${title}</span><button type="button" class="db-btn danger" data-delete-finish="${kind}" data-id="${escapeHtml(item.id)}">Удалить</button></div>
      <div class="db-card-grid">
        ${fields.map(([field, label]) => finishInput(kind, item, field, label)).join("")}
      </div>
    </div>`;
  }

  function finishInput(kind, item, field, label) {
    if (field === "side") {
      return `<label class="db-field"><span class="db-mini-label">${escapeHtml(label)}</span><select data-finish-kind="${kind}" data-id="${escapeHtml(item.id)}" data-finish-field="${field}">
        ${["не указано", "левый", "правый", "оба"].map((side) => `<option value="${side}" ${item[field] === side ? "selected" : ""}>${side}</option>`).join("")}
      </select></label>`;
    }
    if (field === "comment") {
      return `<label class="db-field"><span class="db-mini-label">${escapeHtml(label)}</span><textarea data-finish-kind="${kind}" data-id="${escapeHtml(item.id)}" data-finish-field="${field}">${escapeHtml(item[field])}</textarea></label>`;
    }
    const isNumber = field.endsWith("_mm") || field === "count";
    const list = field === "finish"
      ? OPTION_LIST_IDS.finishes
      : field === "material"
        ? (kind === "boots" ? OPTION_LIST_IDS.bootMaterials : OPTION_LIST_IDS.stepMaterials)
        : "";
    return `<label class="db-field"><span class="db-mini-label">${escapeHtml(label)}</span><input ${isNumber ? numericInputAttrs() : ""} ${list ? `list="${list}"` : ""} data-finish-kind="${kind}" data-id="${escapeHtml(item.id)}" data-finish-field="${field}" value="${escapeHtml(item[field])}"/></label>`;
  }

  function finishCommentCard(item) {
    return `<div class="db-card">
      <div class="db-card-head"><span>Комментарий</span><button type="button" class="db-btn danger" data-delete-finish="comments" data-id="${escapeHtml(item.id)}">Удалить</button></div>
      <textarea data-finish-kind="comments" data-id="${escapeHtml(item.id)}" data-finish-field="text">${escapeHtml(item.text)}</textarea>
    </div>`;
  }


  function ascentSection() {
    const a = projectState.ascent || DEFAULT_PROJECT.ascent;
    const second = variant().opening === "straight" ? "" : `
      <label class="db-field"><span class="db-mini-label">Марш 2 / выход</span><select data-ascent-field="flight2">
        <option value="turn_to_exit" ${a.flight2 !== "exit_to_turn" ? "selected" : ""}>от поворота к выходу</option>
        <option value="exit_to_turn" ${a.flight2 === "exit_to_turn" ? "selected" : ""}>от выхода к повороту</option>
      </select></label>`;
    return `
      <label class="db-check"><input type="checkbox" data-ascent-check="show" ${a.show !== false ? "checked" : ""}/> Показывать стрелки подъёма</label>
      <div class="db-grid">
        <label class="db-field"><span class="db-mini-label">Марш 1 / подъём</span><select data-ascent-field="flight1">
          <option value="start_to_turn" ${a.flight1 !== "turn_to_start" ? "selected" : ""}>от начала к повороту/выходу</option>
          <option value="turn_to_start" ${a.flight1 === "turn_to_start" ? "selected" : ""}>от поворота/выхода к началу</option>
        </select></label>
        ${second}
      </div>
      <div class="db-muted">Клик по стрелке на схеме меняет направление. Это особенно важно для пустого проёма, чтобы конструктор понял сторону подъёма.</div>
    `;
  }

  const SITE_SIDE_LABELS = { top: "верх", bottom: "низ", left: "слева", right: "справа" };
  const SITE_ZONE_LABELS = { outer: "Контур проёма", turn: "Поворот", flight1: "Участок/марш 1", flight2: "Участок/марш 2" };
  const OBSTACLE_TYPES = ["дверь", "окно", "труба", "радиатор", "колонна", "шкаф", "проём", "электрика", "вентиляция", "другое"];

  function upperBalustradeSection() {
    const b = projectState.topBalustrade || DEFAULT_PROJECT.topBalustrade;
    const sides = new Set(b.sides || []);
    return `
      <label class="db-check"><input type="checkbox" data-balustrade-check="enabled" ${b.enabled ? "checked" : ""}/> Есть верхняя балюстрада</label>
      <div class="db-grid four">
        ${["top", "bottom", "left", "right"].map((side) => `<label class="db-check"><input type="checkbox" data-balustrade-side="${side}" ${sides.has(side) ? "checked" : ""}/> ${SITE_SIDE_LABELS[side]}</label>`).join("")}
      </div>
      <div class="db-grid">
        <label class="db-field"><span class="db-mini-label">Длина, мм</span><input ${numericInputAttrs()} data-balustrade-field="length_mm" value="${escapeHtml(b.length_mm)}"/></label>
        <label class="db-field"><span class="db-mini-label">Высота, мм</span><input ${numericInputAttrs()} data-balustrade-field="height_mm" value="${escapeHtml(b.height_mm)}"/></label>
        <label class="db-field"><span class="db-mini-label">Материал</span><input list="tekstura-rail-materials" data-balustrade-field="material" value="${escapeHtml(b.material)}"/></label>
        <label class="db-field"><span class="db-mini-label">Комментарий</span><input data-balustrade-field="comment" value="${escapeHtml(b.comment)}"/></label>
      </div>
      <div class="db-muted">Балюстрада рисуется отдельной синей пунктирной линией и не меняет геометрию проёма.</div>
    `;
  }

  function siteMarksSection() {
    const edgeItems = projectState.edgeExtensions || [];
    const obstacleItems = projectState.obstacles || [];
    return `
      <div class="db-muted">Отмечайте стены, продолжения до двери/препятствия и места, где нельзя крепиться. Эти метки не меняют размеры проёма.</div>
      <h4>Стены по сторонам</h4>
      <div class="db-grid">
        ${wallCheckbox("turn.top", "Контур/поворот: стена сверху")}
        ${wallCheckbox("turn.bottom", "Контур/поворот: стена снизу")}
        ${wallCheckbox("turn.left", "Контур/поворот: стена слева")}
        ${wallCheckbox("turn.right", "Контур/поворот: стена справа")}
        ${variant().opening !== "straight" ? `${wallCheckbox("flight1.left", "Участок 1: стена слева")}${wallCheckbox("flight1.right", "Участок 1: стена справа")}${wallCheckbox("flight2.left", "Участок 2: стена слева")}${wallCheckbox("flight2.right", "Участок 2: стена справа")}` : ""}
      </div>
      <h4>Продолжения стен за проём</h4>
      <div class="db-actions"><button type="button" class="db-btn" data-action="add-edge-extension">+ Добавить продолжение/дверь</button></div>
      <div class="db-card-list">${edgeItems.length ? edgeItems.map(edgeExtensionCard).join("") : `<div class="db-muted">Продолжения стен не добавлены.</div>`}</div>
      <h4>Отдельные препятствия</h4>
      <div class="db-actions"><button type="button" class="db-btn" data-action="add-obstacle">+ Добавить препятствие</button></div>
      <div class="db-card-list">${obstacleItems.length ? obstacleItems.map(obstacleCard).join("") : `<div class="db-muted">Препятствия не добавлены.</div>`}</div>
    `;
  }

  function edgeExtensionCard(item) {
    return `<div class="db-card" data-edge-card="${escapeHtml(item.id)}">
      <div class="db-card-head"><span>Продолжение / препятствие</span><button type="button" class="db-btn danger" data-delete-edge="${escapeHtml(item.id)}">Удалить</button></div>
      <div class="db-card-grid">
        <label class="db-field"><span class="db-mini-label">Зона</span><select data-edge="${escapeHtml(item.id)}" data-edge-field="zone">
          ${["outer", "turn", "flight1", "flight2"].map((zone) => `<option value="${zone}" ${item.zone === zone ? "selected" : ""}>${SITE_ZONE_LABELS[zone]}</option>`).join("")}
        </select></label>
        <label class="db-field"><span class="db-mini-label">Сторона</span><select data-edge="${escapeHtml(item.id)}" data-edge-field="side">
          ${["top", "right", "bottom", "left"].map((side) => `<option value="${side}" ${item.side === side ? "selected" : ""}>${SITE_SIDE_LABELS[side]}</option>`).join("")}
        </select></label>
        <label class="db-check"><input type="checkbox" data-edge="${escapeHtml(item.id)}" data-edge-field="hasWall" ${item.hasWall ? "checked" : ""}/> есть стена</label>
        <label class="db-field"><span class="db-mini-label">Продлить до начала, мм</span><input ${numericInputAttrs()} data-edge="${escapeHtml(item.id)}" data-edge-field="extendBefore_mm" value="${escapeHtml(item.extendBefore_mm)}"/></label>
        <label class="db-field"><span class="db-mini-label">Продлить после, мм</span><input ${numericInputAttrs()} data-edge="${escapeHtml(item.id)}" data-edge-field="extendAfter_mm" value="${escapeHtml(item.extendAfter_mm)}"/></label>
        <label class="db-field"><span class="db-mini-label">Тип препятствия</span><select data-edge="${escapeHtml(item.id)}" data-edge-field="obstacleType">
          <option value="">нет</option>${OBSTACLE_TYPES.map((type) => `<option value="${type}" ${item.obstacleType === type ? "selected" : ""}>${type}</option>`).join("")}
        </select></label>
        <label class="db-field"><span class="db-mini-label">Отступ препятствия, мм</span><input ${numericInputAttrs()} data-edge="${escapeHtml(item.id)}" data-edge-field="obstacleOffset_mm" value="${escapeHtml(item.obstacleOffset_mm)}"/></label>
        <label class="db-field"><span class="db-mini-label">Ширина препятствия, мм</span><input ${numericInputAttrs()} data-edge="${escapeHtml(item.id)}" data-edge-field="obstacleWidth_mm" value="${escapeHtml(item.obstacleWidth_mm)}"/></label>
        <label class="db-field"><span class="db-mini-label">Комментарий</span><textarea data-edge="${escapeHtml(item.id)}" data-edge-field="comment">${escapeHtml(item.comment)}</textarea></label>
      </div>
    </div>`;
  }

  function obstacleCard(item) {
    return `<div class="db-card" data-obstacle-card="${escapeHtml(item.id)}">
      <div class="db-card-head"><span>Препятствие</span><button type="button" class="db-btn danger" data-delete-obstacle="${escapeHtml(item.id)}">Удалить</button></div>
      <div class="db-card-grid">
        <label class="db-field"><span class="db-mini-label">Зона</span><select data-obstacle="${escapeHtml(item.id)}" data-obstacle-field="zone">
          ${["outer", "turn", "flight1", "flight2"].map((zone) => `<option value="${zone}" ${item.zone === zone ? "selected" : ""}>${SITE_ZONE_LABELS[zone]}</option>`).join("")}
        </select></label>
        <label class="db-field"><span class="db-mini-label">Сторона</span><select data-obstacle="${escapeHtml(item.id)}" data-obstacle-field="side">
          ${["top", "right", "bottom", "left"].map((side) => `<option value="${side}" ${item.side === side ? "selected" : ""}>${SITE_SIDE_LABELS[side]}</option>`).join("")}
        </select></label>
        <label class="db-field"><span class="db-mini-label">Тип</span><select data-obstacle="${escapeHtml(item.id)}" data-obstacle-field="type">
          ${OBSTACLE_TYPES.map((type) => `<option value="${type}" ${item.type === type ? "selected" : ""}>${type}</option>`).join("")}
        </select></label>
        <label class="db-field"><span class="db-mini-label">Отступ, мм</span><input ${numericInputAttrs()} data-obstacle="${escapeHtml(item.id)}" data-obstacle-field="offset_mm" value="${escapeHtml(item.offset_mm)}"/></label>
        <label class="db-field"><span class="db-mini-label">Ширина, мм</span><input ${numericInputAttrs()} data-obstacle="${escapeHtml(item.id)}" data-obstacle-field="width_mm" value="${escapeHtml(item.width_mm)}"/></label>
        <label class="db-field"><span class="db-mini-label">Комментарий</span><textarea data-obstacle="${escapeHtml(item.id)}" data-obstacle-field="comment">${escapeHtml(item.comment)}</textarea></label>
      </div>
    </div>`;
  }

  function commentsSection() {
    return `
      <label class="db-field">
        <span class="db-mini-label">Ограничения и препятствия</span>
        <textarea data-field="obstacles_comment">${escapeHtml(readField("obstacles_comment"))}</textarea>
      </label>
      <label class="db-field">
        <span class="db-mini-label">Общий комментарий</span>
        <textarea data-field="general_comment">${escapeHtml(readField("general_comment"))}</textarea>
      </label>
    `;
  }

  function makeRect(id, x, y, w, h, zone, kind = "flight") {
    return { id, x, y, w: Math.max(1, w), h: Math.max(1, h), zone, kind };
  }

  function buildGeometry() {
    const v = variant();
    const p = collectParams();
    const m1 = Math.max(1, p.firstFlightLength || p.openingLength || 2500);
    const b1 = Math.max(1, p.firstFlightWidth || p.openingWidth || 1000);
    const m2 = Math.max(1, p.secondFlightLength || 2000);
    const b2 = Math.max(1, p.secondFlightWidth || b1 || 1000);
    const zl = Math.max(1, p.turnLength || Math.max(b1, b2, 1000));
    const zw = Math.max(1, p.turnWidth || Math.max(b1, b2, 1000));
    const n1 = Math.max(1, p.firstFlightSteps || 10);
    const n2 = Math.max(1, p.secondFlightSteps || 8);
    const zn = Math.max(1, p.winderSteps || 3);
    const rects = [];
    const lines = [];
    const dimensions = [];
    const winders = [];
    const flightDirections = {};
    let route = [];
    let title = "";
    let outer = { x: 0, y: 0, w: m1, h: b1 };

    const visibleDimensionIds = new Set(visibleParams());
    const addDim = (id, label, value, unit, side, start, end, offset = 56) => {
      if (!visibleDimensionIds.has(id)) return;
      dimensions.push({ id, label, value, unit, side, start, end, offset });
    };
    const shouldDrawTreads = () => v.mode === "ready";
    const visualTreadCount = (count, fallback) => Math.max(1, Math.round(Number(count) || fallback));
    const addTreadsVertical = (rect, count, fallback = 8) => {
      if (!shouldDrawTreads()) return;
      const steps = visualTreadCount(count, fallback);
      for (let i = 1; i < steps; i += 1) lines.push({ start: { x: rect.x, y: rect.y + rect.h * i / steps }, end: { x: rect.x + rect.w, y: rect.y + rect.h * i / steps }, kind: "tread" });
    };
    const addTreadsHorizontal = (rect, count, fallback = 10) => {
      if (!shouldDrawTreads()) return;
      const steps = visualTreadCount(count, fallback);
      for (let i = 1; i < steps; i += 1) lines.push({ start: { x: rect.x + rect.w * i / steps, y: rect.y }, end: { x: rect.x + rect.w * i / steps, y: rect.y + rect.h }, kind: "tread" });
    };
    const setFlightDirection = (id, start, end) => {
      flightDirections[id] = { start, end };
    };

    if (v.key === "empty_straight") {
      const l = Math.max(1, p.openingLength || m1 || 3000);
      const w = Math.max(1, p.openingWidth || b1 || 1200);
      outer = { x: 0, y: 0, w: l, h: w };
      rects.push(makeRect("opening", 0, 0, l, w, "turn", "opening"));
      addDim("L", "L", p.openingLength || l, "мм", "top", { x: 0, y: 0 }, { x: l, y: 0 }, 70);
      addDim("W", "W", p.openingWidth || w, "мм", "left", { x: 0, y: 0 }, { x: 0, y: w }, 70);
      addDim("H", "H", p.height, "мм", "right", { x: l, y: 0 }, { x: l, y: w }, 120);
      addDim("T", "T", p.slabThickness, "мм", "bottom", { x: 0, y: w }, { x: l, y: w }, 130);
      title = "Пустой прямой проём";
    } else if (v.key.startsWith("empty_l")) {
      const right = v.key.includes("_right");
      if (!right) {
        const turn = makeRect("turn", 0, 0, zl, zw, "turn", "turn");
        const f1 = makeRect("flight1", 0, zw, b1, m1, "flight1");
        const f2 = makeRect("flight2", zl, 0, m2, b2, "flight2");
        rects.push(f1, turn, f2);
        outer = { x: 0, y: 0, w: zl + m2, h: zw + m1 };
      } else {
        const turn = makeRect("turn", m2, 0, zl, zw, "turn", "turn");
        const f1 = makeRect("flight1", m2 + zl - b1, zw, b1, m1, "flight1");
        const f2 = makeRect("flight2", 0, 0, m2, b2, "flight2");
        rects.push(f1, turn, f2);
        outer = { x: 0, y: 0, w: m2 + zl, h: zw + m1 };
      }
      const f1 = rects.find((r) => r.id === "flight1");
      const f2 = rects.find((r) => r.id === "flight2");
      const turn = rects.find((r) => r.id === "turn");
      setFlightDirection("flight1", { x: f1.x + f1.w / 2, y: f1.y + f1.h }, { x: f1.x + f1.w / 2, y: f1.y });
      setFlightDirection("flight2", right ? { x: f2.x + f2.w, y: f2.y + f2.h / 2 } : { x: f2.x, y: f2.y + f2.h / 2 }, right ? { x: f2.x, y: f2.y + f2.h / 2 } : { x: f2.x + f2.w, y: f2.y + f2.h / 2 });
      addDim("M1", "M1", p.firstFlightLength, "мм", right ? "right" : "left", { x: f1.x, y: f1.y }, { x: f1.x, y: f1.y + f1.h }, 70);
      addDim("B1", "B1", p.firstFlightWidth, "мм", "bottom", { x: f1.x, y: f1.y + f1.h }, { x: f1.x + f1.w, y: f1.y + f1.h }, 70);
      addDim("M2", "M2", p.secondFlightLength, "мм", "top", { x: f2.x, y: f2.y }, { x: f2.x + f2.w, y: f2.y }, 70);
      addDim("B2", "B2", p.secondFlightWidth, "мм", right ? "left" : "right", { x: f2.x + f2.w, y: f2.y }, { x: f2.x + f2.w, y: f2.y + f2.h }, 70);
      addDim("ZL", "ZL", p.turnLength, "мм", "top", { x: turn.x, y: turn.y }, { x: turn.x + turn.w, y: turn.y }, 125);
      addDim("ZW", "ZW", p.turnWidth, "мм", right ? "right" : "left", { x: turn.x, y: turn.y }, { x: turn.x, y: turn.y + turn.h }, 125);
      addDim("H", "H", p.height, "мм", right ? "left" : "right", { x: outer.x + outer.w, y: outer.y }, { x: outer.x + outer.w, y: outer.y + outer.h }, 150);
      addDim("T", "T", p.slabThickness, "мм", "bottom", { x: outer.x, y: outer.y + outer.h }, { x: outer.x + outer.w, y: outer.y + outer.h }, 165);
      title = right ? "Пустой Г-проём правый" : "Пустой Г-проём левый";
    } else if (v.key === "ready_straight") {
      const f1 = makeRect("flight1", 0, 0, m1, b1, "flight1");
      rects.push(f1);
      outer = { x: 0, y: 0, w: m1, h: b1 };
      setFlightDirection("flight1", { x: f1.x, y: f1.y + f1.h / 2 }, { x: f1.x + f1.w, y: f1.y + f1.h / 2 });
      addTreadsHorizontal(f1, n1);
      addDim("M1", "M1", p.firstFlightLength, "мм", "top", { x: 0, y: 0 }, { x: m1, y: 0 }, 70);
      addDim("B1", "B1", p.firstFlightWidth, "мм", "right", { x: m1, y: 0 }, { x: m1, y: b1 }, 70);
      addDim("N1", "N1", p.firstFlightSteps, "шт", "bottom", { x: 0, y: b1 }, { x: m1, y: b1 }, 70);
      addDim("H", "H", p.height, "мм", "left", { x: 0, y: 0 }, { x: 0, y: b1 }, 120);
      route = [{ x: 80, y: b1 / 2 }, { x: m1 - 80, y: b1 / 2 }];
      title = "Прямая лестница";
    } else if (v.opening === "l_left" || v.opening === "l_right") {
      const right = v.opening === "l_right";
      let f1;
      let f2;
      let turn;
      if (!right) {
        turn = makeRect("turn", 0, 0, zl, zw, "turn", "turn");
        f1 = makeRect("flight1", 0, zw, b1, m1, "flight1");
        f2 = makeRect("flight2", zl, 0, m2, b2, "flight2");
        outer = { x: 0, y: 0, w: zl + m2, h: zw + m1 };
      } else {
        turn = makeRect("turn", m2, 0, zl, zw, "turn", "turn");
        f1 = makeRect("flight1", m2 + zl - b1, zw, b1, m1, "flight1");
        f2 = makeRect("flight2", 0, 0, m2, b2, "flight2");
        outer = { x: 0, y: 0, w: m2 + zl, h: zw + m1 };
      }
      rects.push(f1, turn, f2);
      setFlightDirection("flight1", { x: f1.x + f1.w / 2, y: f1.y + f1.h }, { x: f1.x + f1.w / 2, y: f1.y });
      setFlightDirection("flight2", right ? { x: f2.x + f2.w, y: f2.y + f2.h / 2 } : { x: f2.x, y: f2.y + f2.h / 2 }, right ? { x: f2.x, y: f2.y + f2.h / 2 } : { x: f2.x + f2.w, y: f2.y + f2.h / 2 });
      addTreadsVertical(f1, n1);
      addTreadsHorizontal(f2, n2);
      if (v.turn === "winder") {
        const pivot = right ? { x: turn.x, y: turn.y + turn.h } : { x: turn.x + turn.w, y: turn.y + turn.h };
        const startAngle = right ? -Math.PI / 2 : Math.PI;
        const endAngle = right ? 0 : Math.PI * 1.5;
        winders.push(...buildWinderPolygons(turn, pivot, startAngle, endAngle, zn, "l"));
      }
      route = !right
        ? [{ x: f1.x + f1.w / 2, y: f1.y + f1.h - 80 }, { x: f1.x + f1.w / 2, y: turn.y + turn.h / 2 }, { x: f2.x + f2.w - 80, y: f2.y + f2.h / 2 }]
        : [{ x: f1.x + f1.w / 2, y: f1.y + f1.h - 80 }, { x: f1.x + f1.w / 2, y: turn.y + turn.h / 2 }, { x: f2.x + 80, y: f2.y + f2.h / 2 }];
      addDim("M1", "M1", p.firstFlightLength, "мм", right ? "right" : "left", { x: f1.x, y: f1.y }, { x: f1.x, y: f1.y + f1.h }, 70);
      addDim("B1", "B1", p.firstFlightWidth, "мм", "bottom", { x: f1.x, y: f1.y + f1.h }, { x: f1.x + f1.w, y: f1.y + f1.h }, 70);
      addDim("M2", "M2", p.secondFlightLength, "мм", "top", { x: f2.x, y: f2.y }, { x: f2.x + f2.w, y: f2.y }, 70);
      addDim("B2", "B2", p.secondFlightWidth, "мм", right ? "left" : "right", { x: f2.x + f2.w, y: f2.y }, { x: f2.x + f2.w, y: f2.y + f2.h }, 70);
      addDim("ZL", "ZL", p.turnLength, "мм", "top", { x: turn.x, y: turn.y }, { x: turn.x + turn.w, y: turn.y }, 125);
      addDim("ZW", "ZW", p.turnWidth, "мм", right ? "right" : "left", { x: turn.x, y: turn.y }, { x: turn.x, y: turn.y + turn.h }, 125);
      if (v.turn === "winder") addDim("ZN", "ZN", p.winderSteps, "шт", right ? "left" : "right", { x: turn.x + turn.w, y: turn.y }, { x: turn.x + turn.w, y: turn.y + turn.h }, 170);
      title = right ? "Г-образная правая" : "Г-образная левая";
    } else {
      const side = v.side || "left";
      const totalW = Math.max(zl, b1 + b2 + 120);
      const turn = makeRect("turn", 0, 0, totalW, zw, "turn", "turn");
      const f1 = side === "left"
        ? makeRect("flight1", 0, zw, b1, m1, "flight1")
        : makeRect("flight1", totalW - b1, zw, b1, m1, "flight1");
      const f2 = side === "left"
        ? makeRect("flight2", totalW - b2, zw, b2, m2, "flight2")
        : makeRect("flight2", 0, zw, b2, m2, "flight2");
      rects.push(turn, f1, f2);
      outer = { x: 0, y: 0, w: totalW, h: zw + Math.max(m1, m2) };
      setFlightDirection("flight1", { x: f1.x + f1.w / 2, y: f1.y + f1.h }, { x: f1.x + f1.w / 2, y: f1.y });
      setFlightDirection("flight2", { x: f2.x + f2.w / 2, y: f2.y }, { x: f2.x + f2.w / 2, y: f2.y + f2.h });
      addTreadsVertical(f1, n1);
      addTreadsVertical(f2, n2);
      if (v.turn === "winder") {
        const pivot = { x: turn.x + turn.w / 2, y: turn.y + turn.h };
        const leftToRight = side === "left";
        winders.push(...buildWinderPolygons(turn, pivot, leftToRight ? Math.PI : Math.PI * 2, leftToRight ? Math.PI * 2 : Math.PI, zn, "u"));
      }
      route = [
        { x: f1.x + f1.w / 2, y: f1.y + f1.h - 80 },
        { x: f1.x + f1.w / 2, y: turn.y + turn.h / 2 },
        { x: f2.x + f2.w / 2, y: turn.y + turn.h / 2 },
        { x: f2.x + f2.w / 2, y: f2.y + f2.h - 80 },
      ];
      addDim("M1", "M1", p.firstFlightLength, "мм", side === "left" ? "left" : "right", { x: f1.x, y: f1.y }, { x: f1.x, y: f1.y + f1.h }, 70);
      addDim("B1", "B1", p.firstFlightWidth, "мм", "bottom", { x: f1.x, y: f1.y + f1.h }, { x: f1.x + f1.w, y: f1.y + f1.h }, 70);
      addDim("M2", "M2", p.secondFlightLength, "мм", side === "left" ? "right" : "left", { x: f2.x + f2.w, y: f2.y }, { x: f2.x + f2.w, y: f2.y + f2.h }, 70);
      addDim("B2", "B2", p.secondFlightWidth, "мм", "bottom", { x: f2.x, y: f2.y + f2.h }, { x: f2.x + f2.w, y: f2.y + f2.h }, 70);
      addDim("ZL", "ZL", p.turnLength || totalW, "мм", "top", { x: turn.x, y: turn.y }, { x: turn.x + turn.w, y: turn.y }, 125);
      addDim("ZW", "ZW", p.turnWidth, "мм", "left", { x: turn.x, y: turn.y }, { x: turn.x, y: turn.y + turn.h }, 125);
      if (v.turn === "winder") addDim("ZN", "ZN", p.winderSteps, "шт", "right", { x: turn.x + turn.w, y: turn.y }, { x: turn.x + turn.w, y: turn.y + turn.h }, 170);
      title = "П-образная лестница";
    }

    return { rects, lines, dimensions, winders, route, outer, title, params: p, flightDirections };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rayRectIntersection(pivot, angle, rect) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const candidates = [];
    const minX = rect.x;
    const maxX = rect.x + rect.w;
    const minY = rect.y;
    const maxY = rect.y + rect.h;
    if (Math.abs(dx) > 0.0001) {
      [minX, maxX].forEach((x) => {
        const t = (x - pivot.x) / dx;
        const y = pivot.y + t * dy;
        if (t > 0.0001 && y >= minY - 0.0001 && y <= maxY + 0.0001) candidates.push({ t, point: { x, y: clamp(y, minY, maxY) } });
      });
    }
    if (Math.abs(dy) > 0.0001) {
      [minY, maxY].forEach((y) => {
        const t = (y - pivot.y) / dy;
        const x = pivot.x + t * dx;
        if (t > 0.0001 && x >= minX - 0.0001 && x <= maxX + 0.0001) candidates.push({ t, point: { x: clamp(x, minX, maxX), y } });
      });
    }
    candidates.sort((a, b) => a.t - b.t);
    return candidates[0]?.point || pivot;
  }

  function buildWinderPolygons(rect, pivot, startAngle, endAngle, count, idPrefix) {
    const steps = Math.max(1, Math.round(count));
    const hits = Array.from({ length: steps + 1 }, (_, index) => {
      const ratio = index / steps;
      return rayRectIntersection(pivot, startAngle + (endAngle - startAngle) * ratio, rect);
    });
    const result = [];
    result.push({ id: `${idPrefix}-envelope`, kind: "envelope", points: [pivot, ...hits] });
    for (let i = 0; i < steps; i += 1) {
      result.push({ id: `${idPrefix}-${i + 1}`, kind: "step", number: i + 1, points: [pivot, hits[i], hits[i + 1]] });
    }
    return result;
  }

  function drawingViewport() {
    if (window.matchMedia?.("(max-width: 430px)")?.matches) return PHONE_VIEW;
    if (window.matchMedia?.("(max-width: 1000px)")?.matches) return TABLET_VIEW;
    return DESKTOP_VIEW;
  }

  function fitTransform(geometry, viewport = drawingViewport()) {
    const points = [];
    geometry.rects.forEach((r) => points.push({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h }));
    geometry.winders.forEach((poly) => poly.points.forEach((point) => points.push(point)));
    geometry.dimensions.forEach((d) => points.push(d.start, d.end));
    const minX = Math.min(...points.map((p) => p.x));
    const maxX = Math.max(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const margin = fitMargins(geometry, viewport);
    const innerW = Math.max(1, viewport.w - margin.left - margin.right);
    const innerH = Math.max(1, viewport.h - margin.top - margin.bottom);
    const scale = Math.min(innerW / width, innerH / height);
    const x0 = margin.left + (innerW - width * scale) / 2 - minX * scale;
    const y0 = margin.top + (innerH - height * scale) / 2 - minY * scale;
    return {
      scale,
      margin,
      map: (point) => ({ x: x0 + point.x * scale, y: y0 + point.y * scale }),
      rect: (r) => {
        const a = { x: x0 + r.x * scale, y: y0 + r.y * scale };
        return { x: a.x, y: a.y, w: r.w * scale, h: r.h * scale };
      },
    };
  }

  function fitMargins(geometry, viewport = drawingViewport()) {
    const mobile = viewport.w !== DESKTOP_VIEW.w || viewport.h !== DESKTOP_VIEW.h;
    const margin = {
      top: mobile ? 54 : 60,
      right: mobile ? 34 : 44,
      bottom: mobile ? 34 : 44,
      left: mobile ? 34 : 44,
    };
    const dimensionLabelGap = mobile ? 24 : 30;
    const sideLabelGap = mobile ? 18 : 24;
    const markerGap = 12;
    const reserve = (side, value) => {
      margin[side] = Math.max(margin[side], value);
    };

    geometry.dimensions.forEach((dim) => {
      const offset = dim.offset || 60;
      if (dim.side === "top") reserve("top", offset + dimensionLabelGap);
      else if (dim.side === "bottom") reserve("bottom", offset + dimensionLabelGap);
      else if (dim.side === "left") reserve("left", offset + sideLabelGap);
      else reserve("right", offset + sideLabelGap);
    });

    const showSiteMarks = shouldRenderSiteMarks();
    if (showSiteMarks) {
      reserve("top", margin.top + markerGap);
      reserve("right", margin.right + markerGap);
      reserve("bottom", margin.bottom + markerGap);
      reserve("left", margin.left + markerGap);
    }

    return margin;
  }

  function renderSvg(geometry) {
    const viewport = drawingViewport();
    const tr = fitTransform(geometry, viewport);
    const defs = `<defs>
      <marker id="db-arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 Z" fill="#0f172a"/></marker>
      <marker id="db-ascent-arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 Z" fill="#2563eb"/></marker>
      <marker id="db-tick" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M2,2 L6,6 M6,2 L2,6" stroke="#0f172a" stroke-width="1.5"/></marker>
    </defs>`;
    const gridCols = Math.ceil(viewport.w / 25) + 1;
    const gridRows = Math.ceil(viewport.h / 25) + 1;
    const grid = Array.from({ length: Math.max(gridCols, gridRows) }, (_, i) => {
      const x = i * 25;
      const y = i * 25;
      return `${x <= viewport.w ? `<line class="grid-line" x1="${x}" y1="0" x2="${x}" y2="${viewport.h}"/>` : ""}${y <= viewport.h ? `<line class="grid-line" x1="0" y1="${y}" x2="${viewport.w}" y2="${y}"/>` : ""}`;
    }).join("");
    const rects = geometry.rects.map((r) => renderRect(r, tr)).join("");
    const winders = geometry.winders.map((poly) => renderWinder(poly, tr)).join("");
    const lines = geometry.lines.map((line) => renderLine(line, tr)).join("");
    const dimensions = geometry.dimensions.map((dim) => renderDimension(dim, tr)).join("");
    const route = renderRoute(geometry.route, tr);
    const showSiteMarks = shouldRenderSiteMarks();
    const walls = showSiteMarks ? renderWalls(geometry, tr) : "";
    const windows = showSiteMarks ? renderWindows(geometry, tr) : "";
    const ascent = showSiteMarks ? renderAscent(geometry, tr) : "";
    const balustrade = showSiteMarks ? renderTopBalustrade(geometry, tr) : "";
    const edges = showSiteMarks ? renderEdgeExtensions(geometry, tr) : "";
    const obstacles = showSiteMarks ? renderObstacles(geometry, tr) : "";
    const title = `<text class="caption" x="28" y="38">${escapeHtml(geometry.title)}</text>`;
    return `<svg class="db-svg" viewBox="0 0 ${viewport.w} ${viewport.h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Замерная схема лестницы">${defs}<rect width="${viewport.w}" height="${viewport.h}" fill="#fff"/>${grid}${title}<g>${rects}${winders}${lines}${route}${walls}${windows}${ascent}${balustrade}${edges}${obstacles}${dimensions}</g></svg>`;
  }

  function renderRect(r, tr) {
    const box = tr.rect(r);
    const active = projectState.activeZone === r.zone ? " active" : "";
    const className = r.kind === "opening" ? "outline zone" : r.zone === "turn" ? "zone turn" : "zone";
    const label = r.zone === "flight1" ? "Марш 1" : r.zone === "flight2" ? "Марш 2" : r.zone === "turn" ? "Поворот" : "";
    const labelSvg = label ? `<text class="caption" x="${box.x + box.w / 2}" y="${box.y + Math.min(box.h - 10, 28)}" text-anchor="middle">${label}</text>` : "";
    const hit = `<rect class="zone-hit" data-zone="${r.zone}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/>`;
    return `<g class="${active}"><rect class="${className}${active}" data-zone="${r.zone}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/>${hit}${labelSvg}</g>`;
  }

  function renderLine(line, tr) {
    const a = tr.map(line.start);
    const b = tr.map(line.end);
    return `<line class="${line.kind || "tread"}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
  }

  function renderWinder(poly, tr) {
    const points = poly.points.map((point) => tr.map(point));
    const d = points.map((point) => `${point.x},${point.y}`).join(" ");
    if (poly.kind === "envelope") return `<polygon class="winder-envelope" data-zone="turn" points="${d}"/>`;
    const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    return `<g><polygon class="winder-step" data-zone="turn" points="${d}"/><text class="step-no" x="${cx}" y="${cy + 4}">${poly.number}</text></g>`;
  }

  function renderRoute(route, tr) {
    if (!route || route.length < 2) return "";
    const points = route.map((point) => tr.map(point));
    const d = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
    return `<path class="route" d="${d}"/>`;
  }

  function renderDimension(dim, tr) {
    const a0 = tr.map(dim.start);
    const b0 = tr.map(dim.end);
    let a = { ...a0 };
    let b = { ...b0 };
    const offset = dim.offset || 60;
    if (dim.side === "top") {
      a.y -= offset; b.y -= offset;
    } else if (dim.side === "bottom") {
      a.y += offset; b.y += offset;
    } else if (dim.side === "left") {
      a.x -= offset; b.x -= offset;
    } else {
      a.x += offset; b.x += offset;
    }
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const text = `${dim.label} ${dim.value || ""}${dim.unit === "шт" ? " шт" : ""}`;
    const rotate = dim.side === "left" || dim.side === "right" ? ` transform="rotate(-90 ${mid.x} ${mid.y})"` : "";
    const active = projectState.activeParam === dim.id ? " active" : "";
    return `<g class="dimension${active}" data-param="${dim.id}">
      <line x1="${a0.x}" y1="${a0.y}" x2="${a.x}" y2="${a.y}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4 4"/>
      <line x1="${b0.x}" y1="${b0.y}" x2="${b.x}" y2="${b.y}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4 4"/>
      <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>
      <line class="dim-hit" data-param="${dim.id}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>
      <text data-param="${dim.id}" x="${mid.x}" y="${mid.y - 8}" text-anchor="middle"${rotate}>${escapeHtml(text)}</text>
    </g>`;
  }

  function sideSegment(rect, side) {
    if (side === "left") return [{ x: rect.x, y: rect.y }, { x: rect.x, y: rect.y + rect.h }];
    if (side === "right") return [{ x: rect.x + rect.w, y: rect.y }, { x: rect.x + rect.w, y: rect.y + rect.h }];
    if (side === "top") return [{ x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y }];
    return [{ x: rect.x, y: rect.y + rect.h }, { x: rect.x + rect.w, y: rect.y + rect.h }];
  }

  function flightSideSegment(rect, direction, side) {
    if (!direction || !rect || !["left", "right"].includes(side)) return sideSegment(rect, side);
    const dx = direction.end.x - direction.start.x;
    const dy = direction.end.y - direction.start.y;
    const length = Math.hypot(dx, dy) || 1;
    const leftNormal = { x: dy / length, y: -dx / length };
    const normal = side === "left" ? leftNormal : { x: -leftNormal.x, y: -leftNormal.y };

    if (Math.abs(normal.x) >= Math.abs(normal.y)) {
      return sideSegment(rect, normal.x < 0 ? "left" : "right");
    }
    return sideSegment(rect, normal.y < 0 ? "top" : "bottom");
  }

  function renderWalls(geometry, tr) {
    const items = [];
    const zones = {
      flight1: geometry.rects.find((r) => r.id === "flight1"),
      flight2: geometry.rects.find((r) => r.id === "flight2"),
      turn: geometry.rects.find((r) => r.id === "turn") || geometry.rects.find((r) => r.id === "opening"),
    };
    Object.entries(projectState.walls || {}).forEach(([zone, sides]) => {
      const rect = zones[zone];
      if (!rect) return;
      Object.entries(sides).forEach(([side, enabled]) => {
        const [s0, e0] = zone.startsWith("flight") ? flightSideSegment(rect, geometry.flightDirections?.[zone], side) : sideSegment(rect, side);
        const s = tr.map(s0);
        const e = tr.map(e0);
        const label = enabled ? `<text class="wall-label" x="${(s.x + e.x) / 2}" y="${(s.y + e.y) / 2 - 7}" text-anchor="middle">✓ стена</text>` : "";
        const mark = enabled ? `<line class="wall-mark" x1="${s.x}" y1="${s.y}" x2="${e.x}" y2="${e.y}"/>` : "";
        items.push(`<g data-wall="${zone}.${side}">${mark}<line class="wall-hit" data-wall="${zone}.${side}" x1="${s.x}" y1="${s.y}" x2="${e.x}" y2="${e.y}"/>${label}</g>`);
      });
    });
    return items.join("");
  }

  function sideLengthForWindow(wall, geometry) {
    const o = geometry.outer;
    return wall === "top" || wall === "bottom" ? o.w : o.h;
  }

  function windowSegment(item, geometry) {
    const o = geometry.outer;
    const length = sideLengthForWindow(item.wall, geometry);
    const width = Math.max(1, Math.min(Number(item.width_mm) || 1, length));
    const offset = clamp(Number(item.offset_mm) || 0, 0, Math.max(0, length - width));
    if (item.wall === "top") return [{ x: o.x + offset, y: o.y }, { x: o.x + offset + width, y: o.y }, { x: 0, y: -1 }];
    if (item.wall === "bottom") return [{ x: o.x + offset, y: o.y + o.h }, { x: o.x + offset + width, y: o.y + o.h }, { x: 0, y: 1 }];
    if (item.wall === "left") return [{ x: o.x, y: o.y + offset }, { x: o.x, y: o.y + offset + width }, { x: -1, y: 0 }];
    return [{ x: o.x + o.w, y: o.y + offset }, { x: o.x + o.w, y: o.y + offset + width }, { x: 1, y: 0 }];
  }

  function renderWindows(geometry, tr) {
    if (!projectState.hasWindows || !projectState.windows?.length) return "";
    return projectState.windows.map((item) => {
      const [start0, end0, normal] = windowSegment(item, geometry);
      const start = tr.map(start0);
      const end = tr.map(end0);
      const gap = 16;
      const start2 = { x: start.x + normal.x * gap, y: start.y + normal.y * gap };
      const end2 = { x: end.x + normal.x * gap, y: end.y + normal.y * gap };
      const tx = (start2.x + end2.x) / 2 + normal.x * 10;
      const ty = (start2.y + end2.y) / 2 + normal.y * 10;
      return `<g data-window-id="${escapeHtml(item.id)}">
        <line class="window-line" x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}"/>
        <line class="window-glass" x1="${start2.x}" y1="${start2.y}" x2="${end2.x}" y2="${end2.y}"/>
        <line class="window-glass" x1="${start.x}" y1="${start.y}" x2="${start2.x}" y2="${start2.y}"/>
        <line class="window-glass" x1="${end.x}" y1="${end.y}" x2="${end2.x}" y2="${end2.y}"/>
        <line class="window-hit" data-window-id="${escapeHtml(item.id)}" x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}"/>
        <text class="window-text" x="${tx}" y="${ty}" text-anchor="middle">Окно ${escapeHtml(item.width_mm || "")}</text>
      </g>`;
    }).join("");
  }


  function zoneRect(geometry, zone) {
    if (zone === "outer") return geometry.outer;
    if (zone === "turn") return geometry.rects.find((r) => r.id === "turn") || geometry.rects.find((r) => r.id === "opening") || geometry.outer;
    return geometry.rects.find((r) => r.id === zone) || geometry.outer;
  }

  function renderAscent(geometry, tr) {
    const a = projectState.ascent || DEFAULT_PROJECT.ascent;
    if (a.show === false) return "";
    const items = [];
    const v = variant();

    // v12: стрелка подъёма — отдельный вспомогательный слой.
    // Она намеренно короткая и уходит в боковой «коридор» марша,
    // чтобы не спорить с размерными линиями и основной маршрутной стрелкой.
    const arrowForRect = (key, rect, reverse = false) => {
      if (!rect) return;
      const horizontal = rect.w >= rect.h;
      const lane = key === "flight2" ? 0.74 : 0.26;
      let start;
      let end;
      let label;
      if (horizontal) {
        const y = rect.y + rect.h * lane;
        start = { x: rect.x + rect.w * 0.18, y };
        end = { x: rect.x + rect.w * 0.44, y };
        label = { x: rect.x + rect.w * 0.31, y: y + (lane < 0.5 ? -Math.max(14, rect.h * 0.10) : Math.max(22, rect.h * 0.16)) };
      } else {
        const x = rect.x + rect.w * lane;
        start = { x, y: rect.y + rect.h * 0.82 };
        end = { x, y: rect.y + rect.h * 0.56 };
        label = { x: x + (lane < 0.5 ? Math.max(26, rect.w * 0.22) : -Math.max(26, rect.w * 0.22)), y: rect.y + rect.h * 0.69 };
      }
      if (reverse) [start, end] = [end, start];
      const s = tr.map(start);
      const e = tr.map(end);
      const l = tr.map(label);
      items.push(`<g class="ascent-layer" data-ascent="${key}"><line class="ascent-line" x1="${s.x}" y1="${s.y}" x2="${e.x}" y2="${e.y}"/><line class="ascent-hit" x1="${s.x}" y1="${s.y}" x2="${e.x}" y2="${e.y}"/><text class="ascent-text" x="${l.x}" y="${l.y}" text-anchor="middle">подъём</text></g>`);
    };
    if (v.opening === "straight") {
      arrowForRect("flight1", geometry.rects.find((r) => r.id === "opening") || geometry.rects.find((r) => r.id === "flight1") || geometry.outer, a.flight1 === "turn_to_start");
    } else {
      arrowForRect("flight1", geometry.rects.find((r) => r.id === "flight1"), a.flight1 === "turn_to_start");
      arrowForRect("flight2", geometry.rects.find((r) => r.id === "flight2"), a.flight2 === "exit_to_turn");
    }
    return items.join("");
  }

  function renderTopBalustrade(geometry, tr) {
    const b = projectState.topBalustrade || DEFAULT_PROJECT.topBalustrade;
    if (!b.enabled) return "";
    const rect = geometry.outer;
    const sides = b.sides?.length ? b.sides : ["top"];
    return sides.map((side) => {
      const [a0, b0] = sideSegment(rect, side);
      const a = tr.map(a0);
      const c = tr.map(b0);
      const mid = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
      const labelOffset = side === "top" ? -14 : side === "bottom" ? 24 : -10;
      return `<g><line class="balustrade-line" x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}"/><text class="balustrade-text" x="${mid.x}" y="${mid.y + labelOffset}" text-anchor="middle">верхняя балюстрада</text></g>`;
    }).join("");
  }

  function sideUnit(side) {
    if (side === "top" || side === "bottom") return { x: 1, y: 0 };
    return { x: 0, y: 1 };
  }

  function normalForSide(side) {
    if (side === "top") return { x: 0, y: -1 };
    if (side === "bottom") return { x: 0, y: 1 };
    if (side === "left") return { x: -1, y: 0 };
    return { x: 1, y: 0 };
  }

  function renderOneObstacleOnSegment(item, rect, tr, classPrefix = "obstacle") {
    const side = item.side || "top";
    const [s0, e0] = sideSegment(rect, side);
    const ux = e0.x - s0.x;
    const uy = e0.y - s0.y;
    const len = Math.hypot(ux, uy) || 1;
    const unit = { x: ux / len, y: uy / len };
    const normal = normalForSide(side);
    const width = Math.max(60, Number(item.width_mm || item.obstacleWidth_mm) || 700);
    const offset = clamp(Number(item.offset_mm || item.obstacleOffset_mm) || 0, 0, len);
    const p0 = { x: s0.x + unit.x * offset + normal.x * 45, y: s0.y + unit.y * offset + normal.y * 45 };
    const p1 = { x: p0.x + unit.x * Math.min(width, len), y: p0.y + unit.y * Math.min(width, len) };
    const a = tr.map(p0);
    const b = tr.map(p1);
    const boxW = Math.max(20, Math.abs(b.x - a.x) || 20);
    const boxH = Math.max(20, Math.abs(b.y - a.y) || 20);
    const x = Math.min(a.x, b.x) - (side === "left" || side === "right" ? 10 : 0);
    const y = Math.min(a.y, b.y) - (side === "top" || side === "bottom" ? 10 : 0);
    const textX = (a.x + b.x) / 2;
    const textY = (a.y + b.y) / 2 - 12;
    const label = `${item.type || item.obstacleType || "препятствие"}${width ? " " + Math.round(width) : ""}`;
    return `<g><rect class="obstacle-mark" x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="4"/><text class="obstacle-text" x="${textX}" y="${textY}" text-anchor="middle">${escapeHtml(label)}</text></g>`;
  }

  function renderEdgeExtensions(geometry, tr) {
    return (projectState.edgeExtensions || []).map((item) => {
      const rect = zoneRect(geometry, item.zone || "outer");
      const side = item.side || "top";
      const [s0, e0] = sideSegment(rect, side);
      const ux = e0.x - s0.x;
      const uy = e0.y - s0.y;
      const len = Math.hypot(ux, uy) || 1;
      const unit = { x: ux / len, y: uy / len };
      const before = Number(item.extendBefore_mm) || 0;
      const after = Number(item.extendAfter_mm) || 0;
      const normal = normalForSide(side);
      const baseS = { x: s0.x + normal.x * 30, y: s0.y + normal.y * 30 };
      const baseE = { x: e0.x + normal.x * 30, y: e0.y + normal.y * 30 };
      const parts = [];
      if (before > 0) {
        const a0 = { x: baseS.x - unit.x * before, y: baseS.y - unit.y * before };
        const a = tr.map(a0); const b = tr.map(baseS);
        parts.push(`<line class="edge-extension" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/><text class="edge-extension-dim" x="${(a.x+b.x)/2}" y="${(a.y+b.y)/2 - 8}" text-anchor="middle">${Math.round(before)} мм</text>`);
      }
      if (after > 0) {
        const e1 = { x: baseE.x + unit.x * after, y: baseE.y + unit.y * after };
        const a = tr.map(baseE); const b = tr.map(e1);
        parts.push(`<line class="edge-extension" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/><text class="edge-extension-dim" x="${(a.x+b.x)/2}" y="${(a.y+b.y)/2 - 8}" text-anchor="middle">${Math.round(after)} мм</text>`);
      }
      const obs = item.obstacleType ? renderOneObstacleOnSegment(item, rect, tr) : "";
      return `<g data-edge-id="${escapeHtml(item.id)}">${parts.join("")}${obs}</g>`;
    }).join("");
  }

  function renderObstacles(geometry, tr) {
    return (projectState.obstacles || []).map((item) => renderOneObstacleOnSegment(item, zoneRect(geometry, item.zone || "outer"), tr)).join("");
  }

  function setActiveParam(code) {
    projectState.activeParam = code;
    projectState.activeZone = "";
    saveState();
    scheduleRender();
    setTimeout(() => {
      const input = $(`[data-param-code="${code}"]`, $("#" + ROOT_ID));
      input?.scrollIntoView({ behavior: "smooth", block: "center" });
      input?.focus();
      input?.select?.();
    }, 80);
  }

  function setActiveZone(zone) {
    projectState.activeZone = zone;
    projectState.activeParam = "";
    saveState();
    scheduleRender();
  }

  function toggleWall(path) {
    const [zone, side] = path.split(".");
    if (!projectState.walls[zone]) projectState.walls[zone] = {};
    projectState.walls[zone][side] = !projectState.walls[zone][side];
    saveState();
    scheduleRender();
  }

  function setWall(path, checked) {
    const [zone, side] = path.split(".");
    if (!projectState.walls[zone]) projectState.walls[zone] = {};
    projectState.walls[zone][side] = checked;
    saveState();
    scheduleRender();
  }


  function addEdgeExtension() {
    projectState.edgeExtensions = projectState.edgeExtensions || [];
    projectState.edgeExtensions.push({
      id: uid("edge"),
      zone: variant().opening === "straight" ? "outer" : "turn",
      side: "top",
      hasWall: true,
      extendBefore_mm: 0,
      extendAfter_mm: 1200,
      obstacleType: "дверь",
      obstacleOffset_mm: 900,
      obstacleWidth_mm: 800,
      comment: "До двери можно продлить лестницу",
    });
    saveState();
    scheduleRender();
  }

  function addObstacle() {
    projectState.obstacles = projectState.obstacles || [];
    projectState.obstacles.push({
      id: uid("obs"),
      zone: "outer",
      side: "right",
      type: "дверь",
      offset_mm: 1200,
      width_mm: 800,
      depth_mm: 0,
      comment: "",
    });
    saveState();
    scheduleRender();
  }

  function updateKeyedItem(listName, id, field, value, checked = null) {
    const list = projectState[listName] || [];
    const item = list.find((entry) => entry.id === id);
    if (!item) return false;
    if (checked !== null && typeof item[field] === "boolean") item[field] = checked;
    else if (field.endsWith("_mm") || ["offset_mm", "width_mm", "depth_mm", "extendBefore_mm", "extendAfter_mm", "obstacleOffset_mm", "obstacleWidth_mm"].includes(field)) item[field] = cleanNumericDraft(value);
    else item[field] = value;
    projectState[listName] = list;
    saveState();
    scheduleRender();
    return true;
  }

  function commitSiteMark(target) {
    if (!target) return false;
    if (target.dataset.ascentField) {
      projectState.ascent[target.dataset.ascentField] = target.value;
      saveState(); scheduleRender(); return true;
    }
    if (target.dataset.ascentCheck) {
      projectState.ascent[target.dataset.ascentCheck] = target.checked;
      saveState(); scheduleRender(); return true;
    }
    if (target.dataset.balustradeField) {
      const field = target.dataset.balustradeField;
      projectState.topBalustrade[field] = field.endsWith("_mm") ? cleanNumericDraft(target.value) : target.value;
      saveState(); scheduleRender(); return true;
    }
    if (target.dataset.balustradeCheck) {
      projectState.topBalustrade[target.dataset.balustradeCheck] = target.checked;
      saveState(); scheduleRender(); return true;
    }
    if (target.dataset.balustradeSide) {
      const side = target.dataset.balustradeSide;
      const sides = new Set(projectState.topBalustrade.sides || []);
      if (target.checked) sides.add(side); else sides.delete(side);
      projectState.topBalustrade.sides = Array.from(sides);
      saveState(); scheduleRender(); return true;
    }
    if (target.dataset.edge) return updateKeyedItem("edgeExtensions", target.dataset.edge, target.dataset.edgeField, target.value, target.type === "checkbox" ? target.checked : null);
    if (target.dataset.obstacle) return updateKeyedItem("obstacles", target.dataset.obstacle, target.dataset.obstacleField, target.value, null);
    return false;
  }

  function flipAscent(which) {
    projectState.ascent = projectState.ascent || clone(DEFAULT_PROJECT.ascent);
    if (which === "flight2") projectState.ascent.flight2 = projectState.ascent.flight2 === "exit_to_turn" ? "turn_to_exit" : "exit_to_turn";
    else projectState.ascent.flight1 = projectState.ascent.flight1 === "turn_to_start" ? "start_to_turn" : "turn_to_start";
    saveState();
    scheduleRender();
  }

  function addWindow() {
    projectState.hasWindows = true;
    projectState.windows.push({
      id: uid("win"),
      wall: "top",
      offset_mm: 1000,
      width_mm: 900,
      height_mm: 1200,
      sill_height_mm: 900,
      comment: "",
    });
    saveState();
    scheduleRender();
  }

  function finishedWidth(baseWidth, walls) {
    const side = Number(finishState.settings.side_overhang_mm) || 0;
    return Math.round((Number(baseWidth) || 0) + (walls.left ? 0 : side) + (walls.right ? 0 : side));
  }

  function fillFinishFromScheme() {
    const v = variant();
    const p = collectParams();
    const front = Number(finishState.settings.front_overhang_mm) || 0;
    const depth1 = Math.round((p.treadDepthFlight1 || p.treadDepth || DEFAULT_STEP_DEPTH) + front);
    const depth2 = Math.round((p.treadDepthFlight2 || p.treadDepth || DEFAULT_STEP_DEPTH) + front);

    const isSchemaItem = (kind, item) => {
      if (item?.auto === true || item?.source === "schema") return true;
      const name = String(item?.name || "");
      if (kind === "steps") return ["Марш 1", "Марш 2", "Забежные"].includes(name);
      if (kind === "landings") return name === "Площадка/поворотная зона";
      if (kind === "boots") return name.startsWith("Сапожок марш ");
      return false;
    };

    const manualSteps = (finishState.steps || []).filter((item) => !isSchemaItem("steps", item));
    const manualLandings = (finishState.landings || []).filter((item) => !isSchemaItem("landings", item));
    const manualBoots = (finishState.boots || []).filter((item) => !isSchemaItem("boots", item));

    const steps = [];
    if (v.mode === "ready" && p.firstFlightSteps > 0) {
      steps.push({
        id: uid("step"),
        name: "Марш 1",
        count: p.firstFlightSteps,
        depth_mm: depth1,
        width_mm: finishedWidth(p.firstFlightWidth || 1000, projectState.walls.flight1),
        thickness_mm: DEFAULT_FINISH_THICKNESS,
        material: "",
        finish: "",
        comment: "Готовая ступень марша 1",
        source: "schema",
        auto: true,
      });
    }
    if (v.mode === "ready" && v.key !== "ready_straight" && p.secondFlightSteps > 0) {
      steps.push({
        id: uid("step"),
        name: "Марш 2",
        count: p.secondFlightSteps,
        depth_mm: depth2,
        width_mm: finishedWidth(p.secondFlightWidth || p.firstFlightWidth || 1000, projectState.walls.flight2),
        thickness_mm: DEFAULT_FINISH_THICKNESS,
        material: "",
        finish: "",
        comment: "Готовая ступень марша 2",
        source: "schema",
        auto: true,
      });
    }
    if (v.mode === "ready" && v.turn === "winder" && p.winderSteps > 0) {
      steps.push({
        id: uid("step"),
        name: "Забежные",
        count: p.winderSteps,
        depth_mm: "",
        width_mm: "",
        thickness_mm: DEFAULT_FINISH_THICKNESS,
        material: "",
        finish: "",
        comment: "Забежные ступени, размеры уточнить по шаблону/чертежу",
        source: "schema",
        auto: true,
      });
    }

    const landings = [];
    if (v.mode === "ready" && v.turn === "landing") {
      landings.push({
        id: uid("landing"),
        name: "Площадка/поворотная зона",
        count: 1,
        length_mm: p.turnLength || "",
        width_mm: p.turnWidth || "",
        thickness_mm: DEFAULT_FINISH_THICKNESS,
        material: "",
        finish: "",
        comment: "Площадка/поворотная зона",
        source: "schema",
        auto: true,
      });
    }

    const boots = [];
    const addBoot = (flight, side, label, length) => {
      if (!finishState.settings.add_boots_by_walls || v.mode !== "ready") return;
      if (!projectState.walls?.[flight]?.[side]) return;
      boots.push({
        id: uid("boot"),
        name: `Сапожок ${label} ${side === "left" ? "слева" : "справа"}`,
        count: 1,
        length_mm: Math.round(Number(length) || 0),
        height_mm: 150,
        thickness_mm: 18,
        side: side === "left" ? "левый" : "правый",
        material: "МДФ",
        finish: "",
        comment: "Автоматически по отмеченной стене",
        source: "schema",
        auto: true,
      });
    };

    addBoot("flight1", "left", "марш 1", p.firstFlightLength);
    addBoot("flight1", "right", "марш 1", p.firstFlightLength);
    if (v.key !== "ready_straight") {
      addBoot("flight2", "left", "марш 2", p.secondFlightLength);
      addBoot("flight2", "right", "марш 2", p.secondFlightLength);
    }

    finishState.steps = [...manualSteps, ...steps];
    finishState.landings = [...manualLandings, ...landings];
    finishState.boots = [...manualBoots, ...boots];
    saveState();
    scheduleRender();
  }

  function addFinish(kind) {
    if (kind === "steps") {
      finishState.steps.push({ id: uid("step"), name: "", count: 1, depth_mm: "", width_mm: "", thickness_mm: DEFAULT_FINISH_THICKNESS, material: "", finish: "", comment: "", source: "manual", auto: false });
    } else if (kind === "landings") {
      finishState.landings.push({ id: uid("landing"), name: "", count: 1, length_mm: "", width_mm: "", thickness_mm: DEFAULT_FINISH_THICKNESS, material: "", finish: "", comment: "", source: "manual", auto: false });
    } else if (kind === "boots") {
      finishState.boots.push({ id: uid("boot"), name: "", count: 1, length_mm: "", height_mm: "", thickness_mm: 18, side: "не указано", material: "", finish: "", comment: "", source: "manual", auto: false });
    } else {
      finishState.comments.push({ id: uid("comment"), text: "" });
    }
    saveState();
    scheduleRender();
  }

  function removeFinish(kind, id) {
    finishState[kind] = (finishState[kind] || []).filter((item) => item.id !== id);
    saveState();
    scheduleRender();
  }

  function downloadText(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    saveState(lastSvg);
    const payload = {
      drawing_project_json: safeParse(readField("drawing_project_json"), {}),
      finish_dimensions_json: finishState,
      drawing_svg: lastSvg,
    };
    downloadText(`${selectedKey() || "zamer"}_drawing.json`, JSON.stringify(payload, null, 2), "application/json");
  }

  function isAutoCalcSource(fieldName) {
    return ["flight1_steps_count", "flight2_steps_count", "tread_depth_mm", "tread_depth_flight1_mm", "tread_depth_flight2_mm"].includes(fieldName);
  }

  function syncSameFieldInputs(root, fieldName, value, except) {
    $$(`[data-field="${fieldName}"]`, root).forEach((input) => {
      if (input !== except) input.value = value;
    });
  }

  function updateDraftField(target, root) {
    const fieldName = target.dataset.field;
    if (!fieldName) return;
    const value = target.dataset.paramCode ? cleanNumericDraft(target.value) : target.value;
    if (target.value !== value) target.value = value;
    fieldDrafts.set(fieldName, value);
    writeField(fieldName, value, true);
    syncSameFieldInputs(root, fieldName, value, target);
  }

  function commitField(target, root) {
    const fieldName = target?.dataset?.field;
    if (!fieldName) return false;
    updateDraftField(target, root);
    fieldDrafts.delete(fieldName);
    if (isAutoCalcSource(fieldName)) applyAutoCalc();
    saveState();
    scheduleRender();
    return true;
  }

  function commitWindow(target) {
    const id = target?.dataset?.window;
    if (!id) return false;
    const item = projectState.windows.find((windowItem) => windowItem.id === id);
    if (!item) return false;
    const field = target.dataset.windowField;
    const numeric = ["offset_mm", "width_mm", "height_mm", "sill_height_mm"].includes(field);
    const value = numeric ? cleanNumericDraft(target.value) : target.value;
    if (target.value !== value) target.value = value;
    item[field] = value;
    saveState();
    scheduleRender();
    return true;
  }

  function commitFinishSetting(target) {
    const field = target?.dataset?.finishSetting;
    if (!field) return false;
    const value = cleanNumericDraft(target.value);
    if (target.value !== value) target.value = value;
    finishState.settings[field] = Number(value) || 0;
    finishState.settings.tread_overhang_mm = finishState.settings.front_overhang_mm;
    saveState();
    return true;
  }

  function commitFinishItem(target) {
    const kind = target?.dataset?.finishKind;
    if (!kind) return false;
    const list = finishState[kind] || [];
    const item = list.find((entry) => entry.id === target.dataset.id);
    if (!item) return false;
    const field = target.dataset.finishField;
    const numeric = field === "count" || field.endsWith("_mm");
    const value = numeric ? cleanNumericDraft(target.value) : target.value;
    if (target.value !== value) target.value = value;
    item[field] = value;
    saveState();
    return true;
  }

  function commitEditable(target, root) {
    return commitField(target, root) || commitWindow(target) || commitFinishSetting(target) || commitFinishItem(target) || commitSiteMark(target);
  }

  function bindRoot(root) {
    root.oninput = (event) => {
      const target = event.target;
      if (!target) return;
      if (target.dataset.field) {
        updateDraftField(target, root);
        if (isAutoCalcSource(target.dataset.field)) applyAutoCalc();
        return;
      }
      if (target.dataset.window) {
        const numeric = ["offset_mm", "width_mm", "height_mm", "sill_height_mm"].includes(target.dataset.windowField);
        if (numeric) target.value = cleanNumericDraft(target.value);
        return;
      }
      if (target.dataset.finishSetting) {
        target.value = cleanNumericDraft(target.value);
        return;
      }
      if (target.dataset.finishKind) {
        const field = target.dataset.finishField || "";
        if (field === "count" || field.endsWith("_mm")) target.value = cleanNumericDraft(target.value);
      }
      if (target.dataset.balustradeField?.endsWith("_mm") || target.dataset.edgeField?.endsWith("_mm") || target.dataset.obstacleField?.endsWith("_mm")) {
        target.value = cleanNumericDraft(target.value);
      }
    };

    root.onchange = (event) => {
      const target = event.target;
      if (!target) return;
      if ("mode" in target.dataset) {
        const next = target.value === "ready" ? "ready_straight" : "empty_straight";
        setVariant(next);
      }
      if ("variant" in target.dataset) setVariant(target.value);
      if (target.dataset.auto) {
        projectState.autoCalc[target.dataset.auto] = target.checked;
        applyAutoCalc();
        saveState();
        scheduleRender();
      }
      if ("treadSame" in target.dataset) {
        projectState.treadMode.sameTread = target.checked;
        if (target.checked) {
          const common = numberField("tread_depth_flight1_mm", numberField("tread_depth_mm", DEFAULT_STEP_DEPTH));
          writeField("tread_depth_mm", common, true);
          writeField("tread_depth_flight1_mm", common, true);
          writeField("tread_depth_flight2_mm", common, true);
          projectState.treadMode.b1 = common;
          projectState.treadMode.b2 = common;
        } else {
          const common = numberField("tread_depth_mm", DEFAULT_STEP_DEPTH);
          if (!readField("tread_depth_flight1_mm")) writeField("tread_depth_flight1_mm", common, true);
          if (!readField("tread_depth_flight2_mm")) writeField("tread_depth_flight2_mm", common, true);
          projectState.treadMode.b1 = numberField("tread_depth_flight1_mm", common);
          projectState.treadMode.b2 = numberField("tread_depth_flight2_mm", common);
        }
        applyAutoCalc();
        saveState();
        scheduleRender();
      }
      if (target.dataset.wallCheck) setWall(target.dataset.wallCheck, target.checked);
      if (target.dataset.projectBool) {
        projectState[target.dataset.projectBool] = target.checked;
        saveState();
        scheduleRender();
      }
      if (target.dataset.field) commitField(target, root);
      if (target.dataset.window) commitWindow(target);
      if (target.dataset.finishSettingCheck) {
        finishState.settings[target.dataset.finishSettingCheck] = target.checked;
        saveState();
      }
      if (target.dataset.finishSetting) commitFinishSetting(target);
      if (target.dataset.finishKind) commitFinishItem(target);
      commitSiteMark(target);
    };

    root.onfocusin = (event) => {
      const target = event.target;
      if (!target?.dataset?.paramCode || target.readOnly) return;
      target.closest(".db-field")?.classList.add("is-active");
      target.closest(".db-mini-input")?.classList.add("is-active");
      setTimeout(() => target.select?.(), 0);
    };

    root.onfocusout = (event) => {
      const target = event.target;
      target?.closest?.(".db-field")?.classList.remove("is-active");
      target?.closest?.(".db-mini-input")?.classList.remove("is-active");
      commitEditable(target, root);
    };

    root.onkeydown = (event) => {
      if (event.key !== "Enter") return;
      const target = event.target;
      if (!target?.matches?.("input, textarea, select")) return;
      if (commitEditable(target, root)) {
        event.preventDefault();
        target.blur?.();
      }
    };

    root.onclick = (event) => {
      const action = event.target?.closest?.("[data-action]")?.dataset.action;
      if (action) {
        commitEditable(document.activeElement, root);
        if (action === "save") form()?.requestSubmit?.();
        if (action === "toggle-fields") {
          projectState.showFields = !projectState.showFields;
          saveState();
          scheduleRender();
        }
        if (action === "download-svg") downloadText(`${selectedKey() || "zamer"}_drawing.svg`, lastSvg, "image/svg+xml;charset=utf-8");
        if (action === "download-json") exportJson();
        if (action === "copy-svg") navigator.clipboard?.writeText(lastSvg);
        if (action === "full-editor") window.open("./svg-constructor/embedded.html", "_blank");
        if (action === "add-window") addWindow();
        if (action === "fill-finish") fillFinishFromScheme();
        if (action === "add-step") addFinish("steps");
        if (action === "add-landing") addFinish("landings");
        if (action === "add-boot") addFinish("boots");
        if (action === "add-finish-comment") addFinish("comments");
        if (action === "add-edge-extension") addEdgeExtension();
        if (action === "add-obstacle") addObstacle();
        return;
      }
      const param = event.target?.closest?.("[data-param]")?.dataset.param;
      if (param) {
        setActiveParam(param);
        return;
      }
      const zone = event.target?.closest?.("[data-zone]")?.dataset.zone;
      if (zone) {
        setActiveZone(zone);
        return;
      }
      const ascent = event.target?.closest?.("[data-ascent]")?.dataset.ascent;
      if (ascent) {
        flipAscent(ascent);
        return;
      }
      const wall = event.target?.closest?.("[data-wall]")?.dataset.wall;
      if (wall) {
        toggleWall(wall);
        return;
      }
      const win = event.target?.closest?.("[data-window-id]")?.dataset.windowId;
      if (win) {
        projectState.activeWindowId = win;
        saveState();
        scheduleRender();
        setTimeout(() => $(`[data-window-card="${CSS.escape(win)}"]`, root)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
        return;
      }
      const deleteWindow = event.target?.closest?.("[data-delete-window]")?.dataset.deleteWindow;
      if (deleteWindow) {
        projectState.windows = projectState.windows.filter((item) => item.id !== deleteWindow);
        saveState();
        scheduleRender();
        return;
      }
      const deleteEdge = event.target?.closest?.("[data-delete-edge]")?.dataset.deleteEdge;
      if (deleteEdge) {
        projectState.edgeExtensions = (projectState.edgeExtensions || []).filter((item) => item.id !== deleteEdge);
        saveState(); scheduleRender(); return;
      }
      const deleteObstacle = event.target?.closest?.("[data-delete-obstacle]")?.dataset.deleteObstacle;
      if (deleteObstacle) {
        projectState.obstacles = (projectState.obstacles || []).filter((item) => item.id !== deleteObstacle);
        saveState(); scheduleRender(); return;
      }
      const deleteFinish = event.target?.closest?.("[data-delete-finish]");
      if (deleteFinish) {
        removeFinish(deleteFinish.dataset.deleteFinish, deleteFinish.dataset.id);
      }
    };

    $$("details[data-section]", root).forEach((details) => {
      details.addEventListener("toggle", () => saveSectionState(details.dataset.section, details.open));
    });
  }

  function render() {
    if (!isActive()) return;
    injectStyle();
    refreshState();
    applyAutoCalc();
    const p = panel();
    let root = $("#" + ROOT_ID);
    if (!root) {
      root = document.createElement("section");
      root.id = ROOT_ID;
      p.prepend(root);
    }
    Array.from(p.children).forEach((child) => {
      if (child.id !== ROOT_ID) child.classList.add("db-legacy-hidden");
    });
    const geometry = buildGeometry();
    const svgText = renderSvg(geometry);
    lastSvg = svgText;
    const detailed = isDetailedMode();
    const leftSections = detailed
      ? `
        ${section("frame", "Основные размеры каркаса", frameSection())}
        ${section("actions", "Действия", actionsSection())}
        ${section("walls", "Стены / открытые стороны", wallsSection())}
        ${section("ascent", "Направление подъёма", ascentSection())}
        ${section("upperBalustrade", "Верхняя балюстрада", upperBalustradeSection())}
        ${section("siteMarks", "Стены / продолжение / препятствия", siteMarksSection())}
        ${section("windows", "Окна и проёмы в стенах", windowsSection(geometry))}
        ${section("finish", "Чистовые размеры ступеней и площадок", finishSettingsSection())}
        ${section("comments", "Комментарии к размерам", commentsSection())}
      `
      : `
        ${section("frame", "Основные размеры", frameSection())}
        ${section("ascent", "Направление подъёма", ascentSection())}
        ${section("upperBalustrade", "Верхняя балюстрада", upperBalustradeSection())}
        ${section("siteMarks", "Стены / продолжение / препятствия", siteMarksSection())}
        ${section("comments", "Комментарий", commentsSection())}
      `;
    root.innerHTML = `<div class="db-shell db-mode-${variant().mode} db-measurement-${measurementMode()}">
      <div class="db-left">
        ${leftSections}
      </div>
      <div class="db-right">
        ${section("scheme", "Схема", schemeSection(svgText))}
      </div>
    </div>`;
    saveState(svgText);
    bindRoot(root);
  }

  function scheduleRender(delay = 40) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, delay);
  }

  document.addEventListener("click", (event) => {
    if (event.target?.matches?.('[data-tab="sizes"], .measurement-item, #new-measurement-btn')) {
      refreshState(true);
      scheduleRender();
    }
  });
  document.addEventListener("tekstura:measurement-loaded", () => {
    refreshState(true);
    scheduleRender();
  });
  document.addEventListener("tekstura:measurement-mode-changed", (event) => {
    refreshState(true);
    setMeasurementMode(event.detail?.mode);
  });
  document.addEventListener("DOMContentLoaded", scheduleRender);
  window.addEventListener("load", scheduleRender);
  window.TeksturaDrawingBridge = {
    render,
    refresh: () => {
      refreshState(true);
      render();
    },
    setMeasurementMode,
    getProject: () => projectState,
    getFinish: () => finishState,
  };
})();
