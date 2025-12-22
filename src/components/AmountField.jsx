// src/components/AmountField.jsx
import React, { useId, useMemo } from "react";
import { TrendingDown, TrendingUp, ArrowRightLeft } from "lucide-react";
import { formatCurrency } from "../utils/format";

const digitsOnly = (s) => String(s ?? "").replace(/[^\d]/g, "");

export default function AmountField({
  value,
  onChange,
  variant = "expense", // expense | income | transfer
  label = "จำนวนเงิน",
  helper = "",
}) {
  const inputId = useId();

  // ✅ keep input as digits-only string (controlled)
  const digits = useMemo(() => digitsOnly(value), [value]);
  const amount = useMemo(() => Number(digits || 0) || 0, [digits]);

  const meta = useMemo(() => {
    if (variant === "income") {
      return {
        icon: <TrendingUp size={16} />,
        chipBg: "bg-emerald-500/12",
        chipText: "text-emerald-800",
        chipBorder: "border-emerald-500/20",
        glow: "shadow-emerald-200/40",
        inputRing: "focus-visible:ring-emerald-300/40",
        inputBorder: "focus:border-emerald-700/50",
      };
    }
    if (variant === "transfer") {
      return {
        icon: <ArrowRightLeft size={16} />,
        chipBg: "bg-indigo-500/12",
        chipText: "text-indigo-800",
        chipBorder: "border-indigo-500/20",
        glow: "shadow-indigo-200/40",
        inputRing: "focus-visible:ring-indigo-300/40",
        inputBorder: "focus:border-indigo-700/50",
      };
    }
    return {
      icon: <TrendingDown size={16} />,
      chipBg: "bg-red-500/10",
      chipText: "text-red-800",
      chipBorder: "border-red-500/15",
      glow: "shadow-red-200/40",
      inputRing: "focus-visible:ring-red-300/40",
      inputBorder: "focus:border-red-700/40",
    };
  }, [variant]);

  const chipLabel =
    variant === "income" ? "INCOME" : variant === "transfer" ? "TRANSFER" : "EXPENSE";

  return (
    <section className="glass-card rounded-3xl p-5 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor={inputId}
          className="text-xs font-bold text-gray-900/55 uppercase"
        >
          {label}
        </label>

        <div
          className={[
            "inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-extrabold border",
            meta.chipBg,
            meta.chipText,
            meta.chipBorder,
          ].join(" ")}
          aria-label={`type ${chipLabel}`}
        >
          {meta.icon}
          {chipLabel}
        </div>
      </div>

      {/* Preview */}
      <div className="mt-4">
        <div className="text-[11px] text-gray-900/55 font-bold">แสดงผล</div>
        <div
          className={[
            "text-3xl font-extrabold text-gray-900 mt-1 drop-shadow-sm",
            meta.glow,
          ].join(" ")}
        >
          {formatCurrency(amount)}
        </div>
      </div>

      {/* Input */}
      <div className="mt-5">
        <div className="text-[11px] text-gray-900/55 font-bold">กรอกตัวเลข</div>

        <input
          id={inputId}
          value={digits}
          onChange={(e) => onChange?.(digitsOnly(e.target.value))}
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          enterKeyHint="done"
          aria-label={label}
          className={[
            "w-full mt-2 rounded-2xl px-4 py-4 outline-none text-lg font-extrabold text-gray-900",
            "bg-white/30 border border-white/20 shadow-sm",
            "placeholder:text-gray-900/35",
            "focus:bg-white/40",
            "focus-visible:ring-4",
            meta.inputRing,
            meta.inputBorder,
          ].join(" ")}
          placeholder="เช่น 1200"
        />

        <div className="mt-2 text-[11px] text-gray-900/55">
          * ระบบจะรับเฉพาะตัวเลข (ไม่ต้องใส่ , หรือ .)
        </div>

        {helper ? (
          <div className="mt-3 text-[12px] font-extrabold text-gray-900/80 bg-white/25 border border-white/20 rounded-2xl px-4 py-3">
            {helper}
          </div>
        ) : null}
      </div>
    </section>
  );
}
