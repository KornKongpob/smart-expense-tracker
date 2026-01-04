// api/scan.js
// Vercel Serverless Function: POST /api/scan
// Required env: OPENAI_API_KEY
// Optional env: OPENAI_MODEL (default: gpt-4o-mini)

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

function findFirstParsedObject(resp) {
  try {
    const out = resp?.output;
    if (Array.isArray(out)) {
      for (const item of out) {
        const content = item?.content;
        if (Array.isArray(content)) {
          for (const c of content) {
            if (c && typeof c === "object" && c.parsed && typeof c.parsed === "object") return c.parsed;
            if (c && typeof c === "object" && c.json && typeof c.json === "object") return c.json;
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
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

function clamp01(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function normalizeCategoryKey(v) {
  const s = safeString(v).toLowerCase();
  if (!s) return null;

  // Keep this list aligned with DEFAULT_CATEGORIES (src/constants/categories.js)
  // plus special/system keys.
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
    "adjust_balance",
    "insurance",
    "donation",
    "gift",
    "mixed",
    "other",
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
    // system
    "transfer",
  ]);
  if (allowed.has(s)) return s;

  const alias = {
    // utilities
    utilities: "bills",
    utility: "bills",
    bill: "bills",
    // transport
    gas: "fuel",
    fuel: "fuel",
    petrol: "fuel",
    diesel: "fuel",
    commute: "transport",
    // groceries/shopping
    supermarket: "groceries",
    groceries: "groceries",
    market: "groceries",
    convenience: "groceries",
    // food/drinks
    beverage: "drinks",
    drinks: "drinks",
    drink: "drinks",
    cafe: "coffee",
    coffee: "coffee",
    tea: "coffee",
    restaurant: "dining",
    dining: "dining",
    // health
    medicine: "health",
    pharmacy: "health",
    // entertainment
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

  // Coffee/Tea
  if (
    has([
      "cafe",
      "coffee",
      "espresso",
      "latte",
      "mocha",
      "cappuccino",
      "americano",
      "tea",
      "milk tea",
      "starbucks",
      "กาแฟ",
      "ชา",
      "ชานม",
      "สตาร์บัค",
      "สตาร์บัคส์",
    ])
  )
    return "coffee";

  // Drinks (water/soft drinks)
  if (
    has([
      "beverage",
      "drink",
      "drinks",
      "water",
      "mineral",
      "sparkling",
      "soda",
      "juice",
      "cola",
      "coke",
      "pepsi",
      "sprite",
      "fanta",
      "เครื่องดื่ม",
      "น้ำดื่ม",
      "น้ำเปล่า",
    ])
  )
    return "drinks";

  // Dining vs Food (merchant-level words → dining; item-level words → food)
  if (has(["restaurant", "ร้านอาหาร", "lineman", "line man", "grabfood"])) return "dining";

  if (
    has([
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
      "อาหาร",
      "ก๋วยเตี๋ยว",
      "ข้าว",
      "ไก่",
      "หมู",
      "ปลา",
      "ส้มตำ",
      "บะหมี่",
      "ของกิน",
      "ขนม",
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

  // Groceries / convenience stores (prefer groceries)
  if (
    has([
      "7-eleven",
      "7 eleven",
      "seven eleven",
      "lotus",
      "tesco",
      "big c",
      "makro",
      "supermarket",
      "market",
      "tops",
      "grocery",
      "groceries",
      "ซื้อของ",
      "ร้านค้า",
      "ตลาด",
      "เซเว่น",
      "โลตัส",
      "บิ๊กซี",
      "แม็คโคร",
    ])
  )
    return "groceries";

  if (has(["shopping", "store", "mall", "lazada", "shopee", "amazon", "shop", "ช้อป"])) return "shopping";

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
 * Credit card payment detection (fallback)
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
    "statement",
    "credit",
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

function chooseFromToByCandidates({ candidates, modelFrom, modelTo, preferCardTo = false }) {
  const list = Array.isArray(candidates) ? candidates.slice() : [];

  const mf = clampDigits(modelFrom, { maxLen: 6, minLen: 3 });
  const mt = clampDigits(modelTo, { maxLen: 6, minLen: 3 });
  if (mf)
    list.push({
      role: "from",
      digits: mf,
      score: 0.5,
      raw: String(modelFrom || ""),
      line: "",
      isCard: false,
      variants: makeAccountVariants(mf),
    });
  if (mt)
    list.push({
      role: "to",
      digits: mt,
      score: 0.5,
      raw: String(modelTo || ""),
      line: "",
      isCard: false,
      variants: makeAccountVariants(mt),
    });

  const fromCandidates = list.filter((c) => c.role === "from").sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const toCandidates = list.filter((c) => c.role === "to").sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  let from = fromCandidates[0]?.digits || mf || null;
  let to = toCandidates[0]?.digits || mt || null;

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
 * Tx refinement:
 * - Prefer AI signal (tx_subtype / is_credit_card_payment) when present
 * - Fallback: detect by keywords in evidence/raw text
 * ========================= */
function normalizeTxSubtype(v) {
  const s = safeString(v).toLowerCase();
  if (!s) return null;
  if (s === "credit_card_payment" || s === "creditcard_payment" || s === "credit_payment") return "credit_card_payment";
  if (s === "transfer" || s === "normal_transfer") return "transfer";
  return null;
}

function coerceBool(v) {
  if (typeof v === "boolean") return v;
  const s = safeString(v).toLowerCase();
  if (!s) return false;
  if (s === "true" || s === "1" || s === "yes" || s === "y") return true;
  return false;
}

function refineTxTypeAndSubtype({ parsedTxType, parsedTxSubtype, parsedIsCreditPayment, evidence, rawText }) {
  const safeType = parsedTxType === "income" || parsedTxType === "transfer" ? parsedTxType : "expense";
  const subtype = normalizeTxSubtype(parsedTxSubtype);
  const isCreditFromAI = coerceBool(parsedIsCreditPayment) || subtype === "credit_card_payment";

  const combined = `${String(evidence || "")}\n${String(rawText || "")}`.trim();
  const isCreditFromText = isCreditCardPaymentText(combined);

  const isCredit = isCreditFromAI || isCreditFromText;

  if (isCredit) {
    // ✅ สำคัญ: ให้ “ชำระบัตรเครดิต” เป็น 2 legs แบบ transfer แต่มี subtype เฉพาะ
    return { tx_type: "transfer", tx_subtype: "credit_card_payment", is_credit_card_payment: true };
  }

  // normal
  return {
    tx_type: safeType,
    tx_subtype: safeType === "transfer" ? "transfer" : null,
    is_credit_card_payment: false,
  };
}

function normalizeScanResult(parsed, rawText) {
  const parsedType = String(parsed?.tx_type || "").toLowerCase();
  const evidence0 =
    parsed?.evidence != null
      ? String(parsed.evidence).slice(0, 220)
      : rawText
      ? String(rawText).slice(0, 220)
      : null;

  const refined = refineTxTypeAndSubtype({
    parsedTxType: parsedType,
    parsedTxSubtype: parsed?.tx_subtype,
    parsedIsCreditPayment: parsed?.is_credit_card_payment,
    evidence: evidence0,
    rawText,
  });

  const amount = typeof parsed?.amount === "number" ? parsed.amount : parsed?.amount != null ? Number(parsed.amount) : null;
  const merchant = parsed?.merchant != null ? String(parsed.merchant) : null;
  const note = parsed?.note != null ? String(parsed.note) : merchant != null ? String(merchant) : null;

  // items can be "items" or legacy keys; normalize into {name, qty, unit_price, total, category_key}
  let items = normalizeItems(parsed?.items ?? parsed?.line_items ?? parsed?.lines ?? null);

  // ---- doc_type normalization ----
  const dtRaw = safeString(parsed?.doc_type ?? parsed?.docType).toLowerCase();
  const allowedDt = new Set(["receipt", "transfer_slip", "bill_payment", "unknown"]);
  let doc_type = allowedDt.has(dtRaw) ? dtRaw : "";

  // If model didn't provide doc_type, infer lightly from refined tx_type and presence of line items
  if (!doc_type) {
    if (refined.tx_type === "transfer") doc_type = "transfer_slip";
    else if (Array.isArray(items) && items.some((it) => (safeNumber(it?.total) || 0) > 0)) doc_type = "receipt";
    else doc_type = "unknown";
  }

  // Enforce: transfer slips / bill payments must not contain purchase line items
  if (doc_type === "transfer_slip" || doc_type === "bill_payment" || refined.tx_type === "transfer") {
    items = [];
  }

  // ---- category ----
  let category =
    normalizeCategoryKey(parsed?.category_key) ||
    normalizeCategoryKey(parsed?.category) ||
    (refined.tx_type === "transfer" ? "transfer" : null);

  if (refined.tx_type !== "transfer") {
    const fromItems = pickDominantCategoryFromItems(items);
    const fromText = inferCategoryFromText(`${merchant || ""} ${note || ""} ${rawText || ""}`);
    if (!category) category = fromItems || fromText || "other";
    if (category === "other") category = fromItems || fromText || "other";
  } else {
    category = "transfer";
  }

  // ✅ Parent category strategy for receipt splits:
  // If receipt has items across multiple categories, set the main category to "mixed"
  // (the app should use child items for budgets/stats; parent is UI-only).
  if (doc_type === "receipt" && Array.isArray(items) && items.length) {
    const distinct = new Set(
      items
        .map((it) => normalizeCategoryKey(it?.category_key))
        .filter((k) => !!k && k !== "other")
    );
    if (distinct.size >= 2) category = "mixed";
    else if (distinct.size === 1 && (!category || category === "other")) category = Array.from(distinct)[0];
  }

  // ---- confidence + flags (hybrid guardrails) ----
  const confIn = parsed?.confidence && typeof parsed.confidence === "object" ? parsed.confidence : {};
  const confidence = {
    overall: clamp01(typeof confIn.overall === 'number' ? confIn.overall : (typeof parsed?.confidence_overall === 'number' ? parsed.confidence_overall : null)),
    amount: clamp01(typeof confIn.amount === 'number' ? confIn.amount : null),
    date: clamp01(typeof confIn.date === 'number' ? confIn.date : null),
    merchant: clamp01(typeof confIn.merchant === 'number' ? confIn.merchant : null),
    items: clamp01(typeof confIn.items === 'number' ? confIn.items : null),
  };

  const flagsIn = parsed?.flags && typeof parsed.flags === "object" ? parsed.flags : {};

  // Compute simple item flags from normalized items
  const hasPositiveItems = Array.isArray(items) && items.some((it) => (safeNumber(it?.total) || 0) > 0);
  const hasZeroItems = Array.isArray(items) && items.some((it) => (safeNumber(it?.total) || 0) === 0);
  const hasDiscountHint = /ส่วนลด|discount|คูปอง|coupon|แต้ม|points|โปรโมชั่น|promo/i.test(String(rawText || ""));

  // needs_human_review: low confidence OR inconsistent totals (when receipt)
  let needsReview = false;
  if (confidence.overall != null && confidence.overall < 0.6) needsReview = true;

  if (doc_type === "receipt" && amount != null && hasPositiveItems) {
    const sum = items.reduce((s, it) => s + (safeNumber(it?.total) || 0), 0);
    if (sum > 0) {
      const diff = Math.abs(sum - amount);
      if (diff >= 2) needsReview = true; // >= 2 THB mismatch
    }
  }

  const flags = {
    has_line_items: typeof flagsIn.has_line_items === 'boolean' ? flagsIn.has_line_items : !!hasPositiveItems,
    has_zero_price_lines: typeof flagsIn.has_zero_price_lines === 'boolean' ? flagsIn.has_zero_price_lines : !!hasZeroItems,
    has_discount_lines: typeof flagsIn.has_discount_lines === 'boolean' ? flagsIn.has_discount_lines : !!hasDiscountHint,
    needs_human_review: typeof flagsIn.needs_human_review === 'boolean' ? flagsIn.needs_human_review : !!needsReview,
  };

  const normalized = {
    doc_type,

    tx_type: refined.tx_type,
    tx_subtype: refined.tx_subtype,
    is_credit_card_payment: refined.is_credit_card_payment,

    amount: Number.isFinite(amount) ? amount : null,
    currency: parsed?.currency != null && String(parsed.currency).trim() ? String(parsed.currency).trim().toUpperCase() : null,
    date: parsed?.date ? String(parsed.date).slice(0, 10) : null,
    merchant,
    note,
    ref: parsed?.ref != null && String(parsed.ref).trim() ? String(parsed.ref).trim() : null,

    // keep both legacy and new keys for compatibility
    category,
    category_key: category,

    items,

    from_account:
      parsed?.from_account != null && String(parsed.from_account).trim()
        ? clampDigits(parsed.from_account, { maxLen: 6, minLen: 3 })
        : null,
    to_account:
      parsed?.to_account != null && String(parsed.to_account).trim()
        ? (refined.is_credit_card_payment
            ? (lastN(parsed.to_account, 4) || clampDigits(parsed.to_account, { maxLen: 6, minLen: 3 }))
            : clampDigits(parsed.to_account, { maxLen: 6, minLen: 3 }))
        : null,

    evidence: evidence0,
    confidence,
    flags,
  };

  const enhanced = enhanceAccounts({
    rawText,
    evidence: normalized.evidence,
    parsedFrom: normalized.from_account,
    parsedTo: normalized.to_account,
    preferCardTo: refined.is_credit_card_payment,
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

    // Users sometimes set OPENAI_MODEL to informal names like "chatgpt 5.0".
    // Normalize to valid model IDs.
    const normalizeOpenAIModel = (raw) => {
      const s = String(raw || "").trim();
      if (!s) return "gpt-4o-mini";

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

    const primaryModel = normalizeOpenAIModel(process.env.OPENAI_MODEL);
    // ✅ Optional fallback for higher accuracy OCR (especially small Thai fonts)
    // If OPENAI_MODEL_FALLBACK is not set, we default to gpt-4o (only used when needed).
    const fallbackModel = normalizeOpenAIModel(process.env.OPENAI_MODEL_FALLBACK || "gpt-4o");

    // ✅ ปรับ prompt ให้ AI “ส่งสัญญาณ” ชำระบัตรเครดิตมาเลย
    // - ถ้าเป็นสลิปชำระบัตรเครดิต/โอนเข้าบัตรเครดิต: tx_type="transfer", tx_subtype="credit_card_payment", is_credit_card_payment=true
    // - ถ้าเป็น transfer ปกติ: tx_type="transfer", tx_subtype="transfer", is_credit_card_payment=false
    // - ถ้าเป็นใบเสร็จ: expense/income ตามเดิม
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

Allowed category_key values (prefer these exact ids; if unsure use 'other'):
- expense: food, drinks, coffee, dining, groceries, transport, fuel, bills, rent, shopping, entertainment, travel, health, other, mixed
- income: salary, bonus, freelance, business, investment, interest, dividend, refund, other_income
- transfer: transfer

For receipts (doc_type=receipt):
- category_key = best single category for the whole receipt if it is clearly one category.
- If the receipt contains multiple categories (e.g., food + drinks + health), set category_key="mixed".
- Each item in items[] should have its own category_key.

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
                  category_key: { anyOf: [{ type: "string" }, { type: "null" }] },
                },
              },
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
                items: { anyOf: [{ type: "number" }, { type: "null" }] },
              },
            },
            flags: {
              type: "object",
              additionalProperties: false,
              required: ["has_line_items", "has_zero_price_lines", "has_discount_lines", "needs_human_review"],
              properties: {
                has_line_items: { type: "boolean" },
                has_zero_price_lines: { type: "boolean" },
                has_discount_lines: { type: "boolean" },
                needs_human_review: { type: "boolean" },
              },
            },
          },
      },
    };

    const callOpenAI = async (modelToUse, promptText) => {
      const r = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelToUse,
          temperature: 0,
          text: { format: text_format },
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: promptText },
                { type: "input_image", image_url: finalImage },
              ],
            },
          ],
        }),
      });

      const data = await r.json().catch(() => null);
      return { r, data, modelUsed: modelToUse };
    };

    // 1) Primary pass (cheap)
    let { r, data, modelUsed } = await callOpenAI(primaryModel, prompt);

    if (!r.ok) {
      const msg = data?.error?.message || "OpenAI request failed";
      const tip =
        /model/i.test(msg) && /not found|does not exist|unknown/i.test(msg)
          ? "Check OPENAI_MODEL. Valid examples: gpt-4o-mini, gpt-4o-2024-08-06, gpt-4.1-mini, gpt-5.2."
          : null;

      return res.status(r.status).json({
        ok: false,
        code: "openai_error",
        message: msg,
        model: modelUsed,
        tip,
        raw: data || null,
      });
    }

    let parsedObj = findFirstParsedObject(data);
    let text = extractResponsesOutputText(data);

    // 2) Fallback pass (higher accuracy) – only when signals suggest OCR is weak
    try {
      const parsedForDecision = parsedObj || safeJsonParseMaybe(text);

      const docType = safeString(parsedForDecision?.doc_type);
      const isReceipt = docType === "receipt";
      const items = Array.isArray(parsedForDecision?.items) ? parsedForDecision.items : [];
      const itemsCount = items
        .map((it) => safeNumber(it?.line_total ?? it?.total ?? it?.amount))
        .filter((n) => typeof n === "number" && Number.isFinite(n) && n > 0).length;

      const needsReview = !!parsedForDecision?.flags?.needs_human_review;
      const itemsConf = safeNumber(parsedForDecision?.confidence?.items);
      const overallConf = safeNumber(parsedForDecision?.confidence?.overall);

      const amount = safeNumber(parsedForDecision?.amount);
      const sumItems = items.reduce((s, it) => s + (safeNumber(it?.line_total ?? it?.total ?? it?.amount) || 0), 0);
      const diff = amount != null && sumItems > 0 ? Math.abs(amount - sumItems) : 0;
      const mismatch = amount != null && sumItems > 0 ? diff > Math.max(10, amount * 0.15) : false;

      const shouldFallback =
        fallbackModel &&
        fallbackModel !== primaryModel &&
        isReceipt &&
        (
          needsReview ||
          itemsCount === 0 ||
          (typeof itemsConf === "number" && itemsConf < 0.55) ||
          (typeof overallConf === "number" && overallConf < 0.55) ||
          mismatch
        );

      if (shouldFallback) {
        const secondPassHint = `\n\nSecond pass instructions:\n- Focus on reading small Thai fonts accurately.\n- Ensure items[] includes ONLY purchased lines with line_total > 0 (skip any 0-price lines/promotions).\n- Prefer clean item names (no totals/VAT lines).\n- If multiple item categories exist, set category_key=\"mixed\" and set each item.category_key.`;

        const second = await callOpenAI(fallbackModel, prompt + secondPassHint);
        if (second?.r?.ok) {
          r = second.r;
          data = second.data;
          modelUsed = second.modelUsed;
          parsedObj = findFirstParsedObject(data);
          text = extractResponsesOutputText(data);
        }
      }
    } catch {
      // ignore fallback decision errors; keep primary output
    }

    const parsed = parsedObj || safeJsonParseMaybe(text);

    if (!parsed || typeof parsed !== "object") {
      return res.status(200).json({
        ok: false,
        code: "parse_failed",
        message: "Model output is not valid JSON",
        rawText: text,
        model: modelUsed,
      });
    }

    const normalized = normalizeScanResult(parsed, text);

    return res.status(200).json({
      ok: true,
      data: normalized,
      rawText: text,
      model: modelUsed,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      code: "server_error",
      message: String(err?.message || err),
    });
  }
}
