// src/utils/receiptCategorizer.js

import { DEFAULT_CATEGORIES } from "../constants/categories.js";
import { parseMoneyToSatang } from "./money.js";

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const containsAny = (text, kws) => kws.some((k) => text.includes(k));

const EXPENSE_KW = {
  // ✅ Snacks (separate from general food)
  // NOTE: keep a single `snacks` key (duplicate object keys get overwritten at runtime).
  snacks: [
    "ขนม",
    "ขนมปัง",
    "ทอดกรอบ",
    "กรอบ",
    "บิสกิต",
    "คุกกี้",
    "เวเฟอร์",
    "มันฝรั่ง",
    "ข้าวโพด",
    "ข้าวเกรียบ",
    "ข้าวโพดคั่ว",
    "ถั่ว",
    "ลูกอม",
    "ช็อกโกแลต",
    "snack",
    "chips",
    "chip",
    "cookie",
    "biscuit",
    "cracker",
    "popcorn",
    "candy",
    "chocolate",
  ],
  food: [
    "ก๋วยเตี๋ยว",
    "ข้าว",
    "อาหาร",
    "ของกิน",
    "ร้าน",
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

  // ✅ Personal care / Beauty
  personal_care: [
    "สบู่", "แชมพู", "ครีม", "โลชั่น", "เซรั่ม", "ครีมกันแดด", "sunscreen",
    "shampoo", "soap", "lotion", "cream", "moisturizer", "deodorant",
    "แปรงสีฟัน", "ยาสีฟัน", "toothpaste", "toothbrush",
    "สกินแคร์", "skincare", "makeup", "เครื่องสำอาง",
  ],

  // ✅ Household items
  home: [
    "ผงซักฟอก", "น้ำยาซักผ้า", "น้ำยาล้างจาน", "น้ำยาถูพื้น",
    "กระดาษทิชชู่", "ทิชชู่", "tissue", "ผ้าอนามัย",
    "ถุงขยะ", "ไม้กวาด", "หลอดไฟ", "แบตเตอรี่", "battery",
    "detergent", "cleaner", "wipe", "sponge",
  ],

  // ✅ Bakery / Dessert (item-level)
  bakery: [
    "เค้ก", "cake", "donut", "โดนัท", "ครัวซอง", "croissant",
    "พาย", "pie", "tart", "ทาร์ต", "มัฟฟิน", "muffin",
    "บราวนี่", "brownie", "bread", "ขนมปัง",
  ],
  dessert: [
    "ไอศกรีม", "ice cream", "ไอติม", "เยลลี่", "jelly", "พุดดิ้ง",
    "pudding", "วาฟเฟิล", "waffle", "เครป", "crepe",
  ],

  // ✅ Electronics
  electronics: [
    "สายชาร์จ", "charger", "cable", "adapter", "หูฟัง", "earphone",
    "earbuds", "airpods", "เคสโทรศัพท์", "phone case", "screen protector",
    "ฟิล์ม", "flash drive", "usb", "sd card", "power bank",
  ],

  // ✅ Clothing
  clothing: [
    "เสื้อ", "กางเกง", "กระโปรง", "shirt", "pants", "shorts",
    "jacket", "เสื้อยืด", "t-shirt", "ชุดชั้นใน", "ถุงเท้า", "socks",
  ],

  // ✅ Receipt adjustments
  discount: ["ส่วนลด", "discount", "coupon", "promo", "promotion", "voucher", "ลด"],
  fees: ["ค่าบริการ", "service charge", "ค่าส่ง", "delivery fee", "shipping", "ค่าถุง", "bag fee", "vat", "ภาษี", "tax"],
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
  "ของว่าง": "snacks",
  "ขนมขบเคี้ยว": "snacks",
  "เครื่องดื่ม": "drinks",
  "เบเกอรี่": "bakery",
  "ของหวาน": "dessert",
  "เดินทาง": "transport",
  "การเดินทาง": "transport",
  "ค่าน้ำมัน": "transport",
  "ช้อปปิ้ง": "shopping",
  "เสื้อผ้า": "clothing",
  "อิเล็กทรอนิกส์": "electronics",
  "ของใช้ในบ้าน": "home",
  "ดูแลตัวเอง": "personal_care",
  "สุขภาพ": "health",
  "ความงาม": "personal_care",
  "ซื้อของ": "shopping",
  "บิล": "bills",
  "ค่าน้ำ": "bills",
  "ค่าไฟ": "bills",
  "บันเทิง": "entertainment",
  "กาแฟ": "coffee",
  "ชา": "coffee",
  "น้ำดื่ม": "drinks",
  "ขนม": "snacks",
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

  // ✅ Auto-sync with DEFAULT_CATEGORIES ids (plus special ids)
  const known = (() => {
    const ids = new Set();
    for (const c of (DEFAULT_CATEGORIES?.expense || [])) ids.add(String(c?.id || "").trim());
    for (const c of (DEFAULT_CATEGORIES?.income || [])) ids.add(String(c?.id || "").trim());
    ids.add("transfer");
    ids.delete("");
    return ids;
  })();

  if (known.has(r)) return r;

  // allow "food & beverage", "transportation", etc.
  for (const k of known) {
    if (!k) continue;
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

  // ✅ Priority order matters.
  // We want:
  // - discount lines => discount
  // - snacks => snacks
  // - beverages (including coffee/tea) => drinks (user preference)
  // - then everything else.
  if (containsAny(t, EXPENSE_KW.discount.map(norm))) return "discount";
  if (containsAny(t, EXPENSE_KW.snacks.map(norm))) return "snacks";

  // Treat coffee/tea as drinks for receipt splitting.
  const bev = [...EXPENSE_KW.drinks, ...EXPENSE_KW.coffee].map(norm);
  if (containsAny(t, bev)) return "drinks";

  // Fall back to remaining categories (excluding coffee/snacks/discount already handled)
  const fallbackOrder = [
    "food",
    "transport",
    "bills",
    "shopping",
    "health",
    "entertainment",
  ];
  for (const k of fallbackOrder) {
    const arr = EXPENSE_KW[k];
    if (Array.isArray(arr) && containsAny(t, arr.map(norm))) return k;
  }

  // Last resort: try any remaining keyword buckets
  for (const [k, arr] of Object.entries(EXPENSE_KW)) {
    if (k === "discount" || k === "snacks" || k === "coffee" || k === "drinks") continue;
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
export function splitReceiptItemsToLines(type, itemsOrPayload, fallbackText = "", fallbackCategory = "other") {
  // Accept either an array of items OR a payload: { items, adjustments, targetTotalSatang }
  const payload = Array.isArray(itemsOrPayload) ? { items: itemsOrPayload } : (itemsOrPayload && typeof itemsOrPayload === "object" ? itemsOrPayload : { items: [] });
  const items = Array.isArray(payload.items) ? payload.items : [];
  const adjustmentsIn = Array.isArray(payload.adjustments) ? payload.adjustments : [];

  // Target total (prefer satang)
  const targetTotalSatang = Number.isFinite(payload.targetTotalSatang) ? Math.round(payload.targetTotalSatang) : null;

  const toSatang = (v) => {
    if (v == null || v === "") return null;
    const sat = parseMoneyToSatang(v);
    return Number.isFinite(sat) ? sat : null;
  };

  const fromSatang = (s) => (Number.isFinite(s) ? (s / 100) : null);

  // Normalize raw items into internal lines (satang)
  const itemLines = [];
  // Infer a best-guess category from the overall receipt text (merchant + note, etc.)
  // NOTE: We intentionally reuse inferCategoryKeyFromText here to avoid relying on a
  // separate helper that may not exist in the browser bundle.
  const inferredFromText = inferCategoryKeyFromText(type, fallbackText || "") || null;

  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const name = String(it.name || it.title || it.item || "").trim();
    if (!name) continue;

    const rawTotal = it.total ?? it.lineTotal ?? it.line_total ?? it.amount ?? it.price;
    let totalSat = toSatang(rawTotal);

    // Children (1 level)
    const children = Array.isArray(it.children)
      ? it.children
          .map((ch) => {
            if (!ch || typeof ch !== "object") return null;
            const chName = String(ch.name || ch.title || ch.item || "").trim();
            if (!chName) return null;
            const chTotalSat = toSatang(ch.total ?? ch.lineTotal ?? ch.line_total ?? ch.amount ?? ch.price);
            if (!Number.isFinite(chTotalSat) || chTotalSat <= 0) return null;
            return { name: chName, amountSatang: chTotalSat };
          })
          .filter(Boolean)
          .slice(0, 12)
      : null;

    const childSumSat = children?.reduce((s, c) => s + (c.amountSatang || 0), 0) || 0;

    const rawKey = sanitizeCategoryKey(it.category_key ?? it.categoryKey ?? it.category ?? it.cat ?? fallbackCategory);
    const category_key = rawKey || inferCategoryKeyFromText(type, name) || inferredFromText || sanitizeCategoryKey(fallbackCategory) || "other";

    // If the model accidentally put discount lines as negative item totals, convert them into adjustment lines later
    itemLines.push({
      receiptLineType: "item",
      name,
      category_key,
      baseTotalSatang: Number.isFinite(totalSat) ? totalSat : null,
      childSumSatang: childSumSat,
      children: children?.length ? children : null,
      // Track whether we applied rollup to make parent include children
      childrenIncludedInParent: !!(children && children.length),
    });
  }

  // Normalize adjustment lines (satang, positive amount)
  const adjustmentLines = [];
  for (const a of adjustmentsIn) {
    if (!a || typeof a !== "object") continue;
    const name = String(a.name || a.label || a.title || a.type || "").trim() || "Adjustment";
    const amtSat = toSatang(a.amount ?? a.value ?? a.total ?? a.line_total ?? a.lineTotal ?? a.amt);
    if (!Number.isFinite(amtSat) || amtSat == 0) continue;
    const effect = String(a.effect || "").toLowerCase().trim() === "subtract" ? "subtract" : "add";
    const typeRaw = String(a.type || "").toLowerCase().trim();
    const adjType = ["discount", "fee", "tax", "service_charge", "rounding", "other"].includes(typeRaw) ? typeRaw : "other";
    adjustmentLines.push({
      receiptLineType: "adjustment",
      name,
      amountSatang: Math.abs(amtSat),
      adjustmentEffect: effect,
      adjustmentType: adjType,
      category_key: effect === "subtract" ? "discount" : "fees",
    });
  }

  // Also convert negative item totals into adjustments (common OCR behavior)
  for (const it of itemLines) {
    if (Number.isFinite(it.baseTotalSatang) && it.baseTotalSatang < 0) {
      adjustmentLines.push({
        receiptLineType: "adjustment",
        name: it.name,
        amountSatang: Math.abs(it.baseTotalSatang),
        adjustmentEffect: "subtract",
        adjustmentType: "discount",
        category_key: "discount",
      });
      it.baseTotalSatang = 0;
    }
  }


  // Also convert discount-like POSITIVE items into subtract adjustments (some models/OCR emit discounts as + amounts)
  for (const it of itemLines) {
    const nm = norm(it?.name || '');
    if (!nm) continue;
    const isDisc = containsAny(nm, EXPENSE_KW.discount || []);
    if (!isDisc) continue;
    if (Number.isFinite(it.baseTotalSatang) && it.baseTotalSatang > 0) {
      adjustmentLines.push({
        receiptLineType: 'adjustment',
        name: it.name,
        amountSatang: Math.abs(it.baseTotalSatang),
        adjustmentEffect: 'subtract',
        adjustmentType: 'discount',
        category_key: 'discount',
      });
      it.baseTotalSatang = 0;
    }
  }
  // --- Child roll-up heuristic ---
  // We want the sum(items) + signedSum(adjustments) to be as close as possible to targetTotalSatang.
  // If some parents exclude children, we can add childSumSatang to those parents.
  const candidates = itemLines
    .map((it, idx) => ({ idx, delta: it.childSumSatang || 0 }))
    .filter((c) => c.delta > 0);

  if (Number.isFinite(targetTotalSatang) && candidates.length) {
    const baseItemsSum = itemLines.reduce((s, it) => s + (Number.isFinite(it.baseTotalSatang) ? it.baseTotalSatang : 0), 0);
    const adjSignedSum = adjustmentLines.reduce((s, a) => s + (a.adjustmentEffect === "subtract" ? -a.amountSatang : a.amountSatang), 0);
    const baseSum = baseItemsSum + adjSignedSum;
    let needed = targetTotalSatang - baseSum;

    // If we need to add money and child deltas can cover it, choose subset of child sums to add.
    if (needed > 0) {
      const deltas = candidates.map((c) => c.delta);
      const maxAdd = deltas.reduce((s, d) => s + d, 0);
      // If needed is wildly larger than children total, don't force rollup; leave to reconciliation.
      if (needed <= maxAdd + 200) {
        const pick = pickSubsetClosest(candidates, needed);
        for (const idx of pick) {
          const it = itemLines[idx];
          if (!it) continue;
          if (Number.isFinite(it.baseTotalSatang)) it.baseTotalSatang += it.childSumSatang;
        }
      }
    }
  }

  // ✅ Output as per-line entries (NO grouping by category).
  // Users want to see each purchased item line separately even if it shares the same category.
  // Keep the original order: items first, then adjustments.
  const out = [];

  for (const it of itemLines) {
    const amtSat = Number.isFinite(it.baseTotalSatang) ? it.baseTotalSatang : 0;
    if (amtSat <= 0) continue;
    out.push({
      key: it.category_key || sanitizeCategoryKey(fallbackCategory) || "other",
      name: it.name,
      amount: fromSatang(amtSat),
      receiptLineType: "item",
      adjustmentEffect: "add",
      adjustmentType: null,
      children: it.children ? it.children.map((c) => ({ name: c.name, amount: fromSatang(c.amountSatang) })) : null,
      childrenIncludedInParent: !!it.childrenIncludedInParent,
    });
  }

  for (const a of adjustmentLines) {
    out.push({
      key: a.category_key || (a.adjustmentEffect === "subtract" ? "discount" : "fees"),
      name: a.name,
      amount: fromSatang(a.amountSatang),
      receiptLineType: "adjustment",
      adjustmentEffect: a.adjustmentEffect,
      adjustmentType: a.adjustmentType,
      children: null,
      childrenIncludedInParent: false,
    });
  }

  return out
    .filter((ln) => Number.isFinite(ln.amount) && ln.amount > 0)
    .slice(0, 40);
}

function pickSubsetClosest(candidates, target) {
  // candidates: [{ idx, delta }]
  const n = candidates.length;
  // Brute force for small N
  if (n <= 18) {
    let bestMask = 0;
    let bestDiff = Infinity;
    let bestSum = 0;
    const deltas = candidates.map((c) => c.delta);
    for (let mask = 1; mask < (1 << n); mask++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) sum += deltas[i];
      }
      const diff = Math.abs(target - sum);
      if (diff < bestDiff || (diff === bestDiff && sum <= target && sum > bestSum)) {
        bestDiff = diff;
        bestMask = mask;
        bestSum = sum;
        if (bestDiff === 0) break;
      }
    }
    const picked = [];
    for (let i = 0; i < n; i++) if (bestMask & (1 << i)) picked.push(candidates[i].idx);
    return picked;
  }

  // Greedy fallback
  const sorted = [...candidates].sort((a, b) => b.delta - a.delta);
  let sum = 0;
  const picked = [];
  for (const c of sorted) {
    if (sum + c.delta <= target + 200) {
      sum += c.delta;
      picked.push(c.idx);
      if (sum >= target) break;
    }
  }
  return picked;
}
