// src/components/CategorySelect.jsx
import { useMemo } from "react";
import { buildCategoryHierarchy, isDeletedCategory, splitSelection } from "../utils/categoryHierarchy";

/**
 * CategorySelect (Main -> Sub) — Option B
 * - Choose main category first, then (optional) choose sub category.
 * - If sub is not chosen, the selected value remains the main category id.
 *
 * Props:
 * - categories: array of categories (for one type: expense OR income)
 * - value: selected categoryId (string)
 * - onChange: (eventLike) => void  // compatible with <select> onChange
 * - allowEmpty: boolean (default false) — allow value=""
 * - emptyLabel: string (default "(ไม่เลือก)")
 * - className: string — applied to selects
 * - disabled: boolean
 */
export default function CategorySelect({
  categories = [],
  value = "",
  onChange,
  allowEmpty = false,
  emptyLabel = "(ไม่เลือก)",
  className = "",
  disabled = false,
}) {
  const cleanCats = useMemo(() => (Array.isArray(categories) ? categories : []).filter((c) => !!c), [categories]);

  const activeCats = useMemo(() => cleanCats.filter((c) => !isDeletedCategory(c)), [cleanCats]);

  // Include selected category even if deleted (so edit screens don't break)
  const augmentedCats = useMemo(() => {
    const id = String(value || "").trim();
    if (!id) return activeCats;
    const exists = activeCats.some((c) => String(c?.id || "").trim() === id);
    if (exists) return activeCats;

    const fromAll = cleanCats.find((c) => String(c?.id || "").trim() === id);
    return fromAll ? [...activeCats, fromAll] : activeCats;
  }, [activeCats, cleanCats, value]);

  const hierarchy = useMemo(() => buildCategoryHierarchy(augmentedCats), [augmentedCats]);

  const { mainId, subId } = useMemo(() => splitSelection(value, hierarchy), [value, hierarchy]);

  const selectedMain = mainId ? hierarchy.byId.get(mainId) : null;
  const children = useMemo(() => {
    if (!selectedMain) return [];
    return hierarchy.childrenByParent.get(selectedMain.id) || [];
  }, [hierarchy, selectedMain]);

  const emit = (nextValue) => {
    if (!onChange) return;
    // event-like for drop-in replacement
    onChange({ target: { value: nextValue } });
  };

  const mainValue = allowEmpty ? mainId : mainId || "";
  const subValue = subId || "";

  return (
    <div className="flex flex-col gap-2">
      <select
        value={mainValue}
        disabled={disabled}
        onChange={(e) => {
          const nextMain = String(e.target.value || "").trim();
          if (!nextMain) {
            emit("");
            return;
          }
          // selecting main always sets value to main id (Option B)
          emit(nextMain);
        }}
        className={className}
      >
        {allowEmpty ? <option value="">{emptyLabel}</option> : null}
        {hierarchy.main.map((c) => (
          <option key={c.id} value={c.id}>
            {c.icon} {c.name}
          </option>
        ))}
      </select>

      {selectedMain && children.length ? (
        <select
          value={subValue}
          disabled={disabled}
          onChange={(e) => {
            const nextSub = String(e.target.value || "").trim();
            if (!nextSub) {
              // Option B: keep main
              emit(selectedMain.id);
              return;
            }
            emit(nextSub);
          }}
          className={className}
        >
          <option value="">(ใช้หมวดหลักนี้)</option>
          {children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
