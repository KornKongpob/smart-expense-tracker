import { isCreditAccount } from "../../utils/accountMatch.js";
import { ensureSatangInt } from "../../utils/money.js";
import {
  getTransactionType,
  isReportableExpenseTransaction,
  isReportableIncomeTransaction,
  isSplitParentTransaction,
  TRANSACTION_TYPES,
} from "./transactionTypes.js";

function amountSatang(tx) {
  return Math.abs(ensureSatangInt(tx?.amount ?? tx?.amountSatang ?? tx?.amount_satang, 0));
}

function effect(tx) {
  return String(tx?.adjustmentEffect || tx?.adjustment_effect || tx?.effect || "").toLowerCase().trim();
}

function accountIdOf(tx) {
  return String(tx?.accountId ?? tx?.account_id ?? "").trim();
}

export function signedExpenseAmountSatang(tx) {
  const amount = amountSatang(tx);
  return effect(tx) === "subtract" ? -amount : amount;
}

export function reportAmountSatang(tx) {
  if (isReportableIncomeTransaction(tx)) return amountSatang(tx);
  if (isReportableExpenseTransaction(tx)) return signedExpenseAmountSatang(tx);
  return 0;
}

export function calculateIncomeExpenseTotals(transactions = []) {
  let income = 0;
  let expense = 0;

  for (const tx of Array.isArray(transactions) ? transactions : []) {
    if (isReportableIncomeTransaction(tx)) income += amountSatang(tx);
    else if (isReportableExpenseTransaction(tx)) expense += signedExpenseAmountSatang(tx);
  }

  return { income, expense, net: income - expense };
}

export function accountDeltaSatang(tx, account) {
  if (!tx || isSplitParentTransaction(tx)) return 0;
  const amount = amountSatang(tx);
  if (!amount) return 0;

  const type = getTransactionType(tx);
  const liability = isCreditAccount(account);
  const subtractingAdjustment = effect(tx) === "subtract";

  if (type === TRANSACTION_TYPES.INCOME) {
    return liability ? -amount : amount;
  }

  if (type === TRANSACTION_TYPES.EXPENSE) {
    if (subtractingAdjustment) return liability ? -amount : amount;
    return liability ? amount : -amount;
  }

  return 0;
}

export function accountNetForTransactionsSatang(transactions = [], account) {
  const targetId = String(account?.id ?? account?.accountId ?? account?.account_id ?? "").trim();
  if (!targetId) return 0;

  return (Array.isArray(transactions) ? transactions : []).reduce((sum, tx) => {
    if (accountIdOf(tx) !== targetId) return sum;
    return sum + accountDeltaSatang(tx, account);
  }, 0);
}

export function accountLedgerBalanceSatang(account, transactions = []) {
  const openingRaw = ensureSatangInt(account?.openingBalance ?? account?.opening_balance_satang, 0);
  const opening = isCreditAccount(account) ? Math.abs(openingRaw) : openingRaw;
  return opening + accountNetForTransactionsSatang(transactions, account);
}

export function netWorthSatang(accounts = [], transactions = []) {
  return (Array.isArray(accounts) ? accounts : []).reduce((sum, account) => {
    const balance = accountLedgerBalanceSatang(account, transactions);
    return sum + (isCreditAccount(account) ? -balance : balance);
  }, 0);
}

export default {
  signedExpenseAmountSatang,
  reportAmountSatang,
  calculateIncomeExpenseTotals,
  accountDeltaSatang,
  accountNetForTransactionsSatang,
  accountLedgerBalanceSatang,
  netWorthSatang,
};
