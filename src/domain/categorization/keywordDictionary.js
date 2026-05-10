import { calculateCategoryConfidence } from "./confidenceScoring.js";
import {
  buildCategoryHierarchy,
  getAssignableCategoryFallback,
  isAssignableCategory,
} from "../../utils/categoryHierarchy.js";

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

function categoryList(categories = []) {
  return Array.isArray(categories)
    ? categories
    : [...(Array.isArray(categories?.expense) ? categories.expense : []), ...(Array.isArray(categories?.income) ? categories.income : [])];
}

export function categoryExists(categories = [], categoryId, options = {}) {
  const id = String(categoryId || "").trim();
  if (!id) return false;
  const list = categoryList(categories);
  if (!list.length) return true;
  const hierarchy = options.requireAssignable ? buildCategoryHierarchy(list) : null;
  return list.some((category) => {
    if (String(category?.id || "").trim() !== id || category?.isDeleted === true || category?.deletedAt) return false;
    if (!options.requireAssignable) return true;
    return isAssignableCategory(hierarchy?.byId?.get?.(id) || category, hierarchy);
  });
}

export function pickExistingCategory(categories, candidates = [], fallback = "", options = {}) {
  for (const candidate of candidates) {
    const id = String(candidate || "").trim();
    const fallbackId = getAssignableCategoryFallback(id);
    const ids = options.requireAssignable && fallbackId ? [fallbackId] : fallbackId ? [id, fallbackId] : [id];
    for (const nextId of ids) {
      if (nextId && categoryExists(categories, nextId, options)) return nextId;
    }
  }
  return categoryExists(categories, fallback, options) ? String(fallback || "").trim() : "";
}

const KEYWORD_RULES = Object.freeze([
  { keywords: ["starbucks", "latte", "espresso", "americano", "cappuccino", "coffee", "\u0e01\u0e32\u0e41\u0e1f"], categories: ["coffee", "drinks", "dining"] },
  { keywords: ["milk", "\u0e19\u0e21"], categories: ["dairy", "drinks", "packaged_food"] },
  { keywords: ["rice", "\u0e02\u0e49\u0e32\u0e27\u0e2a\u0e32\u0e23"], categories: ["packaged_food", "meal_prep"] },
  { keywords: ["lunch", "dinner", "meal", "rice plate", "\u0e02\u0e49\u0e32\u0e27", "\u0e2d\u0e32\u0e2b\u0e32\u0e23\u0e08\u0e32\u0e19\u0e40\u0e14\u0e35\u0e22\u0e27"], categories: ["dining", "street_food"] },
  { keywords: ["snack", "chips", "\u0e02\u0e19\u0e21"], categories: ["snacks", "dessert"] },
  { keywords: ["toothpaste", "toothbrush", "\u0e22\u0e32\u0e2a\u0e35\u0e1f\u0e31\u0e19", "\u0e41\u0e1b\u0e23\u0e07\u0e2a\u0e35\u0e1f\u0e31\u0e19"], categories: ["oral_care", "toiletries"] },
  { keywords: ["shampoo", "\u0e41\u0e0a\u0e21\u0e1e\u0e39"], categories: ["toiletries", "personal_items"] },
  { keywords: ["dish soap", "dishwashing", "\u0e19\u0e49\u0e33\u0e22\u0e32\u0e25\u0e49\u0e32\u0e07\u0e08\u0e32\u0e19"], categories: ["household_cleaning", "cleaning"] },
  { keywords: ["detergent", "laundry", "\u0e1c\u0e07\u0e0b\u0e31\u0e01\u0e1f\u0e2d\u0e01"], categories: ["laundry_supplies", "household_cleaning"] },
  { keywords: ["tissue", "toilet paper", "\u0e17\u0e34\u0e0a\u0e0a\u0e39\u0e48", "\u0e01\u0e23\u0e30\u0e14\u0e32\u0e29"], categories: ["paper_goods", "household_cleaning"] },
  { keywords: ["soap", "cleaner", "\u0e19\u0e49\u0e33\u0e22\u0e32"], categories: ["household_cleaning", "cleaning"] },
  { keywords: ["grab", "bolt", "taxi"], categories: ["ride_hailing", "taxi", "transport"] },
  { keywords: ["electricity", "pea", "mea", "\u0e04\u0e48\u0e32\u0e44\u0e1f"], categories: ["electricity"] },
  { keywords: ["water bill", "\u0e04\u0e48\u0e32\u0e19\u0e49\u0e33"], categories: ["water"] },
  { keywords: ["ais", "true", "dtac", "mobile bill"], categories: ["phone_internet"] },
  { keywords: ["fiber", "broadband", "home internet"], categories: ["internet_home"] },
  { keywords: ["parcel", "shipping", "\u0e04\u0e48\u0e32\u0e2a\u0e48\u0e07\u0e1e\u0e31\u0e2a\u0e14\u0e38"], categories: ["shipping"] },
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

    const categoryId = pickExistingCategory(categories, rule.categories, "", { requireAssignable: true });
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
