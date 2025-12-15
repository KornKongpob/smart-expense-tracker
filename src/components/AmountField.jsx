// src/components/AmountField.jsx
import React, { useMemo, useRef } from "react";
import { X, Plus } from "lucide-react";

const nf = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });

function sanitizeDigits(value = "") {
  // keep digits only
  const s = String(value).replace(/[^\d]/g, "");
  // prevent insanely long input
  return s.slice(0, 12);
}

function toNumberSafe(s) {
  const n = Number(String(s || "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default function AmountField({
  value, // string digits
  onChange, // (nextStringDigits) => void
  variant = "expense", // "expense" | "income" | "transfer"
  label = "จำนวนเงิน",
  helper, // optional small helper text
}) {
  const inputRef = useRef(null);

  const colorClass =
    variant === "transfer"
      ? "text-indigo-600"
      : variant === "income"
      ? "text-green-500"
      : "text-red-500";

  const topBar =
    variant === "transfer" ? "bg-indigo-600" : variant === "income" ? "bg-green-500" : "bg-red-500";

  const amountNum = useMemo(() => toNumberSafe(value), [value]);
  const pretty = useMemo(() => (amountNum > 0 ? nf.format(amountNum) : "0"), [amountNum]);

  const set = (next) => onChange?.(sanitizeDigits(next));

  const quickAdds = [20, 50, 100, 500, 1000];

  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm mb-6 text-center border border-gray-100 relative overflow-hidden">
      <div className={`absolute top-0 left-0 w-full h-1 ${topBar}`} />

      <div className="flex items-center justify-center gap-2">
        <label className="text-gray-400 text-xs font-bold uppercase tracking-wide">{label}</label>
        <span className="text-[10px] px-2 py-1 rounded-full bg-gray-100 text-gray-500 font-bold">THB</span>
      </div>

      {/* Big input */}
      <div className="mt-4">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="done"
          value={value}
          onChange={(e) => set(e.target.value)}
          placeholder="0"
          className={`w-full text-center outline-none bg-transparent placeholder-gray-200 font-extrabold ${colorClass}`}
          style={{ fontSize: "56px", lineHeight: "1.05" }}
        />
      </div>

      {/* Formatted preview */}
      <div className="mt-2 text-xs text-gray-400">
        แสดงผล: <span className="font-bold text-gray-700">฿{pretty}</span>
        {helper ? <span className="ml-2">{helper}</span> : null}
      </div>

      {/* Quick actions */}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {quickAdds.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              const next = toNumberSafe(value) + n;
              set(String(next));
              inputRef.current?.focus();
            }}
            className="px-3 py-2 rounded-2xl bg-gray-100 text-gray-700 font-bold text-xs hover:bg-gray-200 active:scale-95 transition"
          >
            <span className="inline-flex items-center gap-1">
              <Plus size={14} />
              {nf.format(n)}
            </span>
          </button>
        ))}

        <button
          type="button"
          onClick={() => {
            set("");
            inputRef.current?.focus();
          }}
          className="px-3 py-2 rounded-2xl bg-red-50 text-red-600 font-bold text-xs hover:bg-red-100 active:scale-95 transition"
          aria-label="Clear amount"
        >
          <span className="inline-flex items-center gap-1">
            <X size={14} />
            ล้าง
          </span>
        </button>
      </div>

      {/* Small UX tip */}
      <div className="mt-4 text-[11px] text-gray-400">
        พิมพ์ได้เฉพาะตัวเลข • ระบบจะจัดรูปแบบให้เอง
      </div>
    </div>
  );
}
