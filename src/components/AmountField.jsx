// src/components/AmountField.jsx
import React, { useId, useMemo } from "react";
import { TrendingDown, TrendingUp, ArrowRightLeft } from "lucide-react";
import { formatCurrency } from "../utils/format";
import { parseMoneyToSatang, sanitizeMoneyInput } from "../utils/money";

/**
 * AmountField
 * - Pure UI helper for entering money (does not change business logic)
 * - Keeps touch targets ≥ 44px and strong visual hierarchy
 */
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
        chipBg: "bg-emerald-500/10",
        chipText: "text-emerald-800",
        chipBorder: "border-emerald-500/15",
        glow: "shadow-emerald-200/35",
        inputRing: "focus-visible:ring-emerald-300/40",
        inputBorder: "focus:border-emerald-700/50",
      };
    }
    if (variant === "transfer") {
      return {
        icon: <ArrowRightLeft size={16} />,
        chipBg: "bg-indigo-500/10",
        chipText: "text-indigo-800",
        chipBorder: "border-indigo-500/15",
        glow: "shadow-indigo-200/35",
        inputRing: "focus-visible:ring-indigo-300/40",
        inputBorder: "focus:border-indigo-700/50",
      };
    }
    return {
      icon: <TrendingDown size={16} />,
      chipBg: "bg-red-500/10",
      chipText: "text-red-800",
      chipBorder: "border-red-500/15",
      glow: "shadow-red-200/35",
      inputRing: "focus-visible:ring-red-300/40",
      inputBorder: "focus:border-red-700/40",
    };
  }, [variant]);

  const chipLabel =
    variant === "income" ? "รายรับ" : variant === "transfer" ? "โอนเงิน" : "รายจ่าย";

  return (
    <section className="ui-card p-5 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={inputId} className="ui-label">
          {label}
        </label>

        <div
          className={[
            "inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-extrabold border",
            meta.chipBg,
            meta.chipText,
            meta.chipBorder,
          ].join(" ")}
          aria-label={chipLabel}
        >
          {meta.icon}
          <span>{chipLabel}</span>
        </div>
      </div>

      {/* Preview */}
      <div className="mt-4">
        <div className="ui-help">แสดงผล</div>
        <div
          className={[
            "text-3xl font-extrabold tabular-nums text-gray-900 mt-1 drop-shadow-sm",
            meta.glow,
          ].join(" ")}
        >
          {formatCurrency(Math.abs(satang))}
        </div>
      </div>

      {/* Input */}
      <div className="mt-5">
        <div className="ui-help">กรอกตัวเลข</div>

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
            "ui-input mt-2 text-lg font-extrabold tabular-nums",
            "placeholder:text-gray-900/35",
            disabled ? "opacity-60 cursor-not-allowed" : "",
            "focus-visible:ring-4",
            meta.inputRing,
            meta.inputBorder,
          ].join(" ")}
          placeholder="เช่น 1200.50"
        />

        <div className="mt-2 ui-help">ใส่ได้ถึง 2 ตำแหน่งทศนิยม (สตางค์)</div>

        {helper ? (
          <div className="mt-3 ui-card-strong p-4 text-[12px] font-extrabold text-gray-900/85">
            {helper}
          </div>
        ) : null}
      </div>
    </section>
  );
}
