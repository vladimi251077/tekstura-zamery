(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TeksturaDeletionSafety = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CLASSIFICATION = Object.freeze({
    SAFE_TO_DELETE: "SAFE_TO_DELETE",
    REQUIRES_CONFIRMATION: "REQUIRES_CONFIRMATION",
    BLOCKED_UNTIL_SYNC_OR_EXPORT: "BLOCKED_UNTIL_SYNC_OR_EXPORT",
  });
  const CONFIRMATION_PHRASE = "УДАЛИТЬ БЕЗ ВОССТАНОВЛЕНИЯ";

  function normalizedStatus(record) {
    return String(record?.sync_status || record?.status || "").trim().toLowerCase();
  }

  function hasRetryableData(record) {
    const status = normalizedStatus(record);
    if (status === "synced") return false;
    return status === "sync_error" || status === "error" || status === "retry"
      || (!status && Boolean(record?.sync_error || record?.last_sync_error));
  }

  function hasConfirmedMeasurementMapping(measurement) {
    if (!measurement?.local_id) return Boolean(measurement?.id);
    return Boolean(measurement.server_id && (measurement.synced_at || normalizedStatus(measurement) === "synced"));
  }

  function hasConfirmedPhotoStorage(photo, measurementId) {
    const photoMeasurementId = photo?.server_measurement_id || photo?.measurement_id;
    const hasRemoteIdentity = Boolean(photo?.server_photo_id || photo?.id);
    const hasRemotePath = Boolean(photo?.server_file_path || photo?.file_path);
    const status = normalizedStatus(photo);
    return Boolean(
      hasRemoteIdentity
      && hasRemotePath
      && String(photoMeasurementId || "") === String(measurementId || "")
      && !photo?.blob
      && !photo?.file
      && (!status || status === "synced")
    );
  }

  function photoIsUnsynced(photo, measurementId) {
    return !hasConfirmedPhotoStorage(photo, measurementId);
  }

  function classifyMeasurement(input = {}) {
    const measurement = input.measurement || {};
    const photos = input.photos || [];
    const measurementId = measurement.server_id || measurement.id;
    const reasons = [];
    const status = normalizedStatus(measurement);

    if (input.unsavedChanges) reasons.push("Есть несохранённые изменения формы.");
    if (Number(input.pendingPhotoFiles || 0) > 0) reasons.push("Выбранные фото ещё не сохранены.");
    if (input.activeSync || status === "syncing") reasons.push("Синхронизация ещё выполняется.");
    if (status === "pending") reasons.push("Замер ожидает синхронизации.");
    if (hasRetryableData(measurement)) reasons.push("Неудачную синхронизацию ещё можно повторить.");
    if (measurement.local_id && !hasConfirmedMeasurementMapping(measurement)) {
      reasons.push("Замер существует только на этом устройстве.");
    }
    if (!measurement.id && !measurement.local_id) reasons.push("Новый замер ещё не сохранён.");
    if (Number(input.queuedOperations || 0) > 0) reasons.push("Есть незавершённые локальные операции.");

    const unsyncedPhotos = photos.filter((photo) => photoIsUnsynced(photo, measurementId)).length;
    if (unsyncedPhotos > 0) reasons.push(`Не синхронизировано фото: ${unsyncedPhotos}.`);

    if (reasons.length) {
      return {
        classification: CLASSIFICATION.BLOCKED_UNTIL_SYNC_OR_EXPORT,
        reasons,
        unsyncedPhotos,
        localOnly: Boolean(measurement.local_id && !hasConfirmedMeasurementMapping(measurement)),
        syncStatus: status || "unknown",
        recoveryPossible: true,
      };
    }

    return {
      classification: photos.length ? CLASSIFICATION.REQUIRES_CONFIRMATION : CLASSIFICATION.SAFE_TO_DELETE,
      reasons: [],
      unsyncedPhotos: 0,
      localOnly: false,
      syncStatus: status === "synced" ? "synced" : "confirmed_remote",
      recoveryPossible: Boolean(measurement.is_deleted !== true),
    };
  }

  function russianDeletionSummary(result, options = {}) {
    const item = options.itemLabel || "замер";
    const photoCount = Number(options.photoCount || 0);
    const lines = [
      `Будет удалено: ${item}${photoCount ? `; фото: ${photoCount}` : ""}.`,
      result.localOnly ? "Замер существует только на этом устройстве." : "Наличие замера на сервере подтверждено.",
      `Несинхронизированных фото: ${result.unsyncedPhotos}.`,
      `Состояние синхронизации: ${syncStatusLabel(result.syncStatus)}.`,
      result.recoveryPossible ? "До удаления можно сохранить локальную резервную копию." : "После удаления восстановление невозможно.",
    ];
    if (result.reasons.length) lines.push(...result.reasons);
    return lines.join("\n");
  }

  function syncStatusLabel(status) {
    const labels = {
      synced: "синхронизировано",
      confirmed_remote: "данные на сервере подтверждены",
      pending: "ожидает отправки",
      syncing: "выполняется",
      sync_error: "ошибка, возможен повтор",
      error: "ошибка, возможен повтор",
      retry: "ожидает повторной попытки",
      local_only: "только на устройстве",
      unknown: "нет подтверждения завершения",
    };
    return labels[status] || "нет подтверждения завершения";
  }

  function sanitizeValue(value) {
    if (Array.isArray(value)) return value.map(sanitizeValue);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !/(token|secret|password|authorization|cookie|credential|session|api[_-]?key|access[_-]?key|anon[_-]?key)/i.test(key))
      .filter(([key]) => !/(^|[_-])url$/i.test(key))
      .map(([key, nested]) => [key, sanitizeValue(nested)]));
  }

  function buildBackup(input = {}) {
    const measurement = sanitizeValue(input.measurement || {});
    const formData = sanitizeValue(input.formData || {});
    const drawingInputs = sanitizeValue({
      drawing_project_json: input.drawingInputs?.drawing_project_json ?? measurement.drawing_project_json ?? null,
      finish_dimensions_json: input.drawingInputs?.finish_dimensions_json ?? measurement.finish_dimensions_json ?? null,
      drawing_svg: input.drawingInputs?.drawing_svg ?? measurement.drawing_svg ?? "",
    });
    const photos = (input.photos || []).map((photo) => sanitizeValue({
      file_name: photo.file_name || "",
      photo_type: photo.photo_type || "",
      mime_type: photo.mime_type || "",
      size_bytes: Number(photo.size_bytes || photo.blob?.size || 0),
      sync_status: normalizedStatus(photo) || (photo.id ? "synced" : "local_only"),
      binary_included: false,
    }));
    return {
      format: "tekstura-measurement-backup",
      version: 1,
      exported_at: input.exportedAt || new Date().toISOString(),
      measurement,
      form_data: formData,
      drawing_inputs: drawingInputs,
      photos,
      photo_binary_notice: photos.length
        ? "Бинарные файлы локальных фото не включены в JSON. Сохраните их отдельно до удаления."
        : "",
    };
  }

  function restoreBackupInputs(backup = {}) {
    if (backup.format !== "tekstura-measurement-backup") throw new Error("Неподдерживаемый формат резервной копии.");
    return {
      measurement: sanitizeValue(backup.measurement || {}),
      formData: sanitizeValue(backup.form_data || {}),
      drawingInputs: sanitizeValue(backup.drawing_inputs || {}),
    };
  }

  function validatePhotoDeletionOwnership(input = {}) {
    const photo = input.photo;
    const measurementId = String(input.measurementId || "");
    if (!photo || !measurementId || String(photo.measurement_id || photo.server_measurement_id || "") !== measurementId) {
      return { allowed: false, reason: "Фото не принадлежит открытому замеру." };
    }
    const path = String(photo.file_path || photo.server_file_path || "");
    const pathOwnershipConfirmed = typeof input.recordBelongsToMeasurement === "function"
      ? input.recordBelongsToMeasurement(photo, { id: measurementId, number: input.measurementNumber })
      : input.pathBelongsToMeasurement?.(path, measurementId);
    if (!path || pathOwnershipConfirmed !== true) {
      return { allowed: false, reason: "Принадлежность файла не подтверждена." };
    }
    const references = (input.pathReferences || []).filter((candidate) => String(candidate.file_path || "") === path);
    if (references.length !== 1 || String(references[0].measurement_id || "") !== measurementId || String(references[0].id || "") !== String(photo.id || photo.server_photo_id || "")) {
      return { allowed: false, reason: "Файл связан неоднозначно. Удаление остановлено." };
    }
    return { allowed: true, reason: "" };
  }

  function shouldWarnOnNavigation(contexts = []) {
    return contexts.some((context) => classifyMeasurement(context).classification === CLASSIFICATION.BLOCKED_UNTIL_SYNC_OR_EXPORT);
  }

  function canProceedWithDeletion(result, evidence = {}) {
    if (!result || !Object.values(CLASSIFICATION).includes(result.classification)) return false;
    if (result.classification === CLASSIFICATION.BLOCKED_UNTIL_SYNC_OR_EXPORT) {
      return evidence.backupExported === true && evidence.phrase === CONFIRMATION_PHRASE;
    }
    return evidence.confirmed === true;
  }

  return Object.freeze({
    CLASSIFICATION,
    CONFIRMATION_PHRASE,
    buildBackup,
    canProceedWithDeletion,
    classifyMeasurement,
    hasConfirmedPhotoStorage,
    restoreBackupInputs,
    russianDeletionSummary,
    shouldWarnOnNavigation,
    validatePhotoDeletionOwnership,
  });
});
