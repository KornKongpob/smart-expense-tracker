// src/utils/categoryHierarchy.js
/**
 * Category hierarchy helpers (Parent/Child)
 * - Supports 1-level hierarchy (main -> sub), but functions are safe for deeper trees.
 * - Works with tombstone strategy: categories may be kept with {isDeleted/deletedAt}.
 */

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

export const NON_ASSIGNABLE_CATEGORY_IDS = new Set([
  "food",
  "transport",
  "housing",
  "bills",
  "shopping",
  "personal_care",
  "health",
  "fitness",
  "entertainment",
  "education",
  "travel",
  "family",
  "gift",
  "work",
  "fees",
  "debt",
  "insurance",
  "taxes",
  "donation",
  "mixed",
  "groceries",
  "home",
]);

export const LOW_PRIORITY_ASSIGNABLE_CATEGORY_IDS = new Set(["other", "other_income"]);

export const BROAD_CATEGORY_ASSIGNMENT_FALLBACKS = Object.freeze({
  food: "dining",
  groceries: "packaged_food",
  home: "household_cleaning",
  transport: "public_transit",
  housing: "home_repair",
  bills: "subscriptions",
  utilities: "subscriptions",
  utility: "subscriptions",
  shopping: "online_shopping",
  personal_care: "toiletries",
  health: "pharmacy",
  fitness: "gym",
  entertainment: "movies",
  education: "courses",
  travel: "travel_transport",
  family: "kids",
  gift: "celebrations",
  work: "office_supplies",
  fees: "service_charge",
  debt: "loan_payment",
  insurance: "property_insurance",
  taxes: "income_tax",
  donation: "charity",
  mixed: "other",
});

export function isDeletedCategory(c) {
  return !!(c?.isDeleted || c?.deletedAt);
}

export function toArray(v) {
  if (Array.isArray(v)) return v;
  if (isObj(v)) return Object.values(v);
  return [];
}

export function buildCategoryHierarchy(categories) {
  const list = toArray(categories).filter(Boolean);

  const byId = new Map();
  for (const c of list) {
    const id = String(c?.id || "").trim();
    if (!id) continue;
    byId.set(id, { ...c, id });
  }

  // Normalize parentId (string, no self-parent, must exist)
  const parentById = new Map();
  for (const [id, c] of byId.entries()) {
    const pidRaw = String(c?.parentId || "").trim();
    const pid = pidRaw && pidRaw !== id && byId.has(pidRaw) ? pidRaw : "";
    parentById.set(id, pid);
  }

  const childrenByParent = new Map();
  for (const [id, pid] of parentById.entries()) {
    if (!pid) continue;
    const arr = childrenByParent.get(pid) || [];
    arr.push(byId.get(id));
    childrenByParent.set(pid, arr);
  }

  const main = [];
  for (const [id, c] of byId.entries()) {
    const pid = parentById.get(id) || "";
    if (!pid) main.push(c);
  }

  // Sort: Thai-friendly fallback
  const sortByName = (a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), "th");
  main.sort(sortByName);
  for (const [pid, arr] of childrenByParent.entries()) {
    arr.sort(sortByName);
    childrenByParent.set(pid, arr);
  }

  for (const [id, c] of byId.entries()) {
    const hasChildren = (childrenByParent.get(id) || []).length > 0;
    if (c?.assignable == null && (hasChildren || NON_ASSIGNABLE_CATEGORY_IDS.has(id))) {
      byId.set(id, { ...c, assignable: false });
    }
  }

  for (let i = 0; i < main.length; i += 1) {
    const id = String(main[i]?.id || "").trim();
    main[i] = byId.get(id) || main[i];
  }
  for (const [pid, arr] of childrenByParent.entries()) {
    childrenByParent.set(
      pid,
      arr.map((child) => byId.get(String(child?.id || "").trim()) || child),
    );
  }

  return { byId, parentById, childrenByParent, main };
}

export function hasCategoryChildren(categoryOrId, hierarchy) {
  const id = String(typeof categoryOrId === "object" ? categoryOrId?.id : categoryOrId || "").trim();
  if (!id) return false;
  return (hierarchy?.childrenByParent?.get?.(id) || []).length > 0;
}

export function isAssignableCategory(category, hierarchy = null) {
  if (!category) return false;
  if (isDeletedCategory(category)) return false;

  const id = String(category?.id || "").trim();
  if (!id) return false;

  if (category.assignable === false) return false;
  if (category.assignable === true) return true;
  if (NON_ASSIGNABLE_CATEGORY_IDS.has(id)) return false;
  if (hierarchy && hasCategoryChildren(id, hierarchy)) return false;

  return true;
}

export function canSelectCategory(category, hierarchy = null, { selectedId = "", allowCurrent = true } = {}) {
  const id = String(category?.id || "").trim();
  const currentId = String(selectedId || "").trim();
  if (allowCurrent && id && currentId && id === currentId) return true;
  return isAssignableCategory(category, hierarchy);
}

export function shouldShowCategoryInPicker(category, hierarchy = null, { selectedId = "" } = {}) {
  const id = String(category?.id || "").trim();
  if (!id) return false;
  if (String(selectedId || "").trim() === id) return true;
  if (isDeletedCategory(category)) return false;
  if (category.hideFromPicker === true || category.hiddenFromPicker === true) return false;
  if (hasCategoryChildren(id, hierarchy)) return true;
  return isAssignableCategory(category, hierarchy);
}

export function isPromotedCategory(category, hierarchy = null) {
  const id = String(category?.id || "").trim();
  if (!id || LOW_PRIORITY_ASSIGNABLE_CATEGORY_IDS.has(id)) return false;
  return isAssignableCategory(category, hierarchy);
}

export function getAssignableCategoryFallback(categoryId) {
  const id = String(categoryId || "").trim();
  if (!id) return "";
  return BROAD_CATEGORY_ASSIGNMENT_FALLBACKS[id] || "";
}

export function getAncestors(id, parentById, { maxDepth = 8 } = {}) {
  const out = [];
  let cur = String(id || "").trim();
  const seen = new Set();
  for (let i = 0; i < maxDepth; i++) {
    const pid = String(parentById?.get?.(cur) || "").trim();
    if (!pid) break;
    if (seen.has(pid)) break;
    seen.add(pid);
    out.push(pid);
    cur = pid;
  }
  return out;
}

export function splitSelection(selectedId, hierarchy) {
  const id = String(selectedId || "").trim();
  if (!id) return { mainId: "", subId: "" };

  const { parentById } = hierarchy || {};
  const pid = String(parentById?.get?.(id) || "").trim();
  if (!pid) return { mainId: id, subId: "" };

  // Find top-most parent (1-level expected, but safe for deeper)
  const ancestors = getAncestors(id, parentById);
  const top = ancestors.length ? ancestors[ancestors.length - 1] : pid;
  return { mainId: top, subId: id };
}

export function collectDescendantIds(rootId, hierarchy) {
  const rid = String(rootId || "").trim();
  if (!rid) return [];
  const { childrenByParent } = hierarchy || {};
  const out = [];
  const q = [rid];
  const seen = new Set();
  while (q.length) {
    const cur = q.shift();
    if (!cur || seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);
    const kids = childrenByParent?.get?.(cur) || [];
    for (const k of kids) {
      const id = String(k?.id || "").trim();
      if (id && !seen.has(id)) q.push(id);
    }
  }
  return out;
}

export function sanitizeCategoryHierarchy(categories) {
  // Returns new list with safe parentId (no self-parent, no missing parent)
  const list = toArray(categories).filter(Boolean);

  const byId = new Map();
  for (const c of list) {
    const id = String(c?.id || "").trim();
    if (!id) continue;
    byId.set(id, { ...c, id });
  }

  const isDeleted = (c) => !!(c?.isDeleted || c?.deletedAt);

  const next = [];
  for (const c of byId.values()) {
    const id = c.id;
    let pid = String(c?.parentId || "").trim();

    if (pid === id) pid = "";
    if (pid && !byId.has(pid)) pid = "";

    // prevent parent being deleted
    if (pid && isDeleted(byId.get(pid))) pid = "";

    // prevent 3-level: parent itself must be root
    if (pid) {
      const p = byId.get(pid);
      const ppid = String(p?.parentId || "").trim();
      if (ppid) pid = "";
    }

    next.push({ ...c, parentId: pid });
  }

  return next;
}
