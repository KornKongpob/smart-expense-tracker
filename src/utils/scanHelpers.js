// src/utils/scanHelpers.js
// Pure helper functions extracted from AddTransactionView.jsx
// for scan/slip detection, category guessing, and type inference.

import { sanitizeCategoryKey } from "./receiptCategorizer";
import { normalizeThaiDigits } from "./money";
import { parseTransactionTimeFromText } from "./scanDateTime.js";
import { resolveScannedTxTypeFromAccounts } from "./scanTransactionType.js";

// ===== Common helpers =====

export const isTombstoneCategory = (c) => !!(c?.deletedAt || c?.isDeleted);

export function isPositiveNumber(n) {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
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

export function isImageSrc(v) {
  const s = String(v || "").trim();
  return s.startsWith("data:image/") || s.startsWith("http://") || s.startsWith("https://");
}

export function getAccountVisual(acc) {
  if (!acc) return { kind: "emoji", value: "💳" };
  const img = acc.image && isImageSrc(acc.image) ? acc.image : null;
  if (img) return { kind: "img", src: img };

  const icon = String(acc.icon || "").trim();
  if (isImageSrc(icon)) return { kind: "img", src: icon };
  return { kind: "emoji", value: icon || "💳" };
}

// ===== Merchant helpers =====

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

// ===== Category mapping =====

export function categoryNameFromKey(key) {
  const k = sanitizeCategoryKey(key);
  const map = {
    food: "อาหาร",
    drinks: "เครื่องดื่ม",
    coffee: "กาแฟ/ชา",
    dining: "กินนอกบ้าน",
    groceries: "ของกิน/ของใช้",
    transport: "เดินทาง",
    fuel: "น้ำมันรถ",
    shopping: "ช้อปปิ้ง",
    bills: "บิล/น้ำไฟ",
    phone_internet: "มือถือ/อินเทอร์เน็ต",
    subscriptions: "สมาชิก/Subscription",
    health: "สุขภาพ",
    fitness: "ออกกำลังกาย",
    beauty: "ความงาม",
    home: "บ้าน",
    education: "การเรียน",
    entertainment: "บันเทิง",
    salary: "เงินเดือน",
    bonus: "โบนัส",
    investment: "ลงทุน",
    refund: "เงินคืน",
    other: "อื่นๆ",
    mixed: "หลายหมวด",
    transfer: "Transfer",
  };
  return map[k] || String(key || "").trim() || "อื่นๆ";
}

export function mapKnownCategoryId(type, key) {
  const k = sanitizeCategoryKey(key);
  if (!k) return type === "income" ? "other_income" : "other";

  const expenseMap = {
    food: "food",
    drinks: "drinks",
    coffee: "coffee",
    dining: "dining",
    groceries: "groceries",
    transport: "transport",
    fuel: "fuel",
    shopping: "shopping",
    bills: "bills",
    phone_internet: "phone_internet",
    subscriptions: "subscriptions",
    health: "health",
    fitness: "fitness",
    beauty: "beauty",
    home: "home",
    education: "education",
    entertainment: "entertainment",
    mixed: "mixed",
    other: "other",
    transfer: "transfer",
  };
  const incomeMap = {
    salary: "salary",
    bonus: "bonus",
    investment: "investment",
    refund: "refund",
    other: "other_income",
  };

  return type === "income" ? incomeMap[k] || "" : expenseMap[k] || "";
}

// ===== Text detection helpers =====

export function looksLikeCreditPaymentText(text) {
  const t = String(text || "").toLowerCase();
  return (
    t.includes("ชำระ") ||
    t.includes("ชำระยอด") ||
    t.includes("บัตรเครดิต") ||
    t.includes("credit card") ||
    t.includes("card payment") ||
    t.includes("payment") ||
    t.includes("pay bill") ||
    t.includes("pay card")
  );
}

export function looksLikeTransferText(text) {
  const t = String(text || "").toLowerCase();
  return (
    t.includes("โอน") ||
    t.includes("transfer") ||
    t.includes("พร้อมเพย์") ||
    t.includes("promptpay") ||
    t.includes("trx") ||
    t.includes("transaction") ||
    t.includes("ref") ||
    t.includes("เลขที่รายการ")
  );
}

export function looksLikeIncomeText(text) {
  const t = String(text || "").toLowerCase();
  return (
    t.includes("เงินเข้า") ||
    t.includes("รับโอน") ||
    t.includes("โอนเข้า") ||
    t.includes("deposit") ||
    t.includes("credited") ||
    t.includes("receive") ||
    t.includes("received") ||
    t.includes("incoming") ||
    t.includes("refund") ||
    t.includes("salary") ||
    t.includes("เงินเดือน")
  );
}

export function looksLikeExpenseText(text) {
  const t = String(text || "").toLowerCase();
  return (
    t.includes("โอนออก") ||
    t.includes("ชำระ") ||
    t.includes("ชำระยอด") ||
    t.includes("จ่าย") ||
    t.includes("debit") ||
    t.includes("paid") ||
    t.includes("withdraw") ||
    t.includes("withdrawal") ||
    t.includes("purchase") ||
    t.includes("ซื้อ") ||
    t.includes("ถอน")
  );
}

// ===== Slip Hunter helpers (Thai transfer slips) =====

export const THAI_SLIP_BANK_KEYWORDS = [
  { id: "kbank", keys: ["kbank", "kasikorn", "kasikornbank", "กสิกร", "กสิกรไทย", "kbiz"] },
  { id: "scb", keys: ["scb", "siam commercial", "siam commercial bank", "ไทยพาณิช", "ไทยพาณิชย์"] },
  { id: "ktb", keys: ["ktb", "krungthai", "กรุงไทย"] },
  { id: "ttb", keys: ["ttb", "ทหารไทย", "ธนชาต", "ทหารไทยธนชาต", "tmb"] },
  { id: "truemoney", keys: ["truemoney", "true money", "ทรูมันนี่", "ทรู มันนี่", "wallet", "วอลเล็ต"] },
];

export function fixBuddhistYearISO(isoLike) {
  const raw = String(isoLike || "").trim();
  if (!raw) return "";
  const s = normalizeThaiDigits(raw);
  const m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return raw.slice(0, 10);
  let y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return raw.slice(0, 10);
  if (y >= 2400) y = y - 543;
  const pad = (n) => String(n).padStart(2, "0");
  return `${y}-${pad(mo)}-${pad(d)}`;
}

export function parseSlipTimeFromText(text) {
  return parseTransactionTimeFromText(text);
}

export function guessSlipReceiverBankId(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return "";
  for (const b of THAI_SLIP_BANK_KEYWORDS) {
    if (b.keys.some((k) => t.includes(String(k).toLowerCase()))) return b.id;
  }
  return "";
}

export function guessSlipCategoryKey(merchantText) {
  const m = String(merchantText || "").toLowerCase();
  if (!m) return "";

  if (
    m.includes("การไฟฟ้า") || m.includes("pea") || m.includes("mea") ||
    m.includes("egat") || m.includes("electric") || m.includes("การประปา") ||
    m.includes("waterworks") || m.includes("internet") || m.includes("เน็ตทรู") ||
    m.includes("true") || m.includes("ais") || m.includes("dtac")
  ) return "bills";

  if (m.includes("แพ็กเกจ") || m.includes("package") || m.includes("mobile") || m.includes("มือถือ"))
    return "phone_internet";

  if (m.includes("grab") || m.includes("bolt") || m.includes("lineman") || m.includes("line man") || m.includes("shopeefood"))
    return "transport";

  if (m.includes("starbucks") || m.includes("cafe") || m.includes("กาแฟ") || m.includes("coffee"))
    return "coffee";

  if (m.includes("restaurant") || m.includes("อาหาร") || m.includes("kfc") || m.includes("mcd") || m.includes("pizza"))
    return "dining";

  if (m.includes("7-eleven") || m.includes("7-11") || m.includes("lotus") || m.includes("big c") || m.includes("makro") || m.includes("tops"))
    return "groceries";

  return "";
}

/**
 * Enhance model-detected tx type using:
 * - Whether from/to accounts are recognized in the user's account list
 * - Credit-account direction (deposit -> credit) to detect credit card payments
 * - Lightweight keyword hints for income vs expense when only one side is recognized
 */
export function enhanceScannedTxType({
  currentType,
  aiTxType,
  matchedFromId,
  matchedToId,
  matchedFromAcc,
  matchedToAcc,
  contextText,
}) {
  return resolveScannedTxTypeFromAccounts({
    docType: "unknown",
    aiTxType: currentType || aiTxType,
    hasLineItems: false,
    matchedFromId,
    matchedToId,
    matchedFromAcc,
    matchedToAcc,
    contextText,
  });
}
