import { compareTxNewestFirst } from "../../utils/transaction.js";
import { selectAssetsLiabilities } from "./accountSelectors.js";
import { selectBudgetSummary } from "./budgetSelectors.js";
import {
  selectIncomeVsExpense,
  selectVisibleTransactions,
  toSelectorMonthKey,
} from "./reportSelectors.js";
import {
  isReportableExpenseTransaction,
  isReportableIncomeTransaction,
} from "../../domain/ledger/transactionTypes.js";
import { signedExpenseAmountSatang } from "../../domain/ledger/ledgerMath.js";

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  return String(value ?? "").trim();
}

function daysInMonth(monthKey) {
  const [year, month] = toSelectorMonthKey(monthKey).split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

function calendarDays(transactions = [], monthKey = "") {
  const month = toSelectorMonthKey(monthKey || new Date());
  const totalDays = daysInMonth(month);
  const rows = Array.from({ length: totalDays }, (_, index) => ({
    date: `${month}-${String(index + 1).padStart(2, "0")}`,
    incomeSatang: 0,
    expenseSatang: 0,
    netSatang: 0,
    transactionCount: 0,
  }));
  const byDate = new Map(rows.map((row) => [row.date, row]));

  for (const tx of listOf(transactions)) {
    const date = clean(tx?.date).slice(0, 10);
    const day = byDate.get(date);
    if (!day) continue;

    if (isReportableIncomeTransaction(tx)) {
      day.incomeSatang += Math.abs(Number(tx?.amount || tx?.amountSatang || 0));
      day.transactionCount += 1;
    } else if (isReportableExpenseTransaction(tx)) {
      day.expenseSatang += signedExpenseAmountSatang(tx);
      day.transactionCount += 1;
    }
    day.netSatang = day.incomeSatang - day.expenseSatang;
  }

  return rows;
}

function pendingInboxCount(inbox = []) {
  return listOf(inbox).filter((item) => {
    const status = clean(item?.status || "pending").toLowerCase();
    return status !== "approved" && status !== "done";
  }).length;
}

export function selectDashboardSnapshot({
  accounts = [],
  transactions = [],
  budgets = [],
  categories = [],
  inbox = [],
  monthKey = "",
  recentLimit = 8,
} = {}) {
  const month = toSelectorMonthKey(monthKey || new Date());
  const accountSummary = selectAssetsLiabilities(accounts, transactions);
  const monthlySummary = selectIncomeVsExpense(transactions, { monthKey: month });
  const budgetSummary = selectBudgetSummary(transactions, budgets, categories, month);
  const recentTransactions = selectVisibleTransactions(transactions, { monthKey: month })
    .slice()
    .sort(compareTxNewestFirst)
    .slice(0, Math.max(1, Number(recentLimit) || 8));
  const days = calendarDays(transactions, month);

  return {
    monthKey: month,
    accountSummary,
    monthlySummary,
    budgetSummary,
    pendingReceiptCount: pendingInboxCount(inbox),
    recentTransactions,
    calendarDays: days,
    calendarTotals: days.reduce(
      (sum, day) => ({
        incomeSatang: sum.incomeSatang + day.incomeSatang,
        expenseSatang: sum.expenseSatang + day.expenseSatang,
        netSatang: sum.netSatang + day.netSatang,
      }),
      { incomeSatang: 0, expenseSatang: 0, netSatang: 0 },
    ),
  };
}

export default {
  selectDashboardSnapshot,
};
