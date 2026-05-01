import { generateSplitGroupId, generateTxId } from "../../utils/id.js";
import { deriveReceiptCategoryKey } from "../../utils/receiptCategorizer.js";
import { normalizeReceiptScan } from "./normalizeReceiptScan.js";
import { receiptLinesFromReceipt, receiptLineToStoredLine, signedReceiptLineSatang } from "./receiptLineModel.js";
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
  return clean(line.name || line.rawName || line.normalizedName) || "Receipt item";
}

function categoryKey(line, fallbackCategoryId) {
  return clean(line.categoryId) || clean(fallbackCategoryId) || "uncategorized";
}

function groupLinesByCategory(lines, fallbackCategoryId) {
  const grouped = new Map();

  for (const line of lines) {
    const isAdjustment = line.receiptLineType === "adjustment";
    const key = isAdjustment
      ? `adjustment:${line.adjustmentType || "unknown"}:${line.adjustmentEffect || "add"}:${categoryKey(line, "fees")}`
      : `category:${categoryKey(line, fallbackCategoryId)}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.lines.push(line);
      existing.amountSatang += Number(line.amountSatang || 0);
      existing.signedSatang += signedReceiptLineSatang(line);
      continue;
    }

    grouped.set(key, {
      key,
      categoryId: categoryKey(line, isAdjustment ? "fees" : fallbackCategoryId),
      receiptLineType: isAdjustment ? "adjustment" : "item",
      adjustmentType: isAdjustment ? line.adjustmentType || "unknown" : null,
      adjustmentEffect: isAdjustment ? line.adjustmentEffect || "add" : "add",
      amountSatang: Number(line.amountSatang || 0),
      signedSatang: signedReceiptLineSatang(line),
      lines: [line],
    });
  }

  return Array.from(grouped.values());
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
  const finalLines = reconciled.lines;
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
        receiptItemsSubtotalSatang: reconciled.itemSubtotalSatang,
        receiptDiscountSatang: reconciled.discountSatang,
        receiptSurchargeSatang: reconciled.surchargeSatang,
      },
    };
  }

  const groups =
    saveMode === RECEIPT_SAVE_MODES.SPLIT_BY_CATEGORY
      ? groupLinesByCategory(finalLines, fallbackCategoryId)
      : finalLines.map((line) => ({
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
    receiptItemsSubtotalSatang: reconciled.itemSubtotalSatang,
    receiptDiscountSatang: reconciled.discountSatang,
    receiptSurchargeSatang: reconciled.surchargeSatang,
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
    reconciliation: reconciled,
    parent,
    children,
    transactions: [parent, ...children],
  };
}

export default {
  RECEIPT_SAVE_MODES,
  buildReceiptSplitPlan,
};
