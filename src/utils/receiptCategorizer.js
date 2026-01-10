// src/utils/receiptCategorizer.js

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const containsAny = (text, kws) => kws.some((k) => text.includes(k));

const EXPENSE_KW = {
  food: [
    "ก๋วยเตี๋ยว",
    "ข้าว",
    "อาหาร",
    "ของกิน",
    "ร้าน",
    "ขนม",
    "restaurant",
    "noodle",
    "bbq",
    "pizza",
    "burger",
    "kfc",
    "mcdonald",
    "7-eleven",
    "seven",
  ],

  // ✅ Coffee/Tea (separate from general food)
  coffee: [
    "กาแฟ",
    "coffee",
    "cafe",
    "espresso",
    "latte",
    "mocha",
    "cappuccino",
    "americano",
    "ชา",
    "tea",
    "ชานม",
    "milk tea",
    // common brand keywords
    "starbucks",
    "สตาร์บัค",
    "สตาร์บัคส์",
  ],

  // ✅ Drinks (water/soft drinks/etc.)
  drinks: [
    "เครื่องดื่ม",
    "น้ำดื่ม",
    "น้ำเปล่า",
    "mineral",
    "water",
    "sparkling",
    "soda",
    "juice",
    "cola",
    "coke",
    "pepsi",
    "sprite",
    "fanta",
  ],
  transport: [
    "น้ำมัน",
    "เติมน้ำมัน",
    "ค่าน้ำมัน",
    "gas",
    "fuel",
    "petrol",
    "diesel",
    "ptt",
    "shell",
    "esso",
    "caltex",
    "bangchak",
    "parking",
    "ที่จอดรถ",
    "ค่าทางด่วน",
    "ทางด่วน",
    "toll",
    "bts",
    "mrt",
    "grab",
    "bolt",
    "taxi",
    "รถไฟฟ้า",
    "รถเมล์",
    "bus",
    "train",
  ],
  bills: [
    "ค่าไฟ",
    "ไฟฟ้า",
    "ค่าน้ำ",
    "น้ำประปา",
    "internet",
    "wifi",
    "broadband",
    "bill",
    "invoice",
    "ค่าบริการ",
    "ค่าโทร",
    "mobile",
    "ais",
    "dtac",
    "true",
  ],
  shopping: [
    "lazada",
    "shopee",
    "amazon",
    "central",
    "ikea",
    "homepro",
    "decathlon",
    "uniqlo",
    "ซื้อ",
    "shopping",
    "store",
    "mall",
    "marketplace",
    "supermarket",
    "lotus",
    "big c",
    "makro",
    "tops",
  ],
  health: [
    "โรงพยาบาล",
    "คลินิก",
    "clinic",
    "hospital",
    "ยา",
    "pharmacy",
    "watsons",
    "boots",
    "ตรวจ",
    "หมอ",
    // receipt item keywords (e.g., plasters, cold gel packs)
    "พลาสเตอร์",
    "พาสเตอร์",
    "แผ่นเจล",
    "ประคบ",
    "เจลประคบ",
  ],
  entertainment: ["netflix", "spotify", "cinema", "movie", "concert", "เกม", "game", "steam", "disney", "prime video"],

  // ✅ Receipt adjustments
  discount: ["ส่วนลด", "discount", "coupon", "promo", "promotion", "voucher"],
};

const INCOME_KW = {
  salary: ["เงินเดือน", "salary", "payroll", "wage"],
  bonus: ["โบนัส", "bonus"],
  investment: ["ดอกเบี้ย", "interest", "dividend", "ปันผล", "yield"],
  refund: ["คืนเงิน", "refund", "chargeback", "reversal", "return"],
};

const ALIAS = {
  // Thai labels from OCR/LLM sometimes
  "อาหาร": "food",
  "ของกิน": "food",
  "ร้านอาหาร": "food",
  "เดินทาง": "transport",
  "การเดินทาง": "transport",
  "ค่าน้ำมัน": "transport",
  "ช้อปปิ้ง": "shopping",
  "ซื้อของ": "shopping",
  "บิล": "bills",
  "ค่าน้ำ": "bills",
  "ค่าไฟ": "bills",
  "สุขภาพ": "health",
  "บันเทิง": "entertainment",
  "กาแฟ": "coffee",
  "ชา": "coffee",
  "เครื่องดื่ม": "drinks",
  "น้ำดื่ม": "drinks",
  "ส่วนลด": "discount",
  "discount": "discount",
  "อื่นๆ": "other",
  "เงินเดือน": "salary",
  "โบนัส": "bonus",
  "ลงทุน": "investment",
  "เงินคืน": "refund",
};

export function sanitizeCategoryKey(raw) {
  const r = norm(raw);
  if (!r) return "";
  if (ALIAS[r]) return ALIAS[r];

  // Keep this list aligned with DEFAULT_CATEGORIES ids (plus special ids)
  const known = new Set([
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
    "discount",
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

  if (known.has(r)) return r;

  // allow "food & beverage", "transportation", etc.
  for (const k of known) {
    if (r.includes(k)) return k;
  }
  return "";
}

export function inferCategoryKeyFromText(type, text) {
  const t = norm(text);
  if (!t) return "";

  if (type === "income") {
    for (const [k, arr] of Object.entries(INCOME_KW)) {
      if (containsAny(t, arr.map(norm))) return k;
    }
    return "";
  }

  for (const [k, arr] of Object.entries(EXPENSE_KW)) {
    if (containsAny(t, arr.map(norm))) return k;
  }
  return "";
}

/**
 * items: [{ name, amount?, total?, price?, qty? }]
 * returns groups: [{ key, amount, names[] }]
 */
export function groupReceiptItemsToCategory(type, items = [], fallbackText = "", fallbackCategory = "") {
  const safeItems = Array.isArray(items) ? items : [];
  const groups = new Map();

  // 1) categorize each item line
  for (const it of safeItems) {
    const name = String(it?.name || it?.title || it?.desc || "").trim();
    const text = norm(name);
    const rawKey =
      sanitizeCategoryKey(it?.category_key) ||
      sanitizeCategoryKey(it?.categoryKey) ||
      sanitizeCategoryKey(it?.category) ||
      sanitizeCategoryKey(it?.cat) ||
      sanitizeCategoryKey(fallbackCategory);
    const key = rawKey || inferCategoryKeyFromText(type, text) || "other";

    // amount priority: total > amount > price*qty
    const qty = Number(it?.qty || it?.quantity || 0) || 0;
    const price = Number(it?.price || 0) || 0;
    const computed = qty > 0 && price > 0 ? qty * price : 0;

    const amt =
      Number(it?.total) ||
      Number(it?.amount) ||
      Number(it?.lineTotal) ||
      (computed > 0 ? computed : 0);

    if (!Number.isFinite(amt) || amt <= 0) continue;

    const prev = groups.get(key) || { key, amount: 0, names: [] };
    prev.amount += amt;
    if (name) prev.names.push(name);
    groups.set(key, prev);
  }

  let arr = [...groups.values()].filter((g) => Number.isFinite(g.amount) && g.amount > 0);

  // 2) If no usable items amount, fallback to whole receipt inference from text
  if (!arr.length) {
    const key = sanitizeCategoryKey(fallbackCategory) || inferCategoryKeyFromText(type, fallbackText) || "other";
    return { groups: [], primaryKey: key };
  }

  // 3) sort groups by amount desc
  arr.sort((a, b) => b.amount - a.amount);

  // 4) pick primary (largest)
  const primaryKey = arr[0]?.key || "other";

  return { groups: arr, primaryKey };
}

/**
 * ✅ Split receipt items into per-line entries (no grouping)
 * - Filters out zero/invalid amounts (amt <= 0)
 * - Infers category key from item text (fallback to receipt category/text)
 *
 * returns lines: [{ key, name, amount, qty?, price? }]
 * amount is THB (major units, number)
 */
export function splitReceiptItemsToLines(type, items = [], fallbackText = "", fallbackCategory = "") {
  const safeItems = Array.isArray(items) ? items : [];
  const out = [];

  for (const it of safeItems) {
    const name = String(it?.name || it?.title || it?.desc || "").trim();
    const text = norm(name);

    const rawKey =
      sanitizeCategoryKey(it?.category_key) ||
      sanitizeCategoryKey(it?.categoryKey) ||
      sanitizeCategoryKey(it?.category) ||
      sanitizeCategoryKey(it?.cat) ||
      sanitizeCategoryKey(fallbackCategory);
    const key = rawKey || inferCategoryKeyFromText(type, text) || "other";

    // amount priority: total > amount > lineTotal > price*qty
    const qty = Number(it?.qty || it?.quantity || 0) || 0;
    const price = Number(it?.price || 0) || 0;
    const computed = qty > 0 && price > 0 ? qty * price : 0;

    const amt =
      Number(it?.total) ||
      Number(it?.amount) ||
      Number(it?.lineTotal) ||
      (computed > 0 ? computed : 0);

    // ✅ Skip zero lines (e.g., promotions/points)
    if (!Number.isFinite(amt) || amt <= 0) continue;

    out.push({
      key,
      name,
      amount: amt,
      qty: qty || undefined,
      price: price || undefined,
    });
  }

  // If no usable items, return empty
  if (!out.length) return [];

  // Keep OCR order (as pushed)
  return out;
}
