export const CATEGORY_CONFIDENCE = Object.freeze({
  MANUAL_OVERRIDE: 100,
  LEARNED_MAPPING: 96,
  RULE: 92,
  MERCHANT_DICTIONARY: 88,
  KEYWORD_EXACT: 84,
  KEYWORD_FUZZY: 72,
  AI_SUGGESTION: 68,
  PARENT_FALLBACK: 55,
  UNCATEGORIZED: 0,
});

export function clampConfidence(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function calculateCategoryConfidence(source, baseConfidence) {
  const sourceKey = String(source || "").toLowerCase().trim();
  const fallback =
    sourceKey === "manual_override"
      ? CATEGORY_CONFIDENCE.MANUAL_OVERRIDE
      : sourceKey === "learned_mapping"
        ? CATEGORY_CONFIDENCE.LEARNED_MAPPING
        : sourceKey === "rules_engine"
          ? CATEGORY_CONFIDENCE.RULE
          : sourceKey === "merchant_dictionary"
            ? CATEGORY_CONFIDENCE.MERCHANT_DICTIONARY
            : sourceKey === "keyword_exact"
              ? CATEGORY_CONFIDENCE.KEYWORD_EXACT
              : sourceKey === "keyword_fuzzy"
                ? CATEGORY_CONFIDENCE.KEYWORD_FUZZY
                : sourceKey === "ai_suggestion"
                  ? CATEGORY_CONFIDENCE.AI_SUGGESTION
                  : sourceKey === "parent_fallback"
                    ? CATEGORY_CONFIDENCE.PARENT_FALLBACK
                    : CATEGORY_CONFIDENCE.UNCATEGORIZED;

  if (baseConfidence == null || baseConfidence === "") return fallback;
  return clampConfidence(baseConfidence, fallback);
}

export function buildConfidenceState(confidence) {
  const value = clampConfidence(confidence, 0);
  return {
    autoSelected: value >= 90,
    suggested: value >= 60 && value < 90,
    needsReview: value < 60,
  };
}

export default {
  CATEGORY_CONFIDENCE,
  buildConfidenceState,
  calculateCategoryConfidence,
  clampConfidence,
};
