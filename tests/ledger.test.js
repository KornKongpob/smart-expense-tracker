import test from "node:test";
import assert from "node:assert/strict";

import {
  accountLedgerBalanceSatang,
  calculateIncomeExpenseTotals,
  netWorthSatang,
} from "../src/domain/ledger/ledgerMath.js";
import {
  createCreditPaymentPair,
  createExpenseTransaction,
  createIncomeTransaction,
  createTransferPair,
  isBudgetRelevantTransaction,
  isReportableExpenseTransaction,
  isReportableIncomeTransaction,
  isSplitChildTransaction,
  isSplitParentTransaction,
  isTransferTransaction,
} from "../src/domain/ledger/index.js";

test("ledger: creates a valid reportable expense transaction", () => {
  const tx = createExpenseTransaction({
    id: "tx-expense-1",
    amount: 12500,
    date: "2026-04-01",
    accountId: "cash",
    categoryId: "food",
    merchant: "Cafe",
  });

  assert.equal(tx.type, "expense");
  assert.equal(tx.amount, 12500);
  assert.equal(tx.category, "food");
  assert.equal(tx.accountId, "cash");
  assert.equal(isReportableExpenseTransaction(tx), true);
  assert.equal(isBudgetRelevantTransaction(tx), true);
});

test("ledger: creates a valid reportable income transaction", () => {
  const tx = createIncomeTransaction({
    id: "tx-income-1",
    amount: 500000,
    date: "2026-04-01",
    accountId: "bank",
    categoryId: "salary",
  });

  assert.equal(tx.type, "income");
  assert.equal(tx.amount, 500000);
  assert.equal(isReportableIncomeTransaction(tx), true);
  assert.equal(isBudgetRelevantTransaction(tx), false);
});

test("ledger: transfer creates linked legs and stays out of reports", () => {
  const [outTx, inTx] = createTransferPair({
    transferId: "tr-1",
    outId: "tr-1-out",
    inId: "tr-1-in",
    amount: 100000,
    date: "2026-04-02",
    fromAccountId: "kbank",
    toAccountId: "wallet",
  });

  assert.equal(outTx.transferId, "tr-1");
  assert.equal(inTx.transferId, "tr-1");
  assert.equal(outTx.type, "expense");
  assert.equal(inTx.type, "income");
  assert.equal(isTransferTransaction(outTx), true);
  assert.equal(isTransferTransaction(inTx), true);
  assert.deepEqual(calculateIncomeExpenseTotals([outTx, inTx]), {
    income: 0,
    expense: 0,
    net: 0,
  });
  assert.equal(accountLedgerBalanceSatang({ id: "kbank", type: "bank", openingBalance: 500000 }, [outTx, inTx]), 400000);
  assert.equal(accountLedgerBalanceSatang({ id: "wallet", type: "ewallet", openingBalance: 0 }, [outTx, inTx]), 100000);
});

test("ledger: credit card payment reduces source account and card outstanding without expense", () => {
  const [outTx, inTx] = createCreditPaymentPair({
    transferId: "cc-pay-1",
    amount: 500000,
    date: "2026-04-05",
    fromAccountId: "kbank",
    toAccountId: "visa",
  });

  const bank = { id: "kbank", type: "bank", openingBalance: 900000 };
  const card = { id: "visa", type: "credit", openingBalance: 800000, creditLimit: 2000000 };

  assert.equal(outTx.transferKind, "credit_payment");
  assert.equal(inTx.transferKind, "credit_payment");
  assert.equal(accountLedgerBalanceSatang(bank, [outTx, inTx]), 400000);
  assert.equal(accountLedgerBalanceSatang(card, [outTx, inTx]), 300000);
  assert.deepEqual(calculateIncomeExpenseTotals([outTx, inTx]), {
    income: 0,
    expense: 0,
    net: 0,
  });
});

test("ledger: credit card purchase counts as expense and increases outstanding", () => {
  const purchase = createExpenseTransaction({
    id: "tx-card-buy",
    amount: 80000,
    date: "2026-04-06",
    accountId: "visa",
    categoryId: "groceries",
  });
  const card = { id: "visa", type: "credit", openingBalance: 0, creditLimit: 2000000 };

  assert.deepEqual(calculateIncomeExpenseTotals([purchase]), {
    income: 0,
    expense: 80000,
    net: -80000,
  });
  assert.equal(accountLedgerBalanceSatang(card, [purchase]), 80000);
});

test("ledger: split parent is excluded and split child is included", () => {
  const parent = createExpenseTransaction({
    id: "receipt-parent",
    amount: 78000,
    date: "2026-04-07",
    accountId: "cash",
    categoryId: "mixed",
    isSplitParent: true,
    splitGroupId: "sg-1",
  });
  const child = createExpenseTransaction({
    id: "receipt-child",
    amount: 25000,
    date: "2026-04-07",
    accountId: "cash",
    categoryId: "groceries",
    isSplitChild: true,
    splitGroupId: "sg-1",
    splitParentId: "receipt-parent",
  });

  assert.equal(isSplitParentTransaction(parent), true);
  assert.equal(isSplitChildTransaction(child), true);
  assert.equal(isReportableExpenseTransaction(parent), false);
  assert.equal(isReportableExpenseTransaction(child), true);
  assert.equal(isBudgetRelevantTransaction(parent), false);
  assert.equal(isBudgetRelevantTransaction(child), true);
  assert.deepEqual(calculateIncomeExpenseTotals([parent, child]), {
    income: 0,
    expense: 25000,
    net: -25000,
  });
});

test("ledger: net worth treats credit card outstanding as liability", () => {
  const purchase = createExpenseTransaction({
    amount: 80000,
    date: "2026-04-08",
    accountId: "visa",
    categoryId: "groceries",
  });
  const accounts = [
    { id: "bank", type: "bank", openingBalance: 500000 },
    { id: "visa", type: "credit", openingBalance: 0, creditLimit: 200000 },
  ];

  assert.equal(netWorthSatang(accounts, [purchase]), 420000);
});
