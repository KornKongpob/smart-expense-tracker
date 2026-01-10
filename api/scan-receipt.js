// api/scan-receipt.js
import Busboy from "busboy";

const OPENAI_URL = "https://api.openai.com/v1/responses";

// NOTE: harmless for Vercel Functions, required for Next API routes
export const config = { api: { bodyParser: false } };

function getContentType(req) {
  return String(req.headers?.["content-type"] || "").toLowerCase();
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  // In some runtimes (Next), req.body might already be an object
  if (req.body && typeof req.body === "object") return req.body;

  const buf = await readRawBody(req);
  const txt = buf.toString("utf-8").trim();
  if (!txt) return {};
  try {
    return JSON.parse(txt);
  } catch {
    return {};
  }
}

function parseMultipart(req, { maxBytes = 10 * 1024 * 1024 } = {}) {
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
      limits: { fileSize: maxBytes, files: 1 },
    });

    let fileBuffer = null;
    let mimeType = "";
    let filename = "";

    bb.on("file", (fieldname, file, info) => {
      const chunks = [];
      filename = info?.filename || "";
      mimeType = info?.mimeType || info?.mimetype || "";

      file.on("data", (d) => chunks.push(d));
      file.on("limit", () => finish(new Error("file_too_large")));
      file.on("end", () => {
        try {
          fileBuffer = Buffer.concat(chunks);
        } catch (e) {
          finish(e);
        }
      });
      file.on("error", (e) => finish(e));
    });

    bb.on("error", (e) => finish(e));
    bb.on("finish", () => finish(null, { fileBuffer, mimeType, filename }));

    try {
      req.pipe(bb);
    } catch (e) {
      finish(e);
    }
  });
}

function safeJsonParseMaybe(text) {
  const t0 = String(text || "").trim();
  if (!t0) return null;

  const t = t0.replace(/```json/gi, "").replace(/```/g, "").trim();

  // try whole string first
  try {
    return JSON.parse(t);
  } catch {
    // try extracting object
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const candidate = t.slice(start, end + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
    return null;
  }
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
  const th = "๐๑๒๓๔๕๖๗๘๙";
  return String(s || "").replace(/[๐-๙]/g, (ch) => {
    const idx = th.indexOf(ch);
    return idx >= 0 ? String(idx) : ch;
  });
}

function normalizeDigits(s) {
  return toArabicDigits(String(s || "")).replace(/[^\d]/g, "");
}

function parseDataUrlMaybe(dataUrl) {
  const s = String(dataUrl || "").trim();
  if (!s.startsWith("data:")) return null;

  const comma = s.indexOf(",");
  if (comma < 0) return null;

  const meta = s.slice(5, comma);
  const body = s.slice(comma + 1);

  const parts = meta.split(";");
  const mimeType = parts[0] || "image/jpeg";
  const isBase64 = parts.includes("base64");
  if (!isBase64) return null;

  return { mimeType, base64: body };
}

function extractResponsesOutputText(resp) {
  const direct = resp?.output_text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const out = resp?.output;
  if (Array.isArray(out)) {
    const lines = [];
    for (const item of out) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          const t = c?.text;
          if (typeof t === "string" && t.trim()) lines.push(t.trim());
        }
      }
      if (typeof item?.text === "string" && item.text.trim()) lines.push(item.text.trim());
    }
    if (lines.length) return lines.join("\n");
  }

  const maybe =
    resp?.output?.[0]?.content
      ?.map((c) => c?.text)
      .filter(Boolean)
      .join("\n") || "";

  return String(maybe || "").trim();
}

function findFirstParsedObject(resp) {
  try {
    const out = resp?.output;
    if (Array.isArray(out)) {
      for (const item of out) {
        const content = item?.content;
        if (Array.isArray(content)) {
          for (const c of content) {
            if (c && typeof c === 'object' && c.parsed && typeof c.parsed === 'object') return c.parsed;
            if (c && typeof c === 'object' && c.json && typeof c.json === 'object') return c.json;
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}


function safeString(v) {
  if (v == null) return "";
  return String(v).trim();
}

function safeNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const cleaned = toArabicDigits(s).replace(/[฿$, ]+/g, "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function clamp01(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}


function normalizeCategoryKey(v) {
  const s = safeString(v).toLowerCase();
  if (!s) return null;

  const allowed = new Set([
    "food",
    "transport",
    "shopping",
    "bills",
    "health",
    "entertainment",
    "salary",
    "bonus",
    "investment",
    "refund",
    "other",
    "transfer",
  ]);
  if (allowed.has(s)) return s;

  const alias = {
    utilities: "bills",
    bill: "bills",
    gas: "transport",
    fuel: "transport",
    petrol: "transport",
    diesel: "transport",
    groceries: "shopping",
    supermarket: "shopping",
    pharmacy: "health",
    medicine: "health",
    cinema: "entertainment",
    movie: "entertainment",
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

    let finalTotal = total;
    if (finalTotal == null && qty != null && unit_price != null) finalTotal = qty * unit_price;

    if (!name && finalTotal == null) continue;

    out.push({
      name: name || "",
      qty: qty != null ? qty : null,
      unit_price: unit_price != null ? unit_price : null,
      total: finalTotal != null ? finalTotal : null,
      category_key: cat,
    });

    if (out.length >= 40) break;
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

  // ✅ credit card payment: prefer card last4 for "to"
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
    // ✅ Separate credit card payment out of transfer
    return { tx_type: "expense", tx_subtype: "credit_card_payment", is_credit_card_payment: true };
  }

  // default
  return { tx_type: safeType, tx_subtype: safeType === "transfer" ? "transfer" : null, is_credit_card_payment: false };
}

async function callOpenAI({ base64, mimeType }) {
  const apiKey = process.env.OPENAI_API_KEY;
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

    // ✅ Prefer explicit 5.1 when requested
    if (low === "5.1" || low === "gpt5.1" || low === "gpt-5.1" || low === "chatgpt 5.1" || low === "chatgpt-5.1") {
      return "gpt-5.1";
    }

    // Normalize dotted version to the stable id
    if (low === "gpt-5.0") return "gpt-5";

    // Otherwise trust caller value
    return s;
  };

  // ✅ Default to gpt-5.1 for OCR-heavy receipts
  const model = normalizeOpenAIModel(process.env.OPENAI_MODEL || "gpt-5.1");
  const dataUrl = `data:${mimeType || "image/jpeg"};base64,${base64}`;

  const prompt = `
You are an OCR+parser for Thai receipts and Thai bank/payment transfer slips used in a personal expense tracker.
Return STRICT JSON ONLY. No markdown. No extra text.

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

Allowed category_key values:
- expense: food, transport, shopping, bills, health, entertainment, other
- income: salary, bonus, investment, refund, other
- transfer: transfer

Schema (ALL keys must exist; use null if unknown):
{
  "doc_type": "receipt"|"transfer_slip"|"bill_payment"|"unknown",
  "tx_type": "expense"|"income"|"transfer",
  "tx_subtype": "transfer"|"credit_card_payment"|null,
  "is_credit_card_payment": boolean|null,
  "amount": number|null,
  "currency": string|null,
  "date": "YYYY-MM-DD"|null,
  "merchant": string|null,
  "note": string|null,
  "ref": string|null,
  "category_key": string|null,
  "items": [
    { "name": string, "qty": number|null, "unit_price": number|null, "line_total": number|null, "category_key": string|null }
  ],
  "from_account": string|null,
  "to_account": string|null,
  "evidence": string|null,
  "confidence": { "overall": number|null, "amount": number|null, "date": number|null, "merchant": number|null, "items": number|null },
  "flags": { "has_line_items": boolean, "has_zero_price_lines": boolean, "has_discount_lines": boolean, "needs_human_review": boolean }
}
`;

  const text_format = {
    type: "json_schema",
    json_schema: {
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
          "amount",
          "currency",
          "date",
          "merchant",
          "note",
          "ref",
          "category_key",
          "items",
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
                category_key: { anyOf: [{ type: "string" }, { type: "null" }] }
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

  const payload = {

    model,
    temperature: 0,
    text_format,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: dataUrl },
        ],
      },
    ],
  };

  const r = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = await r.json().catch(() => null);

  if (!r.ok) {
    const msg = json?.error?.message || "OpenAI request failed";
    const tip =
      /model/i.test(msg) && /not found|does not exist|unknown/i.test(msg)
        ? "Check OPENAI_MODEL. Valid examples: gpt-5.1, gpt-5-chat-latest, gpt-4.1-mini, gpt-4o."
        : null;

    return {
      status: r.status,
      body: {
        ok: false,
        code: "openai_error",
        message: msg,
        model,
        tip,
        raw: json || null,
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
        code: "parse_failed",
        message: "Model output is not valid JSON",
        rawText: outputText,
        model,
      },
    };
  }

  const parsedType = String(parsed.tx_type || "").toLowerCase();
  const evidence0 = String(parsed.evidence ?? outputText ?? "").slice(0, 220);

  // ---- confidence + flags (early; used for fallbacks) ----
  const confIn0 = parsed?.confidence && typeof parsed.confidence === "object" ? parsed.confidence : {};
  const needsReviewFlag = !!parsed?.needs_review;
  const itemsConfFlag = clamp01(typeof confIn0.items === "number" ? confIn0.items : null);

  // ✅ Separate credit card payment out of transfer
  const refined = refineTxTypeAndSubtype({
    parsedTxType: parsedType,
    evidence: evidence0,
    rawText: outputText,
  });

  const amount = typeof parsed.amount === "number" ? parsed.amount : parsed.amount != null ? Number(parsed.amount) : null;

  const merchant = parsed?.merchant != null ? String(parsed.merchant) : null;
  const note = parsed?.note != null ? String(parsed.note) : merchant != null ? String(merchant) : null;

  let items = normalizeItems(parsed?.items ?? parsed?.line_items ?? parsed?.lines ?? null);

  // ---- doc_type normalization (early) ----
  const dtRaw = safeString(parsed?.doc_type ?? parsed?.docType).toLowerCase();
  const allowedDt = new Set(["receipt", "transfer_slip", "bill_payment", "unknown"]);
  let doc_type = allowedDt.has(dtRaw) ? dtRaw : "";

  // If model didn't provide doc_type, infer lightly from refined tx_type and presence of line items
  if (!doc_type) {
    if (refined.tx_type === "transfer") doc_type = "transfer_slip";
    else if (Array.isArray(items) && items.some((it) => (safeNumber(it?.total) || 0) > 0)) doc_type = "receipt";
    else doc_type = "unknown";
  }

  // ---- Items-only fallback (receipt line items) ----
  // This endpoint focuses on receipts; a targeted line-item pass is noticeably more reliable
  // for 7-Eleven style layouts (qty column + price on the right), especially on mobile screenshots.
  const positiveItemCount = items.filter((it) => (safeNumber(it?.total) || 0) > 0).length;
  const shouldItemsFallback =
    doc_type === "receipt" && (positiveItemCount < 2 || needsReviewFlag || (itemsConfFlag != null && itemsConfFlag < 0.7));

  if (shouldItemsFallback) {
    const itemsModel = normalizeOpenAIModel(process.env.OPENAI_ITEMS_MODEL || model || "gpt-5.1");

    const items_only_format = {
      type: "json_schema",
      json_schema: {
        name: "receipt_items_only",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["items"],
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["name", "qty", "unit_price", "line_total"],
                properties: {
                  name: { type: "string" },
                  qty: { anyOf: [{ type: "number" }, { type: "null" }] },
                  unit_price: { anyOf: [{ type: "number" }, { type: "null" }] },
                  line_total: { anyOf: [{ type: "number" }, { type: "null" }] },
                },
              },
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
4) EXCLUDE summary lines (ยอดสุทธิ, รวม, TOTAL, VAT, discount, change, TID, R#, store code, phone numbers).
5) Preserve item names AS SHOWN (Thai/English). Do NOT replace with generic labels.
6) If the receipt shows a quantity column (often a leading "1"), set qty accordingly.
7) If unit price is not shown, set unit_price=null.
8) Numbers: use decimal with dot, no currency symbol.

Output JSON schema:
{ "items": [ { "name": string, "qty": number|null, "unit_price": number|null, "line_total": number|null } ] }
`;

    try {
      const rr = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: itemsModel,
          temperature: 0,
          max_output_tokens: 1600,
          text: { format: items_only_format },
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: itemsPrompt },
                { type: "input_image", image_url: dataUrl },
              ],
            },
          ],
        }),
      });

      const jj = await rr.json().catch(() => null);
      if (rr.ok) {
        const itemsObj = findFirstParsedObject(jj) || safeJsonParseMaybe(extractResponsesOutputText(jj));
        const extracted = Array.isArray(itemsObj?.items) ? itemsObj.items : [];
        const cleaned = extracted
          .map((it) => ({
            name: normalizeItemName(it?.name ?? it?.title ?? it?.item),
            qty: safeNumber(it?.qty ?? it?.quantity),
            unit_price: safeNumber(it?.unit_price ?? it?.unitPrice ?? it?.price),
            total: safeNumber(it?.line_total ?? it?.lineTotal ?? it?.total ?? it?.amount),
            category_key: null,
          }))
          .filter((it) => it.name && Number.isFinite(it.total) && it.total > 0)
          .slice(0, 40);

        if (cleaned.length >= 2) {
          items = cleaned;
        }
      }
    } catch {
      // ignore fallback errors
    }
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
  if (doc_type === "transfer_slip" || doc_type === "bill_payment" || refined.tx_type === "transfer") {
    finalItems = [];
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

  let needsReview = false;
  if (confidence.overall != null && confidence.overall < 0.6) needsReview = true;
  if (doc_type === "receipt" && amount != null && hasPositiveItems) {
    const sum = finalItems.reduce((s, it) => s + (safeNumber(it?.total) || 0), 0);
    const diff = sum > 0 ? Math.abs(sum - amount) : 0;
    if (diff >= 2) needsReview = true;
  }

  const flags = {
    has_line_items: typeof flagsIn.has_line_items === "boolean" ? flagsIn.has_line_items : !!hasPositiveItems,
    has_zero_price_lines: typeof flagsIn.has_zero_price_lines === "boolean" ? flagsIn.has_zero_price_lines : !!hasZeroItems,
    has_discount_lines: typeof flagsIn.has_discount_lines === "boolean" ? flagsIn.has_discount_lines : !!hasDiscountHint,
    needs_human_review: typeof flagsIn.needs_human_review === "boolean" ? flagsIn.needs_human_review : !!needsReview,
  };

  const normalized = {
    doc_type,

    tx_type: refined.tx_type,
    tx_subtype: refined.tx_subtype,
    is_credit_card_payment: refined.is_credit_card_payment,

    amount: Number.isFinite(amount) ? amount : null,
    currency: parsed?.currency != null && String(parsed.currency).trim() ? String(parsed.currency).trim().toUpperCase() : null,
    date: parsed.date ? String(parsed.date).slice(0, 10) : null,
    merchant,
    note,
    ref: parsed.ref ? String(parsed.ref).trim() : null,

    category,
    category_key: category,

    items: finalItems,

    from_account: parsed.from_account ? clampDigits(parsed.from_account, { maxLen: 6, minLen: 3 }) : null,
    to_account: parsed.to_account ? clampDigits(parsed.to_account, { maxLen: 6, minLen: 3 }) : null,
    evidence: evidence0,
    confidence,
    flags,
  };

  // ✅ Enhancement: robust account mapping (prefer card last4 when credit card payment)
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
  }));

  return {
    status: 200,
    body: { ok: true, data: normalized, rawText: outputText, model },
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).json({ ok: false, code: "method_not_allowed", message: "Use POST" });
      return;
    }

    const ct = getContentType(req);

    // 1) multipart/form-data
    if (ct.includes("multipart/form-data")) {
      const { fileBuffer, mimeType } = await parseMultipart(req);
      if (!fileBuffer || fileBuffer.length === 0) {
        res.status(400).json({ ok: false, code: "missing_file", message: "No file uploaded" });
        return;
      }

      const base64 = fileBuffer.toString("base64");
      const out = await callOpenAI({ base64, mimeType: mimeType || "image/jpeg" });
      res.status(out.status).json(out.body);
      return;
    }

    // 2) JSON: accept { base64, mimeType } OR { imageDataUrl }
    const body = await readJson(req);

    // Prefer imageDataUrl if present
    const imageDataUrl = String(body?.imageDataUrl || "").trim();
    const parsedDataUrl = imageDataUrl ? parseDataUrlMaybe(imageDataUrl) : null;

    const base64 = parsedDataUrl?.base64 || body?.base64 || body?.imageBase64 || null;
    const mimeType = parsedDataUrl?.mimeType || body?.mimeType || "image/jpeg";

    if (!base64) {
      res.status(400).json({
        ok: false,
        code: "missing_base64",
        message: "Provide multipart file, or JSON { base64, mimeType }, or { imageDataUrl }",
      });
      return;
    }

    const out = await callOpenAI({ base64, mimeType });
    res.status(out.status).json(out.body);
  } catch (e) {
    const msg = String(e?.message || e);

    if (msg === "file_too_large") {
      res.status(413).json({ ok: false, code: "file_too_large", message: "File too large" });
      return;
    }

    res.status(500).json({ ok: false, code: "server_error", message: msg });
  }
}
