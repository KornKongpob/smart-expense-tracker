import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectRecurringCharges,
  getUpcomingBills,
  summarizeBills,
} from '../src/features/bills/detectBills.js';

test('bills detection: detects a monthly subscription', () => {
  const transactions = [
    {
      id: 'netflix-jan',
      type: 'expense',
      amount: 29_900,
      merchant: 'Netflix',
      categoryId: 'subscriptions',
      accountId: 'card',
      date: '2026-01-05',
    },
    {
      id: 'netflix-feb',
      type: 'expense',
      amount: 29_900,
      merchant: 'Netflix',
      categoryId: 'subscriptions',
      accountId: 'card',
      date: '2026-02-05',
    },
    {
      id: 'netflix-mar',
      type: 'expense',
      amount: 29_900,
      merchant: 'Netflix',
      categoryId: 'subscriptions',
      accountId: 'card',
      date: '2026-03-05',
    },
  ];

  const detected = detectRecurringCharges(transactions, { today: '2026-03-10' });

  assert.equal(detected.length, 1);
  assert.equal(detected[0].merchant, 'Netflix');
  assert.equal(detected[0].interval, 'monthly');
  assert.equal(detected[0].type, 'subscription');
  assert.equal(detected[0].amount, 29_900);
  assert.equal(detected[0].nextExpectedDate, '2026-04-05');
  assert.equal(detected[0].occurrenceCount, 3);
  assert.ok(detected[0].confidence > 0.8);
});

test('bills detection: detects a weekly bill', () => {
  const transactions = [
    {
      id: 'electric-1',
      type: 'expense',
      amount: 7_000,
      merchant: 'Electric Co',
      categoryId: 'utilities',
      accountId: 'bank',
      date: '2026-05-01',
    },
    {
      id: 'electric-2',
      type: 'expense',
      amount: 7_000,
      merchant: 'Electric Co',
      categoryId: 'utilities',
      accountId: 'bank',
      date: '2026-05-08',
    },
    {
      id: 'electric-3',
      type: 'expense',
      amount: 7_000,
      merchant: 'Electric Co',
      categoryId: 'utilities',
      accountId: 'bank',
      date: '2026-05-15',
    },
    {
      id: 'electric-4',
      type: 'expense',
      amount: 7_000,
      merchant: 'Electric Co',
      categoryId: 'utilities',
      accountId: 'bank',
      date: '2026-05-22',
    },
  ];

  const detected = detectRecurringCharges(transactions, { today: '2026-05-23' });

  assert.equal(detected.length, 1);
  assert.equal(detected[0].interval, 'weekly');
  assert.equal(detected[0].type, 'bill');
  assert.equal(detected[0].amount, 7_000);
  assert.equal(detected[0].nextExpectedDate, '2026-05-29');
});

test('bills detection: ignores one-offs, transfers, and split parents', () => {
  const transactions = [
    {
      id: 'one-off',
      type: 'expense',
      amount: 12_000,
      merchant: 'Book Store',
      categoryId: 'shopping',
      accountId: 'bank',
      date: '2026-05-01',
    },
    {
      id: 'transfer-1',
      type: 'transfer',
      amount: 20_000,
      merchant: 'Move Money',
      categoryId: 'transfer',
      accountId: 'bank',
      date: '2026-04-01',
    },
    {
      id: 'transfer-2',
      type: 'transfer',
      amount: 20_000,
      merchant: 'Move Money',
      categoryId: 'transfer',
      accountId: 'bank',
      date: '2026-05-01',
    },
    {
      id: 'split-parent-1',
      type: 'expense',
      amount: 50_000,
      merchant: 'Shared Rent',
      categoryId: 'rent',
      accountId: 'bank',
      splitRole: 'parent',
      date: '2026-04-03',
    },
    {
      id: 'split-parent-2',
      type: 'expense',
      amount: 50_000,
      merchant: 'Shared Rent',
      categoryId: 'rent',
      accountId: 'bank',
      splitRole: 'parent',
      date: '2026-05-03',
    },
  ];

  assert.deepEqual(detectRecurringCharges(transactions, { today: '2026-05-05' }), []);
});

test('bills summary: detects price increase on a recurring subscription', () => {
  const state = {
    transactions: [
      {
        id: 'spotify-jan',
        type: 'expense',
        amount: 10_000,
        merchant: 'Spotify',
        categoryId: 'subscriptions',
        accountId: 'card',
        date: '2026-01-01',
      },
      {
        id: 'spotify-feb',
        type: 'expense',
        amount: 10_000,
        merchant: 'Spotify',
        categoryId: 'subscriptions',
        accountId: 'card',
        date: '2026-02-01',
      },
      {
        id: 'spotify-mar',
        type: 'expense',
        amount: 13_000,
        merchant: 'Spotify',
        categoryId: 'subscriptions',
        accountId: 'card',
        date: '2026-03-01',
      },
    ],
  };

  const detected = detectRecurringCharges(state.transactions, { today: '2026-03-02' });
  const summary = summarizeBills(state, { today: '2026-03-02' });

  assert.equal(detected.length, 1);
  assert.equal(detected[0].amount, 13_000);
  assert.equal(summary.monthlySubscriptionTotal, 13_000);
  assert.equal(summary.priceChanges.length, 1);
  assert.equal(summary.priceChanges[0].previousAmount, 10_000);
  assert.equal(summary.priceChanges[0].currentAmount, 13_000);
  assert.equal(summary.priceChanges[0].delta, 3_000);
  assert.ok(summary.recommendations.some((item) => item.id === 'bills-price-change'));
});

test('bills summary: handles empty state and merges explicit recurring rules', () => {
  assert.deepEqual(detectRecurringCharges([], { today: '2026-05-01' }), []);
  assert.deepEqual(getUpcomingBills({}, { today: '2026-05-01' }), []);

  const emptySummary = summarizeBills({}, { today: '2026-05-01' });
  assert.equal(emptySummary.monthlySubscriptionTotal, 0);
  assert.equal(emptySummary.monthlyBillsTotal, 0);
  assert.equal(emptySummary.upcomingCount, 0);
  assert.deepEqual(emptySummary.dueSoon, []);
  assert.deepEqual(emptySummary.priceChanges, []);

  const state = {
    transactions: [],
    recurring: [
      {
        id: 'rent',
        enabled: true,
        type: 'expense',
        amount: 250_000,
        note: 'Rent',
        categoryId: 'rent',
        accountId: 'bank',
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-05-10',
      },
    ],
  };

  const upcoming = getUpcomingBills(state, { today: '2026-05-01' });
  const summary = summarizeBills(state, { today: '2026-05-01', dueSoonDays: 10 });

  assert.equal(upcoming.length, 1);
  assert.equal(upcoming[0].source, 'recurring');
  assert.equal(upcoming[0].nextExpectedDate, '2026-05-10');
  assert.equal(summary.monthlyBillsTotal, 250_000);
  assert.equal(summary.upcomingCount, 1);
  assert.equal(summary.dueSoon.length, 1);
  assert.equal(summary.dueSoon[0].daysUntilDue, 9);
});
