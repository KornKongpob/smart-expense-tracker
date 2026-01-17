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
export function splitReceiptItemsToLines(type, itemsOrPayload, fallbackText = "", fallbackCategory = "other") {
  // Accept either an array of items OR a payload: { items, adjustments, targetTotalSatang }
  const payload = Array.isArray(itemsOrPayload) ? { items: itemsOrPayload } : (itemsOrPayload && typeof itemsOrPayload === "object" ? itemsOrPayload : { items: [] });
  const items = Array.isArray(payload.items) ? payload.items : [];
  const adjustmentsIn = Array.isArray(payload.adjustments) ? payload.adjustments : [];

  // Target total (prefer satang)
  const targetTotalSatang = Number.isFinite(payload.targetTotalSatang) ? Math.round(payload.targetTotalSatang) : null;

  const toSatang = (v) => {
    if (v == null) return null;
    const n = typeof v === "string" ? Number(v) : v;
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
  };

  const fromSatang = (s) => (Number.isFinite(s) ? (s / 100) : null);

  // Normalize raw items into internal lines (satang)
  const itemLines = [];
  const inferredFromText = inferCategoryFromText(fallbackText || "") || null;

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

  // --- Group item lines by category_key (items) ---
  const grouped = new Map();

  for (const it of itemLines) {
    const amtSat = Number.isFinite(it.baseTotalSatang) ? it.baseTotalSatang : 0;
    if (amtSat <= 0) continue;

    const key = it.category_key || fallbackCategory || "other";
    const prev = grouped.get(key) || {
      key,
      receiptLineType: "item",
      amountSatang: 0,
      names: [],
      children: null,
      childrenIncludedInParent: false,
    };

    prev.amountSatang += amtSat;
    prev.names.push(it.name);

    // Keep children only when a bucket contains a single item (otherwise it's ambiguous)
    if (prev.names.length === 1) {
      prev.children = it.children;
      prev.childrenIncludedInParent = it.childrenIncludedInParent;
    } else {
      prev.children = null;
      prev.childrenIncludedInParent = false;
    }

    grouped.set(key, prev);
  }

  // --- Keep adjustments as individual lines (so user can see each discount/fee) ---
  let adjIdx = 0;
  for (const a of adjustmentLines) {
    const key = a.category_key || (a.adjustmentEffect === "subtract" ? "discount" : "fees");
    grouped.set(`__adj_${adjIdx++}_${key}`,
      {
        key,
        receiptLineType: "adjustment",
        name: a.name,
        amountSatang: a.amountSatang,
        adjustmentEffect: a.adjustmentEffect,
        adjustmentType: a.adjustmentType,
      }
    );
  }

  // Convert to expected output format (amount in major units)
  const lines = Array.from(grouped.values())
    .map((g) => {
      const displayName =
        g.receiptLineType === "item"
          ? (Array.isArray(g.names) ? g.names.filter(Boolean).join(" + ") : String(g.name || ""))
          : String(g.name || "");

      return {
        key: g.key,
        name: displayName,
        amount: fromSatang(g.amountSatang),
        receiptLineType: g.receiptLineType,
        adjustmentEffect: g.adjustmentEffect,
        adjustmentType: g.adjustmentType,
        children: g.children ? g.children.map((c) => ({ name: c.name, amount: fromSatang(c.amountSatang) })) : null,
        childrenIncludedInParent: g.childrenIncludedInParent,
      };
    })
    .filter((ln) => Number.isFinite(ln.amount) && ln.amount > 0)
    .slice(0, 20);


  // Sort: items first, then adjustments; larger amounts first within type
  lines.sort((a, b) => {
    const ta = a.receiptLineType === "adjustment" ? 1 : 0;
    const tb = b.receiptLineType === "adjustment" ? 1 : 0;
    if (ta !== tb) return ta - tb;
    return (b.amount || 0) - (a.amount || 0);
  });

  return lines;
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

