import {
  deriveMerchantAutofillPatch,
  normalizeMerchantKey,
  normalizeMerchants,
  resolveMerchantCanonical,
} from "../../utils/merchantDictionary.js";
import { calculateCategoryConfidence } from "./confidenceScoring.js";
import { categoryExists, normalizeKeywordText } from "./keywordDictionary.js";

function clean(value) {
  return String(value ?? "").trim();
}

function itemKey(value) {
  return normalizeKeywordText(value);
}

function mappingCategory(value) {
  if (!value) return "";
  if (typeof value === "string") return clean(value);
  return clean(value.categoryId || value.category || value.toCategoryId);
}

function withBumpedMapping(map, key, categoryId) {
  if (!key || !categoryId) return { ...(map || {}) };
  const current = map?.[key];
  const count = Number(current?.count || 0) || 0;
  return {
    ...(map || {}),
    [key]: {
      categoryId,
      count: count + 1,
      updatedAt: Date.now(),
    },
  };
}

export function learnFromUserCorrection(learning = {}, sample = {}) {
  const merchant = clean(sample.merchant || sample.parentMerchant);
  const categoryId = clean(sample.toCategoryId || sample.categoryId || sample.category || sample.userConfirmedCategory);
  if (!merchant || !categoryId) return { ...(learning || {}) };

  const merchantMapKey = normalizeMerchantKey(merchant);
  const rawItem = clean(sample.itemName || sample.rawName || sample.normalizedName || sample.name || sample.note);
  const lineKey = itemKey(rawItem);
  const itemMapKey = merchantMapKey && lineKey ? `${merchantMapKey}::${lineKey}` : "";

  return {
    ...(learning || {}),
    itemMappings: withBumpedMapping(learning?.itemMappings, itemMapKey, categoryId),
    merchantMappings: withBumpedMapping(learning?.merchantMappings, merchantMapKey, categoryId),
  };
}

export function applyMerchantLearning(item = {}, context = {}) {
  const categories = context.categories || context.expenseCategories || [];
  const merchant = clean(context.merchant || context.parentMerchant || item.merchant);
  const merchantKey = normalizeMerchantKey(merchant);
  const rawItem = clean(item.rawName || item.normalizedName || item.name || item.note || item.itemName);
  const lineKey = itemKey(rawItem);
  const learning = context.learning || context.merchantLearning || {};

  const itemMappingKey = merchantKey && lineKey ? `${merchantKey}::${lineKey}` : "";
  const learnedCategoryId =
    mappingCategory(learning?.itemMappings?.[itemMappingKey]) || mappingCategory(learning?.merchantMappings?.[merchantKey]);

  if (learnedCategoryId && categoryExists(categories, learnedCategoryId)) {
    return {
      categoryId: learnedCategoryId,
      source: "learned_mapping",
      confidence: calculateCategoryConfidence("learned_mapping"),
      reason: lineKey ? "Learned item correction" : "Learned merchant correction",
    };
  }

  const merchantEntries = normalizeMerchants(context.merchants || []);
  if (!merchantEntries.length || !merchantKey) return null;

  const canonical = resolveMerchantCanonical(merchant, merchantEntries);
  const patch = deriveMerchantAutofillPatch(
    {
      merchant: canonical || merchant,
      txType: "expense",
      categoryId: "",
      accountId: "",
    },
    merchantEntries,
  );
  const categoryId = clean(patch?.categoryId);
  if (!categoryId || !categoryExists(categories, categoryId)) return null;

  return {
    categoryId,
    source: "merchant_dictionary",
    confidence: calculateCategoryConfidence("merchant_dictionary"),
    reason: canonical ? `Merchant Library: ${canonical}` : "Merchant Library",
  };
}

export default {
  applyMerchantLearning,
  learnFromUserCorrection,
};
