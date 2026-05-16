const SUPABASE_URL = "https://rhnlykqqhwweaywjopvm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobmx5a3FxaHd3ZWF5d2pvcHZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODE0NjksImV4cCI6MjA5MTc1NzQ2OX0.a0K1q7VKDBRW_7A6fbf5jyMOqO0KpRXQdn8XMBeXfwg";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const state = { user: null, profile: null, measurements: [], selected: null, photos: [], photoScopeId: null, hiddenForeignPhotos: 0 };

const optionLists = {
  stepMaterials: ["ясень", "дуб", "бук", "берёза", "сосна", "лиственница", "МДФ", "фанера", "бетон", "металл", "другое"],
  railingMaterials: ["стекло", "металл", "дерево", "нержавейка", "труба", "ковка", "комбинированное", "без ограждения", "другое"],
  bootMaterials: ["МДФ", "дерево", "фанера", "металл", "другое"],
  wallMaterials: ["газоблок", "кирпич", "бетон", "монолит", "каркас", "дерево", "не знаю", "другое"],
  slabMaterials: ["монолит", "плиты", "дерево", "металл", "не знаю", "другое"],
  finishes: ["эмаль", "лак", "масло", "морилка + лак", "шпон", "без отделки", "другое"],
  warmFloor: ["не знаю", "нет", "есть", "возможно"],
};

const optionListIds = {
  stepMaterials: "tekstura-step-materials",
  railingMaterials: "tekstura-railing-materials",
  bootMaterials: "tekstura-boot-materials",
  wallMaterials: "tekstura-wall-materials",
  slabMaterials: "tekstura-slab-materials",
  finishes: "tekstura-finishes",
  warmFloor: "tekstura-warm-floor",
};

window.TeksturaOptionLists = { optionLists, optionListIds };

function ensureDatalists() {
  Object.entries(optionLists).forEach(([key, values]) => {
    const id = optionListIds[key];
    if (!id || document.getElementById(id)) return;
    const list = document.createElement("datalist");
    list.id = id;
    list.innerHTML = values.map((value) => `<option value="${value}"></option>`).join("");
    document.body.appendChild(list);
  });
}

function replaceSelectWithCombobox(name, listId) {
  const form = $("#measurement-form");
  const current = form?.querySelector(`[name="${name}"]`);
  if (!current || current.tagName !== "SELECT") return;
  const input = document.createElement("input");
  input.name = name;
  input.value = current.value || "";
  input.setAttribute("list", listId);
  input.placeholder = current.options?.[0]?.textContent || "";
  current.replaceWith(input);
}

function enhanceCommonInputs() {
  ensureDatalists();
  const form = $("#measurement-form");
  if (!form) return;
  form.querySelector('[name="wall_material"]')?.setAttribute("list", optionListIds.wallMaterials);
  form.querySelector('[name="slab_material"]')?.setAttribute("list", optionListIds.slabMaterials);
  replaceSelectWithCombobox("has_warm_floor", optionListIds.warmFloor);
}

const photoTypeSlug = {
  "Ручной эскиз замера": "manual_sketch",
  "Бумажный лист с размерами": "paper_sizes",
  "Общий вид снизу": "general_bottom",
  "Проём снизу": "opening_bottom",
  "Проём сверху": "opening_top",
  "Место старта": "start_place",
  "Место выхода": "exit_place",
  "Левая сторона": "left_side",
  "Правая сторона": "right_side",
  "Коммуникации": "communications",
  "Ограждения / балюстрада": "railings_balustrade",
  "Ступени / марши": "steps_flights",
  "Дополнительные размеры": "extra_sizes",
  "Другое": "other",
};

function setMessage(el, text, type = "") {
  if (!el) return;
  el.textContent = text || "";
  el.className = `form-message ${type}`.trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeSlug(text) {
  return (photoTypeSlug[text] || String(text || "file"))
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "file";
}

function safeExt(filename) {
  const raw = String(filename || "jpg").split(".").pop().toLowerCase();
  const ext = raw.replace(/[^a-z0-9]/g, "");
  if (["jpg", "jpeg", "png", "webp", "gif", "heic", "jfif"].includes(ext)) return ext;
  return "jpg";
}


function photoPathBelongsToMeasurement(photo, measurement) {
  if (!photo || !measurement?.id) return false;
  if (photo.measurement_id !== measurement.id) return false;
  const path = String(photo.file_path || "");
  if (!path) return true;
  const number = String(measurement.number || "");
  const strictPrefix = `${number}_${measurement.id}/`;
  const legacyPrefix = `${number}/`;
  // Новые фото v5+ хранятся в папке номер+id. Старые фото допускаем только если номер совпадает.
  return path.startsWith(strictPrefix) || path.startsWith(legacyPrefix) || !number;
}

function filterPhotosForMeasurement(photos, measurement) {
  const list = Array.isArray(photos) ? photos : [];
  const filtered = list.filter((photo) => photoPathBelongsToMeasurement(photo, measurement));
  state.hiddenForeignPhotos = list.length - filtered.length;
  return filtered;
}

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function makeNumber() {
  return `KZN-ZM-${new Date().getFullYear()}-${Math.floor(Math.random() * 900000 + 100000)}`;
}

const MEASUREMENT_MODE_DEFAULT = "simple";
const MEASUREMENT_MODE_LABELS = {
  simple: "Простой",
  detailed: "Детальный",
};

function normalizeMeasurementMode(mode) {
  return mode === "detailed" ? "detailed" : "simple";
}

function parseJsonObject(raw) {
  if (!raw || typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function modeFromDrawingProject(raw) {
  return normalizeMeasurementMode(parseJsonObject(raw).measurementMode || MEASUREMENT_MODE_DEFAULT);
}

const dynamicMeasurementFields = [
  "flight1_steps_count",
  "flight2_steps_count",
  "winder_steps_count",
  "platform_count",
  "riser_height_mm",
  "tread_depth_mm",
  "drawing_project_json",
  "drawing_svg",
  "finish_dimensions_json",
];

function ensureDynamicMeasurementFields() {
  const form = $("#measurement-form");
  if (!form) return;
  dynamicMeasurementFields.forEach((name) => {
    if (!form.querySelector(`[name="${name}"]`)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      form.appendChild(input);
    }
  });
}

function getCurrentMeasurementMode() {
  const form = $("#measurement-form");
  const raw = form?.drawing_project_json?.value || state.selected?.drawing_project_json || "";
  return modeFromDrawingProject(raw);
}

function activateTab(tabName) {
  const tab = $(`.tab[data-tab="${tabName}"]`);
  if (!tab || tab.classList.contains("hidden")) return;
  $$(".tab").forEach((item) => item.classList.remove("active"));
  tab.classList.add("active");
  $$(".tab-panel").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.panel !== tabName));
  if (tabName === "check") renderChecks();
}

function applyMeasurementModeUI(mode = getCurrentMeasurementMode()) {
  const normalized = normalizeMeasurementMode(mode);
  const form = $("#measurement-form");
  if (!form) return;
  form.dataset.measurementMode = normalized;
  document.body.dataset.measurementMode = normalized;

  $$("[data-measurement-mode]").forEach((button) => {
    const active = button.dataset.measurementMode === normalized;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });

  const title = $("#measurement-mode-current");
  if (title) title.textContent = MEASUREMENT_MODE_LABELS[normalized];
  const note = $("#measurement-mode-note");
  if (note) {
    note.textContent = normalized === "simple"
      ? "Детальные данные сохранены, но скрыты в простом режиме."
      : "В детальном режиме доступны стены, окна, чистовые размеры, сапожки и полный редактор.";
  }

  const hideInSimple = normalized === "simple";
  ["details", "archive"].forEach((tabName) => {
    $(`.tab[data-tab="${tabName}"]`)?.classList.toggle("hidden", hideInSimple);
    if (hideInSimple) $(`.tab-panel[data-panel="${tabName}"]`)?.classList.add("hidden");
  });
  if (hideInSimple && $(".tab.active")?.classList.contains("hidden")) activateTab("general");
}

function setMeasurementMode(mode, options = {}) {
  const normalized = normalizeMeasurementMode(mode);
  ensureDynamicMeasurementFields();
  const form = $("#measurement-form");
  const input = form?.drawing_project_json;
  const project = parseJsonObject(input?.value || state.selected?.drawing_project_json || "");
  project.schemaVersion = project.schemaVersion || 2;
  project.measurementMode = normalized;
  const raw = JSON.stringify(project);
  if (input) input.value = raw;
  if (state.selected) {
    state.selected.drawing_project_json = raw;
    const item = state.measurements.find((m) => m.id && m.id === state.selected.id);
    if (item) item.drawing_project_json = raw;
  }
  applyMeasurementModeUI(normalized);
  if (options.renderList !== false) renderList();
  if (options.notify !== false) {
    document.dispatchEvent(new CustomEvent("tekstura:measurement-mode-changed", { detail: { mode: normalized } }));
  }
  return normalized;
}

function ensureMeasurementModeInProject() {
  return setMeasurementMode(getCurrentMeasurementMode(), { notify: false, renderList: false });
}

window.TeksturaApplyMeasurementMode = () => applyMeasurementModeUI();


function currentRole() {
  return String(state.profile?.role || "zamer").trim().toLowerCase();
}

function roleMatches(...needles) {
  const role = currentRole();
  return needles.some((needle) => role.includes(String(needle).toLowerCase()));
}

function canAcceptMeasurements() {
  return roleMatches("admin", "manager", "check", "review", "провер", "ruk", "рук");
}

function canArchiveMeasurements() {
  return roleMatches("admin", "manager", "ruk", "рук");
}

function canDeleteMeasurements() {
  return roleMatches("admin");
}

function canUseTechnicalExports() {
  return roleMatches("admin", "manager", "constructor", "конструкт");
}

function canEditMeasurements() {
  return roleMatches("admin", "manager", "check", "review", "провер", "zamer", "замер", "zamerschik");
}

function productionUrl(measurement = state.selected) {
  return `./production.html${measurement?.id ? `?id=${encodeURIComponent(measurement.id)}` : ""}`;
}

function showWorkspacePanel(panel = "empty") {
  const empty = $("#empty-detail");
  const preview = $("#measurement-preview");
  const form = $("#measurement-form");
  empty?.classList.toggle("hidden", panel !== "empty");
  preview?.classList.toggle("hidden", panel !== "preview");
  form?.classList.toggle("hidden", panel !== "edit");
  document.body.dataset.workspacePanel = panel;
}

function openMeasurementsScreen() {
  $("#measurements-screen")?.classList.remove("hidden");
  $("#measurement-search")?.focus();
  renderList();
}

function closeMeasurementsScreen() {
  $("#measurements-screen")?.classList.add("hidden");
}

function applyRoleUI() {
  const role = currentRole();
  document.body.dataset.userRole = role;
  const acceptBtn = $("#accept-btn");
  const archiveBtn = $("#archive-btn");
  const deleteBtn = $("#soft-delete-btn");
  const jsonBtn = $("#download-json-btn");
  const csvBtn = $("#download-csv-btn");
  const technicalActions = $("#technical-actions");
  const productionLink = $("#production-link");
  const canUseTechnicalActions = canUseTechnicalExports() || canArchiveMeasurements() || canDeleteMeasurements();
  acceptBtn?.classList.toggle("hidden", !canAcceptMeasurements());
  archiveBtn?.classList.toggle("hidden", !canArchiveMeasurements());
  deleteBtn?.classList.toggle("hidden", !canDeleteMeasurements());
  jsonBtn?.classList.toggle("hidden", !canUseTechnicalExports());
  csvBtn?.classList.toggle("hidden", !canUseTechnicalExports());
  technicalActions?.classList.toggle("hidden", !canUseTechnicalActions);
  if (productionLink) productionLink.href = productionUrl();
  const form = $("#measurement-form");
  if (form) form.dataset.role = role;
}

function showApp(isAuthed) {
  $("#auth-view").classList.toggle("hidden", isAuthed);
  $("#main-view").classList.toggle("hidden", !isAuthed);
  $("#logout-btn").classList.toggle("hidden", !isAuthed);
  $("#user-role").textContent = isAuthed ? `${state.profile?.full_name || state.user?.email} · ${state.profile?.role || "user"}` : "Не вошли";
  applyRoleUI();
}

async function loadProfile() {
  const { data } = await supabaseClient.from("profiles").select("*").eq("id", state.user.id).maybeSingle();
  state.profile = data || { id: state.user.id, full_name: state.user.email?.split("@")[0] || "Пользователь", role: "zamer" };
}

async function init() {
  const { data } = await supabaseClient.auth.getSession();
  state.user = data.session?.user || null;
  if (!state.user) return showApp(false);
  await loadProfile();
  showApp(true);
  await loadMeasurements();
}

async function login() {
  setMessage($("#auth-message"), "Вход...");
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email: $("#email").value.trim(), password: $("#password").value });
  if (error) return setMessage($("#auth-message"), error.message, "error");
  state.user = data.user;
  await loadProfile();
  showApp(true);
  await loadMeasurements();
  setMessage($("#auth-message"), "");
}

async function signup() {
  setMessage($("#auth-message"), "Создаю пользователя...");
  const { data, error } = await supabaseClient.auth.signUp({ email: $("#email").value.trim(), password: $("#password").value });
  if (error) return setMessage($("#auth-message"), error.message, "error");
  setMessage($("#auth-message"), "Пользователь создан. Теперь нажмите Войти.", "ok");
  if (data.user) state.user = data.user;
}

async function logout() {
  await supabaseClient.auth.signOut();
  state.user = null;
  state.profile = null;
  state.measurements = [];
  state.selected = null;
  state.photos = [];
  state.photoScopeId = null;
  state.hiddenForeignPhotos = 0;
  showApp(false);
}

function getFormData() {
  const form = $("#measurement-form");
  ensureDynamicMeasurementFields();
  ensureMeasurementModeInProject();
  const fd = new FormData(form);
  return {
    client: {
      name: String(fd.get("client_name") || "").trim() || "Без имени",
      phone: String(fd.get("client_phone") || "").trim(),
      address: String(fd.get("address") || "").trim(),
      city: "Казань",
      created_by: state.user?.id,
    },
    measurement: {
      status: fd.get("status") || "Черновик",
      object_type: "Частный дом",
      object_stage: fd.get("object_stage") || "Черновая",
      site_situation: fd.get("site_situation") || "Пустой проём",
      opening_type: fd.get("opening_type") || "Прямой",
      stair_direction: fd.get("stair_direction") || null,
      turn_type: fd.get("turn_type") || null,
      height_clean_to_clean_mm: toNumber(fd.get("height_clean_to_clean_mm")),
      slab_thickness_mm: toNumber(fd.get("slab_thickness_mm")),
      ceiling_height_1_mm: toNumber(fd.get("ceiling_height_1_mm")),
      desired_flight_width_mm: toNumber(fd.get("desired_flight_width_mm")),
      opening_length_mm: toNumber(fd.get("opening_length_mm")),
      opening_width_mm: toNumber(fd.get("opening_width_mm")),
      flight1_length_mm: toNumber(fd.get("flight1_length_mm")),
      flight1_width_mm: toNumber(fd.get("flight1_width_mm")),
      flight1_steps_count: toNumber(fd.get("flight1_steps_count")),
      flight2_length_mm: toNumber(fd.get("flight2_length_mm")),
      flight2_width_mm: toNumber(fd.get("flight2_width_mm")),
      flight2_steps_count: toNumber(fd.get("flight2_steps_count")),
      corner_zone_length_mm: toNumber(fd.get("corner_zone_length_mm")),
      corner_zone_width_mm: toNumber(fd.get("corner_zone_width_mm")),
      winder_steps_count: toNumber(fd.get("winder_steps_count")),
      riser_height_mm: toNumber(fd.get("riser_height_mm")),
      tread_depth_mm: toNumber(fd.get("tread_depth_mm")),
      wall_material: fd.get("wall_material") || null,
      slab_material: fd.get("slab_material") || null,
      has_warm_floor: fd.get("has_warm_floor") || "Не знаю",
      has_pipes: fd.get("has_pipes") === "on",
      has_electricity: fd.get("has_electricity") === "on",
      has_ventilation: fd.get("has_ventilation") === "on",
      obstacles_comment: fd.get("obstacles_comment") || null,
      general_comment: fd.get("general_comment") || null,
      drawing_project_json: fd.get("drawing_project_json") || null,
      drawing_svg: fd.get("drawing_svg") || null,
      finish_dimensions_json: fd.get("finish_dimensions_json") || null,
      updated_at: new Date().toISOString(),
    },
  };
}

async function loadMeasurements() {
  const { data, error } = await supabaseClient.from("measurements").select("*, clients(*)").order("created_at", { ascending: false });
  if (error) throw error;
  state.measurements = data || [];
  renderStats();
  renderList();
}

function filteredMeasurements() {
  const filter = $("#status-filter")?.value || "active";
  const query = String($("#measurement-search")?.value || "").trim().toLowerCase();
  const byStatus = (measurement) => {
    if (measurement.is_deleted) return false;
    if (filter === "all") return true;
    if (filter === "active") return !measurement.is_archived && measurement.status !== "Архив";
    return measurement.status === filter;
  };
  const byQuery = (measurement) => {
    if (!query) return true;
    const client = measurement.clients || {};
    return [
      measurement.number,
      measurement.status,
      measurement.site_situation,
      measurement.opening_type,
      client.name,
      client.phone,
      client.address,
    ].some((value) => String(value || "").toLowerCase().includes(query));
  };
  return state.measurements.filter((measurement) => byStatus(measurement) && byQuery(measurement));
}

function renderStats() {
  $("#stat-drafts").textContent = state.measurements.filter((m) => m.status === "Черновик").length;
  $("#stat-review").textContent = state.measurements.filter((m) => m.status === "На проверке").length;
  $("#stat-ready").textContent = state.measurements.filter((m) => m.status === "Готовый замер").length;
  $("#stat-archive").textContent = state.measurements.filter((m) => m.status === "Архив" || m.is_archived).length;
}

function renderList() {
  const list = $("#measurements-list");
  const items = filteredMeasurements();
  if (!items.length) return list.innerHTML = `<p class="muted-text">Замеры по текущему поиску не найдены.</p>`;
  list.innerHTML = items.map((m) => {
    const c = m.clients || {};
    const active = state.selected?.id === m.id ? "active" : "";
    const modeLabel = MEASUREMENT_MODE_LABELS[modeFromDrawingProject(m.drawing_project_json)];
    return `<button class="measurement-item ${active}" data-id="${m.id}"><div class="number">${m.number}</div><div>${c.name || "Клиент не указан"}</div><div class="address">${c.address || "Адрес не указан"}</div><div class="measurement-meta"><span class="small-chip">${m.status}</span><span class="small-chip">${m.site_situation}</span><span class="small-chip">${m.opening_type}</span><span class="small-chip mode-chip">${modeLabel}</span></div></button>`;
  }).join("");
  $$(".measurement-item").forEach((btn) => btn.addEventListener("click", () => selectMeasurement(btn.dataset.id)));
}

function showNewMeasurementModePicker() {
  let overlay = $("#measurement-mode-picker");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "measurement-mode-picker";
    overlay.className = "mode-picker hidden";
    overlay.innerHTML = `
      <div class="mode-picker-card">
        <div class="mode-picker-head">
          <div>
            <div class="eyebrow">Тип замера</div>
            <h2>Выберите режим</h2>
          </div>
          <button type="button" class="btn ghost" data-close-mode-picker>Закрыть</button>
        </div>
        <div class="mode-choice-grid">
          <button type="button" class="mode-choice" data-create-mode="simple">
            <b>Простой замер</b>
            <span>Только основные размеры, схема, фото и комментарий. Для быстрого выезда.</span>
          </button>
          <button type="button" class="mode-choice" data-create-mode="detailed">
            <b>Детальный замер</b>
            <span>Стены, окна, чистовые ступени, сапожки, вылеты, полный редактор и детализация для производства.</span>
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest("[data-close-mode-picker]")) {
        overlay.classList.add("hidden");
        return;
      }
      const mode = event.target.closest("[data-create-mode]")?.dataset.createMode;
      if (!mode) return;
      overlay.classList.add("hidden");
      newMeasurement(mode);
    });
  }
  overlay.classList.remove("hidden");
}

function newMeasurement(mode = MEASUREMENT_MODE_DEFAULT) {
  const normalizedMode = normalizeMeasurementMode(mode);
  state.selected = {
    number: makeNumber(),
    status: "Черновик",
    clients: {},
    site_situation: "Пустой проём",
    opening_type: "Прямой",
    object_stage: "Черновая",
    has_warm_floor: "Не знаю",
    drawing_project_json: JSON.stringify({ schemaVersion: 2, measurementMode: normalizedMode, type: "empty_straight", units: "mm" }),
  };
  state.photos = [];
  state.photoScopeId = null;
  state.hiddenForeignPhotos = 0;
  fillForm(state.selected);
  closeMeasurementsScreen();
  showWorkspacePanel("edit");
  renderPhotos();
  renderChecks();
}

async function selectMeasurement(id, options = {}) {
  state.selected = state.measurements.find((m) => m.id === id);
  if (!state.selected) return;
  state.photos = [];
  state.photoScopeId = state.selected.id;
  state.hiddenForeignPhotos = 0;
  renderPhotos();
  const selectedId = state.selected.id;
  await loadPhotos(selectedId);
  if (state.selected?.id !== selectedId) return;
  renderList();
  if (options.mode === "edit") {
    editSelectedMeasurement();
    return;
  }
  renderPreview();
  showWorkspacePanel("preview");
  closeMeasurementsScreen();
}

function editSelectedMeasurement() {
  if (!state.selected) return;
  fillForm(state.selected);
  renderPhotos();
  renderChecks();
  showWorkspacePanel("edit");
  closeMeasurementsScreen();
}

function fillForm(m) {
  const form = $("#measurement-form");
  ensureDynamicMeasurementFields();
  enhanceCommonInputs();
  form.reset();
  const c = m.clients || {};
  form.client_name.value = c.name || "";
  form.client_phone.value = c.phone || "";
  form.address.value = c.address || "";
  ["status", "object_stage", "site_situation", "opening_type", "stair_direction", "turn_type", "height_clean_to_clean_mm", "slab_thickness_mm", "ceiling_height_1_mm", "desired_flight_width_mm", "opening_length_mm", "opening_width_mm", "flight1_length_mm", "flight1_width_mm", "flight2_length_mm", "flight2_width_mm", "corner_zone_length_mm", "corner_zone_width_mm", "wall_material", "slab_material", "has_warm_floor", "obstacles_comment", "general_comment", ...dynamicMeasurementFields].forEach((name) => { if (form[name]) form[name].value = m[name] !== undefined && m[name] !== null ? m[name] : ""; });
  form.has_pipes.checked = Boolean(m.has_pipes);
  form.has_electricity.checked = Boolean(m.has_electricity);
  form.has_ventilation.checked = Boolean(m.has_ventilation);
  $("#form-title").textContent = m.number || "Новый замер";
  $("#form-status").textContent = m.status || "Черновик";
  setMeasurementMode(modeFromDrawingProject(form.drawing_project_json?.value || m.drawing_project_json), { notify: false, renderList: false });
  window.TeksturaZamerState = state;
  document.dispatchEvent(new CustomEvent("tekstura:measurement-loaded", { detail: { measurement: m } }));
  applyRoleUI();
}

function getRequiredClientErrors(options = {}) {
  const form = $("#measurement-form");
  const errors = [];
  const allowAutoName = Boolean(options.allowAutoName);
  const clientInput = form?.client_name;
  const name = String(clientInput?.value || "").trim();
  if (!name && allowAutoName && clientInput) {
    clientInput.value = "Без имени";
  } else if (!name) {
    errors.push("клиент");
  }
  if (!String(form?.client_phone?.value || "").trim()) errors.push("телефон");
  if (!String(form?.address?.value || "").trim()) errors.push("адрес");
  return errors;
}

function requireClientBeforeWorkflow(actionLabel = "отправкой на проверку") {
  const errors = getRequiredClientErrors({ allowAutoName: actionLabel === "принятием замера" });
  if (!errors.length) return true;
  setMessage($("#form-message"), `Заполните ${errors.join(", ")} перед ${actionLabel}.`, "error");
  activateTab("general");
  return false;
}

function positiveFieldValue(name) {
  const form = $("#measurement-form");
  const n = Number(form?.[name]?.value || 0);
  return Number.isFinite(n) && n > 0;
}

function positiveProjectValue(project, key, fallbackName = "") {
  const p = project?.params || {};
  const direct = Number(p[key] ?? 0);
  if (Number.isFinite(direct) && direct > 0) return true;
  return fallbackName ? positiveFieldValue(fallbackName) : false;
}

function projectMeasurementMode(project) {
  return normalizeMeasurementMode(project?.measurementMode || getCurrentMeasurementMode());
}

function getRequiredMeasurementErrors() {
  ensureDynamicMeasurementFields();
  const form = $("#measurement-form");
  const rawProject = form?.drawing_project_json?.value || state.selected?.drawing_project_json || "";
  const project = parseJsonObject(rawProject);
  const type = String(project.type || "");
  const measurementMode = projectMeasurementMode(project);
  const mode = type.startsWith("empty") || !type ? "empty" : "ready";
  const isStraight = type ? type.includes("straight") : String(form?.opening_type?.value || "").includes("Прям");
  const isWinder = type.includes("winder");
  const isDetailed = measurementMode === "detailed";
  const isReady = mode === "ready";
  const errors = [];
  const needProject = (label, key, field) => {
    if (!positiveProjectValue(project, key, field)) errors.push(label);
  };

  if (!type) errors.push("схема");
  if (!String(form?.drawing_svg?.value || state.selected?.drawing_svg || "").trim()) errors.push("сохранённая схема/SVG");
  // H — высота чистый-чистый — справочное поле: не блокирует простой режим.
  if (mode === "empty" && isStraight) {
    needProject("L", "L", "opening_length_mm");
    needProject("W", "W", "opening_width_mm");
    needProject("H", "H", "height_clean_to_clean_mm");
    needProject("T", "T", "slab_thickness_mm");
  } else if (mode === "empty") {
    needProject("M1", "M1", "flight1_length_mm");
    needProject("B1", "B1", "flight1_width_mm");
    needProject("M2", "M2", "flight2_length_mm");
    needProject("B2", "B2", "flight2_width_mm");
    needProject("ZL", "ZL", "corner_zone_length_mm");
    needProject("ZW", "ZW", "corner_zone_width_mm");
    needProject("H", "H", "height_clean_to_clean_mm");
    needProject("T", "T", "slab_thickness_mm");
  } else {
    needProject("M1", "M1", "flight1_length_mm");
    needProject("B1", "B1", "flight1_width_mm");
    if (isReady) needProject("N1", "N1", "flight1_steps_count");
    if (isDetailed) {
      if (!(positiveProjectValue(project, "b", "tread_depth_mm") || positiveProjectValue(project, "b1", "tread_depth_flight1_mm"))) errors.push("b/b1");
      needProject("h", "h", "riser_height_mm");
    }
    if (!isStraight) {
      needProject("M2", "M2", "flight2_length_mm");
      needProject("B2", "B2", "flight2_width_mm");
      if (isReady) {
        needProject("N2", "N2", "flight2_steps_count");
        if (isWinder) needProject("ZN", "ZN", "winder_steps_count");
      }
      if (isDetailed) {
        if (!(positiveProjectValue(project, "b", "tread_depth_mm") || positiveProjectValue(project, "b2", "tread_depth_flight2_mm"))) errors.push("b/b2");
      }
      if (isDetailed || !isWinder) {
        needProject("ZL", "ZL", "corner_zone_length_mm");
        needProject("ZW", "ZW", "corner_zone_width_mm");
      }
    }
  }
  return [...new Set(errors)];
}

function requireWorkflowReady(actionLabel = "принятием замера") {
  const clientErrors = getRequiredClientErrors({ allowAutoName: actionLabel === "принятием замера" });
  const measurementErrors = getRequiredMeasurementErrors();
  const errors = [...clientErrors, ...measurementErrors];
  if (!errors.length) return true;
  const message = actionLabel === "принятием замера"
    ? `Нельзя принять замер. Заполните: ${errors.join(", ")}.`
    : `Нельзя отправить замер. Заполните: ${errors.join(", ")}.`;
  setMessage($("#form-message"), message, "error");
  activateTab(clientErrors.length ? "general" : "sizes");
  return false;
}

async function saveMeasurement(options = {}) {
  setMessage($("#form-message"), "Сохраняю...");
  if (options.requireClientFields && !requireClientBeforeWorkflow(options.actionLabel || "отправкой на проверку")) return null;
  const { client, measurement } = getFormData();
  let clientId = state.selected?.client_id;
  if (clientId) {
    const { error } = await supabaseClient.from("clients").update(client).eq("id", clientId);
    if (error) throw error;
  } else {
    const { data, error } = await supabaseClient.from("clients").insert(client).select("*").single();
    if (error) throw error;
    clientId = data.id;
  }
  const payload = { ...measurement, client_id: clientId, created_by: state.selected?.created_by || state.user.id, measurer_id: state.selected?.measurer_id || state.user.id };
  if (state.selected?.id) {
    const { data, error } = await supabaseClient.from("measurements").update(payload).eq("id", state.selected.id).select("*, clients(*)").single();
    if (error) throw error;
    state.selected = data;
  } else {
    const { data, error } = await supabaseClient.from("measurements").insert({ ...payload, number: state.selected.number }).select("*, clients(*)").single();
    if (error) throw error;
    state.selected = data;
  }
  await loadMeasurements();
  await selectMeasurement(state.selected.id, { mode: "edit" });
  setMessage($("#form-message"), "Сохранено.", "ok");
  return state.selected;
}

async function setStatus(status, extra = {}, options = {}) {
  if (options.requireClientFields && !requireClientBeforeWorkflow(options.actionLabel || "изменением статуса")) return;
  if (!state.selected?.id) await saveMeasurement({ requireClientFields: Boolean(options.requireClientFields), actionLabel: options.actionLabel });
  if (!state.selected?.id) return;
  const { data, error } = await supabaseClient.from("measurements").update({ status, updated_at: new Date().toISOString(), ...extra }).eq("id", state.selected.id).select("*, clients(*)").single();
  if (error) throw error;
  state.selected = data;
  await loadMeasurements();
  await selectMeasurement(data.id, { mode: "edit" });
}

async function loadPhotos(measurementId) {
  if (!measurementId) {
    state.photos = [];
    state.photoScopeId = null;
    state.hiddenForeignPhotos = 0;
    return;
  }
  const { data, error } = await supabaseClient
    .from("measurement_photos")
    .select("*")
    .eq("measurement_id", measurementId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (state.selected?.id !== measurementId) return;
  state.photoScopeId = measurementId;
  state.photos = filterPhotosForMeasurement(data || [], state.selected);
}

function previewValue(value, fallback = "—") {
  const text = String(value ?? "").trim();
  return text ? escapeHtml(text) : fallback;
}

function previewRow(label, value) {
  return `<div class="preview-row"><span>${escapeHtml(label)}</span><b>${previewValue(value)}</b></div>`;
}

function photoPublicUrl(photo) {
  const path = String(photo?.file_path || "").trim();
  if (!path) return "";
  try {
    return supabaseClient.storage.from("measurement-photos").getPublicUrl(path).data?.publicUrl || "";
  } catch (error) {
    console.warn("Не удалось получить public URL фото", error);
    return "";
  }
}

function previewPhotoMarkup() {
  const photos = selectedPhotos();
  if (!photos.length) return `<p class="muted-text">Фото ещё не добавлены.</p>`;
  return `<div class="preview-photos">${photos.map((photo) => {
    const type = photo.photo_type || "Фото";
    const publicUrl = photoPublicUrl(photo);
    const media = publicUrl
      ? `<img src="${escapeHtml(publicUrl)}" alt="${escapeHtml(type)}" loading="lazy" />`
      : `<div class="preview-photo-thumb">Фото</div>`;
    return `
    <div class="preview-photo-card">
      <div class="preview-photo-media">${media}</div>
      <b>${previewValue(type, "Фото")}</b>
      <span>${previewValue(photo.file_path, "")}</span>
    </div>`;
  }).join("")}</div>`;
}

function previewClarificationMarkup(m) {
  const notes = [];
  if (m.status === "Нужны уточнения") notes.push("Статус замера требует уточнения.");
  if (!m.drawing_svg) notes.push("Нет сохранённой схемы/SVG.");
  if (!selectedPhotos().length) notes.push("Фото не добавлены.");
  return notes.length
    ? `<ul>${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`
    : `<p class="muted-text">Критичных уточнений в карточке не отмечено.</p>`;
}

function renderPreview() {
  const box = $("#measurement-preview");
  const m = state.selected;
  if (!box || !m) return;
  const c = m.clients || {};
  const project = parseJsonObject(m.drawing_project_json);
  const productionHref = productionUrl(m);
  const canEdit = canEditMeasurements();
  box.innerHTML = `
    <div class="preview-head">
      <div>
        <div class="eyebrow">Чистый просмотр</div>
        <h2>${previewValue(m.number, "Замер")}</h2>
        <span class="badge">${previewValue(m.status || "Черновик")}</span>
      </div>
      <div class="preview-actions">
        <button type="button" class="btn secondary" data-open-measurements>Назад</button>
        ${canEdit ? `<button type="button" class="btn primary" data-edit-measurement>Редактировать</button>` : ""}
        <button type="button" class="btn ghost" data-print-preview>Печать</button>
        <a class="btn secondary" href="${productionHref}" target="_blank" rel="noopener">Для изготовителя</a>
      </div>
    </div>

    <div class="preview-grid">
      <section class="preview-section">
        <h3>Клиент и объект</h3>
        ${previewRow("Клиент", c.name)}
        ${previewRow("Телефон", c.phone)}
        ${previewRow("Адрес", c.address)}
        ${previewRow("Тип объекта", m.object_type || "Частный дом")}
        ${previewRow("Что есть", m.site_situation)}
        ${previewRow("Тип проёма", m.opening_type)}
        ${previewRow("Направление", m.stair_direction)}
        ${previewRow("Поворот", m.turn_type)}
      </section>

      <section class="preview-section">
        <h3>Размеры и схема</h3>
        ${previewRow("Высота чистый-чистый", m.height_clean_to_clean_mm ? `${m.height_clean_to_clean_mm} мм` : "")}
        ${previewRow("Толщина перекрытия", m.slab_thickness_mm ? `${m.slab_thickness_mm} мм` : "")}
        ${previewRow("Проём L × W", [m.opening_length_mm, m.opening_width_mm].filter(Boolean).join(" × "))}
        ${previewRow("1 марш M1 × B1", [m.flight1_length_mm, m.flight1_width_mm].filter(Boolean).join(" × "))}
        ${previewRow("2 марш M2 × B2", [m.flight2_length_mm, m.flight2_width_mm].filter(Boolean).join(" × "))}
        ${previewRow("Зона поворота", [m.corner_zone_length_mm, m.corner_zone_width_mm].filter(Boolean).join(" × "))}
        ${previewRow("N1 / N2 / ZN", [m.flight1_steps_count, m.flight2_steps_count, m.winder_steps_count].filter(Boolean).join(" / "))}
        <div class="preview-scheme">${m.drawing_svg || `<span class="muted-text">Схема не сохранена.</span>`}</div>
        ${project.type ? `<p class="muted-text small">Тип схемы: ${escapeHtml(project.type)}</p>` : ""}
      </section>

      <section class="preview-section">
        <h3>Условия объекта</h3>
        ${previewRow("Материал стен", m.wall_material)}
        ${previewRow("Материал перекрытия", m.slab_material)}
        ${previewRow("Тёплый пол", m.has_warm_floor)}
        ${previewRow("Трубы", m.has_pipes ? "есть" : "нет")}
        ${previewRow("Электрика", m.has_electricity ? "есть" : "нет")}
        ${previewRow("Вентиляция", m.has_ventilation ? "есть" : "нет")}
        ${previewRow("Препятствия", m.obstacles_comment)}
      </section>

      <section class="preview-section">
        <h3>Комментарии</h3>
        <p>${previewValue(m.general_comment, "Комментарий не заполнен.")}</p>
        <h3>Требует уточнения</h3>
        ${previewClarificationMarkup(m)}
      </section>
    </div>

    <section class="preview-section preview-section-wide">
      <h3>Фото</h3>
      ${previewPhotoMarkup()}
    </section>`;
}

function selectedPhotos() {
  if (!state.selected?.id || state.photoScopeId !== state.selected.id) return [];
  return filterPhotosForMeasurement(state.photos, state.selected);
}

function renderPhotos() {
  const box = $("#photos-list");
  if (!box) return;
  if (!state.selected) {
    box.innerHTML = "";
    return;
  }
  const photos = selectedPhotos();
  const title = escapeHtml(state.selected.number || "новый замер");
  const hiddenNote = state.hiddenForeignPhotos > 0 ? ` <span class="photo-warning">Скрыто чужих/старых записей: ${state.hiddenForeignPhotos}.</span>` : "";
  const note = `<div class="photo-scope-note"><b>Фото этого замера:</b> ${title}. Фото из других карточек здесь не показываются.${hiddenNote}</div>`;
  if (!state.selected.id) {
    box.innerHTML = `${note}<p class="muted-text">Сначала сохраните черновик, потом можно прикреплять фото.</p>`;
    return;
  }
  if (!photos.length) {
    box.innerHTML = `${note}<p class="muted-text">Фото ещё не загружены для этого замера.</p>`;
    return;
  }
  box.innerHTML = `${note}${photos.map((p) => `
    <div class="photo-card" data-photo-id="${escapeHtml(p.id)}" data-measurement-id="${escapeHtml(p.measurement_id)}">
      <div style="aspect-ratio:4/3;display:grid;place-items:center;background:#e5e7eb;">Фото</div>
      <div class="photo-card-body">
        <b>${escapeHtml(p.photo_type || "Фото")}</b>
        <span class="photo-path">${escapeHtml(p.file_path || "")}</span>
        <button type="button" class="btn danger photo-delete-btn" data-delete-photo-id="${escapeHtml(p.id)}">Убрать фото из этого замера</button>
      </div>
    </div>`).join("")}`;
}

async function uploadPhoto() {
  if (!state.selected?.id) {
    const saved = await saveMeasurement();
    if (!saved) return;
  }
  const selectedId = state.selected?.id;
  const file = $("#photo-file").files[0];
  if (!file) return setMessage($("#form-message"), "Выберите фото.", "error");
  setMessage($("#form-message"), "Загружаю фото...");
  const photoType = $("#photo-type").value;
  const ext = safeExt(file.name);
  const path = `${state.selected.number || "measurement"}_${selectedId}/${Date.now()}_${safeSlug(photoType)}.${ext}`;
  const { error: uploadError } = await supabaseClient.storage.from("measurement-photos").upload(path, file, { upsert: false });
  if (uploadError) throw uploadError;
  const { error } = await supabaseClient.from("measurement_photos").insert({ measurement_id: selectedId, photo_type: photoType, file_path: path, is_required: true, added_by: state.user.id });
  if (error) throw error;
  $("#photo-file").value = "";
  await loadPhotos(selectedId);
  renderPhotos();
  renderChecks();
  setMessage($("#form-message"), "Фото загружено только в текущий замер.", "ok");
}

async function deletePhoto(photoId) {
  if (!state.selected?.id || !photoId) return;
  const photo = selectedPhotos().find((item) => item.id === photoId);
  if (!photo) return setMessage($("#form-message"), "Это фото не относится к открытому замеру.", "error");
  if (!confirm(`Удалить фото «${photo.photo_type || "Фото"}» из этого замера?`)) return;
  setMessage($("#form-message"), "Удаляю фото...");
  if (photo.file_path) {
    const { error: storageError } = await supabaseClient.storage.from("measurement-photos").remove([photo.file_path]);
    if (storageError) console.warn("Не удалось удалить файл из storage", storageError);
  }
  const { error } = await supabaseClient.from("measurement_photos").delete().eq("id", photoId).eq("measurement_id", state.selected.id);
  if (error) throw error;
  await loadPhotos(state.selected.id);
  renderPhotos();
  renderChecks();
  setMessage($("#form-message"), "Фото удалено из текущего замера.", "ok");
}

function checkItems() {
  const { client, measurement } = getFormData();
  const result = [];
  const add = (type, text) => result.push({ type, text });
  client.name ? add("ok", "Клиент заполнен") : add("error", "Не заполнен клиент");
  client.phone ? add("ok", "Телефон заполнен") : add("error", "Не заполнен телефон");
  client.address ? add("ok", "Адрес заполнен") : add("error", "Не заполнен адрес");

  const required = getRequiredMeasurementErrors();
  required.length
    ? add("error", `Нельзя принять замер. Заполните: ${required.join(", ")}`)
    : add("ok", "Обязательные размеры и сохранённая схема заполнены");

  measurement.height_clean_to_clean_mm
    ? add("ok", "H заполнена как справочный размер")
    : add("warn", "H не заполнена — в простом режиме это не блокирует замер");

  const photos = selectedPhotos();
  photos.length
    ? add("ok", `Фото текущего замера: ${photos.length}`)
    : add("warn", "Фото не добавлены — это пока не блокирует принятие");

  const warmFloorValue = String(measurement.has_warm_floor || "").trim().toLowerCase();
  if (["да", "есть"].includes(warmFloorValue) && !measurement.obstacles_comment) add("warn", "Есть тёплый пол — добавьте комментарий");
  return result;
}

function renderChecks() {
  const items = checkItems();
  $("#check-list").innerHTML = items.map((i) => `<div class="check-item ${i.type}"><span class="check-icon">${i.type === "ok" ? "✓" : i.type === "warn" ? "!" : "×"}</span><span>${i.text}</span></div>`).join("");
  return items;
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

function safeJsonValue(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

function downloadJson() {
  if (!state.selected) return;
  ensureDynamicMeasurementFields();
  const form = $("#measurement-form");
  const drawingProject = form?.drawing_project_json?.value || state.selected.drawing_project_json || null;
  const finishDimensions = form?.finish_dimensions_json?.value || state.selected.finish_dimensions_json || null;
  const drawingSvg = form?.drawing_svg?.value || state.selected.drawing_svg || null;
  downloadText(`${state.selected.number}_data.json`, JSON.stringify({
    measurement: {
      ...state.selected,
      drawing_project_json: safeJsonValue(drawingProject),
      finish_dimensions_json: safeJsonValue(finishDimensions),
      drawing_svg: drawingSvg,
    },
    photos: selectedPhotos(),
  }, null, 2), "application/json");
}
function downloadCsv() { if (state.selected) { const m = state.selected; const c = m.clients || {}; downloadText(`${m.number}_data.csv`, `Номер;Статус;Клиент;Телефон;Адрес\n${m.number};${m.status};${c.name || ""};${c.phone || ""};${c.address || ""}`, "text/csv;charset=utf-8"); } }

function bind() {
  enhanceCommonInputs();
  $("#login-btn").addEventListener("click", () => login().catch((e) => setMessage($("#auth-message"), e.message, "error")));
  $("#signup-btn").addEventListener("click", () => signup().catch((e) => setMessage($("#auth-message"), e.message, "error")));
  $("#logout-btn").addEventListener("click", logout);
  $("#new-measurement-btn").addEventListener("click", showNewMeasurementModePicker);
  $("#open-measurements-btn").addEventListener("click", openMeasurementsScreen);
  $("#close-measurements-btn").addEventListener("click", closeMeasurementsScreen);
  $("#refresh-btn").addEventListener("click", () => loadMeasurements().catch((e) => alert(e.message)));
  $("#status-filter").addEventListener("change", renderList);
  $("#measurement-search").addEventListener("input", renderList);
  $("#measurement-preview").addEventListener("click", (event) => {
    if (event.target.closest("[data-open-measurements]")) openMeasurementsScreen();
    if (event.target.closest("[data-edit-measurement]")) editSelectedMeasurement();
    if (event.target.closest("[data-print-preview]")) window.print();
  });
  $("#measurement-form").addEventListener("submit", (event) => { event.preventDefault(); saveMeasurement().catch((e) => setMessage($("#form-message"), e.message, "error")); });
  $("#upload-photo-btn").addEventListener("click", () => uploadPhoto().catch((e) => setMessage($("#form-message"), e.message, "error")));
  $("#photos-list").addEventListener("click", (event) => {
    const id = event.target.closest("[data-delete-photo-id]")?.dataset.deletePhotoId;
    if (id) deletePhoto(id).catch((e) => setMessage($("#form-message"), e.message, "error"));
  });
  $("#send-review-btn").addEventListener("click", async () => {
    try {
      const saved = await saveMeasurement({ requireClientFields: true, actionLabel: "отправкой на проверку" });
      if (!saved) return;
      if (!requireWorkflowReady("отправкой на проверку")) return;
      await setStatus("На проверке", {}, { requireClientFields: true, actionLabel: "отправкой на проверку" });
      setMessage($("#form-message"), "Замер отправлен на проверку.", "ok");
    } catch (e) {
      setMessage($("#form-message"), e.message, "error");
    }
  });
  $("#accept-btn").addEventListener("click", async () => {
    try {
      if (!canAcceptMeasurements()) { setMessage($("#form-message"), "У вашей роли нет права принимать замер. Отправьте его на проверку.", "error"); return; }
      const saved = await saveMeasurement({ requireClientFields: true, actionLabel: "принятием замера" });
      if (!saved) return;
      if (!requireWorkflowReady("принятием замера")) return;
      await setStatus("Готовый замер", { checked_by: state.user.id, checked_at: new Date().toISOString() });
      setMessage($("#form-message"), "Замер принят и сохранён.", "ok");
    } catch (e) {
      setMessage($("#form-message"), e.message, "error");
    }
  });
  $("#archive-btn").addEventListener("click", () => {
    if (!canArchiveMeasurements()) { setMessage($("#form-message"), "Архивирование доступно только администратору/руководителю.", "error"); return; }
    if (!confirm("Перенести этот замер в архив?")) return;
    setStatus("Архив", { is_archived: true, archived_at: new Date().toISOString(), archived_by: state.user.id }).catch((e) => alert(e.message));
  });
  $("#soft-delete-btn").addEventListener("click", () => {
    if (!canDeleteMeasurements()) { setMessage($("#form-message"), "Удаление доступно только администратору.", "error"); return; }
    if (!confirm("Пометить этот замер как удалённый?")) return;
    setStatus("Удалён", { is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: state.user.id }).catch((e) => alert(e.message));
  });
  $("#download-json-btn").addEventListener("click", downloadJson);
  $("#download-csv-btn").addEventListener("click", downloadCsv);
  $("#measurement-form").addEventListener("input", renderChecks);
  $$("[data-measurement-mode]").forEach((button) => {
    button.addEventListener("click", () => setMeasurementMode(button.dataset.measurementMode));
  });
  $$(".tab").forEach((tab) => tab.addEventListener("click", () => activateTab(tab.dataset.tab)));
}

bind();
init().catch((e) => { console.error(e); setMessage($("#auth-message"), e.message, "error"); });
