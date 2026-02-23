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

export function humanizeScanStatus(status, fileName) {
  const s = String(status || "").trim();
  if (!s) return `กำลังอ่าน: ${fileName || ""}`.trim();
  switch (s) {
    case "encoding_image":
      return "กำลังเตรียมรูปเพื่อสแกน...";
    case "preparing_file":
      return "กำลังเตรียมไฟล์เพื่อสแกน...";
    case "calling_api":
      return "กำลังสแกน...";
    case "calling_api_fallback":
      return "กำลังสแกน... (fallback)";
    case "done":
      return "สแกนเสร็จแล้ว";
    default:
      return s;
  }
}
