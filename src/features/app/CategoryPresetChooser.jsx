import { useMemo } from "react";
import { Check } from "lucide-react";

import { buildCategoryHierarchy, splitSelection } from "../../utils/categoryHierarchy.js";

function toCategoryRows(categories) {
  return (Array.isArray(categories) ? categories : []).filter(
    (category) => category && category.isHidden !== true,
  );
}

export default function CategoryPresetChooser({
  categories,
  value,
  onChange,
  label = "หมวดหมู่",
  fallbackLabel = "เลือกจากทั้งหมด",
  fallbackTestId,
}) {
  const visibleCategories = useMemo(() => toCategoryRows(categories), [categories]);
  const hierarchy = useMemo(() => buildCategoryHierarchy(visibleCategories), [visibleCategories]);
  const selection = useMemo(() => splitSelection(value, hierarchy), [hierarchy, value]);
  const mainCategories = Array.isArray(hierarchy.main) ? hierarchy.main : [];
  const activeMainId = String(selection.mainId || "").trim();
  const subCategoryId = String(selection.subId || "").trim();
  const activeMain = activeMainId ? hierarchy.byId.get(activeMainId) || null : null;
  const activeChildren = activeMainId ? hierarchy.childrenByParent.get(activeMainId) || [] : [];

  const handleMainSelect = (categoryId) => {
    const nextId = String(categoryId || "").trim();
    if (!nextId) return;
    onChange?.(nextId);
  };

  const handleSubcategorySelect = (event) => {
    const nextId = String(event.target.value || "").trim();
    onChange?.(nextId);
  };

  return (
    <section className="finance-form-section finance-form-section-compact">
      <div className="finance-section-label">{label}</div>

      {mainCategories.length ? (
        <div className="finance-category-preset-grid">
          {mainCategories.map((category) => {
            const categoryId = String(category?.id || "").trim();
            const isActive = categoryId === activeMainId;
            const childCount = (hierarchy.childrenByParent.get(categoryId) || []).length;
            const color = String(category?.color || "#0b84ff").trim() || "#0b84ff";

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
                    {childCount ? `${childCount} หมวดย่อย` : "เลือกได้ทันที"}
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

      {activeMain && activeChildren.length ? (
        <label className="finance-field finance-category-subselect">
          <span className="ui-label">{`หมวดย่อยใน ${activeMain.name}`}</span>
          <select
            className="ui-select"
            value={subCategoryId || activeMainId}
            onChange={handleSubcategorySelect}
          >
            <option value={activeMainId}>ใช้หมวดหลักนี้</option>
            {activeChildren.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="finance-field finance-category-fallback">
        <span className="ui-label">{fallbackLabel}</span>
        <select
          className="ui-select"
          value={String(value || "").trim()}
          data-testid={fallbackTestId}
          onChange={handleSubcategorySelect}
        >
          <option value="">เลือกหมวดหมู่</option>
          {mainCategories.map((category) => {
            const categoryId = String(category?.id || "").trim();
            const children = hierarchy.childrenByParent.get(categoryId) || [];

            return [
              <option key={categoryId} value={categoryId}>
                {category.name}
              </option>,
              ...children.map((child) => (
                <option key={child.id} value={child.id}>
                  {`↳ ${child.name}`}
                </option>
              )),
            ];
          })}
        </select>
      </label>
    </section>
  );
}
