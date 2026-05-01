import { calculateCategoryConfidence, buildConfidenceState } from "./confidenceScoring.js";
import { applyRulesEngine } from "./categoryRules.js";
import { applyMerchantLearning } from "./merchantLearning.js";
import { applyKeywordDictionary, categoryExists, pickExistingCategory } from "./keywordDictionary.js";

function clean(value) {
  return String(value ?? "").trim();
}

function categoriesOf(context = {}) {
  return context.categories || context.expenseCategories || context.expenseCats || [];
}

function uncategorizedId(context = {}) {
  const categories = categoriesOf(context);
  return (
    pickExistingCategory(categories, [
      context.uncategorizedCategoryId,
      "uncategorized",
      "other",
      "mixed",
    ]) || "uncategorized"
  );
}

function confidenceResult(item, candidate, context) {
  const categoryId = clean(candidate?.categoryId);
  const confidence = calculateCategoryConfidence(candidate?.source, candidate?.confidence);
  const state = buildConfidenceState(confidence);
  return {
    ...item,
    categoryId,
    suggestedCategoryId: categoryId,
    categoryConfidence: confidence,
    categoryReason: candidate?.reason || "",
    categorySource: candidate?.source || "uncategorized",
    needsReview: state.needsReview,
    autoSelected: state.autoSelected,
    suggested: state.suggested,
    userConfirmedCategory: candidate?.source === "manual_override" ? true : item?.userConfirmedCategory === true,
    source: item?.source || context.source || "categorization",
  };
}

function manualOverride(item = {}, context = {}) {
  const categories = categoriesOf(context);
  const categoryId = clean(item.manualCategoryId || item.userCategoryId || (item.userConfirmedCategory ? item.categoryId : ""));
  if (!categoryId || !categoryExists(categories, categoryId)) return null;
  return {
    categoryId,
    source: "manual_override",
    confidence: 100,
    reason: "User confirmed category",
  };
}

function aiSuggestion(item = {}, context = {}) {
  const categories = categoriesOf(context);
  const categoryId = clean(item.suggestedCategoryId || item.aiSuggestedCategoryId || context.aiSuggestedCategoryId || item.categoryId);
  if (!categoryId || !categoryExists(categories, categoryId)) return null;
  return {
    categoryId,
    source: "ai_suggestion",
    confidence: item.categoryConfidence ?? item.confidence ?? context.aiCategoryConfidence,
    reason: item.categoryReason || "AI suggested category",
  };
}

function parentFallback(context = {}) {
  const categories = categoriesOf(context);
  const categoryId = clean(context.parentCategoryId || context.fallbackCategoryId || context.defaultCategoryId);
  if (!categoryId || !categoryExists(categories, categoryId)) return null;
  return {
    categoryId,
    source: "parent_fallback",
    confidence: calculateCategoryConfidence("parent_fallback"),
    reason: "Parent merchant fallback",
  };
}

function adjustmentCandidate(item = {}, context = {}) {
  const type = clean(item.receiptLineType || item.lineType).toLowerCase();
  const adjustmentType = clean(item.adjustmentType || item.adjustment_type).toLowerCase();
  if (type !== "adjustment" && !adjustmentType) return null;
  const categoryId = pickExistingCategory(categoriesOf(context), [
    item.categoryId,
    adjustmentType === "discount" ? "discount" : "",
    adjustmentType === "tax" ? "taxes" : "",
    adjustmentType === "service_charge" ? "service_charge" : "",
    "fees",
    "other",
  ]);
  return categoryId
    ? {
        categoryId,
        source: "rules_engine",
        confidence: 95,
        reason: "Receipt adjustment",
      }
    : null;
}

export function categorizeReceiptItem(item = {}, context = {}) {
  const candidates = [
    manualOverride(item, context),
    adjustmentCandidate(item, context),
    applyMerchantLearning(item, context),
    applyRulesEngine(item, context),
    applyKeywordDictionary(item, context, { mode: "exact" }),
    applyKeywordDictionary(item, context, { mode: "fuzzy" }),
    aiSuggestion(item, context),
    parentFallback(context),
  ];

  const winner = candidates.find(Boolean) || {
    categoryId: uncategorizedId(context),
    source: "uncategorized",
    confidence: 0,
    reason: "Needs review",
  };

  return confidenceResult(item, winner, context);
}

export function categorizeReceiptItems(items = [], context = {}) {
  return (Array.isArray(items) ? items : []).map((item) => categorizeReceiptItem(item, context));
}

export { applyRulesEngine, applyMerchantLearning, applyKeywordDictionary };

export default {
  categorizeReceiptItem,
  categorizeReceiptItems,
};
