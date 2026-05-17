(function () {
  "use strict";

  const DB_NAME = "tekstura_zamery_offline";
  const DB_VERSION = 1;
  const STORES = {
    drafts: "offline_drafts",
    photos: "offline_photos",
    queue: "sync_queue",
  };

  let dbPromise = null;

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  function ensureStore(db, storeName, options) {
    if (!db.objectStoreNames.contains(storeName)) {
      return db.createObjectStore(storeName, options);
    }
    return null;
  }

  function openOfflineDb() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB is not supported in this browser."));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        const draftsStore = ensureStore(db, STORES.drafts, { keyPath: "id", autoIncrement: true });
        const photosStore = ensureStore(db, STORES.photos, { keyPath: "id", autoIncrement: true });
        const queueStore = ensureStore(db, STORES.queue, { keyPath: "id", autoIncrement: true });

        if (draftsStore) {
          draftsStore.createIndex("updated_at", "updated_at", { unique: false });
        }
        if (photosStore) {
          photosStore.createIndex("localDraftId", "localDraftId", { unique: false });
        }
        if (queueStore) {
          queueStore.createIndex("status", "status", { unique: false });
          queueStore.createIndex("created_at", "created_at", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => console.warn("Offline DB upgrade is blocked by another open tab.");
    });

    return dbPromise;
  }

  function getOfflineDb() {
    return openOfflineDb();
  }

  async function withStore(storeName, mode, callback) {
    const db = await openOfflineDb();
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = await callback(store);
    await transactionDone(transaction);
    return result;
  }

  function normalizeCreatedAt(record) {
    return {
      created_at: new Date().toISOString(),
      ...record,
    };
  }

  function normalizeUpdatedAt(record) {
    return {
      ...record,
      updated_at: new Date().toISOString(),
    };
  }

  function addOfflineDraft(draft) {
    return withStore(STORES.drafts, "readwrite", (store) => requestToPromise(store.add(normalizeCreatedAt(normalizeUpdatedAt(draft || {})))));
  }

  function putOfflineDraft(draft) {
    return withStore(STORES.drafts, "readwrite", (store) => requestToPromise(store.put(normalizeUpdatedAt(draft || {}))));
  }

  function getOfflineDraft(id) {
    return withStore(STORES.drafts, "readonly", (store) => requestToPromise(store.get(id)));
  }

  function listOfflineDrafts() {
    return withStore(STORES.drafts, "readonly", (store) => requestToPromise(store.getAll()));
  }

  function addOfflinePhoto(photo) {
    return withStore(STORES.photos, "readwrite", (store) => requestToPromise(store.add(normalizeCreatedAt(photo || {}))));
  }

  function listOfflinePhotosByDraft(localDraftId) {
    return withStore(STORES.photos, "readonly", (store) => requestToPromise(store.index("localDraftId").getAll(localDraftId)));
  }

  function addSyncQueueItem(item) {
    return withStore(STORES.queue, "readwrite", (store) => requestToPromise(store.add({ status: "pending", ...normalizeCreatedAt(item || {}) })));
  }

  async function listPendingSyncQueue() {
    const items = await withStore(STORES.queue, "readonly", (store) => requestToPromise(store.getAll()));
    return items.filter((item) => !["done", "synced", "failed"].includes(String(item.status || "pending")));
  }

  window.TeksturaOfflineDB = {
    openOfflineDb,
    getOfflineDb,
    addOfflineDraft,
    putOfflineDraft,
    getOfflineDraft,
    listOfflineDrafts,
    addOfflinePhoto,
    listOfflinePhotosByDraft,
    addSyncQueueItem,
    listPendingSyncQueue,
  };
}());
