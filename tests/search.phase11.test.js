import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTransactionSearchText,
  filterTransactions,
  transactionMatchesQuery,
} from "../src/domain/receipt/receiptSearchIndex.js";

const categories = [
  { id: "groceries", name: "Groceries", parentId: "" },
  { id: "personal_care", name: "Personal Care", parentId: "" },
  { id: "coffee", name: "Coffee", parentId: "" },
  { id: "household", name: "Household", parentId: "" },
];

const accounts = [
  { id: "kbank", name: "KBank" },
  { id: "wallet", name: "Wallet" },
];

const context = { categories, accounts };

const parentReceipt = {
  id: "lotus-parent",
  type: "expense",
  amount: 78000,
  accountId: "kbank",
  categoryId: "mixed",
  category: "mixed",
  merchant: "Lotus",
  note: "Weekly shop",
  tags: ["home"],
  paymentMethod: "card",
  date: "2026-04-10",
  isSplitParent: true,
  splitGroupId: "split-lotus",
};

const toothpasteChild = {
  id: "lotus-toothpaste",
  type: "expense",
  amount: 9000,
  accountId: "kbank",
  categoryId: "personal_care",
  category: "personal_care",
  merchant: "Lotus",
  itemName: "\u0e22\u0e32\u0e2a\u0e35\u0e1f\u0e31\u0e19",
  date: "2026-04-10",
  isSplitChild: true,
  splitGroupId: "split-lotus",
  splitParentId: "lotus-parent",
  receiptLines: [{ rawName: "\u0e22\u0e32\u0e2a\u0e35\u0e1f\u0e31\u0e19", totalSatang: 9000, categoryId: "personal_care" }],
};

const coffeeTx = {
  id: "coffee-1",
  type: "expense",
  amount: 14000,
  accountId: "wallet",
  categoryId: "coffee",
  category: "coffee",
  merchant: "Starbucks",
  note: "Meeting",
  tags: ["work"],
  paymentMethod: "cash",
  date: "2026-04-12",
};

const transactions = [parentReceipt, toothpasteChild, coffeeTx];

test("phase 11 search: search text includes merchant, note, tags, category, account, payment method, and receipt item", () => {
  const text = buildTransactionSearchText(toothpasteChild, context);

  assert.equal(transactionMatchesQuery(coffeeTx, "Starbucks meeting work coffee wallet cash", context), true);
  assert.equal(text.includes("\u0e22\u0e32\u0e2a\u0e35\u0e1f\u0e31\u0e19"), true);
  assert.equal(text.includes("personal care"), true);
});

test("phase 11 search: merchant, note, tag, and category filters work", () => {
  assert.deepEqual(filterTransactions(transactions, { merchant: "Starbucks" }, context).map((tx) => tx.id), ["coffee-1"]);
  assert.deepEqual(filterTransactions(transactions, { note: "Weekly" }, context).map((tx) => tx.id), ["lotus-parent"]);
  assert.deepEqual(filterTransactions(transactions, { tags: ["work"] }, context).map((tx) => tx.id), ["coffee-1"]);
  assert.deepEqual(filterTransactions(transactions, { categoryId: "coffee" }, context).map((tx) => tx.id), ["coffee-1"]);
});

test("phase 11 search: Thai receipt item search returns the parent receipt without duplicate children", () => {
  const rows = filterTransactions(transactions, { query: "\u0e22\u0e32\u0e2a\u0e35\u0e1f\u0e31\u0e19" }, context);

  assert.deepEqual(rows.map((tx) => tx.id), ["lotus-parent"]);
});

test("phase 11 search: expanded mode can show matching split children", () => {
  const rows = filterTransactions(transactions, {
    query: "\u0e22\u0e32\u0e2a\u0e35\u0e1f\u0e31\u0e19",
    expanded: true,
  }, context);

  assert.deepEqual(rows.map((tx) => tx.id), ["lotus-toothpaste"]);
});

test("phase 11 filters: date, amount, account, payment method, type, and combined filters work", () => {
  assert.deepEqual(filterTransactions(transactions, { startDate: "2026-04-11" }, context).map((tx) => tx.id), ["coffee-1"]);
  assert.deepEqual(filterTransactions(transactions, { minAmountSatang: 10000, maxAmountSatang: 20000 }, context).map((tx) => tx.id), ["coffee-1"]);
  assert.deepEqual(filterTransactions(transactions, { accountId: "wallet" }, context).map((tx) => tx.id), ["coffee-1"]);
  assert.deepEqual(filterTransactions(transactions, { paymentMethod: "card" }, context).map((tx) => tx.id), ["lotus-parent"]);
  assert.deepEqual(filterTransactions(transactions, { type: "expense", query: "Starbucks", accountId: "wallet" }, context).map((tx) => tx.id), ["coffee-1"]);
});
