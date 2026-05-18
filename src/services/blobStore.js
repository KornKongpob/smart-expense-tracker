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

async function getAllBlobIds() {
  const db = await getDb();
  if (!db) return [];
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);

  if (typeof store.getAllKeys === "function") {
    const keys = await txRequestToPromise(store.getAllKeys());
    return Array.isArray(keys) ? keys.map((key) => String(key || "")).filter(Boolean) : [];
  }

  return await new Promise((resolve, reject) => {
    const ids = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(ids);
        return;
      }
      ids.push(String(cursor.key || ""));
      cursor.continue();
    };
    req.onerror = () => reject(req.error || new Error("Failed to list blob ids"));
  });
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

function cleanId(value) {
  return String(value || "").trim();
}

function uniqueIds(ids) {
  return Array.from(new Set((Array.isArray(ids) ? ids : []).map(cleanId).filter(Boolean)));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl, mimeType = "") {
  const text = String(dataUrl || "");
  if (!text.startsWith("data:")) return null;
  const response = await fetch(text);
  const blob = await response.blob();
  if (mimeType && blob.type !== mimeType) {
    return new Blob([blob], { type: mimeType });
  }
  return blob;
}

function normalizeBlobMap(blobMap) {
  if (!blobMap || typeof blobMap !== "object" || Array.isArray(blobMap)) return [];
  return Object.entries(blobMap)
    .map(([id, value]) => {
      const item = value && typeof value === "object" ? value : {};
      return {
        id: cleanId(id),
        dataUrl: String(item.dataUrl || item.data_url || ""),
        mimeType: String(item.mimeType || item.mime_type || ""),
      };
    })
    .filter((item) => item.id && item.dataUrl.startsWith("data:"));
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
 * getBlobInfo(id) -> { url, mimeType, size }
 * Useful to render non-image attachments (e.g., PDF).
 */
export async function getBlobInfo(id) {
  if (!id) return { url: null, mimeType: "", size: 0 };

  const blob = await getBlob(id);
  if (!blob) return { url: null, mimeType: "", size: 0 };

  // Reuse cached object URL if available
  let url = urlCache.get(id) || null;
  if (!url) {
    url = URL.createObjectURL(blob);
    urlCache.set(id, url);
  }

  return { url, mimeType: String(blob.type || ""), size: Number(blob.size || 0) };
}

export async function hasBlob(id) {
  const info = await getBlobInfo(id);
  return !!info?.url && Number(info?.size || 0) > 0;
}

export async function getStoredBlob(id) {
  const blob = await getBlob(id);
  return blob instanceof Blob ? blob : null;
}

export async function listBlobIds() {
  return await getAllBlobIds();
}

export async function listExistingBlobs(ids) {
  const out = [];
  for (const id of uniqueIds(ids)) {
    const blob = await getBlob(id);
    if (!blob) continue;
    out.push({
      id,
      mimeType: String(blob.type || ""),
      size: Number(blob.size || 0),
    });
  }
  return out;
}

export async function exportBlobsAsDataUrls(ids) {
  const out = {};
  for (const id of uniqueIds(ids)) {
    const blob = await getBlob(id);
    if (!blob) continue;
    out[id] = {
      dataUrl: await blobToDataUrl(blob),
      mimeType: String(blob.type || ""),
      size: Number(blob.size || 0),
    };
  }
  return out;
}

export async function importBlobsFromDataUrls(blobMap) {
  const items = normalizeBlobMap(blobMap);
  let imported = 0;
  const skipped = [];

  for (const item of items) {
    try {
      const blob = await dataUrlToBlob(item.dataUrl, item.mimeType);
      if (!blob) {
        skipped.push(item.id);
        continue;
      }
      await putBlob(item.id, blob);
      imported += 1;
    } catch (error) {
      const message = String(error?.name || error?.message || error || "");
      if (/quota|storage|exceed/i.test(message)) {
        throw new Error("พื้นที่เก็บรูปในเบราว์เซอร์ไม่พอสำหรับกู้คืนไฟล์แนบทั้งหมด");
      }
      throw error;
    }
  }

  return { imported, skipped };
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
