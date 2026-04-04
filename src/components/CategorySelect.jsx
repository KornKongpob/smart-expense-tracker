// src/components/CategorySelect.jsx
import { useMemo } from "react";
import { buildCategoryHierarchy, isDeletedCategory, splitSelection } from "../utils/categoryHierarchy";

function normalizeCats(categories = [], value = "") {
  const cleanCats = (Array.isArray(categories) ? categories : []).filter(Boolean);
  const activeCats = cleanCats.filter((c) => !isDeletedCategory(c));
  const selectedId = String(value || "").trim();
  if (!selectedId) return activeCats;
  const exists = activeCats.some((c) => String(c?.id || "").trim() === selectedId);
  if (exists) return activeCats;
  const fromAll = cleanCats.find((c) => String(c?.id || "").trim() === selectedId);
  return fromAll ? [...activeCats, fromAll] : activeCats;
}

function ChipButton({ active, children, onClick, tone = "default", compact = false }) {
  const toneClass =
    tone === "danger"
      ? active
        ? "bg-red-600 text-white border-red-600"
        : "bg-red-50/70 text-red-700 border-red-200"
      : active
        ? "bg-gray-900/90 text-white border-gray-900/90"
        : "bg-white/70 text-gray-900 border-gray-900/10";

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-2xl border text-left transition-all active:scale-[0.99] min-w-0",
        compact ? "px-3 py-2 text-[12px] font-semibold" : "px-3 py-2.5 text-sm font-semibold",
        toneClass,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/**
 * CategorySelect
 * Compact card-based main/sub selector that preserves the old event-like API.
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
  const augmentedCats = useMemo(() => normalizeCats(categories, value), [categories, value]);
  const hierarchy = useMemo(() => buildCategoryHierarchy(augmentedCats), [augmentedCats]);
  const { mainId, subId } = useMemo(() => splitSelection(value, hierarchy), [value, hierarchy]);

  const selectedMain = mainId ? hierarchy.byId.get(mainId) : null;
  const children = useMemo(() => {
    if (!selectedMain) return [];
    return hierarchy.childrenByParent.get(selectedMain.id) || [];
  }, [hierarchy, selectedMain]);

  const emit = (nextValue) => {
    if (!onChange) return;
    onChange({ target: { value: nextValue } });
  };

  const wrapperClass = [
    "rounded-2xl border border-white/20 bg-white/25 p-2.5 min-w-0",
    disabled ? "opacity-60 pointer-events-none" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapperClass}>
      {allowEmpty ? (
        <div className="mb-2 flex flex-wrap gap-2">
          <ChipButton active={!value} onClick={() => emit("")} compact tone={!value ? "danger" : "default"}>
            {emptyLabel}
          </ChipButton>
        </div>
      ) : null}

      <div className="text-[11px] font-semibold text-gray-900/60 mb-2">หมวดหลัก</div>
      <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1 no-scrollbar">
        {hierarchy.main.map((cat) => {
          const id = String(cat?.id || "").trim();
          const active = String(mainId || "") === id;
          return (
            <ChipButton key={id} active={active} onClick={() => emit(id)}>
              <span className="inline-flex items-center gap-2 min-w-0">
                <span className="shrink-0 text-base">{cat?.icon || "🏷️"}</span>
                <span className="truncate">{cat?.name}</span>
              </span>
            </ChipButton>
          );
        })}
      </div>

      {selectedMain && children.length ? (
        <div className="mt-3">
          <div className="text-[11px] font-semibold text-gray-900/60 mb-2">หมวดย่อย</div>
          <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1 no-scrollbar">
            <ChipButton active={!subId} onClick={() => emit(selectedMain.id)} compact>
              ใช้หมวดหลักนี้
            </ChipButton>
            {children.map((cat) => {
              const id = String(cat?.id || "").trim();
              const active = String(subId || "") === id;
              return (
                <ChipButton key={id} active={active} onClick={() => emit(id)} compact>
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <span className="shrink-0 text-sm">{cat?.icon || "🏷️"}</span>
                    <span className="truncate">{cat?.name}</span>
                  </span>
                </ChipButton>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
