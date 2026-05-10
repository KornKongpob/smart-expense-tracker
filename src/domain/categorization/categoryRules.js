import { deriveAutomationPatch } from "../../utils/rulesEngine.js";
import { calculateCategoryConfidence } from "./confidenceScoring.js";
import { pickExistingCategory } from "./keywordDictionary.js";

function textForRule(item = {}, context = {}) {
  return [
    item.rawName,
    item.normalizedName,
    item.name,
    item.note,
    item.itemName,
    context.merchant,
    context.parentMerchant,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function applyRulesEngine(item = {}, context = {}) {
  const rules = Array.isArray(context.rules) ? context.rules : [];
  if (!rules.length) return null;

  const text = textForRule(item, context);
  const patch = deriveAutomationPatch(rules, {
    text,
    rawText: text,
    merchant: context.merchant || context.parentMerchant || "",
    amount: item.amountSatang ?? item.amount ?? item.totalSatang ?? item.total ?? 0,
    ref: context.referenceId || "",
  });

  const categoryId = pickExistingCategory(
    context.categories || context.expenseCategories || [],
    [patch?.categoryId],
    "",
    { requireAssignable: true },
  );
  if (!categoryId) return null;

  return {
    categoryId,
    source: "rules_engine",
    confidence: calculateCategoryConfidence("rules_engine"),
    reason: "Automation rule",
  };
}

export default {
  applyRulesEngine,
};
