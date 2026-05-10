import { generateSplitGroupId, generateTxId } from "../../utils/id.js";
import {
  deriveReceiptCategoryKey,
  inferCategoryKeyFromText,
  sanitizeCategoryKey,
} from "../../utils/receiptCategorizer.js";
import { normalizeReceiptScan } from "./normalizeReceiptScan.js";
import {
  isReceiptAdjustmentLine,
  receiptLinesFromReceipt,
  receiptLineToStoredLine,
  signedReceiptLineSatang,
} from "./receiptLineModel.js";
import { reconcileReceiptLines } from "./reconcileReceipt.js";

export const RECEIPT_SAVE_MODES = Object.freeze({
  SINGLE: "single",
  SPLIT_BY_ITEM: "split_by_item",
  SPLIT_BY_CATEGORY: "split_by_category",
});

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeMode(value) {
  const mode = clean(value).toLowerCase();
  if (mode === "split_by_item" || mode === "item" || mode === "items") return RECEIPT_SAVE_MODES.SPLIT_BY_ITEM;
  if (mode === "split_by_category" || mode === "category" || mode === "categories") return RECEIPT_SAVE_MODES.SPLIT_BY_CATEGORY;
  return RECEIPT_SAVE_MODES.SINGLE;
}

function toLocalDate() {
  return new Date().toISOString().slice(0, 10);
}

function baseTransactionFields(base = {}, receipt = {}) {
  return {
    type: "expense",
    amount: 0,
    category: "",
    accountId: clean(base.accountId ?? base.account_id),
    date: clean(base.date ?? receipt.date).slice(0, 10) || toLocalDate(),
    time: clean(base.time),
    transactionTime: clean(base.transactionTime ?? base.transaction_time ?? base.time),
    note: clean(base.note),
    ref: clean(base.ref ?? base.reference ?? receipt.referenceId) || null,
    source: clean(base.source) || "receipt",
    paymentMethod: clean(base.paymentMethod ?? receipt.paymentMethod),
    merchant: clean(base.merchant ?? receipt.merchant) || null,
    attachmentId: base.attachmentId ?? null,
    fileHash: base.fileHash ?? null,
    location: base.location ?? null,
  };
}

function buildParentCategory(lines, fallbackCategoryId) {
  const itemCategoryIds = new Set(
    lines
      .filter((line) => line.receiptLineType !== "adjustment")
      .map((line) => categoryKey(line, fallbackCategoryId))
      .filter(Boolean),
  );

  if (itemCategoryIds.size > 1) return "mixed";
  if (itemCategoryIds.size === 1) return Array.from(itemCategoryIds)[0];

  return deriveReceiptCategoryKey(
    "expense",
    lines
      .filter((line) => line.receiptLineType !== "adjustment")
      .map((line) => ({
        categoryId: line.categoryId,
        amountSatang: line.amountSatang,
        name: line.name,
      })),
    "",
    fallbackCategoryId || "mixed",
  );
}

function lineDisplayName(line) {
  return clean(line.itemName || line.name || line.note || line.rawName || line.normalizedName || line.label) || "Receipt item";
}

function rawCategoryKey(line) {
  return clean(
    line?.categoryId ??
      line?.category_id ??
      line?.category ??
      line?.category_key ??
      line?.suggestedCategoryId ??
      line?.suggested_category_id ??
      line?.key,
  );
}

function lineEvidenceText(line) {
  const childText = Array.isArray(line?.children)
    ? line.children.map((child) => lineDisplayName(child)).filter(Boolean).join(" ")
    : "";
  return [lineDisplayName(line), childText, clean(line?.parentName)].filter(Boolean).join(" ");
}

function adjustmentCategoryKey(line, fallbackCategoryId = "fees") {
  const raw = rawCategoryKey(line);
  const type = clean(line?.adjustmentType ?? line?.adjustment_type ?? line?.type).toLowerCase();
  const effect = clean(line?.adjustmentEffect ?? line?.adjustment_effect ?? line?.effect).toLowerCase();

  if (raw === "discount" || type === "discount" || effect === "subtract") return "discount";
  if (raw === "service_charge" || type === "service_charge") return "service_charge";

  return (
    sanitizeCategoryKey(raw, { allowAdjustmentCategories: true }) ||
    sanitizeCategoryKey(fallbackCategoryId, { allowAdjustmentCategories: true }) ||
    "fees"
  );
}

function shouldPreferTextCategory(raw, sanitizedRaw) {
  const normalizedRaw = clean(raw).toLowerCase().replace(/\s+/g, " ");
  return Boolean(normalizedRaw && sanitizedRaw && normalizedRaw !== sanitizedRaw);
}

function categoryKey(line, fallbackCategoryId) {
  if (line?.receiptLineType === "adjustment" || isReceiptAdjustmentLine(line)) {
    return adjustmentCategoryKey(line, fallbackCategoryId);
  }

  const raw = rawCategoryKey(line);
  const sanitizedRaw = sanitizeCategoryKey(raw);
  const sanitizedFallback = sanitizeCategoryKey(fallbackCategoryId);
  const inferred = inferCategoryKeyFromText("expense", lineEvidenceText(line), {
    fallbackCategory: sanitizedRaw || sanitizedFallback || fallbackCategoryId,
  });

  if (shouldPreferTextCategory(raw, sanitizedRaw)) {
    return inferred || sanitizedRaw || sanitizedFallback || "other";
  }

  return sanitizedRaw || inferred || sanitizedFallback || "other";
}

function normalizeSplitLineCategory(line, fallbackCategoryId, index) {
  const categoryId = categoryKey(line, line?.receiptLineType === "adjustment" ? "fees" : fallbackCategoryId);
  return {
    ...line,
    categoryId,
    category: categoryId,
    key: clean(line?.key) || categoryId,
    splitIndex: Number(line?.splitIndex || line?.split_index || 0) || index + 1,
  };
}

function buildChildFromGroup(group, index, context) {
  const { base, splitGroupId, parentId, splitCount, splitLabel } = context;
  const primaryLine = group.lines[0] || {};
  const storedLines = group.lines.map(receiptLineToStoredLine);
  const isAdjustment = group.receiptLineType === "adjustment";
  const note = isAdjustment
    ? lineDisplayName(primaryLine)
    : storedLines.length === 1
      ? lineDisplayName(primaryLine)
      : storedLines.map((line) => line.name).filter(Boolean).slice(0, 3).join(", ");

  return {
    ...base,
    id: generateTxId(),
    type: "expense",
    amount: Math.abs(group.signedSatang || group.amountSatang || 0),
    category: group.categoryId,
    categoryId: group.categoryId,
    note,
    itemName: note,
    isTransfer: false,
    transferId: null,
    isSplit: true,
    isSplitParent: false,
    isSplitChild: true,
    splitGroupId,
    splitParentId: parentId,
    splitIndex: index + 1,
    splitCount,
    splitLabel,
    receiptLineType: group.receiptLineType,
    adjustmentEffect: group.adjustmentEffect,
    adjustmentType: group.adjustmentType,
    receiptLines: storedLines,
  };
}

export function buildReceiptSplitPlan({
  receipt,
  lines,
  mode = RECEIPT_SAVE_MODES.SINGLE,
  baseTransaction = {},
  fallbackCategoryId = "mixed",
  splitGroupId,
  parentId,
  splitLabel,
  addRoundingAdjustment = false,
} = {}) {
  const normalizedReceipt = receipt ? normalizeReceiptScan(receipt) : null;
  const rawLines = Array.isArray(lines) && lines.length ? lines : receiptLinesFromReceipt(normalizedReceipt || {});
  const paidTotalSatang = Number(normalizedReceipt?.paidTotalSatang || baseTransaction.amount || baseTransaction.amountSatang || 0);
  const reconciled = reconcileReceiptLines(rawLines, paidTotalSatang, { addRoundingAdjustment });
  const finalLines = reconciled.lines.map((line, index) =>
    normalizeSplitLineCategory(line, fallbackCategoryId, index),
  );
  const reconciliation = { ...reconciled, lines: finalLines };
  const saveMode = normalizeMode(mode);
  const base = baseTransactionFields(baseTransaction, normalizedReceipt || {});
  const parentAmountSatang = reconciled.paidTotalSatang || Math.max(0, reconciled.netSatang);
  const resolvedSplitGroupId = clean(splitGroupId) || generateSplitGroupId();
  const resolvedParentId = clean(parentId) || generateTxId();
  const resolvedSplitLabel = clean(splitLabel) || clean(base.merchant || base.note) || "Receipt";
  const parentCategoryId = buildParentCategory(finalLines, fallbackCategoryId);
  const parentReceiptLines = finalLines.map(receiptLineToStoredLine);

  if (saveMode === RECEIPT_SAVE_MODES.SINGLE) {
    return {
      mode: saveMode,
      receipt: normalizedReceipt,
      reconciliation: reconciled,
      transaction: {
        ...base,
        id: clean(baseTransaction.id) || generateTxId(),
        type: "expense",
        amount: parentAmountSatang,
        category: clean(baseTransaction.category ?? baseTransaction.categoryId) || parentCategoryId,
        categoryId: clean(baseTransaction.categoryId ?? baseTransaction.category) || parentCategoryId,
        isTransfer: false,
        transferId: null,
        isSplit: false,
        isSplitParent: false,
        isSplitChild: false,
        receiptLines: parentReceiptLines,
        receiptPaidTotalSatang: parentAmountSatang,
        receiptItemsSubtotalSatang: reconciliation.itemSubtotalSatang,
        receiptDiscountSatang: reconciliation.discountSatang,
        receiptSurchargeSatang: reconciliation.surchargeSatang,
      },
    };
  }

  const groups = finalLines.map((line) => ({
    key: line.id,
    categoryId: categoryKey(line, line.receiptLineType === "adjustment" ? "fees" : fallbackCategoryId),
    receiptLineType: line.receiptLineType,
    adjustmentType: line.adjustmentType,
    adjustmentEffect: line.adjustmentEffect,
    amountSatang: line.amountSatang,
    signedSatang: signedReceiptLineSatang(line),
    lines: [line],
  }));

  const splitCount = groups.length;
  const parent = {
    ...base,
    id: resolvedParentId,
    type: "expense",
    amount: parentAmountSatang,
    category: parentCategoryId,
    categoryId: parentCategoryId,
    note: base.note || resolvedSplitLabel,
    isTransfer: false,
    transferId: null,
    isSplit: true,
    isSplitParent: true,
    isSplitChild: false,
    splitGroupId: resolvedSplitGroupId,
    splitParentId: null,
    splitIndex: 0,
    splitCount,
    splitLabel: resolvedSplitLabel,
    receiptLines: parentReceiptLines,
    receiptPaidTotalSatang: parentAmountSatang,
    receiptItemsSubtotalSatang: reconciliation.itemSubtotalSatang,
    receiptDiscountSatang: reconciliation.discountSatang,
    receiptSurchargeSatang: reconciliation.surchargeSatang,
  };

  const children = groups.map((group, index) =>
    buildChildFromGroup(group, index, {
      base,
      splitGroupId: resolvedSplitGroupId,
      parentId: resolvedParentId,
      splitCount,
      splitLabel: resolvedSplitLabel,
    }),
  );

  return {
    mode: saveMode,
    receipt: normalizedReceipt,
    reconciliation,
    parent,
    children,
    transactions: [parent, ...children],
  };
}

export default {
  RECEIPT_SAVE_MODES,
  buildReceiptSplitPlan,
};
