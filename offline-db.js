(function () {
  "use strict";

  const DB_NAME = "tekstura-offline-shell";
  const DB_VERSION = 3;
  const STORES = {
    metadata: "metadata",
    offlineDrafts: "offline_drafts",
    syncQueue: "sync_queue",
    offlinePhotos: "offline_photos",
  };

  function isSupported() {
    return "indexedDB" in window;
  }

  function ensureObjectStores(db) {
    if (!db.objectStoreNames.contains(STORES.metadata)) {
      db.createObjectStore(STORES.metadata, { keyPath: "key" });
    }
    if (!db.objectStoreNames.contains(STORES.offlineDrafts)) {
      const drafts = db.createObjectStore(STORES.offlineDrafts, { keyPath: "local_id" });
      drafts.createIndex("sync_status", "sync_status", { unique: false });
      drafts.createIndex("created_at", "created_at", { unique: false });
      drafts.createIndex("updated_at", "updated_at", { unique: false });
    }
    if (!db.objectStoreNames.contains(STORES.syncQueue)) {
      const queue = db.createObjectStore(STORES.syncQueue, { keyPath: "queue_id" });
      queue.createIndex("draft_local_id", "draft_local_id", { unique: false });
      queue.createIndex("status", "status", { unique: false });
      queue.createIndex("type", "type", { unique: false });
      queue.createIndex("created_at", "created_at", { unique: false });
    }
    if (!db.objectStoreNames.contains(STORES.offlinePhotos)) {
      const photos = db.createObjectStore(STORES.offlinePhotos, { keyPath: "local_photo_id" });
      photos.createIndex("local_draft_id", "local_draft_id", { unique: false });
      photos.createIndex("temp_number", "temp_number", { unique: false });
      photos.createIndex("sync_status", "sync_status", { unique: false });
      photos.createIndex("created_at", "created_at", { unique: false });
      photos.createIndex("updated_at", "updated_at", { unique: false });
    }
  }

  function openDatabase() {
    if (!isSupported()) return Promise.resolve(null);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        ensureObjectStores(request.result);
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function withStore(storeName, mode, callback) {
    const db = await openDatabase();
    if (!db) return null;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = callback(store);

      transaction.oncomplete = () => resolve(request?.result ?? null);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }).finally(() => db.close());
  }

  async function get(key) {
    const record = await withStore(STORES.metadata, "readonly", (store) => store.get(key));
    return record?.value ?? null;
  }

  function set(key, value) {
    return withStore(STORES.metadata, "readwrite", (store) => store.put({ key, value, updatedAt: new Date().toISOString() }));
  }

  function remove(key) {
    return withStore(STORES.metadata, "readwrite", (store) => store.delete(key));
  }

  function normalizeOfflineDraft(draft = {}) {
    const now = new Date().toISOString();
    return {
      local_id: draft.local_id,
      temp_number: draft.temp_number || "TEMP-001",
      sync_status: draft.sync_status || "local_only",
      sync_error: draft.sync_error || draft.last_sync_error || "",
      last_sync_error: draft.last_sync_error || draft.sync_error || "",
      sync_operation_id: draft.sync_operation_id || draft.local_id || "",
      sync_attempt_started_at: draft.sync_attempt_started_at || "",
      sync_attempt_count: Number(draft.sync_attempt_count || 0),
      server_id: draft.server_id || null,
      server_client_id: draft.server_client_id || null,
      server_number: draft.server_number || "",
      planned_server_number: draft.planned_server_number || draft.server_number || "",
      synced_at: draft.synced_at || "",
      created_at: draft.created_at || now,
      updated_at: draft.updated_at || now,
      form_data: draft.form_data || {},
      drawing_project_json: draft.drawing_project_json || {},
      finish_dimensions_json: draft.finish_dimensions_json || {},
      drawing_svg: draft.drawing_svg || "",
      measurer_name: draft.measurer_name || "",
      measurer_login: draft.measurer_login || "",
      ...draft,
    };
  }

  function normalizeOfflinePhoto(photo = {}) {
    const now = new Date().toISOString();
    return {
      local_photo_id: photo.local_photo_id,
      local_draft_id: photo.local_draft_id,
      temp_number: photo.temp_number || "TEMP-001",
      local_measurement_id: photo.local_measurement_id || photo.local_draft_id || null,
      measurement_id: photo.measurement_id || photo.server_measurement_id || null,
      server_measurement_id: photo.server_measurement_id || photo.measurement_id || null,
      blob: photo.blob,
      file_name: photo.file_name || "photo.jpg",
      mime_type: photo.mime_type || photo.blob?.type || "image/jpeg",
      size_bytes: Number(photo.size_bytes || photo.blob?.size || 0),
      photo_type: photo.photo_type || "Другое",
      sync_status: photo.sync_status || "local_only",
      server_photo_id: photo.server_photo_id || null,
      server_file_path: photo.server_file_path || "",
      synced_at: photo.synced_at || "",
      sync_error: photo.sync_error || photo.last_sync_error || "",
      last_sync_error: photo.last_sync_error || photo.sync_error || "",
      sync_operation_id: photo.sync_operation_id || photo.local_photo_id || "",
      sync_attempt_started_at: photo.sync_attempt_started_at || "",
      sync_attempt_count: Number(photo.sync_attempt_count || 0),
      created_at: photo.created_at || now,
      updated_at: photo.updated_at || now,
      ...photo,
    };
  }

  function addOfflinePhoto(photo) {
    return withStore(STORES.offlinePhotos, "readwrite", (store) => store.put(normalizeOfflinePhoto(photo)));
  }

  function putOfflinePhoto(photo) {
    return withStore(STORES.offlinePhotos, "readwrite", (store) => store.put(normalizeOfflinePhoto(photo)));
  }

  async function listOfflinePhotosByDraft(localDraftId) {
    if (!localDraftId) return [];
    const photos = await withStore(STORES.offlinePhotos, "readonly", (store) => store.index("local_draft_id").getAll(localDraftId));
    return (photos || []).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }

  async function deleteOfflinePhotoSafely(localPhotoId, localDraftId) {
    if (!localPhotoId || !localDraftId) throw new Error("Локальное фото не найдено.");
    const db = await openDatabase();
    if (!db) throw new Error("Локальное хранилище недоступно.");
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.offlinePhotos, STORES.syncQueue], "readwrite");
      const photos = transaction.objectStore(STORES.offlinePhotos);
      const queue = transaction.objectStore(STORES.syncQueue);
      let ownershipConfirmed = false;
      let queueOwnershipAmbiguous = false;
      const photoRequest = photos.get(localPhotoId);
      photoRequest.onsuccess = () => {
        const photo = photoRequest.result;
        if (!photo || String(photo.local_draft_id || "") !== String(localDraftId)) {
          transaction.abort();
          return;
        }
        ownershipConfirmed = true;
        const queueRequest = queue.openCursor();
        queueRequest.onsuccess = () => {
          const cursor = queueRequest.result;
          if (!cursor) {
            photos.delete(localPhotoId);
            return;
          }
          const operation = cursor.value || {};
          const payload = operation.payload || {};
          const belongsToPhoto = String(operation.local_photo_id || payload.local_photo_id || "") === String(localPhotoId);
          const belongsToDraft = String(operation.draft_local_id || payload.local_draft_id || "") === String(localDraftId);
          const isPhotoOperation = String(operation.type || "").toLowerCase().includes("photo");
          if (belongsToPhoto) {
            cursor.delete();
          } else if (belongsToDraft && isPhotoOperation) {
            queueOwnershipAmbiguous = true;
            transaction.abort();
            return;
          }
          cursor.continue();
        };
      };
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error || new Error("Не удалось отменить локальную операцию фото."));
      transaction.onabort = () => reject(ownershipConfirmed
        ? (transaction.error || new Error(queueOwnershipAmbiguous
          ? "Связанная операция фото определена неоднозначно. Удаление остановлено."
          : "Не удалось безопасно удалить локальное фото."))
        : new Error("Фото не принадлежит открытому TEMP-черновику."));
    }).finally(() => db.close());
  }

  async function countOfflinePhotosByDraft(localDraftId) {
    if (!localDraftId) return 0;
    return await withStore(STORES.offlinePhotos, "readonly", (store) => store.index("local_draft_id").count(localDraftId)) || 0;
  }

  function createOfflineDraft(draft) {
    return withStore(STORES.offlineDrafts, "readwrite", (store) => store.add(normalizeOfflineDraft(draft)));
  }

  function putOfflineDraft(draft) {
    return withStore(STORES.offlineDrafts, "readwrite", (store) => store.put(normalizeOfflineDraft(draft)));
  }

  function getOfflineDraft(localId) {
    return withStore(STORES.offlineDrafts, "readonly", (store) => store.get(localId));
  }

  async function listOfflineDrafts() {
    const drafts = await withStore(STORES.offlineDrafts, "readonly", (store) => store.getAll());
    return (drafts || []).sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  }

  async function deleteOfflineDraft(localId, options = {}) {
    if (options.safetyAuthorized !== true) throw new Error("Сначала подтвердите безопасное удаление локального черновика.");
    if (!localId) throw new Error("Локальный черновик не найден.");
    const db = await openDatabase();
    if (!db) throw new Error("Локальное хранилище недоступно.");
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.offlineDrafts, STORES.offlinePhotos, STORES.syncQueue], "readwrite");
      const drafts = transaction.objectStore(STORES.offlineDrafts);
      const photos = transaction.objectStore(STORES.offlinePhotos);
      const queue = transaction.objectStore(STORES.syncQueue);
      let draftConfirmed = false;
      let photosScanned = false;
      let queueScanned = false;
      const deleteDraftWhenReady = () => {
        if (draftConfirmed && photosScanned && queueScanned) drafts.delete(localId);
      };
      const draftRequest = drafts.get(localId);
      draftRequest.onsuccess = () => {
        if (!draftRequest.result) {
          transaction.abort();
          return;
        }
        draftConfirmed = true;
        deleteDraftWhenReady();
      };
      const photoRequest = photos.index("local_draft_id").openCursor(localId);
      photoRequest.onsuccess = () => {
        const cursor = photoRequest.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
          return;
        }
        photosScanned = true;
        deleteDraftWhenReady();
      };
      const queueRequest = queue.openCursor();
      queueRequest.onsuccess = () => {
        const cursor = queueRequest.result;
        if (cursor) {
          const operation = cursor.value || {};
          const payload = operation.payload || {};
          const belongsToDraft = String(operation.draft_local_id || payload.local_draft_id || "") === String(localId);
          if (belongsToDraft) cursor.delete();
          cursor.continue();
          return;
        }
        queueScanned = true;
        deleteDraftWhenReady();
      };
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error || new Error("Не удалось безопасно удалить локальный черновик."));
      transaction.onabort = () => reject(transaction.error || new Error(draftConfirmed
        ? "Не удалось безопасно удалить локальный черновик."
        : "Локальный черновик не найден."));
    }).finally(() => db.close());
  }

  function countOfflineDrafts() {
    return withStore(STORES.offlineDrafts, "readonly", (store) => store.count());
  }

  window.TeksturaOfflineDB = {
    addOfflinePhoto,
    countOfflineDrafts,
    countOfflinePhotosByDraft,
    createOfflineDraft,
    deleteOfflineDraft,
    deleteOfflinePhotoSafely,
    get,
    getOfflineDraft,
    isSupported,
    listOfflineDrafts,
    listOfflinePhotosByDraft,
    putOfflineDraft,
    putOfflinePhoto,
    remove,
    set,
  };
})();
