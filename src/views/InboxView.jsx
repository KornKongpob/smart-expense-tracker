import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";

import { useAppStore } from "../store/store";
import { findFuzzyDuplicate } from "../store/selectors";
import { generateId, generateTransferId, generateSplitGroupId } from "../utils/id";
import { formatCurrency, toISODate } from "../utils/format";
import { parseMoneyToSatang, sanitizeMoneyInput, formatMoneyInputFromSatang } from "../utils/money";
import { useBlobUrl } from "../utils/useBlobUrl";
import {
  resolveMerchantCanonical,
  deriveMerchantAutofillPatch,
} from "../utils/merchantDictionary";
import { splitReceiptItemsToLines, sanitizeCategoryKey } from "../utils/receiptCategorizer";
import { reconcileReceiptGroups, signedReceiptGroupSatang, isAdjustmentLike } from "../utils/receiptAdjustments.js";

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

function buildTransactionsFromInboxItem(item) {
  const txType = normalizeTxType(item?.type || item?.txType);
  const date = item?.date ? String(item.date).slice(0, 10) : toISODate(new Date());
  const merchant = item?.merchant || "";
  const note = appendEvidenceToNote(item?.note || "", item?.evidence);
  const ref = item?.referenceId || item?.ref || "";

  // Split (receipt items): create 1 parent transaction + N child transactions
  // ✅ Ignore zero/invalid lines (amount <= 0)
  const hasSplitGroups = Array.isArray(item?.groups) && item.groups.length >= 2;
  if (txType === "expense" && (item?.splitByCategory || hasSplitGroups) && hasSplitGroups) {
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
        return {
          key: String(gg?.key || ""),
          categoryId,
          amount,
          note: note0,
          receiptLineType,
          adjustmentType,
          adjustmentEffect,
          splitIndex,
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

      let amount = asSatang(item?.amount);
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
          source: "inbox",
        },
      ];
    }

    // Parent amount: prefer item.amount if provided, else signed sum
    let parentAmount = asSatang(item?.amount);
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
        source: "inbox",
        transferKind,
      },
    ];
  }

  // Normal income/expense
  const accountId = item?.accountId || "";
  const amount = asSatang(item?.amount);
  const categoryId = item?.categoryId || item?.category || "";

  if (!accountId) throw new Error("ยังไม่ได้เลือก Account");
  if (!categoryId) throw new Error("ยังไม่ได้เลือก Category");
  if (!isPositiveNumber(amount)) throw new Error("ยอดเงินต้องมากกว่า 0");

  return [
    {
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
      source: "inbox",
    },
  ];
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
  const url = useBlobUrl(attachmentId);
  const id = String(attachmentId || "").trim();
  if (!id) return null;

  return (
    <div className="mt-2 w-full max-w-[220px]">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="block rounded-2xl overflow-hidden border border-white/20 bg-white/10"
        >
          <img src={url} alt="attachment" className="w-full h-28 object-cover" />
        </a>
      ) : (
        <div className="text-xs text-gray-900/55">Loading attachment…</div>
      )}
    </div>
  );
}

function EditorModal({ open, item, accounts, categories, onClose, onSave, showAlert }) {
  const [draft, setDraft] = useState(null);

  const attachmentUrl = useBlobUrl(draft?.attachmentId);

  const defaultCashAccountId = useMemo(() => {
    const arr = Array.isArray(accounts) ? accounts : [];
    const hit = arr.find((a) => String(a?.type || "").toLowerCase().trim() === "cash")
      || arr.find((a) => String(a?.name || "").includes("เงินสด"))
      || arr.find((a) => String(a?.id || "").toLowerCase().includes("cash"));
    return String(hit?.id || "");
  }, [accounts]);

  // ✅ Keep category keys safe (fallback to "other" if unknown)
  const ensureExpenseCategoryId = (key) => {
    const k = String(key || "").trim();
    const exp = categories?.expense || [];
    if (k && exp.some((c) => String(c?.id || "") === k)) return k;
    if (exp.some((c) => String(c?.id || "") === "other")) return "other";
    return String(exp?.[0]?.id || "");
  };
  const deriveReceiptGroups = (it) => {
    try {
      const docType = String(it?.docType || it?.doc_type || "").toLowerCase().trim();
      const txType = normalizeTxType(it?.type || it?.txType);
      if (txType !== "expense") return []; // receipts => expense only

      const items = Array.isArray(it?.items) ? it.items : [];
      if (items.length < 2) return [];

      // Treat as a receipt if:
      // - model says receipt, OR
      // - we have >=2 priced line items (name + amount > 0)
      const pricedCount = items.reduce((n, it0) => {
        const name = String(it0?.name || it0?.title || it0?.desc || "").trim();
        const amt =
          Number(it0?.line_total) ||
          Number(it0?.total) ||
          Number(it0?.amount) ||
          Number(it0?.lineTotal) ||
          0;
        return name && Number.isFinite(amt) && amt > 0 ? n + 1 : n;
      }, 0);

      const looksLikeReceipt = docType === "receipt" || pricedCount >= 2;
      if (!looksLikeReceipt) return [];

      // Avoid deriving split for obvious non-receipt docs
      if (docType === "transfer_slip" || docType === "bill_payment") return [];

      const fallbackKey = String(it?.categoryId || it?.category_key || it?.category || "").trim() || "other";
      const hint = `${String(it?.merchant || "").trim()} ${String(it?.note || "").trim()}`.trim();

      const lines = splitReceiptItemsToLines("expense", items, hint, fallbackKey);
      let groups = (lines || [])
        .filter((ln) => (Number(ln?.amount) || 0) > 0)
        .map((ln, idx) => {
          const key = sanitizeCategoryKey(ln?.key || "other") || "other";
          return {
            key,
            categoryId: ensureExpenseCategoryId(key),
            amount: parseMoneyToSatang(ln?.amount),
            note: String(ln?.name || "").trim(),
            splitIndex: idx + 1,
            splitCount: (lines || []).length,
            receiptLineType: "item",
            adjustmentEffect: "add",
          };
        });

      // Need at least 2 purchased lines to behave as Split
      if (groups.length < 2) return [];

      // ✅ Reconcile to paid total (adds "ส่วนลด" line when needed)
      const paidTotal = asSatang(it?.amount);
      const rec = reconcileReceiptGroups(groups, paidTotal, {
        ensureCategoryId: (k) => ensureExpenseCategoryId(k),
        baseLineCountMin: 2,
      });
      groups = rec.groups;
      return groups;
    } catch {
      return [];
    }
  };

  useEffect(() => {
    if (!open) return;
    if (!item) return;

    const txType = normalizeTxType(item?.type || item?.txType);
    // ✅ Auto-enable Split for multi-item receipts (even if splitByCategory/groups missing)
    // This prevents the "Edit -> Split review not working" case.
    const derived = deriveReceiptGroups(item);
    const rawGroups = Array.isArray(item?.groups) ? item.groups : [];
    const shouldSplit = (rawGroups.length >= 2) || (derived.length >= 2);
    const effectiveGroupsRaw = shouldSplit ? (rawGroups.length >= 2 ? rawGroups : derived) : [];

    const normalizeGroup = (g, idx) => {
      const gg = g && typeof g === "object" ? g : {};
      const amountSatang = asSatang(gg?.amount);
      const key = sanitizeCategoryKey(gg?.key || gg?.categoryKey || gg?.category_key || "") || "";
      const cat0 = String(gg?.categoryId || gg?.category || "").trim();
      const categoryId = cat0 || (key ? ensureExpenseCategoryId(key) : ensureExpenseCategoryId("other"));
      const note = String(gg?.note || gg?.name || gg?.title || "").trim();

      const adjLike = isAdjustmentLike(gg) || categoryId === "discount";
      const receiptLineType = adjLike ? "adjustment" : "item";
      let adjustmentEffect = String(gg?.adjustmentEffect || gg?.effect || "").toLowerCase().trim();
      if (receiptLineType === "adjustment" && adjustmentEffect !== "subtract" && adjustmentEffect !== "add") {
        adjustmentEffect = categoryId === "discount" ? "subtract" : "add";
      }
      if (receiptLineType === "item") adjustmentEffect = "add";

      const adjustmentType = String(gg?.adjustmentType || "").trim() || (categoryId === "discount" ? "discount" : "");
      const splitIndex = Number(gg?.splitIndex || 0) || idx + 1;
      return {
        key,
        categoryId,
        amount: amountSatang,
        note,
        splitIndex,
        receiptLineType,
        adjustmentType,
        adjustmentEffect,
      };
    };

    let groupsSatang = (effectiveGroupsRaw || [])
      .map((g, idx) => normalizeGroup(g, idx))
      .filter((g) => isPositiveNumber(g.amount));

    const nonAdjCount = groupsSatang.filter((g) => !isAdjustmentLike(g)).length;
    const isSplit = shouldSplit && nonAdjCount >= 2;

    // ✅ Keep a stable paid-total (parent) and reconcile groups to it
    let paidTotalSatang = asSatang(item?.amount);
    if (!isPositiveNumber(paidTotalSatang)) {
      // fallback: compute from signed groups (items + adjustments)
      const sumSigned = groupsSatang.reduce((s, g) => s + signedReceiptGroupSatang(g), 0);
      paidTotalSatang = Math.abs(sumSigned);
    }

    if (isSplit && isPositiveNumber(paidTotalSatang)) {
      const rec = reconcileReceiptGroups(groupsSatang, paidTotalSatang, {
        ensureCategoryId: (k) => ensureExpenseCategoryId(k),
        baseLineCountMin: 2,
      });
      groupsSatang = rec.groups.filter((g) => isPositiveNumber(g.amount));
    }

    const paymentMethod = String(item?.paymentMethod || item?.payment_method || "cash");
    const accountIdRaw = String(item?.accountId || "");
    const autoAccountId = !accountIdRaw && paymentMethod === "cash" ? defaultCashAccountId : accountIdRaw;

    setDraft({
      ...item,
      type: txType,
      amount: isPositiveNumber(paidTotalSatang) ? formatMoneyInputFromSatang(paidTotalSatang) : "",
      date: item?.date ? String(item.date).slice(0, 10) : toISODate(new Date()),
      merchant: String(item?.merchant || ""),
      categoryId: String(item?.categoryId || item?.category || (txType === "transfer" || txType === "credit_payment" ? "transfer" : "")),
      accountId: autoAccountId,
      fromAccountId: String(item?.fromAccountId || ""),
      toAccountId: String(item?.toAccountId || ""),
      paymentMethod,
      note: String(item?.note || ""),
      referenceId: String(item?.referenceId || item?.ref || ""),

      paidTotalSatang: paidTotalSatang,

      // ✅ Split-by-category preview/edit in Inbox
      splitByCategory: isSplit,
      splitGroupId: isSplit ? (String(item?.splitGroupId || "").trim() || generateSplitGroupId()) : "",
      splitLabel: isSplit
        ? (String(item?.splitLabel || item?.merchant || item?.note || "Receipt").trim().slice(0, 80) || "Receipt")
        : "",
      groups: isSplit
        ? (groupsSatang || []).map((g) => ({
            key: g?.key || "",
            categoryId: String(g?.categoryId || ""),
            amount: formatMoneyInputFromSatang(asSatang(g.amount)),
            note: String(g?.note || ""),
            receiptLineType: String(g?.receiptLineType || "item"),
            adjustmentType: String(g?.adjustmentType || ""),
            adjustmentEffect: String(g?.adjustmentEffect || "add"),
          }))
        : [],
    });
  }, [open, item, categories]);

  if (!open || !draft) return null;

  const txType = normalizeTxType(draft.type);
  const expenseCats = categories?.expense || [];
  const incomeCats = categories?.income || [];
  const catList = txType === "income" ? incomeCats : expenseCats;

  const isSplitMode =
    (txType === "expense" || txType === "income") &&
    !!draft?.splitByCategory &&
    Array.isArray(draft?.groups);

  // IMPORTANT: Avoid conditional hooks inside this modal.
  // Using useMemo here would break the Rules of Hooks because the modal returns early
  // before draft is initialized.
  const splitTotal = (() => {
    if (!isSplitMode) return parseMoneyToSatang(draft?.amount);
    const signed = (draft.groups || []).reduce((s, g) => {
      const a = parseMoneyToSatang(g?.amount);
      if (!(a > 0)) return s;
      const eff = String(g?.adjustmentEffect || "add").toLowerCase().trim();
      return s + (eff === "subtract" ? -a : a);
    }, 0);
    return Math.abs(signed);
  })();

  const reconcileDraftGroups = (baseDraft, nextGroupsDraft) => {
    try {
      const d0 = baseDraft || {};
      const raw = Array.isArray(nextGroupsDraft) ? nextGroupsDraft : [];

      let groupsSatang = raw
        .map((g, idx) => {
          const gg = g && typeof g === "object" ? g : {};
          const key = sanitizeCategoryKey(gg?.key || gg?.categoryKey || gg?.category_key || "") || "";
          const cat0 = String(gg?.categoryId || gg?.category || "").trim();
          const categoryId = cat0 || (key ? ensureExpenseCategoryId(key) : ensureExpenseCategoryId("other"));
          const amount = parseMoneyToSatang(gg?.amount);
          const note = String(gg?.note || "").trim();

          const receiptLineType = String(gg?.receiptLineType || "").toLowerCase().trim() || (categoryId === "discount" ? "adjustment" : "item");
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

          return {
            key,
            categoryId,
            amount,
            note,
            splitIndex,
            receiptLineType: receiptLineType === "adjustment" ? "adjustment" : "item",
            adjustmentType,
            adjustmentEffect,
          };
        })
        .filter((g) => isPositiveNumber(g.amount));

      const nonAdjCount = groupsSatang.filter((g) => !isAdjustmentLike(g)).length;

      let target = Number(d0?.paidTotalSatang) || 0;
      if (!isPositiveNumber(target)) target = parseMoneyToSatang(d0?.amount);
      if (!isPositiveNumber(target)) {
        const sumSigned = groupsSatang.reduce((s, g) => s + signedReceiptGroupSatang(g), 0);
        target = Math.abs(sumSigned);
      }

      if (nonAdjCount >= 2 && isPositiveNumber(target)) {
        const rec = reconcileReceiptGroups(groupsSatang, target, {
          ensureCategoryId: (k) => ensureExpenseCategoryId(k),
          baseLineCountMin: 2,
        });
        groupsSatang = rec.groups.filter((g) => isPositiveNumber(g.amount));
      }

      return {
        paidTotalSatang: isPositiveNumber(target) ? target : 0,
        groupsDraft: groupsSatang.map((g) => ({
          key: g?.key || "",
          categoryId: String(g?.categoryId || "").trim(),
          amount: formatMoneyInputFromSatang(asSatang(g.amount)),
          note: String(g?.note || ""),
          receiptLineType: String(g?.receiptLineType || "item"),
          adjustmentType: String(g?.adjustmentType || ""),
          adjustmentEffect: String(g?.adjustmentEffect || "add"),
          splitIndex: Number(g?.splitIndex || 0) || 0,
        })),
      };
    } catch {
      return { paidTotalSatang: 0, groupsDraft: Array.isArray(nextGroupsDraft) ? nextGroupsDraft : [] };
    }
  };

  const toggleSplitMode = () => {
    setDraft((d) => {
      if (!d) return d;
      const curType = normalizeTxType(d.type);
      if (curType !== "expense" && curType !== "income") return d;

      const nextOn = !d.splitByCategory;
      if (nextOn) {
        // ✅ If this is a receipt with multiple items, seed split lines from OCR/LLM items
        const derived = deriveReceiptGroups(d);
        const seeded = derived.length >= 2
          ? derived.map((g, idx) => ({
              key: g.key || "",
              categoryId: String(g.categoryId || "").trim(),
              amount: formatMoneyInputFromSatang(asSatang(g.amount)),
              note: String(g.note || ""),
              receiptLineType: String(g?.receiptLineType || "item"),
              adjustmentType: String(g?.adjustmentType || ""),
              adjustmentEffect: String(g?.adjustmentEffect || "add"),
              splitIndex: Number(g?.splitIndex || 0) || idx + 1,
            }))
          : Array.isArray(d.groups) && d.groups.length
            ? d.groups
            : [
                {
                  key: "",
                  categoryId: String(d.categoryId || ""),
                  amount: String(d.amount ?? ""),
                  note: "",
                  receiptLineType: "item",
                  adjustmentType: "",
                  adjustmentEffect: "add",
                  splitIndex: 1,
                },
                {
                  key: "",
                  categoryId: "",
                  amount: "",
                  note: "",
                  receiptLineType: "item",
                  adjustmentType: "",
                  adjustmentEffect: "add",
                  splitIndex: 2,
                },
              ];

        const rec = reconcileDraftGroups(d, seeded);
        const nextPaid = isPositiveNumber(rec?.paidTotalSatang)
          ? rec.paidTotalSatang
          : isPositiveNumber(Number(d?.paidTotalSatang))
            ? Number(d.paidTotalSatang)
            : parseMoneyToSatang(d?.amount);

        return {
          ...d,
          splitByCategory: true,
          groups: rec?.groupsDraft || seeded,
          splitGroupId: String(d.splitGroupId || "").trim() || generateSplitGroupId(),
          splitLabel: String(d.splitLabel || d.merchant || d.note || "Split"),
          // split uses per-line categories
          categoryId: "",
          paidTotalSatang: isPositiveNumber(nextPaid) ? nextPaid : d?.paidTotalSatang,
          amount: isPositiveNumber(nextPaid) ? formatMoneyInputFromSatang(nextPaid) : d?.amount,
        };
      }

      // turn off split → collapse to single (take first line if possible)
      const g0 = Array.isArray(d.groups) && d.groups.length
        ? (d.groups.find((x) => String(x?.receiptLineType || "").toLowerCase().trim() !== "adjustment") || d.groups[0])
        : null;
      return {
        ...d,
        splitByCategory: false,
        groups: [],
        amount: String(g0?.amount ?? d.amount ?? ""),
        categoryId: String(g0?.categoryId || d.categoryId || ""),
        splitLabel: "",
        splitGroupId: "",
      };
    });
  };

  const updateGroup = (idx, patch) => {
    setDraft((d) => {
      const groups = Array.isArray(d?.groups) ? [...d.groups] : [];
      if (!groups[idx]) return d;
      groups[idx] = { ...groups[idx], ...patch };
      if (!d?.splitByCategory) return { ...d, groups };
      const rec = reconcileDraftGroups(d, groups);
      const nextPaid = isPositiveNumber(Number(d?.paidTotalSatang)) ? Number(d.paidTotalSatang) : rec?.paidTotalSatang;
      return {
        ...d,
        groups: rec?.groupsDraft || groups,
        paidTotalSatang: isPositiveNumber(nextPaid) ? nextPaid : d?.paidTotalSatang,
        amount: isPositiveNumber(nextPaid) ? formatMoneyInputFromSatang(nextPaid) : d?.amount,
      };
    });
  };

  const addGroup = () => {
    setDraft((d) => {
      const groups = Array.isArray(d?.groups) ? [...d.groups] : [];
      groups.push({
        key: "",
        categoryId: "",
        amount: "",
        note: "",
        receiptLineType: "item",
        adjustmentType: "",
        adjustmentEffect: "add",
        splitIndex: groups.length + 1,
      });
      if (!d?.splitByCategory) return { ...d, groups };
      const rec = reconcileDraftGroups(d, groups);
      const nextPaid = isPositiveNumber(Number(d?.paidTotalSatang)) ? Number(d.paidTotalSatang) : rec?.paidTotalSatang;
      return {
        ...d,
        groups: rec?.groupsDraft || groups,
        paidTotalSatang: isPositiveNumber(nextPaid) ? nextPaid : d?.paidTotalSatang,
        amount: isPositiveNumber(nextPaid) ? formatMoneyInputFromSatang(nextPaid) : d?.amount,
      };
    });
  };

  const removeGroup = (idx) => {
    setDraft((d) => {
      const groups = Array.isArray(d?.groups) ? [...d.groups] : [];
      groups.splice(idx, 1);
      if (!d?.splitByCategory) return { ...d, groups };
      const rec = reconcileDraftGroups(d, groups);
      const nextPaid = isPositiveNumber(Number(d?.paidTotalSatang)) ? Number(d.paidTotalSatang) : rec?.paidTotalSatang;
      return {
        ...d,
        groups: rec?.groupsDraft || groups,
        paidTotalSatang: isPositiveNumber(nextPaid) ? nextPaid : d?.paidTotalSatang,
        amount: isPositiveNumber(nextPaid) ? formatMoneyInputFromSatang(nextPaid) : d?.amount,
      };
    });
  };

  const commit = () => {
    const amount = isSplitMode ? splitTotal : parseMoneyToSatang(draft?.amount);
    if (!isPositiveNumber(amount)) {
      showAlert?.("กรุณากรอกยอดเงินให้มากกว่า 0");
      return;
    }

    if (txType === "transfer" || txType === "credit_payment") {
      if (!draft.fromAccountId || !draft.toAccountId) {
        showAlert?.("กรุณาเลือก From/To account");
        return;
      }
      if (draft.fromAccountId === draft.toAccountId) {
        showAlert?.("Transfer ต้องเลือก From และ To คนละบัญชี");
        return;
      }
    } else {
      if (!draft.accountId) {
        showAlert?.("กรุณาเลือก Account");
        return;
      }
      if (!isSplitMode && !draft.categoryId) {
        showAlert?.("กรุณาเลือก Category");
        return;
      }

      if (isSplitMode) {
        const groupsRaw = Array.isArray(draft.groups) ? draft.groups : [];
        // ✅ Ignore zero/invalid lines: only keep groups with amount > 0
        const groups = groupsRaw
          .map((g) => ({
            ...g,
            amountSatang: parseMoneyToSatang(g?.amount),
            receiptLineType: String(g?.receiptLineType || "item"),
            adjustmentEffect: String(g?.adjustmentEffect || "add"),
          }))
          .filter((g) => isPositiveNumber(g.amountSatang));

        const nonAdjCount = groups.filter((g) => String(g?.receiptLineType || "").toLowerCase().trim() !== "adjustment").length;
        if (nonAdjCount < 2) {
          showAlert?.("Split ต้องมีรายการสินค้าจริงอย่างน้อย 2 บรรทัด (ไม่รวมส่วนลด/ปรับยอด)");
          return;
        }

        for (const g of groups) {
          if (!String(g?.categoryId || "").trim()) {
            showAlert?.("กรุณาเลือก Category ให้ครบทุกบรรทัดของ Split");
            return;
          }
        }
      }
    }

    const patch = {
      type: txType,
      amount,
      date: String(draft.date || toISODate(new Date())).slice(0, 10),
      merchant: String(draft.merchant || "").trim(),
      note: String(draft.note || ""),
      referenceId: String(draft.referenceId || ""),
      categoryId:
        txType === "transfer" || txType === "credit_payment"
          ? "transfer"
          : isSplitMode
            ? ""
            : String(draft.categoryId || ""),
      accountId: txType === "transfer" || txType === "credit_payment" ? "" : String(draft.accountId || ""),
      paymentMethod:
        txType === "transfer" || txType === "credit_payment"
          ? ""
          : String(draft.paymentMethod || "cash"),
      fromAccountId: txType === "transfer" || txType === "credit_payment" ? String(draft.fromAccountId || "") : "",
      toAccountId: txType === "transfer" || txType === "credit_payment" ? String(draft.toAccountId || "") : "",
    };

    if (isSplitMode) {
      const gid = String(draft?.splitGroupId || "").trim() || generateSplitGroupId();
      const label = String(draft?.splitLabel || draft?.merchant || draft?.note || "Split")
        .trim()
        .slice(0, 80) || "Split";

      // ✅ Make sure we persist the reconciled lines (including discount adjustment)
      const rec = reconcileDraftGroups(draft, draft.groups || []);
      const groupsDraft = Array.isArray(rec?.groupsDraft) && rec.groupsDraft.length ? rec.groupsDraft : (draft.groups || []);

      const groups = (groupsDraft || [])
        .map((g, idx) => ({
          key: g?.key || "",
          categoryId: String(g?.categoryId || "").trim(),
          amount: parseMoneyToSatang(g?.amount),
          note: String(g?.note || ""),
          receiptLineType: String(g?.receiptLineType || "item"),
          adjustmentType: String(g?.adjustmentType || ""),
          adjustmentEffect: String(g?.adjustmentEffect || "add"),
          splitIndex: Number(g?.splitIndex || 0) || idx + 1,
        }))
        .filter((g) => isPositiveNumber(g.amount));

      patch.splitByCategory = true;
      patch.splitGroupId = gid;
      patch.splitLabel = label;
      patch.groups = groups;
    } else {
      // If user switched from split to single, clear split fields
      patch.splitByCategory = false;
      patch.splitGroupId = "";
      patch.splitLabel = "";
      patch.groups = [];
    }

    onSave?.(draft.id, patch);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-md glass-card rounded-3xl p-5 border border-white/20 max-h-[90vh] overflow-y-auto overflow-x-hidden overscroll-contain">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold text-gray-900">Edit Inbox item</h3>
            <p className="mt-1 text-sm text-gray-900/70">แก้ไขข้อมูลก่อนอนุมัติ</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/30 border border-white/20 text-gray-900/70 active:scale-95"
            aria-label="close"
          >
            <X size={18} />
          </button>
        </div>

        {draft?.attachmentId ? (
          <div className="mt-4 glass-panel border border-white/20 rounded-2xl p-3">
            <div className="text-xs font-extrabold text-gray-900/60 uppercase mb-2">Attachment</div>
            {attachmentUrl ? (
              <a
                href={attachmentUrl}
                target="_blank"
                rel="noreferrer"
                className="block rounded-2xl overflow-hidden border border-white/20 bg-white/10"
              >
                <img src={attachmentUrl} alt="attachment" className="w-full max-h-72 object-cover" />
              </a>
            ) : (
              <div className="text-sm text-gray-900/60">Loading image…</div>
            )}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 min-w-0 overflow-x-hidden">
          <div className="grid grid-cols-2 gap-3 min-w-0">
            <label className="text-xs font-bold text-gray-900/60 min-w-0">
              Type
              <select
                value={draft.type}
                onChange={(e) => {
                  const next = normalizeTxType(e.target.value);
                  setDraft((d) => {
                    const clearSplit = next === "transfer" || next === "credit_payment";
                    return {
                      ...d,
                      type: next,
                      categoryId:
                        next === "transfer" || next === "credit_payment" ? "transfer" : String(d?.categoryId || ""),
                      splitByCategory: clearSplit ? false : !!d?.splitByCategory,
                      groups: clearSplit ? [] : Array.isArray(d?.groups) ? d.groups : [],
                      splitLabel: clearSplit ? "" : String(d?.splitLabel || ""),
                      splitGroupId: clearSplit ? "" : String(d?.splitGroupId || ""),
                    };
                  });
                }}
                className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
                <option value="credit_payment">Credit Payment</option>
              </select>
            </label>

            <label className="text-xs font-bold text-gray-900/60 min-w-0">
              Amount
              <input
                type="text"
                inputMode="decimal"
                value={isSplitMode ? formatMoneyInputFromSatang(splitTotal) : draft.amount}
                onChange={(e) => setDraft((d) => ({ ...d, amount: sanitizeMoneyInput(e.target.value) }))}
                disabled={isSplitMode}
                className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold disabled:opacity-70"
              />
              {isSplitMode ? (
                <div className="mt-1 text-[11px] text-gray-900/55">ยอดรวมจากบรรทัด Split</div>
              ) : null}
            </label>
          </div>

          <label className="text-xs font-bold text-gray-900/60 min-w-0">
            Date
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
            />
          </label>

          <label className="text-xs font-bold text-gray-900/60 min-w-0">
            Merchant
            <input
              type="text"
              value={draft.merchant}
              onChange={(e) => setDraft((d) => ({ ...d, merchant: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
              placeholder="ชื่อร้าน (เช่น 7-11, Starbucks)"
            />
          </label>

          {txType === "transfer" || txType === "credit_payment" ? (
            <div className="grid grid-cols-2 gap-3 min-w-0">
              <label className="text-xs font-bold text-gray-900/60 min-w-0">
                From
                <select
                  value={draft.fromAccountId}
                  onChange={(e) => setDraft((d) => ({ ...d, fromAccountId: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
                >
                  <option value="">เลือกบัญชี</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-bold text-gray-900/60 min-w-0">
                To
                <select
                  value={draft.toAccountId}
                  onChange={(e) => setDraft((d) => ({ ...d, toAccountId: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
                >
                  <option value="">เลือกบัญชี</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <>
              <label className="text-xs font-bold text-gray-900/60 min-w-0">
                Account
                <select
                  value={draft.accountId}
                  onChange={(e) => setDraft((d) => ({ ...d, accountId: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
                >
                  <option value="">เลือกบัญชี</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-bold text-gray-900/60 min-w-0 mt-3 block">
                Payment method
                <select
                  value={String(draft.paymentMethod || "cash")}
                  onChange={(e) => {
                    const pm = e.target.value;
                    setDraft((d) => {
                      if (!d) return d;
                      const next = { ...d, paymentMethod: pm };
                      if (pm === "cash") {
                        const cashAcc = accounts.find(
                          (a) => String(a?.type || "").toLowerCase() === "cash" || String(a?.id || "").toLowerCase().includes("cash") || /เงินสด/i.test(String(a?.name || ""))
                        );
                        if (cashAcc?.id) next.accountId = cashAcc.id;
                      }
                      return next;
                    });
                  }}
                  className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
                >
                  <option value="unknown">unknown</option>
                  <option value="cash">cash</option>
                  <option value="card">card</option>
                  <option value="promptpay">promptpay</option>
                </select>
              </label>

              {/* ✅ Split toggle */}
              <div className="rounded-2xl bg-white/20 border border-white/20 p-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-extrabold text-gray-900/70">
                  <Layers size={16} className="text-purple-700" />
                  Split
                </div>
                <button
                  type="button"
                  onClick={toggleSplitMode}
                  className={`w-12 h-7 rounded-full border border-white/20 bg-white/20 relative active:scale-95 transition-transform ${
                    isSplitMode ? "bg-gray-900/80" : "bg-white/20"
                  }`}
                  aria-label="toggle split"
                >
                  <span
                    className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-all ${
                      isSplitMode ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {isSplitMode ? (
                <>
                  <label className="text-xs font-bold text-gray-900/60 min-w-0">
                    Split label (optional)
                    <input
                      type="text"
                      value={draft.splitLabel}
                      onChange={(e) => setDraft((d) => ({ ...d, splitLabel: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
                      placeholder="เช่น Lotus receipt"
                    />
                  </label>

                  <div className="glass-panel border border-white/20 rounded-2xl p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-extrabold text-gray-900/60 uppercase tracking-wide">
                        Breakdown ({Array.isArray(draft.groups) ? draft.groups.length : 0})
                      </div>
                      <button
                        type="button"
                        onClick={addGroup}
                        className="px-3 py-1.5 rounded-xl bg-white/30 border border-white/20 text-gray-900/80 text-xs font-extrabold active:scale-95"
                      >
                        + Add line
                      </button>
                    </div>

                    <div className="mt-2 space-y-2 max-h-64 overflow-y-auto overflow-x-hidden no-scrollbar pr-1">
                      {(draft.groups || []).map((g, idx) => (
                        <div key={`g-${idx}`} className="rounded-2xl bg-white/20 border border-white/15 p-3">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
                              <select
                                value={g.categoryId || ""}
                                onChange={(e) => updateGroup(idx, { categoryId: e.target.value })}
                                className="w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
                              >
                                <option value="">เลือกหมวดหมู่</option>
                                {catList.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>

                              <input
                                type="text"
                                inputMode="decimal"
                                value={g.amount ?? ""}
                                onChange={(e) => updateGroup(idx, { amount: sanitizeMoneyInput(e.target.value) })}
                                placeholder="0.00"
                                className="w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => removeGroup(idx)}
                              className={`p-2 rounded-xl border border-white/20 bg-white/20 text-gray-900/70 active:scale-95 ${
                                (draft.groups || []).length <= 2 ? "opacity-40 pointer-events-none" : ""
                              }`}
                              title="Remove line"
                              aria-label="remove"
                            >
                              <X size={16} />
                            </button>
                          </div>

                          <input
                            type="text"
                            value={g.note || ""}
                            onChange={(e) => updateGroup(idx, { note: e.target.value })}
                            className="mt-2 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
                            placeholder="note (optional)"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs">
                      <div className="text-gray-900/60 font-extrabold">Total</div>
                      <div className="text-gray-900 font-black">{formatCurrency(splitTotal)}</div>
                    </div>
                  </div>
                </>
              ) : (
                <label className="text-xs font-bold text-gray-900/60 min-w-0">
                  Category
                  <select
                    value={draft.categoryId}
                    onChange={(e) => setDraft((d) => ({ ...d, categoryId: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
                  >
                    <option value="">เลือกหมวดหมู่</option>
                    {catList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}

          <label className="text-xs font-bold text-gray-900/60 min-w-0">
            Note
            <input
              type="text"
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
              placeholder="รายละเอียด/ชื่อร้าน"
            />
          </label>

          <label className="text-xs font-bold text-gray-900/60 min-w-0">
            Reference ID
            <input
              type="text"
              value={draft.referenceId}
              onChange={(e) => setDraft((d) => ({ ...d, referenceId: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
              placeholder="เลขที่รายการ/Ref"
            />
          </label>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="py-3 rounded-2xl bg-white/30 border border-white/20 text-gray-900 font-extrabold active:scale-95"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commit}
              className="py-3 rounded-2xl bg-indigo-600 text-white font-extrabold shadow-indigo-200 active:scale-95"
            >
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InboxView({ showAlert, showConfirm }) {
  const {
    state,
    navigate,
    startNewTransaction,
    bulkUpsertTransactions,
    addInboxItems,
    updateInboxItem,
    removeInboxItems,
    clearApprovedInbox,
    learnMerchant,
  } = useAppStore();

  const inbox = state.inbox || [];
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

  // ✅ Ensure Inbox warning can show even for older items (compute fuzzy duplicate for display)
  const activeList = useMemo(() => {
    const txs = state.transactions || [];
    return (activeListBase || []).map((it) => {
      if (!it) return it;
      if (it.duplicate) return it;
      const f = findFuzzyDuplicate(txs, it);
      if (f?.isDuplicate) {
        return {
          ...it,
          duplicate: true,
          duplicateInfo: {
            kind: "fuzzy",
            matchId: f.matchId || null,
            score: f.score || 0,
            reasons: f.reasons || [],
          },
        };
      }
      return it;
    });
  }, [activeListBase, state.transactions]);

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

  const approveIds = (ids) => {
    const list = Array.isArray(ids) ? ids : [];
    if (!list.length) return;

    const items = pending.filter((x) => list.includes(x.id));
    if (!items.length) return;

    const dupCount = items.filter((x) => !!x?.duplicate).length;

    const doApprove = () => {
      try {
        const allTxs = [];
        const normalizedItems = [];
        for (const it of items) {
          const canon = resolveMerchantCanonical(it?.merchant || it?.note, state?.merchants || []);
          let nextIt = canon ? { ...it, merchant: canon } : it;

          // ✅ Default payment_method cash → default cash account (prevents approval errors)
          const pm = String(nextIt?.paymentMethod || nextIt?.payment_method || "cash").toLowerCase().trim() || "cash";
          if ((!nextIt?.accountId || !String(nextIt.accountId).trim()) && pm === "cash" && defaultCashAccountId) {
            nextIt = { ...nextIt, accountId: defaultCashAccountId, paymentMethod: pm };
          }
          normalizedItems.push(nextIt);
          const txs = buildTransactionsFromInboxItem(nextIt);
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

        const approvedAt = Date.now();
        addInboxItems(
          normalizedItems.map((it) => ({
            ...it,
            status: "approved",
            approvedAt,
          }))
        );

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
    <div className="p-4 pb-28 min-w-0 overflow-x-hidden">
      {/* Header: stack on small screens to prevent action buttons from overflowing (no horizontal scroll) */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-gray-900/10 flex items-center justify-center">
              <Inbox size={20} />
            </div>
            <div>
              <div className="text-lg font-extrabold text-gray-900">Inbox</div>
              <div className="text-xs text-gray-900/60">{statusLine}</div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <PillTab active={tab === "pending"} onClick={() => setTab("pending")} label="Pending" count={pendingCount} />
            <PillTab active={tab === "approved"} onClick={() => setTab("approved")} label="Approved" count={approved.length} />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 min-w-0 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => startNewTransaction?.() ?? navigate("add")}
            className="w-full sm:w-auto px-3 py-2 rounded-xl bg-white/30 border border-white/20 text-gray-900/70 font-bold active:scale-95"
          >
            <span className="inline-flex items-center gap-2">
              <Check size={16} />
              Scan
            </span>
          </button>

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

            const accountLabel = it?.accountId ? accountsById.get(it.accountId)?.name : "";
            const fromLabel = it?.fromAccountId ? accountsById.get(it.fromAccountId)?.name : "";
            const toLabel = it?.toAccountId ? accountsById.get(it.toAccountId)?.name : "";
            const catLabel = it?.categoryId ? categoriesById.get(it.categoryId)?.name : "";
            const ref = it?.referenceId || it?.ref || "";

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
                          {isSplitItem ? ` • Split (${it.groups.length})` : ""}
                        </div>
                      )}
                      {ref ? <div className="break-all">ref: {ref}</div> : null}
                      {it?.note ? (
                        <div className="whitespace-pre-wrap break-words wrap-anywhere">{it.note}</div>
                      ) : null}
                    </div>

                    {/* ✅ Full breakdown list (scroll inside card) */}
                    {isSplitItem ? (
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
                            const eff = String(g?.adjustmentEffect || "add").toLowerCase().trim();
                            const isSubtract = txType === "expense" && eff === "subtract";
                            const sign = txType === "income" ? "+" : (isSubtract ? "+" : "-");
                            const cls = txType === "income" ? "text-emerald-700" : (isSubtract ? "text-emerald-700" : "text-red-700");
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
                          onClick={() => setEditingId(String(it.id))}
                          className="px-4 py-2 rounded-2xl bg-white/30 border border-white/20 text-gray-900/80 font-extrabold active:scale-95 inline-flex items-center justify-center gap-2"
                        >
                          <Edit2 size={16} />
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => approveIds([it.id])}
                          className="px-4 py-2 rounded-2xl bg-indigo-600 text-white font-extrabold shadow-indigo-200 active:scale-95 inline-flex items-center justify-center gap-2"
                        >
                          <Check size={16} />
                          Approve
                        </button>
                      </>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => deleteIds([it.id])}
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

      <EditorModal
        open={!!editingId}
        item={editingItem}
        accounts={state.accounts || []}
        categories={state.categories || { expense: [], income: [] }}
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
            const f = findFuzzyDuplicate(state.transactions || [], nextItem);
            const dup = !!f?.isDuplicate;
            patch = {
              ...patch,
              duplicate: dup,
              duplicateInfo: dup
                ? { kind: "fuzzy", matchId: f.matchId || null, score: f.score || 0, reasons: f.reasons || [] }
                : null,
            };
            nextItem = { ...nextItem, duplicate: dup, duplicateInfo: patch.duplicateInfo };
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
    </div>
  );
}
