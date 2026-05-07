import { parseMoneyToSatang } from "../../../utils/money.js";
import { deriveSplitParentCategoryId } from "./splitCategory.js";

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value) {
  return String(value || "").trim();
}

export function normalizeManualSplitLines(splitLines = [], { parseAmount = parseMoneyToSatang } = {}) {
  return listOf(splitLines)
    .map((line) => ({
      txId: cleanText(line?.txId),
      categoryId: cleanText(line?.categoryId),
      amount: parseAmount(line?.amountDigits),
      lineNote: cleanText(line?.lineNote),
    }))
    .filter((line) => line.amount > 0 || line.categoryId || line.lineNote || line.txId);
}

export function buildManualSplitTransactions({
  cleanedLines = [],
  type = "expense",
  accountId = "",
  date = "",
  time = "",
  noteText = "",
  refText = "",
  splitLabel = "",
  initialData = null,
  splitGroupTransactions = [],
  initialAttachmentId = null,
  merchantPatch = {},
  locationPatch = {},
  metaPatch = {},
  makeId,
  makeSplitGroupId,
} = {}) {
  if (typeof makeId !== "function") throw new TypeError("makeId is required");
  if (typeof makeSplitGroupId !== "function") throw new TypeError("makeSplitGroupId is required");

  const normalizedType = type === "income" ? "income" : "expense";
  const splitGroupId = cleanText(initialData?.splitGroupId) || makeSplitGroupId();
  const splitCount = listOf(cleanedLines).length;
  const groupLabel = cleanText(splitLabel).slice(0, 80) || null;
  const existingParent =
    listOf(splitGroupTransactions).find((tx) => !!tx?.isSplitParent) ||
    (initialData?.isSplitParent ? initialData : null);
  const parentId =
    cleanText(existingParent?.id) ||
    (initialData?.isSplitParent ? cleanText(initialData.id) : "") ||
    makeId();
  const childrenTotal = listOf(cleanedLines).reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  const parentCategory =
    cleanText(
      deriveSplitParentCategoryId({
        type: normalizedType,
        childCategoryIds: listOf(cleanedLines).map((line) => cleanText(line?.categoryId)),
        existingParentCategoryId: normalizedType === "expense" ? existingParent?.category : "",
        fallbackCategoryId: normalizedType === "income" ? "other_income" : "mixed",
      }),
    ) || (normalizedType === "income" ? "other_income" : "mixed");

  const sharedPatch = {
    ...merchantPatch,
    ...locationPatch,
    ...metaPatch,
  };

  const parentTx = {
    id: parentId,
    type: normalizedType,
    amount: childrenTotal,
    category: parentCategory,
    accountId,
    date,
    time,
    note: cleanText(noteText) || groupLabel || "Split",
    isTransfer: false,
    transferId: null,
    ref: cleanText(refText) || null,
    source: "manual",
    attachmentId: initialAttachmentId || null,

    ...sharedPatch,

    splitGroupId,
    splitCount,
    splitLabel: groupLabel,
    isSplit: true,
    isSplitParent: true,
  };

  const childTxs = listOf(cleanedLines).map((line, index) => {
    const itemName = cleanText(line.lineNote) || cleanText(noteText) || null;
    return {
      id: cleanText(line.txId) || makeId(),
      type: normalizedType,
      amount: line.amount,
      category: line.categoryId,
      accountId,
      date,
      time,
      itemName: itemName || null,
      note: itemName,
      isTransfer: false,
      transferId: null,
      ref: null,
      source: "manual",
      attachmentId: initialAttachmentId || null,

      ...sharedPatch,

      splitGroupId,
      splitIndex: index + 1,
      splitCount,
      splitLabel: groupLabel,
      isSplit: true,
      isSplitChild: true,
      splitParentId: parentId,
    };
  });

  const existingChildIds = new Set(
    listOf(splitGroupTransactions)
      .filter((tx) => !tx?.isSplitParent)
      .map((tx) => cleanText(tx?.id))
      .filter(Boolean),
  );
  const nextIds = new Set(childTxs.map((tx) => cleanText(tx.id)));
  const removedIds = [...existingChildIds].filter((id) => !nextIds.has(id));

  return {
    splitGroupId,
    splitCount,
    groupLabel,
    parentTx,
    childTxs,
    removedIds,
    transactions: [parentTx, ...childTxs],
  };
}
