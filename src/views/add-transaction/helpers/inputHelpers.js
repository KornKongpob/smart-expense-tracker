export const digitsOnly = (s) => String(s || "").replace(/[^\d]/g, "");

const BAD_REF_KEYS = new Set(
  [
    "REF",
    "REFERENCE",
    "REFERENCENO",
    "REFERENCENUMBER",
    "TRANSACTION",
    "TRANSACTIONID",
    "TXID",
    "PAYMENT",
    "TRANSFER",
    "SLIP",
    "RECEIPT",
    "INVOICE",
    "SUCCESS",
    "APPROVED",
    "COMPLETED",
    "PROMPTPAY",
    "MOBILEBANKING",
    "MOBILEAPP",
    "SCB",
    "KBANK",
    "KPLUS",
    "KTB",
    "BBL",
    "BAY",
    "TTB",
    "UOB",
    "GSB",
    "BAAC",
  ].map((x) => String(x).trim().toUpperCase())
);

export const isValidRefKey = (key) => {
  const k = String(key || "").trim().toUpperCase();
  if (!k) return false;
  if (BAD_REF_KEYS.has(k)) return false;
  if (k.length < 6) return false;
  const digits = (k.match(/\d/g) || []).length;
  const letters = (k.match(/[A-Z]/g) || []).length;
  if (digits === 0) return false;
  if (digits >= 4) return true;
  if (digits >= 2 && letters >= 2) return true;
  return false;
};

export const normalizeRefKey = (ref) => {
  const s0 = String(ref || "").trim();
  if (!s0) return "";
  const compact = s0.replace(/[\s\u200b\-_.]/g, "");
  const alnum = compact.replace(/[^A-Za-z0-9]/g, "");
  const base = (alnum || compact).toUpperCase();
  return isValidRefKey(base) ? base : "";
};

export function normalizeMerchantKey(s) {
  const t = String(s || "").trim().toLowerCase();
  if (!t) return "";
  return t
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\wก-๙\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractMerchantFromNote(note) {
  const t = String(note || "").trim();
  if (!t) return "";
  const parts = t.split("•").map((x) => x.trim()).filter(Boolean);
  return parts[0] || t.slice(0, 48);
}

export function appendEvidenceToNote(note, evidence, maxLen = 180) {
  const base = String(note || "").trim();
  const ev = String(evidence || "").trim();
  if (!ev) return base;

  const baseLower = base.toLowerCase();
  const evLower = ev.toLowerCase();
  if (baseLower.includes(evLower.slice(0, 24))) return base;

  const suffix = ` • ${ev}`;
  const out = (base ? base + suffix : ev).trim();
  if (out.length <= maxLen) return out;

  if (!base) return out.slice(0, maxLen);

  const room = Math.max(0, maxLen - (base.length + 3));
  if (room <= 12) return base.slice(0, maxLen);
  return `${base} • ${ev.slice(0, room)}`.trim();
}

export function hashString(str) {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const SCAN_STAGE_INDEX = {
  queued: 0,
  encoding_image: 1,
  preparing_file: 1,
  uploading_files: 2,
  calling_api: 3,
  calling_api_fallback: 3,
  parsing_response: 4,
  validating_items: 5,
  done: 6,
  error: 6,
};

const SCAN_STAGE_LABEL = {
  queued: "เตรียมคิวสแกน",
  encoding_image: "เตรียมภาพเพื่อสแกน",
  preparing_file: "เตรียมไฟล์ PDF",
  uploading_files: "ส่งไฟล์ขึ้นเซิร์ฟเวอร์",
  calling_api: "วิเคราะห์ใบเสร็จ",
  calling_api_fallback: "วิเคราะห์ใบเสร็จ (fallback)",
  parsing_response: "อ่านผลจาก AI",
  validating_items: "ตรวจสอบราคาและรายการสินค้า",
  done: "พร้อมให้ตรวจทาน",
  error: "สแกนไม่สำเร็จ",
};

export function getScanStageMeta(status, fileName) {
  const key = String(status || "").trim() || "queued";
  const totalSteps = 6;
  const stepIndex = SCAN_STAGE_INDEX[key] ?? 0;
  const label = SCAN_STAGE_LABEL[key] || key;
  const progress = Math.max(0, Math.min(100, Math.round((stepIndex / totalSteps) * 100)));
  const prefix = String(fileName || "").trim();

  return {
    key,
    label,
    progress,
    stepIndex,
    totalSteps,
    summary: prefix ? `${prefix} • ${label}` : label,
  };
}

export function humanizeScanStatus(status, fileName) {
  return getScanStageMeta(status, fileName).summary;
}
