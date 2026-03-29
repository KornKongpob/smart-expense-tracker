import { getStoredBlob, putBlob, deleteBlob } from "../../services/blobStore.js";
import { loadState, STORAGE_KEY } from "../../services/storage.js";
import { createInitialState } from "../../store/boot.js";
import { generateId } from "../../utils/id.js";

export const OFFLINE_QUEUE_KEY = "smart-expense-cloud-queue-v1";

function hasWindow() {
  return typeof window !== "undefined";
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(key, fallback) {
  if (!hasWindow()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (!hasWindow()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function normalizeQueue(queue) {
  const root = queue && typeof queue === "object" ? queue : {};
  return {
    manual: toArray(root.manual),
    scans: toArray(root.scans),
  };
}

export function readOfflineQueue() {
  return normalizeQueue(readJson(OFFLINE_QUEUE_KEY, { manual: [], scans: [] }));
}

export function writeOfflineQueue(queue) {
  writeJson(OFFLINE_QUEUE_KEY, normalizeQueue(queue));
}

export function consumeOfflineQueueItem(kind, id) {
  const queue = readOfflineQueue();
  const next = {
    ...queue,
    [kind]: toArray(queue[kind]).filter((item) => String(item?.id || "") !== String(id || "")),
  };
  writeOfflineQueue(next);
  return next;
}

export function enqueueManualDraft(payload) {
  const queue = readOfflineQueue();
  const next = {
    ...queue,
    manual: [
      ...queue.manual,
      {
        id: generateId(),
        createdAt: Date.now(),
        payload,
      },
    ],
  };
  writeOfflineQueue(next);
  return next;
}

export async function enqueueScanDraft(file) {
  const id = generateId();
  const blobId = `offline-scan-${id}`;
  await putBlob(blobId, file);

  const queue = readOfflineQueue();
  const next = {
    ...queue,
    scans: [
      ...queue.scans,
      {
        id,
        blobId,
        filename: String(file?.name || "scan-upload").trim() || "scan-upload",
        mimeType: String(file?.type || "application/octet-stream").trim() || "application/octet-stream",
        createdAt: Date.now(),
      },
    ],
  };
  writeOfflineQueue(next);
  return next;
}

export async function readQueuedScanBlob(item) {
  return await getStoredBlob(item?.blobId);
}

export async function clearQueuedScanBlob(item) {
  if (!item?.blobId) return;
  await deleteBlob(item.blobId);
}

function collectAttachmentIds(snapshot) {
  const ids = new Set();

  for (const transaction of toArray(snapshot?.transactions)) {
    const attachmentId = String(transaction?.attachmentId || "").trim();
    if (attachmentId) ids.add(attachmentId);
  }

  for (const item of toArray(snapshot?.inbox)) {
    const attachmentId = String(item?.attachmentId || "").trim();
    if (attachmentId) ids.add(attachmentId);
  }

  return [...ids];
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : "");
    };
    reader.onerror = () => reject(reader.error || new Error("blob_read_failed"));
    reader.readAsDataURL(blob);
  });
}

export function hasLegacySnapshot() {
  if (!hasWindow()) return false;
  try {
    return !!window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

export function readLegacySnapshot() {
  const raw = loadState();
  if (!raw) return null;
  const normalized = createInitialState(raw);
  return {
    moneyUnit: "satang",
    accounts: toArray(normalized?.accounts),
    categories: normalized?.categories || { expense: [], income: [] },
    transactions: toArray(normalized?.transactions),
    inbox: toArray(normalized?.inbox),
    merchants: toArray(normalized?.merchants),
    budgets: toArray(normalized?.budgets),
  };
}

export async function buildLegacyMigrationPayload() {
  const snapshot = readLegacySnapshot();
  if (!snapshot) {
    return { snapshot: null, attachments: [] };
  }

  const attachments = [];
  for (const attachmentId of collectAttachmentIds(snapshot)) {
    const blob = await getStoredBlob(attachmentId);
    if (!blob) continue;

    attachments.push({
      id: attachmentId,
      filename: attachmentId,
      mimeType: String(blob.type || "application/octet-stream"),
      size: Number(blob.size || 0),
      base64: await blobToBase64(blob),
    });
  }

  return { snapshot, attachments };
}
