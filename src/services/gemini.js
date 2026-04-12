// src/services/gemini.js
// ✅ SAFE: calls a server-side endpoint (/api/gemini-scan) so the API key never ships to the browser.
// Optional env: NEXT_PUBLIC_GEMINI_SCAN_API_URL (default: /api/gemini-scan)

// NOTE:
// The app's primary AI service is OpenAI via src/services/scanOpenAI.js.
// We keep Gemini support for users who configured it, and we also expose
// specialized helpers (e.g. Thai bank slip parsing) that can fall back to OpenAI.

import { scanReceiptOpenAI } from "./scanOpenAI";
import { normalizeThaiDigits, parseMoneyToSatang } from "../utils/money";
import { parseScanRequestPayload, normalizeScanResponse, SCAN_PARSE_ERROR_CODE } from "../../shared/scanSchema";

export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = () => {
      const result = String(reader.result || "");
      const parts = result.split(",");
      const base64String = parts[1] || "";
      resolve({
        base64: base64String,
        mimeType: file?.type || "image/jpeg",
        preview: result,
      });
    };

    reader.onerror = (error) => reject(error);
  });
};

async function safeReadJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * callGeminiScan(base64Data, mimeType)
 * -> calls /api/gemini-scan and returns parsed JSON
 */
export const callGeminiScan = async (base64Data, mimeType) => {
  const url = (process.env.NEXT_PUBLIC_GEMINI_SCAN_API_URL || process.env.VITE_GEMINI_SCAN_API_URL || "/api/gemini-scan").trim();

  const payload = {
    base64: String(base64Data || ""),
    mimeType: String(mimeType || "image/jpeg"),
    type: "image",
  };

  const reqCheck = parseScanRequestPayload(payload);
  if (!reqCheck.success) {
    const e = new Error("Invalid scan request payload");
    e.code = "invalid_scan_request";
    throw e;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await safeReadJson(res);
  if (!res.ok) {
    const msg = json?.message || `API Error: ${res.status}`;
    const e = new Error(msg);
    const rawCode = json?.code || "gemini_api_error";
    e.code = rawCode === "parse_failed" ? SCAN_PARSE_ERROR_CODE : rawCode;
    throw e;
  }

  if (!json?.ok) {
    const msg = json?.message || "Gemini scan failed";
    const e = new Error(msg);
    const rawCode = json?.code || "gemini_scan_failed";
    e.code = rawCode === "parse_failed" ? SCAN_PARSE_ERROR_CODE : rawCode;
    e.data = json;
    throw e;
  }

  const normalized = normalizeScanResponse(json.data, { defaultErrorCode: SCAN_PARSE_ERROR_CODE });
  if (normalized.errors.length) {
    const e = new Error("Gemini response parse failed");
    e.code = SCAN_PARSE_ERROR_CODE;
    e.data = json;
    throw e;
  }
  return { ...json.data, ...normalized };
};

// -------------------- Slip Hunter (Thai bank transfer slip parser) --------------------

const THAI_BANK_PATTERNS = [
  {
    id: "kbank",
    keys: ["kbank", "kasikorn", "kasikornbank", "กสิกร", "กสิกรไทย", "kbiz"],
  },
  {
    id: "scb",
    keys: ["scb", "siam commercial", "siam commercial bank", "ไทยพาณิช", "ไทยพาณิชย์"],
  },
  {
    id: "ktb",
    keys: ["ktb", "krungthai", "กรุงไทย"],
  },
  {
    id: "ttb",
    keys: ["ttb", "ทหารไทย", "ธนชาต", "ทหารไทยธนชาต", "tmb", "ธนชาต"],
  },
  {
    id: "truemoney",
    keys: ["truemoney", "true money", "ทรูมันนี่", "ทรู มันนี่", "wallet", "วอลเล็ต"],
  },
];

function safeText(x) {
  return String(x || "").replace(/\u00A0/g, " ").trim();
}

function looksLikeThaiSlip(text) {
  const t = safeText(text).toLowerCase();
  if (!t) return false;
  const keys = [
    "โอนเงิน",
    "รายการโอน",
    "promptpay",
    "พร้อมเพย์",
    "เลขอ้างอิง",
    "transaction",
    "ref",
    "to account",
    "from account",
    "ผู้รับ",
    "ปลายทาง",
    "ต้นทาง",
    "success",
    "สำเร็จ",
  ];
  if (keys.some((k) => t.includes(k))) return true;
  // bank brand hints
  return THAI_BANK_PATTERNS.some((b) => b.keys.some((k) => t.includes(k)));
}

function fixBuddhistYearISO(isoLike) {
  const s = safeText(isoLike);
  if (!s) return "";
  const m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return s.slice(0, 10);
  let y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return s.slice(0, 10);
  if (y >= 2400) y = y - 543;
  const pad = (n) => String(n).padStart(2, "0");
  return `${y}-${pad(mo)}-${pad(d)}`;
}

function parseTimeFromText(text) {
  const t0 = safeText(text);
  if (!t0) return "";
  const t = normalizeThaiDigits(t0);

  // common: "เวลา 14:22" / "Time 14:22:10" / "14.22"
  const m = t.match(/(?:เวลา|time)?\s*([01]?\d|2[0-3])[:.](\d{2})(?:[:.](\d{2}))?/i);
  if (!m) return "";
  const hh = String(m[1]).padStart(2, "0");
  const mm = String(m[2]).padStart(2, "0");
  const ss = m[3] != null ? String(m[3]).padStart(2, "0") : "";
  return ss ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}

function guessReceiverBankId(text) {
  const t = safeText(text).toLowerCase();
  if (!t) return "";
  for (const b of THAI_BANK_PATTERNS) {
    if (b.keys.some((k) => t.includes(String(k).toLowerCase()))) return b.id;
  }
  return "";
}

function pickBestReceiverName(result, evidenceText) {
  const m0 = safeText(result?.merchant);
  if (m0) return m0;

  const t = safeText(evidenceText);
  if (!t) return "";

  // Try a few Thai/EN labels
  const reList = [
    /(?:ผู้รับ|ชื่อผู้รับ|ผู้รับโอน|ชื่อบัญชีปลายทาง|ปลายทาง|to)\s*[:：]?\s*([^\n•]{3,80})/i,
    /(?:รับเงินจาก|paid to|pay to)\s*[:：]?\s*([^\n•]{3,80})/i,
  ];
  for (const re of reList) {
    const m = t.match(re);
    if (m && safeText(m[1])) return safeText(m[1]);
  }

  return "";
}

function parseTransactionRef(result, evidenceText) {
  const r0 = safeText(result?.ref || result?.transaction_ref || result?.transactionRef || result?.referenceId);
  if (r0) return r0;

  const t = normalizeThaiDigits(safeText(evidenceText));
  if (!t) return "";

  const m1 = t.match(/(?:เลขอ้างอิง|reference|ref|trx|transaction\s*id)\s*[:：]?\s*([A-Za-z0-9-]{6,40})/i);
  if (m1 && safeText(m1[1])) return safeText(m1[1]);

  // fallback: find a long alnum token
  const tokens = t.match(/[A-Za-z0-9-]{8,40}/g) || [];
  if (!tokens.length) return "";
  // Prefer tokens that contain both letters and digits
  const scored = tokens
    .map((tok) => {
      const hasA = /[A-Za-z]/.test(tok);
      const hasD = /\d/.test(tok);
      const score = (hasA ? 2 : 0) + (hasD ? 2 : 0) + Math.min(2, Math.floor(tok.length / 12));
      return { tok, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.tok || "";
}

/**
 * parseThaiSlip(file)
 * Specialized slip parsing for Thai e-Slips.
 *
 * Fields:
 * - date (ISO)  (handles Buddhist year 25xx)
 * - time (HH:mm or HH:mm:ss)
 * - amount_satang (integer)
 * - receiver_name (merchant)
 * - receiver_bank_id (kbank|scb|ktb|ttb|truemoney)
 * - transaction_ref
 */
export async function parseThaiSlip(file, { onStatus, accounts } = {}) {
  if (!file) throw new Error("Missing file");

  // Primary: OpenAI slip/receipt scanner (server-side)
  const result = await scanReceiptOpenAI(file, {
    onStatus,
    accounts,
  });

  const evidence = safeText(result?.evidence || "");
  const note = safeText(result?.note || "");
  const merchant = safeText(result?.merchant || "");
  const ctx = `${merchant} ${note} ${evidence}`.trim();

  const isSlip = String(result?.doc_type || result?.docType || "").toLowerCase().includes("slip") || looksLikeThaiSlip(ctx);

  const dateISO = fixBuddhistYearISO(result?.date || "");
  const time = parseTimeFromText(ctx);

  const amountNumber =
    typeof result?.amount === "number" ? result.amount : result?.amount != null ? Number(result.amount) : NaN;
  const amount_satang = Number.isFinite(amountNumber) ? parseMoneyToSatang(amountNumber) : 0;

  const receiver_name = pickBestReceiverName(result, ctx);
  const receiver_bank_id = guessReceiverBankId(ctx);
  const transaction_ref = parseTransactionRef(result, ctx);

  return {
    isThaiSlip: !!isSlip,
    date: dateISO,
    time,
    amount_satang,
    receiver_name,
    receiver_bank_id: receiver_bank_id || "",
    transaction_ref: transaction_ref || "",

    // Helpful extras for the caller/UI
    tx_type: String(result?.tx_type || result?.txType || "").trim() || "",
    doc_type: String(result?.doc_type || result?.docType || "").trim() || "",
    from_account: safeText(result?.from_account || result?.fromAccount || ""),
    to_account: safeText(result?.to_account || result?.toAccount || ""),
    evidence,
    merchant: receiver_name || merchant,
    _raw: result,
  };
}
