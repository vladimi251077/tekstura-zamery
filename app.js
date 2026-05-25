const SUPABASE_URL = "https://rhnlykqqhwweaywjopvm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobmx5a3FxaHd3ZWF5d2pvcHZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODE0NjksImV4cCI6MjA5MTc1NzQ2OX0.a0K1q7VKDBRW_7A6fbf5jyMOqO0KpRXQdn8XMBeXfwg";

const SUPABASE_PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const SUPABASE_AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;
const REMEMBERED_AUTH_KEY = "tekstura-remembered-auth-v1";
const OFFLINE_STARTUP_MESSAGE = "Офлайн. Интернет недоступен. Можно создать локальный TEMP-черновик: данные и размеры сохранятся в этом телефоне.";
const LOCAL_OFFLINE_DRAFT_MESSAGE = "Это локальный офлайн-черновик. Раздел для изготовителя будет доступен после синхронизации в Supabase.";
const PHOTO_OFFLINE_DRAFT_MESSAGE = "Фото сохранены в телефоне. При синхронизации они будут отправлены в Supabase.";
const PHOTO_DRAFT_SAVE_REQUIRED_MESSAGE = "Фото не загружено: сначала сохраните черновик.";
const PHOTO_UPLOAD_OFFLINE_MESSAGE = "Фото нельзя загрузить без интернета. В TEMP-черновике фото сохраняются в телефоне и отправятся при синхронизации.";
const OFFLINE_SYNC_UNAVAILABLE_MESSAGE = "Появится интернет — можно будет синхронизировать.";
const OFFLINE_SYNC_ERROR_MESSAGE = "Не удалось синхронизировать. Черновик сохранён в телефоне, попробуйте ещё раз.";
const OFFLINE_SHELL_CACHE_NAME = "tekstura-offline-shell-v14-app-shell";
const PERMANENT_DELETE_PASSWORD = "del2525";
const supabaseClient = window.supabase?.createClient ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));


function updateNetworkIndicator() {
  const indicator = $("#offline-status");
  if (!indicator) return;
  const isOnline = navigator.onLine;
  indicator.textContent = isOnline ? "Онлайн" : "Офлайн";
  indicator.classList.toggle("offline", !isOnline);
  indicator.title = isOnline ? "Соединение с сетью есть" : OFFLINE_STARTUP_MESSAGE;
  indicator.setAttribute("aria-label", isOnline ? "Приложение онлайн" : OFFLINE_STARTUP_MESSAGE);
}

function rememberNetworkState() {
  window.TeksturaOfflineDB?.set("network", { online: navigator.onLine, checkedAt: new Date().toISOString() })
    .catch((error) => console.warn("Offline metadata was not saved", error));
}

function bindNetworkIndicator() {
  updateNetworkIndicator();
  rememberNetworkState();
  window.addEventListener("online", () => {
    updateNetworkIndicator();
    rememberNetworkState();
    if (state.offlineStartup) setOfflineStartupNotice(true, "Интернет появился. Нажмите «Обновить», чтобы загрузить данные.", true);
    loadOfflineDrafts().catch((error) => console.warn("Offline drafts were not refreshed after reconnect", error));
  });
  window.addEventListener("offline", () => {
    updateNetworkIndicator();
    rememberNetworkState();
    setOfflineStartupNotice(true);
    loadOfflineDrafts().catch((error) => console.warn("Offline drafts were not refreshed after disconnect", error));
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js")
      .catch((error) => console.warn("Service worker was not registered", error));
  });
}

const state = {
  user: null,
  profile: null,
  measurements: [],
  selected: null,
  photos: [],
  photoScopeId: null,
  hiddenForeignPhotos: 0,
  photoUploadPromise: null,
  pendingPhotoFiles: [],
  offlineStartup: false,
  offlineDrafts: [],
  offlineAutosaveTimer: null,
  offlineAutosaveInFlight: null,
  offlineSyncInFlight: new Set(),
  selectedTrashIds: new Set(),
};


function parseStoredSupabaseSession(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    const session = value?.currentSession || value?.session || value;
    if (session?.user) return session;
  } catch (error) {
    console.warn("Stored Supabase session was not parsed", error);
  }
  return null;
}

function readStoredSupabaseSession() {
  const directSession = parseStoredSupabaseSession(localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY));
  if (directSession) return directSession;

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
    const session = parseStoredSupabaseSession(localStorage.getItem(key));
    if (session?.user) return session;
  }
  return null;
}

function isOfflineNetworkError(error) {
  if (!navigator.onLine || !supabaseClient) return true;
  const message = String(error?.message || error?.name || error || "").toLowerCase();
  return ["failed to fetch", "networkerror", "network error", "load failed", "fetcherror", "fetch failed"].some((part) => message.includes(part));
}

function offlineActionMessage() {
  return navigator.onLine
    ? "Не удалось загрузить данные из Supabase. Нажмите «Обновить» после восстановления соединения."
    : OFFLINE_STARTUP_MESSAGE;
}

function userFacingError(error) {
  return isOfflineNetworkError(error) ? offlineActionMessage() : (error?.message || String(error));
}

function updateOfflineDraftBlockTitle() {
  const eyebrow = $("#offline-startup-eyebrow");
  const title = $("#offline-drafts-title-text");
  const isOnline = navigator.onLine;
  if (eyebrow) eyebrow.textContent = isOnline ? "Локальные черновики" : "Офлайн";
  if (title) title.textContent = isOnline ? "Черновики на этом телефоне" : "Офлайн";
}

function setOfflineStartupNotice(visible, message = OFFLINE_STARTUP_MESSAGE, canRefresh = navigator.onLine) {
  const notice = $("#offline-startup");
  if (!notice) return;
  state.offlineStartup = Boolean(visible);
  notice.classList.toggle("hidden", !visible);
  updateOfflineDraftBlockTitle();
  const messageElement = $("#offline-startup-message");
  if (messageElement) messageElement.textContent = message;
  loadOfflineDrafts().catch((error) => console.warn("Offline drafts were not loaded", error));
  const refreshButton = $("#offline-retry-btn");
  if (refreshButton) refreshButton.disabled = !canRefresh;
  const createButton = $("#create-offline-draft-btn");
  if (createButton) createButton.disabled = false;
}

function showOfflineState(message = OFFLINE_STARTUP_MESSAGE) {
  setOfflineStartupNotice(true, message, navigator.onLine);
  setMessage($("#auth-message"), message, "error");
  setMessage($("#form-message"), message, "error");
}

async function buildOfflineHealthcheckReport() {
  const swReg = ("serviceWorker" in navigator) ? await navigator.serviceWorker.getRegistration() : null;
  const swState = swReg?.active ? "active" : swReg?.waiting ? "waiting" : swReg?.installing ? "installing" : "нет";
  let shellCacheReady = false;
  if ("caches" in window) {
    const cache = await caches.open(OFFLINE_SHELL_CACHE_NAME);
    const shellIndex = await cache.match("./index.html");
    shellCacheReady = Boolean(shellIndex);
  }
  const localTempCount = await window.TeksturaOfflineDB?.countOfflineDrafts?.() || 0;
  return [
    `Service Worker: ${swState}`,
    `Cache shell: ${shellCacheReady ? "есть" : "нет"}`,
    `Сеть: ${navigator.onLine ? "online" : "offline"}`,
    `Локальные TEMP-черновики: ${localTempCount}`,
    shellCacheReady ? "Офлайн-режим готов" : "Офлайн-режим ещё не подготовлен",
  ].join(" · ");
}


function isLocalOfflineDraft(measurement = state.selected) {
  return Boolean(measurement?.local_id && !measurement?.server_id && measurement?.sync_status !== "synced");
}

function canEditLocalOfflineDraft(measurement = state.selected) {
  return Boolean(isLocalOfflineDraft(measurement) && measurement?.sync_status !== "syncing");
}

function offlineDraftMessage() {
  return LOCAL_OFFLINE_DRAFT_MESSAGE;
}

function offlineDraftPhotoMessage() {
  return PHOTO_OFFLINE_DRAFT_MESSAGE;
}

function offlineDraftToMeasurement(draft) {
  const formData = draft?.form_data || {};
  const measurement = formData.measurement || {};
  return {
    ...measurement,
    local_id: draft.local_id,
    number: draft.server_number || draft.temp_number,
    status: draft.server_id ? "Синхронизирован" : "Офлайн-черновик",
    sync_status: draft.sync_status || "local_only",
    server_id: draft.server_id || null,
    server_client_id: draft.server_client_id || null,
    server_number: draft.server_number || "",
    last_sync_error: draft.last_sync_error || draft.sync_error || "",
    synced_at: draft.synced_at || "",
    created_at: draft.created_at,
    updated_at: draft.updated_at,
    clients: formData.client || {},
    drawing_project_json: JSON.stringify(draft.drawing_project_json || safeJsonValue(measurement.drawing_project_json) || {}),
    finish_dimensions_json: JSON.stringify(draft.finish_dimensions_json || safeJsonValue(measurement.finish_dimensions_json) || {}),
    drawing_svg: draft.drawing_svg || measurement.drawing_svg || "",
    measurer_name: draft.measurer_name || measurement.measurer_name || "",
    measurer_login: draft.measurer_login || measurement.measurer_login || "",
  };
}

function getOfflineDraftListContainer() {
  return $("#offline-drafts-list");
}

function formatOfflineDraftDate(value) {
  if (!value) return "Дата изменения неизвестна";
  try {
    return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function offlineDraftStatusLines(draft = {}) {
  const status = draft.server_id ? "synced" : (draft.sync_status || "local_only");
  if (status === "syncing") return ["Синхронизация..."];
  if (status === "sync_error") return [`Ошибка синхронизации${draft.last_sync_error || draft.sync_error ? `: ${draft.last_sync_error || draft.sync_error}` : ""}`];
  if (status === "synced") return [
    "Уже отправлен в Supabase",
    `Номер: ${draft.server_number || draft.server_id || "без номера"}`,
  ];
  return ["Не отправлен"];
}

function offlineDraftStatusText(draft = {}) {
  return offlineDraftStatusLines(draft).join(". ");
}

function canShowOfflineDraftSyncButton(draft = {}) {
  const status = draft.sync_status || "local_only";
  return Boolean(
    navigator.onLine
    && supabaseClient
    && state.user
    && !draft.server_id
    && (status === "local_only" || status === "sync_error")
  );
}

function offlineDraftActionNote(draft = {}) {
  const status = draft.server_id ? "synced" : (draft.sync_status || "local_only");
  if (!navigator.onLine) return OFFLINE_SYNC_UNAVAILABLE_MESSAGE;
  if (!supabaseClient) return "Supabase недоступен — синхронизация сейчас невозможна.";
  if (!state.user) return "Войдите в приложение, чтобы синхронизировать черновик.";
  if (status === "syncing") return `Синхронизирую ${draft.temp_number || "TEMP"}...`;
  if (status === "synced") return "";
  return "";
}

function canSyncOfflineDraft(draft = {}) {
  const status = draft.server_id ? "synced" : (draft.sync_status || "local_only");
  return Boolean(!draft.server_id && (status === "local_only" || status === "sync_error"));
}

function syncOfflineDraftNoticeMessage() {
  if (!state.offlineDrafts.length) return OFFLINE_STARTUP_MESSAGE;
  if (!navigator.onLine) return OFFLINE_SYNC_UNAVAILABLE_MESSAGE;
  if (!supabaseClient) return "Supabase недоступен — синхронизация сейчас невозможна.";
  if (!state.user) return "Войдите в приложение, чтобы синхронизировать черновики.";
  return "Есть локальные TEMP-черновики на этом телефоне. Их можно синхронизировать в Supabase.";
}

function refreshOfflineDraftNotice() {
  const notice = $("#offline-startup");
  if (!notice || state.offlineStartup) return;
  const shouldShow = Boolean(state.offlineDrafts.length || state.offlineStartup);
  notice.classList.toggle("hidden", !shouldShow);
  if (!shouldShow) return;
  updateOfflineDraftBlockTitle();
  const messageElement = $("#offline-startup-message");
  if (messageElement) messageElement.textContent = syncOfflineDraftNoticeMessage();
  const refreshButton = $("#offline-retry-btn");
  if (refreshButton) refreshButton.disabled = !navigator.onLine;
  const createButton = $("#create-offline-draft-btn");
  if (createButton) createButton.disabled = false;
}

async function loadOfflineDrafts() {
  const drafts = await (window.TeksturaOfflineDB?.listOfflineDrafts?.() || Promise.resolve([]));
  state.offlineDrafts = await Promise.all(drafts.map(enrichOfflineDraftWithPhotoSummary));
  renderOfflineDrafts();
  refreshOfflineDraftNotice();
  return state.offlineDrafts;
}

function isOfflinePhotoSynced(photo = {}) {
  return Boolean(photo.sync_status === "synced" && photo.server_photo_id && photo.server_file_path);
}

function isOfflinePhotoPendingSync(photo = {}) {
  return !isOfflinePhotoSynced(photo) && (photo.sync_status === "local_only" || photo.sync_status === "sync_error" || photo.sync_status === "syncing");
}

function offlinePhotoSummary(photos = []) {
  const total = photos.length;
  const synced = photos.filter(isOfflinePhotoSynced).length;
  const errors = photos.filter((photo) => photo.sync_status === "sync_error").length;
  const pending = photos.filter(isOfflinePhotoPendingSync).length;
  return { total, synced, errors, pending };
}

async function enrichOfflineDraftWithPhotoSummary(draft = {}) {
  if (!window.TeksturaOfflineDB?.listOfflinePhotosByDraft || !draft.local_id) return { ...draft, photo_summary: offlinePhotoSummary([]) };
  const photos = await window.TeksturaOfflineDB.listOfflinePhotosByDraft(draft.local_id);
  return { ...draft, photo_summary: offlinePhotoSummary(photos) };
}

function offlineDraftPhotoStatusLines(draft = {}) {
  const summary = draft.photo_summary || offlinePhotoSummary([]);
  if (!summary.total) return [];
  const lines = [
    `Фото в телефоне: ${summary.total}`,
    `Фото отправлено: ${summary.synced} из ${summary.total}`,
  ];
  if (summary.errors) lines.push(`Ошибка фото: ${summary.errors}`);
  return lines;
}

function canShowOfflineDraftPhotoSyncButton(draft = {}) {
  const summary = draft.photo_summary || offlinePhotoSummary([]);
  return Boolean(
    navigator.onLine
    && supabaseClient
    && state.user
    && draft.server_id
    && summary.pending > 0
  );
}

function renderOfflineDrafts() {
  const list = getOfflineDraftListContainer();
  const count = $("#offline-drafts-count");
  if (count) count.textContent = String(state.offlineDrafts.length);
  if (!list) return;
  if (!state.offlineDrafts.length) {
    list.innerHTML = '<p class="muted-text small">Локальных черновиков пока нет.</p>';
    return;
  }
  list.innerHTML = state.offlineDrafts.map((draft) => {
    const actionNote = offlineDraftActionNote(draft);
    const isSynced = draft.sync_status === "synced" || Boolean(draft.server_id);
    const syncButton = canShowOfflineDraftSyncButton(draft)
      ? `<button type="button" class="btn primary" data-sync-offline-draft="${escapeHtml(draft.local_id)}">Синхронизировать</button>`
      : "";
    const photoSyncButton = canShowOfflineDraftPhotoSyncButton(draft)
      ? `<button type="button" class="btn primary" data-sync-offline-photos="${escapeHtml(draft.local_id)}">Синхронизировать фото</button>`
      : "";
    const statusHtml = offlineDraftStatusLines(draft)
      .concat(offlineDraftPhotoStatusLines(draft))
      .map((line) => `<small class="offline-draft-sync-status">${escapeHtml(line)}</small>`)
      .join("");
    return `
    <div class="offline-draft-card" data-local-id="${escapeHtml(draft.local_id)}">
      <div>
        <b>${escapeHtml(draft.temp_number || "TEMP")}</b>
        ${isSynced ? "" : "<span>Офлайн-черновик</span>"}
        ${statusHtml}
        ${actionNote ? `<small class="offline-draft-sync-note">${escapeHtml(actionNote)}</small>` : ""}
        <small>Изменён: ${escapeHtml(formatOfflineDraftDate(draft.updated_at))}</small>
      </div>
      <div class="offline-draft-actions">
        ${syncButton}
        ${photoSyncButton}
        <button type="button" class="btn secondary" data-open-offline-draft="${escapeHtml(draft.local_id)}">${isSynced ? "Открыть замер" : "Открыть"}</button>
        <button type="button" class="btn danger" data-delete-offline-draft="${escapeHtml(draft.local_id)}">${isSynced ? "Удалить локальную копию" : "Удалить"}</button>
      </div>
    </div>`;
  }).join("");
}

function nextOfflineTempNumber(drafts = state.offlineDrafts) {
  const next = drafts.reduce((max, draft) => {
    const match = String(draft.temp_number || "").match(/^TEMP-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
  return `TEMP-${String(next).padStart(3, "0")}`;
}

function makeLocalId() {
  if (window.crypto?.randomUUID) return `local_${window.crypto.randomUUID()}`;
  return `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function makeLocalPhotoId() {
  if (window.crypto?.randomUUID) return `photo_local_${window.crypto.randomUUID()}`;
  return `photo_local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function createLocalOfflineDraft() {
  if (!window.TeksturaOfflineDB?.createOfflineDraft) return setMessage($("#form-message"), "IndexedDB недоступен: локальный черновик нельзя создать.", "error");
  await loadOfflineDrafts();
  const identity = currentUserIdentity();
  const now = new Date().toISOString();
  const tempNumber = nextOfflineTempNumber();
  const drawingProject = { schemaVersion: 2, measurementMode: MEASUREMENT_MODE_DEFAULT, type: "empty_straight", units: "mm" };
  const draft = {
    local_id: makeLocalId(),
    temp_number: tempNumber,
    sync_status: "local_only",
    sync_error: "",
    last_sync_error: "",
    created_at: now,
    updated_at: now,
    form_data: {
      client: { name: "", phone: "", address: "", city: "Казань" },
      measurement: {
        status: "Офлайн-черновик",
        object_type: "Частный дом",
        object_stage: "Черновая",
        site_situation: "Пустой проём",
        opening_type: "Прямой",
        has_warm_floor: "Не знаю",
        drawing_project_json: JSON.stringify(drawingProject),
        drawing_svg: "",
        finish_dimensions_json: "{}",
      },
    },
    drawing_project_json: drawingProject,
    finish_dimensions_json: {},
    drawing_svg: "",
    measurer_name: identity.name,
    measurer_login: identity.login,
  };
  await window.TeksturaOfflineDB.createOfflineDraft(draft);
  await loadOfflineDrafts();
  await openOfflineDraft(draft.local_id);
}

async function openOfflineDraft(localId) {
  const draft = await window.TeksturaOfflineDB?.getOfflineDraft?.(localId);
  if (!draft) return setMessage($("#form-message"), "Локальный черновик не найден в этом телефоне.", "error");
  if (draft.server_id && navigator.onLine && supabaseClient) {
    if (!state.measurements.some((measurement) => measurement.id === draft.server_id)) await loadMeasurements();
    if (state.measurements.some((measurement) => measurement.id === draft.server_id)) {
      await selectMeasurement(draft.server_id, { mode: "edit" });
      return setMessage($("#form-message"), `Этот черновик уже синхронизирован: ${draft.server_number || "серверный замер"}`, "ok");
    }
  }
  state.selected = offlineDraftToMeasurement(draft);
  state.photos = await listLocalOfflinePhotos(draft.local_id);
  state.photoScopeId = draft.local_id;
  state.hiddenForeignPhotos = 0;
  fillForm(state.selected);
  closeMeasurementsScreen();
  showWorkspacePanel("edit");
  renderPhotos();
  renderChecks();
  setMessage($("#form-message"), offlineDraftStatusText(draft), draft.sync_status === "sync_error" ? "error" : "ok");
}

async function deleteLocalOfflineDraft(localId) {
  const draft = state.offlineDrafts.find((item) => item.local_id === localId);
  if (!draft) return;
  if (!confirm(`Удалить локальный черновик и все его фото только с этого телефона?`)) return;
  await window.TeksturaOfflineDB?.deleteOfflineDraft?.(localId);
  if (state.selected?.local_id === localId) {
    state.selected = null;
    showWorkspacePanel("empty");
  }
  await loadOfflineDrafts();
}

async function saveLocalOfflineDraftNow(options = {}) {
  if (!canEditLocalOfflineDraft()) return null;
  ensureDynamicMeasurementFields();
  const { client, measurement } = getFormData();
  const current = await window.TeksturaOfflineDB?.getOfflineDraft?.(state.selected.local_id);
  const updatedAt = new Date().toISOString();
  const draft = {
    ...(current || {}),
    local_id: state.selected.local_id,
    temp_number: state.selected.number,
    sync_status: "local_only",
    sync_error: "",
    last_sync_error: "",
    created_at: current?.created_at || state.selected.created_at || updatedAt,
    updated_at: updatedAt,
    form_data: { client, measurement },
    drawing_project_json: safeJsonValue(measurement.drawing_project_json) || {},
    finish_dimensions_json: safeJsonValue(measurement.finish_dimensions_json) || {},
    drawing_svg: measurement.drawing_svg || "",
    measurer_name: state.selected.measurer_name || currentUserIdentity().name,
    measurer_login: state.selected.measurer_login || currentUserIdentity().login,
  };
  await window.TeksturaOfflineDB?.putOfflineDraft?.(draft);
  state.selected = offlineDraftToMeasurement(draft);
  await loadOfflineDrafts();
  if (!options.silent) setMessage($("#form-message"), "Офлайн-черновик сохранён в телефоне", "ok");
  return state.selected;
}


async function updateOfflineDraftSyncFields(localId, fields) {
  const current = await window.TeksturaOfflineDB?.getOfflineDraft?.(localId);
  if (!current) throw new Error("Локальный черновик не найден в этом телефоне.");
  const updated = { ...current, ...fields, updated_at: new Date().toISOString() };
  await window.TeksturaOfflineDB?.putOfflineDraft?.(updated);
  if (state.selected?.local_id === localId) state.selected = offlineDraftToMeasurement(updated);
  await loadOfflineDrafts();
  return updated;
}

async function markOfflineDraftSyncing(localId) {
  return updateOfflineDraftSyncFields(localId, { sync_status: "syncing", sync_error: "", last_sync_error: "" });
}

async function markOfflineDraftSynced(localId, serverMeasurement) {
  return updateOfflineDraftSyncFields(localId, {
    sync_status: "synced",
    server_id: serverMeasurement.id,
    server_number: serverMeasurement.number,
    synced_at: new Date().toISOString(),
    sync_error: "",
    last_sync_error: "",
  });
}

async function markOfflineDraftSyncError(localId, error) {
  const message = error?.message || String(error);
  return updateOfflineDraftSyncFields(localId, {
    sync_status: "sync_error",
    sync_error: message,
    last_sync_error: message,
  });
}

function isRegularMeasurementNumber(number) {
  return /^KZN-ZM-\d{4}-\d{6}$/.test(String(number || "").trim());
}

function measurementNumberForOfflineDraft(draft, measurement = {}) {
  const existingNumber = String(measurement.number || draft?.server_number || "").trim();
  return isRegularMeasurementNumber(existingNumber) ? existingNumber : createMeasurementNumber();
}

function buildMeasurementPayloadFromOfflineDraft(draft, clientId) {
  const formData = draft?.form_data || {};
  const measurement = { ...(formData.measurement || {}) };
  const identity = currentUserIdentity();
  const number = measurementNumberForOfflineDraft(draft, measurement);
  return {
    ...measurement,
    number,
    status: measurement.status === "Офлайн-черновик" ? "Черновик" : (measurement.status || "Черновик"),
    client_id: clientId,
    created_by: measurement.created_by || state.user?.id,
    measurer_id: measurement.measurer_id || state.user?.id,
    measurer_name: draft.measurer_name || measurement.measurer_name || identity.name,
    measurer_login: draft.measurer_login || measurement.measurer_login || identity.login,
    measurer_user_id: measurement.measurer_user_id || identity.userId,
    drawing_project_json: measurement.drawing_project_json || JSON.stringify(draft.drawing_project_json || {}),
    finish_dimensions_json: measurement.finish_dimensions_json || JSON.stringify(draft.finish_dimensions_json || {}),
    drawing_svg: measurement.drawing_svg || draft.drawing_svg || "",
    updated_at: new Date().toISOString(),
  };
}

async function openSyncedOfflineDraft(draft) {
  if (!draft?.server_id) return null;
  if (navigator.onLine && supabaseClient && !state.measurements.some((measurement) => measurement.id === draft.server_id)) await loadMeasurements();
  if (state.measurements.some((measurement) => measurement.id === draft.server_id)) {
    await selectMeasurement(draft.server_id, { mode: "edit" });
    return state.selected;
  }
  setMessage($("#form-message"), `Этот черновик уже синхронизирован: ${draft.server_number || draft.server_id}`, "ok");
  return null;
}

async function updateOfflinePhotoSyncFields(photo, fields) {
  const updated = { ...photo, ...fields, updated_at: new Date().toISOString() };
  await window.TeksturaOfflineDB?.putOfflinePhoto?.(updated);
  return updated;
}

function offlinePhotoStoragePath(photo = {}, serverMeasurementId) {
  const ext = safeExt(photo.file_name || "photo.jpg") || "jpg";
  const localId = safeSlug(photo.local_photo_id || `${Date.now()}`) || `${Date.now()}`;
  return `measurements/${serverMeasurementId}/${localId}.${ext}`;
}

async function insertOfflineMeasurementPhoto(photo, serverMeasurementId, filePath) {
  const { data: existingPhoto, error: existingError } = await supabaseClient
    .from("measurement_photos")
    .select("*")
    .eq("measurement_id", serverMeasurementId)
    .eq("file_path", filePath)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existingPhoto?.id) return existingPhoto;

  const basePayload = {
    measurement_id: serverMeasurementId,
    photo_type: photo.photo_type || "Другое",
    file_path: filePath,
    is_required: true,
    added_by: state.user.id,
  };
  const payload = {
    ...basePayload,
    file_name: photo.file_name || "photo.jpg",
    size_bytes: Number(photo.size_bytes || photo.blob?.size || 0),
  };
  let { data: insertedPhoto, error } = await supabaseClient
    .from("measurement_photos")
    .insert(payload)
    .select("*")
    .single();
  if (error && (error.code === "PGRST204" || /file_name|size_bytes/i.test(error.message || ""))) {
    const fallback = await supabaseClient
      .from("measurement_photos")
      .insert(basePayload)
      .select("*")
      .single();
    insertedPhoto = fallback.data;
    error = fallback.error;
  }
  if (error) throw error;
  if (!insertedPhoto?.id || insertedPhoto.measurement_id !== serverMeasurementId || insertedPhoto.file_path !== filePath) {
    throw new Error("Файл загружен, но запись measurement_photos не создана. Повторите загрузку.");
  }
  return insertedPhoto;
}

async function syncOfflineDraftPhotos(localId, options = {}) {
  if (!navigator.onLine || !supabaseClient || !state.user) {
    setMessage($("#form-message"), OFFLINE_SYNC_UNAVAILABLE_MESSAGE, "error");
    refreshOfflineDraftNotice();
    return { total: 0, synced: 0, failed: 0 };
  }
  if (state.offlineSyncInFlight.has(`photos:${localId}`)) return null;

  const draft = await window.TeksturaOfflineDB?.getOfflineDraft?.(localId);
  if (!draft) {
    setMessage($("#form-message"), "Локальный черновик не найден в этом телефоне.", "error");
    return { total: 0, synced: 0, failed: 0 };
  }
  const serverMeasurementId = options.serverMeasurementId || draft.server_id;
  if (!serverMeasurementId) {
    setMessage($("#form-message"), "Сначала синхронизируйте сам TEMP-замер, затем можно отправить фото.", "error");
    return { total: 0, synced: 0, failed: 0 };
  }

  state.offlineSyncInFlight.add(`photos:${localId}`);
  const photos = await window.TeksturaOfflineDB?.listOfflinePhotosByDraft?.(localId) || [];
  const photosToSync = photos.filter((photo) => !isOfflinePhotoSynced(photo) && (photo.sync_status === "local_only" || photo.sync_status === "sync_error"));
  let synced = photos.filter(isOfflinePhotoSynced).length;
  let failed = 0;

  try {
    if (!photosToSync.length) {
      setMessage($("#form-message"), photos.length ? `Фото отправлены в Supabase: ${synced} из ${photos.length}.` : "У этого TEMP-черновика нет локальных фото для отправки.", "ok");
      return { total: photos.length, synced, failed };
    }

    for (const [index, originalPhoto] of photosToSync.entries()) {
      let photo = originalPhoto;
      const progressMessage = `Загружаю локальное фото ${index + 1} из ${photosToSync.length}...`;
      setPhotoStatus(progressMessage, "loading");
      setMessage($("#form-message"), progressMessage);
      try {
        photo = await updateOfflinePhotoSyncFields(photo, { sync_status: "syncing", sync_error: "", last_sync_error: "" });
        const filePath = photo.server_file_path || offlinePhotoStoragePath(photo, serverMeasurementId);
        if (!photo.server_file_path) {
          const blob = photo.blob;
          if (!blob) throw new Error("Локальный файл фото не найден в IndexedDB.");
          const { error: uploadError } = await supabaseClient.storage.from("measurement-photos").upload(filePath, blob, {
            contentType: photo.mime_type || blob.type || "image/jpeg",
            upsert: false,
          });
          if (uploadError) throw uploadError;
          photo = await updateOfflinePhotoSyncFields(photo, { server_file_path: filePath });
        }
        const insertedPhoto = await insertOfflineMeasurementPhoto(photo, serverMeasurementId, filePath);
        await updateOfflinePhotoSyncFields(photo, {
          sync_status: "synced",
          server_photo_id: insertedPhoto.id,
          server_file_path: filePath,
          synced_at: new Date().toISOString(),
          sync_error: "",
          last_sync_error: "",
        });
        synced += 1;
      } catch (error) {
        failed += 1;
        await updateOfflinePhotoSyncFields(photo, {
          sync_status: "sync_error",
          sync_error: userFacingError(error),
          last_sync_error: userFacingError(error),
        }).catch((markError) => console.warn("Offline photo sync error was not saved", markError));
        console.warn("Offline draft photo sync failed", { localId, localPhotoId: photo.local_photo_id, error });
      }
    }

    await loadOfflineDrafts();
    if (state.selected?.local_id === localId) {
      state.photos = await listLocalOfflinePhotos(localId);
      renderPhotos();
      renderChecks();
    }
    if (!failed) {
      const message = `Фото отправлены в Supabase: ${synced} из ${photos.length}. Все фото отправлены. Локальную копию можно удалить с телефона.`;
      setPhotoStatus(message, "ok");
      setMessage($("#form-message"), message, "ok");
    } else {
      const message = "Не все фото отправлены. Локальные фото сохранены в телефоне, попробуйте ещё раз.";
      setPhotoStatus(message, "error");
      setMessage($("#form-message"), message, "error");
    }
    return { total: photos.length, synced, failed };
  } finally {
    state.offlineSyncInFlight.delete(`photos:${localId}`);
    renderOfflineDrafts();
  }
}

async function syncOfflineDraft(localId) {
  if (!navigator.onLine || !supabaseClient || !state.user) {
    setMessage($("#form-message"), offlineDraftActionNote({ sync_status: "local_only" }) || OFFLINE_SYNC_UNAVAILABLE_MESSAGE, "error");
    refreshOfflineDraftNotice();
    return null;
  }
  if (state.offlineSyncInFlight.has(localId)) return null;
  if (state.selected?.local_id === localId && canEditLocalOfflineDraft()) await saveLocalOfflineDraftNow({ silent: true });

  const draft = await window.TeksturaOfflineDB?.getOfflineDraft?.(localId);
  if (!draft) return setMessage($("#form-message"), "Локальный черновик не найден в этом телефоне.", "error");
  if (draft.sync_status === "syncing") return setMessage($("#form-message"), "Синхронизация уже выполняется...", "error");
  if (draft.server_id || draft.sync_status === "synced") {
    const result = await syncOfflineDraftPhotos(localId);
    if (!result?.failed) {
      await openSyncedOfflineDraft(draft);
      const number = draft.server_number || draft.server_id || "без номера";
      setMessage($("#form-message"), `Этот черновик уже синхронизирован: ${number}`, "ok");
    }
    return state.selected;
  }
  if (!canSyncOfflineDraft(draft)) return setMessage($("#form-message"), "Этот локальный черновик сейчас нельзя синхронизировать.", "error");

  state.offlineSyncInFlight.add(localId);
  let clientId = null;
  try {
    await markOfflineDraftSyncing(localId);
    setMessage($("#form-message"), "Синхронизирую замер...");

    clientId = draft.server_client_id || null;
    const clientPayload = { ...(draft.form_data?.client || {}) };
    clientPayload.name = String(clientPayload.name || "").trim() || "Без имени";
    clientPayload.city = clientPayload.city || "Казань";
    clientPayload.created_by = clientPayload.created_by || state.user?.id;
    if (clientId) {
      const { error: clientUpdateError } = await supabaseClient.from("clients").update(clientPayload).eq("id", clientId);
      if (clientUpdateError) throw new Error(`Ошибка обновления клиента: ${clientUpdateError.message || clientUpdateError}`);
    } else {
      const { data: client, error: clientError } = await supabaseClient.from("clients").insert(clientPayload).select("*").single();
      if (clientError) throw new Error(`Ошибка создания клиента: ${clientError.message || clientError}`);
      clientId = client.id;
      await updateOfflineDraftSyncFields(localId, { sync_status: "syncing", server_client_id: clientId });
    }

    const measurementPayload = buildMeasurementPayloadFromOfflineDraft(draft, clientId);
    const { data: measurement, error: measurementError } = await supabaseClient
      .from("measurements")
      .insert(measurementPayload)
      .select("*, clients(*)")
      .single();
    if (measurementError) throw new Error(`Ошибка создания замера: ${measurementError.message || measurementError}`);

    await markOfflineDraftSynced(localId, measurement);
    const photoResult = await syncOfflineDraftPhotos(localId, { serverMeasurementId: measurement.id });
    await loadMeasurements();
    await selectMeasurement(measurement.id, { mode: "edit" });
    if (photoResult?.failed) {
      setMessage($("#form-message"), "Не все фото отправлены. Локальные фото сохранены в телефоне, попробуйте ещё раз.", "error");
    } else if (measurement.number) {
      setMessage($("#form-message"), `${draft.temp_number || "TEMP"} отправлен. Создан замер ${measurement.number}. Фото отправлены в Supabase: ${photoResult?.synced || 0} из ${photoResult?.total || 0}.`, "ok");
    } else {
      setMessage($("#form-message"), `${draft.temp_number || "TEMP"} отправлен, но Supabase не вернул номер замера.`, "warn");
    }
    return measurement;
  } catch (error) {
    console.warn("Offline draft sync failed", { localId, clientId, error });
    await markOfflineDraftSyncError(localId, error).catch((markError) => console.warn("Offline draft sync error was not saved", markError));
    setMessage($("#form-message"), OFFLINE_SYNC_ERROR_MESSAGE, "error");
    return null;
  } finally {
    state.offlineSyncInFlight.delete(localId);
    renderOfflineDrafts();
  }
}

function scheduleOfflineDraftAutosave() {
  if (!isLocalOfflineDraft()) return;
  clearTimeout(state.offlineAutosaveTimer);
  state.offlineAutosaveTimer = setTimeout(() => {
    state.offlineAutosaveInFlight = saveLocalOfflineDraftNow({ silent: true })
      .then(() => setMessage($("#form-message"), "Офлайн-черновик сохранён в телефоне", "ok"))
      .catch((error) => setMessage($("#form-message"), userFacingError(error), "error"));
  }, 500);
}

function fallbackProfileFromSession(user) {
  const identity = currentUserIdentity(user);
  return {
    id: user.id,
    full_name: identity.name || user.email?.split("@")[0] || "Пользователь",
    role: identity.role || "zamer",
  };
}

function buildRememberedAuthFromState() {
  const identity = currentUserIdentity(state.user);
  return {
    user: {
      id: state.user?.id || "",
      email: state.user?.email || identity.email || "",
    },
    profile: {
      full_name: state.profile?.full_name || identity.name || "Пользователь",
      role: state.profile?.role || identity.role || "zamer",
      login: identity.login || "",
    },
    saved_at: new Date().toISOString(),
  };
}

function saveRememberedAuth() {
  if (!state.user) return;
  localStorage.setItem(REMEMBERED_AUTH_KEY, JSON.stringify(buildRememberedAuthFromState()));
}

function readRememberedAuth() {
  try {
    const raw = localStorage.getItem(REMEMBERED_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.user?.id) return null;
    return parsed;
  } catch (error) {
    console.warn("Remembered auth parse failed", error);
    return null;
  }
}

function clearRememberedAuth() {
  localStorage.removeItem(REMEMBERED_AUTH_KEY);
}

function applyRememberedAuth(remembered) {
  if (!remembered?.user?.id) return false;
  state.user = {
    id: remembered.user.id,
    email: remembered.user.email || "",
    user_metadata: {
      login: remembered.profile?.login || "",
      full_name: remembered.profile?.full_name || "",
    },
  };
  state.profile = {
    id: remembered.user.id,
    full_name: remembered.profile?.full_name || "Пользователь",
    role: remembered.profile?.role || "zamer",
  };
  return true;
}

const LOGIN_USERS = {
  ruslan: {
    email: "ruslan@tekstura-zamery.local",
    name: "Руслан",
    role: "zamer",
  },
  rifat: {
    email: "rifat@tekstura-zamery.local",
    name: "Рифат",
    role: "zamer",
  },
  vildan: {
    email: "vildan@tekstura-zamery.local",
    name: "Вильдан",
    role: "zamer",
  },
  vitalik: {
    email: "vitalik@tekstura-zamery.local",
    name: "Виталик",
    role: "zamer",
  },
  vladimir: {
    email: "golovin-vla@yandex.ru",
    name: "Владимир",
    role: "admin",
  },
};

function normalizeLogin(login) {
  const value = String(login || "").trim().toLowerCase();
  if (!value) return "";
  if (value.includes("@")) return value;
  return LOGIN_USERS[value]?.email || `${value}@tekstura-zamery.local`;
}

function knownLoginByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return Object.entries(LOGIN_USERS).find(([, user]) => user.email.toLowerCase() === normalizedEmail) || null;
}

function userMetadataName(user = state.user) {
  const metadata = user?.user_metadata || {};
  return metadata.name || metadata.full_name || metadata.display_name || "";
}

function currentUserIdentity(user = state.user) {
  const known = knownLoginByEmail(user?.email);
  if (known) {
    const [login, info] = known;
    return { login, name: info.name, role: info.role, email: info.email, userId: user?.id || null };
  }
  const email = String(user?.email || "").trim();
  const profileName = String(state.profile?.full_name || "").trim();
  const metadataName = String(userMetadataName(user) || "").trim();
  return {
    login: email,
    name: profileName || metadataName || email || "Пользователь",
    role: state.profile?.role || "zamer",
    email,
    userId: user?.id || null,
  };
}

function measurementMeasurerName(measurement) {
  return String(measurement?.measurer_name || "").trim();
}

function measurerPreviewRow(measurement) {
  const name = measurementMeasurerName(measurement);
  return name ? previewRow("Замерщик", name) : "";
}

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


function shareInviteText(login) {
  const selectedLogin = String(login || "ruslan").trim() || "ruslan";
  return [
    "Tekstura Замеры",
    `Открой ссылку: ${location.origin}`,
    `Логин: ${selectedLogin}`,
    "Код выдаю отдельно.",
    "На iPhone можно добавить иконку: Поделиться → На экран «Домой».",
    "На Android: Chrome → ⋮ → Добавить на главный экран.",
  ].join("\n");
}

function showShareFallback(text) {
  const fallback = $("#share-fallback");
  if (!fallback) return;
  fallback.value = text;
  fallback.classList.remove("hidden");
  fallback.focus();
  fallback.select();
}

async function copyShareInvite() {
  const text = shareInviteText($("#share-login")?.value);
  const fallback = $("#share-fallback");
  fallback?.classList.add("hidden");
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    setMessage($("#share-message"), "Текст скопирован. Отправьте его замерщику в WhatsApp или Telegram.", "ok");
    return;
  }
  showShareFallback(text);
  setMessage($("#share-message"), "Автокопирование недоступно. Скопируйте текст из поля ниже вручную.", "error");
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

function normalizePhotoStoragePath(path) {
  const normalized = String(path || "").trim().replace(/^\/+/, "");
  return normalized.startsWith("measurement-photos/") ? normalized.slice("measurement-photos/".length) : normalized;
}

async function signedPhotoUrl(path) {
  const filePath = normalizePhotoStoragePath(path);
  if (!filePath || !supabaseClient) return "";
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

function renderPhotoFallback(message, filePath, hidden = false) {
  return `<div class="photo-fallback ${hidden ? "hidden" : ""}">
    <strong>${escapeHtml(message)}</strong>
    ${filePath ? `<small>${escapeHtml(filePath)}</small>` : ""}
  </div>`;
}

function renderPhotoImage(url, title, filePath) {
  return `<div class="photo-media" data-file-path="${escapeHtml(filePath)}">
    <img src="${escapeHtml(url)}" alt="${escapeHtml(title)}" loading="lazy" onerror="this.classList.add('hidden');var n=this.nextElementSibling;if(n)n.classList.remove('hidden');" />
    ${renderPhotoFallback("Файл не открылся", filePath, true)}
  </div>`;
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

function createMeasurementNumber() {
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

function safeJsonValue(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function modeFromDrawingProject(raw) {
  return normalizeMeasurementMode(safeJsonValue(raw).measurementMode || MEASUREMENT_MODE_DEFAULT);
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

function activeTabName() {
  return $(".tab.active")?.dataset.tab || "";
}

function activateTab(tabName) {
  const tab = $(`.tab[data-tab="${tabName}"]`);
  if (!tab || tab.classList.contains("hidden")) return false;
  $$(".tab").forEach((item) => item.classList.remove("active"));
  tab.classList.add("active");
  $$(".tab-panel").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.panel !== tabName));
  if (tabName === "check") renderChecks();
  return true;
}

async function requestActivateTab(tabName) {
  if (isLocalOfflineDraft() && tabName === "photos") {
    setMessage($("#form-message"), offlineDraftPhotoMessage(), "ok");
  }
  if (activeTabName() === "photos" && tabName !== "photos") {
    const saved = await ensurePendingPhotoSaved("переходом дальше");
    if (!saved) return false;
  }
  return activateTab(tabName);
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
  const project = safeJsonValue(input?.value || state.selected?.drawing_project_json || "");
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
  return roleMatches("admin", "manager");
}

function canUseTrashActions() {
  return Boolean(state.user);
}

function isTrashMeasurement(measurement = state.selected) {
  return Boolean(measurement?.is_deleted);
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
  const restoreBtn = $("#restore-measurement-btn");
  const permanentDeleteBtn = $("#permanent-delete-btn");
  const jsonBtn = $("#download-json-btn");
  const csvBtn = $("#download-csv-btn");
  const technicalActions = $("#technical-actions");
  const productionLink = $("#production-link");
  const selectedInTrash = isTrashMeasurement();
  const canUseTechnicalActions = canUseTechnicalExports() || canArchiveMeasurements() || canUseTrashActions();
  acceptBtn?.classList.toggle("hidden", selectedInTrash || !canAcceptMeasurements());
  archiveBtn?.classList.toggle("hidden", selectedInTrash || !canArchiveMeasurements());
  deleteBtn?.classList.toggle("hidden", selectedInTrash || !canUseTrashActions());
  restoreBtn?.classList.toggle("hidden", !selectedInTrash || !canUseTrashActions());
  permanentDeleteBtn?.classList.toggle("hidden", !selectedInTrash || !canUseTrashActions());
  jsonBtn?.classList.toggle("hidden", !canUseTechnicalExports());
  csvBtn?.classList.toggle("hidden", !canUseTechnicalExports());
  technicalActions?.classList.toggle("hidden", !canUseTechnicalActions);
  if (productionLink) productionLink.href = isLocalOfflineDraft() ? "#" : productionUrl();
  const form = $("#measurement-form");
  if (form) {
    form.dataset.role = role;
    form.dataset.offlineDraft = isLocalOfflineDraft() ? "true" : "false";
  }
}

function showApp(isAuthed) {
  $("#auth-view").classList.toggle("hidden", isAuthed);
  $("#main-view").classList.toggle("hidden", !isAuthed);
  $("#logout-btn").classList.toggle("hidden", !isAuthed);
  $("#user-role").textContent = isAuthed ? `${state.profile?.full_name || state.user?.email} · ${state.profile?.role || "user"}` : "Не вошли";
  applyRoleUI();
}

async function loadProfile() {
  if (!supabaseClient) {
    state.profile = fallbackProfileFromSession(state.user);
    return;
  }

  const { data, error } = await supabaseClient.from("profiles").select("*").eq("id", state.user.id).maybeSingle();
  if (data) {
    state.profile = data;
    return;
  }
  if (error && isOfflineNetworkError(error)) showOfflineState();
  state.profile = fallbackProfileFromSession(state.user);
}

async function init() {
  const remembered = readRememberedAuth();
  if (!supabaseClient || !navigator.onLine) {
    const session = readStoredSupabaseSession();
    state.user = session?.user || null;
    if (state.user) {
      state.profile = fallbackProfileFromSession(state.user);
      showApp(true);
    } else if (applyRememberedAuth(remembered)) {
      showApp(true);
    } else {
      showApp(false);
      setMessage($("#auth-message"), "Сначала войдите один раз при интернете. Потом приложение будет открываться без интернета.", "error");
    }
    showOfflineState();
    await loadOfflineDrafts();
    updateRememberedAuthStatus();
    return;
  }

  try {
    const { data } = await supabaseClient.auth.getSession();
    state.user = data.session?.user || readStoredSupabaseSession()?.user || null;
  } catch (error) {
    if (!isOfflineNetworkError(error)) throw error;
    state.user = readStoredSupabaseSession()?.user || null;
    if (!state.user) applyRememberedAuth(remembered);
    showOfflineState();
  }

  if (!state.user) {
    setMessage($("#auth-message"), "Сначала войдите один раз при интернете. Потом приложение будет открываться без интернета.", "error");
    updateRememberedAuthStatus();
    return showApp(false);
  }
  await loadProfile();
  saveRememberedAuth();
  showApp(true);
  await loadMeasurements();
  await loadOfflineDrafts();
  updateRememberedAuthStatus();
}

async function login() {
  if (!supabaseClient || !navigator.onLine) {
    showOfflineState();
    return;
  }
  setMessage($("#auth-message"), "Вход...");
  const email = normalizeLogin($("#email").value);
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: $("#password").value });
  if (error) return setMessage($("#auth-message"), isOfflineNetworkError(error) ? offlineActionMessage() : "Неверный логин или код", "error");
  state.user = data.user;
  await loadProfile();
  saveRememberedAuth();
  showApp(true);
  await loadMeasurements();
  setOfflineStartupNotice(false);
  await loadOfflineDrafts();
  setMessage($("#auth-message"), "");
  updateRememberedAuthStatus();
}

async function signup() {
  if (!supabaseClient || !navigator.onLine) {
    showOfflineState();
    return;
  }
  setMessage($("#auth-message"), "Создаю пользователя...");
  const { data, error } = await supabaseClient.auth.signUp({ email: normalizeLogin($("#email").value), password: $("#password").value });
  if (error) return setMessage($("#auth-message"), userFacingError(error), "error");
  setMessage($("#auth-message"), "Пользователь создан. Теперь нажмите Войти.", "ok");
  if (data.user) state.user = data.user;
}

async function logout() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  clearRememberedAuth();
  state.user = null;
  state.profile = null;
  state.measurements = [];
  state.selected = null;
  state.photos = [];
  state.photoScopeId = null;
  state.hiddenForeignPhotos = 0;
  showApp(false);
  updateRememberedAuthStatus();
}

function updateRememberedAuthStatus() {
  const el = $("#remembered-auth-status");
  if (!el) return;
  el.textContent = readRememberedAuth() ? "Вход запомнен на этом телефоне" : "Вход ещё не запомнен";
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
  if (!supabaseClient || !navigator.onLine) {
    showOfflineState();
    renderStats();
    renderList();
    return;
  }

  const { data, error } = await supabaseClient.from("measurements").select("*, clients(*)").order("created_at", { ascending: false });
  if (error) {
    if (isOfflineNetworkError(error)) {
      showOfflineState(offlineActionMessage());
      renderStats();
      renderList();
      return;
    }
    throw error;
  }
  state.measurements = data || [];
  setOfflineStartupNotice(false);
  await loadOfflineDrafts();
  setMessage($("#form-message"), "");
  renderStats();
  renderList();
}

async function refreshAppData() {
  if (!state.user) {
    await init();
    return;
  }
  if (!supabaseClient || !navigator.onLine) {
    showOfflineState();
    return;
  }
  await loadProfile();
  showApp(true);
  await loadMeasurements();
}

function filteredMeasurements() {
  const filter = $("#status-filter")?.value || "active";
  const query = String($("#measurement-search")?.value || "").trim().toLowerCase();
  const byStatus = (measurement) => {
    if (filter === "trash") return measurement.is_deleted === true;
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

function isTrashFilterActive() {
  return ($("#status-filter")?.value || "active") === "trash";
}

function visibleTrashMeasurements() {
  return isTrashFilterActive() ? filteredMeasurements().filter((measurement) => measurement.is_deleted === true && measurement.id) : [];
}

function selectedTrashMeasurements() {
  const selectedIds = state.selectedTrashIds || new Set();
  return state.measurements.filter((measurement) => measurement.is_deleted === true && selectedIds.has(String(measurement.id)));
}

function allTrashMeasurements() {
  return state.measurements.filter((measurement) => measurement.is_deleted === true && measurement.id && !measurement.local_id);
}

function setTrashActionsMessage(message, type = "") {
  const target = $("#trash-actions-message") || $("#form-message");
  setMessage(target, message, type);
}

function syncSelectedTrashIdsWithState() {
  if (!state.selectedTrashIds) state.selectedTrashIds = new Set();
  const validIds = new Set(state.measurements.filter((measurement) => measurement.is_deleted === true).map((measurement) => String(measurement.id)));
  state.selectedTrashIds = new Set(Array.from(state.selectedTrashIds).filter((id) => validIds.has(String(id))));
}

function renderTrashActions(items) {
  const panel = $("#trash-bulk-actions");
  if (!panel) return;
  if (!isTrashFilterActive()) {
    panel.classList.add("hidden");
    panel.setAttribute("aria-hidden", "true");
    state.selectedTrashIds?.clear();
    setTrashActionsMessage("");
    return;
  }
  syncSelectedTrashIdsWithState();
  const visibleIds = new Set((items || []).map((measurement) => String(measurement.id)));
  state.selectedTrashIds = new Set(Array.from(state.selectedTrashIds).filter((id) => visibleIds.has(String(id))));
  const selectedCount = state.selectedTrashIds.size;
  panel.classList.remove("hidden");
  panel.setAttribute("aria-hidden", "false");
  const count = $("#trash-selected-count");
  if (count) count.textContent = `Выбрано: ${selectedCount}`;
  const deleteSelected = $("#trash-delete-selected-btn");
  if (deleteSelected) deleteSelected.setAttribute("aria-disabled", selectedCount === 0 ? "true" : "false");
}

function toggleTrashSelection(id, selected) {
  if (!id || !isTrashFilterActive()) return;
  const measurement = state.measurements.find((item) => String(item.id) === String(id));
  if (!measurement?.is_deleted || measurement.local_id) return;
  if (selected) state.selectedTrashIds.add(String(id));
  else state.selectedTrashIds.delete(String(id));
  renderList();
}

function selectVisibleTrashMeasurements() {
  visibleTrashMeasurements().forEach((measurement) => {
    if (measurement.id && !measurement.local_id) state.selectedTrashIds.add(String(measurement.id));
  });
  renderList();
}

function clearTrashSelection() {
  state.selectedTrashIds.clear();
  renderList();
}


function renderStats() {
  const visible = state.measurements.filter((m) => !m.is_deleted);
  $("#stat-drafts").textContent = visible.filter((m) => m.status === "Черновик").length;
  $("#stat-review").textContent = visible.filter((m) => m.status === "На проверке").length;
  $("#stat-ready").textContent = visible.filter((m) => m.status === "Готовый замер").length;
  $("#stat-archive").textContent = visible.filter((m) => m.status === "Архив" || m.is_archived).length;
}

function renderList() {
  const list = $("#measurements-list");
  const items = filteredMeasurements();
  renderTrashActions(items);
  if (!items.length) {
    list.innerHTML = `<p class="muted-text">Замеры по текущему поиску не найдены.</p>`;
    return;
  }
  const showTrashCheckboxes = isTrashFilterActive();
  list.innerHTML = items.map((m) => {
    const c = m.clients || {};
    const active = state.selected?.id === m.id ? "active" : "";
    const modeLabel = MEASUREMENT_MODE_LABELS[modeFromDrawingProject(m.drawing_project_json)];
    const measurerChip = measurementMeasurerName(m) ? `<span class="small-chip">Замерщик: ${escapeHtml(measurementMeasurerName(m))}</span>` : "";
    const checked = state.selectedTrashIds.has(String(m.id)) ? "checked" : "";
    const checkbox = showTrashCheckboxes ? `<label class="trash-select" aria-label="Выбрать замер ${escapeHtml(m.number || m.id)}"><input type="checkbox" data-trash-select-id="${escapeHtml(m.id)}" ${checked} /><span>Выбрать</span></label>` : "";
    return `<div class="measurement-item ${active}" role="button" tabindex="0" data-id="${escapeHtml(m.id)}">${checkbox}<div class="number">${escapeHtml(m.number)}</div><div>${escapeHtml(c.name || "Клиент не указан")}</div><div class="address">${escapeHtml(c.address || "Адрес не указан")}</div><div class="measurement-meta">${m.is_deleted ? `<span class="small-chip danger-chip">Корзина</span>` : ""}<span class="small-chip">${escapeHtml(m.status)}</span><span class="small-chip">${escapeHtml(m.site_situation)}</span><span class="small-chip">${escapeHtml(m.opening_type)}</span><span class="small-chip mode-chip">${escapeHtml(modeLabel)}</span>${measurerChip}</div></div>`;
  }).join("");
  $$(".measurement-item").forEach((item) => {
    item.addEventListener("click", (event) => {
      if (event.target.closest("[data-trash-select-id]")) return;
      selectMeasurement(item.dataset.id);
    });
    item.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target.closest("[data-trash-select-id]")) return;
      event.preventDefault();
      selectMeasurement(item.dataset.id);
    });
  });
  $$("[data-trash-select-id]").forEach((checkbox) => {
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => toggleTrashSelection(checkbox.dataset.trashSelectId, checkbox.checked));
  });
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
    number: createMeasurementNumber(),
    status: "Черновик",
    clients: {},
    site_situation: "Пустой проём",
    opening_type: "Прямой",
    object_stage: "Черновая",
    has_warm_floor: "Не знаю",
    drawing_project_json: JSON.stringify({ schemaVersion: 2, measurementMode: normalizedMode, type: "empty_straight", units: "mm" }),
    measurer_name: currentUserIdentity().name,
    measurer_login: currentUserIdentity().login,
    measurer_user_id: state.user?.id || null,
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
  $("#form-title").textContent = isLocalOfflineDraft(m) ? `Офлайн-черновик ${m.number || "TEMP"}` : (m.number || "Новый замер");
  $("#form-status").textContent = isLocalOfflineDraft(m) ? "local_only" : (m.status || "Черновик");
  const formMeasurer = $("#form-measurer");
  const measurerName = measurementMeasurerName(m);
  if (formMeasurer) {
    formMeasurer.textContent = measurerName ? `Замерщик: ${measurerName}` : "";
    formMeasurer.classList.toggle("hidden", !measurerName);
  }
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

const REQUIRED_FIELD_MATRIX = {
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

const REQUIRED_FIELD_FALLBACKS = {
  L: ["L", "opening_length_mm"],
  W: ["W", "opening_width_mm"],
  H: ["H", "height_clean_to_clean_mm"],
  T: ["T", "slab_thickness_mm"],
  M1: ["M1", "flight1_length_mm"],
  B1: ["B1", "flight1_width_mm"],
  N1: ["N1", "flight1_steps_count"],
  M2: ["M2", "flight2_length_mm"],
  B2: ["B2", "flight2_width_mm"],
  N2: ["N2", "flight2_steps_count"],
  ZL: ["ZL", "corner_zone_length_mm"],
  ZW: ["ZW", "corner_zone_width_mm"],
  ZN: ["ZN", "winder_steps_count"],
  h: ["h", "riser_height_mm"],
  b: ["b", "tread_depth_mm"],
  b1: ["b1", "tread_depth_flight1_mm"],
  b2: ["b2", "tread_depth_flight2_mm"],
};

function matrixShape(isStraight, isWinder) {
  if (isStraight) return "straight";
  return isWinder ? "winder" : "landing";
}

function isReadyULandingType(type) {
  const text = String(type || "");
  return text === "ready_u_landing_left" || text === "ready_u_landing_right";
}

function withReadyULandingFields(fields, type, mode) {
  if (!isReadyULandingType(type) || mode !== "ready") return fields;
  return [...fields, "ZL", "ZW"];
}

function requiredMatrixFields(project, mode, measurementMode, shape) {
  const sameTread = project?.treadMode?.sameTread !== false;
  const baseFields = REQUIRED_FIELD_MATRIX[mode]?.[measurementMode]?.[shape] || REQUIRED_FIELD_MATRIX[mode]?.[measurementMode]?.turn || [];
  const fields = withReadyULandingFields(baseFields, project?.type, mode);
  return fields.flatMap((code) => {
    if (code === "tread") return sameTread ? ["b"] : ["b1", "b2"];
    if (code === "tread1") return sameTread ? ["b"] : ["b1"];
    return [code];
  });
}

function hasRequiredMatrixValue(project, code) {
  const [projectKey, fallbackName] = REQUIRED_FIELD_FALLBACKS[code] || [code, ""];
  return positiveProjectValue(project, projectKey, fallbackName);
}

function getRequiredMeasurementErrors() {
  ensureDynamicMeasurementFields();
  const form = $("#measurement-form");
  const rawProject = form?.drawing_project_json?.value || state.selected?.drawing_project_json || "";
  const project = safeJsonValue(rawProject);
  const type = String(project.type || "");
  const measurementMode = projectMeasurementMode(project);
  const mode = type.startsWith("empty") || !type ? "empty" : "ready";
  const isStraight = type ? type.includes("straight") : String(form?.opening_type?.value || "").includes("Прям");
  const isWinder = type.includes("winder");
  const errors = [];

  if (!type) errors.push("схема");
  if (!String(form?.drawing_svg?.value || state.selected?.drawing_svg || "").trim()) errors.push("сохранённая схема/SVG");
  requiredMatrixFields(project, mode, measurementMode, matrixShape(isStraight, isWinder)).forEach((code) => {
    if (!hasRequiredMatrixValue(project, code)) errors.push(code);
  });
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
  if (isLocalOfflineDraft()) {
    return saveLocalOfflineDraftNow();
  }
  if (!supabaseClient || !navigator.onLine) {
    showOfflineState();
    return null;
  }
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
  const isNewMeasurement = !state.selected?.id;
  const identity = currentUserIdentity();
  const payload = {
    ...measurement,
    client_id: clientId,
    created_by: state.selected?.created_by || state.user.id,
    measurer_id: state.selected?.measurer_id || state.user.id,
  };
  if (isNewMeasurement) {
    payload.measurer_name = state.selected?.measurer_name || identity.name;
    payload.measurer_login = state.selected?.measurer_login || identity.login;
    payload.measurer_user_id = state.selected?.measurer_user_id || identity.userId;
  }
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
  if (!options.skipPendingPhotoUpload && hasPendingPhotoFile()) {
    const savedPhoto = await ensurePendingPhotoSaved("сохранением замера");
    if (!savedPhoto) return null;
    setMessage($("#form-message"), "Сохранено. Фото сохранено.", "ok");
  } else {
    setMessage($("#form-message"), "Сохранено.", "ok");
  }
  return state.selected;
}

async function setStatus(status, extra = {}, options = {}) {
  if (isLocalOfflineDraft()) {
    setMessage($("#form-message"), offlineDraftMessage(), "error");
    return;
  }
  if (!supabaseClient || !navigator.onLine) {
    showOfflineState();
    return;
  }
  if (options.requireClientFields && !requireClientBeforeWorkflow(options.actionLabel || "изменением статуса")) return;
  if (!state.selected?.id) await saveMeasurement({ requireClientFields: Boolean(options.requireClientFields), actionLabel: options.actionLabel });
  if (!state.selected?.id) return;
  const { data, error } = await supabaseClient.from("measurements").update({ status, updated_at: new Date().toISOString(), ...extra }).eq("id", state.selected.id).select("*, clients(*)").single();
  if (error) throw error;
  state.selected = data;
  await loadMeasurements();
  await selectMeasurement(data.id, { mode: "edit" });
}


function resetSelectedMeasurement(message = "") {
  state.selected = null;
  state.photos = [];
  state.photoScopeId = null;
  state.hiddenForeignPhotos = 0;
  renderStats();
  renderList();
  showWorkspacePanel("empty");
  if (message) {
    setMessage($("#form-message"), message, "ok");
    alert(message);
  }
}

function replaceMeasurementInState(measurement) {
  if (!measurement?.id) return;
  const index = state.measurements.findIndex((item) => item.id === measurement.id);
  if (index >= 0) state.measurements[index] = measurement;
  else state.measurements.unshift(measurement);
}

function requireOnlineSupabaseAction() {
  if (!supabaseClient || !navigator.onLine) {
    showOfflineState();
    return false;
  }
  return true;
}

async function moveSelectedMeasurementToTrash() {
  if (isLocalOfflineDraft()) {
    setMessage($("#form-message"), offlineDraftMessage(), "error");
    return;
  }
  if (!canUseTrashActions()) {
    setMessage($("#form-message"), "Войдите в приложение, чтобы перенести замер в корзину.", "error");
    return;
  }
  if (!state.selected?.id) return;
  const measurementNumber = state.selected.number || "замер";
  if (!confirm(`Переместить замер ${measurementNumber} в корзину? Его можно будет восстановить.`)) return;
  if (!requireOnlineSupabaseAction()) return;

  const { data, error } = await supabaseClient
    .from("measurements")
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: state.user?.id || null, updated_at: new Date().toISOString() })
    .eq("id", state.selected.id)
    .select("*, clients(*)")
    .single();
  if (error) throw new Error("Нет прав Supabase на перенос в корзину. Нужна настройка RLS.");
  replaceMeasurementInState(data);
  resetSelectedMeasurement("Замер перемещён в корзину.");
}

async function restoreSelectedMeasurementFromTrash() {
  if (isLocalOfflineDraft()) {
    setMessage($("#form-message"), offlineDraftMessage(), "error");
    return;
  }
  if (!canUseTrashActions()) {
    setMessage($("#form-message"), "Войдите в приложение, чтобы восстановить замер.", "error");
    return;
  }
  if (!state.selected?.id) return;
  if (!requireOnlineSupabaseAction()) return;

  const { data, error } = await supabaseClient
    .from("measurements")
    .update({ is_deleted: false, deleted_at: null, deleted_by: null, updated_at: new Date().toISOString() })
    .eq("id", state.selected.id)
    .select("*, clients(*)")
    .single();
  if (error) throw error;
  replaceMeasurementInState(data);
  await loadMeasurements();
  await selectMeasurement(data.id);
  setMessage($("#form-message"), "Замер восстановлен.", "ok");
  alert("Замер восстановлен.");
}

function isMissingStorageObjectError(error) {
  const text = String(error?.message || error?.error || error || "").toLowerCase();
  const status = Number(error?.statusCode || error?.status || 0);
  return status === 404 || text.includes("not found") || text.includes("does not exist") || text.includes("not exist") || text.includes("missing");
}

async function removeMeasurementStorageFiles(filePaths) {
  const uniquePaths = Array.from(new Set((filePaths || []).map((path) => String(path || "").trim()).filter(Boolean)));
  if (!uniquePaths.length) return;
  const { error } = await supabaseClient.storage.from("measurement-photos").remove(uniquePaths);
  if (error && !isMissingStorageObjectError(error)) throw new Error(`Ошибка удаления файлов Storage: ${error.message || error}`);
  if (error) console.warn("Some measurement photo files were already absent in Storage", error);
}

async function deleteClientIfMeasurementWasLast(clientId) {
  if (!clientId) return;
  const { data, error } = await supabaseClient
    .from("measurements")
    .select("id")
    .eq("client_id", clientId)
    .limit(1);
  if (error) throw new Error(`Ошибка проверки замеров клиента: ${error.message || error}`);
  if (data?.length) return;
  const { error: clientError } = await supabaseClient.from("clients").delete().eq("id", clientId);
  if (clientError) throw new Error(`Ошибка удаления клиента: ${clientError.message || clientError}`);
}

function ensurePermanentDeletePassword(messageTarget = $("#form-message")) {
  const password = prompt("Введите пароль для полного удаления из Supabase");
  if (password === PERMANENT_DELETE_PASSWORD) return true;
  setMessage(messageTarget, "Неверный пароль. Удаление отменено.", "error");
  alert("Неверный пароль. Удаление отменено.");
  return false;
}

function explainDeleteError(error) {
  const message = error?.message || String(error);
  const lower = message.toLowerCase();
  if (lower.includes("row-level security") || lower.includes("permission denied") || lower.includes("not authorized") || lower.includes("unauthorized") || lower.includes("42501")) {
    return `${message}. Проверьте DELETE policies RLS для measurements, measurement_photos и clients.`;
  }
  return message;
}

async function permanentDeleteMeasurementById(measurement) {
  if (!measurement?.id) throw new Error("Замер не найден для полного удаления.");
  if (measurement.local_id) throw new Error("Локальные TEMP-черновики не удаляются из Supabase.");
  if (measurement.is_deleted !== true) throw new Error("Полное удаление доступно только для замеров из корзины.");
  if (!supabaseClient || !navigator.onLine) throw new Error(offlineActionMessage());

  const { data: photos, error: photosError } = await supabaseClient
    .from("measurement_photos")
    .select("file_path")
    .eq("measurement_id", measurement.id);
  if (photosError) throw new Error(`Ошибка поиска фото замера: ${photosError.message || photosError}`);

  await removeMeasurementStorageFiles((photos || []).map((photo) => photo.file_path));

  const { error: photoRowsError } = await supabaseClient
    .from("measurement_photos")
    .delete()
    .eq("measurement_id", measurement.id);
  if (photoRowsError) throw new Error(`Ошибка удаления строк фото: ${photoRowsError.message || photoRowsError}`);

  const { error: measurementError } = await supabaseClient
    .from("measurements")
    .delete()
    .eq("id", measurement.id);
  if (measurementError) throw new Error(`Ошибка удаления замера: ${measurementError.message || measurementError}`);

  await deleteClientIfMeasurementWasLast(measurement.client_id);
  return measurement.id;
}

async function permanentDeleteSelectedMeasurement() {
  if (isLocalOfflineDraft()) {
    setMessage($("#form-message"), offlineDraftMessage(), "error");
    return;
  }
  if (!canUseTrashActions()) {
    setMessage($("#form-message"), "Войдите в приложение, чтобы удалить замер навсегда.", "error");
    return;
  }
  if (!state.selected?.id) return;
  const measurement = state.selected;
  if (!ensurePermanentDeletePassword($("#form-message"))) return;
  if (!confirm(`Удалить замер ${measurement.number || "замер"} навсегда из Supabase? Будут удалены замер, фото и файлы Storage. Это действие нельзя отменить.`)) return;
  if (!requireOnlineSupabaseAction()) return;

  try {
    await permanentDeleteMeasurementById(measurement);
  } catch (error) {
    throw new Error(explainDeleteError(error));
  }
  state.measurements = state.measurements.filter((item) => item.id !== measurement.id);
  state.selectedTrashIds.delete(String(measurement.id));
  resetSelectedMeasurement("Замер полностью удалён из Supabase.");
}

async function bulkPermanentDeleteMeasurements(measurements, successMessage) {
  const candidates = (measurements || []).filter((measurement) => measurement?.id && measurement.is_deleted === true && !measurement.local_id);
  const errors = [];
  const deletedIds = [];
  const total = candidates.length;

  for (let index = 0; index < candidates.length; index += 1) {
    const measurement = candidates[index];
    setTrashActionsMessage(`Удаляю ${index + 1} из ${total}…`);
    try {
      await permanentDeleteMeasurementById(measurement);
      deletedIds.push(String(measurement.id));
    } catch (error) {
      errors.push({ measurement, error: explainDeleteError(error) });
      console.error("Bulk permanent delete failed", measurement.id, error);
    }
  }

  if (deletedIds.length) {
    const deleted = new Set(deletedIds);
    state.measurements = state.measurements.filter((measurement) => !deleted.has(String(measurement.id)));
    state.selectedTrashIds = new Set(Array.from(state.selectedTrashIds).filter((id) => !deleted.has(String(id))));
    if (state.selected?.id && deleted.has(String(state.selected.id))) resetSelectedMeasurement("");
  }

  renderStats();
  renderList();
  const summary = `Удалено: ${deletedIds.length}. Ошибок: ${errors.length}.`;
  setTrashActionsMessage(errors.length ? summary : `${successMessage} ${summary}`, errors.length ? "error" : "ok");
  if (errors.length) console.warn("Bulk permanent delete finished with errors", errors);
}

async function deleteSelectedTrashMeasurements() {
  if (!canUseTrashActions()) {
    setTrashActionsMessage("Войдите в приложение, чтобы удалить замеры навсегда.", "error");
    return;
  }
  const measurements = selectedTrashMeasurements();
  if (!measurements.length) {
    setTrashActionsMessage("Выберите замеры для удаления.", "error");
    return;
  }
  if (!ensurePermanentDeletePassword($("#trash-actions-message"))) return;
  if (!confirm("Удалить выбранные замеры навсегда из Supabase? Будут удалены замеры, фото и файлы Storage. Это действие нельзя отменить.")) return;
  if (!requireOnlineSupabaseAction()) return;
  await bulkPermanentDeleteMeasurements(measurements, "Выбранные замеры полностью удалены из Supabase.");
}

async function clearTrashMeasurements() {
  if (!canUseTrashActions()) {
    setTrashActionsMessage("Войдите в приложение, чтобы очистить корзину.", "error");
    return;
  }
  const measurements = allTrashMeasurements();
  if (!measurements.length) {
    setTrashActionsMessage("Корзина уже пуста.", "ok");
    return;
  }
  if (!ensurePermanentDeletePassword($("#trash-actions-message"))) return;
  if (!confirm("Очистить всю корзину навсегда? Будут удалены все замеры из корзины, фото и файлы Storage. Это действие нельзя отменить.")) return;
  if (!requireOnlineSupabaseAction()) return;
  await bulkPermanentDeleteMeasurements(measurements, "Корзина полностью очищена из Supabase.");
}

async function loadPhotos(measurementId) {
  if (isLocalOfflineDraft()) {
    state.photos = await listLocalOfflinePhotos(state.selected.local_id);
    state.photoScopeId = state.selected.local_id;
    state.hiddenForeignPhotos = 0;
    return;
  }
  if (!supabaseClient || !navigator.onLine) {
    showOfflineState();
    return;
  }
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
  if (error) {
    if (isOfflineNetworkError(error)) {
      showOfflineState(offlineActionMessage());
      return;
    }
    throw error;
  }
  if (state.selected?.id !== measurementId) return;
  state.photoScopeId = measurementId;
  const filtered = filterPhotosForMeasurement(data || [], state.selected);
  state.photos = await Promise.all(filtered.map(async (photo) => ({
    ...photo,
    url: await signedPhotoUrl(photo.file_path),
  })));
}

function previewValue(value, fallback = "—") {
  const text = String(value ?? "").trim();
  return text ? escapeHtml(text) : fallback;
}

function previewRow(label, value) {
  return `<div class="preview-row"><span>${escapeHtml(label)}</span><b>${previewValue(value)}</b></div>`;
}


function previewNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function previewMeasurementMode(project) {
  return project?.measurementMode === "detailed" ? "detailed" : "simple";
}

function previewVariant(project) {
  const type = String(project?.type || "");
  const mode = !type || type.startsWith("empty") ? "empty" : "ready";
  const opening = type.includes("straight") ? "straight" : type.includes("_u_") ? "u" : type.includes("_l_") ? "l" : "";
  const turn = type.includes("winder") ? "winder" : type.includes("landing") ? "landing" : "";
  return { type, mode, opening, turn };
}

const PREVIEW_FIELD_MATRIX = {
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

const PREVIEW_FIELD_LABELS = {
  L: "L — длина проёма",
  W: "W — ширина проёма",
  H: "H — высота от пола до пола",
  T: "T — толщина перекрытия/проёма",
  M1: "Марш 1 M1 расчёт/геометрия",
  B1: "Марш 1 B1",
  N1: "Марш 1: N1",
  M2: "Марш 2 M2 расчёт/геометрия",
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

function previewMatrixFields(project, variant) {
  const measurementMode = previewMeasurementMode(project);
  const shape = variant.opening === "straight" ? "straight" : variant.turn === "winder" ? "winder" : "landing";
  const baseFields = PREVIEW_FIELD_MATRIX[variant.mode]?.[measurementMode]?.[shape] || [];
  const fields = withReadyULandingFields(baseFields, variant.type, variant.mode);
  const sameTread = project?.treadMode?.sameTread !== false;
  return fields.flatMap((code) => {
    if (code === "tread") return sameTread ? ["b"] : ["b1", "b2"];
    if (code === "tread1") return sameTread ? ["b"] : ["b1"];
    return [code];
  });
}

function previewFieldValues(measurement, project) {
  const p = project?.params || {};
  const treadMode = project?.treadMode || {};
  const sameTread = treadMode.sameTread !== false;
  const b = previewNumber(p.b, p.treadDepth, treadMode.b1, measurement.tread_depth_mm, 250);
  const b1 = sameTread ? b : previewNumber(p.b1, p.treadDepthFlight1, treadMode.b1, measurement.tread_depth_mm, b);
  const b2 = sameTread ? b : previewNumber(p.b2, p.treadDepthFlight2, treadMode.b2, measurement.tread_depth_mm, b);
  const h = previewNumber(p.h, p.riserHeight, measurement.riser_height_mm, 180);
  const values = {
    M1: previewNumber(p.M1, p.firstFlightLength, measurement.flight1_length_mm),
    B1: previewNumber(p.B1, p.firstFlightWidth, measurement.flight1_width_mm),
    N1: previewNumber(p.N1, p.firstFlightSteps, measurement.flight1_steps_count),
    M2: previewNumber(p.M2, p.secondFlightLength, measurement.flight2_length_mm),
    B2: previewNumber(p.B2, p.secondFlightWidth, measurement.flight2_width_mm),
    N2: previewNumber(p.N2, p.secondFlightSteps, measurement.flight2_steps_count),
    ZL: previewNumber(p.ZL, p.turnLength, measurement.corner_zone_length_mm),
    ZW: previewNumber(p.ZW, p.turnWidth, measurement.corner_zone_width_mm),
    ZN: previewNumber(p.ZN, p.winderSteps, measurement.winder_steps_count),
    H: previewNumber(p.H, p.height, measurement.height_clean_to_clean_mm),
    T: previewNumber(p.T, p.slabThickness, measurement.slab_thickness_mm),
    L: previewNumber(p.L, p.openingLength, measurement.opening_length_mm),
    W: previewNumber(p.W, p.openingWidth, measurement.opening_width_mm),
    h,
    b,
    b1,
    b2,
  };
  const variant = previewVariant(project);
  if (variant.mode === "ready") {
    values.M1 = previewNumber(values.N1 && b1 ? values.N1 * b1 : null, values.M1);
    values.M2 = previewNumber(values.N2 && b2 ? values.N2 * b2 : null, values.M2);
  }
  return values;
}

function previewFieldLabel(code, variant) {
  if (isReadyULandingType(variant?.type)) {
    if (code === "ZL") return "Площадка длина";
    if (code === "ZW") return "Площадка ширина";
  }
  return PREVIEW_FIELD_LABELS[code] || code;
}

function previewDimensionMarkup(measurement, project) {
  const variant = previewVariant(project);
  const values = previewFieldValues(measurement, project);
  const rows = previewMatrixFields(project, variant).map((code) => {
    const value = values[code];
    if (!value) return "";
    const suffix = ["N1", "N2", "ZN"].includes(code) ? " шт" : " мм";
    return previewRow(previewFieldLabel(code, variant), `${Math.round(value)}${suffix}`);
  }).filter(Boolean);
  return rows.length ? rows.join("") : `<p class="muted-text">Рабочие размеры не заполнены.</p>`;
}

function localPhotoObjectUrl(photo) {
  if (!photo?.blob) return "";
  try {
    return URL.createObjectURL(photo.blob);
  } catch (error) {
    console.warn("Не удалось создать локальное превью фото", error);
    return "";
  }
}

function photoPreviewUrl(photo) {
  return photo?.local_photo_id ? localPhotoObjectUrl(photo) : photo?.url || "";
}

function previewPhotoMarkup() {
  const photos = selectedPhotos();
  if (!photos.length) return `<p class="muted-text">Фото ещё не добавлены.</p>`;
  return `<div class="preview-photos">${photos.map((photo) => {
    const type = photo.photo_type || "Фото";
    const previewUrl = photoPreviewUrl(photo);
    const filePath = photo.file_path || photo.server_file_path || "";
    const media = previewUrl
      ? renderPhotoImage(previewUrl, type, filePath)
      : photo.local_photo_id
        ? `<div class="preview-photo-thumb">Фото</div>`
        : `<div class="preview-photo-media is-error">${renderPhotoFallback("Фото есть в базе, но файл недоступен в Storage", filePath)}</div>`;
    return `
    <div class="preview-photo-card">
      ${media}
      <b>${previewValue(type, "Фото")}</b>
      <span>${previewValue(filePath, "")}</span>
    </div>`;
  }).join("")}</div>`;
}


const MAIN_PREVIEW_SVG_STYLE_ID = "main-preview-svg-safe-style";
const MAIN_PREVIEW_SVG_STYLE = `
  svg{background:#fff;}
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
`;
const MAIN_PREVIEW_HIT_CLASSES = ["zone-hit", "dim-hit", "wall-hit", "window-hit", "ascent-hit"];
const MAIN_PREVIEW_LINE_CLASSES = ["step", "tread", "step-line", "dimension", "dim", "route", "wall", "wall-line", "wall-mark"];

function mainPreviewSvgClassList(node) {
  return String(node.getAttribute("class") || "").split(/\s+/).filter(Boolean);
}

function mainPreviewSvgHasAnyClass(node, classes) {
  const nodeClasses = mainPreviewSvgClassList(node);
  return classes.some((name) => nodeClasses.includes(name));
}

function mainPreviewSvgHasPaint(node) {
  return node.hasAttribute("fill") || node.hasAttribute("stroke") || node.hasAttribute("style");
}

function ensureMainPreviewSvgStyle(parsed, svg) {
  const existing = svg.querySelector(`style#${MAIN_PREVIEW_SVG_STYLE_ID}`);
  if (existing) {
    existing.textContent = MAIN_PREVIEW_SVG_STYLE;
    return;
  }
  const style = parsed.createElementNS("http://www.w3.org/2000/svg", "style");
  style.setAttribute("id", MAIN_PREVIEW_SVG_STYLE_ID);
  style.textContent = MAIN_PREVIEW_SVG_STYLE;
  const first = svg.firstChild;
  if (first) svg.insertBefore(style, first);
  else svg.appendChild(style);
}

function hardenPreviewSvgPaint(svg) {
  svg.querySelectorAll(".zone-hit, .dim-hit, .wall-hit, .window-hit, .ascent-hit").forEach((node) => {
    node.setAttribute("fill", "transparent");
    node.setAttribute("stroke", "transparent");
    node.setAttribute("display", "none");
  });

  svg.querySelectorAll("rect, polygon, path, line, polyline").forEach((node) => {
    if (mainPreviewSvgHasAnyClass(node, MAIN_PREVIEW_HIT_CLASSES)) return;
    if (mainPreviewSvgHasPaint(node)) return;
    const tag = node.nodeName.toLowerCase();
    if (tag === "line" || tag === "polyline" || mainPreviewSvgHasAnyClass(node, MAIN_PREVIEW_LINE_CLASSES)) {
      node.setAttribute("fill", "none");
      node.setAttribute("stroke", "#1e293b");
      return;
    }
    if (tag === "path") {
      node.setAttribute("fill", "#f8fafc");
      node.setAttribute("stroke", "#0f172a");
      return;
    }
    node.setAttribute("fill", mainPreviewSvgHasAnyClass(node, ["turn", "landing", "platform"]) ? "#eef6ff" : "#f8fafc");
    node.setAttribute("stroke", "#0f172a");
  });
}

function enhanceMainPreviewSvg(svgText) {
  if (!svgText || typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") return svgText || "";
  const parsed = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = parsed.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== "svg" || svg.querySelector("parsererror")) return svgText;
  ensureMainPreviewSvgStyle(parsed, svg);
  hardenPreviewSvgPaint(svg);
  return new XMLSerializer().serializeToString(svg);
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
  const project = safeJsonValue(m.drawing_project_json);
  const productionHref = productionUrl(m);
  const inTrash = isTrashMeasurement(m);
  const canEdit = canEditMeasurements() && !inTrash;
  const canDelete = canUseTrashActions();
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
        ${!inTrash && canDelete ? `<button type="button" class="btn danger" data-trash-measurement>Удалить</button>` : ""}
        ${inTrash && canDelete ? `<button type="button" class="btn secondary" data-restore-measurement>Восстановить</button><button type="button" class="btn danger" data-permanent-delete-measurement>Удалить навсегда</button>` : ""}
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
        ${measurerPreviewRow(m)}
        ${previewRow("Что есть", m.site_situation)}
        ${previewRow("Тип проёма", m.opening_type)}
        ${previewRow("Направление", m.stair_direction)}
        ${previewRow("Поворот", m.turn_type)}
      </section>

      <section class="preview-section">
        <h3>Размеры и схема</h3>
        ${previewDimensionMarkup(m, project)}
        <div class="preview-scheme">${enhanceMainPreviewSvg(m.drawing_svg) || `<span class="muted-text">Схема не сохранена.</span>`}</div>
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
  if (isLocalOfflineDraft()) {
    if (!state.selected?.local_id || state.photoScopeId !== state.selected.local_id) return [];
    return (Array.isArray(state.photos) ? state.photos : []).filter((photo) => photo.local_draft_id === state.selected.local_id);
  }
  if (!state.selected?.id || state.photoScopeId !== state.selected.id) return [];
  return filterPhotosForMeasurement(state.photos, state.selected);
}

async function listLocalOfflinePhotos(localDraftId = state.selected?.local_id) {
  if (!localDraftId) return [];
  return await (window.TeksturaOfflineDB?.listOfflinePhotosByDraft?.(localDraftId) || Promise.resolve([]));
}

function formatPhotoSize(sizeBytes) {
  const size = Number(sizeBytes || 0);
  if (!size) return "0 Б";
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} КБ`;
  return `${Math.round(size / 1024 / 102.4) / 10} МБ`;
}

function localPhotoFileName(fileName = "photo.jpg") {
  const base = String(fileName || "photo").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g, "_").slice(0, 60) || "photo";
  return `${base}.jpg`;
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось прочитать фото для сжатия."));
    };
    image.src = url;
  });
}

async function compressPhotoForOffline(file) {
  try {
    const maxSide = 1800;
    const quality = 0.82;
    const source = await loadImageFromBlob(file);
    const scale = Math.min(1, maxSide / Math.max(source.width || maxSide, source.height || maxSide));
    const width = Math.max(1, Math.round((source.width || maxSide) * scale));
    const height = Math.max(1, Math.round((source.height || maxSide) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas недоступен.");
    context.drawImage(source, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("Сжатие фото не вернуло файл.");
    return { blob, fileName: localPhotoFileName(file.name), mimeType: blob.type || "image/jpeg" };
  } catch (error) {
    console.warn("Фото сохранено без сжатия", error);
    return { blob: file, fileName: file.name || "photo.jpg", mimeType: file.type || "image/jpeg" };
  }
}

function photoStatusElement() {
  return $("#photo-status");
}

function photoFileInputs() {
  return [$("#photo-camera-file"), $("#photo-gallery-file")].filter(Boolean);
}

function pendingPhotoFiles() {
  return Array.isArray(state.pendingPhotoFiles) ? state.pendingPhotoFiles : [];
}

function hasPendingPhotoFile() {
  return pendingPhotoFiles().length > 0;
}

function clearPhotoInputs() {
  state.pendingPhotoFiles = [];
  photoFileInputs().forEach((input) => { input.value = ""; });
}

function showOfflinePhotoUploadBlocked() {
  clearPhotoInputs();
  setPhotoStatus(PHOTO_UPLOAD_OFFLINE_MESSAGE, "error");
  setMessage($("#form-message"), PHOTO_UPLOAD_OFFLINE_MESSAGE, "error");
}

function setPhotoInputsDisabled(disabled) {
  photoFileInputs().forEach((input) => { input.disabled = disabled; });
}

function handlePhotoInputChange(event) {
  const changedInput = event.currentTarget;
  state.pendingPhotoFiles = Array.from(changedInput?.files || []);
  photoFileInputs().forEach((input) => {
    if (input !== changedInput) input.value = "";
  });
  if (isLocalOfflineDraft()) {
    if (!hasPendingPhotoFile()) return updatePhotoStatusFromInput();
    setPhotoStatus("Сохраняю фото в телефоне...", "pending");
    ensurePendingPhotoSaved("выбором фото").catch((e) => setMessage($("#form-message"), userFacingError(e), "error"));
    return;
  }
  if (!navigator.onLine) {
    showOfflinePhotoUploadBlocked();
    return;
  }
  if (!hasPendingPhotoFile()) return updatePhotoStatusFromInput();
  setPhotoStatus(state.selected?.id ? "Фото выбрано. Начинаю загрузку..." : "Сначала сохраняю черновик...", "pending");
  ensurePendingPhotoSaved("выбором фото").catch((e) => setMessage($("#form-message"), userFacingError(e), "error"));
}

function setPhotoStatus(text, type = "") {
  const box = photoStatusElement();
  if (!box) return;
  box.textContent = text || "";
  box.className = `photo-status ${type}`.trim();
}

function updatePhotoStatusFromInput() {
  if (state.photoUploadPromise) return;
  if (isLocalOfflineDraft()) {
    if (hasPendingPhotoFile()) return setPhotoStatus("Сохраняю фото в телефоне...", "pending");
    if (selectedPhotos().length) return setPhotoStatus(`${offlineDraftPhotoMessage()} Всего: ${selectedPhotos().length}.`, "ok");
    return setPhotoStatus(offlineDraftPhotoMessage(), "ok");
  }
  if (hasPendingPhotoFile()) return setPhotoStatus(state.selected?.id ? "Фото выбрано. Начинаю загрузку..." : "Сначала сохраняю черновик...", "pending");
  if (selectedPhotos().length) return setPhotoStatus(`Фото сохранены: ${selectedPhotos().length}.`, "ok");
  setPhotoStatus("Фото не выбрано.");
}

async function ensurePendingPhotoSaved(actionLabel = "переходом дальше") {
  if (state.photoUploadPromise) {
    try {
      await state.photoUploadPromise;
      return true;
    } catch (error) {
      const message = userFacingError(error) === PHOTO_DRAFT_SAVE_REQUIRED_MESSAGE ? PHOTO_DRAFT_SAVE_REQUIRED_MESSAGE : `Фото не сохранено: ${userFacingError(error)}`;
      setMessage($("#form-message"), message, "error");
      setPhotoStatus(userFacingError(error) === PHOTO_DRAFT_SAVE_REQUIRED_MESSAGE ? PHOTO_DRAFT_SAVE_REQUIRED_MESSAGE : "Фото не сохранено. Попробуйте ещё раз.", "error");
      return false;
    }
  }
  if (!hasPendingPhotoFile()) return true;
  if (isLocalOfflineDraft()) {
    try {
      setPhotoStatus("Сохраняю фото в телефоне...", "pending");
      state.photoUploadPromise = uploadPhoto({ auto: true });
      const savedPhotos = await state.photoUploadPromise;
      const savedCount = Array.isArray(savedPhotos) ? savedPhotos.length : 0;
      if (savedCount <= 0) return false;
      setMessage($("#form-message"), `Фото сохранены в телефоне: ${savedCount}.`, "ok");
      return true;
    } catch (error) {
      setMessage($("#form-message"), `Фото не сохранено в телефоне: ${userFacingError(error)}`, "error");
      setPhotoStatus("Фото не сохранено в телефоне. Попробуйте ещё раз.", "error");
      return false;
    } finally {
      state.photoUploadPromise = null;
    }
  }
  if (!navigator.onLine) {
    showOfflinePhotoUploadBlocked();
    return false;
  }
  try {
    setPhotoStatus(state.selected?.id ? "Фото выбрано. Начинаю загрузку..." : "Сначала сохраняю черновик...", "pending");
    setMessage($("#form-message"), state.selected?.id ? "Сохраняю выбранные фото..." : "Сначала сохраняю черновик...");
    state.photoUploadPromise = uploadPhoto({ auto: true });
    const savedPhotos = await state.photoUploadPromise;
    const savedCount = Array.isArray(savedPhotos) ? savedPhotos.length : 1;
    if (savedCount <= 0) return false;
    setMessage($("#form-message"), `Фото сохранены: ${savedCount}.`, "ok");
    return true;
  } catch (error) {
    const errorText = userFacingError(error);
    const message = errorText === PHOTO_DRAFT_SAVE_REQUIRED_MESSAGE ? PHOTO_DRAFT_SAVE_REQUIRED_MESSAGE : `Фото не сохранено: ${errorText}`;
    setMessage($("#form-message"), message, "error");
    if (!photoStatusElement()?.classList.contains("error")) {
      setPhotoStatus(errorText === PHOTO_DRAFT_SAVE_REQUIRED_MESSAGE ? PHOTO_DRAFT_SAVE_REQUIRED_MESSAGE : "Фото не сохранено. Проверьте интернет и повторите загрузку.", "error");
    }
    return false;
  } finally {
    state.photoUploadPromise = null;
  }
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
  if (isLocalOfflineDraft()) {
    const note = `<div class="photo-scope-note"><b>Фото этого TEMP-черновика:</b> ${title}. ${escapeHtml(offlineDraftPhotoMessage())}</div>`;
    if (!photos.length) {
      box.innerHTML = `${note}<p class="muted-text">Локальные фото ещё не добавлены.</p>`;
      updatePhotoStatusFromInput();
      return;
    }
    box.innerHTML = `${note}${photos.map((p) => {
      const previewUrl = localPhotoObjectUrl(p);
      const createdAt = formatOfflineDraftDate(p.created_at);
      return `
    <div class="photo-card" data-photo-id="${escapeHtml(p.local_photo_id)}" data-local-draft-id="${escapeHtml(p.local_draft_id)}">
      ${previewUrl ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(p.photo_type || "Фото")}" loading="lazy" />` : `<div style="aspect-ratio:4/3;display:grid;place-items:center;background:#e5e7eb;">Фото</div>`}
      <div class="photo-card-body">
        <b>${escapeHtml(p.photo_type || "Фото")}</b>
        <span>${escapeHtml(formatPhotoSize(p.size_bytes))}</span>
        <span>${escapeHtml(createdAt)}</span>
        <span>${escapeHtml(p.sync_status === "synced" ? "Отправлено в Supabase" : p.sync_status === "sync_error" ? `Ошибка отправки: ${p.last_sync_error || p.sync_error || "повторите"}` : "Только в телефоне")}</span>
        <button type="button" class="btn danger photo-delete-btn" data-delete-photo-id="${escapeHtml(p.local_photo_id)}">Удалить с телефона</button>
      </div>
    </div>`;
    }).join("")}`;
    updatePhotoStatusFromInput();
    return;
  }
  const hiddenNote = state.hiddenForeignPhotos > 0 ? ` <span class="photo-warning">Скрыто чужих/старых записей: ${state.hiddenForeignPhotos}.</span>` : "";
  const note = `<div class="photo-scope-note"><b>Фото этого замера:</b> ${title}. Фото из других карточек здесь не показываются.${hiddenNote}</div>`;
  if (!state.selected.id) {
    box.innerHTML = `${note}<p class="muted-text">Сначала сохраните черновик, потом можно прикреплять фото.</p>`;
    updatePhotoStatusFromInput();
    return;
  }
  if (!photos.length) {
    box.innerHTML = `${note}<p class="muted-text">Фото ещё не загружены для этого замера.</p>`;
    updatePhotoStatusFromInput();
    return;
  }
  box.innerHTML = `${note}${photos.map((p) => {
    const filePath = p.file_path || "";
    const titleText = p.photo_type || "Фото";
    const media = p.url
      ? renderPhotoImage(p.url, titleText, filePath)
      : `<div class="photo-media is-error">${renderPhotoFallback("Фото есть в базе, но файл недоступен в Storage", filePath)}</div>`;
    return `
    <div class="photo-card" data-photo-id="${escapeHtml(p.id)}" data-measurement-id="${escapeHtml(p.measurement_id)}">
      ${media}
      <div class="photo-card-body">
        <b>${escapeHtml(titleText)}</b>
        <span class="photo-path">${escapeHtml(filePath)}</span>
        <button type="button" class="btn danger photo-delete-btn" data-delete-photo-id="${escapeHtml(p.id)}">Убрать фото из этого замера</button>
      </div>
    </div>`;
  }).join("")}`;
  updatePhotoStatusFromInput();
}

async function uploadSinglePhotoFile(file, photoType, selectedId, index, total) {
  setPhotoStatus(`Загружаю фото ${index + 1} из ${total}...`, "loading");
  setMessage($("#form-message"), `Загружаю фото ${index + 1} из ${total}...`);
  const ext = safeExt(file.name);
  const path = `${state.selected.number || "measurement"}_${selectedId}/${Date.now()}_${index + 1}_${safeSlug(photoType)}.${ext}`;
  const { error: uploadError } = await supabaseClient.storage.from("measurement-photos").upload(path, file, { upsert: false });
  if (uploadError) throw uploadError;

  const { data: insertedPhoto, error } = await supabaseClient
    .from("measurement_photos")
    .insert({ measurement_id: selectedId, photo_type: photoType, file_path: path, is_required: true, added_by: state.user.id })
    .select("*")
    .single();
  if (error) {
    await supabaseClient.storage.from("measurement-photos").remove([path]).catch(() => {});
    throw error;
  }
  if (!insertedPhoto?.id || insertedPhoto.measurement_id !== selectedId || insertedPhoto.file_path !== path) {
    await supabaseClient.storage.from("measurement-photos").remove([path]).catch(() => {});
    throw new Error("Файл загружен, но запись measurement_photos не создана. Повторите загрузку.");
  }
  return insertedPhoto;
}

async function uploadPhoto(options = {}) {
  if (isLocalOfflineDraft()) {
    if (!window.TeksturaOfflineDB?.addOfflinePhoto) {
      setPhotoStatus("IndexedDB недоступен: фото нельзя сохранить в телефоне.", "error");
      setMessage($("#form-message"), "IndexedDB недоступен: фото нельзя сохранить в телефоне.", "error");
      return [];
    }
    const files = pendingPhotoFiles();
    if (!files.length) {
      updatePhotoStatusFromInput();
      return [];
    }
    const photoType = $("#photo-type")?.value || "Другое";
    const savedPhotos = [];
    setPhotoInputsDisabled(true);
    try {
      for (const [index, file] of files.entries()) {
        setPhotoStatus(`Сжимаю и сохраняю фото ${index + 1} из ${files.length} в телефоне...`, "loading");
        const compressed = await compressPhotoForOffline(file);
        const now = new Date().toISOString();
        const photo = {
          local_photo_id: makeLocalPhotoId(),
          local_draft_id: state.selected.local_id,
          temp_number: state.selected.number || "TEMP-001",
          blob: compressed.blob,
          file_name: compressed.fileName,
          mime_type: compressed.mimeType,
          size_bytes: compressed.blob.size,
          photo_type: photoType,
          sync_status: "local_only",
          server_photo_id: null,
          server_file_path: "",
          synced_at: "",
          sync_error: "",
          last_sync_error: "",
          created_at: now,
          updated_at: now,
        };
        await window.TeksturaOfflineDB.addOfflinePhoto(photo);
        savedPhotos.push(photo);
      }
      state.photos = await listLocalOfflinePhotos(state.selected.local_id);
      state.photoScopeId = state.selected.local_id;
      clearPhotoInputs();
      renderPhotos();
      renderChecks();
      setPhotoStatus(`Фото сохранены в телефоне: ${savedPhotos.length}.`, "ok");
      if (!options.auto) setMessage($("#form-message"), `Фото сохранены в телефоне: ${savedPhotos.length}.`, "ok");
      return savedPhotos;
    } catch (error) {
      state.pendingPhotoFiles = files.slice(savedPhotos.length);
      const status = `Фото не сохранены в телефоне: ${savedPhotos.length} из ${files.length}. Ошибка: ${userFacingError(error)}`;
      setPhotoStatus(status, "error");
      setMessage($("#form-message"), status, "error");
      throw error;
    } finally {
      setPhotoInputsDisabled(false);
    }
  }
  if (!navigator.onLine) {
    showOfflinePhotoUploadBlocked();
    return [];
  }
  if (!supabaseClient) {
    showOfflineState();
    return [];
  }
  const files = pendingPhotoFiles();
  if (!files.length) {
    updatePhotoStatusFromInput();
    return setMessage($("#form-message"), "Выберите фото.", "error");
  }
  const photoType = $("#photo-type")?.value || "Другое";
  if (!state.selected?.id) {
    setPhotoStatus("Сначала сохраняю черновик...", "pending");
    setMessage($("#form-message"), "Сначала сохраняю черновик...");
    let saved = null;
    try {
      saved = await saveMeasurement({ skipPendingPhotoUpload: true });
    } catch (error) {
      console.warn("Photo draft save failed", error);
    }
    if (!saved || !state.selected?.id) {
      setPhotoStatus(PHOTO_DRAFT_SAVE_REQUIRED_MESSAGE, "error");
      setMessage($("#form-message"), PHOTO_DRAFT_SAVE_REQUIRED_MESSAGE, "error");
      throw new Error(PHOTO_DRAFT_SAVE_REQUIRED_MESSAGE);
    }
  }
  const selectedId = state.selected?.id;
  if (!selectedId) throw new Error("Замер не сохранён — фото нельзя привязать к measurement_photos.");

  const savedPhotos = [];
  setPhotoInputsDisabled(true);
  try {
    for (const [index, file] of files.entries()) {
      savedPhotos.push(await uploadSinglePhotoFile(file, photoType, selectedId, index, files.length));
    }
    await loadPhotos(selectedId);
    const missingPhoto = savedPhotos.find((photo) => !selectedPhotos().some((item) => item.id === photo.id || item.file_path === photo.file_path));
    if (missingPhoto) {
      throw new Error("Фото не найдено в measurement_photos после сохранения. Обновите страницу и повторите загрузку.");
    }
    clearPhotoInputs();
    renderPhotos();
    renderChecks();
    setPhotoStatus(`Фото сохранены: ${savedPhotos.length}.`, "ok");
    if (!options.auto) setMessage($("#form-message"), `Фото сохранены: ${savedPhotos.length}.`, "ok");
    return savedPhotos;
  } catch (error) {
    state.pendingPhotoFiles = files.slice(savedPhotos.length);
    const status = `Фото не сохранены: ${savedPhotos.length} из ${files.length}. Ошибка: ${userFacingError(error)}`;
    setPhotoStatus(status, "error");
    setMessage($("#form-message"), status, "error");
    throw error;
  } finally {
    setPhotoInputsDisabled(false);
  }
}

async function deletePhoto(photoId) {
  if (isLocalOfflineDraft()) {
    if (!photoId) return;
    const photo = selectedPhotos().find((item) => item.local_photo_id === photoId);
    if (!photo) return setMessage($("#form-message"), "Это локальное фото не относится к открытому TEMP-черновику.", "error");
    if (!confirm(`Удалить фото «${photo.photo_type || "Фото"}» только с этого телефона?`)) return;
    await window.TeksturaOfflineDB?.deleteOfflinePhoto?.(photoId);
    state.photos = await listLocalOfflinePhotos(state.selected.local_id);
    state.photoScopeId = state.selected.local_id;
    renderPhotos();
    renderChecks();
    setMessage($("#form-message"), "Локальное фото удалено с телефона.", "ok");
    return;
  }
  if (!supabaseClient || !navigator.onLine) {
    showOfflineState();
    return;
  }
  if (!state.selected?.id || !photoId) return;
  const photo = selectedPhotos().find((item) => item.id === photoId);
  if (!photo) return setMessage($("#form-message"), "Это фото не относится к открытому замеру.", "error");
  if (!confirm(`Удалить фото «${photo.photo_type || "Фото"}» из этого замера?`)) return;
  setMessage($("#form-message"), "Удаляю фото...");
  const { error: deleteLinkError } = await supabaseClient
    .from("measurement_photos")
    .delete()
    .eq("id", photoId)
    .eq("measurement_id", state.selected.id);

  if (deleteLinkError) {
    const message = String(deleteLinkError.message || "").toLowerCase();
    const details = String(deleteLinkError.details || "").toLowerCase();
    const denied = message.includes("permission denied") || message.includes("rls") || details.includes("permission denied") || details.includes("rls");
    if (denied) {
      setMessage($("#form-message"), "Нет прав Supabase на удаление фото. Нужна настройка RLS для measurement_photos/storage.objects.", "error");
      return;
    }
    throw deleteLinkError;
  }

  if (photo.file_path) {
    const { error: storageError } = await supabaseClient.storage.from("measurement-photos").remove([photo.file_path]);
    if (storageError) {
      const storageMessage = String(storageError.message || "").toLowerCase();
      const missingObject = storageMessage.includes("not found") || storageMessage.includes("no such") || storageMessage.includes("404");
      if (!missingObject) console.warn("Не удалось удалить файл из storage", storageError);
    }
  }

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
  if (photos.length) {
    add("ok", `Фото текущего замера: ${photos.length}`);
  } else if (hasPendingPhotoFile()) {
    add("warn", "Фото выбрано, но ещё не сохранено в measurement_photos");
  } else {
    add("warn", "Фото не добавлены — это пока не блокирует принятие");
  }

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
  $("#login-btn").addEventListener("click", () => login().catch((e) => setMessage($("#auth-message"), userFacingError(e), "error")));
  $("#signup-btn").addEventListener("click", () => signup().catch((e) => setMessage($("#auth-message"), userFacingError(e), "error")));
  $("#copy-share-btn")?.addEventListener("click", () => copyShareInvite().catch(() => {
    const text = shareInviteText($("#share-login")?.value);
    showShareFallback(text);
    setMessage($("#share-message"), "Автокопирование недоступно. Скопируйте текст из поля ниже вручную.", "error");
  }));
  $("#logout-btn").addEventListener("click", logout);
  $("#new-measurement-btn").addEventListener("click", showNewMeasurementModePicker);
  $("#open-measurements-btn").addEventListener("click", openMeasurementsScreen);
  $("#close-measurements-btn").addEventListener("click", closeMeasurementsScreen);
  $("#refresh-btn").addEventListener("click", () => refreshAppData().catch((e) => setMessage($("#form-message"), userFacingError(e), "error")));
  $("#offline-retry-btn")?.addEventListener("click", () => refreshAppData().catch((e) => showOfflineState(userFacingError(e))));
  $("#create-offline-draft-btn")?.addEventListener("click", () => createLocalOfflineDraft().catch((e) => setMessage($("#form-message"), userFacingError(e), "error")));
  $("#offline-drafts-list")?.addEventListener("click", (event) => {
    const syncId = event.target.closest("[data-sync-offline-draft]")?.dataset.syncOfflineDraft;
    const photoSyncId = event.target.closest("[data-sync-offline-photos]")?.dataset.syncOfflinePhotos;
    const openId = event.target.closest("[data-open-offline-draft]")?.dataset.openOfflineDraft;
    const deleteId = event.target.closest("[data-delete-offline-draft]")?.dataset.deleteOfflineDraft;
    if (syncId) syncOfflineDraft(syncId).catch((e) => setMessage($("#form-message"), userFacingError(e), "error"));
    if (photoSyncId) syncOfflineDraftPhotos(photoSyncId).catch((e) => setMessage($("#form-message"), userFacingError(e), "error"));
    if (openId) openOfflineDraft(openId).catch((e) => setMessage($("#form-message"), userFacingError(e), "error"));
    if (deleteId) deleteLocalOfflineDraft(deleteId).catch((e) => setMessage($("#form-message"), userFacingError(e), "error"));
  });
  $("#status-filter").addEventListener("change", renderList);
  $("#measurement-search").addEventListener("input", renderList);
  $("#trash-select-all-btn")?.addEventListener("click", selectVisibleTrashMeasurements);
  $("#trash-clear-selection-btn")?.addEventListener("click", clearTrashSelection);
  $("#trash-delete-selected-btn")?.addEventListener("click", () => deleteSelectedTrashMeasurements().catch((e) => setTrashActionsMessage(`Не удалось удалить выбранные замеры: ${userFacingError(e)}`, "error")));
  $("#trash-clear-all-btn")?.addEventListener("click", () => clearTrashMeasurements().catch((e) => setTrashActionsMessage(`Не удалось очистить корзину: ${userFacingError(e)}`, "error")));
  $("#measurement-preview").addEventListener("click", (event) => {
    if (event.target.closest("[data-open-measurements]")) openMeasurementsScreen();
    if (event.target.closest("[data-edit-measurement]")) editSelectedMeasurement();
    if (event.target.closest("[data-trash-measurement]")) moveSelectedMeasurementToTrash().catch((e) => setMessage($("#form-message"), `Не удалось удалить замер: ${userFacingError(e)}`, "error"));
    if (event.target.closest("[data-restore-measurement]")) restoreSelectedMeasurementFromTrash().catch((e) => setMessage($("#form-message"), `Не удалось восстановить замер: ${userFacingError(e)}`, "error"));
    if (event.target.closest("[data-permanent-delete-measurement]")) permanentDeleteSelectedMeasurement().catch((e) => setMessage($("#form-message"), `Не удалось удалить замер: ${userFacingError(e)}`, "error"));
    if (event.target.closest("[data-print-preview]")) window.print();
  });
  $("#measurement-form").addEventListener("submit", (event) => { event.preventDefault(); saveMeasurement().catch((e) => setMessage($("#form-message"), userFacingError(e), "error")); });
  $("#measurement-form").addEventListener("input", scheduleOfflineDraftAutosave);
  $("#measurement-form").addEventListener("change", scheduleOfflineDraftAutosave);
  window.addEventListener("beforeunload", () => { if (isLocalOfflineDraft()) saveLocalOfflineDraftNow({ silent: true }); });
  photoFileInputs().forEach((input) => input.addEventListener("change", handlePhotoInputChange));
  $("#photos-list").addEventListener("click", (event) => {
    const id = event.target.closest("[data-delete-photo-id]")?.dataset.deletePhotoId;
    if (id) deletePhoto(id).catch((e) => setMessage($("#form-message"), userFacingError(e), "error"));
  });
  $("#send-review-btn").addEventListener("click", async () => {
    try {
      if (isLocalOfflineDraft()) { setMessage($("#form-message"), offlineDraftMessage(), "error"); return; }
      const saved = await saveMeasurement({ requireClientFields: true, actionLabel: "отправкой на проверку" });
      if (!saved) return;
      if (!requireWorkflowReady("отправкой на проверку")) return;
      await setStatus("На проверке", {}, { requireClientFields: true, actionLabel: "отправкой на проверку" });
      setMessage($("#form-message"), "Замер отправлен на проверку.", "ok");
    } catch (e) {
      setMessage($("#form-message"), userFacingError(e), "error");
    }
  });
  $("#accept-btn").addEventListener("click", async () => {
    try {
      if (isLocalOfflineDraft()) { setMessage($("#form-message"), offlineDraftMessage(), "error"); return; }
      if (!canAcceptMeasurements()) { setMessage($("#form-message"), "У вашей роли нет права принимать замер. Отправьте его на проверку.", "error"); return; }
      const saved = await saveMeasurement({ requireClientFields: true, actionLabel: "принятием замера" });
      if (!saved) return;
      if (!requireWorkflowReady("принятием замера")) return;
      await setStatus("Готовый замер", { checked_by: state.user.id, checked_at: new Date().toISOString() });
      setMessage($("#form-message"), "Замер принят и сохранён.", "ok");
    } catch (e) {
      setMessage($("#form-message"), userFacingError(e), "error");
    }
  });
  $("#archive-btn").addEventListener("click", () => {
    if (isLocalOfflineDraft()) { setMessage($("#form-message"), offlineDraftMessage(), "error"); return; }
    if (!canArchiveMeasurements()) { setMessage($("#form-message"), "Архивирование доступно только администратору/руководителю.", "error"); return; }
    if (!confirm("Перенести этот замер в архив?")) return;
    setStatus("Архив", { is_archived: true, archived_at: new Date().toISOString(), archived_by: state.user.id }).catch((e) => setMessage($("#form-message"), userFacingError(e), "error"));
  });
  $("#soft-delete-btn").addEventListener("click", () => {
    moveSelectedMeasurementToTrash().catch((e) => setMessage($("#form-message"), `Не удалось удалить замер: ${userFacingError(e)}`, "error"));
  });
  $("#restore-measurement-btn")?.addEventListener("click", () => {
    restoreSelectedMeasurementFromTrash().catch((e) => setMessage($("#form-message"), `Не удалось восстановить замер: ${userFacingError(e)}`, "error"));
  });
  $("#permanent-delete-btn")?.addEventListener("click", () => {
    permanentDeleteSelectedMeasurement().catch((e) => setMessage($("#form-message"), `Не удалось удалить замер: ${userFacingError(e)}`, "error"));
  });
  $("#download-json-btn").addEventListener("click", downloadJson);
  $("#download-csv-btn").addEventListener("click", downloadCsv);
  $("#production-link")?.addEventListener("click", (event) => {
    if (!isLocalOfflineDraft()) return;
    event.preventDefault();
    setMessage($("#form-message"), offlineDraftMessage(), "error");
  });
  $("#offline-healthcheck-btn")?.addEventListener("click", async () => {
    const output = $("#offline-healthcheck-result");
    if (output) output.textContent = "Проверяю...";
    try {
      const report = await buildOfflineHealthcheckReport();
      if (output) output.textContent = report;
    } catch (error) {
      if (output) output.textContent = `Проверка не выполнена: ${userFacingError(error)}`;
    }
  });
  $("#measurement-form").addEventListener("input", renderChecks);
  $$("[data-measurement-mode]").forEach((button) => {
    button.addEventListener("click", () => setMeasurementMode(button.dataset.measurementMode));
  });
  $$(".tab").forEach((tab) => tab.addEventListener("click", () => requestActivateTab(tab.dataset.tab).catch((e) => setMessage($("#form-message"), userFacingError(e), "error"))));
}

bindNetworkIndicator();
registerServiceWorker();
bind();
updateRememberedAuthStatus();
init().catch((e) => { console.error(e); setMessage($("#auth-message"), userFacingError(e), "error"); });
