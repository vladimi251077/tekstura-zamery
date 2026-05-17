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
      server_id: draft.server_id || null,
      server_client_id: draft.server_client_id || null,
      server_number: draft.server_number || "",
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
      blob: photo.blob,
      file_name: photo.file_name || "photo.jpg",
      mime_type: photo.mime_type || photo.blob?.type || "image/jpeg",
      size_bytes: Number(photo.size_bytes || photo.blob?.size || 0),
      photo_type: photo.photo_type || "Другое",
      sync_status: photo.sync_status || "local_only",
      created_at: photo.created_at || now,
      updated_at: photo.updated_at || now,
      ...photo,
    };
  }

  function addOfflinePhoto(photo) {
    return withStore(STORES.offlinePhotos, "readwrite", (store) => store.put(normalizeOfflinePhoto(photo)));
  }

  async function listOfflinePhotosByDraft(localDraftId) {
    if (!localDraftId) return [];
    const photos = await withStore(STORES.offlinePhotos, "readonly", (store) => store.index("local_draft_id").getAll(localDraftId));
    return (photos || []).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }

  function deleteOfflinePhoto(localPhotoId) {
    return withStore(STORES.offlinePhotos, "readwrite", (store) => store.delete(localPhotoId));
  }

  function deleteOfflinePhotosByDraft(localDraftId) {
    if (!localDraftId) return Promise.resolve(null);
    return withStore(STORES.offlinePhotos, "readwrite", (store) => {
      const request = store.index("local_draft_id").openCursor(localDraftId);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      return request;
    });
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

  async function deleteOfflineDraft(localId) {
    await deleteOfflinePhotosByDraft(localId);
    return withStore(STORES.offlineDrafts, "readwrite", (store) => store.delete(localId));
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
    deleteOfflinePhoto,
    deleteOfflinePhotosByDraft,
    get,
    getOfflineDraft,
    isSupported,
    listOfflineDrafts,
    listOfflinePhotosByDraft,
    putOfflineDraft,
    remove,
    set,
  };
})();
