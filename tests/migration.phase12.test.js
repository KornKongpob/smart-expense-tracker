import test from "node:test";
import assert from "node:assert/strict";

import { createInitialState } from "../src/store/boot.js";
import { selectIncomeVsExpense } from "../src/store/selectors/reportSelectors.js";
import { filterTransactions } from "../src/domain/receipt/receiptSearchIndex.js";

test("phase 12 migration: app starts with empty local storage payload", () => {
  const state = createInitialState({});

  assert.ok(Array.isArray(state.transactions));
  assert.ok(Array.isArray(state.accounts));
  assert.ok(state.accounts.length >= 1);
  assert.ok(Array.isArray(state.categories.expense));
  assert.equal(state.moneyUnit, "satang");
});

test("phase 12 migration: old transaction fields are repaired and remain reportable", () => {
  const state = createInitialState({
    transactions: [
      {
        id: "old-child",
        txType: "expense",
        amountSatang: "9000",
        date: "2026-04-10",
        category: "personal_care",
        is_split_child: true,
        split_group_id: "split-old",
        split_parent_id: "old-parent",
        adjustment_effect: "",
        receipt_line_type: "item",
        receiptLines: [{ name: "\u0e22\u0e32\u0e2a\u0e35\u0e1f\u0e31\u0e19", totalSatang: "9000" }],
      },
    ],
    accounts: [{ id: "cash", name: "Cash", type: "cash", openingBalance: 0 }],
    categories: { expense: [{ id: "personal_care", name: "Personal Care" }], income: [] },
  });

  const tx = state.transactions[0];

  assert.equal(tx.type, "expense");
  assert.equal(tx.txType, "expense");
  assert.equal(tx.amount, 9000);
  assert.equal(tx.isSplitChild, true);
  assert.equal(tx.splitGroupId, "split-old");
  assert.equal(tx.receiptLines[0].qty, 1);
  assert.equal(tx.receiptLines[0].totalSatang, 9000);
  assert.equal(selectIncomeVsExpense(state.transactions, { monthKey: "2026-04" }).expense, 9000);
});

test("phase 12 migration: old receipt object becomes searchable normalized receipt data", () => {
  const state = createInitialState({
    transactions: [
      {
        id: "old-receipt",
        type: "expense",
        amount: 12500,
        date: "2026-04-12",
        merchant: "Lotus",
        receipt: {
          merchant: "Lotus",
          paidTotalSatang: "12500",
          items: [{ rawName: "\u0e02\u0e49\u0e32\u0e27\u0e2a\u0e32\u0e23", totalSatang: "12500" }],
        },
      },
    ],
  });

  const tx = state.transactions[0];
  const rows = filterTransactions(state.transactions, { query: "\u0e02\u0e49\u0e32\u0e27" }, { categories: state.categories });

  assert.equal(tx.receipt.paidTotalSatang, 12500);
  assert.equal(tx.receipt.items[0].qty, 1);
  assert.equal(tx.receiptLines[0].rawName, "\u0e02\u0e49\u0e32\u0e27\u0e2a\u0e32\u0e23");
  assert.deepEqual(rows.map((row) => row.id), ["old-receipt"]);
});

test("phase 12 migration: invalid old records are repaired without fatal crashes", () => {
  const state = createInitialState({
    transactions: [
      null,
      {
        id: "bad-receipt",
        amount: "not money",
        date: "not-a-date",
        receipt: "bad receipt",
        receiptLines: { invalid: true },
      },
    ],
    scanInbox: [{ id: "scan-old", amount: "1000", groups: [{ name: "Line", amount: "1000" }] }],
  });

  assert.equal(state.transactions.length, 2);
  assert.ok(state.transactions.every((tx) => tx.id));
  assert.equal(state.transactions.find((tx) => tx.id === "bad-receipt").amount, 0);
  assert.equal(state.transactions.find((tx) => tx.id === "bad-receipt").receipt, null);
  assert.equal(state.inbox.length, 1);
  assert.equal(state.inbox[0].status, "pending");
});
