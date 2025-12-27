// src/components/TransactionCard.jsx
import React, { useMemo } from "react";
import { ArrowRightLeft, ChevronRight, CreditCard } from "lucide-react";
import { isCreditAccount, getAccountLastDigits } from "../utils/accountMatch";
import { useAppStore } from "../store/store";
import { formatCurrency, formatDateShort } from "../utils/format";

// ---------- small helpers ----------
const digitsOnly = (s) => String(s || "").replace(/[^\d]/g, "");

function safeDateLabel(d) {
  try {
    return formatDateShort(d);
  } catch {
    return String(d || "");
  }
}


function accountHint(acc) {
  if (!acc) return "";
  const d =
    String(acc?.digits || "").trim() ||
    digitsOnly(acc?.accountNumber || acc?.number || "").slice(-4);
  return d ? `•••• ${d}` : "";
}

export default function TransactionCard({ tx, category, accountName, onClick }) {
  const store = useAppStore();
  const { state } = store;

  const accounts = state.accounts || [];
  const allTx = state.transactions || [];

  const isTransfer = !!tx?.isTransfer;

  // หา pair ของ transfer (2 legs) เพื่อแสดงครั้งเดียว + แสดง from → to
  const transferPair = useMemo(() => {
    if (!isTransfer) return null;
    const transferId = String(tx?.transferId || "").trim();
    if (!transferId) return null;

    const siblings = (allTx || []).filter((t) => String(t?.transferId || "").trim() === transferId);
    if (!siblings.length) return null;

    const outTx = siblings.find((t) => t?.type === "expense") || null;
    const inTx = siblings.find((t) => t?.type === "income") || null;

    // บางครั้ง edit/scan อาจมี 2 ตัวไม่ครบ ให้ fallback แบบไม่พัง
    return { outTx, inTx };
  }, [isTransfer, tx?.transferId, allTx]);

  // ✅ ซ่อนขา income ของ transfer (ให้แสดงครั้งเดียว)
  // ถ้าเจอ pair ชัดเจน → แสดงเฉพาะ outTx
  // ถ้าไม่เจอ pair → อย่างน้อยซ่อนกรณี isTransfer + income
  const shouldHide = useMemo(() => {
    if (!isTransfer) return false;
    if (transferPair?.outTx?.id) return String(tx?.id) !== String(transferPair.outTx.id);
    return tx?.type === "income";
  }, [isTransfer, transferPair, tx?.id, tx?.type]);

  if (shouldHide) return null;

  const isIncome = tx?.type === "income";

  const amountText = formatCurrency(tx?.amount || 0);
  let amountPrefix = isIncome ? "+" : "-";
  let amountClass = isIncome ? "text-emerald-700" : "text-red-700";

  // ชื่อ/ไอคอน/สีแสดงผล
  let title = category?.name || "รายการ";
  let subtitle = `${accountName || "—"} • ${safeDateLabel(tx?.date)}`;

  let leadingIsLucide = false;
  let leadingIcon = category?.icon || "🧾";
  let leadingBg = category?.color ? `${category.color}20` : "rgba(255,255,255,0.25)";
  let badgeText = "";

  // -------- Transfer / Credit Card Payment (special rendering) --------
  if (isTransfer) {
    // ใช้ outTx เป็นตัวแทนในการแสดงยอด (neutral)
    const outTx = transferPair?.outTx || (tx?.type === "expense" ? tx : null) || tx;
    const inTx = transferPair?.inTx || null;

    const fromAcc = accounts.find((a) => String(a.id) === String(outTx?.accountId)) || null;
    const toAcc = accounts.find((a) => String(a.id) === String(inTx?.accountId)) || null;

    const fromName = fromAcc?.name || accountName || "บัญชีต้นทาง";
    const toName = toAcc?.name || "บัญชีปลายทาง";

    const fromHint = accountHint(fromAcc);
    const toHint = accountHint(toAcc);

    // Detect credit card payment:
    // - flag/field
    // - note contains keywords
    // - or destination is credit account (common case: bank -> credit)
    const noteLower = String(outTx?.note || tx?.note || "").toLowerCase();
    const isCcPayment =
      !!(outTx?.isCreditCardPayment || outTx?.is_credit_card_payment || outTx?.subtype === "credit_card_payment") ||
      !!(tx?.isCreditCardPayment || tx?.is_credit_card_payment || tx?.subtype === "credit_card_payment") ||
      noteLower.includes("ชำระบัตร") ||
      noteLower.includes("ชำระยอด") ||
      noteLower.includes("credit") ||
      (toAcc && isCreditAccount(toAcc) && (!fromAcc || !isCreditAccount(fromAcc)));

    title = isCcPayment
      ? toAcc?.name
        ? `ชำระบัตรเครดิต • ${toAcc.name}`
        : "ชำระบัตรเครดิต"
      : "Transfer";

    subtitle = `${fromName}${fromHint ? ` (${fromHint})` : ""} → ${toName}${toHint ? ` (${toHint})` : ""} • ${safeDateLabel(
      outTx?.date || tx?.date
    )}`;

    // transfer/payments should be neutral in UI (ไม่ใช่รายจ่ายจริง)
    amountPrefix = "";
    amountClass = "text-gray-900";

    leadingIsLucide = true;
    leadingIcon = isCcPayment ? CreditCard : ArrowRightLeft;
    leadingBg = "rgba(99,102,241,0.10)"; // indigo-ish
    badgeText = isCcPayment ? "PAYMENT" : "TRANSFER";
  }

  const Leading = leadingIsLucide ? leadingIcon : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full glass-card rounded-3xl p-4 text-left hover:scale-[1.01] active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center gap-3">
        {/* leading */}
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border border-white/15"
          style={{ backgroundColor: leadingBg }}
          aria-hidden="true"
        >
          {leadingIsLucide ? (
            <Leading size={18} className={isTransfer ? "text-indigo-700" : "text-gray-900"} />
          ) : (
            <span className="text-xl leading-none">{leadingIcon}</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="text-sm font-extrabold text-gray-900 truncate">{title}</div>
                {badgeText ? (
                  <span className="shrink-0 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/30 border border-white/15 text-gray-900/80">
                    {badgeText}
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-gray-800/60 truncate">{subtitle}</div>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              <div className={`text-sm font-extrabold ${amountClass}`}>
                {amountPrefix}
                {amountText}
              </div>
              <ChevronRight size={16} className="text-gray-900/35" aria-hidden="true" />
            </div>
          </div>

          {tx?.note ? (
            <div className="mt-1 text-xs text-gray-800/70 truncate">{String(tx.note)}</div>
          ) : null}
        </div>
      </div>
    </button>
  );
}
