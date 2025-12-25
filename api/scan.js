// api/scan.js
// Vercel Serverless Function: POST /api/scan
// Required env: OPENAI_API_KEY
// Optional env: OPENAI_MODEL (default: gpt-4.1-mini)

const OPENAI_URL = "https://api.openai.com/v1/responses";

function safeJsonParseMaybe(text) {
  const t0 = String(text || "").trim();
  if (!t0) return null;

  const t = t0.replace(/```json/gi, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
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
          const txt = c?.text;
          if (typeof txt === "string" && txt.trim()) lines.push(txt.trim());
        }
      }
      if (typeof item?.text === "string" && item.text.trim()) lines.push(item.text.trim());
    }
    if (lines.length) return lines.join("\n");
  }

  const fallback =
    resp?.output?.[0]?.content
      ?.map((c) => c?.text)
      .filter(Boolean)
      .join("\n") || "";

  return String(fallback || "").trim();
}

function toArabicDigits(s) {
  const th = "๐๑๒๓๔๕๖๗๘๙";
  return String(s || "").replace(/[๐-๙]/g, (ch) => {
    const idx = th.indexOf(ch);
    return idx >= 0 ? String(idx) : ch;
  });
}

function normalizeDigits(s) {
  return toArabicDigits(String(s || "")).replace(/[^\d]/g, "");
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
    commute: "transport",
    groceries: "shopping",
    supermarket: "shopping",
    medicine: "health",
    pharmacy: "health",
    movie: "entertainment",
    cinema: "entertainment",
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
      "transit",
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
      "noodles",
      "rice",
      "chicken",
      "pork",
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
      "ปลา",
      "ส้มตำ",
      "บะหมี่",
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
      "billing",
      "invoice",
      "ค่าไฟ",
      "ค่าน้ำ",
      "โทรศัพท์",
      "อินเทอร์เน็ต",
      "บิล",
      "ชำระบิล",
    ])
  )
    return "bills";

  if (
    has([
      "hospital",
      "clinic",
      "pharmacy",
      "drug",
      "medicine",
      "med",
      "vitamin",
      "health",
      "โรงพยาบาล",
      "คลินิก",
      "ร้านยา",
      "ยา",
      "เวชภัณฑ์",
    ])
  )
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
      "entertain",
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
      "7 eleven",
      "seven eleven",
      "lotus",
      "tesco",
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
  return { last3: lastN(s, 3), last4: lastN(s, 4), last6: lastN(s, 6) };
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

  const bestByKey = new Map();
  for (const c of candidates) {
    const k = `${c.role}|${c.digits}`;
    const prev = bestByKey.get(k);
    if (!prev || c.score > prev.score) bestByKey.set(k, c);
  }
  return [...bestByKey.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 12);
}

function chooseFromToByCandidates({ candidates, modelFrom, modelTo, tx_type }) {
  const list = Array.isArray(candidates) ? candidates.slice() : [];

  const mf = clampDigits(modelFrom, { maxLen: 6, minLen: 3 });
  const mt = clampDigits(modelTo, { maxLen: 6, minLen: 3 });
  if (mf) list.push({ role: "from", digits: mf, score: 0.5, raw: String(modelFrom || ""), line: "", isCard: false, variants: makeAccountVariants(mf) });
  if (mt) list.push({ role: "to", digits: mt, score: 0.5, raw: String(modelTo || ""), line: "", isCard: false, variants: makeAccountVariants(mt) });

  const fromCandidates = list.filter((c) => c.role === "from").sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const toCandidates = list.filter((c) => c.role === "to").sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  let from = fromCandidates[0]?.digits || mf || null;
  let to = toCandidates[0]?.digits || mt || null;

  if (tx_type === "transfer") {
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

function enhanceAccounts({ rawText, evidence, parsedFrom, parsedTo, tx_type }) {
  const combined = `${String(evidence || "")}\n${String(rawText || "")}`.trim();
  const candidates = extractAccountCandidatesFromText(combined);
  const picked = chooseFromToByCandidates({ candidates, modelFrom: parsedFrom, modelTo: parsedTo, tx_type });
  return { candidates, picked };
}

function normalizeScanResult(parsed, rawText) {
  const tx_type = String(parsed?.tx_type || "").toLowerCase();
  const safeType = tx_type === "income" || tx_type === "transfer" ? tx_type : "expense";

  const amount = typeof parsed?.amount === "number" ? parsed.amount : parsed?.amount != null ? Number(parsed.amount) : null;

  const merchant = parsed?.merchant != null ? String(parsed.merchant) : null;
  const note = parsed?.note != null ? String(parsed.note) : merchant != null ? String(merchant) : null;

  const items = normalizeItems(parsed?.items ?? parsed?.line_items ?? parsed?.lines ?? null);

  let category =
    normalizeCategoryKey(parsed?.category_key) ||
    normalizeCategoryKey(parsed?.category) ||
    (safeType === "transfer" ? "transfer" : null);

  if (safeType !== "transfer") {
    const fromItems = pickDominantCategoryFromItems(items);
    const fromText = inferCategoryFromText(`${merchant || ""} ${note || ""} ${rawText || ""}`);

    if (!category) category = fromItems || fromText || "other";
    if (category === "other") category = fromItems || fromText || "other";
  } else {
    category = "transfer";
  }

  const normalized = {
    tx_type: safeType,
    amount: Number.isFinite(amount) ? amount : null,
    date: parsed?.date ? String(parsed.date).slice(0, 10) : null,
    merchant,
    note,
    ref: parsed?.ref != null && String(parsed.ref).trim() ? String(parsed.ref).trim() : null,

    category,
    items,

    from_account: parsed?.from_account != null && String(parsed.from_account).trim() ? clampDigits(parsed.from_account, { maxLen: 6, minLen: 3 }) : null,
    to_account: parsed?.to_account != null && String(parsed.to_account).trim() ? clampDigits(parsed.to_account, { maxLen: 6, minLen: 3 }) : null,

    evidence:
      parsed?.evidence != null
        ? String(parsed.evidence).slice(0, 220)
        : rawText
        ? String(rawText).slice(0, 220)
        : null,
  };

  // ✅ Enhancement: robust account mapping
  const enhanced = enhanceAccounts({
    rawText,
    evidence: normalized.evidence,
    parsedFrom: normalized.from_account,
    parsedTo: normalized.to_account,
    tx_type: normalized.tx_type,
  });

  normalized.from_account = enhanced.picked.from_account;
  normalized.to_account = enhanced.picked.to_account;
  normalized.from_account_variants = enhanced.picked.from_account_variants;
  normalized.to_account_variants = enhanced.picked.to_account_variants;

  normalized.account_candidates = enhanced.candidates?.map((c) => ({
    role: c.role,
    digits: c.digits,
    score: c.score,
    raw: c.raw,
    line: String(c.line || "").slice(0, 140),
    isCard: !!c.isCard,
  }));

  return normalized;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, code: "method_not_allowed", message: "Use POST" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        code: "missing_openai_api_key",
        message: "OPENAI_API_KEY is not set on server",
      });
    }

    // Guard: body may be string or object depending on runtime
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    body = body || {};

    const imageUrl = String(body.imageUrl || "").trim();
    let imageDataUrl = String(body.imageDataUrl || "").trim();

    const imageBase64 = String(body.imageBase64 || "").trim();
    const mimeType = String(body.mimeType || "image/jpeg").trim();

    if (!imageDataUrl && imageBase64) {
      imageDataUrl = `data:${mimeType};base64,${imageBase64}`;
    }

    const finalImage = imageUrl || imageDataUrl;
    if (!finalImage) {
      return res.status(400).json({
        ok: false,
        code: "missing_image",
        message: "Provide imageDataUrl or imageBase64 or imageUrl",
      });
    }

    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

    const prompt =
      "You are an OCR+parser for Thai receipts and bank/payment slips used in a personal expense tracker.\n" +
      "Return STRICT JSON ONLY. No markdown. No extra text.\n" +
      "Allowed category_key values:\n" +
      "- expense: food, transport, shopping, bills, health, entertainment, other\n" +
      "- income: salary, bonus, investment, refund, other\n" +
      "- transfer: transfer\n" +
      "Schema:\n" +
      "{\n" +
      '  "tx_type": "expense"|"income"|"transfer",\n' +
      '  "amount": number|null,\n' +
      '  "date": "YYYY-MM-DD"|null,\n' +
      '  "merchant": string|null,\n' +
      '  "note": string|null,\n' +
      '  "ref": string|null,\n' +
      '  "category_key": string|null,\n' +
      '  "items": [\n' +
      '    { "name": string, "qty": number|null, "unit_price": number|null, "total": number|null, "category_key": string|null }\n' +
      "  ]|[],\n" +
      '  "from_account": string|null,\n' +
      '  "to_account": string|null,\n' +
      '  "evidence": string|null\n' +
      "}\n" +
      "Rules:\n" +
      "- If unsure, use null.\n" +
      "- tx_type: use 'transfer' only if clearly a transfer/bill-payment between accounts.\n" +
      "- amount: grand total paid.\n" +
      "- If receipt has multiple line items, fill items[] with as many as you can (max 30). If none, use [].\n" +
      "- For each item.category_key: best guess from item name.\n" +
      "- from_account / to_account:\n" +
      "  * MUST be ONLY last 3-6 digits of account number (digits only; Thai digits ok).\n" +
      "  * For card number, return last 4 digits ONLY.\n" +
      '  * Direction: "จาก/From/ผู้โอน" => from_account, "ไปยัง/To/ผู้รับ/บัญชีรับชำระ/หมายเลขบัตร" => to_account.\n' +
      "  * Do NOT use reference/biller/merchant ids as account.\n" +
      "- evidence: short key lines used (<= 220 chars).\n";

    const r = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0, // ✅ make it deterministic for extraction
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: finalImage },
            ],
          },
        ],
      }),
    });

    const data = await r.json().catch(() => null);

    if (!r.ok) {
      return res.status(r.status).json({
        ok: false,
        code: "openai_error",
        message: data?.error?.message || "OpenAI request failed",
        raw: data || null,
      });
    }

    const text = extractResponsesOutputText(data);
    const parsed = safeJsonParseMaybe(text);

    if (!parsed || typeof parsed !== "object") {
      return res.status(200).json({
        ok: false,
        code: "parse_failed",
        message: "Model output is not valid JSON",
        rawText: text,
        model,
      });
    }

    const normalized = normalizeScanResult(parsed, text);

    return res.status(200).json({
      ok: true,
      data: normalized,
      rawText: text,
      model,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      code: "server_error",
      message: String(err?.message || err),
    });
  }
}
