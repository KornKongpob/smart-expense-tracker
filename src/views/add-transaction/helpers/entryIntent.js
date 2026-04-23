const ENTRY_MODES = new Set(["manual", "scan"]);
const SCAN_UPLOAD_KINDS = new Set(["receipt", "slip"]);
const TX_TYPES = new Set(["expense", "income", "transfer", "credit_payment"]);

export const LEGACY_ENTRY_INTENT_KEYS = Object.freeze([
  "add.entryMode.force",
  "add.scanUploadKind.force",
  "add.txType.force",
]);

function cleanText(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeNewEntryIntent(intent) {
  const source = intent && typeof intent === "object" ? intent : {};
  const entryMode = cleanText(source.entryMode);
  const scanUploadKind = cleanText(source.scanUploadKind);
  const txType = cleanText(source.txType);

  const normalized = {};
  if (ENTRY_MODES.has(entryMode)) normalized.entryMode = entryMode;
  if (SCAN_UPLOAD_KINDS.has(scanUploadKind)) normalized.scanUploadKind = scanUploadKind;
  if (TX_TYPES.has(txType)) normalized.txType = txType;

  if (!normalized.entryMode && normalized.scanUploadKind) normalized.entryMode = "scan";
  if (!normalized.entryMode && normalized.txType) normalized.entryMode = "manual";

  return Object.keys(normalized).length ? normalized : null;
}

export function readLegacyNewEntryIntent(storageLike) {
  if (!storageLike || typeof storageLike.getItem !== "function") return null;

  const entryMode = cleanText(storageLike.getItem("add.entryMode.force"));
  const scanUploadKind = cleanText(storageLike.getItem("add.scanUploadKind.force"));
  const txType = cleanText(storageLike.getItem("add.txType.force"));

  return normalizeNewEntryIntent({ entryMode, scanUploadKind, txType });
}

export function resolveNewEntryIntent({ isEditMode = false, storeIntent = null, legacyIntent = null } = {}) {
  if (isEditMode) return null;
  return normalizeNewEntryIntent(storeIntent) || normalizeNewEntryIntent(legacyIntent);
}
