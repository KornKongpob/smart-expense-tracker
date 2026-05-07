import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateDebtOverview,
  generateDebtRecommendations,
  getDebtAccounts,
  simulateDebtPayoff,
  sortDebtsByStrategy,
} from '../src/features/debts/debtPayoff.js';

test('debt payoff: debt owed is positive for negative credit balances', () => {
  const state = {
    accounts: [
      {
        id: 'card',
        name: 'Visa',
        type: 'credit',
        openingBalance: 0,
        creditLimit: 1_000_000,
        statementDay: 1,
        dueDay: 10,
        apr: 20,
      },
    ],
    transactions: [
      {
        id: 'tx-card-spend',
        accountId: 'card',
        type: 'expense',
        amount: 50_000,
        date: '2026-05-01',
      },
    ],
  };

  const [debt] = getDebtAccounts(state);

  assert.equal(debt.balance, -50_000);
  assert.equal(debt.debtOwed, 50_000);
  assert.equal(debt.utilizationPct, 5);
  assert.equal(debt.minimumPayment, 30_000);

  const overview = calculateDebtOverview(state, { today: '2026-05-05', dueSoonDays: 7 });
  assert.equal(overview.totalDebt, 50_000);
  assert.equal(overview.totalMinimumPayment, 30_000);
  assert.deepEqual(overview.dueSoon.map((item) => item.dueDate), ['2026-05-10']);
});

test('debt payoff: avalanche sorts highest APR first without mutating input', () => {
  const debts = [
    { accountId: 'low', name: 'Low APR', debtOwed: 100_000, apr: 5, utilizationPct: 20 },
    { accountId: 'high', name: 'High APR', debtOwed: 200_000, apr: 25, utilizationPct: 10 },
  ];

  const sorted = sortDebtsByStrategy(debts, 'avalanche');

  assert.deepEqual(sorted.map((debt) => debt.accountId), ['high', 'low']);
  assert.deepEqual(debts.map((debt) => debt.accountId), ['low', 'high']);
});

test('debt payoff: snowball sorts smallest debt first', () => {
  const debts = [
    { accountId: 'large', name: 'Large', debtOwed: 300_000, apr: 10, utilizationPct: 20 },
    { accountId: 'small', name: 'Small', debtOwed: 75_000, apr: 20, utilizationPct: 80 },
    { accountId: 'mid', name: 'Mid', debtOwed: 150_000, apr: 30, utilizationPct: 50 },
  ];

  const sorted = sortDebtsByStrategy(debts, 'snowball');

  assert.deepEqual(sorted.map((debt) => debt.accountId), ['small', 'mid', 'large']);
});

test('debt payoff: simulation reaches zero for a reasonable debt budget', () => {
  const debts = [
    { accountId: 'a', name: 'Card A', debtOwed: 100_000, apr: 0, minimumPayment: 30_000 },
    { accountId: 'b', name: 'Card B', debtOwed: 50_000, apr: 12, minimumPayment: 30_000 },
  ];

  const result = simulateDebtPayoff(debts, {
    strategy: 'snowball',
    monthlyBudgetForDebt: 80_000,
    maxMonths: 24,
  });

  assert.deepEqual(result.payoffOrder, ['b', 'a']);
  assert.ok(result.monthsToPayoff > 0);
  assert.ok(result.monthsToPayoff <= 24);
  assert.equal(result.schedule[result.schedule.length - 1].remainingDebt, 0);
  assert.ok(result.totalInterestEstimate >= 0);
});

test('debt payoff: empty state is safe and returns a setup-neutral recommendation', () => {
  const state = {
    accounts: [{ id: 'cash', name: 'Cash', type: 'cash', openingBalance: 100_000 }],
    transactions: [],
  };

  const debts = getDebtAccounts(state);
  const overview = calculateDebtOverview(state);
  const simulation = simulateDebtPayoff([], { monthlyBudgetForDebt: 10_000 });
  const recommendations = generateDebtRecommendations(state);

  assert.deepEqual(debts, []);
  assert.equal(overview.totalDebt, 0);
  assert.equal(overview.totalMinimumPayment, 0);
  assert.equal(overview.averageUtilizationPct, 0);
  assert.deepEqual(overview.dueSoon, []);
  assert.equal(simulation.monthsToPayoff, 0);
  assert.ok(recommendations.some((item) => item.id === 'debt-clear'));
});
