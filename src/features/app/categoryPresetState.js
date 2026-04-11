import { buildCategoryHierarchy, splitSelection } from "../../utils/categoryHierarchy.js";

function toId(value) {
  return String(value || "").trim();
}

function normalizeSearchText(value) {
  return String(value || "").trim().toLocaleLowerCase("th");
}

function resolveHierarchy(categoriesOrHierarchy) {
  if (categoriesOrHierarchy?.byId instanceof Map) return categoriesOrHierarchy;
  return buildCategoryHierarchy(toVisibleCategoryRows(categoriesOrHierarchy));
}

function flattenHierarchy(hierarchy) {
  const ordered = [];
  const seen = new Set();

  const pushCategory = (category) => {
    const categoryId = toId(category?.id);
    if (!categoryId || seen.has(categoryId)) return;
    seen.add(categoryId);
    ordered.push(category);
  };

  for (const category of Array.isArray(hierarchy?.main) ? hierarchy.main : []) {
    pushCategory(category);
    for (const child of hierarchy?.childrenByParent?.get?.(toId(category?.id)) || []) {
      pushCategory(child);
    }
  }

  for (const category of hierarchy?.byId?.values?.() || []) {
    pushCategory(category);
  }

  return ordered;
}

export function toVisibleCategoryRows(categories) {
  return (Array.isArray(categories) ? categories : []).filter(
    (category) => category && category.isHidden !== true,
  );
}

export function normalizeCategorySearchQuery(query) {
  return normalizeSearchText(query);
}

export function resolveCategoryPresetFocusMainId(categoriesOrHierarchy, categoryId) {
  const targetId = toId(categoryId);
  if (!targetId) return "";

  const hierarchy = resolveHierarchy(categoriesOrHierarchy);
  return toId(hierarchy?.parentById?.get?.(targetId));
}

export function buildCategorySearchResults(categoriesOrHierarchy, query, value = "") {
  const normalizedQuery = normalizeCategorySearchQuery(query);
  if (!normalizedQuery) return [];

  const hierarchy = resolveHierarchy(categoriesOrHierarchy);
  const selectedId = toId(value);

  return flattenHierarchy(hierarchy)
    .map((category) => {
      const id = toId(category?.id);
      const parentId = toId(hierarchy?.parentById?.get?.(id));
      const parent = parentId ? hierarchy?.byId?.get?.(parentId) || null : null;
      const name = String(category?.name || "").trim();
      const parentName = String(parent?.name || "").trim();
      const searchText = normalizeSearchText(
        [name, parentName, parentName && name ? `${parentName} ${name}` : ""].filter(Boolean).join(" "),
      );

      return {
        id,
        name,
        parentId,
        parentName,
        category,
        isActive: id === selectedId,
        isSubcategory: Boolean(parentId),
        searchText,
      };
    })
    .filter((entry) => entry.id && entry.searchText.includes(normalizedQuery))
    .map(({ searchText, ...entry }) => entry);
}

export function buildCategoryPresetState(categories, value, focusedMainId = "") {
  const visibleCategories = toVisibleCategoryRows(categories);
  const hierarchy = buildCategoryHierarchy(visibleCategories);
  const selection = splitSelection(value, hierarchy);
  const activeMainId = toId(selection.mainId);
  const subCategoryId = toId(selection.subId);
  const stageMainId = toId(focusedMainId);
  const stageMain = stageMainId ? hierarchy.byId.get(stageMainId) || null : null;
  const stageChildren = stageMainId ? hierarchy.childrenByParent.get(stageMainId) || [] : [];

  return {
    hierarchy,
    mainCategories: Array.isArray(hierarchy.main) ? hierarchy.main : [],
    activeMainId,
    subCategoryId,
    activeMain: activeMainId ? hierarchy.byId.get(activeMainId) || null : null,
    activeSubcategory: subCategoryId ? hierarchy.byId.get(subCategoryId) || null : null,
    stageMainId: stageMain ? stageMainId : "",
    stageMain,
    stageChildren,
    showSubcategoryStage: Boolean(stageMain && stageChildren.length),
  };
}
