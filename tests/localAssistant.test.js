import test from "node:test";
import assert from "node:assert/strict";

import {
  LOCAL_ASSISTANT_PRIVACY_NOTE,
  answerLocalAssistantQuestion,
  detectLocalAssistantIntent,
  normalizeAssistantState,
} from "../src/features/assistant/localAssistant.js";

function baseState(overrides = {}) {
  return {
    accounts: [
      {
        id: "cash",
        name: "Cash",
        type: "cash",
        openingBalance: 100_000,
      },
    ],
    transactions: [],
    budgets: [
      {
        id: "budget-total",
        month: "2026-05",
        categoryId: "__TOTAL__",
        limit: 80_000,
      },
    ],
    recurring: [],
    goals: [],
    categories: { expense: [], income: [] },
    ...overrides,
  };
}

test("local assistant: detects supported Thai intents", () => {
  assert.equal(detectLocalAssistantIntent("เดือนนี้เหลือใช้เท่าไร"), "monthly_available");
  assert.equal(detectLocalAssistantIntent("วันนี้ใช้ได้อีกเท่าไร"), "today_available");
  assert.equal(detectLocalAssistantIntent("30 วันข้างหน้า"), "forecast_30d");
  assert.equal(detectLocalAssistantIntent("ควรจ่ายหนี้ใบไหนก่อน"), "debt_priority");
  assert.equal(detectLocalAssistantIntent("มีบิลอะไรใกล้ถึงกำหนด"), "upcoming_bills");
  assert.equal(detectLocalAssistantIntent("เป้าหมายออมไหนตามไม่ทัน"), "lagging_goals");
});

test("local assistant: monthly available uses integer satang metadata", () => {
  const answer = answerLocalAssistantQuestion(
    baseState({
      transactions: [
        {
          id: "food",
          type: "expense",
          amount: 10_000,
          accountId: "cash",
          category: "food",
          date: "2026-05-02",
        },
      ],
    }),
    "เดือนนี้เหลือใช้เท่าไร",
    { today: "2026-05-05" },
  );

  assert.equal(answer.intent, "monthly_available");
  assert.equal(answer.privacyNote, LOCAL_ASSISTANT_PRIVACY_NOTE);
  assert.equal(answer.cards[0].valueSatang, 70_000);
  assert.equal(answer.cards[0].actionView, "budgets");
});

test("local assistant: debt priority focuses highest APR debt", () => {
  const answer = answerLocalAssistantQuestion(
    baseState({
      accounts: [
        { id: "cash", type: "cash", openingBalance: 100_000 },
        {
          id: "card-a",
          name: "Card A",
          type: "credit",
          openingBalance: -50_000,
          creditLimit: 100_000,
          apr: 24,
        },
        {
          id: "card-b",
          name: "Card B",
          type: "credit",
          openingBalance: -90_000,
          creditLimit: 120_000,
          apr: 12,
        },
      ],
    }),
    "ควรจ่ายหนี้ใบไหนก่อน",
    { today: "2026-05-05" },
  );

  assert.equal(answer.intent, "debt_priority");
  assert.equal(answer.cards[0].meta.accountId, "card-a");
  assert.equal(answer.cards[0].valueSatang, 50_000);
  assert.equal(answer.cards[0].actionView, "debts");
});

test("local assistant: upcoming bills uses recurring due soon", () => {
  const answer = answerLocalAssistantQuestion(
    baseState({
      recurring: [
        {
          id: "internet",
          enabled: true,
          type: "expense",
          amount: 45_000,
          startDate: "2026-05-08",
          frequency: "monthly",
          interval: 1,
          note: "Internet",
        },
      ],
    }),
    "มีบิลอะไรใกล้ถึงกำหนด",
    { today: "2026-05-05" },
  );

  assert.equal(answer.intent, "upcoming_bills");
  assert.equal(answer.cards[0].valueSatang, 45_000);
  assert.equal(answer.cards[0].actionView, "bills");
});

test("local assistant: goal answer flags due-date goals beyond monthly available", () => {
  const answer = answerLocalAssistantQuestion(
    baseState({
      accounts: [{ id: "cash", name: "Cash", type: "cash", openingBalance: 50_000 }],
      budgets: [{ id: "budget-total", month: "2026-05", categoryId: "__TOTAL__", limit: 50_000 }],
      goals: [
        {
          id: "trip",
          name: "Trip",
          type: "travel",
          targetAmount: 300_000,
          currentAmount: 0,
          dueDate: "2026-06-01",
          status: "active",
        },
      ],
    }),
    "เป้าหมายออมไหนตามไม่ทัน",
    { today: "2026-05-01" },
  );

  assert.equal(answer.intent, "lagging_goals");
  assert.equal(answer.cards[0].meta.goalId, "trip");
  assert.equal(answer.cards[0].severity, "warning");
});

test("local assistant: normalizes runtime account balances without mutating input", () => {
  const state = baseState({
    accounts: [{ id: 1, name: "Wallet", type: "cash", balance_satang: 85_000 }],
    transactions: [
      {
        id: "tx-1",
        kind: "expense",
        amount_satang: 15_000,
        account_id: 1,
        category_id: "food",
        date: "2026-05-02",
      },
    ],
  });

  const normalized = normalizeAssistantState(state);

  assert.equal(normalized.accounts[0].id, "1");
  assert.equal(normalized.accounts[0].openingBalance, 100_000);
  assert.equal(state.accounts[0].balance_satang, 85_000);
});
