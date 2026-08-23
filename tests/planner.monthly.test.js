import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildBudgetHintCompat,
  buildBudgetPlanSnapshotCompat,
  buildPlannerDecisionSummary,
  buildPlannerMonthlyPlanState,
  getActivePlannerScenarioKey,
} from "../src/features/app/plannerMonthlyPlanState.js";

const MONTH_VALUE = "2026-04";
const TODAY = "2026-04-10";

function createCategories(behaviors = {}) {
  return {
    expense: [
      { id: "housing", kind: "expense", name: "Housing", parentId: "", isHidden: false, budgetBehavior: behaviors.housing || "fixed" },
      { id: "food", kind: "expense", name: "Food", parentId: "", isHidden: false, budgetBehavior: behaviors.food || "essential" },
      { id: "fun", kind: "expense", name: "Fun", parentId: "", isHidden: false, budgetBehavior: behaviors.fun || "flexible" },
      { id: "coffee", kind: "expense", name: "Coffee", parentId: "food", isHidden: false, budgetBehavior: "flexible" },
      { id: "groceries", kind: "expense", name: "Groceries", parentId: "", isHidden: false, budgetBehavior: behaviors.groceries || "essential" },
      { id: "leisure", kind: "expense", name: "Leisure", parentId: "", isHidden: false, budgetBehavior: behaviors.leisure || "flexible" },
    ],
    income: [],
  };
}

function createLegacySnapshot({
  availableExpenseSatang,
  appliedLimits = {},
  categoryIds = ["housing", "food", "fun"],
  debtStrategyMode = "paydown",
} = {}) {
  return {
    monthKey: MONTH_VALUE,
    today: TODAY,
    isCurrentMonth: true,
    selectedIncomeSatang: 220000,
    savingsReserveSatang: 20000,
    debtMinimumSatang: 10000,
    availableExpenseSatang,
    spentToDateSatang: 0,
    debtStrategyMode,
    debtTarget: null,
    categoryPlans: categoryIds.map((categoryId) => ({
      categoryId,
      name: categoryId,
      appliedLimitSatang: Number(appliedLimits[categoryId] || 0),
      suggestedLimitSatang: Number(appliedLimits[categoryId] || 0),
      averageSpendSatang: 0,
      spentMonthSatang: 0,
      childPlans: [],
      manualOverride: false,
      alertPct: 90,
    })),
  };
}

function createExpense(categoryId, amountSatang, date) {
  return {
    kind: "expense",
    category_id: categoryId,
    amount_satang: amountSatang,
    date,
  };
}

function getScenarioItem(state, categoryId, scenarioId = "baseline") {
  return state.scenarios
    .find((scenario) => scenario.id === scenarioId)
    ?.items.find((item) => item.categoryId === categoryId);
}

function extractFunctionBlock(source, name) {
  const start = source.indexOf(`async function ${name}`);
  assert.notEqual(start, -1, `${name} should exist in source`);
  const nextFunction = source.indexOf("\n  async function ", start + 1);
  return source.slice(start, nextFunction === -1 ? undefined : nextFunction);
}

test("planner monthly engine: fixed costs stay stable and get a confidence signal", () => {
  const state = buildPlannerMonthlyPlanState({
    categories: createCategories({ housing: "fixed" }),
    debtPlans: [],
    budgetRows: [],
    transactions: [
      createExpense("housing", 100000, "2025-10-05"),
      createExpense("housing", 100000, "2025-11-05"),
      createExpense("housing", 100000, "2025-12-05"),
      createExpense("housing", 100000, "2026-01-05"),
      createExpense("housing", 100000, "2026-02-05"),
      createExpense("housing", 100000, "2026-03-05"),
    ],
    monthValue: MONTH_VALUE,
    today: TODAY,
    legacySnapshot: createLegacySnapshot({ availableExpenseSatang: 100000, categoryIds: ["housing"] }),
  });

  const item = getScenarioItem(state, "housing");
  assert.ok(item);
  assert.equal(item.behavior, "fixed");
  assert.equal(item.recommendedLimitSatang, 100000);
  assert.equal(item.floorSatang, 100000);
  assert.ok(item.reasonCodes.includes("stable_fixed_cost"));
  assert.ok(item.confidenceScore >= 0.7);
});

test("planner monthly engine: rising trend and current pace increase recommendation", () => {
  const state = buildPlannerMonthlyPlanState({
    categories: createCategories({ food: "flexible" }),
    debtPlans: [],
    budgetRows: [],
    transactions: [
      createExpense("food", 28000, "2025-10-05"),
      createExpense("food", 30000, "2025-11-05"),
      createExpense("food", 32000, "2025-12-05"),
      createExpense("food", 34000, "2026-01-05"),
      createExpense("food", 36000, "2026-02-05"),
      createExpense("food", 38000, "2026-03-05"),
      createExpense("food", 12000, "2026-04-02"),
      createExpense("food", 8000, "2026-04-07"),
    ],
    monthValue: MONTH_VALUE,
    today: TODAY,
    legacySnapshot: createLegacySnapshot({ availableExpenseSatang: 70000, categoryIds: ["food"] }),
  });

  const item = getScenarioItem(state, "food");
  const summary = buildPlannerDecisionSummary(state, "baseline");
  assert.ok(item);
  assert.ok(item.reasonCodes.includes("rising_trend"));
  assert.ok(item.reasonCodes.includes("over_budget_run_rate"));
  assert.ok(item.recommendedLimitSatang > item.baselineSpendSatang);
  assert.ok(summary.attentionCount >= 1);
});

test("planner monthly engine: inactive flexible categories are dampened", () => {
  const state = buildPlannerMonthlyPlanState({
    categories: createCategories({ fun: "flexible" }),
    debtPlans: [],
    budgetRows: [],
    transactions: [
      createExpense("fun", 10000, "2025-10-05"),
      createExpense("fun", 10000, "2025-11-05"),
    ],
    monthValue: MONTH_VALUE,
    today: TODAY,
    legacySnapshot: createLegacySnapshot({ availableExpenseSatang: 30000, categoryIds: ["fun"] }),
  });

  const item = getScenarioItem(state, "fun");
  assert.ok(item);
  assert.ok(item.reasonCodes.includes("inactive_recently"));
  assert.ok(item.recommendedLimitSatang < item.baselineSpendSatang);
});

test("planner monthly engine: shortfall reduction prioritizes flexible before essential and fixed", () => {
  const categories = createCategories({
    housing: "fixed",
    groceries: "essential",
    leisure: "flexible",
  });
  const state = buildPlannerMonthlyPlanState({
    categories,
    debtPlans: [],
    budgetRows: [],
    transactions: [
      createExpense("housing", 100000, "2025-10-05"),
      createExpense("housing", 100000, "2025-11-05"),
      createExpense("housing", 100000, "2025-12-05"),
      createExpense("housing", 100000, "2026-01-05"),
      createExpense("housing", 100000, "2026-02-05"),
      createExpense("housing", 100000, "2026-03-05"),
      createExpense("groceries", 30000, "2025-10-05"),
      createExpense("groceries", 30000, "2025-11-05"),
      createExpense("groceries", 30000, "2025-12-05"),
      createExpense("groceries", 30000, "2026-01-05"),
      createExpense("groceries", 30000, "2026-02-05"),
      createExpense("groceries", 30000, "2026-03-05"),
      createExpense("leisure", 40000, "2025-10-05"),
      createExpense("leisure", 40000, "2025-11-05"),
      createExpense("leisure", 40000, "2025-12-05"),
      createExpense("leisure", 40000, "2026-01-05"),
      createExpense("leisure", 40000, "2026-02-05"),
      createExpense("leisure", 40000, "2026-03-05"),
    ],
    monthValue: MONTH_VALUE,
    today: TODAY,
    legacySnapshot: createLegacySnapshot({
      availableExpenseSatang: 158000,
      categoryIds: ["housing", "groceries", "leisure"],
    }),
  });

  const housing = getScenarioItem(state, "housing");
  const groceries = getScenarioItem(state, "groceries");
  const leisure = getScenarioItem(state, "leisure");
  assert.equal(housing.recommendedLimitSatang, 100000);
  assert.ok(groceries.recommendedLimitSatang >= 27000);
  assert.equal(leisure.recommendedLimitSatang, 30000);
  assert.ok((40000 - leisure.recommendedLimitSatang) >= (30000 - groceries.recommendedLimitSatang));
});

test("planner monthly engine: manual locks override recompute decisions", () => {
  const state = buildPlannerMonthlyPlanState({
    categories: createCategories({ food: "flexible" }),
    debtPlans: [],
    budgetRows: [
      {
        month_key: MONTH_VALUE,
        category_id: "food",
        limit_satang: 45000,
        alert_pct: 90,
        source: "manual",
        manual_override: true,
      },
    ],
    transactions: [
      createExpense("food", 30000, "2025-10-05"),
      createExpense("food", 30000, "2025-11-05"),
      createExpense("food", 30000, "2025-12-05"),
      createExpense("food", 30000, "2026-01-05"),
      createExpense("food", 30000, "2026-02-05"),
      createExpense("food", 30000, "2026-03-05"),
    ],
    monthValue: MONTH_VALUE,
    today: TODAY,
    legacySnapshot: createLegacySnapshot({
      availableExpenseSatang: 45000,
      appliedLimits: { food: 45000 },
      categoryIds: ["food"],
    }),
  });

  const item = getScenarioItem(state, "food");
  assert.ok(item.lockedByUser);
  assert.equal(item.recommendedLimitSatang, 45000);
  assert.ok(item.reasonCodes.includes("manual_locked"));
});

test("planner adapters: compat snapshot and add-flow hint reuse baseline recommendations", () => {
  const categories = createCategories({ food: "essential" });
  const legacySnapshot = createLegacySnapshot({
    availableExpenseSatang: 60000,
    appliedLimits: { food: 30000 },
    categoryIds: ["food"],
  });
  const state = buildPlannerMonthlyPlanState({
    categories,
    debtPlans: [],
    budgetRows: [],
    transactions: [
      createExpense("food", 28000, "2025-10-05"),
      createExpense("food", 30000, "2025-11-05"),
      createExpense("food", 32000, "2025-12-05"),
      createExpense("food", 34000, "2026-01-05"),
      createExpense("food", 36000, "2026-02-05"),
      createExpense("food", 38000, "2026-03-05"),
      createExpense("food", 12000, "2026-04-03"),
      createExpense("food", 8000, "2026-04-07"),
    ],
    monthValue: MONTH_VALUE,
    today: TODAY,
    legacySnapshot,
  });

  const compat = buildBudgetPlanSnapshotCompat({
    legacySnapshot,
    plannerMonthlyPlan: state,
  });
  const foodRecommendation = getScenarioItem(state, "food");
  const hint = buildBudgetHintCompat({
    baseHint: {
      scope: "child",
      plannedLimitSatang: 10000,
      spentSatang: 7000,
      projectedSatang: 9000,
      status: "warning",
      alertPct: 90,
    },
    plannerMonthlyPlan: state,
    categories,
    categoryId: "coffee",
  });

  assert.equal(compat.plannerScenarioKey, "baseline");
  assert.equal(compat.plannerAttentionCount, state.scenarios[0].attentionCount);
  assert.equal(
    compat.categoryPlans.find((plan) => plan.categoryId === "food")?.recommendedLimitSatang,
    foodRecommendation.recommendedLimitSatang,
  );
  assert.equal(hint.planner.recommendedLimitSatang, foodRecommendation.recommendedLimitSatang);
  assert.equal(hint.planner.needsAttention, foodRecommendation.needsAttention);
});

test("planner adapters: active scenario key and compat snapshot can follow an applied non-baseline plan", () => {
  const categories = createCategories({
    housing: "fixed",
    groceries: "essential",
    leisure: "flexible",
  });
  const legacySnapshot = createLegacySnapshot({
    availableExpenseSatang: 165000,
    categoryIds: ["housing", "groceries", "leisure"],
  });
  const state = buildPlannerMonthlyPlanState({
    categories,
    debtPlans: [],
    budgetRows: [],
    transactions: [
      createExpense("housing", 100000, "2025-10-05"),
      createExpense("housing", 100000, "2025-11-05"),
      createExpense("housing", 100000, "2025-12-05"),
      createExpense("housing", 100000, "2026-01-05"),
      createExpense("housing", 100000, "2026-02-05"),
      createExpense("housing", 100000, "2026-03-05"),
      createExpense("groceries", 30000, "2025-10-05"),
      createExpense("groceries", 30000, "2025-11-05"),
      createExpense("groceries", 30000, "2025-12-05"),
      createExpense("groceries", 30000, "2026-01-05"),
      createExpense("groceries", 30000, "2026-02-05"),
      createExpense("groceries", 30000, "2026-03-05"),
      createExpense("leisure", 40000, "2025-10-05"),
      createExpense("leisure", 40000, "2025-11-05"),
      createExpense("leisure", 40000, "2025-12-05"),
      createExpense("leisure", 40000, "2026-01-05"),
      createExpense("leisure", 40000, "2026-02-05"),
      createExpense("leisure", 40000, "2026-03-05"),
    ],
    monthValue: MONTH_VALUE,
    today: TODAY,
    storedPlans: [{ month_key: MONTH_VALUE, scenario_key: "tight", status: "applied" }],
    legacySnapshot,
  });

  const activeScenarioKey = getActivePlannerScenarioKey(state, "baseline");
  const compat = buildBudgetPlanSnapshotCompat({
    legacySnapshot,
    plannerMonthlyPlan: state,
    scenarioKey: activeScenarioKey,
  });

  assert.equal(activeScenarioKey, "tight");
  assert.equal(compat.plannerScenarioKey, "tight");
  assert.equal(compat.suggestedExpenseBudgetSatang, state.scenarios.find((scenario) => scenario.id === "tight")?.recommendedExpenseSatang);
});

test("planner source: targeted refresh is used for planner mutations and full refresh stays on account mutations", () => {
  const source = readFileSync(new URL("../src/features/app/AppProvider.jsx", import.meta.url), "utf8");
  const savePlanningConfigBlock = extractFunctionBlock(source, "savePlanningConfig");
  const saveBudgetRowBlock = extractFunctionBlock(source, "saveBudgetRow");
  const saveFinancialGoalBlock = extractFunctionBlock(source, "saveFinancialGoal");
  const saveDebtPlanBlock = extractFunctionBlock(source, "saveDebtPlan");
  const applyPlannerPlanBlock = extractFunctionBlock(source, "applyPlannerPlan");
  const acceptRecommendationBlock = extractFunctionBlock(source, "acceptPlannerRecommendation");
  const dismissRecommendationBlock = extractFunctionBlock(source, "dismissPlannerRecommendation");
  const saveAccountBlock = extractFunctionBlock(source, "saveAccount");
  const deleteAccountBlock = extractFunctionBlock(source, "deleteAccount");
  const adjustAccountBalanceBlock = extractFunctionBlock(source, "adjustAccountBalance");

  assert.match(savePlanningConfigBlock, /await refreshPlannerState\(/);
  assert.match(saveBudgetRowBlock, /await refreshPlannerState\(/);
  assert.match(saveFinancialGoalBlock, /await refreshPlannerState\(/);
  assert.match(saveDebtPlanBlock, /await refreshPlannerState\(/);
  assert.match(applyPlannerPlanBlock, /await refreshPlannerState\(/);
  assert.match(applyPlannerPlanBlock, /update\(\{ status: "draft" \}\)/);
  assert.match(applyPlannerPlanBlock, /\.neq\("scenario_key", scenarioKey\)/);
  assert.match(acceptRecommendationBlock, /await refreshPlannerState\(/);
  assert.match(dismissRecommendationBlock, /await refreshPlannerState\(/);
  assert.match(saveAccountBlock, /await refreshAll\(\)/);
  assert.doesNotMatch(saveAccountBlock, /await refreshPlannerState\(/);
  assert.match(deleteAccountBlock, /await refreshAll\(\)/);
  assert.doesNotMatch(deleteAccountBlock, /await refreshPlannerState\(/);
  assert.match(adjustAccountBalanceBlock, /await refreshAll\(\)/);
  assert.doesNotMatch(adjustAccountBalanceBlock, /await refreshPlannerState\(/);
  assert.match(source, /plannerActiveScenarioKey,/);
  assert.match(source, /plannerMonthlyPlan,/);
  assert.match(source, /plannerRecommendations,/);
  assert.match(source, /plannerDecisionSummary,/);
  assert.match(source, /refreshPlannerState,/);
  assert.match(source, /applyPlannerPlan,/);
  assert.match(source, /acceptPlannerRecommendation,/);
  assert.match(source, /dismissPlannerRecommendation,/);
});

test("planner source: downstream screens consume planner signals", () => {
  const dashboardSource = readFileSync(new URL("../src/features/app/screens/DashboardScreen.jsx", import.meta.url), "utf8");
  const addSource = readFileSync(new URL("../src/features/app/screens/AddScreen.jsx", import.meta.url), "utf8");
  const settingsSource = readFileSync(new URL("../src/features/app/screens/SettingsScreen.jsx", import.meta.url), "utf8");
  const plannerSource = readFileSync(new URL("../src/features/app/screens/PlannerScreen.jsx", import.meta.url), "utf8");
  const providerSource = readFileSync(new URL("../src/features/app/AppProvider.jsx", import.meta.url), "utf8");

  assert.match(dashboardSource, /plannerDecisionSummary/);
  assert.match(dashboardSource, /finance-dashboard-planner-note/);
  assert.match(addSource, /plannerHint/);
  assert.match(addSource, /finance-budget-hint-planner/);
  assert.match(settingsSource, /plannerDecisionSummary/);
  assert.match(settingsSource, /plannerDecisionSummary\?\.title/);
  assert.match(plannerSource, /Monthly Decision Center/);
  assert.match(plannerSource, /Scenario Compare/);
  assert.match(plannerSource, /plannerActiveScenarioKey/);
  assert.match(plannerSource, /Recommendation Queue/);
  assert.match(plannerSource, /applyPlannerPlan/);
  assert.match(providerSource, /buildPlannerDecisionSummary\(plannerMonthlyPlan, plannerActiveScenarioKey\)/);
  assert.match(providerSource, /scenarioKey: plannerActiveScenarioKey/);
});

test("planner monthly engine: scenario totals never drift past the available budget", () => {
  const categories = {
    expense: Array.from({ length: 19 }, (_, index) => ({
      id: `cat-${index + 1}`,
      name: `หมวด ${index + 1}`,
      kind: "expense",
      parentId: null,
    })),
    income: [],
  };

  const state = buildPlannerMonthlyPlanState({
    profile: {
      planning_income_mode: "fixed",
      planning_fixed_income_satang: 4_500_000,
      planning_savings_mode: "amount",
      planning_savings_amount_satang: 500_000,
    },
    categories,
    debtPlans: [],
    budgetRows: [],
    transactions: [],
    monthValue: "2026-08",
    today: "2026-08-23",
    storedPlans: [],
    storedItems: [],
  });

  const available = Number(state.baseSnapshot?.availableExpenseSatang ?? 4_000_000);

  for (const scenario of state.scenarios) {
    const itemTotal = scenario.items.reduce(
      (sum, item) => sum + Number(item.recommendedLimitSatang || 0),
      0,
    );

    assert.equal(
      itemTotal,
      Number(scenario.recommendedExpenseSatang || 0),
      `${scenario.id}: category limits must add up to the scenario budget`,
    );
    assert.ok(
      Number(scenario.recommendedExpenseSatang || 0) <= available,
      `${scenario.id}: budget must not exceed the available amount`,
    );
    assert.equal(
      Number(scenario.shortfallSatang || 0),
      0,
      `${scenario.id}: rounding must not invent a shortfall`,
    );
  }
});
