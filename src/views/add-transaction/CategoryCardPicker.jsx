import React, { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";

import ModalShell from "../../components/ModalShell";
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

function PickerRow({ category, active, caption, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl border px-4 py-3 text-left transition-all active:scale-[0.99]",
        active
          ? "bg-gray-900/90 text-white border-white/12 shadow-sm"
          : "bg-white/60 text-gray-900 border-slate-900/8 hover:bg-white"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          <div
            className={cn(
              "w-10 h-10 rounded-2xl border flex items-center justify-center text-xl shrink-0",
              active ? "bg-white/12 border-white/12" : "bg-white border-slate-900/8"
            )}
            aria-hidden="true"
          >
            {category?.icon || "🏷️"}
          </div>

          <div className="min-w-0">
            <div className="text-sm font-black truncate">{category?.name || "หมวด"}</div>
            {caption ? (
              <div className={cn("text-[11px] font-bold truncate mt-0.5", active ? "text-white/70" : "text-gray-900/55")}>
                {caption}
              </div>
            ) : null}
          </div>
        </div>

        {active ? <Check size={16} className="shrink-0" /> : <ChevronRight size={16} className="shrink-0 opacity-45" />}
      </div>
    </button>
  );
}

function FieldCard({ label, value, icon, onClick, compact = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-3xl border text-left transition-all active:scale-[0.99]",
        compact ? "p-3" : "p-4",
        "bg-white/55 border-white/30 hover:bg-white/75"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          <div className={cn("rounded-2xl border flex items-center justify-center shrink-0 bg-white border-slate-900/8", compact ? "w-10 h-10 text-lg" : "w-11 h-11 text-xl")}>
            {icon || "🏷️"}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-extrabold text-gray-900/55 uppercase tracking-wide">{label}</div>
            <div className={cn("mt-1 font-black text-gray-900 truncate", compact ? "text-sm" : "text-base")}>
              {value || "ยังไม่ได้เลือก"}
            </div>
          </div>
        </div>
        <ChevronRight size={18} className="shrink-0 text-gray-900/40" />
      </div>
    </button>
  );
}

export default function CategoryCardPicker({
  categories = [],
  value = "",
  onChange,
  title = "เลือกหมวดหมู่",
  helper = "เลือกหมวดหลักก่อน แล้วค่อยเลือกหมวดหมู่รอง",
  compact = false,
}) {
  const selectedId = String(value || "").trim();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState("main");
  const [focusedMainId, setFocusedMainId] = useState("");

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
  const activeMainId = String(focusedMainId || selection.mainId || "").trim();
  const selectedPath = useMemo(() => getSelectionPath(selectedId, hierarchy), [selectedId, hierarchy]);
  const selectedMain = activeMainId ? hierarchy.byId.get(activeMainId) || null : null;
  const selectedSub = selectedId && selectedId !== activeMainId ? hierarchy.byId.get(selectedId) || null : null;
  const subcategories = useMemo(() => {
    if (!activeMainId) return [];
    return hierarchy.childrenByParent.get(activeMainId) || [];
  }, [hierarchy, activeMainId]);

  const openPicker = (nextStep) => {
    const derivedMainId = String(selection.mainId || "").trim();
    setFocusedMainId(derivedMainId);
    setStep(nextStep);
    setIsOpen(true);
  };

  const closePicker = () => {
    setIsOpen(false);
    setStep("main");
  };

  const handlePickMain = (mainId) => {
    const nextMainId = String(mainId || "").trim();
    if (!nextMainId) return;

    const children = hierarchy.childrenByParent.get(nextMainId) || [];
    setFocusedMainId(nextMainId);

    if (children.length) {
      setStep("sub");
      return;
    }

    onChange?.(nextMainId);
    closePicker();
  };

  const handleUseMain = () => {
    if (!activeMainId) return;
    onChange?.(activeMainId);
    closePicker();
  };

  const handlePickSub = (subId) => {
    onChange?.(String(subId || "").trim());
    closePicker();
  };

  const mainValue = selection.mainId ? hierarchy.byId.get(selection.mainId)?.name || "" : "";
  const subValue = selection.subId ? hierarchy.byId.get(selection.subId)?.name || "" : "";
  const hasSubcategories = !!(selection.mainId && (hierarchy.childrenByParent.get(selection.mainId) || []).length);

  return (
    <>
      <div className={cn("space-y-3", compact && "space-y-2")}>
        {!compact ? (
          <div className="rounded-3xl bg-white/45 border border-white/25 p-4">
            <div className="text-sm font-black text-gray-900">{title}</div>
            <div className="mt-1 text-[12px] font-bold text-gray-900/55">{helper}</div>
            {selectedPath ? (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-gray-900/6 border border-slate-900/8 px-3 py-2 text-xs font-extrabold text-gray-900">
                เลือกแล้ว: {selectedPath}
              </div>
            ) : null}
          </div>
        ) : null}

        <FieldCard
          label="หมวดหลัก"
          value={mainValue}
          icon={selection.mainId ? hierarchy.byId.get(selection.mainId)?.icon : "🏷️"}
          onClick={() => openPicker("main")}
          compact={compact}
        />

        {hasSubcategories ? (
          <FieldCard
            label="หมวดรอง"
            value={subValue || "ใช้หมวดหลักนี้"}
            icon={selectedSub?.icon || selectedMain?.icon || "🏷️"}
            onClick={() => openPicker("sub")}
            compact={compact}
          />
        ) : null}
      </div>

      <ModalShell
        title={step === "main" ? "เลือกหมวดหลัก" : selectedMain ? `เลือกหมวดรองใน ${selectedMain.name}` : "เลือกหมวดรอง"}
        isOpen={isOpen}
        onClose={closePicker}
        maxWidth="sm:max-w-md"
        maxHeight="max-h-[88dvh]"
      >
        {step === "main" ? (
          <div className="space-y-2">
            {hierarchy.main.map((category) => {
              const id = String(category?.id || "").trim();
              const childCount = (hierarchy.childrenByParent.get(id) || []).length;
              return (
                <PickerRow
                  key={id}
                  category={category}
                  active={selection.mainId === id && !selection.subId}
                  caption={childCount ? `${childCount} หมวดย่อย` : "เลือกได้ทันที"}
                  onClick={() => handlePickMain(id)}
                />
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setStep("main")}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/55 border border-white/25 text-sm font-extrabold text-gray-900 active:scale-95"
            >
              <ChevronLeft size={16} />
              กลับไปหมวดหลัก
            </button>

            <button
              type="button"
              onClick={handleUseMain}
              className={cn(
                "w-full rounded-2xl border px-4 py-3 text-left transition-all active:scale-[0.99]",
                selectedId === activeMainId
                  ? "bg-gray-900/90 text-white border-white/12 shadow-sm"
                  : "bg-white/60 text-gray-900 border-slate-900/8 hover:bg-white"
              )}
            >
              <div className="text-sm font-black">ใช้หมวดหลักนี้</div>
              <div className={cn("mt-1 text-[11px] font-bold", selectedId === activeMainId ? "text-white/70" : "text-gray-900/55")}>
                {selectedMain?.icon || "🏷️"} {selectedMain?.name || "-"}
              </div>
            </button>

            <div className="space-y-2">
              {subcategories.map((category) => {
                const id = String(category?.id || "").trim();
                return (
                  <PickerRow
                    key={id}
                    category={category}
                    active={selectedId === id}
                    caption={selectedMain?.name || "หมวดย่อย"}
                    onClick={() => handlePickSub(id)}
                  />
                );
              })}
            </div>
          </div>
        )}
      </ModalShell>
    </>
  );
}
