// src/components/TransactionCard.jsx
import React, { useMemo } from "react";
import { ArrowRightLeft, ChevronRight, CreditCard, Layers } from "lucide-react";
import { isCreditAccount } from "../utils/accountMatch";
import { useAppStore } from "../store/store";
import { formatCurrency, formatDateShort } from "../utils/format";
import { signedReceiptTxSatang } from "../utils/receiptAdjustments";

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
  const categoriesObj = state.categories || { expense: [], income: [] };
  const categoriesById = useMemo(() => {
    const all = [...(categoriesObj?.expense || []), ...(categoriesObj?.income || [])];
    return new Map(all.map((c) => [String(c.id), c]));
  }, [categoriesObj]);

  const isTransfer = !!tx?.isTransfer;
  const gidForSplit = String(tx?.splitGroupId || "").trim();
  const isSplitGroup = !!tx?.isSplitGroup || !!tx?.isSplitParent || (gidForSplit && Array.isArray(tx?.splitLines));

  const splitLines = useMemo(() => {
    if (!isSplitGroup) return null;
    let lines = Array.isArray(tx?.splitLines) ? tx.splitLines : null;
    if (!lines || !lines.length) {
      const gid = gidForSplit;
      if (tx?.isSplitParent) {
        lines = (allTx || []).filter((t) =>
          !t?.isTransfer &&
          (String(t?.splitParentId || "").trim() === String(tx?.id || "").trim() ||
            (t?.isSplitChild && String(t?.splitGroupId || "").trim() === gid))
        );
      } else {
        lines = (allTx || []).filter((t) => String(t?.splitGroupId || "").trim() === gid && !t?.isTransfer);
      }
    }

    const ordered = [...(lines || [])].filter((x) => !x?.isSplitParent).sort((a, b) => {
      const ai = Number(a?.splitIndex || 0);
      const bi = Number(b?.splitIndex || 0);
      if (ai && bi && ai !== bi) return ai - bi;
      return (Number(b?.amount) || 0) - (Number(a?.amount) || 0);
    });
    return ordered;
  }, [isSplitGroup, tx?.splitGroupId, tx?.splitLines, allTx]);

  const groupNote = String(tx?.note || "").trim();
  const groupLabel = String(tx?.splitLabel || "").trim();
  const showGroupNote = isSplitGroup && groupNote && groupLabel && groupNote !== groupLabel;

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

  const isDiscountAdjustment =
    !tx?.isTransfer &&
    !tx?.isSplitParent &&
    String(tx?.type || "").toLowerCase().trim() === "expense" &&
    String(tx?.adjustmentEffect || "").toLowerCase().trim() === "subtract";

  let amountText = formatCurrency(tx?.amount || 0);
  let amountPrefix = isIncome ? "+" : "-";
  let amountClass = isIncome ? "text-emerald-700" : "text-red-700";

  // ✅ Show discount adjustment as a positive impact (green)
  if (isDiscountAdjustment) {
    amountPrefix = "+";
    amountClass = "text-emerald-700";
  }

  // ชื่อ/ไอคอน/สีแสดงผล
  let title = category?.name || "รายการ";
  let subtitle = `${accountName || "—"} • ${safeDateLabel(tx?.date)}`;

  let leadingIsLucide = false;
  let leadingIcon = category?.icon || "🧾";
  let leadingBg = category?.color ? `${category.color}20` : "rgba(255,255,255,0.25)";
  let badgeText = "";

  if (isDiscountAdjustment) {
    badgeText = "DISCOUNT";
  }

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

  // -------- Split Group (special rendering) --------
  if (!isTransfer && isSplitGroup) {
    // ✅ Split group paid-total must reconcile item lines + adjustments (e.g. discount)
    const sumSigned = (splitLines || []).reduce((s, t) => s + signedReceiptTxSatang(t), 0);
    const total = sumSigned || (Number(tx?.amount) || 0);
    amountText = formatCurrency(Math.abs(total));

    const label = String(tx?.splitLabel || "").trim();
    title = label || `Split (${(splitLines || []).length})`;
    subtitle = `${accountName || "—"} • ${safeDateLabel(tx?.date)}`;

    leadingIcon = Layers;
    leadingIsLucide = true;
    leadingBg = "rgba(168,85,247,0.15)";
    badgeText = "SPLIT";
  }

  const Leading = leadingIsLucide ? leadingIcon : null;

  const leadingIconClass = isTransfer
    ? "text-indigo-700"
    : isSplitGroup
    ? "text-purple-700"
    : "text-gray-900";

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
            <Leading size={18} className={leadingIconClass} />
          ) : (
            <span className="text-xl leading-none">{leadingIcon}</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="text-sm font-extrabold text-gray-900 whitespace-normal break-words">
                  {title}
                </div>
                {badgeText ? (
                  <span className="shrink-0 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/30 border border-white/15 text-gray-900/80">
                    {badgeText}
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-gray-800/60 whitespace-normal break-words">{subtitle}</div>
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
            <div className="mt-1 text-xs text-gray-800/70 whitespace-normal break-words">{String(tx.note)}</div>
          ) : null}

          {/* ✅ Split breakdown (show all + scroll inside card) */}
          {!isTransfer && isSplitGroup && Array.isArray(splitLines) && splitLines.length ? (
            <div
              className="mt-3 rounded-2xl bg-white/20 border border-white/15 p-3 max-h-56 overflow-y-auto overflow-x-hidden no-scrollbar"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="text-[10px] font-extrabold text-gray-900/55 uppercase tracking-wide mb-2">
                Breakdown ({splitLines.length})
              </div>
              <div className="space-y-2 pr-1">
                {splitLines.map((l) => {
                  const cat = categoriesById.get(String(l?.category || "")) || null;
                  const isIncomeLine = String(l?.type || "").toLowerCase() === "income";
                  const prefix = isIncomeLine ? "+" : "-";
                  const amt = formatCurrency(Number(l?.amount) || 0);
                  const lineNote = String(l?.itemName || l?.note || "").trim();
                  return (
                    <div key={String(l?.id || `${l?.splitIndex || ""}-${l?.category || ""}-${l?.amount || ""}`)} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-gray-900/85 break-words whitespace-normal">
                          {lineNote || cat?.name || "—"}
                        </div>
                        {lineNote ? (
                          <div className="text-[11px] text-gray-900/60 break-words whitespace-normal">{cat?.name || "—"}</div>
                        ) : null}
                      </div>
                      <div className={`shrink-0 text-xs font-black ${isIncomeLine ? "text-emerald-700" : "text-red-700"}`}>
                        {prefix}
                        {amt}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
}
