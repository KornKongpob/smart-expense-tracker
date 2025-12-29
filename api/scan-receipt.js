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

    const name = safeString(it.name ?? it.title ?? it.desc ?? it.description ?? it.item ?? it.product);
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
    if (!s) return "gpt-5-chat-latest";

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

    // Normalize dotted version to the stable id
    if (low === "gpt-5.0") return "gpt-5";

    // Otherwise trust caller value
    return s;
  };

  const model = normalizeOpenAIModel(process.env.OPENAI_MODEL);
  const dataUrl = `data:${mimeType || "image/jpeg"};base64,${base64}`;

  const prompt =
    `You are a receipt/bank-slip parser for a personal expense tracker.\n` +
    `Return STRICT JSON ONLY (no markdown, no explanation).\n` +
    `Allowed category_key values:\n` +
    `- expense: food, transport, shopping, bills, health, entertainment, other\n` +
    `- income: salary, bonus, investment, refund, other\n` +
    `- transfer: transfer\n` +
    `Schema:\n` +
    `{\n` +
    `  "tx_type": "expense"|"income"|"transfer",\n` +
    `  "amount": number|null,\n` +
    `  "date": "YYYY-MM-DD"|null,\n` +
    `  "merchant": string|null,\n` +
    `  "note": string|null,\n` +
    `  "ref": string|null,\n` +
    `  "category_key": string|null,\n` +
    `  "items": [\n` +
    `    { "name": string, "qty": number|null, "unit_price": number|null, "total": number|null, "category_key": string|null }\n` +
    `  ]|[],\n` +
    `  "from_account": string|null,\n` +
    `  "to_account": string|null,\n` +
    `  "evidence": string|null\n` +
    `}\n` +
    `Rules:\n` +
    `- amount = grand total paid.\n` +
    `- If date is Buddhist Era (>=2400), convert to AD.\n` +
    `- Use tx_type="transfer" only if clearly a transfer between accounts.\n` +
    `- For credit card payment slips (ชำระบัตร/บัตรเครดิต/CardX/หมายเลขบัตร/บัญชีรับชำระ), still output best guess fields; server will classify.\n` +
    `- ref: extract transaction reference / TRX / Ref / เลขที่รายการ if present, else null.\n` +
    `- from_account / to_account:\n` +
    `  * MUST be ONLY last 3-6 digits of account number (digits only; Thai digits ok).\n` +
    `  * For card number, return last 4 digits ONLY.\n` +
    `  * Map direction: "จาก/From/ผู้โอน" => from_account, "ไปยัง/To/ผู้รับ/บัญชีรับชำระ/หมายเลขบัตร" => to_account.\n` +
    `  * Do NOT use reference/biller/merchant ids as account.\n` +
    `- evidence: short string (<=220 chars) containing key lines you used.\n` +
    `Return JSON only.\n`;

  const payload = {
    model,
    temperature: 0,
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
        ? "Check OPENAI_MODEL. Valid examples: gpt-5-chat-latest, gpt-5, gpt-5.1."
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

  const outputText = extractResponsesOutputText(json);
  const parsed = safeJsonParseMaybe(outputText);

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

  // ✅ Separate credit card payment out of transfer
  const refined = refineTxTypeAndSubtype({
    parsedTxType: parsedType,
    evidence: evidence0,
    rawText: outputText,
  });

  const amount = typeof parsed.amount === "number" ? parsed.amount : parsed.amount != null ? Number(parsed.amount) : null;

  const merchant = parsed?.merchant != null ? String(parsed.merchant) : null;
  const note = parsed?.note != null ? String(parsed.note) : merchant != null ? String(merchant) : null;

  const items = normalizeItems(parsed?.items ?? parsed?.line_items ?? parsed?.lines ?? null);

  let category =
    normalizeCategoryKey(parsed?.category_key) ||
    normalizeCategoryKey(parsed?.category) ||
    (refined.tx_type === "transfer" ? "transfer" : null);

  // if credit card payment => bills (unless already set)
  if (refined.is_credit_card_payment) {
    if (!category || category === "transfer") category = "bills";
  } else if (refined.tx_type !== "transfer") {
    const fromItems = pickDominantCategoryFromItems(items);
    const fromText = inferCategoryFromText(`${merchant || ""} ${note || ""} ${outputText || ""}`);
    if (!category) category = fromItems || fromText || "other";
    if (category === "other") category = fromItems || fromText || "other";
  } else {
    category = "transfer";
  }

  const normalized = {
    tx_type: refined.tx_type,
    tx_subtype: refined.tx_subtype,
    is_credit_card_payment: refined.is_credit_card_payment,

    amount: Number.isFinite(amount) ? amount : null,
    date: parsed.date ? String(parsed.date).slice(0, 10) : null,
    merchant,
    note,
    ref: parsed.ref ? String(parsed.ref).trim() : null,

    category,
    items,

    from_account: parsed.from_account ? clampDigits(parsed.from_account, { maxLen: 6, minLen: 3 }) : null,
    to_account: parsed.to_account ? clampDigits(parsed.to_account, { maxLen: 6, minLen: 3 }) : null,
    evidence: evidence0,
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
