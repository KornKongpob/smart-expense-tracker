import {
  isReportableExpenseTransaction,
  isReportableIncomeTransaction,
  isReportableTransaction,
  isSplitChildTransaction,
  isSplitParentTransaction,
  isTransferTransaction,
} from "../../domain/ledger/transactionTypes.js";
import {
  calculateIncomeExpenseTotals,
  signedExpenseAmountSatang,
} from "../../domain/ledger/ledgerMath.js";
import { ensureSatangInt } from "../../utils/money.js";

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  return String(value ?? "").trim();
}

function amountSatang(tx) {
  return Math.abs(ensureSatangInt(tx?.amount ?? tx?.amountSatang ?? tx?.amount_satang, 0));
}

function categoryIdOf(tx) {
  return clean(tx?.categoryId ?? tx?.category_id ?? tx?.category);
}

function merchantOf(tx) {
  return clean(tx?.merchant ?? tx?.payee ?? tx?.counterparty ?? tx?.note) || "Unknown";
}

function paymentMethodOf(tx) {
  return clean(tx?.paymentMethod ?? tx?.payment_method) || "unknown";
}

export function toSelectorMonthKey(value) {
  const raw = clean(value);
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 7);
  const date = value instanceof Date ? value : new Date(raw || Date.now());
  if (!Number.isFinite(date.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonthsToKey(monthKey, delta) {
  const key = toSelectorMonthKey(monthKey);
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month - 1 + Number(delta || 0), 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function txMonth(tx) {
  return toSelectorMonthKey(tx?.date);
}

function matchesMonth(tx, monthKey) {
  const month = clean(monthKey);
  return !month || txMonth(tx) === month;
}

function categoryMaps(categories = []) {
  const list = Array.isArray(categories)
    ? categories
    : [...listOf(categories?.expense), ...listOf(categories?.income)];
  const byId = new Map();
  for (const category of list) {
    const id = clean(category?.id);
    if (id) byId.set(id, category);
  }
  return byId;
}

function parentCategoryId(categoryId, categories) {
  const byId = categoryMaps(categories);
  let current = clean(categoryId);
  let guard = 0;
  while (current && guard < 8) {
    const category = byId.get(current);
    const parentId = clean(category?.parentId);
    if (!parentId || parentId === current) return current;
    current = parentId;
    guard += 1;
  }
  return current || clean(categoryId);
}

function addToMap(map, key, amount) {
  const id = clean(key) || "uncategorized";
  map.set(id, (map.get(id) || 0) + Math.trunc(Number(amount) || 0));
}

export function selectReportableTransactions(transactions = []) {
  return listOf(transactions).filter(isReportableTransaction);
}

export function selectExpenseTransactions(transactions = [], options = {}) {
  return listOf(transactions).filter((tx) => isReportableExpenseTransaction(tx) && matchesMonth(tx, options.monthKey));
}

export function selectIncomeTransactions(transactions = [], options = {}) {
  return listOf(transactions).filter((tx) => isReportableIncomeTransaction(tx) && matchesMonth(tx, options.monthKey));
}

export function selectExpenseByCategory(transactions = [], options = {}) {
  const map = new Map();
  for (const tx of selectExpenseTransactions(transactions, options)) {
    addToMap(map, categoryIdOf(tx), signedExpenseAmountSatang(tx));
  }
  return map;
}

export function selectExpenseByParentCategory(transactions = [], categories = [], options = {}) {
  const map = new Map();
  for (const tx of selectExpenseTransactions(transactions, options)) {
    addToMap(map, parentCategoryId(categoryIdOf(tx), categories), signedExpenseAmountSatang(tx));
  }
  return map;
}

export function selectExpenseBySubcategory(transactions = [], categories = [], options = {}) {
  const byId = categoryMaps(categories);
  const map = new Map();
  for (const tx of selectExpenseTransactions(transactions, options)) {
    const categoryId = categoryIdOf(tx);
    const category = byId.get(categoryId);
    const key = clean(category?.parentId) ? categoryId : "__main__";
    addToMap(map, key, signedExpenseAmountSatang(tx));
  }
  return map;
}

export function selectIncomeByCategory(transactions = [], options = {}) {
  const map = new Map();
  for (const tx of selectIncomeTransactions(transactions, options)) {
    addToMap(map, categoryIdOf(tx), amountSatang(tx));
  }
  return map;
}

export function selectIncomeVsExpense(transactions = [], options = {}) {
  const monthKey = clean(options.monthKey);
  const filtered = monthKey ? listOf(transactions).filter((tx) => matchesMonth(tx, monthKey)) : listOf(transactions);
  return calculateIncomeExpenseTotals(filtered);
}

export function selectMonthlyTrend(transactions = [], options = {}) {
  const monthsBack = Math.max(1, Math.trunc(Number(options.monthsBack || 6) || 6));
  const endMonthKey = toSelectorMonthKey(options.endMonthKey || options.monthKey || new Date());
  const out = [];

  for (let offset = monthsBack - 1; offset >= 0; offset -= 1) {
    const monthKey = addMonthsToKey(endMonthKey, -offset);
    out.push({
      monthKey,
      ...selectIncomeVsExpense(transactions, { monthKey }),
    });
  }

  return out;
}

export function selectBudgetVsActual(transactions = [], budgets = [], categories = [], monthKey = "") {
  const month = toSelectorMonthKey(monthKey || new Date());
  const expenseByCategory = selectExpenseByCategory(transactions, { monthKey: month });
  const expenseByParent = selectExpenseByParentCategory(transactions, categories, { monthKey: month });
  const byId = categoryMaps(categories);
  const rows = [];

  for (const budget of listOf(budgets)) {
    if (clean(budget?.month) !== month) continue;
    const categoryId = clean(budget?.categoryId);
    const limit = Math.max(0, ensureSatangInt(budget?.limit ?? budget?.limitSatang ?? budget?.limit_satang, 0));
    const category = byId.get(categoryId);
    const isChildCategory = !!clean(category?.parentId);
    const directActual = expenseByCategory.get(categoryId) || 0;
    const rollupActual = expenseByParent.get(categoryId) || 0;
    const actual =
      categoryId === "__TOTAL__"
        ? selectIncomeVsExpense(transactions, { monthKey: month }).expense
        : isChildCategory
          ? directActual
          : rollupActual || directActual;
    rows.push({
      budget,
      categoryId,
      limit,
      actual,
      remaining: limit - actual,
      over: limit > 0 && actual > limit,
      percent: limit > 0 ? Math.round((actual * 100) / limit) : 0,
    });
  }

  return rows;
}

export function selectMerchantRanking(transactions = [], options = {}) {
  const monthKey = clean(options.monthKey);
  const rows = new Map();
  const countedSplitGroups = new Map();

  for (const tx of selectExpenseTransactions(transactions, { monthKey })) {
    const merchant = merchantOf(tx);
    const signed = signedExpenseAmountSatang(tx);
    const splitGroupId = clean(tx?.splitGroupId);
    const current = rows.get(merchant) || { merchant, amount: 0, count: 0, splitGroups: new Set() };
    current.amount += signed;

    if (splitGroupId) {
      const key = `${merchant}::${splitGroupId}`;
      if (!countedSplitGroups.has(key)) {
        countedSplitGroups.set(key, true);
        current.count += 1;
        current.splitGroups.add(splitGroupId);
      }
    } else {
      current.count += 1;
    }

    rows.set(merchant, current);
  }

  return Array.from(rows.values())
    .map((row) => ({ merchant: row.merchant, amount: row.amount, count: row.count, splitReceiptCount: row.splitGroups.size }))
    .sort((a, b) => b.amount - a.amount || a.merchant.localeCompare(b.merchant));
}

export function selectPaymentMethodBreakdown(transactions = [], options = {}) {
  const map = new Map();
  for (const tx of selectExpenseTransactions(transactions, options)) {
    addToMap(map, paymentMethodOf(tx), signedExpenseAmountSatang(tx));
  }
  return Array.from(map.entries()).map(([paymentMethod, amount]) => ({ paymentMethod, amount }));
}

export function selectReceiptSplitSummary(transactions = [], options = {}) {
  const monthKey = clean(options.monthKey);
  let parentCount = 0;
  let childCount = 0;
  let childTotal = 0;
  let discountTotal = 0;
  let surchargeTotal = 0;
  const groups = new Set();

  for (const tx of listOf(transactions)) {
    if (monthKey && !matchesMonth(tx, monthKey)) continue;
    if (isSplitParentTransaction(tx)) {
      parentCount += 1;
      if (tx?.splitGroupId) groups.add(clean(tx.splitGroupId));
      continue;
    }
    if (!isSplitChildTransaction(tx)) continue;
    childCount += 1;
    childTotal += signedExpenseAmountSatang(tx);
    const effect = clean(tx?.adjustmentEffect ?? tx?.adjustment_effect ?? tx?.effect).toLowerCase();
    const lineType = clean(tx?.receiptLineType ?? tx?.receipt_line_type ?? tx?.lineType).toLowerCase();
    if (effect === "subtract") discountTotal += amountSatang(tx);
    else if (lineType === "adjustment") surchargeTotal += amountSatang(tx);
  }

  return {
    parentCount,
    childCount,
    splitGroupCount: groups.size || parentCount,
    childTotal,
    discountTotal,
    surchargeTotal,
  };
}

export function selectAccountBalanceTrend(transactions = [], accountId, options = {}) {
  const monthsBack = Math.max(1, Math.trunc(Number(options.monthsBack || 6) || 6));
  const endMonthKey = toSelectorMonthKey(options.endMonthKey || options.monthKey || new Date());
  const accountKey = clean(accountId);
  const out = [];
  let running = 0;

  for (let offset = monthsBack - 1; offset >= 0; offset -= 1) {
    const monthKey = addMonthsToKey(endMonthKey, -offset);
    let delta = 0;
    for (const tx of listOf(transactions)) {
      if (clean(tx?.accountId) !== accountKey) continue;
      if (txMonth(tx) !== monthKey) continue;
      if (isTransferTransaction(tx)) {
        delta += tx?.type === "income" ? amountSatang(tx) : -amountSatang(tx);
      } else if (isReportableIncomeTransaction(tx)) {
        delta += amountSatang(tx);
      } else if (isReportableExpenseTransaction(tx)) {
        delta -= signedExpenseAmountSatang(tx);
      }
    }
    running += delta;
    out.push({ monthKey, delta, balance: running });
  }

  return out;
}

export function selectVisibleTransactions(transactions = [], options = {}) {
  const expanded = options.expanded === true;
  const monthKey = clean(options.monthKey);
  const date = clean(options.date).slice(0, 10);
  const seenTransfers = new Set();
  const seenSplitGroups = new Set();
  const rows = [];

  for (const tx of listOf(transactions)) {
    if (monthKey && !matchesMonth(tx, monthKey)) continue;
    if (date && clean(tx?.date).slice(0, 10) !== date) continue;

    if (!expanded && tx?.isSplitChild) continue;
    const transferId = clean(tx?.transferId);
    if (!expanded && isTransferTransaction(tx) && transferId) {
      if (seenTransfers.has(transferId)) continue;
      seenTransfers.add(transferId);
    }

    const splitGroupId = clean(tx?.splitGroupId);
    if (!expanded && splitGroupId) {
      if (seenSplitGroups.has(splitGroupId)) continue;
      seenSplitGroups.add(splitGroupId);
      if (!tx?.isSplitParent) continue;
    }

    rows.push(tx);
  }

  return rows;
}

export default {
  selectAccountBalanceTrend,
  selectBudgetVsActual,
  selectExpenseByCategory,
  selectExpenseByParentCategory,
  selectExpenseBySubcategory,
  selectExpenseTransactions,
  selectIncomeByCategory,
  selectIncomeTransactions,
  selectIncomeVsExpense,
  selectMerchantRanking,
  selectMonthlyTrend,
  selectPaymentMethodBreakdown,
  selectReceiptSplitSummary,
  selectReportableTransactions,
  selectVisibleTransactions,
  toSelectorMonthKey,
};
