// src/utils/transaction.js
// Centralized transaction helpers used across views.
// Eliminates duplicated isTransferLike / signedExpenseSatang / sumExpense* / compareTx* / daysInMonthKey.

import { parseDateSafe } from "./format.js";
import { combineTransactionDateTimeForSort } from "./scanDateTime.js";
import {
  isReportableExpenseTransaction,
  isTransferTransaction,
} from "../domain/ledger/transactionTypes.js";
import { signedExpenseAmountSatang } from "../domain/ledger/ledgerMath.js";

/**
 * Check if a transaction looks like a transfer (2-leg or credit payment).
 * Re-exports from transferGrouping for backward compatibility,
 * but also provides the simpler "inline" version used by views.
 */
export function isTransferLike(t) {
  return isTransferTransaction(t);
}

/**
 * Signed expense amount in satang.
 * - Normal expense => +amount
 * - Discount adjustment (adjustmentEffect='subtract') => -amount
 */
export function signedExpenseSatang(t) {
  return signedExpenseAmountSatang(t);
}

/**
 * Sum all expense transactions for a specific date (YYYY-MM-DD).
 * Excludes transfers and split parents (to prevent double counting).
 */
export function sumExpenseForDate(transactions, dateISO) {
  const d = String(dateISO || "").slice(0, 10);
  let sum = 0;
  for (const t of transactions || []) {
    if (!t) continue;
    if (!isReportableExpenseTransaction(t)) continue;
    const td = String(t?.date || "").slice(0, 10);
    if (td !== d) continue;
    sum += signedExpenseSatang(t);
  }
  return Math.max(0, Math.round(sum));
}

/**
 * Sum all expense transactions for a specific month (YYYY-MM).
 * Excludes transfers and split parents.
 */
export function sumExpenseForMonth(transactions, monthKey) {
  const mk = String(monthKey || "").slice(0, 7);
  let sum = 0;
  for (const t of transactions || []) {
    if (!t) continue;
    if (!isReportableExpenseTransaction(t)) continue;
    const td = String(t?.date || "").slice(0, 7);
    if (td !== mk) continue;
    sum += signedExpenseSatang(t);
  }
  return Math.max(0, Math.round(sum));
}

/**
 * Number of days in a month given a "YYYY-MM" key.
 */
export function daysInMonthKey(monthKey) {
  const s = String(monthKey || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return 30;
  const y = Number(m[1]);
  const mo = Math.max(1, Math.min(12, Number(m[2]) || 1));
  return new Date(y, mo, 0).getDate();
}

/**
 * Get date as milliseconds for sorting (from YYYY-MM-DD string).
 */
function getTxDateMs(t) {
  return t?.date ? parseDateSafe(String(t.date).slice(0, 10)).getTime() : 0;
}

function getTxTimeValue(t) {
  return combineTransactionDateTimeForSort(
    t?.date,
    t?.transactionTime ||
      t?.transaction_time ||
      t?.transactionAt ||
      t?.transaction_at ||
    t?.time ||
      t?.meta?.time ||
      t?.meta?.transactionTime ||
      t?.meta?.slip?.time ||
      t?.scanMeta?.transactionTime ||
      t?.scanMeta?.time ||
      t?.scanMeta?.slip?.time,
  );
}

/**
 * Get created-at timestamp for sorting.
 */
function getTxCreatedAt(t) {
  return Number(t?.createdAt || t?.updatedAt || 0) || 0;
}

/**
 * Compare transactions newest-first.
 * Primary: date descending. Secondary: transactionTime/time descending.
 * Tertiary: createdAt descending. Quaternary: id descending.
 */
export function compareTxNewestFirst(a, b) {
  const da = getTxDateMs(a);
  const db = getTxDateMs(b);
  if (db !== da) return db - da;

  const ta = getTxTimeValue(a);
  const tb = getTxTimeValue(b);
  if (tb !== ta) return tb - ta;

  const ca = getTxCreatedAt(a);
  const cb = getTxCreatedAt(b);
  if (cb !== ca) return cb - ca;

  const ia = String(a?.id || "");
  const ib = String(b?.id || "");
  return ib.localeCompare(ia);
}

/**
 * Sum category budgets for a specific month (excluding global budgets).
 */
export function sumCategoryBudgetsForMonth(budgets, monthKey) {
  const BUDGET_TOTAL_ID = "__TOTAL__";
  const BUDGET_DAILY_ID = "__DAILY__";
  const mk = String(monthKey || "").trim();
  let sum = 0;
  for (const b of budgets || []) {
    if (!b) continue;
    if (String(b?.month || "").trim() !== mk) continue;
    const cid = String(b?.categoryId || "").trim();
    if (cid === BUDGET_TOTAL_ID || cid === BUDGET_DAILY_ID) continue;
    const lim = Number(b?.limit || 0) || 0;
    if (lim > 0) sum += lim;
  }
  return Math.max(0, Math.round(sum));
}
