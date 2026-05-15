(() => {
  const ROOT_ID = "sizes-smart-root";
  const STYLE_ID = "sizes-smart-style-sheet-v1";

  const READY_VARIANTS = [
    { key: "ready_straight", label: "Прямая", opening: "Прямой", turn: "" },
    { key: "ready_l_left_landing", label: "Г-левая с площадкой", opening: "Г-образный левый", turn: "Площадка" },
    { key: "ready_l_right_landing", label: "Г-правая с площадкой", opening: "Г-образный правый", turn: "Площадка" },
    { key: "ready_l_left_winder", label: "Г-левая с забежными", opening: "Г-образный левый", turn: "Забежные" },
    { key: "ready_l_right_winder", label: "Г-правая с забежными", opening: "Г-образный правый", turn: "Забежные" },
    { key: "ready_u_landing_left", label: "П-образная с площадкой · старт слева", opening: "П-образный", turn: "Площадка", side: "Старт слева" },
    { key: "ready_u_landing_right", label: "П-образная с площадкой · старт справа", opening: "П-образный", turn: "Площадка", side: "Старт справа" },
    { key: "ready_u_winder_left", label: "П-образная с забежными · старт слева", opening: "П-образный", turn: "Забежные", side: "Старт слева" },
    { key: "ready_u_winder_right", label: "П-образная с забежными · старт справа", opening: "П-образный", turn: "Забежные", side: "Старт справа" },
  ];

  const EMPTY_VARIANTS = [
    { key: "empty_rect", label: "Прямоугольный проём", opening: "Прямой", turn: "" },
    { key: "empty_l", label: "Г-образный / сложный проём", opening: "Г-образный левый", turn: "" },
  ];

  const CUSTOM_FIELDS = new Set([
    "flight1_steps_count",
    "flight2_steps_count",
    "winder_steps_count",
    "platform_count",
    "riser_height_mm",
    "tread_depth_mm",
  ]);

  const FIELDS = {
    empty: [
      ["H", "height_clean_to_clean_mm", "Высота пола до пола", "мм", 4, 58],
      ["T", "slab_thickness_mm", "Толщина перекрытия", "мм", 82, 51],
      ["L", "opening_length_mm", "Длина проёма", "мм", 45, 8],
      ["W", "opening_width_mm", "Ширина проёма", "мм", 4, 25],
      ["B", "desired_flight_width_mm", "Желаемая ширина марша", "мм", 76, 78],
    ],
    straight: [
      ["M1", "flight1_length_mm", "Длина марша", "мм", 46, 13],
      ["B1", "flight1_width_mm", "Ширина марша", "мм", 82, 47],
      ["N", "flight1_steps_count", "Кол-во ступеней", "шт", 46, 80],
      ["h", "riser_height_mm", "Подступёнок", "мм", 4, 80],
      ["b", "tread_depth_mm", "Проступь", "мм", 22, 13],
    ],
    ready: [
      ["M1", "flight1_length_mm", "Длина марша 1", "мм", 7, 77],
      ["B1", "flight1_width_mm", "Ширина марша 1", "мм", 4, 51],
      ["N1", "flight1_steps_count", "Ступени марш 1", "шт", 24, 84],
      ["M2", "flight2_length_mm", "Длина марша 2", "мм", 64, 9],
      ["B2", "flight2_width_mm", "Ширина марша 2", "мм", 83, 32],
      ["N2", "flight2_steps_count", "Ступени марш 2", "шт", 74, 56],
    ],
    landing: [
      ["PL", "corner_zone_length_mm", "Длина площадки", "мм", 42, 31],
      ["PW", "corner_zone_width_mm", "Ширина площадки", "мм", 22, 30],
      ["P", "platform_count", "Площадка", "шт", 42, 45],
      ["h", "riser_height_mm", "Подступёнок", "мм", 4, 11],
      ["b", "tread_depth_mm", "Проступь", "мм", 20, 11],
    ],
    winder: [
      ["ZL", "corner_zone_length_mm", "Длина забежной зоны", "мм", 42, 31],
      ["ZW", "corner_zone_width_mm", "Ширина забежной зоны", "мм", 22, 30],
      ["ZN", "winder_steps_count", "Забежные ступени", "шт", 42, 45],
      ["h", "riser_height_mm", "Подступёнок", "мм", 4, 11],
      ["b", "tread_depth_mm", "Проступь", "мм", 20, 11],
    ],
  };

  const CONDITIONS = [
    ["wall_material", "Материал стен", "text"],
    ["slab_material", "Материал перекрытия", "text"],
    ["has_warm_floor", "Тёплый пол", "select"],
    ["has_pipes", "Есть трубы", "checkbox"],
    ["has_electricity", "Есть электрика", "checkbox"],
    ["has_ventilation", "Есть вентиляция", "checkbox"],
  ];

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      body:has(.tab.active[data-tab="sizes"]) .stats-grid,
      body:has(.tab.active[data-tab="sizes"]) .toolbar,
      body:has(.tab.active[data-tab="sizes"]) .list-panel{display:none!important}
      body:has(.tab.active[data-tab="sizes"]) .layout{display:block!important;max-width:none!important}
      body:has(.tab.active[data-tab="sizes"]) .detail-panel{width:100%!important;max-width:none!important}
      body:has(.tab.active[data-tab="sizes"]) .detail-panel.card{padding:16px!important}
      #${ROOT_ID}{width:100%;margin:0;color:#0b1736}
      #${ROOT_ID} *{box-sizing:border-box}
      .sz-legacy-hidden{display:none!important}
      .sz-sheet{background:#fff;border:1px solid #d8e2ef;border-radius:22px;box-shadow:0 18px 42px rgba(15,23,42,.05);padding:16px;width:100%}
      .sz-toolbar{display:grid;grid-template-columns:310px minmax(320px,1fr);gap:12px;margin-bottom:14px;align-items:end}
      .sz-mode{height:50px;display:grid;grid-template-columns:1fr 1fr;border:1px solid #d5dfed;border-radius:15px;overflow:hidden;background:#fff}
      .sz-mode button{border:0;background:#fff;color:#0b1736;font-weight:950;font-size:14px;cursor:pointer}
      .sz-mode button.active{background:#061844;color:#fff}
      .sz-select label{display:block;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:6px}
      .sz-select select{width:100%;height:50px;border:1px solid #d5dfed;border-radius:15px;background:#fff;padding:0 14px;font-size:15px;font-weight:900;color:#0b1736;outline:none}
      .sz-board{position:relative;min-height:760px;border:1px solid #d8e2ef;border-radius:18px;background:#fff;overflow:hidden;padding:10px}
      .sz-board svg{position:absolute;inset:10px;width:calc(100% - 20px);height:calc(100% - 20px);display:block}
      .sz-dim{position:absolute;width:154px;min-height:58px;border:1px solid #b8c7dc;border-radius:10px;background:#fff;box-shadow:0 8px 20px rgba(15,23,42,.07);padding:6px;display:grid;grid-template-columns:32px 1fr;gap:6px;align-items:center}
      .sz-dim::after{content:"";position:absolute;background:#0b1736;opacity:.45}
      .sz-dim.top::after{left:50%;bottom:-24px;width:2px;height:24px;transform:translateX(-50%)}
      .sz-dim.bottom::after{left:50%;top:-24px;width:2px;height:24px;transform:translateX(-50%)}
      .sz-dim.left::after{right:-24px;top:50%;width:24px;height:2px;transform:translateY(-50%)}
      .sz-dim.right::after{left:-24px;top:50%;width:24px;height:2px;transform:translateY(-50%)}
      .sz-code{height:32px;border-radius:8px;background:#061844;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:950}
      .sz-label{font-size:10px;font-weight:900;color:#334155;line-height:1.05;margin:0 0 3px}
      .sz-value{display:grid;grid-template-columns:minmax(0,1fr) 25px;gap:5px;align-items:center}
      .sz-value input{height:30px;border:1px solid #cbd5e1;border-radius:8px;text-align:center;font-size:14px;font-weight:950;color:#061844;outline:none;background:#fff;padding:0 5px}
      .sz-unit{font-style:normal;font-size:10px;font-weight:950;color:#64748b}
      .sz-comment{margin-top:14px;display:grid;grid-template-columns:150px 1fr;gap:10px;align-items:start}
      .sz-comment label{font-size:13px;font-weight:950;color:#334155;padding-top:12px}
      .sz-comment textarea{width:100%;min-height:58px;border:1px solid #cbd5e1;border-radius:14px;padding:12px;font-size:14px;line-height:1.35;resize:vertical;outline:none}
      .sz-footer{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:14px;margin-top:14px;align-items:start}
      .sz-note{padding:12px;border-radius:14px;background:#f1f6ff;border:1px solid #dbeafe;color:#183b72;font-size:12px;line-height:1.35;font-weight:850}
      .sz-conditions{border:1px solid #e0e8f3;border-radius:14px;padding:12px;background:#fbfdff}
      .sz-conditions summary{cursor:pointer;font-size:14px;font-weight:950}
      .sz-cond-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
      .sz-cond-grid label{font-size:12px;font-weight:850;color:#475569;display:grid;gap:4px}
      .sz-cond-grid input,.sz-cond-grid select{height:38px;border:1px solid #cbd5e1;border-radius:11px;padding:0 9px;background:#fff;color:#0b1736;font-size:14px}
      .sz-check{display:flex!important;align-items:center;gap:8px;border:1px solid #dbe3ef;border-radius:12px;padding:9px;background:#fff}.sz-check input{width:auto;height:auto}
      @media(max-width:1100px){.sz-board{min-height:760px}.sz-footer{grid-template-columns:1fr}.sz-dim{width:172px}.sz-toolbar{grid-template-columns:1fr}}
      @media(max-width:760px){body:has(.tab.active[data-tab="sizes"]) .detail-panel.card{padding:8px!important}.sz-sheet{padding:10px;border-radius:16px}.sz-board{min-height:auto;padding:0;display:grid;gap:8px;border:0;overflow:visible}.sz-board svg{position:relative;inset:auto;width:100%;height:auto;min-height:360px;border:1px solid #d8e2ef;border-radius:16px}.sz-dim{position:relative!important;left:auto!important;top:auto!important;width:100%;grid-template-columns:48px minmax(0,1fr)}.sz-dim::after{display:none}.sz-comment,.sz-cond-grid{grid-template-columns:1fr}.sz-mode{height:48px}}
    `;
    document.head.appendChild(style);
  }

  const form = () => document.querySelector("#measurement-form");
  const panel = () => document.querySelector('[data-panel="sizes"]');
  const active = () => panel() && !panel().classList.contains("hidden") && !document.querySelector("#main-view")?.classList.contains("hidden") && !form()?.classList.contains("hidden");
  const selectedNumber = () => document.querySelector("#form-title")?.textContent?.trim() || "new";
  const storageKey = (name) => `tekstura-zamery:${selectedNumber()}:${name}`;
  const el = (name) => form()?.querySelector(`[name="${name}"]`) || null;

  function ensureHidden(name) {
    let e = el(name);
    if (!e && CUSTOM_FIELDS.has(name) && form()) {
      e = document.createElement("input");
      e.type = "hidden";
      e.name = name;
      e.value = localStorage.getItem(storageKey(name)) || "";
      form().appendChild(e);
    }
    return e;
  }

  function read(name) {
    const e = ensureHidden(name);
    if (!e) return "";
    const value = e.type === "checkbox" ? (e.checked ? "Да" : "") : (e.value || "");
    return value || (CUSTOM_FIELDS.has(name) ? (localStorage.getItem(storageKey(name)) || "") : "");
  }

  function write(name, value) {
    const e = ensureHidden(name);
    if (!e) return;
    if (e.type === "checkbox") e.checked = Boolean(value);
    else e.value = value ?? "";
    if (CUSTOM_FIELDS.has(name)) localStorage.setItem(storageKey(name), e.value || "");
    e.dispatchEvent(new Event("input", { bubbles: true }));
    e.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function mode() {
    return read("site_situation").includes("Готов") ? "ready" : "empty";
  }

  function listFor(m) {
    return m === "ready" ? READY_VARIANTS : EMPTY_VARIANTS;
  }

  function variantFromForm(m) {
    const opening = read("opening_type");
    const turn = read("turn_type");
    const side = read("stair_direction").toLowerCase();
    if (m === "empty") return opening.includes("Прям") ? "empty_rect" : "empty_l";
    if (opening.includes("Прям")) return "ready_straight";
    if (opening.includes("П-")) {
      const right = side.includes("справа") || side.includes("прав");
      if (turn.includes("Заб")) return right ? "ready_u_winder_right" : "ready_u_winder_left";
      return right ? "ready_u_landing_right" : "ready_u_landing_left";
    }
    const right = opening.includes("прав");
    const winder = turn.includes("Заб");
    if (right && winder) return "ready_l_right_winder";
    if (right) return "ready_l_right_landing";
    if (winder) return "ready_l_left_winder";
    return "ready_l_left_landing";
  }

  function setVariant(m, key) {
    const item = listFor(m).find((v) => v.key === key) || listFor(m)[0];
    write("site_situation", m === "ready" ? "Готовый металлокаркас" : "Пустой проём");
    write("opening_type", item.opening);
    write("turn_type", item.turn || "");
    if (item.side) write("stair_direction", item.side);
  }

  function fieldList(m, key) {
    if (m === "empty") return FIELDS.empty;
    if (key === "ready_straight") return FIELDS.straight;
    return [...FIELDS.ready, ...(key.includes("winder") ? FIELDS.winder : FIELDS.landing)];
  }

  const defs = '<defs><marker id="a" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 Z" fill="#0b1736"/></marker><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#eef3f9" stroke-width="1"/></pattern></defs>';
  const st = '<style>.wall{fill:none;stroke:#0b1736;stroke-width:4;stroke-linejoin:miter;stroke-linecap:square}.step{stroke:#334766;stroke-width:1.7}.route{fill:none;stroke:#0b1736;stroke-width:4;marker-end:url(#a)}.dot{fill:#0b1736}.dash{fill:none;stroke:#94a3b8;stroke-width:2;stroke-dasharray:9 8}.dim{stroke:#0b1736;stroke-width:2;marker-end:url(#a);marker-start:url(#a)}.hint{font:700 16px system-ui;fill:#334155}.title{font:900 22px system-ui;fill:#0b1736}</style>';
  const L = (x1, y1, x2, y2, c = "step") => `<line class="${c}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  const R = (x, y, w, h, c = "wall") => `<rect class="${c}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  const P = (d, c = "wall") => `<path class="${c}" d="${d}"/>`;
  const D = (x, y) => `<circle class="dot" cx="${x}" cy="${y}" r="6"/>`;
  const A = (d) => `<path class="route" d="${d}"/>`;
  const T = (x, y, text, c = "hint") => `<text class="${c}" x="${x}" y="${y}">${text}</text>`;

  function vSteps(x, y, w, h, n) {
    let s = R(x, y, w, h);
    for (let i = 1; i < n; i += 1) {
      const yy = y + (h * i) / n;
      s += L(x, yy, x + w, yy);
    }
    return s;
  }

  function hSteps(x, y, w, h, n) {
    let s = R(x, y, w, h);
    for (let i = 1; i < n; i += 1) {
      const xx = x + (w * i) / n;
      s += L(xx, y, xx, y + h);
    }
    return s;
  }

  function fan(cx, cy, pts) {
    return pts.map((p) => L(cx, cy, p[0], p[1])).join("");
  }

  function svg(body, title) {
    return `<svg viewBox="0 0 900 640" xmlns="http://www.w3.org/2000/svg">${defs}${st}<rect width="900" height="640" fill="white"/><rect width="900" height="640" fill="url(#grid)"/>${T(42, 55, title, "title")}${body}</svg>`;
  }

  function scheme(key) {
    if (key === "empty_rect") return svg(`${R(210, 110, 480, 380)}${L(210, 520, 690, 520, "dim")}${L(180, 110, 180, 490, "dim")}${L(720, 110, 720, 490, "dash")}${D(260, 530)}${A("M260 512V425")}${T(286, 548, "старт")}${T(646, 103, "выход")}`, "Пустой прямой проём");
    if (key === "empty_l") return svg(`${P("M190 520V100H715V220H360V520Z")}${L(190, 550, 715, 550, "dim")}${L(160, 100, 160, 520, "dim")}${D(235, 545)}${A("M235 520V440 M715 160H650")}${T(258, 560, "старт")}${T(722, 165, "выход")}`, "Пустой Г-образный проём");
    if (key === "ready_straight") return svg(`${hSteps(105, 260, 690, 120, 16)}${L(105, 220, 795, 220, "dim")}${L(820, 260, 820, 380, "dim")}${D(805, 320)}${A("M760 320H150")}${T(132, 418, "старт")}${T(735, 306, "выход")}`, "Готовое основание · прямая");
    if (key === "ready_l_left_landing") return svg(`${vSteps(445, 250, 125, 310, 10)}${R(445, 125, 125, 125)}${hSteps(150, 125, 295, 125, 8)}${L(445, 585, 570, 585, "dim")}${L(595, 125, 595, 560, "dim")}${L(150, 95, 570, 95, "dim")}${D(507, 585)}${A("M507 555V190H190")}${T(520, 614, "старт")}${T(170, 115, "выход")}`, "Готовое основание · Г-левая");
    if (key === "ready_l_right_landing") return svg(`${vSteps(330, 250, 125, 310, 10)}${R(330, 125, 125, 125)}${hSteps(455, 125, 295, 125, 8)}${L(330, 585, 455, 585, "dim")}${L(305, 125, 305, 560, "dim")}${L(330, 95, 750, 95, "dim")}${D(392, 585)}${A("M392 555V190H710")}${T(330, 614, "старт")}${T(690, 115, "выход")}`, "Готовое основание · Г-правая");
    if (key === "ready_l_left_winder") return svg(`${vSteps(560, 285, 125, 285, 9)}${R(435, 125, 250, 160)}${hSteps(155, 125, 280, 120, 7)}${fan(560, 285, [[435, 125], [475, 125], [515, 125], [560, 125], [685, 125], [685, 175], [685, 230], [685, 285]])}${L(560, 595, 685, 595, "dim")}${L(710, 125, 710, 570, "dim")}${L(155, 95, 685, 95, "dim")}${D(622, 595)}${A("M622 565V245H190")}${T(634, 620, "старт")}${T(170, 115, "выход")}`, "Готовое основание · Г-левая забежная");
    if (key === "ready_l_right_winder") return svg(`${vSteps(215, 285, 125, 285, 9)}${R(215, 125, 250, 160)}${hSteps(465, 125, 280, 120, 7)}${fan(340, 285, [[465, 125], [425, 125], [385, 125], [340, 125], [215, 125], [215, 175], [215, 230], [215, 285]])}${L(215, 595, 340, 595, "dim")}${L(190, 125, 190, 570, "dim")}${L(215, 95, 745, 95, "dim")}${D(277, 595)}${A("M277 565V245H710")}${T(220, 620, "старт")}${T(690, 115, "выход")}`, "Готовое основание · Г-правая забежная");
    if (key === "ready_u_landing_left") return svg(`${vSteps(170, 235, 125, 325, 9)}${R(170, 110, 560, 125)}${vSteps(605, 235, 125, 325, 9)}${L(170, 80, 730, 80, "dim")}${L(140, 110, 140, 560, "dim")}${L(760, 235, 760, 560, "dim")}${D(232, 585)}${A("M232 555V170H667V320")}${T(245, 610, "старт")}${T(678, 320, "выход")}`, "Готовое основание · П-образная");
    if (key === "ready_u_landing_right") return svg(`${vSteps(170, 235, 125, 325, 9)}${R(170, 110, 560, 125)}${vSteps(605, 235, 125, 325, 9)}${L(170, 80, 730, 80, "dim")}${L(140, 235, 140, 560, "dim")}${L(760, 110, 760, 560, "dim")}${D(667, 585)}${A("M667 555V170H232V320")}${T(680, 610, "старт")}${T(175, 320, "выход")}`, "Готовое основание · П-образная");
    if (key === "ready_u_winder_left") return svg(`${vSteps(150, 250, 135, 310, 8)}${R(150, 95, 600, 155)}${vSteps(615, 250, 135, 310, 8)}${fan(450, 250, [[150, 95], [245, 95], [340, 95], [450, 95], [560, 95], [655, 95], [750, 95]])}${L(150, 70, 750, 70, "dim")}${L(120, 95, 120, 560, "dim")}${L(780, 250, 780, 560, "dim")}${D(217, 585)}${A("M217 555V205H682V320")}${T(230, 610, "старт")}${T(694, 320, "выход")}`, "Готовое основание · П-забежная");
    return svg(`${vSteps(150, 250, 135, 310, 8)}${R(150, 95, 600, 155)}${vSteps(615, 250, 135, 310, 8)}${fan(450, 250, [[150, 95], [245, 95], [340, 95], [450, 95], [560, 95], [655, 95], [750, 95]])}${L(150, 70, 750, 70, "dim")}${L(120, 250, 120, 560, "dim")}${L(780, 95, 780, 560, "dim")}${D(682, 585)}${A("M682 555V205H217V320")}${T(694, 610, "старт")}${T(160, 320, "выход")}`, "Готовое основание · П-забежная");
  }

  function hideLegacy(p) {
    Array.from(p.children).forEach((ch) => {
      if (ch.id !== ROOT_ID) ch.classList.add("sz-legacy-hidden");
    });
  }

  function directionFor(field) {
    if (field[4] < 18) return "left";
    if (field[4] > 70) return "right";
    if (field[5] < 25) return "top";
    return "bottom";
  }

  function dim(field) {
    const [code, name, label, unit, x, y] = field;
    const direction = directionFor(field);
    return `<label class="sz-dim ${direction}" style="left:${x}%;top:${y}%"><span class="sz-code">${code}</span><span><p class="sz-label">${label}</p><span class="sz-value"><input data-bind="${name}" inputmode="numeric" value="${read(name)}"/><em class="sz-unit">${unit}</em></span></span></label>`;
  }

  function cond([name, label, type]) {
    if (type === "checkbox") return `<label class="sz-check"><input type="checkbox" data-bind-check="${name}" ${read(name) ? "checked" : ""}/> ${label}</label>`;
    if (type === "select") return `<label>${label}<select data-bind="${name}"><option ${read(name) === "Не знаю" ? "selected" : ""}>Не знаю</option><option ${read(name) === "Да" ? "selected" : ""}>Да</option><option ${read(name) === "Нет" ? "selected" : ""}>Нет</option></select></label>`;
    return `<label>${label}<input data-bind="${name}" value="${read(name)}"/></label>`;
  }

  function render() {
    if (!active()) return;
    injectStyle();
    const p = panel();
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("section");
      root.id = ROOT_ID;
      p.prepend(root);
    }
    hideLegacy(p);

    const m = mode();
    const key = variantFromForm(m);
    const list = listFor(m);
    const fields = fieldList(m, key);
    const note = m === "empty"
      ? "Лист замера пустого проёма: замерщик фиксирует габариты проёма, высоту, толщину перекрытия и желаемую ширину будущего марша."
      : "Лист замера готового основания: размеры маршей, площадки или забежной зоны заносятся прямо у соответствующей части схемы.";

    root.innerHTML = `<div class="sz-sheet"><div class="sz-toolbar"><div class="sz-mode"><button type="button" data-mode="empty" class="${m === "empty" ? "active" : ""}">Пустой проём</button><button type="button" data-mode="ready" class="${m === "ready" ? "active" : ""}">Готовое основание</button></div><div class="sz-select"><label>${m === "empty" ? "Форма проёма" : "Вариант лестницы"}</label><select data-variant>${list.map((v) => `<option value="${v.key}" ${v.key === key ? "selected" : ""}>${v.label}</option>`).join("")}</select></div></div><div class="sz-board">${scheme(key)}${fields.map(dim).join("")}</div><div class="sz-comment"><label>Комментарий</label><textarea data-bind="obstacles_comment" placeholder="Ограничения, трубы, окна, где нельзя крепиться...">${read("obstacles_comment")}</textarea></div><div class="sz-footer"><div class="sz-note">${note}</div><details class="sz-conditions"><summary>Условия объекта</summary><div class="sz-cond-grid">${CONDITIONS.map(cond).join("")}</div></details></div></div>`;

    root.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => {
      setVariant(button.dataset.mode, listFor(button.dataset.mode)[0].key);
      render();
    }));
    root.querySelector("[data-variant]")?.addEventListener("change", (event) => {
      setVariant(m, event.target.value);
      render();
    });
    root.querySelectorAll("[data-bind]").forEach((input) => input.addEventListener("input", () => write(input.dataset.bind, input.value)));
    root.querySelectorAll("[data-bind-check]").forEach((input) => input.addEventListener("change", () => write(input.dataset.bindCheck, input.checked)));
  }

  function schedule() {
    setTimeout(render, 30);
  }

  document.addEventListener("click", (event) => {
    if (event.target?.matches?.('[data-tab="sizes"], .measurement-item, #new-measurement-btn')) schedule();
  });
  document.addEventListener("change", (event) => {
    if (event.target?.matches?.('[name="site_situation"], [name="opening_type"], [name="turn_type"], [name="stair_direction"]')) schedule();
  });
  document.addEventListener("DOMContentLoaded", schedule);
  window.addEventListener("load", schedule);
})();
