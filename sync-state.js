(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TeksturaSyncState = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const STALE_TIMEOUT_MS = 5 * 60 * 1000;
  const STATUS = Object.freeze({
    LOCAL_ONLY: "local_only",
    PENDING: "pending",
    SYNCING: "syncing",
    SYNCED: "synced",
    ERROR: "sync_error",
    RETRY: "retry",
  });
  const RETRYABLE_STATUSES = new Set([STATUS.LOCAL_ONLY, STATUS.PENDING, STATUS.ERROR, STATUS.RETRY, "error"]);
  const STALE_RECOVERY_ERROR = "Предыдущая синхронизация была прервана. Перед повтором будет проверено состояние Supabase.";

  function timestamp(value) {
    const parsed = Date.parse(value || "");
    return Number.isFinite(parsed) ? parsed : null;
  }

  function operationId(record = {}, kind = "measurement") {
    if (record.sync_operation_id) return String(record.sync_operation_id);
    if (kind === "photo") return String(record.local_photo_id || "");
    return String(record.local_id || "");
  }

  function hasServerCompletionEvidence(record = {}, kind = "measurement") {
    if (kind === "photo") {
      return Boolean(
        record.server_photo_id
        && record.server_file_path
        && (record.server_measurement_id || record.measurement_id)
      );
    }
    return Boolean(record.server_id);
  }

  function photoServerMeasurementMatches(record = {}, measurementId) {
    const recorded = record.server_measurement_id || record.measurement_id;
    return Boolean(recorded && measurementId && String(recorded) === String(measurementId));
  }

  function isStaleSyncing(record = {}, now = Date.now(), timeoutMs = STALE_TIMEOUT_MS) {
    if (record.sync_status !== STATUS.SYNCING) return false;
    const startedAt = timestamp(record.sync_attempt_started_at);
    if (startedAt === null) return true;
    return Number(now) - startedAt >= timeoutMs;
  }

  function millisecondsUntilStale(record = {}, now = Date.now(), timeoutMs = STALE_TIMEOUT_MS) {
    if (record.sync_status !== STATUS.SYNCING) return null;
    const startedAt = timestamp(record.sync_attempt_started_at);
    if (startedAt === null) return 0;
    return Math.max(0, timeoutMs - (Number(now) - startedAt));
  }

  function isRetryable(record = {}, now = Date.now(), timeoutMs = STALE_TIMEOUT_MS) {
    return RETRYABLE_STATUSES.has(record.sync_status || STATUS.LOCAL_ONLY)
      || isStaleSyncing(record, now, timeoutMs);
  }

  function beginAttempt(record = {}, options = {}) {
    const now = options.now || new Date().toISOString();
    const kind = options.kind || "measurement";
    return {
      ...record,
      sync_operation_id: operationId(record, kind),
      sync_status: STATUS.SYNCING,
      sync_attempt_started_at: now,
      sync_attempt_count: Number(record.sync_attempt_count || 0) + 1,
      sync_error: "",
    };
  }

  function completeAttempt(record = {}, serverFields = {}, options = {}) {
    return {
      ...record,
      ...serverFields,
      sync_status: STATUS.SYNCED,
      sync_error: "",
      synced_at: options.now || new Date().toISOString(),
    };
  }

  function failAttempt(record = {}, error, options = {}) {
    const message = error?.message || String(error || "Неизвестная ошибка синхронизации");
    return {
      ...record,
      sync_status: STATUS.ERROR,
      sync_error: message,
      last_sync_error: message,
      sync_failed_at: options.now || new Date().toISOString(),
    };
  }

  function recoverStale(record = {}, options = {}) {
    const kind = options.kind || "measurement";
    const nowMs = options.nowMs ?? Date.now();
    if (!isStaleSyncing(record, nowMs, options.timeoutMs || STALE_TIMEOUT_MS)) {
      return { record, changed: false, reason: "not_stale" };
    }
    const completionEvidence = typeof options.completionEvidence === "function"
      ? options.completionEvidence(record)
      : hasServerCompletionEvidence(record, kind);
    if (completionEvidence) {
      const completed = completeAttempt(record, {}, { now: options.now || new Date(nowMs).toISOString() });
      return { record: completed, changed: true, reason: "local_completion_evidence" };
    }
    const message = record.last_sync_error || record.sync_error || STALE_RECOVERY_ERROR;
    return {
      record: {
        ...record,
        sync_status: STATUS.ERROR,
        sync_error: message,
        last_sync_error: message,
        stale_recovered_at: options.now || new Date(nowMs).toISOString(),
      },
      changed: true,
      reason: "stale_retryable",
    };
  }

  function reconcileCandidates(candidates = [], predicate = () => true) {
    const matches = (candidates || []).filter(predicate);
    if (matches.length === 0) return { outcome: "absent", value: null, matches };
    if (matches.length === 1) return { outcome: "found", value: matches[0], matches };
    return { outcome: "ambiguous", value: null, matches };
  }

  function storageListContainsExactName(items = [], fileName) {
    const expected = String(fileName || "");
    return Boolean(expected && (items || []).some((item) => String(item?.name || "") === expected));
  }

  async function reconcileBeforeCreate(options = {}) {
    const candidates = await options.findExisting();
    const result = reconcileCandidates(candidates, options.matches);
    if (result.outcome === "found") return { value: result.value, reused: true };
    if (result.outcome === "ambiguous") {
      throw new Error(options.ambiguousMessage || "Сверка Supabase неоднозначна; автоматическое создание остановлено.");
    }
    return { value: await options.create(), reused: false };
  }

  function createMeasurementCoordinator(options = {}) {
    const inFlight = new Map();
    const webLocks = options.webLocks === undefined
      ? (typeof navigator !== "undefined" ? navigator.locks : null)
      : options.webLocks;
    const prefix = options.prefix || "tekstura-measurement-sync";

    function run(localMeasurementId, task) {
      const key = String(localMeasurementId || "");
      if (!key) return Promise.reject(new Error("Для синхронизации нужен local measurement id."));
      if (inFlight.has(key)) return inFlight.get(key);
      const execute = () => Promise.resolve().then(task);
      const promise = webLocks?.request
        ? webLocks.request(`${prefix}:${key}`, execute)
        : execute();
      const tracked = Promise.resolve(promise).finally(() => {
        if (inFlight.get(key) === tracked) inFlight.delete(key);
      });
      inFlight.set(key, tracked);
      return tracked;
    }

    return { run, isLocked: (key) => inFlight.has(String(key || "")) };
  }

  return Object.freeze({
    STALE_TIMEOUT_MS,
    STATUS,
    STALE_RECOVERY_ERROR,
    beginAttempt,
    completeAttempt,
    createMeasurementCoordinator,
    failAttempt,
    hasServerCompletionEvidence,
    isRetryable,
    isStaleSyncing,
    millisecondsUntilStale,
    operationId,
    photoServerMeasurementMatches,
    reconcileBeforeCreate,
    reconcileCandidates,
    recoverStale,
    storageListContainsExactName,
  });
});
