// src/components/TransactionCard.jsx
import React, { useMemo } from "react";
import { ChevronRight, ArrowRightLeft } from "lucide-react";
import { formatCurrency } from "../utils/format";

/**
 * ✅ Date label ที่ปลอดภัยกว่าเดิม
 * - รองรับทั้ง ISO (YYYY-MM-DD) / datetime string
 * - ถ้า parse ไม่ได้ จะ fallback เป็นตัด 10 ตัวอักษรแรก (YYYY-MM-DD)
 */
function safeDateLabel(isoLike) {
  const raw = String(isoLike || "").trim();
  if (!raw) return "";

  // ถ้าเป็น YYYY-MM-DD อยู่แล้ว ใช้ได้เลย
  const short = raw.slice(0, 10);
  const d = new Date(raw);

  if (Number.isNaN(d.getTime())) return short || raw;
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "short" });
}

/**
 * ✅ TransactionCard (Glassmorphism + UX polish)
 * สิ่งที่ปรับ:
 * 1) คลิกง่ายขึ้น: เพิ่ม focus ring / hover / active feedback
 * 2) ป้องกันข้อมูลแปลก: จำนวนเงินติดลบหรือเป็น NaN จะ normalize
 * 3) Transfer logic: ทำให้ consistent (ใช้ isTransfer ก่อน, แล้วค่อยดู type)
 * 4) Icon bubble: ให้ gradient + ขอบกระจก เนียนขึ้น + สีตามหมวด
 * 5) Badge: โทนชัด และแยก Transfer/Income/Expense ให้สื่อความหมาย
 */
export default function TransactionCard({ tx, category, accountName, onClick }) {
  const type = String(tx?.type || "expense");
  const isTransfer = !!tx?.isTransfer || tx?.category === "transfer";

  // ✅ สำหรับ transfer ให้ถือว่าไม่ใช่ income/expense ปกติ (เพื่อ UI ไม่สับสน)
  const isIncome = !isTransfer && type === "income";

  // ✅ normalize amount
  const amountRaw = Number(tx?.amount);
  const amount = Number.isFinite(amountRaw) ? Math.abs(amountRaw) : 0;

  // ✅ Sign/tone/badge based on final interpretation
  const sign = isTransfer ? "" : isIncome ? "+" : "-";
  const tone = isTransfer ? "text-indigo-700" : isIncome ? "text-emerald-700" : "text-red-600";
  const badge = isTransfer ? "Transfer" : isIncome ? "Income" : "Expense";

  const dateLabel = useMemo(() => safeDateLabel(tx?.date), [tx?.date]);

  const badgeClass = isTransfer
    ? "bg-indigo-500/15 text-indigo-800 border-indigo-200/40"
    : isIncome
    ? "bg-emerald-500/15 text-emerald-800 border-emerald-200/40"
    : "bg-red-500/15 text-red-700 border-red-200/40";

  // ✅ icon bubble background hint
  const catColor = String(category?.color || "#E5E7EB");
  const iconBg = `${catColor}20`; // 12.5% alpha-ish

  const title = isTransfer ? category?.name || "Transfer" : category?.name || "ไม่ระบุ";
  const note = String(tx?.note || "").trim() || "—";
  const ref = tx?.ref ? String(tx.ref).trim() : "";

  return (
    <button
      type="button"
      onClick={onClick}
      className="
        w-full text-left
        rounded-3xl
        bg-white/20
        backdrop-blur-2xl
        border border-white/28
        shadow-[0_10px_28px_-18px_rgba(0,0,0,0.35)]
        p-4
        transition-all
        active:scale-[0.99]
        hover:bg-white/24
        focus:outline-none
        focus:ring-4 focus:ring-indigo-300/35
      "
      aria-label={`transaction ${title}`}
    >
      <div className="flex items-center gap-3">
        {/* Icon bubble */}
        <div
          className="
            w-12 h-12 rounded-2xl shrink-0
            flex items-center justify-center text-xl
            bg-white/22
            border border-white/30
            shadow-sm
            relative overflow-hidden
          "
          style={{ backgroundColor: iconBg }}
        >
          {/* subtle highlight */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/25 via-white/10 to-white/0" />

          <div className="relative">
            {isTransfer ? "🔁" : category?.icon || "🧾"}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            {/* Left */}
            <div className="min-w-0">
              <div className="font-extrabold text-gray-900 truncate flex items-center gap-2">
                {isTransfer ? (
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-500/15 border border-indigo-200/40 shrink-0">
                      <ArrowRightLeft size={14} className="text-indigo-700" />
                    </span>
                    <span className="truncate">{title}</span>
                  </span>
                ) : (
                  <span className="truncate">{title}</span>
                )}
              </div>

              <div className="text-xs text-gray-700/70 mt-1 truncate">
                {note}
                {ref ? <span className="ml-2 text-gray-500/70">• Ref {ref}</span> : null}
              </div>

              <div className="mt-2 flex items-center gap-2 min-w-0 flex-wrap">
                <span className="text-[11px] text-gray-700/55 font-bold">{dateLabel}</span>

                {accountName ? (
                  <span className="text-[11px] text-gray-700/55 font-bold truncate">• {accountName}</span>
                ) : null}

                <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full border ${badgeClass}`}>
                  {badge}
                </span>
              </div>
            </div>

            {/* Right */}
            <div className="shrink-0 text-right">
              <div className={`text-base font-extrabold ${tone}`}>
                {sign}
                {formatCurrency(amount)}
              </div>

              <div className="mt-1 inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/20 border border-white/28 text-gray-700/40">
                <ChevronRight size={18} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ Optional: micro-divider (ช่วยแยก card ใน list) */}
      <div className="mt-3 h-px bg-white/10" />
    </button>
  );
}
