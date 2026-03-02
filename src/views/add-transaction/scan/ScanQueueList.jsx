import React from "react";
import { AlertTriangle, Edit2, FileText, Trash2 } from "lucide-react";

import { formatCurrency } from "../../../utils/format";
import { isAdjustmentLike } from "../../../utils/receiptAdjustments";

import ScanItemReviewModal from "./ScanItemReviewModal";

export default function ScanQueueList({
  queue,
  expandedId,
  setExpandedId,
  canCreateFromQueue,
  onCreateTransactions,
  onRemoveItem,
  onUpdateItem,
  onUpdateGroup,
  onTypeChange,
  accounts,
  nonCreditAccounts,
  expenseCatsAll,
  incomeCatsAll,
  recentCatsByType,
  recentAccountsByType,
  catIndexByType,
  merchants,
}) {
  const list = Array.isArray(queue) ? queue : [];

  if (!list.length) return null;

  return (
    <div className="mb-28">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-extrabold text-gray-900">
          Review Queue <span className="text-gray-800/50">({list.length})</span>
        </h3>

        <button
          type="button"
          onClick={onCreateTransactions}
          className={`px-4 py-2 rounded-xl font-extrabold text-sm active:scale-95 ${
            canCreateFromQueue ? "bg-indigo-600 text-white" : "bg-white/30 text-gray-700/60 border border-white/20"
          }`}
          disabled={!canCreateFromQueue}
        >
          สร้างรายการ
        </button>
      </div>

      <div className="space-y-3">
        {list.map((q) => {
          const isOpen = expandedId === q.id;
          const canEditQueueItem = q.status === "ready";
          const badge =
            q.txType === "credit_payment"
              ? "ชำระบัตร"
              : q.txType === "transfer"
              ? "Transfer"
              : q.txType === "income"
              ? "Income"
              : "Expense";

          const nonAdjGroupCount = Array.isArray(q.groups) ? q.groups.filter((g) => !isAdjustmentLike(g)).length : 0;
          const hasGroups = q.txType === "expense" && nonAdjGroupCount >= 2;

          const dupKind = q?.duplicateInfo?.kind || (q.duplicate ? "fuzzy" : "");
          const dupBadgeText = dupKind === "ref" ? "Duplicate (Ref)" : dupKind === "file" ? "Duplicate (File)" : "Possible duplicate";

          return (
            <div key={q.id} className="glass-card rounded-3xl overflow-hidden">
              <div className="p-4 flex gap-3">
                <div className="w-14 h-14 rounded-2xl overflow-hidden border border-white/15 bg-white/20 shrink-0">
                  {q.previewUrl ? (
                    <a href={q.previewUrl} target="_blank" rel="noreferrer noopener" className="block w-full h-full">
                      {q.fileKind === "pdf" ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="inline-flex flex-col items-center text-gray-900/80">
                            <FileText size={16} />
                            <span className="text-[10px] font-extrabold mt-1">PDF</span>
                          </div>
                        </div>
                      ) : (
                        <img src={q.previewUrl} alt="preview" className="w-full h-full object-cover" />
                      )}
                    </a>
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-extrabold px-2 py-1 rounded-full bg-white/30 text-gray-900 border border-white/15">
                      {badge}
                    </span>

                    {q.status === "scanning" ? (
                      <span className="text-[11px] font-extrabold px-2 py-1 rounded-full bg-indigo-500/15 text-indigo-700 border border-indigo-500/20">
                        Scanning...
                      </span>
                    ) : null}

                    {q.status === "error" ? (
                      <span className="text-[11px] font-extrabold px-2 py-1 rounded-full bg-red-500/10 text-red-700 border border-red-500/15">
                        Error
                      </span>
                    ) : null}

                    {q.duplicate ? (
                      <span className="text-[11px] font-extrabold px-2 py-1 rounded-full bg-amber-500/15 text-amber-800 inline-flex items-center gap-1 border border-amber-500/20">
                        <AlertTriangle size={12} /> {dupBadgeText}
                      </span>
                    ) : null}

                    {q.txType === "expense" && hasGroups ? (
                      <span className="text-[11px] font-extrabold px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-700 border border-emerald-500/20">
                        Multi-category
                      </span>
                    ) : null}

                    {q.suggestedCategoryId ? (
                      <span className="text-[11px] font-extrabold px-2 py-1 rounded-full bg-sky-500/15 text-sky-700 border border-sky-500/20">
                        Suggested
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 text-sm font-extrabold text-gray-900 truncate">
                    {q.amount != null
                      ? formatCurrency(q.amount)
                      : q.status === "error"
                      ? q.error
                        ? `สแกนไม่สำเร็จ (${q.error})`
                        : "สแกนไม่สำเร็จ"
                      : "กำลังประมวลผล..."}
                  </div>

                  <div className="mt-1 text-xs text-gray-800/60 truncate">
                    {q.note || q.fileName}
                    {q.ref ? <span className="ml-2 text-gray-800/50">• Ref {q.ref}</span> : null}
                  </div>

                  {q.status === "error" ? <div className="mt-2 text-xs text-red-700 break-words">{q.error}</div> : null}

                  {q.suggestedReason ? <div className="mt-1 text-[11px] text-sky-800/70 truncate">{q.suggestedReason}</div> : null}
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  <div className="flex flex-col items-center">
                    <button
                      type="button"
                      onClick={() => setExpandedId((v) => (v === q.id ? null : q.id))}
                      className={`w-11 h-11 rounded-full flex items-center justify-center leading-none transition-colors ${
                        canEditQueueItem
                          ? "glass-icon-btn text-gray-900 active:scale-95"
                          : "bg-gray-200 border border-gray-400 text-gray-700 cursor-not-allowed"
                      }`}
                      title="แก้ไข"
                      aria-label="แก้ไขรายการในคิว"
                      disabled={!canEditQueueItem}
                    >
                      <Edit2 size={18} />
                    </button>
                    <span className="mt-1 text-[10px] font-bold text-gray-700 sm:hidden">แก้ไข</span>
                  </div>

                  <div className="flex flex-col items-center">
                    <button
                      type="button"
                      onClick={() => onRemoveItem?.(q.id)}
                      className="w-11 h-11 rounded-full bg-red-500/10 border border-red-500/15 text-red-700 flex items-center justify-center active:scale-95 leading-none"
                      title="ลบจากคิว"
                      aria-label="ลบรายการจากคิว"
                    >
                      <Trash2 size={18} />
                    </button>
                    <span className="mt-1 text-[10px] font-bold text-red-700 sm:hidden">ลบ</span>
                  </div>
                </div>
              </div>

              <ScanItemReviewModal
                isOpen={isOpen && q.status === "ready"}
                q={q}
                onClose={() => setExpandedId(null)}
                onUpdateItem={(id, patch) => onUpdateItem?.(id, patch)}
                onUpdateGroup={(id, idx, patch) => onUpdateGroup?.(id, idx, patch)}
                onTypeChange={(id, nextType) => onTypeChange?.(id, nextType)}
                accounts={accounts}
                nonCreditAccounts={nonCreditAccounts}
                expenseCatsAll={expenseCatsAll}
                incomeCatsAll={incomeCatsAll}
                recentCatsByType={recentCatsByType}
                recentAccountsByType={recentAccountsByType}
                catIndexByType={catIndexByType}
                merchants={merchants}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
