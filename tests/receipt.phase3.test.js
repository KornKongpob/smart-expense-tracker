import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReceiptSplitPlan,
  RECEIPT_SAVE_MODES,
  reconcileReceiptLines,
} from "../src/domain/receipt/index.js";
import { createReceiptSplitTransactions } from "../src/domain/ledger/createReceiptSplitTransactions.js";
import {
  calculateIncomeExpenseTotals,
  isReportableExpenseTransaction,
  isSplitChildTransaction,
  isSplitParentTransaction,
} from "../src/domain/ledger/index.js";
import { buildTransactionSavePlan } from "../src/features/app/transactionDrafts.js";

const lotusReceipt = {
  merchant: "Lotus",
  date: "2026-04-10",
  paidTotalSatang: 78000,
  items: [
    { id: "rice", rawName: "\u0e02\u0e49\u0e32\u0e27\u0e2a\u0e32\u0e23", totalSatang: 25000, suggestedCategoryId: "groceries" },
    {
      id: "dish-soap",
      rawName: "\u0e19\u0e49\u0e33\u0e22\u0e32\u0e25\u0e49\u0e32\u0e07\u0e08\u0e32\u0e19",
      totalSatang: 12000,
      suggestedCategoryId: "household",
    },
    {
      id: "toothpaste",
      rawName: "\u0e22\u0e32\u0e2a\u0e35\u0e1f\u0e31\u0e19",
      totalSatang: 9000,
      suggestedCategoryId: "personal_care",
    },
    { id: "snack", rawName: "\u0e02\u0e19\u0e21", totalSatang: 8000, suggestedCategoryId: "snacks" },
    { id: "shampoo", rawName: "\u0e41\u0e0a\u0e21\u0e1e\u0e39", totalSatang: 28000, suggestedCategoryId: "personal_care" },
  ],
  adjustments: [{ id: "discount", type: "discount", label: "Discount", amountSatang: 4000, effect: "subtract" }],
};

function baseTransaction(overrides = {}) {
  return {
    accountId: "cash",
    date: "2026-04-10",
    merchant: "Lotus",
    note: "Weekly shop",
    paymentMethod: "cash",
    ...overrides,
  };
}

function amountByCategory(transactions) {
  const map = new Map();
  for (const tx of transactions) {
    if (!isReportableExpenseTransaction(tx)) continue;
    const sign = tx.adjustmentEffect === "subtract" ? -1 : 1;
    const category = tx.categoryId || tx.category || "";
    map.set(category, (map.get(category) || 0) + sign * Math.abs(Number(tx.amount || 0)));
  }
  return map;
}

test("receipt phase 3: split by category creates an excluded parent and reportable category children", () => {
  const plan = buildReceiptSplitPlan({
    receipt: lotusReceipt,
    mode: RECEIPT_SAVE_MODES.SPLIT_BY_CATEGORY,
    baseTransaction: baseTransaction(),
    fallbackCategoryId: "mixed",
    splitGroupId: "lotus-split-1",
    parentId: "lotus-parent-1",
  });

  assert.equal(plan.parent.amount, 78000);
  assert.equal(plan.parent.isSplitParent, true);
  assert.equal(isSplitParentTransaction(plan.parent), true);
  assert.equal(isReportableExpenseTransaction(plan.parent), false);
  assert.equal(plan.reconciliation.balanced, true);
  assert.equal(plan.reconciliation.netSatang, 78000);

  const dashboardRows = plan.transactions.filter((tx) => !tx.isSplitChild);
  assert.deepEqual(dashboardRows.map((tx) => tx.id), ["lotus-parent-1"]);

  assert.equal(plan.children.length, 5);
  assert.ok(plan.children.every((child) => isSplitChildTransaction(child)));
  assert.ok(plan.children.every((child) => isReportableExpenseTransaction(child)));
  assert.ok(plan.children.every((child) => child.splitGroupId === "lotus-split-1"));

  const totals = amountByCategory(plan.transactions);
  assert.equal(totals.get("groceries"), 25000);
  assert.equal(totals.get("household"), 12000);
  assert.equal(totals.get("personal_care"), 37000);
  assert.equal(totals.get("snacks"), 8000);
  assert.equal(totals.get("discount"), -4000);
  assert.deepEqual(calculateIncomeExpenseTotals(plan.transactions), {
    income: 0,
    expense: 78000,
    net: -78000,
  });
});

test("receipt phase 3: split by item creates one child per purchased item", () => {
  const plan = buildReceiptSplitPlan({
    receipt: {
      merchant: "Cafe Bloom",
      paidTotalSatang: 26500,
      items: [
        { id: "latte", rawName: "Iced latte", totalSatang: 14500, suggestedCategoryId: "coffee" },
        { id: "croissant", rawName: "Croissant", totalSatang: 12000, suggestedCategoryId: "bakery" },
      ],
    },
    mode: RECEIPT_SAVE_MODES.SPLIT_BY_ITEM,
    baseTransaction: baseTransaction({ merchant: "Cafe Bloom", note: "" }),
  });

  assert.equal(plan.parent.amount, 26500);
  assert.equal(plan.children.length, 2);
  assert.deepEqual(
    plan.children.map((child) => [child.itemName, child.categoryId, child.amount]),
    [
      ["Iced latte", "coffee", 14500],
      ["Croissant", "bakery", 12000],
    ],
  );
});

test("receipt phase 3: save as single transaction preserves receipt lines without split flags", () => {
  const plan = buildReceiptSplitPlan({
    receipt: lotusReceipt,
    mode: RECEIPT_SAVE_MODES.SINGLE,
    baseTransaction: baseTransaction(),
  });

  assert.equal(plan.transaction.amount, 78000);
  assert.equal(plan.transaction.isSplitParent, false);
  assert.equal(plan.transaction.isSplitChild, false);
  assert.equal(plan.transaction.receiptLines.length, 6);
  assert.equal(isReportableExpenseTransaction(plan.transaction), true);
});

test("receipt phase 3: service charges increase report total and discounts reduce it", () => {
  const plan = buildReceiptSplitPlan({
    receipt: {
      merchant: "Cafe Bloom",
      paidTotalSatang: 10800,
      items: [{ rawName: "Lunch", totalSatang: 10000, suggestedCategoryId: "food" }],
      adjustments: [
        { type: "service_charge", label: "Service charge", amountSatang: 1000, effect: "add" },
        { type: "discount", label: "Member discount", amountSatang: 200, effect: "subtract" },
      ],
    },
    mode: RECEIPT_SAVE_MODES.SPLIT_BY_CATEGORY,
    baseTransaction: baseTransaction({ merchant: "Cafe Bloom" }),
  });

  const totals = amountByCategory(plan.transactions);
  assert.equal(totals.get("food"), 10000);
  assert.equal(totals.get("fees"), 1000);
  assert.equal(totals.get("discount"), -200);
  assert.equal(calculateIncomeExpenseTotals(plan.transactions).expense, 10800);
});

test("receipt phase 3: legacy discount category lines are stored as subtracting adjustment children", () => {
  const plan = buildReceiptSplitPlan({
    lines: [
      { name: "Groceries", amountSatang: 10000, categoryId: "groceries" },
      { name: "Promo", amountSatang: 2000, categoryId: "discount" },
    ],
    mode: RECEIPT_SAVE_MODES.SPLIT_BY_CATEGORY,
    baseTransaction: baseTransaction({ amount: 8000, merchant: "Mini Mart" }),
  });
  const discountChild = plan.children.find((child) => child.categoryId === "discount");

  assert.equal(discountChild?.receiptLineType, "adjustment");
  assert.equal(discountChild?.adjustmentEffect, "subtract");
  assert.equal(calculateIncomeExpenseTotals(plan.transactions).expense, 8000);
});

test("receipt phase 3: unbalanced receipt can be balanced with a rounding adjustment", () => {
  const unbalanced = reconcileReceiptLines([{ name: "Scanned total", amountSatang: 98800 }], 99000);

  assert.equal(unbalanced.balanced, false);
  assert.equal(unbalanced.differenceSatang, 200);
  assert.ok(unbalanced.warnings.includes("receipt_total_mismatch"));

  const balanced = reconcileReceiptLines([{ name: "Scanned total", amountSatang: 98800 }], 99000, {
    addRoundingAdjustment: true,
  });

  assert.equal(balanced.balanced, true);
  assert.equal(balanced.differenceSatang, 0);
  assert.equal(balanced.netSatang, 99000);
  assert.equal(balanced.lines.at(-1).adjustmentType, "rounding");
  assert.equal(balanced.lines.at(-1).adjustmentEffect, "add");
});

test("receipt phase 3: changing a line category changes the category split child", () => {
  const original = buildReceiptSplitPlan({
    lines: [
      { name: "Lunch", amountSatang: 10000, categoryId: "food" },
      { name: "Coffee beans", amountSatang: 12000, categoryId: "groceries" },
    ],
    mode: RECEIPT_SAVE_MODES.SPLIT_BY_CATEGORY,
    baseTransaction: baseTransaction({ amount: 22000, merchant: "Market" }),
  });
  const edited = buildReceiptSplitPlan({
    lines: [
      { name: "Lunch", amountSatang: 10000, categoryId: "food" },
      { name: "Coffee beans", amountSatang: 12000, categoryId: "coffee" },
    ],
    mode: RECEIPT_SAVE_MODES.SPLIT_BY_CATEGORY,
    baseTransaction: baseTransaction({ amount: 22000, merchant: "Market" }),
  });

  assert.ok(original.children.some((child) => child.categoryId === "groceries"));
  assert.equal(edited.children.some((child) => child.categoryId === "groceries"), false);
  assert.equal(edited.children.find((child) => child.categoryId === "coffee")?.amount, 12000);
});

test("receipt phase 3: ledger wrapper returns the receipt split transactions", () => {
  const transactions = createReceiptSplitTransactions({
    receipt: lotusReceipt,
    mode: RECEIPT_SAVE_MODES.SPLIT_BY_CATEGORY,
    baseTransaction: baseTransaction(),
    parentId: "lotus-parent-wrapper",
  });

  assert.equal(transactions.length, 6);
  assert.equal(transactions[0].id, "lotus-parent-wrapper");
  assert.equal(transactions[0].isSplitParent, true);
  assert.equal(calculateIncomeExpenseTotals(transactions).expense, 78000);
});

test("receipt phase 3: transaction save plan supports split by item mode", () => {
  const plan = buildTransactionSavePlan({
    userId: "user-1",
    source: "scan_approval",
    draft: {
      kind: "expense",
      accountId: "cash",
      amountSatang: 26500,
      merchant: "Cafe Bloom",
      date: "2026-04-10",
      receiptSaveMode: RECEIPT_SAVE_MODES.SPLIT_BY_ITEM,
      receiptGroups: [
        { name: "Iced latte", amountSatang: 14500, categoryId: "coffee" },
        { name: "Croissant", amountSatang: 12000, categoryId: "bakery" },
      ],
    },
  });

  assert.equal(plan.mode, "split");
  assert.equal(plan.sanitized.receiptSaveMode, RECEIPT_SAVE_MODES.SPLIT_BY_ITEM);
  assert.equal(plan.sanitized.splitByCategory, false);
  assert.equal(plan.parentRow.raw.receiptSaveMode, RECEIPT_SAVE_MODES.SPLIT_BY_ITEM);
  assert.deepEqual(
    plan.childRows.map((row) => [row.note, row.category_id, row.amount_satang]),
    [
      ["Iced latte", "coffee", 14500],
      ["Croissant", "bakery", 12000],
    ],
  );
});
