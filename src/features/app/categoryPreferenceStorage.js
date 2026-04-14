function storageKey(userId) {
  return `smart_expense_category_preferences_${String(userId || "").trim()}`;
}

export function readStoredCategoryPreferences(userId) {
  const key = storageKey(userId);
  if (!String(userId || "").trim() || typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(key);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function upsertStoredCategoryPreference(userId, row) {
  const key = storageKey(userId);
  const categoryId = String(row?.categoryId || row?.category_id || "").trim();
  if (!String(userId || "").trim() || !categoryId || typeof window === "undefined") return null;

  const current = readStoredCategoryPreferences(userId);
  const nextRow = {
    category_id: categoryId,
    name: row?.name != null ? String(row.name || "").trim() || null : null,
    icon: row?.icon != null ? String(row.icon || "").trim() || null : null,
    color: row?.color != null ? String(row.color || "").trim() || null : null,
    hidden: row?.hidden === true,
    budget_behavior:
      row?.budgetBehavior === "fixed" || row?.budgetBehavior === "essential" || row?.budgetBehavior === "flexible"
        ? row.budgetBehavior
        : row?.budget_behavior === "fixed" || row?.budget_behavior === "essential" || row?.budget_behavior === "flexible"
          ? row.budget_behavior
          : null,
    updated_at: new Date().toISOString(),
  };

  const index = current.findIndex((item) => String(item?.category_id || "").trim() === categoryId);
  const next = index >= 0
    ? current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...nextRow } : item))
    : [...current, nextRow];

  try {
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    return null;
  }

  return nextRow;
}

export function clearStoredCategoryPreference(userId, categoryId) {
  const key = storageKey(userId);
  const targetId = String(categoryId || "").trim();
  if (!String(userId || "").trim() || !targetId || typeof window === "undefined") return;

  const current = readStoredCategoryPreferences(userId);
  const next = current.filter((item) => String(item?.category_id || "").trim() !== targetId);

  try {
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // ignore local storage write failures
  }
}
