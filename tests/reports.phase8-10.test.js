import test from "node:test";
import assert from "node:assert/strict";

import { createExpenseTransaction } from "../src/domain/ledger/createExpense.js";
import { createIncomeTransaction } from "../src/domain/ledger/createIncome.js";
import { createTransferPair } from "../src/domain/ledger/createTransferPair.js";
import { createCreditPaymentPair } from "../src/domain/ledger/createCreditPaymentPair.js";
import { buildReceiptSplitPlan, RECEIPT_SAVE_MODES } from "../src/domain/receipt/index.js";
import {
  selectBudgetVsActual,
  selectExpenseByCategory,
  selectExpenseByParentCategory,
  selectIncomeVsExpense,
  selectMerchantRanking,
  selectPaymentMethodBreakdown,
  selectReceiptSplitSummary,
} from "../src/store/selectors/reportSelectors.js";
import { selectBudgetSummary } from "../src/store/selectors/budgetSelectors.js";
import { selectAccountSummaries, selectAssetsLiabilities } from "../src/store/selectors/accountSelectors.js";

const accounts = [
  { id: "kbank", name: "KBank", type: "bank", openingBalance: 1000000 },
  { id: "wallet", name: "Wallet", type: "wallet", openingBalance: 50000 },
  { id: "visa", name: "Visa", type: "credit", openingBalance: 0, creditLimit: 1000000, dueDay: 25 },
];

const categories = [
  { id: "food", name: "Food", parentId: "" },
  { id: "groceries", name: "Groceries", parentId: "food" },
  { id: "household", name: "Household", parentId: "" },
  { id: "personal_care", name: "Personal Care", parentId: "" },
  { id: "snacks", name: "Snacks", parentId: "food" },
  { id: "discount", name: "Discount", parentId: "" },
  { id: "fees", name: "Fees", parentId: "" },
  { id: "mixed", name: "Mixed categories", parentId: "" },
];

function buildLotusSplit() {
  return buildReceiptSplitPlan({
    receipt: {
      merchant: "Lotus",
      date: "2026-04-10",
      paidTotalSatang: 78000,
      items: [
        { id: "rice", rawName: "\u0e02\u0e49\u0e32\u0e27\u0e2a\u0e32\u0e23", totalSatang: 25000, suggestedCategoryId: "groceries" },
        { id: "soap", rawName: "\u0e19\u0e49\u0e33\u0e22\u0e32\u0e25\u0e49\u0e32\u0e07\u0e08\u0e32\u0e19", totalSatang: 12000, suggestedCategoryId: "household" },
        { id: "toothpaste", rawName: "\u0e22\u0e32\u0e2a\u0e35\u0e1f\u0e31\u0e19", totalSatang: 9000, suggestedCategoryId: "personal_care" },
        { id: "snack", rawName: "\u0e02\u0e19\u0e21", totalSatang: 8000, suggestedCategoryId: "snacks" },
        { id: "shampoo", rawName: "\u0e41\u0e0a\u0e21\u0e1e\u0e39", totalSatang: 28000, suggestedCategoryId: "personal_care" },
      ],
      adjustments: [{ id: "discount", type: "discount", label: "Discount", amountSatang: 4000, effect: "subtract" }],
    },
    mode: RECEIPT_SAVE_MODES.SPLIT_BY_CATEGORY,
    baseTransaction: { accountId: "kbank", merchant: "Lotus", date: "2026-04-10", categoryId: "mixed", paymentMethod: "card" },
    parentId: "lotus-parent",
    splitGroupId: "lotus-split",
    fallbackCategoryId: "mixed",
  });
}

test("phase 8 reports: normal income and expense are included, transfer and card payment are excluded", () => {
  const txs = [
    createIncomeTransaction({ amountSatang: 100000, accountId: "kbank", date: "2026-04-01", categoryId: "salary" }),
    createExpenseTransaction({ amountSatang: 20000, accountId: "kbank", date: "2026-04-02", categoryId: "food" }),
    ...createTransferPair({ amountSatang: 50000, fromAccountId: "kbank", toAccountId: "wallet", date: "2026-04-03" }),
    ...createCreditPaymentPair({ amountSatang: 30000, sourceAccountId: "kbank", creditAccountId: "visa", date: "2026-04-04" }),
  ];

  assert.deepEqual(selectIncomeVsExpense(txs, { monthKey: "2026-04" }), {
    income: 100000,
    expense: 20000,
    net: 80000,
  });
});

test("phase 8 reports: credit card purchase affects expense, outstanding, and available credit", () => {
  const txs = [
    createExpenseTransaction({ amountSatang: 80000, accountId: "visa", date: "2026-04-05", categoryId: "groceries" }),
    ...createCreditPaymentPair({ amountSatang: 50000, sourceAccountId: "kbank", creditAccountId: "visa", date: "2026-04-25" }),
  ];

  const totals = selectIncomeVsExpense(txs, { monthKey: "2026-04" });
  const visa = selectAccountSummaries(accounts, txs).find((account) => account.id === "visa");
  const balance = selectAssetsLiabilities(accounts, txs);

  assert.equal(totals.expense, 80000);
  assert.equal(visa.outstandingSatang, 30000);
  assert.equal(visa.availableCreditSatang, 970000);
  assert.equal(balance.totalLiabilitiesSatang, 30000);
  assert.equal(balance.netWorthSatang, 970000);
});

test("phase 8 reports: split parent is excluded and child categories drive charts", () => {
  const plan = buildLotusSplit();
  const categoryTotals = selectExpenseByCategory(plan.transactions, { monthKey: "2026-04" });
  const parentTotals = selectExpenseByParentCategory(plan.transactions, categories, { monthKey: "2026-04" });
  const merchantRows = selectMerchantRanking(plan.transactions, { monthKey: "2026-04" });
  const receiptSummary = selectReceiptSplitSummary(plan.transactions, { monthKey: "2026-04" });

  assert.equal(selectIncomeVsExpense(plan.transactions, { monthKey: "2026-04" }).expense, 78000);
  assert.equal(categoryTotals.get("mixed"), undefined);
  assert.equal(categoryTotals.get("groceries"), 25000);
  assert.equal(categoryTotals.get("household"), 12000);
  assert.equal(categoryTotals.get("personal_care"), 37000);
  assert.equal(categoryTotals.get("snacks"), 8000);
  assert.equal(categoryTotals.get("discount"), -4000);
  assert.equal(parentTotals.get("food"), 33000);
  assert.deepEqual(merchantRows.map((row) => [row.merchant, row.amount, row.count]), [["Lotus", 78000, 1]]);
  assert.equal(receiptSummary.parentCount, 1);
  assert.equal(receiptSummary.childTotal, 78000);
  assert.equal(receiptSummary.discountTotal, 4000);
});

test("phase 10 budgets: actuals are split aware and subcategories roll up to parent budgets", () => {
  const plan = buildLotusSplit();
  const budgets = [
    { id: "total", month: "2026-04", categoryId: "__TOTAL__", limit: 100000 },
    { id: "food", month: "2026-04", categoryId: "food", limit: 50000 },
    { id: "personal", month: "2026-04", categoryId: "personal_care", limit: 30000 },
    { id: "house", month: "2026-04", categoryId: "household", limit: 50000 },
  ];

  const rows = selectBudgetVsActual(plan.transactions, budgets, categories, "2026-04");
  const summary = selectBudgetSummary(plan.transactions, budgets, categories, "2026-04");

  assert.equal(rows.find((row) => row.categoryId === "__TOTAL__").actual, 78000);
  assert.equal(rows.find((row) => row.categoryId === "food").actual, 33000);
  assert.equal(rows.find((row) => row.categoryId === "personal_care").actual, 37000);
  assert.equal(rows.find((row) => row.categoryId === "personal_care").over, true);
  assert.equal(summary.actualSatang, 78000);
  assert.equal(summary.remainingSatang, 22000);
});

test("phase 10 budgets: discount reduces actual and service charge increases actual", () => {
  const plan = buildReceiptSplitPlan({
    receipt: {
      merchant: "Cafe",
      paidTotalSatang: 10800,
      items: [{ rawName: "Lunch", totalSatang: 10000, suggestedCategoryId: "food" }],
      adjustments: [
        { type: "service_charge", label: "Service", amountSatang: 1000, effect: "add" },
        { type: "discount", label: "Discount", amountSatang: 200, effect: "subtract" },
      ],
    },
    mode: RECEIPT_SAVE_MODES.SPLIT_BY_CATEGORY,
    baseTransaction: { accountId: "kbank", merchant: "Cafe", date: "2026-04-11" },
  });

  const breakdown = selectExpenseByCategory(plan.transactions, { monthKey: "2026-04" });
  const paymentMethods = selectPaymentMethodBreakdown(plan.transactions, { monthKey: "2026-04" });

  assert.equal(selectIncomeVsExpense(plan.transactions, { monthKey: "2026-04" }).expense, 10800);
  assert.equal(breakdown.get("food"), 10000);
  assert.equal(breakdown.get("fees"), 1000);
  assert.equal(breakdown.get("discount"), -200);
  assert.equal(paymentMethods.reduce((sum, row) => sum + row.amount, 0), 10800);
});
