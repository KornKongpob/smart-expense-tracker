import { useCallback, useEffect, useMemo, useState } from "react";
import CategorySelect from "../components/CategorySelect";
import AccountPicker from "../components/AccountPicker";
import AccountChipsPicker from "../components/AccountChipsPicker";
import CategoryPicker from "../components/CategoryPicker";
import QuickSuggestions from "../components/QuickSuggestions";
import {
  Inbox,
  Search,
  Trash2,
  Check,
  AlertTriangle,
  ArrowRightLeft,
  CreditCard,
  X,
  Edit2,
  Layers,
  FileText,
  Sparkles
} from "lucide-react";

import { useAppStore } from "../store/store.jsx";
import { findFuzzyDuplicate } from "../store/selectors.js";
import { generateId, generateTransferId, generateSplitGroupId } from "../utils/id";
import { formatCurrency, toISODate } from "../utils/format";
import AppHeader from "../components/AppHeader";
import InboxItemReviewModal from "./inbox/InboxItemReviewModal";
import { parseMoneyToSatang } from "../utils/money";
import { expandTransactionToInstallments } from "../utils/installments";
import { useBlobInfo } from "../utils/useBlobInfo";
import { isCreditAccount } from "../utils/accountMatch";
import { duplicateStateFromMatch, toDuplicateComparable } from "../utils/duplicateDetection";
import {
  resolveMerchantCanonical,
  deriveMerchantAutofillPatch,
} from "../utils/merchantDictionary";
import { inferCategoryKeyFromText } from "../utils/receiptCategorizer";
import {
  reconcileReceiptGroups,
  signedReceiptGroupSatang,
  isAdjustmentLike,
  chooseReceiptPaidTotalSatang,
} from "../utils/receiptAdjustments";

function appendEvidenceToNote(note, evidence) {
  if (!evidence) return note || "";

  const list = [];
  if (typeof evidence === "string" && evidence.trim()) list.push(evidence.trim());
  if (Array.isArray(evidence)) {
    for (const ev of evidence) {
      if (typeof ev === "string" && ev.trim()) list.push(ev.trim());
    }
  }
  if (!list.length) return note || "";

  const pretty = list.map((e) => `- ${e}`).join("\n");
  const base = (note || "").trim();
  return base ? `${base}\n\nEvidence:\n${pretty}` : `Evidence:\n${pretty}`;
}

function isPositiveNumber(n) {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function asSatang(v) {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  return parseMoneyToSatang(v);
}

function normalizeTxType(t) {
  const x = String(t || "").toLowerCase();
  if (x === "income" || x === "expense" || x === "transfer" || x === "credit_payment") return x;
  return "expense";
}

function getInboxDocType(item) {
  return String(item?.docType || item?.doc_type || item?.scanMeta?.docType || item?.meta?.docType || "")
    .toLowerCase()
    .trim();
}

function formatDocTypeLabel(docType) {
  if (docType === "receipt") return "Receipt";
  if (docType === "transfer_slip") return "Slip";
  if (docType === "bill_payment") return "Bill payment";
  return docType ? docType.replace(/_/g, " ") : "";
}

function readOverallConfidence(confidence) {
  if (typeof confidence === "number" && Number.isFinite(confidence)) {
    if (confidence > 1) return Math.max(0, Math.min(1, confidence / 100));
    return Math.max(0, Math.min(1, confidence));
  }
  if (confidence && typeof confidence === "object") {
    return readOverallConfidence(confidence.overall ?? confidence.score ?? confidence.amount ?? null);
  }
  return null;
}

function getInboxAccountMatch(item) {
  const fromScanMeta = item?.scanMeta && typeof item.scanMeta === "object" ? item.scanMeta.accountMatch : null;
  if (fromScanMeta && typeof fromScanMeta === "object") return fromScanMeta;
  const fromMeta = item?.meta && typeof item.meta === "object" ? item.meta.accountMatch : null;
  if (fromMeta && typeof fromMeta === "object") return fromMeta;
  return null;
}

function getAccountMatchBadge(item) {
  const match = getInboxAccountMatch(item);
  if (!match) return null;

  if (String(match?.kind || "") === "pair") {
    const fromScore = Number(match?.from?.score || 0);
    const toScore = Number(match?.to?.score || 0);
    const ready = !!match?.ready;
    if (ready && fromScore >= 4 && toScore >= 4) return { label: "Account pair high", tone: "ok" };
    if (ready && fromScore >= 3 && toScore >= 3) return { label: "Account pair medium", tone: "info" };
    return { label: ready ? "Check account pair" : "Fix transfer accounts", tone: "warn" };
  }

  const score = Number(match?.selected?.score || 0);
  const ready = !!match?.ready;
  const source = String(match?.source || "").trim();

  if (!ready) return { label: "Need account", tone: "warn" };
  if (source === "model" || score >= 4) return { label: "Account match high", tone: "ok" };
  if (score >= 3) return { label: "Account match medium", tone: "info" };
  return { label: "Check account", tone: "warn" };
}

function getRequiredFixes(item) {
  const txType = normalizeTxType(item?.type || item?.txType);
  const fixes = [];

  if (!isPositiveNumber(Number(item?.amount))) fixes.push("amount");

  if (txType === "transfer" || txType === "credit_payment") {
    const fromId = String(item?.fromAccountId || "").trim();
    const toId = String(item?.toAccountId || "").trim();
    if (!fromId) fixes.push("from account");
    if (!toId) fixes.push("to account");
    if (fromId && toId && fromId === toId) fixes.push("account pair");
  } else {
    if (!String(item?.accountId || "").trim()) fixes.push("account");
    if (!String(item?.categoryId || item?.category || "").trim()) fixes.push("category");
  }

  if (
    !!item?.splitByCategory &&
    Array.isArray(item?.groups) &&
    item.groups.some((group) => !String(group?.categoryId || group?.category || "").trim() && !isAdjustmentLike(group))
  ) {
    fixes.push("split categories");
  }

  return fixes;
}

function buildTransactionsFromInboxItem(item, ctx = {}) {
  const accounts = Array.isArray(ctx?.accounts) ? ctx.accounts : [];
  const txType = normalizeTxType(item?.type || item?.txType);
  const date = item?.date ? String(item.date).slice(0, 10) : toISODate(new Date());
  const merchant = item?.merchant || "";
  const note = appendEvidenceToNote(item?.note || "", item?.evidence);
  const ref = item?.referenceId || item?.ref || "";

  const wantsInstallment = !!item?.isInstallment;
  const installmentMonths = Math.max(2, Math.min(120, Math.trunc(Number(item?.installmentMonths) || 2)));

  // ✅ Credit card installment validation (Inbox)
  if (wantsInstallment) {
    if (txType !== "expense") throw new Error("ผ่อนชำระใช้ได้เฉพาะรายการรายจ่าย");
    if (item?.splitByCategory) throw new Error("ผ่อนชำระ: กรุณาปิด Split ก่อน");

    const acc = accounts.find((a) => String(a?.id || "") === String(item?.accountId || "")) || null;
    if (!acc || !isCreditAccount(acc)) throw new Error("ผ่อนชำระ: ต้องเลือกบัญชีเป็นบัตรเครดิต");
    if (installmentMonths < 2) throw new Error("ผ่อนชำระ: จำนวนงวดต้องมากกว่าหรือเท่ากับ 2");
  }

  // Split (receipt items): create 1 parent transaction + N child transactions
  // ✅ Ignore zero/invalid lines (amount <= 0)
  const nonAdjGroupCount = Array.isArray(item?.groups) ? item.groups.filter((g) => !isAdjustmentLike(g)).length : 0;
  const hasSplitGroups = nonAdjGroupCount >= 2;
  if (txType === "expense" && !!item?.splitByCategory && hasSplitGroups) {
    const accountId = item?.accountId || "";
    if (!accountId) throw new Error("ยังไม่ได้เลือก Account สำหรับรายการแบบ Split");

    const splitGroupId = String(item?.splitGroupId || "").trim() || generateSplitGroupId();
    const splitLabel = String(item?.splitLabel || merchant || item?.note || "Split").trim().slice(0, 80) || "Split";
    const paymentMethod = String(item?.paymentMethod || item?.payment_method || "cash");

    let usableGroups = (item.groups || [])
      .map((g, idx) => {
        const gg = g && typeof g === "object" ? g : {};
        const amount = asSatang(gg?.amount);
        const categoryId = String(gg?.categoryId || gg?.category || "").trim();
        const note0 = String(gg?.note || gg?.name || gg?.title || "").trim();
        const receiptLineType = String(gg?.receiptLineType || "").toLowerCase().trim()
          || (isAdjustmentLike(gg) || categoryId === "discount" ? "adjustment" : "item");
        let adjustmentEffect = String(gg?.adjustmentEffect || "").toLowerCase().trim();
        if (receiptLineType === "adjustment") {
          if (adjustmentEffect !== "subtract" && adjustmentEffect !== "add") {
            adjustmentEffect = categoryId === "discount" ? "subtract" : "add";
          }
        } else {
          adjustmentEffect = "add";
        }
        const adjustmentType = String(gg?.adjustmentType || "").trim() || (categoryId === "discount" ? "discount" : "");
        const splitIndex = Number(gg?.splitIndex || 0) || idx + 1;
        const children = Array.isArray(gg?.children)
          ? gg.children
              .map((c) => {
                const cc = c && typeof c === "object" ? c : {};
                const nm = String(cc?.name || "").trim();
                const ca = asSatang(cc?.amount);
                if (!nm && !ca) return null;
                return { name: nm || "—", amount: Math.abs(ca) };
              })
              .filter(Boolean)
          : null;

        return {
          key: String(gg?.key || ""),
          categoryId,
          amount,
          note: note0,
          receiptLineType,
          adjustmentType,
          adjustmentEffect,
          splitIndex,
          children,
          childrenIncludedInParent: !!gg?.childrenIncludedInParent,
        };
      })
      .filter((g) => isPositiveNumber(g.amount));

    const nonAdjCount = usableGroups.filter((g) => String(g?.receiptLineType || "").toLowerCase().trim() !== "adjustment").length;

    // If we don't have enough purchased lines, gracefully fall back to a single transaction
    // (prevents approval from failing on edge cases like 1 item + 1 discount line).
    if (usableGroups.length < 2 || nonAdjCount < 2) {
      const g0 = usableGroups.find((x) => String(x?.receiptLineType || "").toLowerCase().trim() !== "adjustment") || usableGroups[0];
      const categoryId = String(g0?.categoryId || item?.categoryId || "").trim();
      if (!categoryId) throw new Error("ยังไม่ได้เลือก Category สำหรับรายการนี้");

      // Amount must respect adjustment math (discount subtracts from paid total)
      const receiptChosen = chooseReceiptPaidTotalSatang({
        aiTotalSatang: asSatang(item?.amount),
        groups: usableGroups,
        toleranceSatang: 200,
      });
      let amount = Math.abs(Number(receiptChosen?.targetTotalSatang || 0));
      if (!isPositiveNumber(amount)) {
        const signed = usableGroups.reduce((s, g) => s + signedReceiptGroupSatang(g), 0);
        amount = Math.abs(signed);
      }
      if (!isPositiveNumber(amount)) throw new Error("กรุณากรอกยอดเงินให้มากกว่า 0");

      return [
        {
          id: generateId(),
          type: txType,
          amount,
          date,
          merchant,
          note: String(g0?.note || "").trim() || note,
          ref: ref || "",
          category: categoryId,
          accountId,
          paymentMethod,
          isTransfer: false,
          transferId: null,
          attachmentId: item?.attachmentId || null,
          fileHash: String(item?.fileHash || '').trim() || null,

          receiptLines: usableGroups || null,
          receiptPaidTotalSatang: amount,
          receiptItemsSubtotalSatang: Number(receiptChosen?.itemsSubtotalSatang || 0) || null,
          receiptDiscountSatang: Number(receiptChosen?.discountSatang || 0) || null,
          receiptSurchargeSatang: Number(receiptChosen?.surchargeSatang || 0) || null,

          source: "inbox",
        },
      ];
    }

    // Parent amount: must respect adjustment math (discount subtracts from paid total)
    let parentAmount = asSatang(item?.amount);
    const parentChosen = chooseReceiptPaidTotalSatang({ aiTotalSatang: parentAmount, groups: usableGroups, toleranceSatang: 200 });
    parentAmount = Math.abs(Number(parentChosen?.targetTotalSatang || parentAmount));
    if (!isPositiveNumber(parentAmount)) {
      const signed = usableGroups.reduce((s, g) => s + signedReceiptGroupSatang(g), 0);
      parentAmount = Math.abs(signed);
    }

    // ✅ Robust reconcile: when receipt total != sum(items), add an adjustment line (e.g. ส่วนลด)
    const rec = reconcileReceiptGroups(usableGroups, parentAmount, {
      ensureCategoryId: (k) => k,
      baseLineCountMin: 2,
    });
    usableGroups = (rec.groups || []).filter((g) => isPositiveNumber(g.amount));

    const parentId = generateId();
    const splitCount = usableGroups.length;

    // Recompute with signed sum after reconcile
    const signedAfter = usableGroups.reduce((s, g) => s + signedReceiptGroupSatang(g), 0);
    parentAmount = Math.abs(signedAfter) || parentAmount;

    // ✅ Parent category for split groups:
    // - Multiple non-adjustment categories → parent = "mixed" (UI-only)
    // - Single non-adjustment category → use that category
    const nonAdjCats = Array.from(
      new Set(
        usableGroups
          .filter((g) => String(g?.receiptLineType || "").toLowerCase().trim() !== "adjustment")
          .map((g) => String(g?.categoryId || "").trim())
          .filter(Boolean)
      )
    );
    const parentCategory = String((nonAdjCats.length > 1 ? "mixed" : nonAdjCats[0]) || item?.categoryId || "mixed").trim();

    const txs = [];

    // Parent (UI-only)
    txs.push({
      id: parentId,
      type: txType,
      amount: parentAmount,
      date,
      merchant,
      note,
      ref: ref || "",
      category: parentCategory,
      accountId,
      paymentMethod,
      isTransfer: false,
      transferId: null,
      attachmentId: item?.attachmentId || null,
      fileHash: String(item?.fileHash || '').trim() || null,
      source: "inbox",

      splitGroupId,
      splitCount,
      splitLabel,
      isSplit: true,
      isSplitParent: true,
    });

    // Children (real transactions)
    // NOTE: adjustment lines are saved as "expense" but their net effect is controlled by adjustmentEffect.
    for (let i = 0; i < usableGroups.length; i++) {
      const g = usableGroups[i];
      const amount = Number(g.amount) || 0;
      const categoryId = String(g?.categoryId || item?.categoryId || "").trim();
      if (!categoryId) throw new Error("ยังไม่ได้เลือก Category สำหรับกลุ่ม Split");

      const isAdj = String(g?.receiptLineType || "").toLowerCase().trim() === "adjustment";
      const fallbackName = categoryId === "discount" ? "ส่วนลด" : (isAdj ? "ปรับยอด" : "(item)");
      const itemName = String(g?.note || "").trim() || fallbackName;

      txs.push({
        id: generateId(),
        type: txType,
        amount,
        date,
        merchant,
        itemName,
        note: itemName,
        ref: "",
        category: categoryId,
        accountId,
        paymentMethod,
        isTransfer: false,
        transferId: null,
        attachmentId: item?.attachmentId || null,
        fileHash: String(item?.fileHash || '').trim() || null,
        source: "inbox",

        splitGroupId,
        splitIndex: Number(g?.splitIndex || 0) || i + 1,
        splitCount,
        splitLabel,
        isSplit: true,
        isSplitChild: true,
        splitParentId: parentId,

        receiptLineType: String(g?.receiptLineType || "item"),
        adjustmentType: String(g?.adjustmentType || ""),
        adjustmentEffect: String(g?.adjustmentEffect || "add"),
      });
    }

    return txs;
  }

  // Transfer / Credit Payment
  if (txType === "transfer" || txType === "credit_payment") {
    const fromAccountId = item?.fromAccountId || "";
    const toAccountId = item?.toAccountId || "";
    const amount = asSatang(item?.amount);

    if (!fromAccountId || !toAccountId) throw new Error("Transfer ต้องมีทั้ง From และ To account");
    if (fromAccountId === toAccountId) throw new Error("Transfer ต้องเลือก From และ To คนละบัญชี");
    if (!isPositiveNumber(amount)) throw new Error("Transfer amount ต้องมากกว่า 0");

    const transferId = generateTransferId();
    const transferKind = txType === "credit_payment" ? "credit_payment" : "transfer";

    return [
      {
        id: generateId(),
        type: "expense",
        isTransfer: true,
        transferId,
        amount,
        date,
        note,
        merchant,
        ref,
        category: "transfer",
        accountId: fromAccountId,
        attachmentId: item?.attachmentId || null,
        fileHash: String(item?.fileHash || '').trim() || null,
        source: "inbox",
        transferKind,
      },
      {
        id: generateId(),
        type: "income",
        isTransfer: true,
        transferId,
        amount,
        date,
        note,
        merchant,
        ref: "",
        category: "transfer",
        accountId: toAccountId,
        attachmentId: item?.attachmentId || null,
        fileHash: String(item?.fileHash || '').trim() || null,
        source: "inbox",
        transferKind,
      },
    ];
  }

  // Normal income/expense
  const accountId = item?.accountId || "";
  const amount = asSatang(item?.amount);
  const categoryId = item?.categoryId || item?.category || "";

  const receiptLines =
    txType === "expense" && Array.isArray(item?.groups) && item.groups.length
      ? item.groups
          .map((g, idx) => {
            const gg = g && typeof g === "object" ? g : {};
            const categoryId0 = String(gg?.categoryId || gg?.category || "").trim();
            const amount0 = asSatang(gg?.amount);
            const note0 = String(gg?.note || gg?.name || gg?.title || "").trim();
            const rlt = String(gg?.receiptLineType || "").toLowerCase().trim() || (isAdjustmentLike(gg) || categoryId0 === "discount" ? "adjustment" : "item");
            let eff = String(gg?.adjustmentEffect || "").toLowerCase().trim();
            if (rlt === "adjustment") {
              if (eff !== "subtract" && eff !== "add") eff = categoryId0 === "discount" ? "subtract" : "add";
            } else {
              eff = "add";
            }
            const children = Array.isArray(gg?.children)
              ? gg.children
                  .map((c) => {
                    const cc = c && typeof c === "object" ? c : {};
                    const nm = String(cc?.name || "").trim();
                    const ca = asSatang(cc?.amount);
                    if (!nm && !ca) return null;
                    return { name: nm || "—", amount: Math.abs(ca) };
                  })
                  .filter(Boolean)
              : null;

            return {
              key: String(gg?.key || ""),
              categoryId: categoryId0,
              amount: Math.abs(amount0),
              note: note0,
              receiptLineType: rlt,
              adjustmentEffect: eff,
              adjustmentType: String(gg?.adjustmentType || "").trim(),
              splitIndex: Number(gg?.splitIndex || 0) || idx + 1,
              children,
              childrenIncludedInParent: !!gg?.childrenIncludedInParent,
            };
          })
          .filter((g) => isPositiveNumber(g.amount))
      : null;

  const receiptItemsSubtotalSatang = receiptLines
    ? receiptLines.filter((l) => String(l?.receiptLineType || "").toLowerCase().trim() !== "adjustment").reduce((s, l) => s + (Number(l?.amount) || 0), 0)
    : null;
  const receiptDiscountSatang = receiptLines
    ? receiptLines.filter((l) => String(l?.receiptLineType || "").toLowerCase().trim() === "adjustment" && String(l?.adjustmentEffect || "").toLowerCase().trim() === "subtract").reduce((s, l) => s + (Number(l?.amount) || 0), 0)
    : null;
  const receiptSurchargeSatang = receiptLines
    ? receiptLines.filter((l) => String(l?.receiptLineType || "").toLowerCase().trim() === "adjustment" && String(l?.adjustmentEffect || "").toLowerCase().trim() === "add").reduce((s, l) => s + (Number(l?.amount) || 0), 0)
    : null;

  if (!accountId) throw new Error("ยังไม่ได้เลือก Account");
  if (!categoryId) throw new Error("ยังไม่ได้เลือก Category");
  if (!isPositiveNumber(amount)) throw new Error("ยอดเงินต้องมากกว่า 0");

  const baseTx = {
    id: generateId(),
    type: txType,
    amount,
    date,
    merchant,
    note,
    ref,
    category: categoryId,
    accountId,
    paymentMethod: String(item?.paymentMethod || item?.payment_method || "cash"),
    isTransfer: false,
    transferId: null,
    attachmentId: item?.attachmentId || null,
    fileHash: String(item?.fileHash || '').trim() || null,

    receiptLines: receiptLines || null,
    receiptPaidTotalSatang: receiptLines ? amount : null,
    receiptItemsSubtotalSatang: receiptItemsSubtotalSatang,
    receiptDiscountSatang: receiptDiscountSatang,
    receiptSurchargeSatang: receiptSurchargeSatang,

    source: "inbox",
  };

  // ✅ Credit card installment (Inbox) - expand into monthly transactions
  if (wantsInstallment) {
    const groupId = generateId();
    const expanded = expandTransactionToInstallments(
      { ...baseTx, id: undefined, installmentGroupId: groupId },
      installmentMonths,
      { groupId, makeId: () => generateId() }
    ).map((t, idx) => {
      const keep = idx === 0;
      return {
        ...t,
        id: t.id || generateId(),
        receiptLines: keep ? baseTx.receiptLines : null,
        receiptPaidTotalSatang: keep ? baseTx.receiptPaidTotalSatang : null,
        receiptItemsSubtotalSatang: keep ? baseTx.receiptItemsSubtotalSatang : null,
        receiptDiscountSatang: keep ? baseTx.receiptDiscountSatang : null,
        receiptSurchargeSatang: keep ? baseTx.receiptSurchargeSatang : null,
      };
    });
    return expanded;
  }

  return [baseTx];
}

function typeBadge(type) {
  const txType = normalizeTxType(type);
  if (txType === "transfer") return { label: "Transfer", icon: ArrowRightLeft };
  if (txType === "credit_payment") return { label: "Credit Payment", icon: CreditCard };
  if (txType === "income") return { label: "Income", icon: Check };
  return { label: "Expense", icon: Check };
}

function PillTab({ active, onClick, label, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-2xl text-sm font-extrabold border active:scale-95 transition-all inline-flex items-center gap-2 ${
        active
          ? "bg-gray-900/90 text-white border-white/10 shadow-lg"
          : "bg-white/30 text-gray-900/70 border-white/20"
      }`}
    >
      {label}
      {typeof count === "number" ? (
        <span
          className={`min-w-[26px] px-2 py-0.5 rounded-full text-xs font-black ${
            active ? "bg-white/15 text-white" : "bg-gray-900/10 text-gray-900/70"
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function AttachmentThumb({ attachmentId }) {
  const { url, mimeType } = useBlobInfo(attachmentId);
  const id = String(attachmentId || "").trim();
  if (!id) return null;

  return (
    <div className="mt-2 w-full max-w-[220px]">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="block rounded-2xl overflow-hidden border border-white/20 bg-white/10"
        >
          {String(mimeType || "").toLowerCase() === "application/pdf" ? (
            <div className="w-full h-28 flex items-center justify-center bg-white/10">
              <div className="inline-flex items-center gap-2 text-sm font-extrabold text-gray-900/80">
                <FileText size={18} />
                PDF
              </div>
            </div>
          ) : (
            <img src={url} alt="attachment" className="w-full h-28 object-cover" />
          )}
        </a>
      ) : (
        <div className="text-xs text-gray-900/55">กำลังโหลดไฟล์แนบ…</div>
      )}
    </div>
  );
}

export default function InboxView({ showAlert, showConfirm }) {
  const {
    state,
    navigate,
    startNewTransaction,
    bulkUpsertTransactions,
    addInboxItems: _addInboxItems,
    updateInboxItem,
    removeInboxItems,
    clearApprovedInbox,
    learnMerchant,
  } = useAppStore();

  // ✅ IMPORTANT: define `accounts` in this scope.
  // Inbox approve flow builds transactions from items and needs the full account list
  // (e.g., for installment validation / credit-account checks).
  // A missing `accounts` reference causes a runtime ReferenceError on Approve.
  const accounts = useMemo(() => (Array.isArray(state?.accounts) ? state.accounts : []), [state?.accounts]);

  const inbox = useMemo(() => state.inbox || [], [state.inbox]);
  const [tab, setTab] = useState("pending");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [editingId, setEditingId] = useState(null);

  const accountsById = useMemo(() => {
    const map = new Map();
    for (const a of state.accounts || []) map.set(a.id, a);
    return map;
  }, [state.accounts]);

  const defaultCashAccountId = useMemo(() => {
    const arr = Array.isArray(state?.accounts) ? state.accounts : [];
    const hit = arr.find((a) =>
      String(a?.type || "").toLowerCase() === "cash" ||
      String(a?.id || "").toLowerCase().includes("cash") ||
      /เงินสด/i.test(String(a?.name || ""))
    );
    return String(hit?.id || "");
  }, [state.accounts]);

  const categoriesById = useMemo(() => {
    const map = new Map();
    const exp = state?.categories?.expense || [];
    const inc = state?.categories?.income || [];
    for (const c of [...exp, ...inc]) map.set(c.id, c);
    return map;
  }, [state.categories]);

  const pending = useMemo(() => {
    return (inbox || []).filter((it) => String(it?.status || "pending").toLowerCase() !== "approved");
  }, [inbox]);

  const approved = useMemo(() => {
    return (inbox || []).filter((it) => String(it?.status || "").toLowerCase() === "approved");
  }, [inbox]);

  const pendingCount = pending.length;

  const activeListBase = tab === "pending" ? pending : approved;

  const prepareInboxItemForApproval = useCallback((item) => {
    const canon = resolveMerchantCanonical(item?.merchant || item?.note, state?.merchants || []);
    let nextItem = canon ? { ...item, merchant: canon } : { ...item };

    const paymentMethod = String(nextItem?.paymentMethod || nextItem?.payment_method || "cash").toLowerCase().trim() || "cash";
    if ((!nextItem?.accountId || !String(nextItem.accountId).trim()) && paymentMethod === "cash" && defaultCashAccountId) {
      nextItem = { ...nextItem, accountId: defaultCashAccountId, paymentMethod };
    }

    return nextItem;
  }, [defaultCashAccountId, state?.merchants]);

  const buildPendingDuplicatePool = useCallback(({ excludeIds = [], extraItems = [] } = {}) => {
    const excluded = new Set((excludeIds || []).map((id) => String(id || "")).filter(Boolean));
    return [
      ...(state.transactions || []),
      ...(pending || []).filter((it) => !excluded.has(String(it?.id || ""))).map(toDuplicateComparable),
      ...(extraItems || []).map(toDuplicateComparable),
    ];
  }, [pending, state.transactions]);

  const getInboxDuplicateMatch = useCallback((item, options = {}) => {
    try {
      const pool = buildPendingDuplicatePool({
        excludeIds: [item?.id, ...(options.excludeIds || [])],
        extraItems: options.extraItems,
      });
      return findFuzzyDuplicate(pool, toDuplicateComparable(item));
    } catch {
      return null;
    }
  }, [buildPendingDuplicatePool]);

  // ✅ Ensure Inbox warning can show even for older items (compute fuzzy duplicate for display)
  const activeList = useMemo(() => {
    return (activeListBase || []).map((it) => {
      if (!it) return it;
      return { ...it, ...duplicateStateFromMatch(getInboxDuplicateMatch(it)) };
    });
  }, [activeListBase, getInboxDuplicateMatch]);

  const pickRecentCats = useCallback((txType, catsList) => {
    const txs = Array.isArray(state.transactions) ? state.transactions : [];
    const byId = new Map((Array.isArray(catsList) ? catsList : []).map((c) => [String(c?.id || "").trim(), c]));
    const out = [];
    const seen = new Set();
    // Walk from newest to oldest (txs usually appended)
    for (let i = txs.length - 1; i >= 0; i -= 1) {
      const t = txs[i];
      if (!t) continue;
      if (String(t.type || "").toLowerCase() !== String(txType || "").toLowerCase()) continue;
      const cid = String(t.category || "").trim();
      if (!cid || cid === "transfer" || cid === "mixed") continue;
      if (seen.has(cid)) continue;
      const cat = byId.get(cid);
      if (!cat) continue;
      seen.add(cid);
      out.push(cat);
      if (out.length >= 10) break;
    }
    return out;
  }, [state.transactions]);

  const pickRecentAccounts = useCallback((txType) => {
    const txs = Array.isArray(state.transactions) ? state.transactions : [];
    const byId = new Map((Array.isArray(accounts) ? accounts : []).map((a) => [String(a?.id || "").trim(), a]));
    const out = [];
    const seen = new Set();
    for (let i = txs.length - 1; i >= 0; i -= 1) {
      const t = txs[i];
      if (!t) continue;
      if (String(t.type || "").toLowerCase() !== String(txType || "").toLowerCase()) continue;
      const aid = String(t.accountId || "").trim();
      if (!aid || seen.has(aid)) continue;
      const acc = byId.get(aid);
      if (!acc) continue;
      seen.add(aid);
      out.push(acc);
      if (out.length >= 10) break;
    }
    return out;
  }, [accounts, state.transactions]);

  const recentExpenseCatsForPicker = useMemo(
    () => pickRecentCats("expense", state.categories?.expense || []),
    [pickRecentCats, state.categories?.expense]
  );

  const recentIncomeCatsForPicker = useMemo(
    () => pickRecentCats("income", state.categories?.income || []),
    [pickRecentCats, state.categories?.income]
  );

  const recentExpenseAccountsForPicker = useMemo(
    () => pickRecentAccounts("expense"),
    [pickRecentAccounts]
  );

  const recentIncomeAccountsForPicker = useMemo(
    () => pickRecentAccounts("income"),
    [pickRecentAccounts]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = activeList
      .slice()
      .sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0));

    if (!q) return sorted;
    return sorted.filter((it) => {
      const hay = [it.merchant, it.note, it.referenceId, it.ref, it.fileName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [activeList, query]);

  const selectedCount = selectedIds.size;

  useEffect(() => {
    // reset selection when switching tab
    setSelectedIds(new Set());
  }, [tab]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filtered.map((x) => x.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const deleteIds = (ids) => {
    const list = Array.isArray(ids) ? ids : [];
    if (!list.length) return;

    showConfirm?.(
      "Delete selected?",
      `ต้องการลบ ${list.length} รายการใช่ไหม?`,
      () => {
        removeInboxItems(list);
        showAlert?.("ลบรายการแล้ว");
      },
      true
    );
  };

    const selectDuplicatesOnly = () => {
    setSelectedIds(new Set(filtered.filter((x) => !!x?.duplicate).map((x) => x.id)));
  };

  const autoCategorizeIds = (ids) => {
    const list = Array.isArray(ids) ? ids : [];
    if (!list.length) return;

    const cats = state.categories || { expense: [], income: [] };
    const expenseIds = new Set((cats.expense || []).map((c) => String(c?.id || "").trim()).filter(Boolean));
    const incomeIds = new Set((cats.income || []).map((c) => String(c?.id || "").trim()).filter(Boolean));
    const merchantsList = state.merchants || [];

    let updated = 0;

    for (const rawId of list) {
      const id = String(rawId || "");
      const it = (inbox || []).find((x) => String(x?.id || "") === id) || null;
      if (!it) continue;

      const t = normalizeTxType(it?.type || it?.txType);
      if (t !== "expense" && t !== "income") continue;

      const setIds = t === "income" ? incomeIds : expenseIds;

      const patch = {};

      // 1) Merchant dictionary suggestion (fill blanks)
      try {
        const md = deriveMerchantAutofillPatch(
          {
            merchant: it?.merchant || it?.note || "",
            txType: t,
            categoryId: it?.categoryId || "",
            accountId: it?.accountId || "",
          },
          merchantsList
        );
        const mdCatId = String(md?.categoryId || "").trim();
        const mdAccId = String(md?.accountId || "").trim();

        if (mdCatId && !String(it?.categoryId || "").trim() && setIds.has(mdCatId)) patch.categoryId = mdCatId;
        if (mdAccId && !String(it?.accountId || "").trim()) patch.accountId = mdAccId;
      } catch {
        // ignore
      }

      // 2) Split groups (expense)
      if (t === "expense" && it?.splitByCategory && Array.isArray(it?.groups) && it.groups.length) {
        const parent = String(it?.categoryId || patch.categoryId || "").trim();
        const nextGroups = it.groups.map((g) => {
          const curCat = String(g?.categoryId || g?.category || "").trim();
          if (curCat) return g;

          // Adjustments: discount/fees
          if (isAdjustmentLike(g)) {
            const eff = String(g?.adjustmentEffect || "").toLowerCase().trim();
            const at = String(g?.adjustmentType || "").toLowerCase().trim();
            const wantsDiscount = at === "discount" || eff === "subtract";
            const desired = wantsDiscount
              ? expenseIds.has("discount")
                ? "discount"
                : expenseIds.has("fees")
                ? "fees"
                : "discount"
              : expenseIds.has("fees")
              ? "fees"
              : expenseIds.has("discount")
              ? "discount"
              : "fees";
            return { ...g, categoryId: desired };
          }

          const text = String(g?.note || g?.name || g?.title || "").trim();
          const sug = String(inferCategoryKeyFromText("expense", text) || "").trim();
          if (sug && setIds.has(sug)) return { ...g, categoryId: sug };
          if (parent) return { ...g, categoryId: parent };
          return g;
        });

        patch.groups = nextGroups;
      } else {
        // 3) Non-split category suggestion (fill blanks)
        const curCat = String(it?.categoryId || "").trim();
        if (!curCat) {
          const text = String(it?.merchant || it?.note || "").trim();
          const sug = String(inferCategoryKeyFromText(t, text) || "").trim();
          if (sug && setIds.has(sug)) patch.categoryId = sug;
        }
      }

      if (Object.keys(patch).length) {
        updateInboxItem(id, patch);
        updated += 1;
      }
    }

    showAlert?.(updated ? `Auto-categorize: อัปเดต ${updated} รายการ` : "Auto-categorize: ไม่มีรายการที่ต้องอัปเดต");
  };
  const approveIds = (ids) => {
    const list = Array.isArray(ids) ? ids : [];
    if (!list.length) return;

    const items = pending.filter((x) => list.includes(x.id));
    if (!items.length) return;

    const preparedItems = items.map(prepareInboxItemForApproval);
    const dupCount = preparedItems.reduce((n, it) => {
      const otherSelected = preparedItems.filter((candidate) => String(candidate?.id || "") !== String(it?.id || ""));
      const match = getInboxDuplicateMatch(it, { excludeIds: list, extraItems: otherSelected });
      return duplicateStateFromMatch(match).duplicate || !!it?.duplicate ? n + 1 : n;
    }, 0);

    const doApprove = () => {
      try {
        const allTxs = [];
        for (const nextIt of preparedItems) {

          // ✅ Default payment_method cash → default cash account (prevents approval errors)
          const txs = buildTransactionsFromInboxItem(nextIt, { accounts });
          allTxs.push(...txs);
        }

        bulkUpsertTransactions(allTxs, { navigateToDashboard: false });

        // ✅ Learn merchant mapping from approved transactions
        try {
          for (const tx of allTxs) {
            const t = String(tx?.type || "").toLowerCase();
            if (t !== "expense" && t !== "income") continue;
            const m = String(tx?.merchant || "").trim();
            if (!m) continue;
            learnMerchant?.({ merchant: m, txType: t, categoryId: String(tx?.category || ""), accountId: String(tx?.accountId || "") });
          }
        } catch {
          // ignore
        }

        // ✅ auto-clean: remove approved items from Inbox (main transactions become the source of truth)
        removeInboxItems(list);

        setSelectedIds(new Set());
        showAlert?.(`Approve แล้ว (${items.length} รายการ / สร้าง ${allTxs.length} transactions)`);
      } catch (e) {
        showAlert?.(e?.message || "ไม่สามารถ approve ได้");
      }
    };

    if (dupCount > 0) {
      showConfirm?.(
        "Possible duplicate",
        `มี ${dupCount} รายการที่อาจซ้ำ ต้องการ Approve ต่อเลยไหม?`,
        doApprove
      );
      return;
    }

    doApprove();
  };

  const onClearApproved = () => {
    if (!approved.length) return;
    showConfirm?.(
      "Clear Approved?",
      `ต้องการล้างประวัติ Approved ทั้งหมด ${approved.length} รายการ (ลบใน Inbox เท่านั้น) ใช่ไหม?`,
      () => {
        clearApprovedInbox();
        showAlert?.("ล้าง Approved แล้ว");
      },
      true
    );
  };

  const editingItem = useMemo(() => {
    if (!editingId) return null;
    // Some callers may supply numeric ids; normalize to string to avoid "Edit does nothing".
    const target = String(editingId);
    return (inbox || []).find((x) => String(x?.id) === target) || null;
  }, [editingId, inbox]);

  const statusLine = tab === "pending" ? `${pendingCount} pending` : `${approved.length} approved`;

  return (
    <div className="min-h-dvh min-w-0 overflow-x-hidden pb-24">
      <AppHeader
        title="Inbox"
        subtitle={statusLine}
        right={
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.setItem("add.entryMode.force", "scan");
              } catch {
                // ignore
              }
              startNewTransaction?.() ?? navigate("add");
            }}
            className="ui-btn ui-btn-secondary active:scale-[0.99]"
          >
            <Check size={18} />
            Scan
          </button>
        }
      />

      <main className="ui-page pt-4 pb-6 min-w-0 view-flow">

      <div className="view-hero">
        <div className="view-hero-content">
          <div>
            <div className="view-eyebrow">Inbox review</div>
            <div className="view-hero-title">รวมรายการรอตรวจสอบ อนุมัติ และจัดหมวดไว้ในที่เดียว</div>
            <div className="view-hero-copy">
              ตรวจสอบรายการใหม่ อนุมัติทีละรายการหรือเป็นชุด และย้อนดูรายการที่อนุมัติแล้วได้จากหน้าเดียว
            </div>
          </div>

          <div className="view-hero-grid">
            <div className="view-metric">
              <div className="view-metric-label">Pending</div>
              <div className="view-metric-value">{pendingCount}</div>
              <div className="view-metric-hint">รายการที่ยังรอ review หรือ approve</div>
            </div>

            <div className="view-metric">
              <div className="view-metric-label">Approved</div>
              <div className="view-metric-value">{approved.length}</div>
              <div className="view-metric-hint">ประวัติรายการที่ส่งเข้า transactions แล้ว</div>
            </div>

            <div className="view-metric">
              <div className="view-metric-label">Selected</div>
              <div className="view-metric-value">{selectedCount}</div>
              <div className="view-metric-hint">จำนวนรายการที่เลือกไว้สำหรับ bulk action</div>
            </div>

            <div className="view-metric">
              <div className="view-metric-label">Search</div>
              <div className="view-metric-value">{query ? "Active" : "All"}</div>
              <div className="view-metric-hint">{query ? `กำลังค้นหาด้วย “${query}”` : "ยังไม่ได้กรองด้วยข้อความค้นหา"}</div>
            </div>
          </div>
        </div>
      </div>

        {/* Tabs + actions */}
      <div className="mt-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <PillTab active={tab === "pending"} onClick={() => setTab("pending")} label="Pending" count={pendingCount} />
          <PillTab active={tab === "approved"} onClick={() => setTab("approved")} label="Approved" count={approved.length} />
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 min-w-0 w-full sm:w-auto">
          {tab === "approved" ? (
            <button
              type="button"
              onClick={onClearApproved}
              disabled={!approved.length}
              className={`w-full sm:w-auto px-3 py-2 rounded-xl font-bold active:scale-95 flex items-center justify-center gap-2 ${
                approved.length
                  ? "bg-red-600 text-white shadow-red-200"
                  : "bg-white/20 text-gray-700/50 border border-white/20"
              }`}
            >
              <Trash2 size={16} />
              <span className="whitespace-normal break-words wrap-anywhere">
                <span className="sm:hidden">Clear</span>
                <span className="hidden sm:inline">Clear Approved</span>
              </span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-900/50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาใน Inbox (merchant / note / ref)"
            className="w-full pl-10 pr-10 py-3 rounded-2xl bg-white/30 border border-white/20 outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-white/30 border border-white/20 text-gray-900/60 active:scale-95"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Bulk actions */}
      {tab === "pending" ? (
        <div className="mt-3 glass-card rounded-3xl p-3 border border-white/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-extrabold text-gray-900/70 inline-flex items-center gap-2">
              <Layers size={16} />
              Selected: {selectedCount}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="px-3 py-2 rounded-2xl bg-white/30 border border-white/20 text-gray-900/80 font-extrabold active:scale-95"
                disabled={!filtered.length}
              >
                Select all
              </button>
              <button
                type="button"
                onClick={deselectAll}
                className="px-3 py-2 rounded-2xl bg-white/30 border border-white/20 text-gray-900/80 font-extrabold active:scale-95"
                disabled={!selectedCount}
              >
                Deselect all
              </button>
              <button
                type="button"
                onClick={() => approveIds(Array.from(selectedIds))}
                className={`px-3 py-2 rounded-2xl font-extrabold active:scale-95 inline-flex items-center gap-2 ${
                  selectedCount
                    ? "bg-indigo-600 text-white shadow-indigo-200"
                    : "bg-white/20 text-gray-700/50 border border-white/20"
                }`}
                disabled={!selectedCount}
              >
                <Check size={16} />
                Approve selected
              </button>
              <button
                type="button"
                onClick={() => deleteIds(Array.from(selectedIds))}
                className={`px-3 py-2 rounded-2xl font-extrabold active:scale-95 inline-flex items-center gap-2 ${
                  selectedCount
                    ? "bg-red-600 text-white shadow-red-200"
                    : "bg-white/20 text-gray-700/50 border border-white/20"
                }`}
                disabled={!selectedCount}
              >
                <Trash2 size={16} />
                Delete selected
              </button>

              <button
                type="button"
                onClick={() => autoCategorizeIds(Array.from(selectedIds))}
                className={`px-3 py-2 rounded-2xl font-extrabold active:scale-95 inline-flex items-center gap-2 ${
                  selectedCount
                    ? "bg-emerald-600 text-white shadow-emerald-200"
                    : "bg-white/20 text-gray-700/50 border border-white/20"
                }`}
                disabled={!selectedCount}
                title="จัดหมวดหมู่อัตโนมัติ (เติมเฉพาะที่ว่าง)"
              >
                <Sparkles size={16} />
                Auto-categorize
              </button>

              <button
                type="button"
                onClick={selectDuplicatesOnly}
                className="px-3 py-2 rounded-2xl bg-white/30 border border-white/20 text-gray-900/80 font-extrabold active:scale-95 inline-flex items-center gap-2"
                disabled={!filtered.length}
                title="เลือกเฉพาะรายการที่ระบบมองว่าอาจซ้ำ"
              >
                <AlertTriangle size={16} />
                Select duplicates
              </button>

              <button
                type="button"
                onClick={() => approveIds(filtered.map((x) => x.id))}
                className="px-3 py-2 rounded-2xl bg-indigo-600 text-white shadow-indigo-200 font-extrabold active:scale-95 inline-flex items-center gap-2"
                disabled={!filtered.length}
                title="Approve ทุกรายการที่แสดง (ตาม filter/search)"
              >
                <Check size={16} />
                Approve all shown
              </button>

              <button
                type="button"
                onClick={() => deleteIds(filtered.map((x) => x.id))}
                className="px-3 py-2 rounded-2xl bg-red-600 text-white shadow-red-200 font-extrabold active:scale-95 inline-flex items-center gap-2"
                disabled={!filtered.length}
                title="ลบทุกรายการที่แสดง (ตาม filter/search)"
              >
                <Trash2 size={16} />
                Delete all shown
              </button>

            </div>
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="mt-8 glass-card rounded-3xl p-6 text-center border border-white/20">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-gray-900/10 flex items-center justify-center">
            <Inbox size={22} />
          </div>
          <div className="mt-3 text-lg font-extrabold text-gray-900">ไม่มีรายการ</div>
          <div className="mt-1 text-sm text-gray-900/60">
            {tab === "pending" ? "ลองสแกนใบเสร็จ แล้วเลือก “Send to Inbox”" : "ยังไม่มีรายการที่ approve แล้ว"}
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 min-w-0 overflow-x-hidden">
          {filtered.map((it) => {
            const txType = normalizeTxType(it?.type || it?.txType);
            const { label, icon: Icon } = typeBadge(txType);

            const isSplitItem =
              (txType === "expense" || txType === "income") &&
              !!it?.splitByCategory &&
              Array.isArray(it?.groups) &&
              it.groups.length >= 2;

            const hasBreakdown = (txType === "expense" || txType === "income") && Array.isArray(it?.groups) && it.groups.length > 0;

            const accountLabel = it?.accountId ? accountsById.get(it.accountId)?.name : "";
            const fromLabel = it?.fromAccountId ? accountsById.get(it.fromAccountId)?.name : "";
            const toLabel = it?.toAccountId ? accountsById.get(it.toAccountId)?.name : "";
            const catLabel = it?.categoryId ? categoriesById.get(it.categoryId)?.name : "";
            const ref = it?.referenceId || it?.ref || "";
            const docTypeLabel = formatDocTypeLabel(getInboxDocType(it));
            const scanConfidence = readOverallConfidence(it?.scanMeta?.confidence || it?.meta?.confidence || null);
            const accountMatchBadge = getAccountMatchBadge(it);
            const requiredFixes = getRequiredFixes(it);

            const isSelected = selectedIds.has(it.id);

            return (
              <div key={it.id} className="glass-card rounded-3xl p-4 border border-white/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {tab === "pending" ? (
                        <button
                          type="button"
                          onClick={() => toggleSelect(it.id)}
                          className={`w-6 h-6 rounded-lg border flex items-center justify-center active:scale-95 ${
                            isSelected ? "bg-gray-900/90 border-white/10" : "bg-white/30 border-white/20"
                          }`}
                          aria-label="select"
                        >
                          {isSelected ? <Check size={14} className="text-white" /> : null}
                        </button>
                      ) : null}

                      <div className="px-3 py-1.5 rounded-2xl bg-white/30 border border-white/20 text-xs font-extrabold inline-flex items-center gap-2">
                        <Icon size={14} />
                        {label}
                      </div>

                      {it?.duplicate ? (
                        <div className="px-2.5 py-1.5 rounded-2xl bg-amber-100/80 border border-amber-200 text-xs font-extrabold text-amber-800 inline-flex items-center gap-2">
                          <AlertTriangle size={14} />
                          Possible duplicate
                        </div>
                      ) : null}

                      {docTypeLabel ? (
                        <div className="px-2.5 py-1.5 rounded-2xl bg-slate-100/90 border border-slate-200 text-xs font-extrabold text-slate-700">
                          {docTypeLabel}
                        </div>
                      ) : null}

                      {scanConfidence != null ? (
                        <div className="px-2.5 py-1.5 rounded-2xl bg-sky-100/90 border border-sky-200 text-xs font-extrabold text-sky-800">
                          Scan {Math.round(scanConfidence * 100)}%
                        </div>
                      ) : null}

                      {accountMatchBadge ? (
                        <div
                          className={[
                            "px-2.5 py-1.5 rounded-2xl border text-xs font-extrabold",
                            accountMatchBadge.tone === "ok"
                              ? "bg-emerald-100/85 border-emerald-200 text-emerald-800"
                              : accountMatchBadge.tone === "info"
                                ? "bg-blue-100/85 border-blue-200 text-blue-800"
                                : "bg-orange-100/90 border-orange-200 text-orange-800",
                          ].join(" ")}
                        >
                          {accountMatchBadge.label}
                        </div>
                      ) : null}

                      {requiredFixes.length ? (
                        <div className="px-2.5 py-1.5 rounded-2xl bg-rose-100/90 border border-rose-200 text-xs font-extrabold text-rose-800">
                          Fix: {requiredFixes.slice(0, 2).join(", ")}
                        </div>
                      ) : null}

                      {tab === "approved" ? (
                        <div className="px-2.5 py-1.5 rounded-2xl bg-emerald-100/70 border border-emerald-200 text-xs font-extrabold text-emerald-800">
                          Approved
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-2 text-2xl font-black text-gray-900">
                      {isPositiveNumber(Number(it?.amount)) ? formatCurrency(Number(it.amount)) : "—"}
                    </div>

                    <div className="mt-1 text-sm text-gray-900/70 whitespace-normal break-words wrap-anywhere">
                      {it?.date || "(no date)"}
                      {it?.merchant ? ` • ${it.merchant}` : ""}
                    </div>

                    <AttachmentThumb attachmentId={it?.attachmentId} />

                    <div className="mt-2 text-xs text-gray-900/60 space-y-1 min-w-0">
                      {txType === "transfer" || txType === "credit_payment" ? (
                        <div className="whitespace-normal break-words wrap-anywhere">
                          {fromLabel || "(from?)"} → {toLabel || "(to?)"}
                        </div>
                      ) : (
                        <div className="whitespace-normal break-words wrap-anywhere">
                          {accountLabel || "(account?)"}
                          {!isSplitItem && catLabel ? ` • ${catLabel}` : ""}
                          {isSplitItem ? ` • Split (${it.groups.length})` : (hasBreakdown ? ` • Receipt (${it.groups.length})` : "")}
                        </div>
                      )}
                      {ref ? <div className="break-all">ref: {ref}</div> : null}
                      {it?.note ? (
                        <div className="whitespace-pre-wrap break-words wrap-anywhere">{it.note}</div>
                      ) : null}
                    </div>

                    {/* ✅ Full breakdown list (scroll inside card) */}
                    {hasBreakdown ? (
                      <div
                        className="mt-3 rounded-2xl bg-white/20 border border-white/15 p-3 max-h-28 overflow-y-auto overflow-x-hidden no-scrollbar"
                      >
                        <div className="text-[10px] font-extrabold text-gray-900/55 uppercase tracking-wide mb-2">
                          Breakdown ({it.groups.length})
                        </div>
                        <div className="space-y-2">
                          {it.groups.map((g, idx) => {
                            const cat = categoriesById.get(String(g?.categoryId || "")) || null;
                            const amt = formatCurrency(Number(g?.amount) || 0);
                            const lineNote = String(g?.note || "").trim();
                            const rlt = String(g?.receiptLineType || "item").toLowerCase().trim();
                            const eff = String(g?.adjustmentEffect || "add").toLowerCase().trim();
                            const isAdj = rlt === "adjustment";
                            const isSubtract = isAdj && eff === "subtract";
                            const isAddAdj = isAdj && eff === "add";
                            const sign = isSubtract ? "-" : (isAddAdj ? "+" : "");
                            const cls = isSubtract ? "text-red-700" : (isAddAdj ? "text-emerald-700" : "text-gray-900/85");
                            return (
                              <div key={`${it.id}-g-${idx}`} className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-extrabold text-gray-900/85 break-words whitespace-normal wrap-anywhere">
                                    {cat?.name || "—"}
                                  </div>
                                  {lineNote ? (
                                    <div className="text-[11px] text-gray-900/60 break-words whitespace-normal wrap-anywhere">
                                      {lineNote}
                                    </div>
                                  ) : null}
                                </div>
                                <div className={`shrink-0 text-xs font-black ${cls}`}>
                                  {sign}{amt}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2 shrink-0">
                    {tab === "pending" ? (
                      <>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditingId(String(it.id)); }}
                          className="px-4 py-2 rounded-2xl bg-white/30 border border-white/20 text-gray-900/80 font-extrabold active:scale-95 inline-flex items-center justify-center gap-2"
                        >
                          <Edit2 size={16} />
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); approveIds([it.id]); }}
                          className="px-4 py-2 rounded-2xl bg-indigo-600 text-white font-extrabold shadow-indigo-200 active:scale-95 inline-flex items-center justify-center gap-2"
                        >
                          <Check size={16} />
                          Approve
                        </button>
                      </>
                    ) : null}

                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); deleteIds([it.id]); }}
                      className="px-4 py-2 rounded-2xl bg-white/30 border border-white/20 text-gray-900/70 font-bold active:scale-95 inline-flex items-center justify-center gap-2"
                    >
                      <Trash2 size={16} />
                      {tab === "pending" ? "Delete" : "Remove"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <InboxItemReviewModal
        isOpen={!!editingId}
        item={editingItem}
        accounts={state.accounts || []}
        categoriesByType={state.categories || { expense: [], income: [] }}
        merchants={state.merchants || []}
        recentExpenseCats={recentExpenseCatsForPicker}
        recentIncomeCats={recentIncomeCatsForPicker}
        recentExpenseAccounts={recentExpenseAccountsForPicker}
        recentIncomeAccounts={recentIncomeAccountsForPicker}
        showAlert={showAlert}
        onClose={() => setEditingId(null)}
        onSave={(id, patch) => {
          const base = editingItem || (inbox || []).find((x) => x.id === id) || {};
          let nextItem = { ...base, ...patch, id };

          const isSplit =
            !!nextItem?.splitByCategory && Array.isArray(nextItem?.groups) && nextItem.groups.length >= 2;

          // ✅ Smart Merchant Dictionary: normalize + optional autofill
          try {
            const canon = resolveMerchantCanonical(nextItem.merchant || nextItem.note, state?.merchants || []);
            if (canon) {
              patch = { ...patch, merchant: canon };
              nextItem = { ...nextItem, merchant: canon };
            }

            const mdPatch = deriveMerchantAutofillPatch(
              {
                merchant: nextItem.merchant,
                txType: nextItem.type || nextItem.txType,
                categoryId: nextItem.categoryId,
                accountId: nextItem.accountId,
              },
              state?.merchants || []
            );

            // For split items, we never override the per-line categories
            if (isSplit && mdPatch && typeof mdPatch === "object") {
              delete mdPatch.categoryId;
            }

            // Only apply autofill when it fills missing/generic fields
            if (mdPatch && Object.keys(mdPatch).length) {
              patch = { ...patch, ...mdPatch };
              nextItem = { ...nextItem, ...mdPatch };
            }
          } catch {
            // ignore
          }

          // ✅ Re-evaluate possible duplicate after editing (amount/date/merchant/ref/digits changes)
          try {
            const dupState = duplicateStateFromMatch(getInboxDuplicateMatch(nextItem));
            patch = {
              ...patch,
              duplicate: dupState.duplicate,
              duplicateInfo: dupState.duplicateInfo,
            };
            nextItem = { ...nextItem, ...dupState };
          } catch {
            // ignore
          }

          updateInboxItem(id, patch);

          // ✅ Learn mapping after user edits in Inbox (before approval)
          try {
            const t = String(nextItem?.type || nextItem?.txType || "").toLowerCase();
            if (!isSplit && (t === "expense" || t === "income") && String(nextItem?.merchant || "").trim()) {
              learnMerchant?.({
                merchant: String(nextItem.merchant || "").trim(),
                txType: t,
                categoryId: String(nextItem?.categoryId || ""),
                accountId: String(nextItem?.accountId || ""),
              });
            }
          } catch {
            // ignore
          }

          setEditingId(null);
          showAlert?.("บันทึกการแก้ไขแล้ว");
        }}
      />
      </main>
    </div>
  );
}
