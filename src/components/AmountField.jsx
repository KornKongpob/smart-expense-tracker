// src/components/AmountField.jsx
import React, { useMemo } from "react";
import { TrendingDown, TrendingUp, ArrowRightLeft } from "lucide-react";
import { formatCurrency } from "../utils/format";

const digitsOnly = (s) => String(s || "").replace(/[^\d]/g, "");

export default function AmountField({ value, onChange, variant = "expense", label = "จำนวนเงิน", helper = "" }) {
  const digits = useMemo(() => digitsOnly(value || ""), [value]);
  const amount = useMemo(() => Number(digits || 0) || 0, [digits]);

  const meta = useMemo(() => {
    if (variant === "income") return { icon: <TrendingUp size={16} />, tone: "text-emerald-700", bg: "bg-emerald-50" };
    if (variant === "transfer") return { icon: <ArrowRightLeft size={16} />, tone: "text-indigo-700", bg: "bg-indigo-50" };
    return { icon: <TrendingDown size={16} />, tone: "text-red-700", bg: "bg-red-50" };
  }, [variant]);

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 mb-6">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-bold text-gray-400 uppercase">{label}</div>
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-extrabold ${meta.bg} ${meta.tone}`}>
          {meta.icon}
          {variant === "income" ? "INCOME" : variant === "transfer" ? "TRANSFER" : "EXPENSE"}
        </div>
      </div>

      <div className="mt-3">
        <div className="text-[11px] text-gray-400 font-bold">แสดงผล</div>
        <div className="text-3xl font-extrabold text-gray-900 mt-1">
          {formatCurrency(amount)}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-[11px] text-gray-400 font-bold">กรอกตัวเลข</div>
        <input
          value={digits}
          onChange={(e) => onChange?.(digitsOnly(e.target.value))}
          inputMode="numeric"
          pattern="[0-9]*"
          className="w-full mt-2 border border-gray-200 rounded-2xl px-4 py-4 outline-none focus:border-gray-900 text-lg font-extrabold text-gray-900"
          placeholder="เช่น 1200"
        />
        <div className="mt-2 text-[11px] text-gray-400">
          * ระบบจะรับเฉพาะตัวเลข (ไม่ต้องใส่ , หรือ .)
        </div>

        {helper ? (
          <div className="mt-3 text-[12px] font-extrabold text-gray-700 bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3">
            {helper}
          </div>
        ) : null}
      </div>
    </div>
  );
}
