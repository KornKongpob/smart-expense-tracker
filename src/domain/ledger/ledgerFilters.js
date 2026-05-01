import {
  isBudgetRelevantTransaction,
  isReportableExpenseTransaction,
  isReportableIncomeTransaction,
  isReportableTransaction,
  isSplitChildTransaction,
  isSplitParentTransaction,
  isTransferTransaction,
} from "./transactionTypes.js";

export function selectReportableTransactions(transactions = []) {
  return (Array.isArray(transactions) ? transactions : []).filter(isReportableTransaction);
}

export function selectExpenseTransactions(transactions = []) {
  return (Array.isArray(transactions) ? transactions : []).filter(isReportableExpenseTransaction);
}

export function selectIncomeTransactions(transactions = []) {
  return (Array.isArray(transactions) ? transactions : []).filter(isReportableIncomeTransaction);
}

export function selectBudgetRelevantTransactions(transactions = []) {
  return (Array.isArray(transactions) ? transactions : []).filter(isBudgetRelevantTransaction);
}

export {
  isBudgetRelevantTransaction,
  isReportableExpenseTransaction,
  isReportableIncomeTransaction,
  isReportableTransaction,
  isSplitChildTransaction,
  isSplitParentTransaction,
  isTransferTransaction,
};

export default {
  selectReportableTransactions,
  selectExpenseTransactions,
  selectIncomeTransactions,
  selectBudgetRelevantTransactions,
};
