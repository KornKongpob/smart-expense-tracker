// src/components/TransactionCard.jsx
import React, { useMemo } from "react";
import { ChevronRight, ArrowRightLeft } from "lucide-react";
import { formatCurrency } from "../utils/format";

function safeDateLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso || "").slice(0, 10) || "";
  // Thai short: "21 ธ.ค."
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "short" });
}

export default function TransactionCard({ tx, category, accountName, onClick }) {
  const isIncome = tx?.type === "income";
  const isTransfer = !!tx?.isTransfer || tx?.category === "transfer";
  const amount = Number(tx?.amount || 0) || 0;

  const sign = isIncome ? "+" : "-";
  const tone = isIncome ? "text-emerald-700" : "text-red-600";
  const badge = isTransfer ? "Transfer" : isIncome ? "Income" : "Expense";

  const dateLabel = useMemo(() => safeDateLabel(tx?.date), [tx?.date]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white rounded-3xl border border-gray-100 shadow-sm p-4 active:scale-[0.99]"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0"
          style={{ backgroundColor: `${category?.color || "#E5E7EB"}20` }}
        >
          {isTransfer ? "🔁" : category?.icon || "🧾"}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-extrabold text-gray-900 truncate">
                {isTransfer ? (
                  <span className="inline-flex items-center gap-2">
                    <ArrowRightLeft size={16} className="text-indigo-600" />
                    {category?.name || "Transfer"}
                  </span>
                ) : (
                  category?.name || "ไม่ระบุ"
                )}
              </div>

              <div className="text-xs text-gray-500 mt-1 truncate">
                {tx?.note || "—"}
                {tx?.ref ? <span className="ml-2 text-gray-400">• Ref {tx.ref}</span> : null}
              </div>

              <div className="text-[11px] text-gray-400 mt-1 truncate">
                {dateLabel}
                {accountName ? <span className="ml-2">• {accountName}</span> : null}
                <span className="ml-2">• {badge}</span>
              </div>
            </div>

            <div className="shrink-0 text-right">
              <div className={`text-base font-extrabold ${tone}`}>
                {sign}
                {formatCurrency(amount)}
              </div>
              <div className="mt-1 inline-flex items-center gap-1 text-gray-300">
                <ChevronRight size={18} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
