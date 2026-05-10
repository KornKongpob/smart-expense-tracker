import {
  getTransactionType,
  isSplitChildTransaction,
  isSplitParentTransaction,
  isTransferTransaction,
} from "../domain/ledger/transactionTypes.js";
import { buildTransferGroupInfo } from "./transferGrouping.js";

function clean(value) {
  return String(value ?? "").trim();
}

function cleanLower(value) {
  return clean(value).toLowerCase();
}

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function safeAmountSatang(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.abs(Math.round(number)) : 0;
}

function idOf(value) {
  return clean(value?.id);
}

function txCategoryId(value) {
  return clean(value?.categoryId ?? value?.category_id ?? value?.category ?? value?.key);
}

function txAccountId(value) {
  return clean(value?.accountId ?? value?.account_id);
}

function txAmountSatang(value) {
  return safeAmountSatang(value?.amount ?? value?.amountSatang ?? value?.amount_satang);
}

function txSplitGroupId(value) {
  return clean(value?.splitGroupId ?? value?.split_group_id);
}

function txSplitParentId(value) {
  return clean(value?.splitParentId ?? value?.split_parent_id);
}

function transactionTimeOf(value) {
  return clean(value?.transactionTime ?? value?.transaction_time ?? value?.raw?.transactionTime ?? value?.raw?.time ?? value?.time);
}

function merchantOf(value) {
  return clean(value?.merchant ?? value?.raw?.merchant);
}

function noteOf(value) {
  return clean(value?.note ?? value?.raw?.note);
}

function refOf(value) {
  return clean(value?.ref ?? value?.reference ?? value?.referenceId ?? value?.reference_id ?? value?.raw?.ref ?? value?.raw?.reference);
}

function sourceOf(value) {
  return clean(value?.source ?? value?.raw?.source);
}

function evidenceOf(value) {
  return clean(value?.evidence ?? value?.raw?.evidence ?? value?.raw?.sourceText ?? value?.raw?.source_text);
}

function attachmentIdOf(value) {
  return clean(value?.attachmentId ?? value?.attachment_id ?? value?.raw?.attachmentId ?? value?.raw?.attachment_id);
}

function fileHashOf(value) {
  return clean(value?.fileHash ?? value?.file_hash ?? value?.raw?.fileHash ?? value?.raw?.file_hash);
}

function receiptLinesOf(value) {
  const raw = value?.raw && typeof value.raw === "object" ? value.raw : {};
  const candidates = [
    value?.receiptLines,
    value?.receipt_lines,
    raw.receiptLines,
    raw.receipt_lines,
    raw.receiptGroups,
    raw.receipt_groups,
    raw.lineItems,
    raw.line_items,
  ];
  return listOf(candidates.find((candidate) => Array.isArray(candidate) && candidate.length));
}

function flattenCategories(categories = {}) {
  if (Array.isArray(categories)) return categories;
  return [...listOf(categories.expense), ...listOf(categories.income)];
}

function mapById(items = []) {
  return new Map(listOf(items).map((item) => [idOf(item), item]).filter(([id]) => id));
}

function categoryLabel(category, fallback = "") {
  return clean(category?.name) || fallback || "Uncategorized";
}

function accountLabel(account, fallback = "") {
  return clean(account?.name) || fallback || "Account";
}

function isAdjustmentLine(value = {}) {
  const lineType = cleanLower(value.receiptLineType ?? value.receipt_line_type ?? value.lineType ?? value.line_type);
  const adjustmentType = clean(value.adjustmentType ?? value.adjustment_type);
  const effect = cleanLower(value.adjustmentEffect ?? value.adjustment_effect ?? value.effect);
  const categoryId = txCategoryId(value).toLowerCase();
  return lineType === "adjustment" || !!adjustmentType || effect === "subtract" || categoryId === "discount";
}

function adjustmentEffectOf(value = {}) {
  const effect = cleanLower(value.adjustmentEffect ?? value.adjustment_effect ?? value.effect);
  return effect === "subtract" ? "subtract" : "add";
}

function lineAmountSatang(value = {}) {
  return safeAmountSatang(value.amountSatang ?? value.amount_satang ?? value.amount ?? value.totalSatang ?? value.total);
}

function normalizeChildRows(children = []) {
  return listOf(children)
    .map((child, index) => {
      const name = clean(child?.name ?? child?.note ?? child?.itemName) || `Item ${index + 1}`;
      const amountSatang = lineAmountSatang(child);
      return name || amountSatang ? { name, amountSatang, categoryId: txCategoryId(child) } : null;
    })
    .filter(Boolean);
}

function normalizeDetailLine(value = {}, index = 0, categoryById = new Map(), source = "transaction") {
  const categoryId = txCategoryId(value);
  const category = categoryById.get(categoryId) || null;
  const isAdjustment = isAdjustmentLine(value);
  const adjustmentEffect = isAdjustment ? adjustmentEffectOf(value) : "add";
  const adjustmentType = isAdjustment ? clean(value.adjustmentType ?? value.adjustment_type) || "adjustment" : "";
  const amountSatang = lineAmountSatang(value);
  const itemName =
    clean(value.itemName ?? value.item_name ?? value.note ?? value.name ?? value.title ?? value.label) ||
    categoryLabel(category, `Line ${index + 1}`);

  return {
    id: clean(value.id) || `${source}_${index + 1}`,
    transactionId: clean(value.id),
    itemName,
    note: clean(value.note ?? value.name ?? value.itemName ?? value.item_name),
    categoryId,
    categoryName: categoryLabel(category, categoryId || "Uncategorized"),
    amountSatang,
    signedAmountSatang: isAdjustment && adjustmentEffect === "subtract" ? -amountSatang : amountSatang,
    receiptLineType: isAdjustment ? "adjustment" : "item",
    adjustmentEffect,
    adjustmentType,
    splitIndex: Number(value.splitIndex ?? value.split_index ?? index + 1) || index + 1,
    children: normalizeChildRows(value.children),
    childrenIncludedInParent: !!value.childrenIncludedInParent,
    source,
  };
}

function orderLines(lines = []) {
  return listOf(lines).slice().sort((a, b) => {
    const ai = Number(a?.splitIndex || 0);
    const bi = Number(b?.splitIndex || 0);
    if (ai && bi && ai !== bi) return ai - bi;
    if (ai && !bi) return -1;
    if (!ai && bi) return 1;
    return clean(a?.id).localeCompare(clean(b?.id));
  });
}

function resolveSplitGroup(transaction, transactions = []) {
  if (!transaction) return null;

  const selectedId = idOf(transaction);
  const groupId = txSplitGroupId(transaction);
  const parentId = txSplitParentId(transaction);
  const looksSplit =
    isSplitParentTransaction(transaction) ||
    isSplitChildTransaction(transaction) ||
    !!groupId ||
    !!parentId ||
    Array.isArray(transaction?.splitLines);

  if (!looksSplit) return null;

  let group = [];
  if (groupId) group = listOf(transactions).filter((tx) => txSplitGroupId(tx) === groupId);
  if (!group.length && parentId) {
    group = listOf(transactions).filter((tx) => idOf(tx) === parentId || txSplitParentId(tx) === parentId);
  }
  if (!group.some((tx) => idOf(tx) === selectedId)) group.push(transaction);

  const parent =
    group.find((tx) => isSplitParentTransaction(tx)) ||
    listOf(transactions).find((tx) => parentId && idOf(tx) === parentId) ||
    (isSplitParentTransaction(transaction) ? transaction : null);

  const children = group.filter((tx) => tx && !isSplitParentTransaction(tx) && !isTransferTransaction(tx));
  const embeddedLines = listOf(parent?.splitLines).length
    ? listOf(parent.splitLines)
    : listOf(transaction?.splitLines);

  return {
    groupId: groupId || txSplitGroupId(parent) || (parentId ? `parent:${parentId}` : selectedId),
    parent,
    children: orderLines(children),
    embeddedLines: orderLines(embeddedLines),
  };
}

function firstClean(...values) {
  for (const value of values) {
    const next = clean(value);
    if (next) return next;
  }
  return "";
}

function titleForTransaction(primary, category, fallback = "Transaction") {
  return firstClean(merchantOf(primary), primary?.itemName, primary?.item_name, primary?.splitLabel, primary?.split_label, noteOf(primary), category?.name, fallback);
}

export function resolveTransactionDetailModel({
  transaction,
  transactions = [],
  accounts = [],
  categories = {},
} = {}) {
  if (!transaction) return null;

  const allTransactions = listOf(transactions).some((tx) => idOf(tx) === idOf(transaction))
    ? listOf(transactions)
    : [transaction, ...listOf(transactions)];
  const accountById = mapById(accounts);
  const categoryById = mapById(flattenCategories(categories));

  const selected = transaction;
  const selectedId = idOf(selected);
  const transferInfo = isTransferTransaction(selected)
    ? buildTransferGroupInfo(selected, allTransactions, accounts)
    : null;

  if (transferInfo) {
    const primary = transferInfo.outTx || transferInfo.canonicalTx || selected;
    const secondary = transferInfo.inTx || null;
    const fromAccountId = firstClean(
      transferInfo.fromAccountId,
      primary?.fromAccountId,
      primary?.from_account_id,
      selected?.fromAccountId,
      selected?.from_account_id,
      txAccountId(primary),
    );
    const toAccountId = firstClean(
      transferInfo.toAccountId,
      primary?.toAccountId,
      primary?.to_account_id,
      secondary?.toAccountId,
      secondary?.to_account_id,
      selected?.toAccountId,
      selected?.to_account_id,
      txAccountId(secondary),
    );
    const transferKindRaw = cleanLower(primary?.transferKind ?? primary?.transfer_kind ?? primary?.kind ?? selected?.kind);
    const resolvedTransferKind = transferKindRaw.includes("credit") ? "credit_payment" : transferInfo.kind || "transfer";
    const categoryId = txCategoryId(primary);
    const category = categoryById.get(categoryId) || null;
    const attachmentId = firstClean(attachmentIdOf(primary), attachmentIdOf(secondary), attachmentIdOf(selected));

    return {
      kind: "transfer",
      txType: resolvedTransferKind,
      selectedId,
      primaryTxId: idOf(primary),
      editTargetId: firstClean(transferInfo.legIds?.outId, transferInfo.legIds?.canonicalId, selectedId),
      title: resolvedTransferKind === "credit_payment" ? "Credit card payment" : "Transfer",
      merchant: firstClean(merchantOf(primary), merchantOf(secondary)),
      note: firstClean(transferInfo.note, noteOf(primary), noteOf(secondary)),
      amountSatang: safeAmountSatang(transferInfo.amount) || txAmountSatang(primary) || txAmountSatang(secondary),
      date: firstClean(transferInfo.date, primary?.date, secondary?.date),
      transactionTime: firstClean(transactionTimeOf(primary), transactionTimeOf(secondary), transactionTimeOf(selected)),
      accountId: fromAccountId || txAccountId(primary),
      accountName: accountLabel(accountById.get(fromAccountId || txAccountId(primary)), ""),
      categoryId,
      categoryName: categoryLabel(category, categoryId),
      ref: firstClean(transferInfo.ref, refOf(primary), refOf(secondary)),
      source: firstClean(sourceOf(primary), sourceOf(secondary), sourceOf(selected)),
      evidence: firstClean(evidenceOf(primary), evidenceOf(secondary), evidenceOf(selected)),
      attachmentId,
      fileHash: firstClean(fileHashOf(primary), fileHashOf(secondary), fileHashOf(selected)),
      transfer: {
        kind: resolvedTransferKind,
        fromAccountId,
        toAccountId,
        fromAccountName: accountLabel(transferInfo.fromAccount || accountById.get(fromAccountId), fromAccountId),
        toAccountName: accountLabel(transferInfo.toAccount || accountById.get(toAccountId), toAccountId),
        outTxId: idOf(transferInfo.outTx),
        inTxId: idOf(transferInfo.inTx),
      },
      lines: [],
    };
  }

  const splitGroup = resolveSplitGroup(selected, allTransactions);
  if (splitGroup) {
    const primary = splitGroup.parent || selected;
    const categoryId = txCategoryId(primary);
    const category = categoryById.get(categoryId) || null;
    const splitSourceLines = splitGroup.children.length
      ? splitGroup.children
      : splitGroup.embeddedLines.length
        ? splitGroup.embeddedLines
        : receiptLinesOf(primary);
    const lines = orderLines(
      splitSourceLines.map((line, index) => normalizeDetailLine(line, index, categoryById, "split")),
    );

    return {
      kind: "split",
      txType: getTransactionType(primary),
      selectedId,
      primaryTxId: idOf(primary),
      editTargetId: idOf(splitGroup.parent) || selectedId,
      title: titleForTransaction(primary, category, "Split receipt"),
      merchant: merchantOf(primary),
      note: noteOf(primary),
      amountSatang: txAmountSatang(primary),
      date: clean(primary?.date),
      transactionTime: transactionTimeOf(primary) || transactionTimeOf(selected),
      accountId: txAccountId(primary),
      accountName: accountLabel(accountById.get(txAccountId(primary)), ""),
      categoryId,
      categoryName: categoryLabel(category, categoryId),
      ref: firstClean(refOf(primary), refOf(selected)),
      source: firstClean(sourceOf(primary), sourceOf(selected)),
      evidence: firstClean(evidenceOf(primary), evidenceOf(selected)),
      attachmentId: firstClean(attachmentIdOf(primary), attachmentIdOf(selected)),
      fileHash: firstClean(fileHashOf(primary), fileHashOf(selected)),
      splitGroupId: splitGroup.groupId,
      lines,
    };
  }

  const categoryId = txCategoryId(selected);
  const category = categoryById.get(categoryId) || null;
  const receiptLines = orderLines(receiptLinesOf(selected).map((line, index) => normalizeDetailLine(line, index, categoryById, "receipt")));

  return {
    kind: "normal",
    txType: getTransactionType(selected),
    selectedId,
    primaryTxId: selectedId,
    editTargetId: selectedId,
    title: titleForTransaction(selected, category),
    merchant: merchantOf(selected),
    note: noteOf(selected),
    amountSatang: txAmountSatang(selected),
    date: clean(selected?.date),
    transactionTime: transactionTimeOf(selected),
    accountId: txAccountId(selected),
    accountName: accountLabel(accountById.get(txAccountId(selected)), ""),
    categoryId,
    categoryName: categoryLabel(category, categoryId),
    ref: refOf(selected),
    source: sourceOf(selected),
    evidence: evidenceOf(selected),
    attachmentId: attachmentIdOf(selected),
    fileHash: fileHashOf(selected),
    lines: receiptLines,
  };
}

export default {
  resolveTransactionDetailModel,
};
