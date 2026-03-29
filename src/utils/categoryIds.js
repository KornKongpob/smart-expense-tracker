const KIND_CATEGORY_ID_ALIASES = {
  expense: {
    interest: "interest",
    adjust_balance: "adjust_balance",
  },
  income: {
    interest: "interest_income",
    adjust_balance: "adjust_balance_income",
  },
};

export function canonicalizeCategoryId(kind, categoryId) {
  const rawKind = String(kind || "").trim().toLowerCase();
  const rawId = String(categoryId || "").trim();
  if (!rawId) return "";
  return KIND_CATEGORY_ID_ALIASES[rawKind]?.[rawId] || rawId;
}
