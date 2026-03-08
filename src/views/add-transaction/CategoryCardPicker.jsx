import React, { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft } from "lucide-react";

import { cn } from "../../utils/cn";
import {
  buildCategoryHierarchy,
  getAncestors,
  isDeletedCategory,
  splitSelection,
} from "../../utils/categoryHierarchy";

function getSelectionPath(id, hierarchy) {
  const cid = String(id || "").trim();
  if (!cid) return "";

  const byId = hierarchy?.byId;
  const parentById = hierarchy?.parentById;
  const current = byId?.get?.(cid);
  if (!current) return "";

  const ancestors = getAncestors(cid, parentById);
  const chain = [...ancestors].reverse().map((aid) => byId.get(aid)).filter(Boolean);
  chain.push(current);

  return chain
    .map((item) => String(item?.name || "").trim())
    .filter(Boolean)
    .join(" > ");
}

function CategoryCard({ category, active, onClick, caption }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full min-w-0 rounded-3xl border p-4 text-left transition-all active:scale-[0.99]",
        active
          ? "bg-gray-900/92 text-white border-white/10 shadow-[0_18px_42px_rgba(0,0,0,0.14)]"
          : "bg-white/55 text-gray-900 border-white/30 hover:bg-white/75"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className={cn(
              "w-11 h-11 rounded-2xl border flex items-center justify-center text-xl",
              active ? "bg-white/12 border-white/12" : "bg-white/65 border-slate-900/8"
            )}
            aria-hidden="true"
          >
            {category?.icon || "🏷️"}
          </div>
          <div className="mt-3 text-sm font-black tracking-tight truncate">{category?.name || "หมวด"}</div>
          {caption ? (
            <div className={cn("mt-1 text-[11px] font-bold truncate", active ? "text-white/70" : "text-gray-900/55")}>
              {caption}
            </div>
          ) : null}
        </div>

        {active ? (
          <span className="w-8 h-8 rounded-full bg-white/14 flex items-center justify-center shrink-0">
            <Check size={15} />
          </span>
        ) : null}
      </div>
    </button>
  );
}

export default function CategoryCardPicker({
  categories = [],
  value = "",
  onChange,
  title = "หมวดหมู่",
  helper = "เลือกหมวดหลักก่อน แล้วค่อยเลือกหมวดหมู่รอง",
}) {
  const selectedId = String(value || "").trim();

  const list = useMemo(() => {
    const base = Array.isArray(categories) ? categories.filter(Boolean) : [];
    if (!selectedId) return base.filter((item) => !isDeletedCategory(item));

    const rawHierarchy = buildCategoryHierarchy(base);
    const visibleIds = new Set([selectedId, ...getAncestors(selectedId, rawHierarchy.parentById)]);

    return base.filter((item) => {
      const id = String(item?.id || "").trim();
      if (!id) return false;
      if (!isDeletedCategory(item)) return true;
      return visibleIds.has(id);
    });
  }, [categories, selectedId]);

  const hierarchy = useMemo(() => buildCategoryHierarchy(list), [list]);
  const selection = useMemo(() => splitSelection(selectedId, hierarchy), [selectedId, hierarchy]);

  const [focusedMainId, setFocusedMainId] = useState(String(selection.mainId || "").trim());
  const [stage, setStage] = useState("main");

  useEffect(() => {
    const nextMainId = String(selection.mainId || "").trim();
    if (!nextMainId) {
      setFocusedMainId("");
      setStage("main");
      return;
    }

    const children = hierarchy.childrenByParent.get(nextMainId) || [];
    setFocusedMainId(nextMainId);
    setStage(children.length ? "sub" : "main");
  }, [selection.mainId, selection.subId, hierarchy]);

  const activeMainId = String(focusedMainId || selection.mainId || "").trim();
  const selectedPath = useMemo(() => getSelectionPath(selectedId, hierarchy), [selectedId, hierarchy]);
  const selectedMain = activeMainId ? hierarchy.byId.get(activeMainId) || null : null;
  const subcategories = useMemo(() => {
    if (!activeMainId) return [];
    return hierarchy.childrenByParent.get(activeMainId) || [];
  }, [hierarchy, activeMainId]);

  const handlePickMain = (mainId) => {
    const nextMainId = String(mainId || "").trim();
    if (!nextMainId) return;

    const children = hierarchy.childrenByParent.get(nextMainId) || [];
    setFocusedMainId(nextMainId);

    if (children.length) {
      setStage("sub");
      return;
    }

    onChange?.(nextMainId);
    setStage("main");
  };

  const handleUseMain = () => {
    if (!activeMainId) return;
    onChange?.(activeMainId);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-white/45 border border-white/25 p-4">
        <div className="text-sm font-black text-gray-900">{title}</div>
        <div className="mt-1 text-[12px] font-bold text-gray-900/55">{helper}</div>
        {selectedPath ? (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-gray-900/6 border border-slate-900/8 px-3 py-2 text-xs font-extrabold text-gray-900">
            เลือกแล้ว: {selectedPath}
          </div>
        ) : null}
      </div>

      {stage === "main" ? (
        <div className="space-y-3">
          <div className="text-[11px] font-extrabold text-gray-900/55 uppercase tracking-wide">หมวดหลัก</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {hierarchy.main.map((category) => {
              const id = String(category?.id || "").trim();
              const isActive = String(selection.mainId || "") === id || activeMainId === id;
              const childCount = (hierarchy.childrenByParent.get(id) || []).length;
              const caption = childCount ? `${childCount} หมวดย่อย` : "เลือกได้ทันที";

              return (
                <CategoryCard
                  key={id}
                  category={category}
                  active={isActive && !selection.subId}
                  caption={caption}
                  onClick={() => handlePickMain(id)}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setStage("main")}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/55 border border-white/25 text-sm font-extrabold text-gray-900 active:scale-95"
            >
              <ChevronLeft size={16} />
              เปลี่ยนหมวดหลัก
            </button>

            <div className="text-right min-w-0">
              <div className="text-[11px] font-extrabold text-gray-900/55 uppercase tracking-wide">หมวดหลักที่เลือก</div>
              <div className="text-sm font-black text-gray-900 truncate">{selectedMain?.name || "-"}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleUseMain}
              className={cn(
                "w-full min-w-0 rounded-3xl border p-4 text-left transition-all active:scale-[0.99]",
                selectedId === activeMainId
                  ? "bg-gray-900/92 text-white border-white/10 shadow-[0_18px_42px_rgba(0,0,0,0.14)]"
                  : "bg-white/55 text-gray-900 border-white/30 hover:bg-white/75"
              )}
            >
              <div className="text-sm font-black">ใช้หมวดหลักนี้</div>
              <div className={cn("mt-1 text-[12px] font-bold", selectedId === activeMainId ? "text-white/70" : "text-gray-900/55")}>
                {selectedMain?.icon || "🏷️"} {selectedMain?.name || "หมวดหลัก"}
              </div>
            </button>
          </div>

          <div>
            <div className="text-[11px] font-extrabold text-gray-900/55 uppercase tracking-wide mb-3">หมวดรอง</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {subcategories.map((category) => {
                const id = String(category?.id || "").trim();
                return (
                  <CategoryCard
                    key={id}
                    category={category}
                    active={selectedId === id}
                    caption={selectedMain?.name || "หมวดย่อย"}
                    onClick={() => onChange?.(id)}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
