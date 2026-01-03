// src/components/AmountField.jsx
import React, { useId, useMemo } from "react";
import { TrendingDown, TrendingUp, ArrowRightLeft } from "lucide-react";
import { formatCurrency } from "../utils/format";
import { parseMoneyToSatang, sanitizeMoneyInput } from "../utils/money";

export default function AmountField({
  value,
  onChange,
  variant = "expense", // expense | income | transfer
  label = "จำนวนเงิน",
  helper = "",
  disabled = false,
}) {
  const inputId = useId();

  const satang = useMemo(() => parseMoneyToSatang(value), [value]);

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

  const chipLabel = variant === "income" ? "INCOME" : variant === "transfer" ? "TRANSFER" : "EXPENSE";

  return (
    <section className="glass-card rounded-3xl p-5 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={inputId} className="text-xs font-bold text-gray-900/55 uppercase">
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
        <div className={["text-3xl font-extrabold text-gray-900 mt-1 drop-shadow-sm", meta.glow].join(" ")}>{
          formatCurrency(Math.abs(satang))
        }</div>
      </div>

      {/* Input */}
      <div className="mt-5">
        <div className="text-[11px] text-gray-900/55 font-bold">กรอกตัวเลข</div>

        <input
          id={inputId}
          value={value ?? ""}
          onChange={(e) => {
            if (disabled) return;
            const cleaned = sanitizeMoneyInput(e.target.value, { maxDecimals: 2 });
            onChange?.(cleaned);
          }}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          disabled={disabled}
          aria-label={label}
          className={[
            "w-full mt-2 rounded-2xl px-4 py-4 outline-none text-lg font-extrabold text-gray-900",
            "bg-white/30 border border-white/20 shadow-sm",
            "placeholder:text-gray-900/35",
            disabled ? "opacity-60 cursor-not-allowed" : "",
            "focus:bg-white/40",
            "focus-visible:ring-4",
            meta.inputRing,
            meta.inputBorder,
          ].join(" ")}
          placeholder="เช่น 1200.50"
        />

        <div className="mt-2 text-[11px] text-gray-900/55">
          * ใส่ได้ถึง 2 ตำแหน่งทศนิยม (สตางค์)
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
