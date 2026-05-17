(function () {
  "use strict";

  const DB_NAME = "tekstura-offline-shell";
  const DB_VERSION = 2;
  const STORES = {
    metadata: "metadata",
    offlineDrafts: "offline_drafts",
    syncQueue: "sync_queue",
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

  function deleteOfflineDraft(localId) {
    return withStore(STORES.offlineDrafts, "readwrite", (store) => store.delete(localId));
  }

  function countOfflineDrafts() {
    return withStore(STORES.offlineDrafts, "readonly", (store) => store.count());
  }

  window.TeksturaOfflineDB = {
    countOfflineDrafts,
    createOfflineDraft,
    deleteOfflineDraft,
    get,
    getOfflineDraft,
    isSupported,
    listOfflineDrafts,
    putOfflineDraft,
    remove,
    set,
  };
})();
