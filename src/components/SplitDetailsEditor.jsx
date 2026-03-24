import React, { useMemo, useState } from "react";
import { FileText, Percent, Tag, Sparkles, Wand2, RotateCcw } from "lucide-react";

import CategorySelect from "./CategorySelect";
import { formatCurrency } from "../utils/format";
import { parseMoneyToSatang, formatMoneyInputFromSatang, sanitizeMoneyInput } from "../utils/money";
import { isAdjustmentLike, signedReceiptGroupSatang } from "../utils/receiptAdjustments";
import { inferCategoryKeyFromText } from "../utils/receiptCategorizer";

function adjustmentLabel(g) {
  const eff = String(g?.adjustmentEffect || "").toLowerCase().trim();
  const t = String(g?.adjustmentType || "").toLowerCase().trim();
  if (t === "discount" || eff === "subtract") return "Discount";
  if (t) return t.replace(/_/g, " ");
  return eff === "subtract" ? "Discount" : "Adjustment";
}

function safeId(v) {
  return String(v || "").trim();
}

function buildCategoryIndex(categories) {
  const list = Array.isArray(categories) ? categories : [];
  const byId = new Map();
  for (const c of list) {
    const id = safeId(c?.id);
    if (!id) continue;
    byId.set(id, c);
  }
  return { byId, ids: new Set(Array.from(byId.keys())) };
}

function resolveAdjustmentCategoryId(g, categoryIds) {
  const eff = String(g?.adjustmentEffect || "").toLowerCase().trim();
  const t = String(g?.adjustmentType || "").toLowerCase().trim();
  const wantsDiscount = t === "discount" || eff === "subtract";
  if (wantsDiscount && categoryIds.has("discount")) return "discount";
  if (categoryIds.has("fees")) return "fees";
  return wantsDiscount ? "discount" : "fees";
}

/**
 * SplitDetailsEditor (shared)
 * - Used in Scan Review & Inbox Review when receipt contains multiple purchasable lines.
 * - Allows tagging each line to a category + editing per-line amount.
 *
 * Props:
 * - groups: [{ note/name/title, amount (satang), categoryId, ... }]
 * - categories: expense categories list
 * - parentCategoryId: optional "default" category for empty lines
 * - onChangeGroup(idx, patch): patch single line
 * - onChangeGroups(nextGroups): optional bulk update (preferred for perf)
 * - targetTotalSatang: optional, show mismatch hint
 */
export default function SplitDetailsEditor({
  qid,
  groups = [],
  categories = [],
  parentCategoryId = "",
  onChangeGroup,
  onChangeGroups,
  onChangeParentCategory,
  targetTotalSatang = null,
  compact = false,
}) {
  const list = useMemo(() => (Array.isArray(groups) ? groups : []), [groups]);

  const { byId: catById, ids: categoryIds } = useMemo(() => buildCategoryIndex(categories), [categories]);

  const sums = useMemo(() => {
    const net = list.reduce((s, g) => s + signedReceiptGroupSatang(g), 0);
    const items = list.filter((g) => !isAdjustmentLike(g));
    const adjustments = list.filter((g) => isAdjustmentLike(g));
    return {
      net,
      itemsCount: items.length,
      adjustmentCount: adjustments.length,
    };
  }, [list]);

  const target = Number.isFinite(Number(targetTotalSatang)) ? Math.round(Number(targetTotalSatang)) : null;
  const diff = target != null ? target - sums.net : null;
  const diffAbs = diff != null ? Math.abs(diff) : null;
  const diffOk = diffAbs == null ? true : diffAbs <= 1;

  const [overwriteAuto, setOverwriteAuto] = useState(false);

  const bulkApply = (updates) => {
    const arr = Array.isArray(updates) ? updates : [];
    if (!arr.length) return;

    if (typeof onChangeGroups === "function") {
      const next = list.slice();
      for (const u of arr) {
        const idx = Number(u?.idx);
        if (!Number.isFinite(idx) || !next[idx]) continue;
        next[idx] = { ...next[idx], ...(u?.patch || {}) };
      }
      onChangeGroups(next);
      return;
    }

    // Fallback: patch one-by-one
    for (const u of arr) {
      const idx = Number(u?.idx);
      if (!Number.isFinite(idx) || !list[idx]) continue;
      onChangeGroup?.(idx, u?.patch || {});
    }
  };

  const suggestCategoryId = (g) => {
    const text = String(g?.note || g?.name || g?.title || "").trim();
    if (!text) return "";
    const key = inferCategoryKeyFromText("expense", text);
    const id = safeId(key);
    if (id && categoryIds.has(id)) return id;
    return "";
  };

  const onAutoCategorize = () => {
    const updates = [];
    for (let idx = 0; idx < list.length; idx++) {
      const g = list[idx];
      if (!g) continue;

      const isAdj = isAdjustmentLike(g);
      const cur = safeId(g?.categoryId) || safeId(parentCategoryId);

      if (isAdj) {
        const desired = resolveAdjustmentCategoryId(g, categoryIds);
        if (desired && (overwriteAuto || !safeId(g?.categoryId))) {
          if (safeId(g?.categoryId) !== desired) updates.push({ idx, patch: { categoryId: desired } });
        }
        continue;
      }

      if (!overwriteAuto && safeId(g?.categoryId)) continue;

      const suggested = suggestCategoryId(g);
      if (suggested && cur !== suggested) {
        updates.push({ idx, patch: { categoryId: suggested } });
      } else if (!safeId(g?.categoryId) && safeId(parentCategoryId)) {
        // Fill blanks with parent default as a fallback
        updates.push({ idx, patch: { categoryId: safeId(parentCategoryId) } });
      }
    }

    bulkApply(updates);
  };

  const onClearCategories = () => {
    const updates = [];
    for (let idx = 0; idx < list.length; idx++) {
      const g = list[idx];
      if (!g) continue;
      if (safeId(g?.categoryId)) updates.push({ idx, patch: { categoryId: "" } });
    }
    bulkApply(updates);
  };

  const emptyText = list.length ? null : (
    <div className="text-[12px] text-gray-900/55">ยังไม่พบรายการย่อยจากใบเสร็จ</div>
  );

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="glass-panel border border-white/20 rounded-2xl p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-extrabold text-gray-900/75 flex items-center gap-2">
              <Tag size={14} /> Split details
            </div>
            <div className="text-[11px] text-gray-900/55 mt-1">
              ใบเสร็จนี้มีหลายรายการ — เลือกหมวดให้แต่ละบรรทัด (ส่วนลด/ค่าธรรมเนียมจะไม่ถูกนับเป็น “สินค้า”)
            </div>
          </div>

          <div className="shrink-0 text-right">
            <div className="text-[11px] font-extrabold text-gray-900/70">รวมสุทธิ</div>
            <div className="text-sm font-black text-gray-900">{formatCurrency(Math.abs(sums.net))}</div>
            <div className="text-[10px] text-gray-900/55">
              {sums.itemsCount} รายการ • {sums.adjustmentCount} ปรับยอด
            </div>
          </div>
        </div>

        {target != null ? (
          <div className={`mt-3 rounded-2xl border p-3 ${diffOk ? "bg-emerald-500/10 border-emerald-500/15" : "bg-amber-500/10 border-amber-500/15"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold text-gray-900/75 flex items-center gap-2">
                  <Sparkles size={12} />
                  ตรวจยอดรวม
                </div>
                <div className="text-[11px] text-gray-900/55">
                  เป้าหมาย: {formatCurrency(Math.abs(target))} • ต่าง:{" "}
                  <span className={diffOk ? "text-emerald-700 font-extrabold" : "text-amber-800 font-extrabold"}>
                    {formatCurrency(Math.abs(diff || 0))}
                  </span>
                </div>
              </div>
              <div className="text-[10px] text-gray-900/50">
                {diffOk ? "✅ ใกล้เคียง" : "⚠️ ตรวจสอบบรรทัด"}
              </div>
            </div>
          </div>
        ) : null}

        {onChangeParentCategory ? (
          <div className="mt-3">
            <div className="text-[11px] font-extrabold text-gray-900/70 mb-1">หมวดหลัก (ใช้เป็นค่าเริ่มต้น)</div>
            <CategorySelect
              categories={categories}
              value={safeId(parentCategoryId)}
              onChange={(e) => onChangeParentCategory(safeId(e?.target?.value))}
              className="ui-select w-full"
            />
          </div>
        ) : null}

        {/* Bulk tools */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 mt-3 no-scrollbar">
          <button
            type="button"
            onClick={onAutoCategorize}
            className="px-3 py-2 rounded-xl text-[11px] font-extrabold bg-indigo-600/10 border border-indigo-600/15 text-indigo-700 active:scale-95 inline-flex items-center gap-2"
            title="ใช้ AI/Rules เดาหมวดให้ทุกบรรทัด"
          >
            <Wand2 size={14} />
            Auto Suggest
          </button>

          <button
            type="button"
            onClick={() => setOverwriteAuto((v) => !v)}
            className={`px-3 py-2 rounded-xl text-[11px] font-extrabold border active:scale-95 ${
              overwriteAuto ? "bg-gray-900/90 text-white border-white/15" : "bg-white/10 text-gray-900/65 border-white/10"
            }`}
            title="ถ้าเปิด: Auto จะเขียนทับหมวดเดิมด้วย"
          >
            {overwriteAuto ? "Overwrite: ON" : "Overwrite: OFF"}
          </button>

          <button
            type="button"
            onClick={onClearCategories}
            className="px-3 py-2 rounded-xl text-[11px] font-extrabold bg-white/10 border border-white/10 text-gray-900/60 active:scale-95 inline-flex items-center gap-2"
            title="ล้างหมวดของทุกบรรทัด"
          >
            <RotateCcw size={14} />
            Clear
          </button>
        </div>
      </div>

      {emptyText}

      <div className="space-y-2">
        {list.map((g, idx) => {
          const isAdj = isAdjustmentLike(g);
          const label = isAdj ? adjustmentLabel(g) : "Item";
          const badgeIcon = isAdj
            ? label.toLowerCase().includes("discount")
              ? <Percent size={12} />
              : <FileText size={12} />
            : <FileText size={12} />;

          const badgeColor = isAdj
            ? label.toLowerCase().includes("discount")
              ? "bg-amber-500/15 text-amber-800 border-amber-500/20"
              : "bg-slate-500/10 text-slate-800 border-slate-500/15"
            : "bg-emerald-500/15 text-emerald-700 border-emerald-500/20";

          const name = String(g?.note || g?.name || "").trim() || "(ไม่มีชื่อรายการ)";
          const effectiveCategoryId = safeId(g?.categoryId);

          const suggestedId = !isAdj ? suggestCategoryId(g) : resolveAdjustmentCategoryId(g, categoryIds);
          const suggestedCat = suggestedId ? catById.get(suggestedId) : null;

          const isCategoryMissing = !effectiveCategoryId;

          return (
            <div key={`${qid || "q"}-${idx}`} className={`glass-panel border rounded-2xl p-3 ${isCategoryMissing ? "border-red-400/50 bg-red-50/30" : "border-white/20"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-extrabold border ${badgeColor}`}>
                    {badgeIcon}
                    <span>{label}</span>
                  </div>

                  <div className="mt-2 text-sm font-extrabold text-gray-900 break-words">{name}</div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-[11px] font-extrabold text-gray-900/70">ยอด</div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={g?.amount != null ? formatMoneyInputFromSatang(Math.abs(Number(g.amount) || 0)) : ""}
                    onChange={(e) => {
                      const cleaned = sanitizeMoneyInput(e.target.value);
                      onChangeGroup?.(idx, { amount: parseMoneyToSatang(cleaned) });
                    }}
                    className="w-24 text-right outline-none text-sm font-black text-gray-900 bg-transparent"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="mt-3">
                <div className="text-[11px] font-extrabold mb-1 flex items-center justify-between">
                  <span className={isCategoryMissing ? "text-red-600" : "text-gray-900/70"}>
                    {isCategoryMissing ? "⚠️ ต้องเลือกหมวดหมู่" : "หมวดหมู่"}
                  </span>
                </div>
                <CategorySelect
                  categories={categories}
                  value={effectiveCategoryId}
                  onChange={(e) => onChangeGroup?.(idx, { categoryId: safeId(e?.target?.value) })}
                  className={`ui-select w-full ${isCategoryMissing ? "border-red-300 bg-red-50/50" : ""}`}
                />

                {/* Per-line quick chips */}
                <div className="mt-2 flex flex-wrap gap-2">
                  {suggestedCat && suggestedId !== effectiveCategoryId ? (
                    <button
                      type="button"
                      onClick={() => onChangeGroup?.(idx, { categoryId: suggestedId })}
                      className="px-2 py-1 rounded-full text-[10px] font-extrabold bg-indigo-500/15 text-indigo-800 border border-indigo-500/20 active:scale-95"
                      title="แนะนำจากข้อความในบรรทัด"
                    >
                      แนะนำ: {suggestedCat.icon || "🏷️"} {suggestedCat.name}
                    </button>
                  ) : null}

                  {parentCategoryId && safeId(parentCategoryId) !== effectiveCategoryId ? (
                    <button
                      type="button"
                      onClick={() => onChangeGroup?.(idx, { categoryId: safeId(parentCategoryId) })}
                      className="px-2 py-1 rounded-full text-[10px] font-extrabold bg-white/15 text-gray-900/70 border border-white/15 active:scale-95"
                      title="ใช้หมวดหลัก"
                    >
                      หมวดหลัก: {catById.get(safeId(parentCategoryId))?.icon || "🏷️"} {catById.get(safeId(parentCategoryId))?.name || "ตามหมวดหลัก"}
                    </button>
                  ) : null}
                </div>

                {isAdj ? (
                  <div className="mt-1 text-[10px] text-gray-900/55">บรรทัดปรับยอดจะไม่ถูกนับเป็น “สินค้า”</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
