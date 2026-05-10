import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Search } from "lucide-react";

import {
  buildCategoryPresetState,
  buildCategorySearchResults,
  normalizeCategorySearchQuery,
  resolveCategoryPresetFocusMainId,
} from "./categoryPresetState.js";
import { canSelectCategory, hasCategoryChildren } from "../../utils/categoryHierarchy.js";

function toId(value) {
  return String(value || "").trim();
}

export default function CategoryPresetChooser({
  categories,
  value,
  onChange,
  label = "หมวดหมู่",
}) {
  const [focusedMainId, setFocusedMainId] = useState("");
  const [query, setQuery] = useState("");
  const pickerState = useMemo(
    () => buildCategoryPresetState(categories, value, focusedMainId),
    [categories, focusedMainId, value],
  );
  const hasSearchQuery = Boolean(normalizeCategorySearchQuery(query));
  const {
    hierarchy,
    mainCategories,
    activeMainId,
    subCategoryId,
    activeSubcategory,
    stageMainId,
    stageMain,
    stageChildren,
    stageMainSelectable,
    showSubcategoryStage,
  } = pickerState;
  const searchResults = useMemo(
    () => buildCategorySearchResults(hierarchy, query, value),
    [hierarchy, query, value],
  );

  useEffect(() => {
    if (!stageMainId) return;
    if (!hierarchy.byId.has(stageMainId)) {
      setFocusedMainId("");
      return;
    }

    const nextChildren = hierarchy.childrenByParent.get(stageMainId) || [];
    if (!nextChildren.length) setFocusedMainId("");
  }, [hierarchy, stageMainId]);

  const handleMainSelect = (categoryId) => {
    const nextId = toId(categoryId);
    if (!nextId) return;

    const children = hierarchy.childrenByParent.get(nextId) || [];
    if (children.length) {
      setFocusedMainId(nextId);
      return;
    }

    const category = hierarchy.byId.get(nextId);
    if (!canSelectCategory(category, hierarchy, { selectedId: value })) return;
    setFocusedMainId("");
    onChange?.(nextId);
  };

  const handleUseMainCategory = () => {
    if (!stageMainId) return;
    if (!stageMainSelectable) return;
    onChange?.(stageMainId);
  };

  const handleSubcategoryPress = (categoryId) => {
    const nextId = toId(categoryId);
    if (!nextId) return;
    onChange?.(nextId);
  };

  const handleSearchResultPress = (categoryId) => {
    const nextId = toId(categoryId);
    if (!nextId) return;
    setQuery("");
    if (hasCategoryChildren(nextId, hierarchy) && !canSelectCategory(hierarchy.byId.get(nextId), hierarchy, { selectedId: value })) {
      setFocusedMainId(nextId);
      return;
    }
    if (!canSelectCategory(hierarchy.byId.get(nextId), hierarchy, { selectedId: value })) return;
    setFocusedMainId(resolveCategoryPresetFocusMainId(hierarchy, nextId));
    onChange?.(nextId);
  };

  return (
    <section className="finance-form-section finance-form-section-compact">
      <div className="finance-section-label">{label}</div>

      <label className="finance-search finance-category-search">
        <Search size={16} />
        <input
          className="ui-input"
          type="search"
          value={query}
          placeholder="ค้นหาหมวดหมู่"
          aria-label={`ค้นหา${label}`}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {hasSearchQuery ? (
        searchResults.length ? (
          <div className="finance-category-search-results">
            {searchResults.map((result) => {
              const categoryId = toId(result?.id);
              const childCount = (hierarchy.childrenByParent.get(categoryId) || []).length;
              const color = String(result?.category?.color || "#0b84ff").trim() || "#0b84ff";
              const metaLabel = result.isSubcategory
                ? result.parentName || "หมวดย่อย"
                : childCount
                  ? `${childCount} หมวดย่อย`
                  : "หมวดหลัก";

              return (
                <button
                  key={categoryId}
                  type="button"
                  className={["finance-category-search-result", result.isActive ? "is-active" : ""].join(" ")}
                  onClick={() => handleSearchResultPress(categoryId)}
                >
                  <span
                    className="finance-category-preset-badge"
                    style={{ backgroundColor: `${color}14`, color }}
                  >
                    {result?.category?.icon || "•"}
                  </span>
                  <span className="finance-category-search-result-copy">
                    <span className="finance-category-search-result-name">{result.name || "หมวดหมู่"}</span>
                    <span className="finance-category-search-result-meta">{metaLabel}</span>
                  </span>
                  {result.isActive ? (
                    <span className="finance-category-preset-check" aria-hidden="true">
                      <Check size={14} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="finance-category-search-empty">ไม่พบหมวดหมู่ที่ตรงกับคำค้นนี้</div>
        )
      ) : (
        <>
          {!showSubcategoryStage && mainCategories.length ? (
            <div className="finance-category-preset-grid">
              {mainCategories.map((category) => {
                const categoryId = toId(category?.id);
                const isActive = categoryId === activeMainId;
                const childCount = (hierarchy.childrenByParent.get(categoryId) || []).length;
                const color = String(category?.color || "#0b84ff").trim() || "#0b84ff";
                const selectedChildName = isActive ? activeSubcategory?.name || "" : "";

                return (
                  <button
                    key={categoryId}
                    type="button"
                    className={["finance-category-preset-card", isActive ? "is-active" : ""].join(" ")}
                    onClick={() => handleMainSelect(categoryId)}
                  >
                    <span
                      className="finance-category-preset-badge"
                      style={{ backgroundColor: `${color}14`, color }}
                    >
                      {category?.icon || "•"}
                    </span>
                    <span className="finance-category-preset-copy">
                      <span className="finance-category-preset-name">{category?.name || "หมวดหมู่"}</span>
                      <span className="finance-category-preset-meta">
                        {selectedChildName
                          ? `เลือก ${selectedChildName}`
                          : childCount
                            ? `${childCount} หมวดย่อย`
                            : "แตะเพื่อใช้หมวดนี้"}
                      </span>
                    </span>
                    {isActive ? (
                      <span className="finance-category-preset-check" aria-hidden="true">
                        <Check size={14} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {showSubcategoryStage && stageMain ? (
            <section className="finance-category-step">
              <div className="finance-category-step-head">
                <button
                  type="button"
                  className="finance-category-step-back"
                  onClick={() => setFocusedMainId("")}
                >
                  <ArrowLeft size={14} />
                  เปลี่ยนหมวดหลัก
                </button>
                <span className="ui-label">{`หมวดย่อยใน ${stageMain.name}`}</span>
                <span className="finance-category-step-copy">
                  เลือกหมวดย่อยที่ต้องการ หรือใช้หมวดหลักนี้ได้ทันที
                </span>
              </div>

              <div className="finance-subcategory-card-grid">
                {stageMainSelectable ? (
                <button
                  type="button"
                  className={[
                    "finance-subcategory-card",
                    !subCategoryId || subCategoryId === stageMainId ? "is-active" : "",
                    "is-main",
                  ].join(" ")}
                  onClick={handleUseMainCategory}
                >
                  <span
                    className="finance-subcategory-card-badge"
                    style={{
                      backgroundColor: `${String(stageMain?.color || "#0b84ff").trim() || "#0b84ff"}14`,
                      color: String(stageMain?.color || "#0b84ff").trim() || "#0b84ff",
                    }}
                  >
                    {stageMain?.icon || "•"}
                  </span>
                  <span className="finance-subcategory-card-copy">
                    <span className="finance-subcategory-card-name">ใช้หมวดหลัก</span>
                    <span className="finance-subcategory-card-meta">{stageMain.name}</span>
                  </span>
                  {!subCategoryId || subCategoryId === stageMainId ? (
                    <span className="finance-subcategory-card-check" aria-hidden="true">
                      <Check size={14} />
                    </span>
                  ) : null}
                </button>
                ) : null}

                {stageChildren.map((category) => {
                  const categoryId = toId(category?.id);
                  const isActive = categoryId === subCategoryId;
                  const color = String(category?.color || stageMain?.color || "#0b84ff").trim() || "#0b84ff";

                  return (
                    <button
                      key={categoryId}
                      type="button"
                      className={["finance-subcategory-card", isActive ? "is-active" : ""].join(" ")}
                      onClick={() => handleSubcategoryPress(categoryId)}
                    >
                      <span
                        className="finance-subcategory-card-badge"
                        style={{ backgroundColor: `${color}14`, color }}
                      >
                        {category?.icon || stageMain?.icon || "•"}
                      </span>
                      <span className="finance-subcategory-card-copy">
                        <span className="finance-subcategory-card-name">{category.name}</span>
                        <span className="finance-subcategory-card-meta">หมวดย่อย</span>
                      </span>
                      {isActive ? (
                        <span className="finance-subcategory-card-check" aria-hidden="true">
                          <Check size={14} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
