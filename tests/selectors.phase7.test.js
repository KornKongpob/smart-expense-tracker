import test from "node:test";
import assert from "node:assert/strict";

import { createExpenseTransaction } from "../src/domain/ledger/createExpense.js";
import { createIncomeTransaction } from "../src/domain/ledger/createIncome.js";
import { createTransferPair } from "../src/domain/ledger/createTransferPair.js";
import { createCreditPaymentPair } from "../src/domain/ledger/createCreditPaymentPair.js";
import { buildReceiptSplitPlan, RECEIPT_SAVE_MODES } from "../src/domain/receipt/index.js";
import { selectDashboardSnapshot } from "../src/store/selectors/dashboardSelectors.js";
import { selectExpenseByCategory, selectIncomeVsExpense } from "../src/store/selectors/reportSelectors.js";
import { selectBudgetSummary } from "../src/store/selectors/budgetSelectors.js";

const accounts = [
  { id: "kbank", name: "KBank", type: "bank", openingBalance: 500000 },
  { id: "wallet", name: "Wallet", type: "wallet", openingBalance: 100000 },
  { id: "card", name: "Credit Card", type: "credit", openingBalance: 0, creditLimit: 1000000 },
];

const categories = [
  { id: "food", name: "Food", parentId: "" },
  { id: "dining", name: "Dining", parentId: "food" },
  { id: "groceries", name: "Groceries", parentId: "food" },
  { id: "packaged_food", name: "Packaged food", parentId: "food" },
  { id: "housing", name: "Housing", parentId: "" },
  { id: "household", name: "Household", parentId: "housing" },
  { id: "household_cleaning", name: "Household cleaning", parentId: "housing" },
  { id: "discount", name: "Discount", parentId: "" },
  { id: "mixed", name: "Mixed", parentId: "" },
];

test("dashboard phase 7: empty dashboard snapshot is stable", () => {
  const snapshot = selectDashboardSnapshot({ accounts: [], transactions: [], budgets: [], categories, inbox: [], monthKey: "2026-04" });

  assert.equal(snapshot.monthlySummary.income, 0);
  assert.equal(snapshot.monthlySummary.expense, 0);
  assert.equal(snapshot.calendarDays.length, 30);
  assert.equal(snapshot.pendingReceiptCount, 0);
});

test("dashboard phase 7: transfer does not inflate income or expense", () => {
  const transfer = createTransferPair({
    amountSatang: 100000,
    fromAccountId: "kbank",
    toAccountId: "wallet",
    date: "2026-04-08",
  });
  const snapshot = selectDashboardSnapshot({ accounts, transactions: transfer, budgets: [], categories, monthKey: "2026-04" });

  assert.equal(snapshot.monthlySummary.income, 0);
  assert.equal(snapshot.monthlySummary.expense, 0);
});

test("dashboard phase 7: split parent appears once in recent transactions and children drive stats", () => {
  const plan = buildReceiptSplitPlan({
    receipt: {
      merchant: "Lotus",
      date: "2026-04-10",
      paidTotalSatang: 78000,
      items: [
        { rawName: "\u0e02\u0e49\u0e32\u0e27\u0e2a\u0e32\u0e23", totalSatang: 40000, suggestedCategoryId: "groceries" },
        { rawName: "\u0e19\u0e49\u0e33\u0e22\u0e32\u0e25\u0e49\u0e32\u0e07\u0e08\u0e32\u0e19", totalSatang: 42000, suggestedCategoryId: "household" },
      ],
      adjustments: [{ type: "discount", label: "Discount", amountSatang: 4000, effect: "subtract" }],
    },
    mode: RECEIPT_SAVE_MODES.SPLIT_BY_CATEGORY,
    baseTransaction: { accountId: "kbank", merchant: "Lotus", date: "2026-04-10" },
    parentId: "parent-1",
    splitGroupId: "split-1",
  });

  const snapshot = selectDashboardSnapshot({ accounts, transactions: plan.transactions, budgets: [], categories, monthKey: "2026-04" });
  const categoryTotals = selectExpenseByCategory(plan.transactions, { monthKey: "2026-04" });

  assert.deepEqual(snapshot.recentTransactions.map((tx) => tx.id), ["parent-1"]);
  assert.equal(snapshot.monthlySummary.expense, 78000);
  assert.equal(categoryTotals.get("packaged_food"), 40000);
  assert.equal(categoryTotals.get("household_cleaning"), 42000);
  assert.equal(categoryTotals.get("discount"), -4000);
});

test("dashboard phase 7: pending receipt card count uses inbox pending items", () => {
  const snapshot = selectDashboardSnapshot({
    accounts,
    transactions: [],
    budgets: [],
    categories,
    inbox: [{ id: "a", status: "pending" }, { id: "b", status: "approved" }, { id: "c" }],
    monthKey: "2026-04",
  });

  assert.equal(snapshot.pendingReceiptCount, 2);
});

test("dashboard phase 7: calendar totals match monthly list totals", () => {
  const txs = [
    createIncomeTransaction({ amountSatang: 100000, accountId: "kbank", date: "2026-04-18", categoryId: "salary" }),
    createExpenseTransaction({ amountSatang: 20000, accountId: "kbank", date: "2026-04-18", categoryId: "food" }),
    ...createTransferPair({ amountSatang: 50000, fromAccountId: "kbank", toAccountId: "wallet", date: "2026-04-18" }),
  ];
  const snapshot = selectDashboardSnapshot({ accounts, transactions: txs, budgets: [], categories, monthKey: "2026-04" });
  const totals = selectIncomeVsExpense(txs, { monthKey: "2026-04" });

  assert.equal(snapshot.calendarTotals.incomeSatang, totals.income);
  assert.equal(snapshot.calendarTotals.expenseSatang, totals.expense);
  assert.equal(snapshot.calendarDays.find((day) => day.date === "2026-04-18").incomeSatang, 100000);
  assert.equal(snapshot.calendarDays.find((day) => day.date === "2026-04-18").expenseSatang, 20000);
});

test("dashboard phase 7: credit card outstanding appears in liabilities", () => {
  const txs = [
    createExpenseTransaction({ amountSatang: 80000, accountId: "card", date: "2026-04-20", categoryId: "groceries" }),
    ...createCreditPaymentPair({
      amountSatang: 50000,
      sourceAccountId: "kbank",
      creditAccountId: "card",
      date: "2026-04-25",
    }),
  ];
  const snapshot = selectDashboardSnapshot({ accounts, transactions: txs, budgets: [], categories, monthKey: "2026-04" });

  assert.equal(snapshot.accountSummary.creditCardOutstandingSatang, 30000);
  assert.equal(snapshot.accountSummary.totalLiabilitiesSatang, 30000);
  assert.equal(snapshot.monthlySummary.expense, 80000);
});

test("dashboard phase 7: budget actuals are split aware", () => {
  const plan = buildReceiptSplitPlan({
    lines: [
      { name: "Food", amountSatang: 40000, categoryId: "food" },
      { name: "Household", amountSatang: 30000, categoryId: "household" },
    ],
    mode: RECEIPT_SAVE_MODES.SPLIT_BY_CATEGORY,
    baseTransaction: { amount: 70000, accountId: "kbank", date: "2026-04-04", merchant: "Lotus" },
  });
  const budgets = [
    { id: "food-budget", month: "2026-04", categoryId: "food", limit: 100000 },
    { id: "house-budget", month: "2026-04", categoryId: "housing", limit: 50000 },
  ];
  const summary = selectBudgetSummary(plan.transactions, budgets, categories, "2026-04");

  assert.equal(summary.actualSatang, 70000);
  assert.equal(summary.rows.find((row) => row.categoryId === "food").actual, 40000);
  assert.equal(summary.rows.find((row) => row.categoryId === "housing").actual, 30000);
});
