// api/scan-receipt.js
import Busboy from "busboy";
import { parseScanRequestPayload, normalizeScanResponse, SCAN_PARSE_ERROR_CODE } from "../shared/scanSchema.js";
import { enforceAccess as enforceAccessModule, setSecurityHeaders as setSecurityHeadersModule } from "../lib/scan/access.js";
import { createRateLimiter } from "../lib/scan/rateLimit.js";
import {
  parseJsonBody,
  parseDataUrlMaybe,
  normalizeInputMime,
  assertAllowedInputMime,
  assertBase64UnderLimit,
} from "../lib/scan/requestParse.js";
import { scanWithProvider } from "../lib/scan/providers/index.js";
import { normalizeErrorResponse, safeJsonParseMaybe } from "../lib/scan/normalize.js";
import {
  clamp01 as clamp01Helper,
  extractResponsesOutputText as extractResponsesOutputTextHelper,
  findFirstParsedObject as findFirstParsedObjectHelper,
  normalizeDigits as normalizeDigitsHelper,
  safeNumber as safeNumberHelper,
  toArabicDigits as toArabicDigitsHelper,
} from "../lib/scan/resultHelpers.js";
import {
  detectScanTextDocType,
  extractLikelyAmountFromScanText,
  extractMerchantFromScanText,
  normalizeScanText,
} from "../src/utils/scanPostprocess.js";

const OPENAI_URL = "https://api.openai.com/v1/responses";

// NOTE: harmless for Vercel Functions, required for Next API routes
export const config = { api: { bodyParser: false } };

// =========================
// Security / abuse prevention
// =========================
const IS_PROD = String(process.env.NODE_ENV || "").toLowerCase() === "production";

// JSON request bodies can be abused to DoS serverless functions. Keep this tight.
// NOTE: base64 is bigger than binary; client optimizes images/PDFs before sending.
// Default: 6MB JSON (base64 payloads); override via SCAN_MAX_JSON_BODY_BYTES.
const MAX_JSON_BODY_BYTES = Number(process.env.SCAN_MAX_JSON_BODY_BYTES || 6 * 1024 * 1024);

// Max decoded binary upload bytes allowed (applies to multipart file size and JSON base64).
// Back-compat: SCAN_MAX_IMAGE_BYTES supported.
const MAX_UPLOAD_BYTES = Number(process.env.SCAN_MAX_UPLOAD_BYTES || process.env.SCAN_MAX_IMAGE_BYTES || 12 * 1024 * 1024);

// Basic per-IP rate limit (best-effort; serverless instances do not share memory).
const RATE_LIMIT_PER_MINUTE = Number(process.env.SCAN_RATE_LIMIT_PER_MINUTE || 30);
const RATE_WINDOW_MS = 60_000;

// OpenAI call timeout (ms)
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 35_000);

const enforceRateLimitModule = createRateLimiter({ limit: RATE_LIMIT_PER_MINUTE, windowMs: RATE_WINDOW_MS });

async function fetchWithTimeout(url, options, timeoutMs = OPENAI_TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...(options || {}), signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

function _getContentType(req) {
  return String(req.headers?.["content-type"] || "").toLowerCase();
}

async function _parseMultipart(req, { maxBytes = 10 * 1024 * 1024, maxFiles = 3 } = {}) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err, val) => {
      if (done) return;
      done = true;
      if (err) reject(err);
      else resolve(val);
    };

    const bb = Busboy({
      headers: req.headers,
      // fileSize is PER FILE; we also enforce a total budget below.
      limits: { fileSize: maxBytes, files: maxFiles },
    });

    const files = [];
    let totalBytes = 0;
    const fields = {};

    bb.on("field", (name, val) => {
      try {
        if (!name) return;
        fields[String(name)] = String(val ?? "");
      } catch {
        // ignore
      }
    });

    bb.on("file", (fieldname, file, info) => {
      const chunks = [];
      const filename = info?.filename || "";
      const mimeType = info?.mimeType || info?.mimetype || "";

      file.on("data", (d) => {
        totalBytes += d.length;
        if (totalBytes > maxBytes) {
          finish(new Error("file_too_large"));
          try {
            file.resume();
          } catch {
            // ignore
          }
          return;
        }
        chunks.push(d);
      });
      file.on("limit", () => finish(new Error("file_too_large")));
      file.on("end", () => {
        try {
          const buffer = Buffer.concat(chunks);
          if (buffer?.length) files.push({ fileBuffer: buffer, mimeType, filename });
        } catch (e) {
          finish(e);
        }
      });
      file.on("error", (e) => finish(e));
    });

    bb.on("error", (e) => finish(e));
    bb.on("finish", () => finish(null, { files, fields }));

    try {
      req.pipe(bb);
    } catch (e) {
      finish(e);
    }
  });
}

function normalizeItemName(raw) {
  let s = safeString(raw);
  if (!s) return "";
  s = s.replace(/\s+/g, " ").trim();
  // strip trailing prices sometimes glued to name
  s = s.replace(/\s+\d{1,3}(?:,\d{3})*(?:\.\d{2})\s*$/u, "").trim();
  // strip leading qty column if it sneaks into name
  s = s.replace(/^\s*\d+\s+/u, "").trim();
  // common OCR noise
  s = s.replace(/[|]+/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

function toArabicDigits(s) {
  // รองรับเลขไทย ๐-๙
  return toArabicDigitsHelper(s);
}

function normalizeDigits(s) {
  return normalizeDigitsHelper(s);
}

function normalizeScannedDate(v) {
  const raw = String(v || "").trim();
  if (!raw) return null;

  const s = raw.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  const pad2 = (n) => String(n).padStart(2, "0");

  const toISO = (yy, mm, dd) => {
    let y = Number(yy);
    const m = Number(mm);
    const d = Number(dd);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    if (y < 100) y = y >= 70 ? 1900 + y : 2000 + y;
    if (y >= 2400) y = y - 543; // Buddhist Era → Gregorian
    if (y < 1900 || y > 2100) return null;
    if (m < 1 || m > 12) return null;
    if (d < 1 || d > 31) return null;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  };

  // Try first token as a date head.
  const head = s.split(/\s+/)[0];

  // yyyy-mm-dd / yyyy/mm/dd
  let m1 = head.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (m1) return toISO(m1[1], m1[2], m1[3]);

  // dd/mm/yyyy
  m1 = head.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m1) return toISO(m1[3], m1[2], m1[1]);

  // dd MMM yyyy (Thai/English months)
  const thMonths = {
    "ม.ค": 1,
    "มกราคม": 1,
    "ก.พ": 2,
    "กุมภาพันธ์": 2,
    "มี.ค": 3,
    "มีนาคม": 3,
    "เม.ย": 4,
    "เมษายน": 4,
    "พ.ค": 5,
    "พฤษภาคม": 5,
    "มิ.ย": 6,
    "มิถุนายน": 6,
    "ก.ค": 7,
    "กรกฎาคม": 7,
    "ส.ค": 8,
    "สิงหาคม": 8,
    "ก.ย": 9,
    "กันยายน": 9,
    "ต.ค": 10,
    "ตุลาคม": 10,
    "พ.ย": 11,
    "พฤศจิกายน": 11,
    "ธ.ค": 12,
    "ธันวาคม": 12,
  };
  const enMonths = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };

  const m2 = s.match(/(\d{1,2})\s*([A-Za-z]{3,9}|[\u0E00-\u0E7F.]{2,12})\s*(\d{2,4})/);
  if (m2) {
    const d = m2[1];
    const token0 = String(m2[2] || "").trim();
    const token = token0.replace(/\.+$/g, "");
    const keyTh = token0.replace(/\s+/g, "");
    const mm = thMonths[keyTh] || thMonths[token] || enMonths[token.toLowerCase()] || null;
    if (mm) return toISO(m2[3], mm, d);
  }

  return null;
}

function extractResponsesOutputText(resp) {
  return extractResponsesOutputTextHelper(resp);
}

function findFirstParsedObject(resp) {
  return findFirstParsedObjectHelper(resp);
}

function safeString(v) {
  if (v == null) return "";
  return String(v).trim();
}

function safeNumber(v) {
  return safeNumberHelper(v);
}

function clamp01(v) {
  return clamp01Helper(v);
}

function normalizeCategoryKey(v) {
  const s = safeString(v).toLowerCase();
  if (!s) return null;

  const allowed = new Set([
    // expense
    "food",
    "drinks",
    "groceries",
    "transport",
    "fuel",
    "bills",
    "rent",
    "shopping",
    "coffee",
    "dining",
    "entertainment",
    "travel",
    "health",
    "fitness",
    "beauty",
    "pets",
    "kids",
    "home",
    "education",
    "work",
    "phone_internet",
    "subscriptions",
    "fees",
    "insurance",
    "donation",
    "gift",
    "other",
    "mixed",

    // income
    "salary",
    "bonus",
    "freelance",
    "business",
    "investment",
    "interest",
    "dividend",
    "refund",
    "gift_income",
    "other_income",

    // transfer
    "transfer",
  ]);
  if (allowed.has(s)) return s;

  const alias = {
    utilities: "bills",
    utility: "bills",
    bill: "bills",

    gas: "fuel",
    petrol: "fuel",
    diesel: "fuel",

    supermarket: "groceries",
    grocery: "groceries",

    pharmacy: "health",
    medicine: "health",

    cinema: "entertainment",
    movie: "entertainment",

    internet: "phone_internet",
    phone: "phone_internet",
    telecom: "phone_internet",

    diningout: "dining",
    restaurant: "dining",
    café: "coffee",
    cafe: "coffee",
  };
  if (alias[s]) return alias[s];

  return null;
}

function inferCategoryFromText(text) {
  const t = safeString(text).toLowerCase();
  if (!t) return null;

  const has = (arr) => arr.some((k) => t.includes(k));

  if (
    has([
      "fuel",
      "gas",
      "petrol",
      "diesel",
      "oil",
      "shell",
      "ptt",
      "esso",
      "caltex",
      "bangchak",
      "parking",
      "toll",
      "grab",
      "bolt",
      "taxi",
      "bts",
      "mrt",
      "bus",
      "train",
      "น้ำมัน",
      "ปั๊ม",
      "เติมน้ำมัน",
      "ทางด่วน",
      "รถไฟ",
      "รถเมล์",
      "แท็กซี่",
      "ที่จอดรถ",
    ])
  )
    return "transport";

  if (
    has([
      "restaurant",
      "cafe",
      "coffee",
      "tea",
      "food",
      "noodle",
      "rice",
      "chicken",
      "dessert",
      "bakery",
      "kfc",
      "mcdonald",
      "starbucks",
      "grabfood",
      "line man",
      "lineman",
      "อาหาร",
      "ก๋วยเตี๋ยว",
      "ข้าว",
      "กาแฟ",
      "ชา",
      "ไก่",
      "หมู",
      "ร้านอาหาร",
      "ของกิน",
    ])
  )
    return "food";

  if (
    has([
      "electric",
      "electricity",
      "water bill",
      "internet",
      "phone",
      "mobile",
      "utility",
      "utilities",
      "ais",
      "dtac",
      "true",
      "invoice",
      "billing",
      "ค่าไฟ",
      "ค่าน้ำ",
      "โทรศัพท์",
      "อินเทอร์เน็ต",
      "บิล",
      "ชำระบิล",
    ])
  )
    return "bills";

  if (has(["hospital", "clinic", "pharmacy", "drug", "medicine", "vitamin", "health", "โรงพยาบาล", "คลินิก", "ร้านยา", "ยา"]))
    return "health";

  if (
    has([
      "movie",
      "cinema",
      "netflix",
      "spotify",
      "youtube",
      "ticket",
      "concert",
      "game",
      "บันเทิง",
      "ภาพยนตร์",
      "ตั๋ว",
      "คอนเสิร์ต",
      "เกม",
    ])
  )
    return "entertainment";

  if (
    has([
      "shopping",
      "store",
      "mall",
      "lazada",
      "shopee",
      "amazon",
      "7-eleven",
      "seven eleven",
      "lotus",
      "big c",
      "makro",
      "supermarket",
      "market",
      "shop",
      "ซื้อของ",
      "ช้อป",
      "ร้านค้า",
      "ตลาด",
      "เซเว่น",
      "โลตัส",
      "บิ๊กซี",
      "แม็คโคร",
    ])
  )
    return "shopping";

  if (has(["salary", "payroll", "เงินเดือน"])) return "salary";
  if (has(["bonus", "โบนัส"])) return "bonus";
  if (has(["refund", "เงินคืน", "คืนเงิน"])) return "refund";
  if (has(["investment", "ลงทุน"])) return "investment";

  return null;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];

  for (const it of items) {
    if (!it || typeof it !== "object") continue;

    const name = normalizeItemName(it.name ?? it.title ?? it.desc ?? it.description ?? it.item ?? it.product);
    const qty = safeNumber(it.qty ?? it.quantity);
    const unit_price = safeNumber(it.unit_price ?? it.unitPrice ?? it.price);
    const total = safeNumber(it.total ?? it.amount ?? it.line_total ?? it.lineTotal);

    const cat = normalizeCategoryKey(it.category_key ?? it.category) || inferCategoryFromText(name) || null;

    // --- children (1-level) ---
    let children = null;
    if (Array.isArray(it.children)) {
      const chOut = [];
      for (const ch of it.children) {
        if (!ch || typeof ch !== "object") continue;
        const chName = normalizeItemName(ch.name ?? ch.title ?? ch.desc ?? ch.description ?? ch.item ?? ch.product);
        const chQty = safeNumber(ch.qty ?? ch.quantity);
        const chUnit = safeNumber(ch.unit_price ?? ch.unitPrice ?? ch.price);
        const chTotal = safeNumber(ch.total ?? ch.amount ?? ch.line_total ?? ch.lineTotal);

        let chFinal = chTotal;
        if (chFinal == null && chQty != null && chUnit != null) chFinal = chQty * chUnit;
        if (!chName && chFinal == null) continue;

        chOut.push({
          name: chName || "",
          qty: chQty != null ? chQty : null,
          unit_price: chUnit != null ? chUnit : null,
          total: chFinal != null ? chFinal : null,
        });

        if (chOut.length >= 12) break;
      }
      if (chOut.length) children = chOut;
    }

    let finalTotal = total;
    if (finalTotal == null && qty != null && unit_price != null) finalTotal = qty * unit_price;

    if (!name && finalTotal == null) continue;

    out.push({
      name: name || "",
      qty: qty != null ? qty : null,
      unit_price: unit_price != null ? unit_price : null,
      total: finalTotal != null ? finalTotal : null,
      category_key: cat,
      children,
    });

    if (out.length >= 40) break;
  }

  return out;
}

function normalizeAdjustments(adjustments) {
  if (!Array.isArray(adjustments)) return [];
  const out = [];

  for (const a of adjustments) {
    if (!a || typeof a !== "object") continue;

    const rawName = a.name ?? a.title ?? a.label ?? a.desc ?? a.description ?? a.kind ?? a.type;
    const name = normalizeItemName(rawName);

    const amtRaw = safeNumber(a.amount ?? a.value ?? a.total ?? a.line_total ?? a.lineTotal ?? a.amt);

    let effectRaw = safeString(a.effect ?? a.sign ?? a.direction).toLowerCase().trim();

    // If missing effect, infer from common discount keywords or negative amount
    const nameLow = String(name || rawName || "").toLowerCase();
    const looksDiscount = /ส่วนลด|discount|coupon|promo|คูปอง|แต้ม|points/i.test(nameLow);
    if (!effectRaw) {
      if (looksDiscount) effectRaw = "subtract";
      else if (amtRaw != null && amtRaw < 0) effectRaw = "subtract";
      else effectRaw = "add";
    }
    if (effectRaw !== "subtract" && effectRaw !== "add") effectRaw = looksDiscount ? "subtract" : "add";

    const amount = amtRaw != null ? Math.abs(amtRaw) : null;

    let typeRaw = safeString(a.type ?? a.adjustment_type ?? a.adjustmentType ?? a.kind).toLowerCase().trim();
    if (!typeRaw) {
      if (looksDiscount) typeRaw = "discount";
      else if (/vat|ภาษี|tax/.test(nameLow)) typeRaw = "tax";
      else if (/service|ค่าบริการ/.test(nameLow)) typeRaw = "service_charge";
      else if (/fee|ค่าธรรมเนียม/.test(nameLow)) typeRaw = "fee";
      else if (/round|ปัดเศษ/.test(nameLow)) typeRaw = "rounding";
      else typeRaw = "other";
    }
    const allowed = new Set(["discount", "fee", "tax", "service_charge", "rounding", "other"]);
    if (!allowed.has(typeRaw)) typeRaw = "other";

    if (!name && amount == null) continue;

    out.push({
      name: name || typeRaw,
      amount: amount != null ? amount : null,
      effect: effectRaw,
      type: typeRaw,
    });

    if (out.length >= 20) break;
  }

  return out;
}

function pickDominantCategoryFromItems(items) {
  if (!Array.isArray(items) || !items.length) return null;

  const score = new Map();
  for (const it of items) {
    const k = normalizeCategoryKey(it?.category_key ?? it?.category);
    if (!k) continue;
    const w = safeNumber(it?.total) ?? safeNumber(it?.amount) ?? 1;
    score.set(k, (score.get(k) || 0) + (w || 1));
  }

  let best = null;
  let bestV = -1;
  for (const [k, v] of score.entries()) {
    if (v > bestV) {
      bestV = v;
      best = k;
    }
  }
  return best;
}

/** =========================
 * Credit card payment detection
 * ========================= */
function isCreditCardPaymentText(text) {
  const t = safeString(text).toLowerCase();
  if (!t) return false;

  const keys = [
    "ชำระบัตร",
    "ชำระค่าบัตร",
    "บัตรเครดิต",
    "บัตรกดเงินสด",
    "credit card",
    "debit card",
    "cardx",
    "หมายเลขบัตร",
    "เลขบัตร",
    "บัญชีรับชำระ",
    "ชำระขั้นต่ำ",
    "ยอดชำระ",
    "ค่างวด",
  ];

  return keys.some((k) => t.includes(k));
}

/** =========================
 * Account extraction helpers
 * ========================= */
function clampDigits(digits, { maxLen = 6, minLen = 3 } = {}) {
  const d = normalizeDigits(digits);
  if (!d) return null;
  if (d.length < minLen) return null;
  if (d.length <= maxLen) return d;
  return d.slice(-maxLen);
}

function lastN(d, n) {
  const s = normalizeDigits(d);
  if (!s) return null;
  if (s.length <= n) return s;
  return s.slice(-n);
}

function makeAccountVariants(d) {
  const s = normalizeDigits(d);
  if (!s) return null;
  return {
    last3: lastN(s, 3),
    last4: lastN(s, 4),
    last6: lastN(s, 6),
  };
}

function extractAccountCandidatesFromText(text) {
  const raw = toArabicDigits(String(text || ""));
  const lines = raw
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 220);

  const KEY_FROM = ["จาก", "โอนจาก", "from", "ผู้โอน", "ผู้ส่ง", "sender"];
  const KEY_TO = ["ไปยัง", "ไปที่", "to", "ผู้รับ", "receiver", "บัญชีรับ", "บัญชีรับชำระ", "เข้าบัญชี", "โอนไป"];
  const KEY_ACCOUNT = ["บัญชี", "account", "เลขบัญชี", "a/c", "acc"];
  const KEY_CARD = ["บัตร", "card", "หมายเลขบัตร", "เลขบัตร", "credit", "debit"];
  const KEY_REF = ["รหัสอ้างอิง", "ref", "reference", "trx", "transaction", "เลขที่รายการ", "หมายเลขอ้างอิง", "รหัสธุรกรรม"];
  const KEY_BILLER = ["biller", "biller id", "รหัสร้านค้า", "merchant id", "kb", "promptpay id"];

  const hasAny = (s, arr) => arr.some((k) => s.includes(k));
  const candidates = [];

  const rxCardMasked = /\b\d{4,8}[Xx*•]{2,14}\d{4}\b/g;
  const rxMaskedAcct = /(?:\d{2,4}[- ]?\d{0,2}[- ]?(?:[Xx*•]{2,}|\*{2,}|x{2,})[- ]?\d{2,8}(?:[- ]?\d{1,3})?)/g;
  const rxHyphenAcct = /\b\d{2,4}-\d{1,2}-\d{2,8}-\d{1,2}\b/g;
  const rxPlainDigits = /\b\d{3,16}\b/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const low = line.toLowerCase();

    const isRefLine = hasAny(low, KEY_REF);
    const isBillerLine = hasAny(low, KEY_BILLER);

    const allowPlainDigits = hasAny(low, KEY_FROM) || hasAny(low, KEY_TO) || hasAny(low, KEY_ACCOUNT) || hasAny(low, KEY_CARD);

    const tokens = [];
    for (const m of line.matchAll(rxCardMasked)) tokens.push({ token: m[0], kind: "card_masked" });
    for (const m of line.matchAll(rxHyphenAcct)) tokens.push({ token: m[0], kind: "acct_hyphen" });
    for (const m of line.matchAll(rxMaskedAcct)) tokens.push({ token: m[0], kind: "acct_masked" });
    if (allowPlainDigits) for (const m of line.matchAll(rxPlainDigits)) tokens.push({ token: m[0], kind: "digits" });

    for (const { token, kind } of tokens) {
      const dAll = normalizeDigits(token);
      if (!dAll || dAll.length < 3) continue;

      const isCard = kind === "card_masked" || hasAny(low, KEY_CARD);

      // Normalize:
      // - card -> last4
      // - account -> last up to 6
      const normalized = isCard ? lastN(dAll, 4) : clampDigits(dAll, { maxLen: 6, minLen: 3 });
      if (!normalized) continue;

      let score = 1;
      const hintFrom = hasAny(low, KEY_FROM);
      const hintTo = hasAny(low, KEY_TO);
      const hintAcct = hasAny(low, KEY_ACCOUNT);
      const hintCard = hasAny(low, KEY_CARD);

      if (hintFrom) score += 6;
      if (hintTo) score += 6;
      if (hintAcct) score += 2;
      if (hintCard) score += 4;
      if (isRefLine) score -= 8;
      if (isBillerLine) score -= 5;

      if (!isCard && dAll.length > 8) score -= 3;

      const role =
        hintFrom && !hintTo ? "from" : hintTo && !hintFrom ? "to" : hintCard && !hintFrom ? "to" : "unknown";

      candidates.push({
        role,
        digits: normalized,
        raw: token,
        line,
        lineIndex: i,
        score,
        isCard: !!isCard,
        variants: makeAccountVariants(normalized),
      });
    }
  }

  // de-dupe (keep best score)
  const bestByKey = new Map();
  for (const c of candidates) {
    const k = `${c.role}|${c.digits}`;
    const prev = bestByKey.get(k);
    if (!prev || c.score > prev.score) bestByKey.set(k, c);
  }

  return [...bestByKey.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 12);
}

function chooseFromToByCandidates({ candidates, modelFrom, modelTo, preferCardTo = false }) {
  const list = Array.isArray(candidates) ? candidates.slice() : [];

  // add model outputs as low-priority fallbacks
  const mf = clampDigits(modelFrom, { maxLen: 6, minLen: 3 });
  const mt = clampDigits(modelTo, { maxLen: 6, minLen: 3 });
  if (mf) list.push({ role: "from", digits: mf, score: 0.5, raw: String(modelFrom || ""), line: "", isCard: false, variants: makeAccountVariants(mf) });
  if (mt) list.push({ role: "to", digits: mt, score: 0.5, raw: String(modelTo || ""), line: "", isCard: false, variants: makeAccountVariants(mt) });

  const fromCandidates = list.filter((c) => c.role === "from").sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const toCandidates = list.filter((c) => c.role === "to").sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  let from = fromCandidates[0]?.digits || mf || null;
  let to = toCandidates[0]?.digits || mt || null;

  // credit card payment: prefer card last4 for "to"
  if (preferCardTo) {
    const bestToCard = toCandidates.find((c) => c.isCard && c.digits);
    if (bestToCard?.digits) to = bestToCard.digits;
  }

  if (from && to && from === to) {
    const altTo = toCandidates.find((c) => c.digits && c.digits !== from);
    if (altTo?.digits) to = altTo.digits;
  }

  return {
    from_account: from || null,
    to_account: to || null,
    from_account_variants: from ? makeAccountVariants(from) : null,
    to_account_variants: to ? makeAccountVariants(to) : null,
  };
}

function enhanceAccounts({ rawText, evidence, parsedFrom, parsedTo, preferCardTo = false }) {
  const combined = `${String(evidence || "")}\n${String(rawText || "")}`.trim();
  const candidates = extractAccountCandidatesFromText(combined);
  const picked = chooseFromToByCandidates({ candidates, modelFrom: parsedFrom, modelTo: parsedTo, preferCardTo });
  return { candidates, picked };
}

/** =========================
 * tx type refinement helpers
 * ========================= */
function refineTxTypeAndSubtype({ parsedTxType, evidence, rawText }) {
  const safeType = parsedTxType === "income" || parsedTxType === "transfer" ? parsedTxType : "expense";

  const combined = `${String(evidence || "")}\n${String(rawText || "")}`.trim();
  const isCC = isCreditCardPaymentText(combined);

  if (isCC) {
    // credit card payment: separate out of transfer
    return { tx_type: "expense", tx_subtype: "credit_card_payment", is_credit_card_payment: true };
  }

  // default
  return { tx_type: safeType, tx_subtype: safeType === "transfer" ? "transfer" : null, is_credit_card_payment: false };
}

async function callOpenAI({ base64, mimeType, filename, accounts = [], images = null }) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return {
      status: 400,
      body: { ok: false, code: "missing_openai_api_key", message: "OPENAI_API_KEY is not set" },
    };
  }

  // Users sometimes set OPENAI_MODEL to informal names like "chatgpt 5.0".
  // Normalize to valid model IDs.
  const normalizeOpenAIModel = (raw) => {
    const s = String(raw || "").trim();
    // Default to GPT-5.1 (vision-capable) if caller provides an empty value.
    if (!s) return "gpt-5.1";

    const low = s.toLowerCase();

    // Common informal variants → ChatGPT snapshot model id
    if (
      low === "5" ||
      low === "5.0" ||
      low === "gpt5" ||
      low === "gpt-5.0" ||
      low === "gpt-5.0.0" ||
      low === "chatgpt-5" ||
      low === "chatgpt-5.0" ||
      low === "chat gpt 5" ||
      low === "chat gpt 5.0" ||
      low === "chatgpt 5" ||
      low === "chatgpt 5.0"
    ) {
      return "gpt-5-chat-latest";
    }

    // Prefer explicit 5.1 when requested
    if (low === "5.1" || low === "gpt5.1" || low === "gpt-5.1" || low === "chatgpt 5.1" || low === "chatgpt-5.1") {
      return "gpt-5.1";
    }

    // Normalize dotted version to the stable id
    if (low === "gpt-5.0") return "gpt-5";

    // Otherwise trust caller value
    return s;
  };

  const normalizePaymentMethod = (raw) => {
    const s = String(raw || "").trim().toLowerCase();
    if (!s) return "unknown";
    if (s === "cash" || s === "เงินสด") return "cash";
    if (s === "card" || s === "credit" || s === "debit" || s === "บัตร" || s === "บัตรเครดิต" || s === "บัตรเดบิต") return "card";
    if (s === "promptpay" || s === "qr" || s === "พร้อมเพย์" || s === "พร้อมเพย์/qr" || s === "qr พร้อมเพย์") return "promptpay";
    if (s.includes("promptpay") || s.includes("พร้อมเพย์")) return "promptpay";
    if (s.includes("visa") || s.includes("master") || s.includes("amex") || s.includes("card") || s.includes("เครดิต") || s.includes("เดบิต")) return "card";
    if (s.includes("cash") || s.includes("เงินสด")) return "cash";
    return "unknown";
  };

  const digitsOnly = (s) =>
    String(s || "")
      .replace(/[๐-๙]/g, (ch) => "๐๑๒๓๔๕๖๗๘๙".indexOf(ch))
      .replace(/[^\d]/g, "");

  const compactAccountsForModel = (accounts) => {
    const cleanOneLine = (s, maxLen) => {
      const t = String(s || "")
        .replace(/[\r\n\t]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (!maxLen) return t;
      return t.length > maxLen ? t.slice(0, maxLen) : t;
    };

    const list = Array.isArray(accounts) ? accounts : [];
    return list
      .map((a) => {
        const id = cleanOneLine(a?.id || "", 60);
        if (!id) return null;
        const name = cleanOneLine(a?.name || "", 80);
        const type = cleanOneLine(a?.type || "", 30).toLowerCase();
        const cardLast4 = digitsOnly(a?.cardLast4 || a?.digits || "").slice(-4);
        const accDigits = digitsOnly(a?.accountNumber || a?.account_number || "");
        const accountLast6 = accDigits ? accDigits.slice(-6) : "";
        const accountLast4 = accDigits ? accDigits.slice(-4) : "";
        return {
          id,
          name: name || id,
          type: type || "other",
          cardLast4: cardLast4 || "",
          accountLast6: accountLast6 || "",
          accountLast4: accountLast4 || "",
        };
      })
      .filter(Boolean)
      .slice(0, 30);
  };

  const pickAccountIdFallback = ({ accounts, candidates = [] }) => {
    const list = Array.isArray(accounts) ? accounts : [];
    if (!list.length) return "";

    const cand = Array.isArray(candidates) ? candidates.map((x) => digitsOnly(x)).filter(Boolean) : [];
    if (!cand.length) return "";

    // Prefer exact last4 match on cardLast4, else last6/last4 match on account number
    for (const c of cand) {
      const last4 = c.slice(-4);
      if (last4) {
        const hit = list.find((a) => digitsOnly(a?.cardLast4).slice(-4) === last4);
        if (hit?.id) return String(hit.id);
      }
    }

    for (const c of cand) {
      const last6 = c.slice(-6);
      const last4 = c.slice(-4);
      const hit = list.find((a) => {
        const acc = digitsOnly(a?.accountNumber);
        if (!acc) return false;
        if (last6 && acc.endsWith(last6)) return true;
        if (last4 && acc.endsWith(last4)) return true;
        return false;
      });
      if (hit?.id) return String(hit.id);
    }

    return "";
  };

  // Default to GPT-5.1 (vision input) and Structured Outputs-capable models.
  // Override with OPENAI_MODEL. Optionally set OPENAI_FALLBACK_MODEL for retries (model-not-found / access issues).
  const model = normalizeOpenAIModel(process.env.OPENAI_MODEL || "gpt-5.1");
  const fallbackModel = normalizeOpenAIModel(process.env.OPENAI_FALLBACK_MODEL || "gpt-5.1");
  // Allow multi-view images (crops/tiles of the same doc) for better OCR.
  const imageList = Array.isArray(images) && images.length
    ? images
    : [{ base64, mimeType: mimeType || "image/jpeg", filename }];

  const firstMime = normalizeInputMime(imageList?.[0]?.mimeType || mimeType || "image/jpeg");
  const isPdf = firstMime === "application/pdf";
  const mtNorm = firstMime;

  const dataUrls = isPdf
    ? [`data:${mtNorm};base64,${String(imageList?.[0]?.base64 || base64 || "")}`]
    : imageList
        .slice(0, 3)
        .map((x) => {
          const mt = normalizeInputMime(x?.mimeType || mtNorm || "image/jpeg");
          const b64 = String(x?.base64 || "");
          if (!b64) return null;
          return `data:${mt};base64,${b64}`;
        })
        .filter(Boolean);

  if (!isPdf && (!Array.isArray(dataUrls) || dataUrls.length === 0)) {
    return {
      status: 400,
      body: { ok: false, code: "missing_image_data", message: "Missing image data" },
    };
  }
  const safeFilename = (() => {
    const raw = String(filename || imageList?.[0]?.filename || "").trim();
    if (raw) return raw;
    return isPdf ? "receipt.pdf" : "receipt.jpg";
  })();

  const accountsForModel = compactAccountsForModel(accounts);
  const accountsText = accountsForModel.length
    ? accountsForModel
        .map((a) => {
          const parts = [`id=${a.id}`, `name=${a.name}`, `type=${a.type}`];
          if (a.cardLast4) parts.push(`cardLast4=${a.cardLast4}`);
          if (a.accountLast6) parts.push(`accountLast6=${a.accountLast6}`);
          return `- ${parts.join(" | ")}`;
        })
        .join("\n")
    : "- (no accounts provided)";

  const prompt = `
You are an OCR+parser for Thai receipts and Thai bank/payment transfer slips used in a personal expense tracker.
Return STRICT JSON ONLY. No markdown. No extra text.

IMPORTANT:
- If multiple images are provided, they are CROPS/ENHANCEMENTS/TILES of the SAME document.
  Combine information across all images. Prefer the clearest text instance.
  Do NOT double-count or duplicate line items.

Decide doc_type:
- receipt: itemized receipt/invoice with purchased line items
- transfer_slip: bank transfer / payment slip / credit card payment slip
- bill_payment: utility bill payment slip
- unknown: otherwise

Rules:
- If unsure, use null.
- amount: grand total paid.
- evidence: include key lines you used (<= 220 chars).

Line items rules:
- If doc_type is transfer_slip or bill_payment: items MUST be [] (empty). Do NOT invent items.
- If doc_type is receipt: items MUST include ONLY purchased products/services with line_total > 0.
  * Skip any lines with 0 price (freebies, stamps, tasks, promotions, coupons, points, exchanged rights, etc.)
  * Skip summary lines (TOTAL, Subtotal, VAT, service charge, change, discounts)
  * Convenience-store receipts (e.g. 7-Eleven) often show a qty column at the start ("1") and also show promo lines like "0.00N" — treat those as NOT purchased items.

Classification:
- If it is clearly a transfer between accounts: tx_type MUST be 'transfer'.
- If it is a CREDIT CARD PAYMENT slip (Thai/EN keywords like ชำระบัตร, บัตรเครดิต, CardX, credit card, หมายเลขบัตร, บัญชีรับชำระ, ยอดชำระ, ชำระขั้นต่ำ):
  * tx_type MUST be 'transfer'
  * tx_subtype MUST be 'credit_card_payment'
  * is_credit_card_payment MUST be true
- Otherwise for normal transfer: tx_type='transfer', tx_subtype='transfer', is_credit_card_payment=false.
- For receipts (not transfer): tx_type='expense' or 'income'. tx_subtype should be null.

Account digits extraction:
- from_account / to_account MUST be digits only (Thai digits ok).
- For bank account: return ONLY last 3-6 digits.
- For card number: return ONLY last 4 digits.
- Do NOT use reference/biller/merchant ids as account.

Payment method + account selection:
- payment_method MUST be one of: cash, card, promptpay, unknown.
- account_id MUST be one of the ids from the Accounts list below, or null if you cannot determine it.
- If payment_method is cash and you see an account named "เงินสด" or type=cash, prefer that.

Accounts list (user's accounts; choose a matching id when possible):
${accountsText}

Allowed category_key values:
- expense: food, drinks, groceries, transport, fuel, bills, rent, shopping, coffee, dining, entertainment, travel, health, fitness, beauty, pets, kids, home, education, work, phone_internet, subscriptions, fees, insurance, donation, gift, other, mixed
- income: salary, bonus, freelance, business, investment, interest, dividend, refund, gift_income, other_income
- transfer: transfer

Notes:
- If a receipt contains multiple different categories, set the top-level category_key to "mixed".
- Each item in items[] MUST have its own category_key (use "other" if uncertain).

Schema (ALL keys must exist; use null if unknown):
{
  "doc_type": "receipt"|"transfer_slip"|"bill_payment"|"unknown",
  "tx_type": "expense"|"income"|"transfer",
  "tx_subtype": "transfer"|"credit_card_payment"|null,
  "is_credit_card_payment": boolean|null,
  "payment_method": "cash"|"card"|"promptpay"|"unknown",
  "account_id": string|null,
  "amount": number|null,
  "currency": string|null,
  "date": "YYYY-MM-DD"|null,
  "merchant": string|null,
  "note": string|null,
  "ref": string|null,
  "category_key": string|null,
  "items": [
    {
      "name": string,
      "qty": number|null,
      "unit_price": number|null,
      "line_total": number|null,
      "category_key": string|null,
      "children": [
        { "name": string, "qty": number|null, "unit_price": number|null, "line_total": number|null }
      ]|null
    }
  ],
  "adjustments": [
    { "name": string, "amount": number|null, "effect": "subtract"|"add", "type": "discount"|"fee"|"tax"|"service_charge"|"rounding"|"other"|null }
  ],
  "from_account": string|null,
  "to_account": string|null,
  "evidence": string|null,
  "confidence": { "overall": number|null, "amount": number|null, "date": number|null, "merchant": number|null, "items": number|null },
  "flags": { "has_line_items": boolean, "has_zero_price_lines": boolean, "has_discount_lines": boolean, "needs_human_review": boolean }
}

Account selection rules:

Line-item/adjustment rules (VERY IMPORTANT):
- For receipts, use "items" ONLY for purchased goods/services with non-negative line_total.
- Put discounts/coupons/promotions/points/rounding/taxes/service charges into "adjustments" (NOT as negative items).
  * Use a POSITIVE amount in adjustments, and set effect:
    - "subtract" for discounts/coupons/promotions (e.g. ส่วนลด -20 -> {amount: 20, effect: "subtract", type: "discount"})
    - "add" for fees/tax/service charge/rounding up (type: "fee"/"tax"/"service_charge"/"rounding"/"other")
- If the receipt shows a discount line like "ส่วนลด -฿20", represent it as an adjustment with effect="subtract".
- "children" is for add-ons/modifiers/options under a parent item (e.g. กาแฟ + shot + syrup).
  * Prefer setting the parent "line_total" to the FINAL total for that item INCLUDING children.
  * Still include children with their own line_total for detail (they are considered included in the parent total).

- Use the accounts list below to choose account_id when possible.
- Match by digits shown on the slip/receipt:
  * Card number: match by last 4 digits (cardLast4)
  * Bank account number: match by last 4-6 digits (accountLast6)
- If payment_method is cash and you cannot find digits, prefer the cash account if it exists.
- If you cannot determine, return account_id = null.

Accounts available:
${accountsText}
`;

  const text = {
    format: {
      type: "json_schema",
      name: "scan_result",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: [
          "doc_type",
          "tx_type",
          "tx_subtype",
          "is_credit_card_payment",
          "payment_method",
          "account_id",
          "amount",
          "currency",
          "date",
          "merchant",
          "note",
          "ref",
          "category_key",
          "items",
          "adjustments",
          "from_account",
          "to_account",
          "evidence",
          "confidence",
          "flags"
        ],
        properties: {
          doc_type: { type: "string", enum: ["receipt", "transfer_slip", "bill_payment", "unknown"] },
          tx_type: { type: "string", enum: ["expense", "income", "transfer"] },
          tx_subtype: { anyOf: [{ type: "string", enum: ["transfer", "credit_card_payment"] }, { type: "null" }] },
          is_credit_card_payment: { anyOf: [{ type: "boolean" }, { type: "null" }] },
          payment_method: { type: "string", enum: ["cash", "card", "promptpay", "unknown"] },
          account_id: { anyOf: [{ type: "string" }, { type: "null" }] },
          amount: { anyOf: [{ type: "number" }, { type: "null" }] },
          currency: { anyOf: [{ type: "string" }, { type: "null" }] },
          date: { anyOf: [{ type: "string" }, { type: "null" }] },
          merchant: { anyOf: [{ type: "string" }, { type: "null" }] },
          note: { anyOf: [{ type: "string" }, { type: "null" }] },
          ref: { anyOf: [{ type: "string" }, { type: "null" }] },
          category_key: { anyOf: [{ type: "string" }, { type: "null" }] },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "qty", "unit_price", "line_total", "category_key"],
              properties: {
                name: { type: "string" },
                qty: { anyOf: [{ type: "number" }, { type: "null" }] },
                unit_price: { anyOf: [{ type: "number" }, { type: "null" }] },
                line_total: { anyOf: [{ type: "number" }, { type: "null" }] },
                category_key: { anyOf: [{ type: "string" }, { type: "null" }] },
                children: {
                  anyOf: [
                    {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["name", "qty", "unit_price", "line_total"],
                        properties: {
                          name: { type: "string" },
                          qty: { anyOf: [{ type: "number" }, { type: "null" }] },
                          unit_price: { anyOf: [{ type: "number" }, { type: "null" }] },
                          line_total: { anyOf: [{ type: "number" }, { type: "null" }] }
                        }
                      }
                    },
                    { type: "null" }
                  ]
                }
              }
            }
          },
          adjustments: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "amount", "effect", "type"],
              properties: {
                name: { type: "string" },
                amount: { anyOf: [{ type: "number" }, { type: "null" }] },
                effect: { type: "string", enum: ["subtract", "add"] },
                type: { anyOf: [{ type: "string", enum: ["discount", "fee", "tax", "service_charge", "rounding", "other"] }, { type: "null" }] }
              }
            }
          },
          from_account: { anyOf: [{ type: "string" }, { type: "null" }] },
          to_account: { anyOf: [{ type: "string" }, { type: "null" }] },
          evidence: { anyOf: [{ type: "string" }, { type: "null" }] },
          confidence: {
            type: "object",
            additionalProperties: false,
            required: ["overall", "amount", "date", "merchant", "items"],
            properties: {
              overall: { anyOf: [{ type: "number" }, { type: "null" }] },
              amount: { anyOf: [{ type: "number" }, { type: "null" }] },
              date: { anyOf: [{ type: "number" }, { type: "null" }] },
              merchant: { anyOf: [{ type: "number" }, { type: "null" }] },
              items: { anyOf: [{ type: "number" }, { type: "null" }] }
            }
          },
          flags: {
            type: "object",
            additionalProperties: false,
            required: ["has_line_items", "has_zero_price_lines", "has_discount_lines", "needs_human_review"],
            properties: {
              has_line_items: { type: "boolean" },
              has_zero_price_lines: { type: "boolean" },
              has_discount_lines: { type: "boolean" },
              needs_human_review: { type: "boolean" }
            }
          }
        }
      }
    }
  };

  const buildContent = () => {
    const content = [{ type: "input_text", text: prompt }];
    if (isPdf) {
      content.push({ type: "input_file", filename: safeFilename, file_data: dataUrls[0] });
      return content;
    }
    for (const u of dataUrls.slice(0, 3)) {
      content.push({ type: "input_image", image_url: u });
    }
    return content;
  };

  const buildPayload = ({ m, useSchema }) => ({
    model: m,
    temperature: 0,
    text: useSchema ? text : { format: { type: "json_object" } },
    input: [
      {
        role: "user",
        content: buildContent(),
      },
    ],
  });

  const isModelNotFound = (msg) =>
    /model/i.test(msg) &&
    /(not found|does not exist|unknown|you do not have access|access denied|permission)/i.test(msg);

  const isSchemaUnsupported = (msg) =>
    /(json_schema|response_format|text\.format|structured\s*outputs)/i.test(msg) &&
    /(not supported|unsupported|invalid|not allowed|unknown|must be one of|only supported)/i.test(msg);

  const parseOpenAIError = (status, jj) => {
    const e = jj?.error || jj || {};
    return {
      status,
      message: String(e?.message || "OpenAI request failed"),
      type: e?.type || null,
      code: e?.code || null,
      param: e?.param || null,
    };
  };

  const doRequest = async ({ m, useSchema }) => {
    const r = await fetchWithTimeout(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildPayload({ m, useSchema })),
    });

    const jj = await r.json().catch(() => null);
    const requestId = r.headers?.get ? r.headers.get("x-request-id") : null;
    return { r, jj, requestId };
  };

  // Attempt order:
  // 1) primary model + Structured Outputs (json_schema)
  // 2) if model is not found / access denied → retry fallback model + json_schema
  // 3) if json_schema is unsupported → retry JSON mode (json_object)
  // 4) final attempt: fallback model + json_object
  let usedModel = model;
  let usedSchema = true;

  let { r, jj: json, requestId } = await doRequest({ m: model, useSchema: true });

  if (!r.ok) {
    const err1 = parseOpenAIError(r.status, json);
    if (isModelNotFound(err1.message) && fallbackModel && fallbackModel !== model) {
      const t2 = await doRequest({ m: fallbackModel, useSchema: true });
      r = t2.r;
      json = t2.jj;
      requestId = t2.requestId;
      usedModel = fallbackModel;
      usedSchema = true;
    }
  }

  if (!r.ok) {
    const err2 = parseOpenAIError(r.status, json);
    if (isSchemaUnsupported(err2.message)) {
      const t3 = await doRequest({ m: usedModel, useSchema: false });
      r = t3.r;
      json = t3.jj;
      requestId = t3.requestId;
      usedSchema = false;
    }
  }

  if (!r.ok && fallbackModel && fallbackModel !== usedModel) {
    const err3 = parseOpenAIError(r.status, json);
    if (isModelNotFound(err3.message) || isSchemaUnsupported(err3.message)) {
      const t4 = await doRequest({ m: fallbackModel, useSchema: false });
      r = t4.r;
      json = t4.jj;
      requestId = t4.requestId;
      usedModel = fallbackModel;
      usedSchema = false;
    }
  }

  if (!r.ok) {
    const err = parseOpenAIError(r.status, json);
    const msg = err.message || "OpenAI request failed";

    let tip = null;
    if (isModelNotFound(msg)) {
      tip = "Set OPENAI_MODEL to a model your key can access (recommended: gpt-5.1).";
    } else if (isSchemaUnsupported(msg)) {
      tip =
        "This model may not support Structured Outputs (json_schema). Use a supported model (e.g. gpt-5.1 or gpt-4o-mini) or let the server fall back to JSON mode.";
    } else if (/api key|incorrect api key|unauthorized/i.test(msg) || r.status === 401) {
      tip = "Check OPENAI_API_KEY in Vercel Project Settings → Environment Variables (and redeploy).";
    } else if (/quota|insufficient|billing|payment/i.test(msg) || r.status === 402) {
      tip = "Your OpenAI project may have insufficient quota/billing. Check usage/billing settings.";
    }

    return {
      status: r.status,
      body: {
        ok: false,
        code: "openai_error",
        message: msg,
        model: usedModel,
        format: usedSchema ? "json_schema" : "json_object",
        request_id: requestId || null,
        openai_error: {
          type: err.type,
          code: err.code,
          param: err.param,
        },
        tip,
      },
    };
  }

  const parsedObj = findFirstParsedObject(json);
  const outputText = extractResponsesOutputText(json);
  const parsed = parsedObj || safeJsonParseMaybe(outputText);

  if (!parsed) {
    return {
      status: 200,
      body: {
        ok: false,
        code: SCAN_PARSE_ERROR_CODE,
        message: "Model output is not valid JSON",
        rawText: outputText,
        model: usedModel,
      },
    };
  }

  const parsedType = String(parsed.tx_type || "").toLowerCase();
  const evidence0 = String(parsed.evidence ?? outputText ?? "").slice(0, 220);

  // ---- confidence + flags (early; used for fallbacks) ----
  const confIn0 = parsed?.confidence && typeof parsed.confidence === "object" ? parsed.confidence : {};
  const needsReviewFlag = !!parsed?.needs_review;
  const itemsConfFlag = clamp01(typeof confIn0.items === "number" ? confIn0.items : null);

  // credit card payment: separate out of transfer
  const refined = refineTxTypeAndSubtype({
    parsedTxType: parsedType,
    evidence: evidence0,
    rawText: outputText,
  });

  const rawScanText = normalizeScanText(`${String(parsed?.evidence || "")}\n${String(outputText || "")}`);
  const textDocType = detectScanTextDocType(rawScanText);
  const amountFallback = extractLikelyAmountFromScanText(rawScanText, { docType: textDocType });
  const merchantFallback = extractMerchantFromScanText(rawScanText, { docType: textDocType });

  const parsedAmount = typeof parsed.amount === "number" ? parsed.amount : parsed.amount != null ? Number(parsed.amount) : null;
  let amount = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : amountFallback;

  const merchantRaw = parsed?.merchant != null ? String(parsed.merchant).trim() : "";
  const merchant = merchantRaw || merchantFallback || null;
  const note = parsed?.note != null ? String(parsed.note) : merchant != null ? String(merchant) : null;

  let items = normalizeItems(parsed?.items ?? parsed?.line_items ?? parsed?.lines ?? null);

  let adjustments = normalizeAdjustments(parsed?.adjustments ?? parsed?.adjustment_lines ?? parsed?.adjustments_lines ?? parsed?.discounts ?? null);

  // ---- doc_type normalization (early) ----
  const dtRaw = safeString(parsed?.doc_type ?? parsed?.docType).toLowerCase();
  const allowedDt = new Set(["receipt", "transfer_slip", "bill_payment", "unknown"]);
  let doc_type = allowedDt.has(dtRaw) ? dtRaw : "";

  // If model didn't provide doc_type, infer lightly from refined tx_type and presence of line items
  if (!doc_type) {
    if (textDocType) doc_type = textDocType;
    else if (refined.tx_type === "transfer") doc_type = "transfer_slip";
    else if (Array.isArray(items) && items.some((it) => (safeNumber(it?.total) || 0) > 0)) doc_type = "receipt";
    else doc_type = "unknown";
  }

  // ---- Items-only fallback (receipt line items) ----
  // This endpoint focuses on receipts; a targeted line-item pass is noticeably more reliable
  // for 7-Eleven style layouts (qty column + price on the right), especially on mobile screenshots.
  const positiveItemCount = items.filter((it) => (safeNumber(it?.total) || 0) > 0).length;
  const combinedTextForHeuristics = normalizeScanText(`${String(evidence0 || "")}\n${String(outputText || "")}`);
  const looksLikeReceipt =
    textDocType === "receipt" ||
    /รายการสินค้า|รายการสั่งซื้อ|ยอดสุทธิ|รวม\s*สุทธิ|สาขา|7\s*-?\s*eleven|7delivery|all\s*member/i.test(combinedTextForHeuristics);
  const looksLikeTransferSlip = textDocType === "transfer_slip" || textDocType === "bill_payment";
  const strongTransferSlip =
    (doc_type === "transfer_slip" || doc_type === "bill_payment" || looksLikeTransferSlip) &&
    !looksLikeReceipt;

  const shouldItemsFallback =
    !strongTransferSlip &&
    (doc_type === "receipt" || looksLikeReceipt || positiveItemCount < 2) &&
    (positiveItemCount < 2 || needsReviewFlag || (itemsConfFlag != null && itemsConfFlag < 0.75));

  if (shouldItemsFallback) {
    const itemsModel = normalizeOpenAIModel(process.env.OPENAI_ITEMS_MODEL || usedModel || "gpt-5.1");

    const itemsText = {
      format: {
        type: "json_schema",
        name: "receipt_items_only",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["payment_method", "account_id", "items", "adjustments"],
          properties: {
            payment_method: { type: "string", enum: ["cash", "card", "promptpay", "unknown"] },
            account_id: { anyOf: [{ type: "string" }, { type: "null" }] },
            items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["name", "qty", "unit_price", "line_total", "category_key"],
                properties: {
                  name: { type: "string" },
                  qty: { anyOf: [{ type: "number" }, { type: "null" }] },
                  unit_price: { anyOf: [{ type: "number" }, { type: "null" }] },
                  line_total: { anyOf: [{ type: "number" }, { type: "null" }] },
                  category_key: { anyOf: [{ type: "string" }, { type: "null" }] },
                  children: {
                    anyOf: [
                      {
                        type: "array",
                        items: {
                          type: "object",
                          additionalProperties: false,
                          required: ["name", "qty", "unit_price", "line_total"],
                          properties: {
                            name: { type: "string" },
                            qty: { anyOf: [{ type: "number" }, { type: "null" }] },
                            unit_price: { anyOf: [{ type: "number" }, { type: "null" }] },
                            line_total: { anyOf: [{ type: "number" }, { type: "null" }] }
                          }
                        }
                      },
                      { type: "null" }
                    ]
                  }
                },
              },
            },
            adjustments: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["name", "amount", "effect", "type"],
                properties: {
                  name: { type: "string" },
                  amount: { anyOf: [{ type: "number" }, { type: "null" }] },
                  effect: { type: "string", enum: ["subtract", "add"] },
                  type: {
                    anyOf: [
                      { type: "string", enum: ["discount", "fee", "tax", "service_charge", "rounding", "other"] },
                      { type: "null" }
                    ]
                  }
                }
              }
            },
          },
        },
      },
    };

    const itemsPrompt = `
You are an OCR + receipt line-item extractor for Thai receipts (e.g., 7-Eleven).
Return STRICT JSON ONLY. No markdown. No extra text.

Rules (VERY IMPORTANT):
1) Extract ONLY purchased products/services under the receipt's item list section (often titled "รายการสินค้า").
2) Include ONLY items with line_total > 0.
3) EXCLUDE any 0.00 / 0.00N lines (freebies, stamps, missions, promotions, points, coupons).
4) EXCLUDE summary lines (ยอดสุทธิ, รวม, TOTAL, VAT, change, TID, R#, store code, phone numbers).
4.1) BUT: extract discount/fee/tax/service charge/rounding lines into "adjustments" (NOT as negative items).
     - Use POSITIVE amount, and set effect="subtract" for discounts (เช่น ส่วนลด -20) or effect="add" for fees/tax.
5) Preserve item names AS SHOWN (Thai/English). Do NOT replace with generic labels.
6) If the receipt shows a quantity column (often a leading "1"), set qty accordingly.
7) If unit price is not shown, set unit_price=null.
8) Numbers: use decimal with dot, no currency symbol.

Payment method + account selection:
- payment_method MUST be one of: cash, card, promptpay, unknown.
- account_id MUST be one of the ids from the Accounts list below, or null if you cannot determine it.

Accounts list:
${accountsText}

Category:
- For each item, output category_key from this allowed set:
  food, drinks, groceries, transport, fuel, bills, rent, shopping, coffee, dining, entertainment, travel, health, fitness, beauty, pets, kids, home, education, work, phone_internet, subscriptions, fees, insurance, donation, gift, other, mixed

Output JSON schema:
{ "payment_method": "cash"|"card"|"promptpay"|"unknown", "account_id": string|null, "items": [ { "name": string, "qty": number|null, "unit_price": number|null, "line_total": number|null, "category_key": string|null, "children": [ { "name": string, "qty": number|null, "unit_price": number|null, "line_total": number|null } ]|null } ], "adjustments": [ { "name": string, "amount": number|null, "effect": "subtract"|"add", "type": "discount"|"fee"|"tax"|"service_charge"|"rounding"|"other"|null } ] }
`;

    try {
      const rr = await fetchWithTimeout(OPENAI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: itemsModel,
          temperature: 0,
          max_output_tokens: 1600,
          text: itemsText,
          input: [
            {
              role: "user",
              content: (() => {
                const c = [{ type: "input_text", text: itemsPrompt }];
                if (isPdf) {
                  c.push({ type: "input_file", filename: safeFilename, file_data: dataUrls[0] });
                  return c;
                }
                for (const u of dataUrls.slice(0, 3)) {
                  c.push({ type: "input_image", image_url: u });
                }
                return c;
              })(),
            },
          ],
        }),
      });

      const jj = await rr.json().catch(() => null);
      if (rr.ok) {
        const itemsObj = findFirstParsedObject(jj) || safeJsonParseMaybe(extractResponsesOutputText(jj));
        const extracted = Array.isArray(itemsObj?.items) ? itemsObj.items : [];
        const extractedAdjustments = Array.isArray(itemsObj?.adjustments) ? itemsObj.adjustments : [];
        const extractedPaymentMethod = normalizePaymentMethod(itemsObj?.payment_method ?? itemsObj?.paymentMethod);
        const extractedAccountIdRaw = String(itemsObj?.account_id ?? itemsObj?.accountId ?? "").trim();
        const cleaned = extracted
          .map((it) => ({
            name: normalizeItemName(it?.name ?? it?.title ?? it?.item),
            qty: safeNumber(it?.qty ?? it?.quantity),
            unit_price: safeNumber(it?.unit_price ?? it?.unitPrice ?? it?.price),
            total: safeNumber(it?.line_total ?? it?.lineTotal ?? it?.total ?? it?.amount),
            children: Array.isArray(it?.children)
              ? it.children
                  .map((ch) => ({
                    name: normalizeItemName(ch?.name ?? ch?.title ?? ch?.item),
                    qty: safeNumber(ch?.qty ?? ch?.quantity),
                    unit_price: safeNumber(ch?.unit_price ?? ch?.unitPrice ?? ch?.price),
                    total: safeNumber(ch?.line_total ?? ch?.lineTotal ?? ch?.total ?? ch?.amount),
                  }))
                  .filter((ch) => (ch?.name || "") && Number.isFinite(ch?.total || 0) && (ch?.total || 0) > 0)
                  .slice(0, 10)
              : null,
            category_key:
              normalizeCategoryKey(it?.category_key ?? it?.categoryKey ?? it?.category) ||
              inferCategoryFromText(it?.name) ||
              null,
          }))
          .filter((it) => it.name && Number.isFinite(it.total) && it.total > 0)
          .slice(0, 40);

        if (cleaned.length >= 1) {
          items = cleaned;

          const cleanedAdj = normalizeAdjustments(extractedAdjustments);
          if (cleanedAdj.length && (!Array.isArray(adjustments) || !adjustments.length)) {
            adjustments = cleanedAdj;
          }
          // If the first pass couldn't decide doc_type, upgrade to receipt when items clearly exist
          if (doc_type !== "receipt") doc_type = "receipt";

          // Opportunistic merge back payment method/account choice from items-only pass
          if (extractedPaymentMethod && extractedPaymentMethod !== "unknown" && String(parsed?.payment_method || "").trim() === "") {
            parsed.payment_method = extractedPaymentMethod;
          }

          if (extractedAccountIdRaw) {
            parsed.account_id = extractedAccountIdRaw;
          }
        }
      }
    } catch {
      // ignore fallback errors
    }
  }

  if (!(Number.isFinite(amount) && amount > 0) && doc_type !== "transfer_slip" && doc_type !== "bill_payment") {
    const itemsSum = (items || []).reduce((sum, it) => sum + (safeNumber(it?.total) || 0), 0);
    const adjustmentsSigned = (adjustments || []).reduce((sum, adj) => {
      const value = safeNumber(adj?.amount) || 0;
      const effect = String(adj?.effect || "").toLowerCase().trim();
      return sum + (effect === "subtract" ? -value : value);
    }, 0);
    const derivedTotal = itemsSum + adjustmentsSigned;
    if (derivedTotal > 0) amount = derivedTotal;
  }

  let category =
    normalizeCategoryKey(parsed?.category_key) ||
    normalizeCategoryKey(parsed?.category) ||
    (refined.tx_type === "transfer" ? "transfer" : null);

  if (refined.tx_type !== "transfer") {
    const fromItems = pickDominantCategoryFromItems(items);
    const fromText = inferCategoryFromText(`${merchant || ""} ${note || ""} ${outputText || ""}`);
    if (!category) category = fromItems || fromText || "other";
    if (category === "other") category = fromItems || fromText || "other";
  } else {
    category = "transfer";
  }

  // Enforce: transfer slips / bill payments must not contain purchase line items
  let finalItems = items;
  let finalAdjustments = adjustments;
  if (doc_type === "transfer_slip" || doc_type === "bill_payment" || refined.tx_type === "transfer") {
    finalItems = [];
    finalAdjustments = [];
  }

  // ---- payment method + account id (may be refined again after account candidate extraction) ----
  const accountsList = Array.isArray(accounts) ? accounts : [];
  let payment_method = normalizePaymentMethod(parsed?.payment_method ?? parsed?.paymentMethod);
  let account_id = parsed?.account_id != null || parsed?.accountId != null ? String((parsed?.account_id ?? parsed?.accountId) || "").trim() : "";
  if (!account_id) account_id = "";

  // Validate account_id against provided accounts
  if (account_id && accountsList.length && !accountsList.some((a) => String(a?.id || "") === account_id)) {
    account_id = "";
  }

  // ---- confidence + flags (hybrid guardrails) ----
  const confIn = parsed?.confidence && typeof parsed.confidence === "object" ? parsed.confidence : {};
  const confidence = {
    overall: clamp01(typeof confIn.overall === "number" ? confIn.overall : null),
    amount: clamp01(typeof confIn.amount === "number" ? confIn.amount : null),
    date: clamp01(typeof confIn.date === "number" ? confIn.date : null),
    merchant: clamp01(typeof confIn.merchant === "number" ? confIn.merchant : null),
    items: clamp01(typeof confIn.items === "number" ? confIn.items : null),
  };

  const flagsIn = parsed?.flags && typeof parsed.flags === "object" ? parsed.flags : {};
  const hasPositiveItems = Array.isArray(finalItems) && finalItems.some((it) => (safeNumber(it?.total) || 0) > 0);
  const hasZeroItems = Array.isArray(items) && items.some((it) => (safeNumber(it?.total) || 0) == 0);
  const hasDiscountHint = /ส่วนลด|discount|คูปอง|coupon|แต้ม|points|โปรโมชั่น|promo/i.test(String(outputText || ""));
  const hasDiscountAdj = Array.isArray(finalAdjustments) && finalAdjustments.some((a) => String(a?.effect || "").toLowerCase().trim() === "subtract");

  let needsReview = false;
  if (confidence.overall != null && confidence.overall < 0.6) needsReview = true;
  if (doc_type === "receipt" && amount != null && hasPositiveItems) {
    const itemsSum = finalItems.reduce((s, it) => s + (safeNumber(it?.total) || 0), 0);
    const adjSigned = (finalAdjustments || []).reduce((s, a) => {
      const amt = safeNumber(a?.amount) || 0;
      const eff = String(a?.effect || "").toLowerCase().trim();
      return s + (eff === "subtract" ? -amt : amt);
    }, 0);
    const signedSum = itemsSum + adjSigned;
    const diff = signedSum > 0 ? Math.abs(signedSum - amount) : 0;
    if (diff >= 2) needsReview = true;
  }

  const flags = {
    has_line_items: typeof flagsIn.has_line_items === "boolean" ? flagsIn.has_line_items : !!hasPositiveItems,
    has_zero_price_lines: typeof flagsIn.has_zero_price_lines === "boolean" ? flagsIn.has_zero_price_lines : !!hasZeroItems,
    has_discount_lines: typeof flagsIn.has_discount_lines === "boolean" ? flagsIn.has_discount_lines : (!!hasDiscountAdj || !!hasDiscountHint),
    needs_human_review: typeof flagsIn.needs_human_review === "boolean" ? flagsIn.needs_human_review : !!needsReview,
  };

  const normalized = {
    doc_type,

    tx_type: refined.tx_type,
    tx_subtype: refined.tx_subtype,
    is_credit_card_payment: refined.is_credit_card_payment,

    payment_method,
    account_id: account_id ? account_id : null,

    amount: Number.isFinite(amount) ? amount : null,
    currency: parsed?.currency != null && String(parsed.currency).trim() ? String(parsed.currency).trim().toUpperCase() : null,
    date: normalizeScannedDate(parsed.date) || (parsed.date ? String(parsed.date).slice(0, 10) : null),
    merchant,
    note,
    ref: parsed.ref ? String(parsed.ref).trim() : null,

    category,
    category_key: category,

    items: finalItems,

    adjustments: finalAdjustments,

    from_account: parsed.from_account ? clampDigits(parsed.from_account, { maxLen: 6, minLen: 3 }) : null,
    to_account: parsed.to_account ? clampDigits(parsed.to_account, { maxLen: 6, minLen: 3 }) : null,
    evidence: evidence0,
    confidence,
    flags,
  };

  // Enhancement: robust account mapping (prefer card last4 when credit card payment)
  const enhanced = enhanceAccounts({
    rawText: outputText,
    evidence: normalized.evidence,
    parsedFrom: normalized.from_account,
    parsedTo: normalized.to_account,
    preferCardTo: refined.is_credit_card_payment,
  });

  normalized.from_account = enhanced.picked.from_account;
  normalized.to_account = enhanced.picked.to_account;
  normalized.from_account_variants = enhanced.picked.from_account_variants;
  normalized.to_account_variants = enhanced.picked.to_account_variants;

  // Optional debug fields (won't break existing features)
  normalized.account_candidates = enhanced.candidates?.map((c) => ({
    role: c.role,
    digits: c.digits,
    score: c.score,
    raw: c.raw,
    line: String(c.line || "").slice(0, 140),
    isCard: !!c.isCard,
    variants: makeAccountVariants(c.digits),
  }));

  // ---- final payment method heuristics ----
  if (!normalized.payment_method) normalized.payment_method = "unknown";
  if (normalized.payment_method === "unknown") {
    const t = String(combinedTextForHeuristics || "").toLowerCase();
    if (/promptpay|พร้อมเพย์|qr/.test(t)) normalized.payment_method = "promptpay";
    else if (refined.is_credit_card_payment) normalized.payment_method = "card";
    else if (/visa|master|amex|card|เครดิต|เดบิต|บัตร/.test(t)) normalized.payment_method = "card";
    else if (/cash|เงินสด/.test(t)) normalized.payment_method = "cash";
    else {
      const hasCardCand = (enhanced.candidates || []).some((c) => c?.isCard);
      if (hasCardCand) normalized.payment_method = "card";
    }

    // Default payment method: cash (user preference)
    if (normalized.payment_method === "unknown") normalized.payment_method = "cash";
  }

  // ---- final account id selection ----
  if (!normalized.account_id) {
    // 1) digits-based match from candidates
    const candDigits = (enhanced.candidates || [])
      .map((c) => c?.digits)
      .filter(Boolean)
      .concat([normalized.from_account, normalized.to_account].filter(Boolean));

    const fallbackId = pickAccountIdFallback({ accounts: accountsList, candidates: candDigits });
    if (fallbackId) normalized.account_id = fallbackId;
  }

  // 2) cash default
  if (!normalized.account_id && accountsList.length && normalized.payment_method === "cash") {
    const cashAcc = accountsList.find((a) => {
      const type = String(a?.type || "").toLowerCase();
      const name = String(a?.name || "").toLowerCase();
      const id = String(a?.id || "").toLowerCase();
      return type === "cash" || id.includes("cash") || name.includes("เงินสด") || name.includes("cash");
    });
    if (cashAcc?.id) normalized.account_id = String(cashAcc.id);
  }

  if (!normalized.account_id) normalized.account_id = null;

  const schemaNormalized = normalizeScanResponse(normalized, { defaultErrorCode: SCAN_PARSE_ERROR_CODE });
  normalized.merchant = schemaNormalized.merchant;
  normalized.amount = schemaNormalized.amount;
  normalized.date = schemaNormalized.date;
  normalized.items = Array.isArray(normalized.items) && normalized.items.length ? normalized.items : schemaNormalized.items;
  normalized.confidence = normalized.confidence || (schemaNormalized.confidence != null ? { overall: schemaNormalized.confidence } : null);
  normalized.errors = schemaNormalized.errors;

  return {
    status: 200,
    body: { ok: true, data: normalized, rawText: outputText, model },
  };
}

export default async function handler(req, res) {
  try {
    setSecurityHeadersModule(res);
    if (!enforceAccessModule(req, res)) return;
    if (!enforceRateLimitModule(req, res)) return;
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).json({ ok: false, code: "method_not_allowed", message: "Use POST" });
      return;
    }

    const ct = _getContentType(req);

    // 1) multipart/form-data
    if (ct.includes("multipart/form-data")) {
      const { files, fields } = await _parseMultipart(req, { maxBytes: MAX_UPLOAD_BYTES, maxFiles: 3 });
      const accounts = (() => {
        try {
          const f = fields && typeof fields === 'object' ? fields : {};
          const raw = f.accounts ?? f.accountsContext ?? '';
          const parsed = safeJsonParseMaybe(raw);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
      if (!Array.isArray(files) || files.length === 0) {
        res.status(400).json({ ok: false, code: "missing_file", message: "No file uploaded" });
        return;
      }

      // Allow multi-view uploads (2-3 images) to improve OCR on long receipts.
      // If a PDF is present, we only use the first PDF file.
      const normalized = files
        .map((f) => {
          const mt = assertAllowedInputMime(f?.mimeType || "");
          if (!mt) return null;
          const buf = f?.fileBuffer;
          if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) return null;
          return {
            base64: buf.toString("base64"),
            mimeType: mt,
            filename: String(f?.filename || "").trim() || (mt === "application/pdf" ? "receipt.pdf" : "receipt.jpg"),
          };
        })
        .filter(Boolean)
        .slice(0, 3);

      if (!normalized.length) {
        res.status(415).json({ ok: false, code: "unsupported_media_type", message: "Only images (jpeg/png/webp) and PDF are allowed" });
        return;
      }

      const pdf = normalized.find((x) => x.mimeType === "application/pdf");
      const out = pdf
        ? await callOpenAI({ base64: pdf.base64, mimeType: pdf.mimeType, filename: pdf.filename, accounts })
        : await callOpenAI({ images: normalized, accounts });
      res.status(out.status).json(out.body);
      return;
    }

    // 2) JSON: accept { base64, mimeType } OR { imageDataUrl }
    const body = await parseJsonBody(req, MAX_JSON_BODY_BYTES);

    const accounts = Array.isArray(body?.accounts)
      ? body.accounts
      : Array.isArray(body?.accountsContext)
      ? body.accountsContext
      : [];

    // Multi-image JSON payload (optional): { images: [dataUrl1, dataUrl2, ...] }
    // Each image should be a crop/enhancement of the same document.
    const imagesList = Array.isArray(body?.images)
      ? body.images
      : Array.isArray(body?.imageDataUrls)
      ? body.imageDataUrls
      : null;

    if (Array.isArray(imagesList) && imagesList.length) {
      const normalized = imagesList
        .map((u) => parseDataUrlMaybe(String(u || "").trim()))
        .filter(Boolean)
        .map((p, idx) => {
          const mt = assertAllowedInputMime(p?.mimeType || "");
          if (!mt) return null;
          const b64 = String(p?.base64 || "").trim();
          if (!b64) return null;
          return {
            base64: b64,
            mimeType: mt,
            filename: `receipt-${idx + 1}.${mt === "image/png" ? "png" : mt === "image/webp" ? "webp" : "jpg"}`,
          };
        })
        .filter(Boolean)
        .slice(0, 3);

      if (normalized.length) {
        const pdf = normalized.find((x) => x.mimeType === "application/pdf");
        const out = pdf
          ? await callOpenAI({ base64: pdf.base64, mimeType: pdf.mimeType, filename: pdf.filename, accounts })
          : await callOpenAI({ images: normalized, accounts });
        res.status(out.status).json(out.body);
        return;
      }
    }

    // Prefer imageDataUrl if present
    const imageDataUrl = String(body?.imageDataUrl || "").trim();
    const parsedDataUrl = imageDataUrl ? parseDataUrlMaybe(imageDataUrl) : null;

    const base64 = parsedDataUrl?.base64 || body?.base64 || body?.imageBase64 || null;
    const mimeType = parsedDataUrl?.mimeType || body?.mimeType || "image/jpeg";
    const filename = String(body?.filename || body?.fileName || body?.name || "").trim();

    const mt = assertAllowedInputMime(mimeType || "image/jpeg");
    if (!mt) {
      res.status(415).json({ ok: false, code: "unsupported_media_type", message: "Only images (jpeg/png/webp) and PDF are allowed" });
      return;
    }

    const b64 = typeof base64 === "string" ? base64.trim() : "";
    const reqCheck = parseScanRequestPayload({ base64: b64, mimeType: mt, type: mt === "application/pdf" ? "pdf" : "image" });
    if (!reqCheck.success) {
      res.status(400).json({ ok: false, code: "invalid_scan_request", message: "Provide multipart file, or JSON { base64, mimeType }, or { imageDataUrl }" });
      return;
    }
    const sizeCheck = assertBase64UnderLimit(b64, MAX_UPLOAD_BYTES);
    if (!sizeCheck.ok) {
      res.status(413).json({ ok: false, code: "payload_too_large", message: "Upload payload too large" });
      return;
    }

    if (!b64) {
      res.status(400).json({
        ok: false,
        code: "missing_base64",
        message: "Provide multipart file, or JSON { base64, mimeType }, or { imageDataUrl }",
      });
      return;
    }

    const out = await scanWithProvider({
      provider: process.env.SCAN_PROVIDER || "openai",
      payload: {
        base64: b64,
        mimeType: mt,
        type: mt === "application/pdf" ? "pdf" : "image",
        ...(filename ? { fileName: filename } : {}),
      },
      scanOpenAI: callOpenAI,
    });
    const normalizedOut = normalizeErrorResponse(out);
    res.status(normalizedOut.status).json(normalizedOut.body);
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg === "file_too_large") {
      res.status(413).json({ ok: false, code: "file_too_large", message: "File too large" });
      return;
    }

    if (msg === "body_too_large") {
      res.status(413).json({ ok: false, code: "body_too_large", message: "Request body too large" });
      return;
    }

    res.status(500).json({ ok: false, code: "server_error", message: IS_PROD ? "Internal server error" : msg });
  }
}
