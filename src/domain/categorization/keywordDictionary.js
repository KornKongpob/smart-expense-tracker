import { calculateCategoryConfidence } from "./confidenceScoring.js";

const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;

export function normalizeKeywordText(value) {
  return String(value ?? "")
    .replace(ZERO_WIDTH_RE, "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(value) {
  return normalizeKeywordText(value)
    .split(/\s+/g)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function categoryExists(categories = [], categoryId) {
  const id = String(categoryId || "").trim();
  if (!id) return false;
  const list = Array.isArray(categories)
    ? categories
    : [...(Array.isArray(categories?.expense) ? categories.expense : []), ...(Array.isArray(categories?.income) ? categories.income : [])];
  if (!list.length) return true;
  return list.some((category) => String(category?.id || "").trim() === id && category?.isDeleted !== true && !category?.deletedAt);
}

export function pickExistingCategory(categories, candidates = [], fallback = "") {
  for (const candidate of candidates) {
    const id = String(candidate || "").trim();
    if (id && categoryExists(categories, id)) return id;
  }
  return categoryExists(categories, fallback) ? String(fallback || "").trim() : "";
}

const KEYWORD_RULES = Object.freeze([
  { keywords: ["starbucks", "latte", "espresso", "americano", "cappuccino", "coffee", "\u0e01\u0e32\u0e41\u0e1f"], categories: ["coffee", "drinks", "food"] },
  { keywords: ["milk", "\u0e19\u0e21"], categories: ["groceries", "drinks", "food"] },
  { keywords: ["rice", "\u0e02\u0e49\u0e32\u0e27", "\u0e02\u0e49\u0e32\u0e27\u0e2a\u0e32\u0e23"], categories: ["groceries", "meal_prep", "food"] },
  { keywords: ["snack", "chips", "\u0e02\u0e19\u0e21"], categories: ["snacks", "food"] },
  { keywords: ["toothpaste", "\u0e22\u0e32\u0e2a\u0e35\u0e1f\u0e31\u0e19"], categories: ["personal_care", "personal_items", "health"] },
  { keywords: ["shampoo", "\u0e41\u0e0a\u0e21\u0e1e\u0e39"], categories: ["personal_care", "personal_items"] },
  { keywords: ["dish soap", "dishwashing", "detergent", "\u0e19\u0e49\u0e33\u0e22\u0e32\u0e25\u0e49\u0e32\u0e07\u0e08\u0e32\u0e19"], categories: ["cleaning", "home", "household_goods"] },
  { keywords: ["soap", "cleaner", "\u0e19\u0e49\u0e33\u0e22\u0e32"], categories: ["cleaning", "home", "household_goods"] },
  { keywords: ["grab", "bolt", "taxi"], categories: ["ride_hailing", "taxi", "transport"] },
  { keywords: ["netflix", "spotify", "icloud", "subscription"], categories: ["subscriptions", "software_subscription", "bills"] },
]);

function keywordMatchesExact(text, keyword) {
  const normalizedKeyword = normalizeKeywordText(keyword);
  if (!text || !normalizedKeyword) return false;
  if (normalizedKeyword.includes(" ")) return text.includes(normalizedKeyword);
  if (text.includes(normalizedKeyword) && /[\u0E00-\u0E7F]/.test(normalizedKeyword)) return true;
  return tokensOf(text).includes(normalizedKeyword);
}

function distanceWithinOne(a, b) {
  if (!a || !b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a === b) return true;

  let edits = 0;
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }

    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }

  if (i < a.length || j < b.length) edits += 1;
  return edits <= 1;
}

function keywordMatchesFuzzy(text, keyword) {
  const normalizedKeyword = normalizeKeywordText(keyword);
  if (!text || !normalizedKeyword || normalizedKeyword.length < 4) return false;
  return tokensOf(text).some((token) => distanceWithinOne(token, normalizedKeyword));
}

function textForItem(item = {}, context = {}) {
  return normalizeKeywordText(
    [
      item.rawName,
      item.normalizedName,
      item.name,
      item.note,
      item.itemName,
      context.itemName,
      context.merchant,
      context.parentMerchant,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function applyKeywordDictionary(item = {}, context = {}, options = {}) {
  const mode = String(options.mode || "exact").toLowerCase();
  const categories = context.categories || context.expenseCategories || [];
  const text = textForItem(item, context);
  if (!text) return null;

  for (const rule of KEYWORD_RULES) {
    const matched = rule.keywords.some((keyword) =>
      mode === "fuzzy" ? keywordMatchesFuzzy(text, keyword) : keywordMatchesExact(text, keyword),
    );
    if (!matched) continue;

    const categoryId = pickExistingCategory(categories, rule.categories);
    if (!categoryId) continue;

    const source = mode === "fuzzy" ? "keyword_fuzzy" : "keyword_exact";
    return {
      categoryId,
      source,
      confidence: calculateCategoryConfidence(source),
      reason: mode === "fuzzy" ? "Fuzzy keyword match" : "Exact keyword match",
    };
  }

  return null;
}

export { KEYWORD_RULES };

export default {
  KEYWORD_RULES,
  applyKeywordDictionary,
  categoryExists,
  normalizeKeywordText,
  pickExistingCategory,
};
