import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateMonthlyPlan,
  calculateMoneyHealthScore,
  forecastCashFlow,
  generateMoneyPlanRecommendations,
} from '../src/features/money-plan/moneyPlan.js';

function baseState(overrides = {}) {
  return {
    accounts: [
      {
        id: 'cash',
        name: 'Cash',
        type: 'cash',
        openingBalance: 100_000,
      },
    ],
    transactions: [],
    budgets: [],
    recurring: [],
    ...overrides,
  };
}

test('money plan: keeps satang arithmetic and ignores transfer-like and split parent rows', () => {
  const state = baseState({
    accounts: [
      { id: 'cash', name: 'Cash', type: 'cash', openingBalance: 100_000 },
      { id: 'bank', name: 'Bank', type: 'bank', openingBalance: 0 },
    ],
    transactions: [
      { id: 'expense', type: 'expense', amount: 25_000, accountId: 'cash', date: '2026-05-02', category: 'food' },
      { id: 'income', type: 'income', amount: 50_000, accountId: 'cash', date: '2026-05-03', category: 'salary' },
      { id: 'transfer', type: 'expense', amount: 99_999, accountId: 'cash', date: '2026-05-04', isTransfer: true },
      { id: 'transfer-pair', type: 'income', amount: 99_999, accountId: 'bank', date: '2026-05-04', isTransfer: true },
      { id: 'split-parent', type: 'expense', amount: 40_000, accountId: 'cash', date: '2026-05-05', isSplitParent: true },
      { id: 'split-child', type: 'expense', amount: 10_000, accountId: 'cash', date: '2026-05-05', isSplitChild: true },
    ],
    budgets: [{ id: 'b-total', month: '2026-05', categoryId: '__TOTAL__', limit: 80_000 }],
  });

  const plan = calculateMonthlyPlan(state, { today: '2026-05-10' });

  assert.equal(plan.monthKey, '2026-05');
  assert.equal(plan.incomeThisMonth, 50_000);
  assert.equal(plan.expenseThisMonth, 35_000);
  assert.equal(plan.monthlyBudgetLimit, 80_000);
  assert.equal(plan.monthlyBudgetRemaining, 45_000);
  assert.equal(plan.availableThisMonth, 45_000);
});

test('money plan: safe-to-spend respects the monthly budget', () => {
  const state = baseState({
    accounts: [{ id: 'cash', type: 'cash', openingBalance: 100_000 }],
    transactions: [
      { id: 'groceries', type: 'expense', amount: 25_000, accountId: 'cash', date: '2026-05-01', category: 'food' },
    ],
    budgets: [{ id: 'b-total', month: '2026-05', categoryId: '__TOTAL__', limit: 60_000 }],
  });

  const plan = calculateMonthlyPlan(state, { today: '2026-05-10' });

  assert.equal(plan.daysRemaining, 22);
  assert.equal(plan.monthlyBudgetRemaining, 35_000);
  assert.equal(plan.availableThisMonth, 35_000);
  assert.equal(plan.safeToSpendPerDay, 1_590);
  assert.equal(plan.safeToSpendToday, 1_590);
});

test('money plan: recurring future expenses reduce available monthly amount', () => {
  const state = baseState({
    accounts: [{ id: 'cash', type: 'cash', openingBalance: 100_000 }],
    budgets: [{ id: 'b-total', month: '2026-05', categoryId: '__TOTAL__', limit: 100_000 }],
    recurring: [
      {
        id: 'rent',
        enabled: true,
        type: 'expense',
        amount: 30_000,
        startDate: '2026-05-20',
        frequency: 'monthly',
        interval: 1,
        note: 'Rent',
      },
    ],
  });

  const plan = calculateMonthlyPlan(state, { today: '2026-05-10' });

  assert.equal(plan.recurringExpenseRemaining, 30_000);
  assert.equal(plan.monthlyBudgetRemaining, 70_000);
  assert.equal(plan.availableThisMonth, 70_000);
});

test('money plan: cash-flow forecast detects the lowest balance date', () => {
  const state = baseState({
    accounts: [{ id: 'cash', type: 'cash', openingBalance: 50_000 }],
    recurring: [
      {
        id: 'bill',
        enabled: true,
        type: 'expense',
        amount: 80_000,
        startDate: '2026-05-12',
        frequency: 'monthly',
        interval: 1,
        note: 'Bill',
      },
    ],
  });

  const forecast = forecastCashFlow(state, { today: '2026-05-10', days: 5 });

  assert.equal(forecast.startingBalance, 50_000);
  assert.equal(forecast.projectedEndingBalance, -30_000);
  assert.equal(forecast.lowestBalance, -30_000);
  assert.equal(forecast.lowestBalanceDate, '2026-05-12');
  assert.deepEqual(forecast.events.map((event) => [event.date, event.amount]), [['2026-05-12', -80_000]]);
});

test('money plan: empty state returns safe zeros and setup recommendations', () => {
  const plan = calculateMonthlyPlan({}, { today: '2026-05-10' });
  const forecast = forecastCashFlow({}, { today: '2026-05-10', days: 3 });
  const health = calculateMoneyHealthScore({}, { today: '2026-05-10' });
  const recommendations = generateMoneyPlanRecommendations({}, { today: '2026-05-10' });

  assert.equal(plan.incomeThisMonth, 0);
  assert.equal(plan.expenseThisMonth, 0);
  assert.equal(plan.availableThisMonth, 0);
  assert.equal(forecast.startingBalance, 0);
  assert.equal(forecast.daily.length, 3);
  assert.ok(health.score >= 0 && health.score <= 100);
  assert.ok(recommendations.some((item) => item.id === 'setup-accounts'));
  assert.ok(recommendations.some((item) => item.id === 'setup-budget'));
});
