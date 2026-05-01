import { signedExpenseAmountSatang } from "../ledger/ledgerMath.js";
import {
  getTransactionType,
  isSplitChildTransaction,
  isSplitParentTransaction,
} from "../ledger/transactionTypes.js";

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  return String(value ?? "").trim();
}

function cleanLower(value) {
  return clean(value).toLowerCase();
}

function normalizeSearchText(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[,_()[\]{}|/\\:;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeQuery(query) {
  return normalizeSearchText(query).split(" ").filter(Boolean);
}

function dateOnly(value) {
  return clean(value).slice(0, 10);
}

function amountSatang(tx) {
  const raw = tx?.amount ?? tx?.amountSatang ?? tx?.amount_satang ?? tx?.paidTotalSatang ?? tx?.paid_total_satang;
  const amount = Number(raw);
  return Number.isFinite(amount) ? Math.abs(Math.trunc(amount)) : 0;
}

function signedAmountSatang(tx) {
  const signed = signedExpenseAmountSatang(tx);
  if (signed) return signed;
  const amount = Number(tx?.amount ?? tx?.amountSatang ?? tx?.amount_satang);
  return Number.isFinite(amount) ? Math.trunc(amount) : 0;
}

function categoryIdOf(value) {
  return clean(value?.categoryId ?? value?.category_id ?? value?.category ?? value?.suggestedCategoryId);
}

function accountIdOf(tx) {
  return clean(tx?.accountId ?? tx?.account_id);
}

function splitGroupIdOf(tx) {
  return clean(tx?.splitGroupId ?? tx?.split_group_id);
}

function splitParentIdOf(tx) {
  return clean(tx?.splitParentId ?? tx?.split_parent_id ?? tx?.parentTransactionId ?? tx?.parent_transaction_id);
}

function categoryList(categories) {
  if (Array.isArray(categories)) return categories;
  return [...listOf(categories?.expense), ...listOf(categories?.income)];
}

function buildCategoryMap(categories) {
  const map = new Map();
  for (const category of categoryList(categories)) {
    const id = clean(category?.id);
    if (id) map.set(id, category);
  }
  return map;
}

function buildAccountMap(accounts) {
  const map = new Map();
  for (const account of listOf(accounts)) {
    const id = clean(account?.id);
    if (id) map.set(id, account);
  }
  return map;
}

function pushText(parts, value) {
  const text = clean(value);
  if (text) parts.push(text);
}

function pushCategoryText(parts, categoryId, categoryMap) {
  const id = clean(categoryId);
  if (!id) return;
  pushText(parts, id);
  const category = categoryMap.get(id);
  pushText(parts, category?.name);
  pushText(parts, category?.parentId);
}

function pushReceiptLineText(parts, line, categoryMap) {
  if (!line || typeof line !== "object") return;

  pushText(parts, line.id);
  pushText(parts, line.rawName);
  pushText(parts, line.normalizedName);
  pushText(parts, line.itemName);
  pushText(parts, line.name);
  pushText(parts, line.label);
  pushText(parts, line.note);
  pushText(parts, line.source);
  pushCategoryText(parts, categoryIdOf(line), categoryMap);

  for (const child of listOf(line.children)) pushReceiptLineText(parts, child, categoryMap);
  for (const child of listOf(line.lines)) pushReceiptLineText(parts, child, categoryMap);
  for (const child of listOf(line.items)) pushReceiptLineText(parts, child, categoryMap);
}

function pushReceiptText(parts, receipt, categoryMap) {
  if (!receipt || typeof receipt !== "object") return;

  pushText(parts, receipt.merchant);
  pushText(parts, receipt.referenceId);
  pushText(parts, receipt.paymentMethod);
  for (const item of listOf(receipt.items)) pushReceiptLineText(parts, item, categoryMap);
  for (const adjustment of listOf(receipt.adjustments)) pushReceiptLineText(parts, adjustment, categoryMap);
  for (const warning of listOf(receipt.warnings)) pushText(parts, warning);
}

export function buildTransactionSearchText(tx, context = {}) {
  const categoryMap = buildCategoryMap(context.categories);
  const accountMap = buildAccountMap(context.accounts);
  const parts = [];

  pushText(parts, tx?.id);
  pushText(parts, tx?.merchant);
  pushText(parts, tx?.itemName);
  pushText(parts, tx?.payee);
  pushText(parts, tx?.counterparty);
  pushText(parts, tx?.note);
  pushText(parts, tx?.description);
  pushText(parts, tx?.ref);
  pushText(parts, tx?.reference);
  pushText(parts, tx?.referenceId);
  pushText(parts, tx?.paymentMethod);
  pushText(parts, tx?.payment_method);
  pushText(parts, tx?.type);
  pushText(parts, tx?.txType);
  pushText(parts, tx?.kind);
  pushText(parts, tx?.transferKind);
  pushText(parts, tx?.source);
  pushCategoryText(parts, categoryIdOf(tx), categoryMap);

  const account = accountMap.get(accountIdOf(tx));
  pushText(parts, accountIdOf(tx));
  pushText(parts, account?.name);
  pushText(parts, tx?.fromAccountId);
  pushText(parts, tx?.toAccountId);

  for (const tag of listOf(tx?.tags)) pushText(parts, tag);
  for (const line of listOf(tx?.receiptLines)) pushReceiptLineText(parts, line, categoryMap);
  for (const line of listOf(tx?.lines)) pushReceiptLineText(parts, line, categoryMap);
  for (const group of listOf(tx?.groups)) pushReceiptLineText(parts, group, categoryMap);
  pushReceiptText(parts, tx?.receipt, categoryMap);
  pushReceiptText(parts, tx?.normalizedReceipt, categoryMap);
  pushReceiptText(parts, tx?.receiptData, categoryMap);
  pushReceiptText(parts, tx?.raw, categoryMap);
  pushReceiptText(parts, tx?.raw?.receipt, categoryMap);
  for (const line of listOf(tx?.raw?.lineItems ?? tx?.raw?.line_items)) pushReceiptLineText(parts, line, categoryMap);

  return normalizeSearchText(parts.join(" "));
}

export function transactionMatchesQuery(tx, query, context = {}) {
  const tokens = tokenizeQuery(query);
  if (!tokens.length) return true;
  const haystack = buildTransactionSearchText(tx, context);
  return tokens.every((token) => haystack.includes(token));
}

function matchesDateRange(tx, filters) {
  const date = dateOnly(tx?.date);
  const start = dateOnly(filters.startDate ?? filters.dateFrom ?? filters.from);
  const end = dateOnly(filters.endDate ?? filters.dateTo ?? filters.to);
  if (start && (!date || date < start)) return false;
  if (end && (!date || date > end)) return false;
  return true;
}

function matchesAmountRange(tx, filters) {
  const minRaw = filters.minAmount ?? filters.amountMin ?? filters.minAmountSatang;
  const maxRaw = filters.maxAmount ?? filters.amountMax ?? filters.maxAmountSatang;
  const min = minRaw === "" || minRaw == null ? null : Number(minRaw);
  const max = maxRaw === "" || maxRaw == null ? null : Number(maxRaw);
  const amount = amountSatang(tx);
  if (Number.isFinite(min) && amount < min) return false;
  if (Number.isFinite(max) && amount > max) return false;
  return true;
}

function matchesAccount(tx, accountId) {
  const expected = clean(accountId);
  if (!expected) return true;
  return [tx?.accountId, tx?.account_id, tx?.fromAccountId, tx?.from_account_id, tx?.toAccountId, tx?.to_account_id]
    .map(clean)
    .includes(expected);
}

function matchesCategory(tx, categoryId) {
  const expected = clean(categoryId);
  if (!expected) return true;
  if (categoryIdOf(tx) === expected) return true;

  const checkLine = (line) => {
    if (!line || typeof line !== "object") return false;
    if (categoryIdOf(line) === expected) return true;
    return [...listOf(line.children), ...listOf(line.lines), ...listOf(line.items)].some(checkLine);
  };

  return [
    ...listOf(tx?.receiptLines),
    ...listOf(tx?.lines),
    ...listOf(tx?.groups),
    ...listOf(tx?.receipt?.items),
    ...listOf(tx?.normalizedReceipt?.items),
    ...listOf(tx?.receiptData?.items),
  ].some(checkLine);
}

function matchesTags(tx, tags) {
  const wanted = listOf(Array.isArray(tags) ? tags : clean(tags) ? [tags] : []).map(cleanLower).filter(Boolean);
  if (!wanted.length) return true;
  const current = listOf(tx?.tags).map(cleanLower);
  return wanted.every((tag) => current.includes(tag));
}

function matchesFieldText(tx, field, query, context) {
  const q = clean(query);
  if (!q) return true;
  if (field === "merchant") return transactionMatchesQuery({ merchant: tx?.merchant, payee: tx?.payee }, q, context);
  if (field === "note") return transactionMatchesQuery({ note: tx?.note, description: tx?.description }, q, context);
  return true;
}

function matchesPaymentMethod(tx, paymentMethod) {
  const expected = cleanLower(paymentMethod);
  if (!expected) return true;
  return cleanLower(tx?.paymentMethod ?? tx?.payment_method) === expected;
}

function matchesType(tx, type) {
  const expected = cleanLower(type);
  if (!expected || expected === "all") return true;
  if (expected === "credit_payment" || expected === "credit_card_payment") {
    return getTransactionType(tx) === "credit_card_payment";
  }
  return getTransactionType(tx) === expected || cleanLower(tx?.transferKind) === expected;
}

function matchesAllFilters(tx, filters, context) {
  if (!matchesDateRange(tx, filters)) return false;
  if (!matchesAmountRange(tx, filters)) return false;
  if (!matchesAccount(tx, filters.accountId ?? filters.account_id)) return false;
  if (!matchesCategory(tx, filters.categoryId ?? filters.category_id)) return false;
  if (!matchesTags(tx, filters.tags ?? filters.tag)) return false;
  if (!matchesFieldText(tx, "merchant", filters.merchant, context)) return false;
  if (!matchesFieldText(tx, "note", filters.note, context)) return false;
  if (!matchesPaymentMethod(tx, filters.paymentMethod ?? filters.payment_method)) return false;
  if (!matchesType(tx, filters.type ?? filters.kind ?? filters.txType)) return false;
  if (!transactionMatchesQuery(tx, filters.query ?? filters.search, context)) return false;
  return true;
}

function createParentResolver(transactions) {
  const byId = new Map();
  const parentByGroup = new Map();

  for (const tx of listOf(transactions)) {
    const id = clean(tx?.id);
    if (id) byId.set(id, tx);
    if (isSplitParentTransaction(tx)) {
      const groupId = splitGroupIdOf(tx);
      if (groupId) parentByGroup.set(groupId, tx);
    }
  }

  return (tx) => {
    if (!tx || !isSplitChildTransaction(tx)) return tx;
    const parentId = splitParentIdOf(tx);
    if (parentId && byId.has(parentId)) return byId.get(parentId);
    const groupId = splitGroupIdOf(tx);
    if (groupId && parentByGroup.has(groupId)) return parentByGroup.get(groupId);
    return tx;
  };
}

export function filterTransactions(transactions = [], filters = {}, context = {}) {
  const expanded = filters.expanded === true || filters.includeSplitChildren === true;
  const resolveParent = createParentResolver(transactions);
  const rows = [];
  const seen = new Set();

  for (const tx of listOf(transactions)) {
    if (!matchesAllFilters(tx, filters, context)) continue;

    const visibleTx = expanded ? tx : resolveParent(tx);
    if (!expanded && isSplitChildTransaction(tx) && isSplitChildTransaction(visibleTx)) {
      continue;
    }

    const key = clean(visibleTx?.id) || `${dateOnly(visibleTx?.date)}:${signedAmountSatang(visibleTx)}:${rows.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(visibleTx);
  }

  return rows;
}

export default {
  buildTransactionSearchText,
  transactionMatchesQuery,
  filterTransactions,
};
