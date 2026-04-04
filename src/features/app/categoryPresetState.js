import { buildCategoryHierarchy, splitSelection } from "../../utils/categoryHierarchy.js";

function toId(value) {
  return String(value || "").trim();
}

export function toVisibleCategoryRows(categories) {
  return (Array.isArray(categories) ? categories : []).filter(
    (category) => category && category.isHidden !== true,
  );
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
