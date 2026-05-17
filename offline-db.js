(function () {
  "use strict";

  const DB_NAME = "tekstura-offline-shell";
  const DB_VERSION = 1;
  const STORE_NAME = "metadata";

  function isSupported() {
    return "indexedDB" in window;
  }

  function openDatabase() {
    if (!isSupported()) return Promise.resolve(null);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function withStore(mode, callback) {
    const db = await openDatabase();
    if (!db) return null;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = callback(store);

      transaction.oncomplete = () => resolve(request?.result ?? null);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }).finally(() => db.close());
  }

  async function get(key) {
    const record = await withStore("readonly", (store) => store.get(key));
    return record?.value ?? null;
  }

  function set(key, value) {
    return withStore("readwrite", (store) => store.put({ key, value, updatedAt: new Date().toISOString() }));
  }

  function remove(key) {
    return withStore("readwrite", (store) => store.delete(key));
  }

  window.TeksturaOfflineDB = {
    get,
    isSupported,
    remove,
    set,
  };
})();
