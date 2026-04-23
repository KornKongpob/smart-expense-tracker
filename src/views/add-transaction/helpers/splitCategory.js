function cleanId(value) {
  return String(value || "").trim();
}

export function deriveSplitParentCategoryId({
  type = "expense",
  childCategoryIds = [],
  existingParentCategoryId = "",
  fallbackCategoryId = "",
} = {}) {
  const uniqueCats = Array.from(
    new Set((Array.isArray(childCategoryIds) ? childCategoryIds : []).map(cleanId).filter(Boolean)),
  );
  const fallback = cleanId(fallbackCategoryId);

  if (type === "income") {
    if (uniqueCats.length === 1) return uniqueCats[0];
    return fallback || "other_income";
  }

  const existing = cleanId(existingParentCategoryId);
  if (existing) return existing;

  if (uniqueCats.length > 1) return "mixed";
  return uniqueCats[0] || fallback || "mixed";
}
