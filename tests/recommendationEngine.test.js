import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateAssistantRecommendations,
  generatePersonalMoneyAssistantRecommendations,
  generatePersonalMoneyRecommendations,
  generateRecommendations,
} from '../src/features/assistant/recommendationEngine.js';

function baseState(overrides = {}) {
  return {
    accounts: [
      {
        id: 'cash',
        name: 'Cash',
        type: 'cash',
        openingBalance: 200_000,
      },
    ],
    transactions: [],
    budgets: [
      {
        id: 'budget-total',
        month: '2026-05',
        categoryId: '__TOTAL__',
        limit: 200_000,
      },
    ],
    recurring: [],
    goals: [],
    categories: { expense: [], income: [] },
    ...overrides,
  };
}

function ids(items) {
  return items.map((item) => item.id);
}

function find(items, id) {
  return items.find((item) => item.id === id);
}

test('assistant recommendations: exports stable aliases', () => {
  assert.equal(generateRecommendations, generateAssistantRecommendations);
  assert.equal(generatePersonalMoneyAssistantRecommendations, generateAssistantRecommendations);
  assert.equal(generatePersonalMoneyRecommendations, generateAssistantRecommendations);
});

test('assistant recommendations: cash-flow risk is critical and sorted first', () => {
  const state = baseState({
    accounts: [{ id: 'cash', type: 'cash', openingBalance: 50_000 }],
    recurring: [
      {
        id: 'rent',
        enabled: true,
        type: 'expense',
        amount: 80_000,
        startDate: '2026-05-10',
        frequency: 'monthly',
        interval: 1,
        note: 'Rent',
      },
    ],
  });

  const recommendations = generateAssistantRecommendations(state, {
    today: '2026-05-05',
    maxItems: 12,
  });

  assert.equal(recommendations[0].id, 'cashflow-risk-30d');
  assert.equal(recommendations[0].domain, 'cashflow');
  assert.equal(recommendations[0].severity, 'critical');
  assert.equal(recommendations[0].actionView, 'bills');
});

test('assistant recommendations: warns when safe spend is zero and budget is used too early', () => {
  const state = baseState({
    accounts: [{ id: 'cash', type: 'cash', openingBalance: 150_000 }],
    budgets: [{ id: 'budget-total', month: '2026-05', categoryId: '__TOTAL__', limit: 100_000 }],
    transactions: [
      {
        id: 'heavy-spend',
        type: 'expense',
        amount: 120_000,
        accountId: 'cash',
        category: 'food',
        date: '2026-05-04',
      },
    ],
  });

  const recommendations = generateAssistantRecommendations(state, {
    today: '2026-05-05',
    maxItems: 12,
  });

  assert.equal(find(recommendations, 'safe-to-spend-empty')?.severity, 'warning');
  assert.equal(find(recommendations, 'budget-used-early')?.domain, 'budget');
  assert.equal(find(recommendations, 'budget-used-early')?.severity, 'warning');
});

test('assistant recommendations: covers goals that are hard to reach, completed, and missing', () => {
  const hardGoalState = baseState({
    accounts: [{ id: 'cash', type: 'cash', openingBalance: 50_000 }],
    budgets: [{ id: 'budget-total', month: '2026-05', categoryId: '__TOTAL__', limit: 50_000 }],
    goals: [
      {
        id: 'trip',
        name: 'Trip',
        type: 'travel',
        targetAmount: 300_000,
        currentAmount: 0,
        dueDate: '2026-06-01',
        priority: 1,
        status: 'active',
      },
      {
        id: 'phone',
        name: 'Phone',
        type: 'purchase',
        targetAmount: 100_000,
        currentAmount: 100_000,
        status: 'completed',
      },
    ],
  });

  const goalRecommendations = generateAssistantRecommendations(hardGoalState, {
    today: '2026-05-01',
    maxItems: 12,
  });

  assert.ok(ids(goalRecommendations).includes('goal-hard-to-reach-trip'));
  assert.equal(find(goalRecommendations, 'goal-hard-to-reach-trip')?.severity, 'warning');
  assert.ok(ids(goalRecommendations).includes('goal-completed-phone'));
  assert.equal(find(goalRecommendations, 'goal-completed-phone')?.severity, 'success');

  const setupRecommendations = generateAssistantRecommendations(baseState({ goals: [] }), {
    today: '2026-05-01',
    maxItems: 12,
  });
  assert.equal(find(setupRecommendations, 'setup-goals')?.domain, 'setup');
});

test('assistant recommendations: covers debt utilization, due soon, APR setup, and skips debt when no credit accounts', () => {
  const debtState = baseState({
    accounts: [
      { id: 'cash', type: 'cash', openingBalance: 100_000 },
      {
        id: 'card',
        name: 'Visa',
        type: 'credit',
        openingBalance: 0,
        creditLimit: 100_000,
        dueDay: 10,
      },
    ],
    transactions: [
      {
        id: 'card-spend',
        type: 'expense',
        amount: 90_000,
        accountId: 'card',
        category: 'shopping',
        date: '2026-05-01',
      },
    ],
  });

  const recommendations = generateAssistantRecommendations(debtState, {
    today: '2026-05-05',
    maxItems: 12,
  });

  assert.equal(find(recommendations, 'debt-high-utilization')?.severity, 'warning');
  assert.equal(find(recommendations, 'debt-due-soon')?.severity, 'warning');
  assert.equal(find(recommendations, 'debt-missing-apr')?.severity, 'info');

  const noDebtRecommendations = generateAssistantRecommendations(baseState(), {
    today: '2026-05-05',
    maxItems: 12,
  });
  assert.equal(noDebtRecommendations.some((item) => item.domain === 'debt'), false);
});

test('assistant recommendations: covers bills due soon and subscription price increases', () => {
  const state = baseState({
    recurring: [
      {
        id: 'internet',
        enabled: true,
        type: 'expense',
        amount: 45_000,
        startDate: '2026-05-08',
        frequency: 'monthly',
        interval: 1,
        note: 'Internet bill',
      },
    ],
    transactions: [
      {
        id: 'spotify-jan',
        type: 'expense',
        amount: 10_000,
        merchant: 'Spotify',
        categoryId: 'subscriptions',
        accountId: 'cash',
        date: '2026-01-01',
      },
      {
        id: 'spotify-feb',
        type: 'expense',
        amount: 10_000,
        merchant: 'Spotify',
        categoryId: 'subscriptions',
        accountId: 'cash',
        date: '2026-02-01',
      },
      {
        id: 'spotify-mar',
        type: 'expense',
        amount: 13_000,
        merchant: 'Spotify',
        categoryId: 'subscriptions',
        accountId: 'cash',
        date: '2026-03-01',
      },
    ],
  });

  const recommendations = generateAssistantRecommendations(state, {
    today: '2026-05-05',
    maxItems: 12,
  });

  assert.equal(find(recommendations, 'bill-due-soon')?.severity, 'warning');
  assert.equal(find(recommendations, 'subscription-price-increase')?.domain, 'subscription');
  assert.equal(find(recommendations, 'subscription-price-increase')?.severity, 'warning');
});

test('assistant recommendations: setup defaults and maxItems are deterministic', () => {
  const recommendations = generateAssistantRecommendations({}, {
    today: '2026-05-05',
    maxItems: 4,
  });

  assert.equal(recommendations.length, 4);
  assert.deepEqual(recommendations.map((item) => item.severity), ['warning', 'info', 'info', 'info']);
  assert.ok(ids(recommendations).includes('setup-budget'));
  assert.ok(ids(recommendations).includes('setup-goals'));
  assert.ok(ids(recommendations).includes('setup-recurring'));
  assert.equal(recommendations.some((item) => item.domain === 'debt'), false);
});
