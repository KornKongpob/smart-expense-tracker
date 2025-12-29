// src/services/blobStore.js
// Persistent attachment storage using IndexedDB (offline-first)

const DB_NAME = "smart-expense-tracker";
const DB_VERSION = 1;
const STORE_NAME = "blobs";

let dbPromise = null;

// Cache object URLs so callers can safely call getBlobUrl repeatedly.
// NOTE: object URLs are process-local; they are recreated after reload.
const urlCache = new Map(); // id -> objectURL

function isBrowser() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb() {
  if (!isBrowser()) {
    // In non-browser environments (tests/SSR), just behave as a noop store.
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Failed to open IndexedDB"));
  });
}

async function getDb() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

function txRequestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB request failed"));
  });
}

async function getBlob(id) {
  if (!id) return null;
  const db = await getDb();
  if (!db) return null;
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  return await txRequestToPromise(store.get(id));
}

function revokeCachedUrl(id) {
  const url = urlCache.get(id);
  if (url) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
    urlCache.delete(id);
  }
}

/**
 * putBlob(id, blob)
 * Store a Blob (image) permanently in IndexedDB.
 */
export async function putBlob(id, blob) {
  if (!id || !blob) return;
  const db = await getDb();
  if (!db) return;

  // If overwriting, revoke cached URL so next getBlobUrl creates a fresh one.
  revokeCachedUrl(id);

  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  await txRequestToPromise(store.put(blob, id));
}

/**
 * getBlobUrl(id) -> object URL (string)
 * Returns a cached object URL that can be used in <img src="..." />.
 */
export async function getBlobUrl(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);

  const blob = await getBlob(id);
  if (!blob) return null;

  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

/**
 * deleteBlob(id)
 * Remove a stored attachment.
 */
export async function deleteBlob(id) {
  if (!id) return;
  const db = await getDb();
  if (!db) return;

  revokeCachedUrl(id);

  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  await txRequestToPromise(store.delete(id));
}

/**
 * clearAllBlobs()
 * Clears all stored attachments.
 */
export async function clearAllBlobs() {
  const db = await getDb();
  if (!db) return;

  for (const id of urlCache.keys()) revokeCachedUrl(id);

  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  await txRequestToPromise(store.clear());
}
