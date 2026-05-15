const SUPABASE_URL = "https://rhnlykqqhwweaywjopvm.supabase.co";
const PRODUCTION_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobmx5a3FxaHd3ZWF5d2pvcHZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODE0NjksImV4cCI6MjA5MTc1NzQ2OX0.a0K1q7VKDBRW_7A6fbf5jyMOqO0KpRXQdn8XMBeXfwg";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, PRODUCTION_SUPABASE_ANON_KEY);
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = { user: null, profile: null, measurements: [], selected: null, photos: [] };

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

function showApp(isAuthed) {
  $("#production-auth").classList.toggle("hidden", isAuthed);
  $("#production-app").classList.toggle("hidden", !isAuthed);
  $("#production-logout").classList.toggle("hidden", !isAuthed);
  $("#production-user").textContent = isAuthed ? (state.user?.email || "Вошли") : "Не вошли";
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

async function signedPhotoUrl(path) {
  if (!path) return "";
  const { data, error } = await supabaseClient.storage.from("measurement-photos").createSignedUrl(path, 60 * 60);
  if (!error && data?.signedUrl) return data.signedUrl;
  const publicData = supabaseClient.storage.from("measurement-photos").getPublicUrl(path);
  return publicData?.data?.publicUrl || "";
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

function collectIssues(measurement, project, finish, svg) {
  const p = project.params || {};
  const treadMode = project.treadMode || {};
  const b1 = treadMode.sameTread === false ? treadMode.b1 : (p.b || p.treadDepth || p.b1 || treadMode.b1 || measurement.tread_depth_mm);
  const b2 = treadMode.sameTread === false ? treadMode.b2 : (p.b || p.treadDepth || p.b2 || treadMode.b2 || measurement.tread_depth_mm);
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
  // H — справочный размер: не попадает в «Требует уточнения», если пустой.
  if (v.mode === "empty" && v.opening === "straight") {
    addIf("L", pickNumber(p.L, measurement.opening_length_mm, measurement.flight1_length_mm));
    addIf("W", pickNumber(p.W, measurement.opening_width_mm, measurement.flight1_width_mm));
  } else if (v.mode === "empty") {
    addIf("M1", pickNumber(p.M1, measurement.flight1_length_mm));
    addIf("B1", pickNumber(p.B1, measurement.flight1_width_mm));
    addIf("M2", pickNumber(p.M2, measurement.flight2_length_mm));
    addIf("B2", pickNumber(p.B2, measurement.flight2_width_mm));
    addIf("ZL", pickNumber(p.ZL, measurement.corner_zone_length_mm));
    addIf("ZW", pickNumber(p.ZW, measurement.corner_zone_width_mm));
  } else {
    addIf("M1", pickNumber(p.M1, measurement.flight1_length_mm));
    addIf("B1", pickNumber(p.B1, measurement.flight1_width_mm));
    if (detailed) {
      addIf("N1", pickNumber(p.N1, measurement.flight1_steps_count));
      addIf("b/b1", b1);
      addIf("h", pickNumber(p.h, measurement.riser_height_mm));
    }
    if (v.opening !== "straight") {
      addIf("M2", pickNumber(p.M2, measurement.flight2_length_mm));
      addIf("B2", pickNumber(p.B2, measurement.flight2_width_mm));
      if (detailed) {
        addIf("N2", pickNumber(p.N2, measurement.flight2_steps_count));
        addIf("b/b2", b2);
        if (v.turn === "winder") addIf("ZN", pickNumber(p.ZN, measurement.winder_steps_count));
      }
      addIf("ZL", pickNumber(p.ZL, measurement.corner_zone_length_mm));
      addIf("ZW", pickNumber(p.ZW, measurement.corner_zone_width_mm));
    }
  }
  if (v.mode === "ready" && detailed && !(finish.steps?.length || finish.landings?.length || finish.boots?.length)) {
    missing.push("чистовые детали не заполнены");
  }
  return [...new Set(missing)];
}

function renderIssues(issues) {
  if (!issues.length) return `<div class="production-ok">Критичных незаполненных данных не найдено.</div>`;
  return `<div class="production-issue"><b>Требует уточнения перед производством:</b><ul>${issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul></div>`;
}

function renderDimensions(measurement, project) {
  const p = project.params || {};
  const treadMode = project.treadMode || {};
  const b1 = treadMode.sameTread === false ? treadMode.b1 : (p.b || p.treadDepth || p.b1 || treadMode.b1 || measurement.tread_depth_mm);
  const b2 = treadMode.sameTread === false ? treadMode.b2 : (p.b || p.treadDepth || p.b2 || treadMode.b2 || measurement.tread_depth_mm);
  const rows = [
    dimKv("Высота H", pickNumber(p.H, measurement.height_clean_to_clean_mm)),
    dimKv("L — длина проёма", pickNumber(p.L, measurement.opening_length_mm)),
    dimKv("W — ширина проёма", pickNumber(p.W, measurement.opening_width_mm)),
    dimKv("Марш 1 M1", pickNumber(p.M1, measurement.flight1_length_mm)),
    dimKv("Марш 1 B1", pickNumber(p.B1, measurement.flight1_width_mm)),
    countKv("Ступени N1", pickNumber(p.N1, measurement.flight1_steps_count)),
    dimKv("Проступь b1", b1),
    dimKv("Марш 2 M2", pickNumber(p.M2, measurement.flight2_length_mm)),
    dimKv("Марш 2 B2", pickNumber(p.B2, measurement.flight2_width_mm)),
    countKv("Ступени N2", pickNumber(p.N2, measurement.flight2_steps_count)),
    dimKv("Проступь b2", b2),
    dimKv("Поворот ZL", pickNumber(p.ZL, measurement.corner_zone_length_mm)),
    dimKv("Поворот ZW", pickNumber(p.ZW, measurement.corner_zone_width_mm)),
    countKv("Забежные ZN", pickNumber(p.ZN, measurement.winder_steps_count)),
  ].filter(Boolean);
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

function renderPhotos() {
  if (!state.photos.length) return `<p class="production-empty-line">Фото для этого замера не загружены.</p>`;
  return `<div class="production-photo-grid">${state.photos.map((p) => `<a class="production-photo" href="${escapeHtml(p.url)}" target="_blank" rel="noopener">
    ${p.url ? `<img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.photo_type || "Фото")}">` : `<div style="aspect-ratio:4/3;display:grid;place-items:center;">Фото</div>`}
    <div><b>${escapeHtml(p.photo_type || "Фото")}</b><br><small>${escapeHtml(p.file_path || "")}</small></div>
  </a>`).join("")}</div>`;
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
  const svg = m.drawing_svg || "";
  const issues = collectIssues(m, project, finish, svg);
  card.innerHTML = `
    <header class="production-card-head">
      <div>
        <h2>${escapeHtml(m.number || "Задание")}</h2>
        <p><b>Клиент:</b> ${escapeHtml(c.name || "Без имени")}</p>
        <p><b>Адрес:</b> ${escapeHtml(c.address || "Адрес не указан")}</p>
        <p><b>Телефон:</b> ${escapeHtml(c.phone || "—")}</p>
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
    ${section("Чистовые детали", renderFinish(finish))}
    ${section("Фото объекта", renderPhotos())}
    ${section("Комментарии", `<div class="production-note">${escapeHtml(m.general_comment || m.obstacles_comment || "Комментариев нет.")}</div>`)}
  `;
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
