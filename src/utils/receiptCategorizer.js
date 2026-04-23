import { DEFAULT_CATEGORIES } from "../constants/categories.js";
import { parseMoneyToSatang } from "./money.js";

const DEFAULT_EXPENSE_CATEGORY = "other";
const DEFAULT_INCOME_CATEGORY = "other_income";
const MIXED_CATEGORY_ID = "mixed";
const CHILD_PROMOTION_MIN_COUNT = 2;
const MIN_MATERIAL_CATEGORY_SATANG = 500;

const norm = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasKeyword(text, keyword) {
  const haystack = norm(text);
  const needle = norm(keyword);
  if (!haystack || !needle) return false;

  if (/^[a-z0-9][a-z0-9 ./%+-]*$/i.test(needle)) {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}(?=$|[^a-z0-9])`, "i");
    return pattern.test(haystack);
  }

  return haystack.includes(needle);
}

const containsAny = (text, keywords) => keywords.some((keyword) => hasKeyword(text, keyword));

const KNOWN_CATEGORY_IDS = (() => {
  const ids = new Set();
  for (const category of DEFAULT_CATEGORIES?.expense || []) ids.add(String(category?.id || "").trim());
  for (const category of DEFAULT_CATEGORIES?.income || []) ids.add(String(category?.id || "").trim());
  ids.add("transfer");
  ids.delete("");
  return ids;
})();

const DISCOUNT_KEYWORDS = [
  "ส่วนลด",
  "coupon",
  "discount",
  "promo",
  "promotion",
  "voucher",
  "cashback",
  "rebate",
  "markdown",
];

const TAX_KEYWORDS = ["vat", "tax", "ภาษี", "sales tax"];
const SERVICE_CHARGE_KEYWORDS = ["service charge", "svc", "ค่าบริการ"];
const ROUNDING_KEYWORDS = ["rounding", "ปัดเศษ", "เศษ"];
const FEE_KEYWORDS = [
  "fee",
  "ค่าธรรมเนียม",
  "delivery fee",
  "shipping",
  "bag fee",
  "service fee",
  "processing fee",
  "surcharge",
];

const EXPENSE_RULES = [
  {
    id: "groceries",
    keywords: [
      "grocery",
      "groceries",
      "supermarket",
      "convenience store",
      "minimart",
      "mart",
      "สด",
      "กับข้าว",
      "ของสด",
      "ของกินของใช้",
    ],
    merchantKeywords: [
      "7-eleven",
      "7 eleven",
      "seven eleven",
      "lotus",
      "tesco",
      "big c",
      "tops",
      "makro",
      "maxvalu",
      "cj",
      "gourmet market",
      "villa market",
      "mini big c",
      "mini lotus",
      "familymart",
      "lawson",
    ],
    priority: 92,
  },
  {
    id: "milk_tea",
    keywords: [
      "bubble tea",
      "milk tea",
      "boba",
      "ไข่มุก",
      "ชานม",
      "koi the",
      "gong cha",
      "cha tra mue",
      "chatramue",
    ],
    priority: 91,
  },
  {
    id: "coffee",
    keywords: [
      "coffee",
      "cafe",
      "espresso",
      "latte",
      "americano",
      "cappuccino",
      "mocha",
      "ชา",
      "กาแฟ",
      "cold brew",
      "starbucks",
      "cafe amazon",
      "black canyon",
      "arabica",
    ],
    merchantKeywords: ["starbucks", "cafe amazon", "black canyon", "อินทนิล", "punthai"],
    priority: 90,
  },
  {
    id: "drinks",
    keywords: [
      "drink",
      "beverage",
      "water",
      "juice",
      "soda",
      "cola",
      "coke",
      "pepsi",
      "sprite",
      "fanta",
      "smoothie",
      "น้ำ",
      "เครื่องดื่ม",
      "ชาเขียว",
      "ชาเย็น",
    ],
    priority: 88,
  },
  {
    id: "snacks",
    keywords: [
      "snack",
      "chips",
      "cookie",
      "biscuit",
      "cracker",
      "popcorn",
      "candy",
      "chocolate",
      "gummy",
      "jerky",
      "seaweed",
      "nut",
      "nuts",
      "ขนม",
      "ของทานเล่น",
      "ลูกอม",
    ],
    priority: 87,
  },
  {
    id: "bakery",
    keywords: [
      "bakery",
      "bread",
      "bun",
      "croissant",
      "bagel",
      "toast",
      "danish",
      "donut",
      "โดนัท",
      "เบเกอรี",
      "ขนมปัง",
      "ครัวซองต์",
    ],
    priority: 86,
  },
  {
    id: "dessert",
    keywords: [
      "dessert",
      "cake",
      "ice cream",
      "pudding",
      "jelly",
      "waffle",
      "crepe",
      "บิงซู",
      "ของหวาน",
      "เค้ก",
      "ไอศกรีม",
    ],
    priority: 85,
  },
  {
    id: "meal_prep",
    keywords: [
      "egg",
      "eggs",
      "milk",
      "meat",
      "pork",
      "chicken",
      "beef",
      "fish",
      "rice",
      "vegetable",
      "veggie",
      "fruit",
      "tofu",
      "ingredient",
      "วัตถุดิบ",
      "ผัก",
      "ผลไม้",
      "เนื้อ",
      "หมู",
      "ไก่",
    ],
    priority: 84,
  },
  {
    id: "food",
    keywords: [
      "food",
      "meal",
      "set",
      "breakfast",
      "lunch",
      "dinner",
      "sandwich",
      "burger",
      "pizza",
      "noodle",
      "rice bowl",
      "curry",
      "sushi",
      "katsu",
      "ramen",
      "restaurant",
      "ข้าว",
      "อาหาร",
      "ก๋วยเตี๋ยว",
      "อาหารเช้า",
      "อาหารกลางวัน",
      "อาหารเย็น",
      "แซนด์วิช",
      "หมูปิ้ง",
    ],
    merchantKeywords: [
      "restaurant",
      "food court",
      "line man",
      "lineman",
      "foodpanda",
      "grab food",
      "kfc",
      "mcdonald",
      "burger king",
      "subway",
      "mk",
      "yayoi",
      "sizzler",
      "swensen",
    ],
    priority: 82,
  },
  {
    id: "home",
    keywords: [
      "detergent",
      "cleaner",
      "cleaning",
      "sponge",
      "mop",
      "wipe",
      "tissue",
      "toilet paper",
      "trash bag",
      "dish soap",
      "laundry",
      "fabric softener",
      "น้ำยาซักผ้า",
      "ผงซักฟอก",
      "ทิชชู่",
      "น้ำยาล้างจาน",
      "ถุงขยะ",
      "ของใช้ในบ้าน",
    ],
    priority: 80,
  },
  {
    id: "beauty",
    keywords: [
      "skincare",
      "serum",
      "sunscreen",
      "lipstick",
      "foundation",
      "makeup",
      "cosmetic",
      "beauty",
      "สกินแคร์",
      "เซรั่ม",
      "กันแดด",
      "เครื่องสำอาง",
      "ลิป",
    ],
    priority: 78,
  },
  {
    id: "personal_items",
    keywords: [
      "shampoo",
      "soap",
      "lotion",
      "toothpaste",
      "toothbrush",
      "deodorant",
      "razor",
      "sanitary",
      "body wash",
      "conditioner",
      "สบู่",
      "แชมพู",
      "โลชั่น",
      "ยาสีฟัน",
      "แปรงสีฟัน",
      "ของใช้ส่วนตัว",
    ],
    priority: 77,
  },
  {
    id: "supplements",
    keywords: [
      "vitamin",
      "supplement",
      "collagen",
      "protein",
      "whey",
      "omega",
      "probiotic",
      "วิตามิน",
      "อาหารเสริม",
      "โปรตีน",
    ],
    priority: 76,
  },
  {
    id: "pharmacy",
    keywords: [
      "pharmacy",
      "medicine",
      "tablet",
      "capsule",
      "bandage",
      "plaster",
      "gel pack",
      "paracetamol",
      "ibuprofen",
      "ยา",
      "ร้านขายยา",
      "เวชภัณฑ์",
      "พลาสเตอร์",
      "ยาแก้",
    ],
    merchantKeywords: ["watsons", "boots", "fascino", "save drug", "ร้านขายยา"],
    priority: 75,
  },
  {
    id: "doctor",
    keywords: ["clinic", "hospital", "doctor", "consultation", "คลินิก", "โรงพยาบาล", "พบแพทย์"],
    merchantKeywords: ["hospital", "clinic", "โรงพยาบาล", "คลินิก"],
    priority: 74,
  },
  {
    id: "health",
    keywords: ["health", "medical", "checkup", "ตรวจสุขภาพ", "สุขภาพ", "การแพทย์"],
    priority: 73,
  },
  {
    id: "electronics",
    keywords: [
      "laptop",
      "tablet",
      "monitor",
      "keyboard",
      "mouse",
      "printer",
      "phone",
      "โทรศัพท์",
      "โน้ตบุ๊ก",
      "แท็บเล็ต",
      "อิเล็กทรอนิกส์",
    ],
    priority: 72,
  },
  {
    id: "gadgets",
    keywords: [
      "charger",
      "cable",
      "adapter",
      "power bank",
      "earphone",
      "earbuds",
      "case",
      "screen protector",
      "usb",
      "memory card",
      "สายชาร์จ",
      "อะแดปเตอร์",
      "หูฟัง",
      "ฟิล์ม",
      "เคส",
    ],
    priority: 71,
  },
  {
    id: "clothing",
    keywords: [
      "shirt",
      "t-shirt",
      "pants",
      "dress",
      "hoodie",
      "jacket",
      "sock",
      "socks",
      "เสื้อ",
      "กางเกง",
      "เสื้อผ้า",
      "ชุด",
      "ถุงเท้า",
    ],
    priority: 70,
  },
  {
    id: "kids",
    keywords: [
      "baby",
      "kid",
      "kids",
      "diaper",
      "formula",
      "baby wipe",
      "ของเล่นเด็ก",
      "เด็ก",
      "ลูก",
      "ผ้าอ้อม",
      "นมผง",
    ],
    priority: 69,
  },
  {
    id: "pet_food",
    keywords: [
      "pet food",
      "dog food",
      "cat food",
      "pet snack",
      "อาหารสัตว์",
      "อาหารหมา",
      "อาหารแมว",
      "ขนมสัตว์เลี้ยง",
    ],
    priority: 68,
  },
  {
    id: "pets",
    keywords: ["pet", "dog", "cat", "litter", "สัตว์เลี้ยง", "หมา", "แมว", "ทรายแมว"],
    merchantKeywords: ["pet", "pet shop", "ร้านสัตว์เลี้ยง"],
    priority: 67,
  },
  {
    id: "transport",
    keywords: [
      "fuel",
      "gas",
      "petrol",
      "diesel",
      "taxi",
      "grab",
      "bolt",
      "bts",
      "mrt",
      "parking",
      "toll",
      "bus",
      "train",
      "น้ำมัน",
      "ค่าทางด่วน",
      "ที่จอดรถ",
      "รถไฟฟ้า",
      "รถเมล์",
    ],
    merchantKeywords: ["ptt", "shell", "esso", "caltex", "บางจาก", "grab", "bolt"],
    priority: 66,
  },
  {
    id: "bills",
    keywords: [
      "bill",
      "invoice",
      "electricity",
      "water bill",
      "internet",
      "wifi",
      "mobile",
      "phone",
      "ค่าไฟ",
      "ค่าน้ำ",
      "อินเทอร์เน็ต",
      "มือถือ",
      "บิล",
    ],
    merchantKeywords: ["ais", "dtac", "true", "3bb", "nt", "mea", "pea"],
    priority: 65,
  },
  {
    id: "entertainment",
    keywords: [
      "movie",
      "cinema",
      "netflix",
      "spotify",
      "concert",
      "game",
      "steam",
      "disney",
      "prime video",
      "หนัง",
      "เกม",
      "คอนเสิร์ต",
      "บันเทิง",
    ],
    priority: 64,
  },
  {
    id: "shopping",
    keywords: ["shopping", "store", "mall", "marketplace", "ซื้อของ", "ช้อปปิ้ง"],
    merchantKeywords: ["lazada", "shopee", "amazon", "ikea", "uniqlo", "decathlon", "central"],
    priority: 60,
  },
];

const INCOME_RULES = [
  { id: "salary", keywords: ["salary", "payroll", "wage", "เงินเดือน"], priority: 90 },
  { id: "bonus", keywords: ["bonus", "โบนัส"], priority: 89 },
  { id: "commission", keywords: ["commission", "คอมมิชชั่น"], priority: 88 },
  { id: "allowance", keywords: ["allowance", "เบี้ยเลี้ยง"], priority: 87 },
  { id: "freelance", keywords: ["freelance", "ฟรีแลนซ์"], priority: 86 },
  { id: "business", keywords: ["business income", "ร้านค้า", "ยอดขาย"], priority: 85 },
  { id: "service_income", keywords: ["service income", "ค่าบริการ"], priority: 84 },
  { id: "investment", keywords: ["capital gain", "investment", "กำไรลงทุน"], priority: 83 },
  { id: "interest", keywords: ["interest", "ดอกเบี้ย"], priority: 82 },
  { id: "dividend", keywords: ["dividend", "เงินปันผล"], priority: 81 },
  { id: "refund", keywords: ["refund", "เงินคืน"], priority: 80 },
  { id: "cashback", keywords: ["cashback", "cash back", "แคชแบ็ก"], priority: 79 },
  { id: "reimbursement", keywords: ["reimbursement", "เบิก", "ชดเชย"], priority: 78 },
  { id: "rent_income", keywords: ["rent income", "ค่าเช่า"], priority: 77 },
];

const ALIAS = {
  "food & beverage": "food",
  "food and beverage": "food",
  "food/beverage": "food",
  "beverage": "drinks",
  "drink": "drinks",
  "coffee/tea": "coffee",
  "bubble tea": "milk_tea",
  "supermarket": "groceries",
  "convenience store": "groceries",
  "household": "home",
  "household goods": "home",
  "personal care": "personal_care",
  "toiletries": "personal_items",
  "cosmetics": "beauty",
  "medicine": "pharmacy",
  "pharmacy": "pharmacy",
  "electronics accessories": "gadgets",
  "accessories electronics": "gadgets",
  "pet food": "pet_food",
  "pet supplies": "pets",
  "kid": "kids",
  "children": "kids",
  "fee": "fees",
  "fees": "fees",
  "tax": "taxes",
  "service charge": "service_charge",
  "other income": "other_income",
  "mixed category": MIXED_CATEGORY_ID,
  "อาหาร": "food",
  "เครื่องดื่ม": "drinks",
  "กาแฟ": "coffee",
  "ชานม": "milk_tea",
  "ขนม": "snacks",
  "เบเกอรี": "bakery",
  "ของหวาน": "dessert",
  "ซูเปอร์": "groceries",
  "ของใช้ในบ้าน": "home",
  "ดูแลตัวเอง": "personal_care",
  "สุขภาพ": "health",
  "ยา": "pharmacy",
  "อิเล็กทรอนิกส์": "electronics",
  "เสื้อผ้า": "clothing",
  "สัตว์เลี้ยง": "pets",
  "ลูก/เด็ก": "kids",
  "ส่วนลด": "discount",
  "ค่าธรรมเนียม": "fees",
  "ค่าบริการ": "service_charge",
  "ภาษี": "taxes",
  "อื่นๆ": DEFAULT_EXPENSE_CATEGORY,
  "รายได้อื่นๆ": DEFAULT_INCOME_CATEGORY,
  "เงินเดือน": "salary",
  "โบนัส": "bonus",
  "เงินคืน": "refund",
};

function getDefaultCategory(type) {
  return type === "income" ? DEFAULT_INCOME_CATEGORY : DEFAULT_EXPENSE_CATEGORY;
}

function uniqueNormalized(parts) {
  const seen = new Set();
  const output = [];
  for (const part of parts) {
    const text = norm(part);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
  }
  return output;
}

function scoreKeywordHits(text, keywords) {
  if (!text) return 0;
  let score = 0;
  for (const rawKeyword of keywords || []) {
    const keyword = norm(rawKeyword);
    if (!keyword || !hasKeyword(text, keyword)) continue;
    score += keyword.length >= 6 ? 1.5 : 1;
  }
  return score;
}

function toMinorUnits(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function fromSatang(amountSatang) {
  return Number.isFinite(amountSatang) ? Number((amountSatang / 100).toFixed(2)) : null;
}

function readSatangAmount(source, candidates = []) {
  const record = source && typeof source === "object" ? source : {};
  for (const field of ["amountSatang", "amount_satang"]) {
    if (!(field in record)) continue;
    const satang = toMinorUnits(record[field]);
    if (Number.isFinite(satang)) return satang;
  }

  for (const candidate of candidates) {
    if (!(candidate in record)) continue;
    const satang = parseMoneyToSatang(record[candidate]);
    if (Number.isFinite(satang)) return satang;
  }

  return null;
}

function readQuantity(source) {
  const number = Number(source?.qty ?? source?.quantity);
  return Number.isFinite(number) ? number : null;
}

function readUnitPrice(source) {
  const satang = readSatangAmount(source, ["unit_price", "unitPrice", "price"]);
  return Number.isFinite(satang) ? satang : null;
}

function buildEvidenceContext(type, text, options = {}) {
  return {
    type,
    primaryText: norm(text),
    merchantText: norm(options.merchantText || ""),
    parentText: norm(options.parentText || ""),
    childText: norm(options.childText || ""),
    fallbackCategory: sanitizeCategoryKey(options.fallbackCategory),
  };
}

function scoreCategoryRule(rule, context) {
  const merchantKeywords = Array.isArray(rule.merchantKeywords) && rule.merchantKeywords.length
    ? rule.merchantKeywords
    : rule.keywords;

  let score = 0;
  score += scoreKeywordHits(context.primaryText, rule.keywords) * 6;
  score += scoreKeywordHits(context.childText, rule.keywords) * 3;
  score += scoreKeywordHits(context.parentText, rule.keywords) * 2;
  score += scoreKeywordHits(context.merchantText, merchantKeywords) * 1.5;
  if (context.fallbackCategory && context.fallbackCategory === rule.id) score += 0.75;
  return score;
}

function normalizeAdjustmentType(value) {
  const text = norm(value);
  if (containsAny(text, DISCOUNT_KEYWORDS)) return "discount";
  if (containsAny(text, SERVICE_CHARGE_KEYWORDS)) return "service_charge";
  if (containsAny(text, TAX_KEYWORDS)) return "tax";
  if (containsAny(text, ROUNDING_KEYWORDS)) return "rounding";
  if (containsAny(text, FEE_KEYWORDS)) return "fee";
  return text || "other";
}

function inferAdjustmentDescriptor({
  name = "",
  explicitType = "",
  explicitEffect = "",
  explicitCategory = "",
  amountSatang = null,
} = {}) {
  const effect = norm(explicitEffect);
  const category = sanitizeCategoryKey(explicitCategory);
  const text = uniqueNormalized([name, explicitType, category]).join(" ");
  const normalizedType = normalizeAdjustmentType(explicitType);

  if (category === "discount" || normalizedType === "discount" || containsAny(text, DISCOUNT_KEYWORDS)) {
    return { adjustmentEffect: "subtract", adjustmentType: "discount", category_key: "discount" };
  }

  if (effect === "subtract" || (Number.isFinite(amountSatang) && amountSatang < 0)) {
    return { adjustmentEffect: "subtract", adjustmentType: normalizedType || "discount", category_key: "discount" };
  }

  if (
    category === "fees" ||
    category === "service_charge" ||
    category === "taxes" ||
    normalizedType === "service_charge" ||
    normalizedType === "tax" ||
    normalizedType === "rounding" ||
    normalizedType === "fee" ||
    containsAny(text, SERVICE_CHARGE_KEYWORDS) ||
    containsAny(text, TAX_KEYWORDS) ||
    containsAny(text, ROUNDING_KEYWORDS) ||
    containsAny(text, FEE_KEYWORDS)
  ) {
    return {
      adjustmentEffect: "add",
      adjustmentType: normalizedType === "other" ? "fee" : normalizedType,
      category_key: "fees",
    };
  }

  if (effect === "add" && normalizedType !== "other") {
    return { adjustmentEffect: "add", adjustmentType: normalizedType, category_key: "fees" };
  }

  return null;
}

function inferExpenseCategoryKey(context) {
  const adjustment = inferAdjustmentDescriptor({
    name: context.primaryText,
    explicitType: "",
    explicitEffect: "",
    explicitCategory: context.fallbackCategory,
  });
  if (adjustment && (adjustment.category_key === "discount" || adjustment.category_key === "fees")) {
    return adjustment.category_key;
  }

  let bestId = "";
  let bestScore = 0;
  let bestPriority = -Infinity;

  for (const rule of EXPENSE_RULES) {
    const score = scoreCategoryRule(rule, context);
    if (score <= 0) continue;
    if (score > bestScore || (score === bestScore && rule.priority > bestPriority)) {
      bestId = rule.id;
      bestScore = score;
      bestPriority = rule.priority;
    }
  }

  if (bestId) return bestId;
  if (context.fallbackCategory) return context.fallbackCategory;
  return "";
}

function inferIncomeCategoryKey(context) {
  let bestId = "";
  let bestScore = 0;
  let bestPriority = -Infinity;
  const combined = uniqueNormalized([
    context.primaryText,
    context.parentText,
    context.childText,
    context.merchantText,
  ]).join(" ");

  for (const rule of INCOME_RULES) {
    const score = scoreKeywordHits(combined, rule.keywords) * 4 + (context.fallbackCategory === rule.id ? 0.75 : 0);
    if (score <= 0) continue;
    if (score > bestScore || (score === bestScore && rule.priority > bestPriority)) {
      bestId = rule.id;
      bestScore = score;
      bestPriority = rule.priority;
    }
  }

  if (bestId) return bestId;
  if (context.fallbackCategory) return context.fallbackCategory;
  return "";
}

function normalizeChildItem(type, child, { merchantText = "", parentText = "", fallbackCategory = "" } = {}) {
  const source = child && typeof child === "object" ? child : {};
  const name = String(source.name || source.title || source.item || source.label || "").trim();
  const amountSatang = readSatangAmount(source, ["total", "line_total", "lineTotal", "amount", "price"]);
  const explicitCategory = sanitizeCategoryKey(
    source.category_key ?? source.categoryKey ?? source.categoryId ?? source.category ?? source.key,
  );
  const adjustment = inferAdjustmentDescriptor({
    name,
    explicitType: source.adjustmentType || source.adjustment_type || source.type,
    explicitEffect: source.adjustmentEffect || source.adjustment_effect || source.effect,
    explicitCategory,
    amountSatang,
  });
  const category_key =
    explicitCategory ||
    (adjustment ? adjustment.category_key : "") ||
    inferCategoryKeyFromText(type, name, {
      merchantText,
      parentText,
      fallbackCategory,
    }) ||
    sanitizeCategoryKey(fallbackCategory) ||
    getDefaultCategory(type);

  if (!name && !Number.isFinite(amountSatang) && !category_key) return null;

  return {
    name: name || "Item",
    amountSatang: Number.isFinite(amountSatang) ? Math.abs(amountSatang) : 0,
    category_key,
    qty: readQuantity(source),
    unit_price_satang: readUnitPrice(source),
    receiptLineType: adjustment ? "adjustment" : "item",
    adjustmentEffect: adjustment?.adjustmentEffect || "add",
    adjustmentType: adjustment?.adjustmentType || null,
  };
}

function shouldPromoteChildren({ parentTotalSatang = null, children = [] } = {}) {
  const positiveChildren = (Array.isArray(children) ? children : []).filter(
    (child) => child?.receiptLineType !== "adjustment" && Number(child?.amountSatang || 0) > 0,
  );
  if (positiveChildren.length < CHILD_PROMOTION_MIN_COUNT) return false;

  const childTotalSatang = positiveChildren.reduce((sum, child) => sum + Number(child?.amountSatang || 0), 0);
  if (!(childTotalSatang > 0)) return false;

  if (!(Number.isFinite(parentTotalSatang) && parentTotalSatang > 0)) return true;

  const toleranceSatang = Math.max(200, Math.round(parentTotalSatang * 0.05));
  return Math.abs(parentTotalSatang - childTotalSatang) <= toleranceSatang;
}

function normalizeReceiptLineItem(type, item, { merchantText = "", fallbackCategory = "" } = {}) {
  const source = item && typeof item === "object" ? item : {};
  const name = String(source.name || source.title || source.item || source.product || "").trim();
  if (!name) return null;

  const baseTotalSatang = readSatangAmount(source, ["total", "line_total", "lineTotal", "amount", "price"]);
  const explicitCategory = sanitizeCategoryKey(
    source.category_key ?? source.categoryKey ?? source.categoryId ?? source.category ?? source.key,
  );
  const adjustment = inferAdjustmentDescriptor({
    name,
    explicitType: source.adjustmentType || source.adjustment_type || source.type,
    explicitEffect: source.adjustmentEffect || source.adjustment_effect || source.effect,
    explicitCategory,
    amountSatang: baseTotalSatang,
  });

  if (adjustment) {
    const adjustmentAmountSatang = Number.isFinite(baseTotalSatang) ? Math.abs(baseTotalSatang) : 0;
    return {
      receiptLineType: "adjustment",
      name,
      amountSatang: adjustmentAmountSatang,
      category_key: adjustment.category_key,
      adjustmentEffect: adjustment.adjustmentEffect,
      adjustmentType: adjustment.adjustmentType,
      children: null,
      childSumSatang: 0,
      promoteChildren: false,
      childrenIncludedInParent: false,
    };
  }

  const children = Array.isArray(source.children)
    ? source.children
        .map((child) =>
          normalizeChildItem(type, child, {
            merchantText,
            parentText: name,
            fallbackCategory: explicitCategory || fallbackCategory,
          }),
        )
        .filter(Boolean)
        .slice(0, 12)
    : [];

  const childText = children.map((child) => child?.name || "").join(" ");
  const category_key =
    explicitCategory ||
    inferCategoryKeyFromText(type, name, {
      merchantText,
      childText,
      fallbackCategory,
    }) ||
    sanitizeCategoryKey(fallbackCategory) ||
    getDefaultCategory(type);
  const positiveChildSumSatang = children
    .filter((child) => child.receiptLineType !== "adjustment" && child.amountSatang > 0)
    .reduce((sum, child) => sum + child.amountSatang, 0);
  const promoteChildren = shouldPromoteChildren({ parentTotalSatang: baseTotalSatang, children });

  return {
    receiptLineType: "item",
    name,
    category_key,
    baseTotalSatang,
    childSumSatang: positiveChildSumSatang,
    children,
    promoteChildren,
    childrenIncludedInParent: children.length > 0 && !promoteChildren,
  };
}

function normalizeReceiptAdjustment(item) {
  const source = item && typeof item === "object" ? item : {};
  const name = String(source.name || source.label || source.title || source.type || "Adjustment").trim();
  const amountSatang = readSatangAmount(source, ["amount", "value", "total", "line_total", "lineTotal", "amt"]);
  if (!(Number.isFinite(amountSatang) && amountSatang !== 0)) return null;

  const descriptor =
    inferAdjustmentDescriptor({
      name,
      explicitType: source.type || source.adjustmentType || source.adjustment_type,
      explicitEffect: source.effect || source.adjustmentEffect || source.adjustment_effect,
      explicitCategory: source.category_key || source.categoryKey || source.category || source.categoryId,
      amountSatang,
    }) || {
      adjustmentEffect: String(source.effect || "").toLowerCase() === "subtract" ? "subtract" : "add",
      adjustmentType: normalizeAdjustmentType(source.type),
      category_key: String(source.effect || "").toLowerCase() === "subtract" ? "discount" : "fees",
    };

  return {
    receiptLineType: "adjustment",
    name: name || "Adjustment",
    amountSatang: Math.abs(amountSatang),
    adjustmentEffect: descriptor.adjustmentEffect,
    adjustmentType: descriptor.adjustmentType,
    category_key: descriptor.category_key,
  };
}

function normalizeLineAmountSatang(line) {
  const source = line && typeof line === "object" ? line : {};
  if (source.amountSatang != null || source.amount_satang != null) {
    return readSatangAmount(source, []);
  }
  return readSatangAmount(source, ["amount", "total", "line_total", "lineTotal", "price"]);
}

function isAdjustmentLine(line) {
  const source = line && typeof line === "object" ? line : {};
  return (
    String(source.receiptLineType || source.receipt_line_type || "").toLowerCase().trim() === "adjustment" ||
    sanitizeCategoryKey(source.categoryId || source.category || source.category_key || source.key) === "discount" ||
    String(source.adjustmentEffect || source.adjustment_effect || "").toLowerCase().trim() === "subtract" ||
    Boolean(source.adjustmentType || source.adjustment_type)
  );
}

export function sanitizeCategoryKey(raw) {
  const normalized = norm(raw);
  if (!normalized) return "";
  if (ALIAS[normalized]) return ALIAS[normalized];
  if (KNOWN_CATEGORY_IDS.has(normalized)) return normalized;

  for (const knownId of KNOWN_CATEGORY_IDS) {
    if (!knownId) continue;
    if (normalized.includes(knownId)) return knownId;
  }
  return "";
}

export function inferCategoryKeyFromText(type, text, options = {}) {
  const context = buildEvidenceContext(type, text, options);
  if (!context.primaryText && !context.parentText && !context.childText && !context.merchantText) {
    return context.fallbackCategory || "";
  }

  if (type === "income") {
    return inferIncomeCategoryKey(context);
  }

  return inferExpenseCategoryKey(context);
}

export function deriveReceiptCategoryKey(type, lines = [], fallbackText = "", fallbackCategory = "") {
  const safeLines = Array.isArray(lines) ? lines : [];
  const totals = new Map();
  let subtotalSatang = 0;

  for (const line of safeLines) {
    if (!line || typeof line !== "object" || isAdjustmentLine(line)) continue;
    const amountSatang = normalizeLineAmountSatang(line);
    if (!(Number.isFinite(amountSatang) && amountSatang > 0)) continue;

    const name = String(line.name || line.note || line.title || "").trim();
    const childText = Array.isArray(line.children)
      ? line.children.map((child) => child?.name || "").join(" ")
      : "";
    const categoryKey =
      sanitizeCategoryKey(line.categoryId || line.category || line.category_key || line.key) ||
      inferCategoryKeyFromText(type, name, {
        merchantText: fallbackText,
        childText,
        fallbackCategory,
      }) ||
      sanitizeCategoryKey(fallbackCategory);
    if (!categoryKey) continue;

    subtotalSatang += amountSatang;
    totals.set(categoryKey, (totals.get(categoryKey) || 0) + amountSatang);
  }

  if (!(subtotalSatang > 0) || totals.size === 0) {
    return (
      sanitizeCategoryKey(fallbackCategory) ||
      inferCategoryKeyFromText(type, fallbackText, { fallbackCategory }) ||
      getDefaultCategory(type)
    );
  }

  const ranked = Array.from(totals.entries())
    .map(([categoryKey, amountSatang]) => ({ categoryKey, amountSatang }))
    .sort((left, right) => right.amountSatang - left.amountSatang);

  if (type !== "expense") {
    return ranked[0]?.categoryKey || getDefaultCategory(type);
  }

  if (ranked.length === 1) return ranked[0].categoryKey;

  const top = ranked[0];
  const second = ranked[1];
  if (top.amountSatang / subtotalSatang >= 0.7) return top.categoryKey;
  if (top.amountSatang >= second.amountSatang * 2) return top.categoryKey;

  const materiallyDistinct = ranked.filter(
    (entry) => entry.amountSatang >= MIN_MATERIAL_CATEGORY_SATANG && entry.amountSatang / subtotalSatang >= 0.1,
  );
  if (materiallyDistinct.length >= 2) return MIXED_CATEGORY_ID;

  return top.categoryKey;
}

export function groupReceiptItemsToCategory(type, items = [], fallbackText = "", fallbackCategory = "") {
  const lines = splitReceiptItemsToLines(type, items, fallbackText, fallbackCategory).filter(
    (line) => line.receiptLineType !== "adjustment",
  );
  const groups = new Map();

  for (const line of lines) {
    const key =
      sanitizeCategoryKey(line.key || line.category_key || line.category || line.categoryId) ||
      sanitizeCategoryKey(fallbackCategory) ||
      getDefaultCategory(type);
    const amount = Number(line.amount);
    if (!(Number.isFinite(amount) && amount > 0)) continue;
    const current = groups.get(key) || { key, amount: 0, names: [] };
    current.amount += amount;
    if (line.name) current.names.push(line.name);
    groups.set(key, current);
  }

  const orderedGroups = Array.from(groups.values()).sort((left, right) => right.amount - left.amount);
  return {
    groups: orderedGroups,
    primaryKey: deriveReceiptCategoryKey(type, lines, fallbackText, fallbackCategory),
  };
}

export function splitReceiptItemsToLines(type, itemsOrPayload, fallbackText = "", fallbackCategory = "other") {
  const payload = Array.isArray(itemsOrPayload)
    ? { items: itemsOrPayload }
    : itemsOrPayload && typeof itemsOrPayload === "object"
    ? itemsOrPayload
    : { items: [] };
  const items = Array.isArray(payload.items) ? payload.items : [];
  const adjustmentsIn = Array.isArray(payload.adjustments) ? payload.adjustments : [];
  const targetTotalSatang = Number.isFinite(payload.targetTotalSatang) ? Math.round(payload.targetTotalSatang) : null;
  const merchantText = String(fallbackText || "").trim();
  const normalizedFallbackCategory =
    sanitizeCategoryKey(fallbackCategory) ||
    inferCategoryKeyFromText(type, merchantText, { fallbackCategory }) ||
    getDefaultCategory(type);

  const itemLines = [];
  const adjustmentLines = adjustmentsIn.map((adjustment) => normalizeReceiptAdjustment(adjustment)).filter(Boolean);

  for (const item of items) {
    const normalized = normalizeReceiptLineItem(type, item, {
      merchantText,
      fallbackCategory: normalizedFallbackCategory,
    });
    if (!normalized) continue;
    if (normalized.receiptLineType === "adjustment") {
      if (normalized.amountSatang > 0) adjustmentLines.push(normalized);
      continue;
    }
    itemLines.push(normalized);
  }

  const candidates = itemLines
    .map((item, index) => ({ index, delta: item.childSumSatang || 0 }))
    .filter(({ index, delta }) => delta > 0 && itemLines[index]?.promoteChildren !== true);

  if (Number.isFinite(targetTotalSatang) && candidates.length) {
    const baseItemsSum = itemLines.reduce((sum, item) => {
      if (item.promoteChildren) {
        return (
          sum +
          item.children
            .filter((child) => child.receiptLineType !== "adjustment" && child.amountSatang > 0)
            .reduce((childSum, child) => childSum + child.amountSatang, 0)
        );
      }

      const ownTotal =
        Number.isFinite(item.baseTotalSatang) && item.baseTotalSatang > 0 ? item.baseTotalSatang : 0;
      return sum + ownTotal;
    }, 0);
    const adjustmentSum = adjustmentLines.reduce(
      (sum, adjustment) =>
        sum + (adjustment.adjustmentEffect === "subtract" ? -adjustment.amountSatang : adjustment.amountSatang),
      0,
    );
    const needed = targetTotalSatang - (baseItemsSum + adjustmentSum);

    if (needed > 0) {
      const totalDelta = candidates.reduce((sum, candidate) => sum + candidate.delta, 0);
      if (needed <= totalDelta + 200) {
        const pickedIndices = pickSubsetClosest(candidates, needed);
        for (const pickedIndex of pickedIndices) {
          const item = itemLines[pickedIndex];
          if (!item || item.promoteChildren) continue;
          if (!(Number.isFinite(item.baseTotalSatang) && item.baseTotalSatang > 0)) {
            item.baseTotalSatang = item.childSumSatang;
          } else {
            item.baseTotalSatang += item.childSumSatang;
          }
        }
      }
    }
  }

  const output = [];

  for (const item of itemLines) {
    const allChildren = Array.isArray(item.children) ? item.children : [];
    const positivePurchasedChildren = allChildren.filter(
      (child) => child.receiptLineType !== "adjustment" && child.amountSatang > 0,
    );

    if (item.promoteChildren) {
      for (const child of positivePurchasedChildren) {
        output.push({
          key: child.category_key || item.category_key || normalizedFallbackCategory,
          category_key: child.category_key || item.category_key || normalizedFallbackCategory,
          name: child.name,
          amount: fromSatang(child.amountSatang),
          receiptLineType: "item",
          adjustmentEffect: "add",
          adjustmentType: null,
          children: null,
          childrenIncludedInParent: false,
          parentName: item.name,
        });
      }
      continue;
    }

    let amountSatang = Number.isFinite(item.baseTotalSatang) ? item.baseTotalSatang : 0;
    if (!(amountSatang > 0) && item.childSumSatang > 0) {
      amountSatang = item.childSumSatang;
    }
    if (!(amountSatang > 0)) continue;

    output.push({
      key: item.category_key || normalizedFallbackCategory,
      category_key: item.category_key || normalizedFallbackCategory,
      name: item.name,
      amount: fromSatang(amountSatang),
      receiptLineType: "item",
      adjustmentEffect: "add",
      adjustmentType: null,
      children: allChildren.length
        ? allChildren.map((child) => ({
            key: child.category_key || normalizedFallbackCategory,
            category_key: child.category_key || normalizedFallbackCategory,
            categoryId: child.category_key || normalizedFallbackCategory,
            name: child.name,
            amount: fromSatang(child.amountSatang),
            qty: child.qty ?? null,
            unit_price: Number.isFinite(child.unit_price_satang) ? fromSatang(child.unit_price_satang) : null,
            receiptLineType: child.receiptLineType,
            adjustmentEffect: child.adjustmentEffect,
            adjustmentType: child.adjustmentType,
          }))
        : null,
      childrenIncludedInParent: allChildren.length > 0,
    });
  }

  for (const adjustment of adjustmentLines) {
    if (!(adjustment.amountSatang > 0)) continue;
    output.push({
      key: adjustment.category_key || (adjustment.adjustmentEffect === "subtract" ? "discount" : "fees"),
      category_key: adjustment.category_key || (adjustment.adjustmentEffect === "subtract" ? "discount" : "fees"),
      name: adjustment.name,
      amount: fromSatang(adjustment.amountSatang),
      receiptLineType: "adjustment",
      adjustmentEffect: adjustment.adjustmentEffect,
      adjustmentType: adjustment.adjustmentType,
      children: null,
      childrenIncludedInParent: false,
    });
  }

  return output.filter((line) => Number.isFinite(line.amount) && line.amount > 0).slice(0, 40);
}

function pickSubsetClosest(candidates, target) {
  const safeCandidates = Array.isArray(candidates) ? candidates : [];
  const count = safeCandidates.length;
  if (!count) return [];

  if (count <= 18) {
    let bestMask = 0;
    let bestDiff = Infinity;
    let bestSum = 0;
    const deltas = safeCandidates.map((candidate) => candidate.delta);

    for (let mask = 1; mask < 1 << count; mask += 1) {
      let sum = 0;
      for (let index = 0; index < count; index += 1) {
        if (mask & (1 << index)) sum += deltas[index];
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
    for (let index = 0; index < count; index += 1) {
      if (bestMask & (1 << index)) picked.push(safeCandidates[index].index);
    }
    return picked;
  }

  const picked = [];
  let running = 0;
  for (const candidate of [...safeCandidates].sort((left, right) => right.delta - left.delta)) {
    if (running + candidate.delta > target + 200) continue;
    running += candidate.delta;
    picked.push(candidate.index);
    if (running >= target) break;
  }
  return picked;
}
