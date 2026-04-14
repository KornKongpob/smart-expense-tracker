import { daysInMonthKey } from "../../utils/transaction.js";
import { normalizeDebtPlans } from "./plannerState.js";

export const DEFAULT_BUDGET_ALERT_PCT = 90;
export const LOOKBACK_OPTIONS = Object.freeze([1, 3, 6, 12]);
export const INCOME_MODE_OPTIONS = Object.freeze(["fixed", "rolling_average"]);
export const SAVINGS_MODE_OPTIONS = Object.freeze(["amount", "percent"]);
export const DEBT_STRATEGY_OPTIONS = Object.freeze(["survival", "paydown"]);
export const BUDGET_BEHAVIOR_OPTIONS = Object.freeze(["fixed", "essential", "flexible"]);

const ROOT_BEHAVIOR_FIXED_IDS = new Set([
  "housing",
  "bills",
  "insurance",
  "education",
]);

const ROOT_BEHAVIOR_ESSENTIAL_IDS = new Set([
  "food",
  "transport",
  "health",
  "family",
  "fees",
  "taxes",
]);

const ROOT_EXCLUDED_FROM_BUDGETING = new Set([
  "debt",
  "discount",
  "adjust_balance",
  "mixed",
]);

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function toInt(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.trunc(number);
}

function clampPositiveInt(value, fallback = 0) {
  return Math.max(0, toInt(value, fallback));
}

function sanitizeIsoDate(value) {
  const text = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

export function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function sanitizeMonthKey(value, fallback = "") {
  const text = cleanText(value);
  if (/^\d{4}-\d{2}$/.test(text)) return text;
  return fallback || todayDate().slice(0, 7);
}

export function compareMonthKeys(left, right) {
  return sanitizeMonthKey(left).localeCompare(sanitizeMonthKey(right));
}

export function shiftMonthKey(monthKey, delta) {
  const safeMonth = sanitizeMonthKey(monthKey);
  const [yearText, monthText] = safeMonth.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const date = new Date(Date.UTC(year, monthIndex + (Number(delta || 0) || 0), 1));
  return date.toISOString().slice(0, 7);
}

export function monthStartIso(monthKey) {
  return `${sanitizeMonthKey(monthKey)}-01`;
}

export function monthEndIso(monthKey) {
  const safeMonth = sanitizeMonthKey(monthKey);
  const [yearText, monthText] = safeMonth.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  return new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10);
}

function listClosedLookbackMonths(monthKey, count) {
  const safeCount = LOOKBACK_OPTIONS.includes(Number(count)) ? Number(count) : 3;
  const months = [];
  for (let index = safeCount; index >= 1; index -= 1) {
    months.push(shiftMonthKey(monthKey, -index));
  }
  return months;
}

function normalizeIncomeMode(value) {
  return cleanText(value, "rolling_average").toLowerCase() === "fixed" ? "fixed" : "rolling_average";
}

function normalizeSavingsMode(value) {
  return cleanText(value, "amount").toLowerCase() === "percent" ? "percent" : "amount";
}

function normalizeDebtStrategyMode(value) {
  return cleanText(value, "paydown").toLowerCase() === "survival" ? "survival" : "paydown";
}

export function normalizeBudgetBehavior(value, fallback = "flexible") {
  const normalized = cleanText(value, fallback).toLowerCase();
  if (normalized === "fixed" || normalized === "essential" || normalized === "flexible") return normalized;
  return fallback;
}

function isRootExpenseCategory(category) {
  return (
    category &&
    String(category.kind || "").toLowerCase() === "expense" &&
    !String(category.parentId || "").trim() &&
    category.isHidden !== true &&
    !ROOT_EXCLUDED_FROM_BUDGETING.has(String(category.id || "").trim())
  );
}

export function getDefaultBudgetBehavior(category) {
  const rootId = cleanText(category?.parentId || category?.id);
  if (ROOT_BEHAVIOR_FIXED_IDS.has(rootId)) return "fixed";
  if (ROOT_BEHAVIOR_ESSENTIAL_IDS.has(rootId)) return "essential";
  return "flexible";
}

export function normalizePlanningConfig(profile) {
  return {
    incomeMode: normalizeIncomeMode(profile?.income_mode ?? profile?.incomeMode),
    fixedIncomeSatang: clampPositiveInt(profile?.fixed_income_satang ?? profile?.fixedIncomeSatang),
    incomeLookbackMonths: LOOKBACK_OPTIONS.includes(Number(profile?.income_lookback_months ?? profile?.incomeLookbackMonths))
      ? Number(profile?.income_lookback_months ?? profile?.incomeLookbackMonths)
      : 3,
    savingsMode: normalizeSavingsMode(profile?.savings_mode ?? profile?.savingsMode),
    savingsAmountSatang: clampPositiveInt(profile?.savings_amount_satang ?? profile?.savingsAmountSatang),
    savingsPercentBps: Math.max(
      0,
      Math.min(10000, toInt(profile?.savings_percent_bps ?? profile?.savingsPercentBps, 0)),
    ),
    debtStrategyMode: normalizeDebtStrategyMode(profile?.debt_strategy_mode ?? profile?.debtStrategyMode),
    monthlyTargetSatang: clampPositiveInt(profile?.monthly_target_satang ?? profile?.monthlyTargetSatang),
  };
}

export function buildPlanningProfilePayload(input, profile = null) {
  const current = normalizePlanningConfig(profile);
  const incomeMode = normalizeIncomeMode(input?.income_mode ?? input?.incomeMode ?? current.incomeMode);
  const savingsMode = normalizeSavingsMode(input?.savings_mode ?? input?.savingsMode ?? current.savingsMode);

  return {
    display_name:
      input?.display_name != null || input?.displayName != null
        ? cleanText(input?.display_name ?? input?.displayName) || null
        : profile?.display_name ?? profile?.displayName ?? null,
    income_mode: incomeMode,
    fixed_income_satang: clampPositiveInt(
      input?.fixed_income_satang ?? input?.fixedIncomeSatang ?? current.fixedIncomeSatang,
    ),
    income_lookback_months: LOOKBACK_OPTIONS.includes(Number(input?.income_lookback_months ?? input?.incomeLookbackMonths))
      ? Number(input?.income_lookback_months ?? input?.incomeLookbackMonths)
      : current.incomeLookbackMonths,
    savings_mode: savingsMode,
    savings_amount_satang: clampPositiveInt(
      input?.savings_amount_satang ?? input?.savingsAmountSatang ?? current.savingsAmountSatang,
    ),
    savings_percent_bps: Math.max(
      0,
      Math.min(10000, toInt(input?.savings_percent_bps ?? input?.savingsPercentBps, current.savingsPercentBps)),
    ),
    debt_strategy_mode: normalizeDebtStrategyMode(
      input?.debt_strategy_mode ?? input?.debtStrategyMode ?? current.debtStrategyMode,
    ),
  };
}

export function normalizeBudgetRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    id: row?.id != null && row?.id !== "" ? Number(row.id) : null,
    month_key: sanitizeMonthKey(row?.month_key ?? row?.month),
    category_id: cleanText(row?.category_id ?? row?.categoryId),
    limit_satang: clampPositiveInt(row?.limit_satang ?? row?.limit),
    alert_pct: Math.max(1, Math.min(100, toInt(row?.alert_pct ?? row?.alertPct, DEFAULT_BUDGET_ALERT_PCT))),
    source: cleanText(row?.source, "suggested").toLowerCase() === "manual"
      ? "manual"
      : cleanText(row?.source, "suggested").toLowerCase() === "migrated"
        ? "migrated"
        : "suggested",
    manual_override: row?.manual_override === true || row?.manualOverride === true,
  })).filter((row) => row.month_key && row.category_id);
}

export function buildBudgetRowPayload(input) {
  return {
    id: input?.id != null && input?.id !== "" ? Number(input.id) : null,
    month_key: sanitizeMonthKey(input?.month_key ?? input?.monthKey ?? input?.month),
    category_id: cleanText(input?.category_id ?? input?.categoryId),
    limit_satang: clampPositiveInt(input?.limit_satang ?? input?.limitSatang ?? input?.limit),
    alert_pct: Math.max(
      1,
      Math.min(100, toInt(input?.alert_pct ?? input?.alertPct, DEFAULT_BUDGET_ALERT_PCT)),
    ),
    source: cleanText(input?.source, "manual").toLowerCase() === "suggested"
      ? "suggested"
      : cleanText(input?.source, "manual").toLowerCase() === "migrated"
        ? "migrated"
        : "manual",
    manual_override: input?.manual_override === true || input?.manualOverride === true,
  };
}

function buildExpenseCategoryIndex(groupedCategories) {
  const expenseRows = Array.isArray(groupedCategories?.expense) ? groupedCategories.expense : [];
  const categoryMap = new Map();
  const childrenByParent = new Map();

  for (const row of expenseRows) {
    categoryMap.set(cleanText(row?.id), row);
  }

  for (const row of expenseRows) {
    const parentId = cleanText(row?.parentId);
    if (!parentId) continue;
    const current = childrenByParent.get(parentId) || [];
    current.push(row);
    childrenByParent.set(parentId, current);
  }

  const rootRows = expenseRows.filter(isRootExpenseCategory);
  return { categoryMap, childrenByParent, rootRows };
}

function getRootCategoryId(categoryId, categoryMap) {
  let currentId = cleanText(categoryId);
  let guard = 0;

  while (currentId && guard < 24) {
    const row = categoryMap.get(currentId);
    const parentId = cleanText(row?.parentId);
    if (!parentId) return currentId;
    currentId = parentId;
    guard += 1;
  }

  return cleanText(categoryId);
}

function normalizePlanningTransaction(row) {
  return {
    id: row?.id != null && row?.id !== "" ? Number(row.id) : null,
    kind: cleanText(row?.kind),
    category_id: cleanText(row?.category_id ?? row?.categoryId),
    amount_satang: clampPositiveInt(row?.amount_satang ?? row?.amount),
    date: sanitizeIsoDate(row?.date),
    is_split_parent: row?.is_split_parent === true || row?.isSplitParent === true,
    is_split_child: row?.is_split_child === true || row?.isSplitChild === true,
  };
}

function collectHistoryTotals({ transactions, lookbackMonths, categoryMap }) {
  const incomeByMonth = new Map(lookbackMonths.map((month) => [month, 0]));
  const expenseByMonth = new Map(lookbackMonths.map((month) => [month, 0]));
  const expenseMonthByRoot = new Map();
  const expenseMonthByCategory = new Map();

  const monthSet = new Set(lookbackMonths);

  for (const raw of Array.isArray(transactions) ? transactions : []) {
    const row = normalizePlanningTransaction(raw);
    if (!row.date || !row.kind) continue;
    const monthKey = row.date.slice(0, 7);

    if (row.kind === "income" && monthSet.has(monthKey)) {
      incomeByMonth.set(monthKey, (incomeByMonth.get(monthKey) || 0) + row.amount_satang);
    }

    if (row.kind !== "expense" || row.is_split_parent) continue;

    const rootId = getRootCategoryId(row.category_id, categoryMap);
    const rootMonthKey = `${monthKey}:${rootId}`;
    const categoryMonthKey = `${monthKey}:${row.category_id}`;

    expenseMonthByRoot.set(rootMonthKey, (expenseMonthByRoot.get(rootMonthKey) || 0) + row.amount_satang);
    expenseMonthByCategory.set(categoryMonthKey, (expenseMonthByCategory.get(categoryMonthKey) || 0) + row.amount_satang);

    if (monthSet.has(monthKey)) {
      expenseByMonth.set(monthKey, (expenseByMonth.get(monthKey) || 0) + row.amount_satang);
    }
  }

  return {
    incomeByMonth,
    expenseByMonth,
    expenseMonthByRoot,
    expenseMonthByCategory,
  };
}

function buildMonthSpendIndexes({ transactions, categoryMap, monthKey, today }) {
  const safeMonth = sanitizeMonthKey(monthKey);
  const safeToday = sanitizeIsoDate(today);
  const isCurrentMonth = safeToday.slice(0, 7) === safeMonth;
  const monthTotalByRoot = new Map();
  const monthTotalByCategory = new Map();
  let monthExpenseTotal = 0;
  let spentToDateTotal = 0;

  for (const raw of Array.isArray(transactions) ? transactions : []) {
    const row = normalizePlanningTransaction(raw);
    if (!row.date || row.kind !== "expense" || row.is_split_parent) continue;
    if (row.date.slice(0, 7) !== safeMonth) continue;

    const rootId = getRootCategoryId(row.category_id, categoryMap);
    monthExpenseTotal += row.amount_satang;
    monthTotalByRoot.set(rootId, (monthTotalByRoot.get(rootId) || 0) + row.amount_satang);
    monthTotalByCategory.set(row.category_id, (monthTotalByCategory.get(row.category_id) || 0) + row.amount_satang);

    if (!isCurrentMonth || row.date <= safeToday) {
      spentToDateTotal += row.amount_satang;
    }
  }

  return {
    monthTotalByRoot,
    monthTotalByCategory,
    monthExpenseTotal,
    spentToDateTotal,
  };
}

function averageForMonths(map, months) {
  if (!months.length) return 0;
  const total = months.reduce((sum, month) => sum + clampPositiveInt(map.get(month)), 0);
  return Math.round(total / months.length);
}

function sortBudgetCandidates(rows) {
  return rows.slice().sort((left, right) => {
    const byAverage = clampPositiveInt(right.averageSpendSatang) - clampPositiveInt(left.averageSpendSatang);
    if (byAverage !== 0) return byAverage;
    return cleanText(left.name).localeCompare(cleanText(right.name), "th");
  });
}

function distributeTargetTotal(items, targetTotal) {
  const safeTarget = clampPositiveInt(targetTotal);
  const totalWeight = items.reduce((sum, item) => sum + clampPositiveInt(item.currentLimitSatang), 0);
  if (!items.length) return new Map();
  if (!safeTarget || !totalWeight) {
    return new Map(items.map((item) => [item.categoryId, 0]));
  }

  const draft = items.map((item, index) => {
    const rawShare = (safeTarget * clampPositiveInt(item.currentLimitSatang)) / totalWeight;
    const floorShare = Math.floor(rawShare);
    return {
      categoryId: item.categoryId,
      index,
      value: floorShare,
      remainder: rawShare - floorShare,
    };
  });

  let assigned = draft.reduce((sum, item) => sum + item.value, 0);
  draft
    .slice()
    .sort((left, right) => {
      if (right.remainder !== left.remainder) return right.remainder - left.remainder;
      return left.index - right.index;
    })
    .forEach((item) => {
      if (assigned >= safeTarget) return;
      const target = draft[item.index];
      target.value += 1;
      assigned += 1;
    });

  return new Map(draft.map((item) => [item.categoryId, item.value]));
}

function reduceSuggestedPlans(plans, availableExpenseSatang) {
  const safeAvailable = clampPositiveInt(availableExpenseSatang);
  const sorted = sortBudgetCandidates(plans).map((plan) => ({
    ...plan,
    currentLimitSatang: clampPositiveInt(plan.suggestedLimitSatang),
  }));
  const totalSuggested = sorted.reduce((sum, plan) => sum + clampPositiveInt(plan.currentLimitSatang), 0);

  if (!sorted.length) {
    return { plans: [], shortfallSatang: 0, suggestedExpenseBudgetSatang: 0 };
  }

  let deficit = Math.max(0, totalSuggested - safeAvailable);
  const nextLimits = new Map(sorted.map((plan) => [plan.categoryId, plan.currentLimitSatang]));

  for (const behavior of ["flexible", "essential"]) {
    if (deficit <= 0) break;
    const bucket = sorted.filter(
      (plan) => plan.behavior === behavior && clampPositiveInt(nextLimits.get(plan.categoryId)) > 0,
    );
    const bucketTotal = bucket.reduce((sum, plan) => sum + clampPositiveInt(nextLimits.get(plan.categoryId)), 0);
    if (!bucketTotal) continue;

    const reduction = Math.min(deficit, bucketTotal);
    if (reduction >= bucketTotal) {
      for (const plan of bucket) nextLimits.set(plan.categoryId, 0);
      deficit -= bucketTotal;
      continue;
    }

    const kept = distributeTargetTotal(
      bucket.map((plan) => ({
        categoryId: plan.categoryId,
        currentLimitSatang: clampPositiveInt(nextLimits.get(plan.categoryId)),
      })),
      bucketTotal - reduction,
    );
    for (const plan of bucket) {
      nextLimits.set(plan.categoryId, clampPositiveInt(kept.get(plan.categoryId)));
    }
    deficit -= reduction;
  }

  const reducedPlans = sorted.map((plan) => ({
    ...plan,
    suggestedLimitSatang: clampPositiveInt(nextLimits.get(plan.categoryId)),
  }));

  return {
    plans: reducedPlans,
    shortfallSatang: clampPositiveInt(deficit),
    suggestedExpenseBudgetSatang: reducedPlans.reduce(
      (sum, plan) => sum + clampPositiveInt(plan.suggestedLimitSatang),
      0,
    ),
  };
}

function sortDebtPriority(left, right) {
  const aprDelta = clampPositiveInt(right.apr_bps) - clampPositiveInt(left.apr_bps);
  if (aprDelta !== 0) return aprDelta;

  const balanceDelta = clampPositiveInt(left.current_balance_satang) - clampPositiveInt(right.current_balance_satang);
  if (balanceDelta !== 0) return balanceDelta;

  const leftDue = left.due_day == null ? 99 : clampPositiveInt(left.due_day);
  const rightDue = right.due_day == null ? 99 : clampPositiveInt(right.due_day);
  if (leftDue !== rightDue) return leftDue - rightDue;

  return cleanText(left.note).localeCompare(cleanText(right.note), "th");
}

function getAppliedBudgetRowsForMonth(budgetRows, monthKey) {
  return normalizeBudgetRows(budgetRows).filter((row) => row.month_key === sanitizeMonthKey(monthKey));
}

function buildChildPlans({
  rootId,
  childrenByParent,
  appliedRowsByCategoryId,
  monthTotalByCategory,
  historyMonthKeys,
  historyCategoryTotals,
}) {
  const children = childrenByParent.get(rootId) || [];
  return children
    .map((child) => {
      const childId = cleanText(child?.id);
      const averageSpendSatang = historyMonthKeys.length
        ? Math.round(
            historyMonthKeys.reduce(
              (sum, monthKey) => sum + clampPositiveInt(historyCategoryTotals.get(`${monthKey}:${childId}`)),
              0,
            ) / historyMonthKeys.length,
          )
        : 0;
      const appliedRow = appliedRowsByCategoryId.get(childId) || null;
      const appliedLimitSatang = clampPositiveInt(appliedRow?.limit_satang);
      return {
        categoryId: childId,
        rootCategoryId: rootId,
        name: cleanText(child?.name, "Category"),
        icon: cleanText(child?.icon),
        color: cleanText(child?.color, "#0f766e"),
        averageSpendSatang,
        spentMonthSatang: clampPositiveInt(monthTotalByCategory.get(childId)),
        appliedLimitSatang,
        alertPct: Math.max(
          1,
          Math.min(100, toInt(appliedRow?.alert_pct, DEFAULT_BUDGET_ALERT_PCT)),
        ),
        source: appliedRow?.source || null,
        manualOverride: appliedRow?.manual_override === true,
      };
    })
    .filter((row) => row.averageSpendSatang > 0 || row.appliedLimitSatang > 0);
}

export function buildBudgetPlanSnapshot({
  profile,
  categories,
  debtPlans,
  budgetRows,
  transactions,
  monthValue,
  today = todayDate(),
} = {}) {
  const config = normalizePlanningConfig(profile);
  const safeMonth = sanitizeMonthKey(monthValue);
  const safeToday = sanitizeIsoDate(today) || todayDate();
  const historyMonthKeys = listClosedLookbackMonths(safeMonth, config.incomeLookbackMonths);
  const categoryIndex = buildExpenseCategoryIndex(categories);
  const monthIndexes = buildMonthSpendIndexes({
    transactions,
    categoryMap: categoryIndex.categoryMap,
    monthKey: safeMonth,
    today: safeToday,
  });
  const historyTotals = collectHistoryTotals({
    transactions,
    lookbackMonths: historyMonthKeys,
    categoryMap: categoryIndex.categoryMap,
  });

  const rollingAverageIncomeSatang = averageForMonths(historyTotals.incomeByMonth, historyMonthKeys);
  const selectedIncomeSatang =
    config.incomeMode === "fixed" && config.fixedIncomeSatang > 0
      ? config.fixedIncomeSatang
      : rollingAverageIncomeSatang;

  const savingsReserveSatang =
    config.savingsMode === "percent"
      ? Math.round((selectedIncomeSatang * config.savingsPercentBps) / 10000)
      : config.savingsAmountSatang;

  const activeDebtPlans = normalizeDebtPlans(debtPlans).filter((plan) => String(plan?.status || "active") === "active");
  const debtMinimumSatang = activeDebtPlans.reduce(
    (sum, plan) => sum + clampPositiveInt(plan.minimum_payment_satang),
    0,
  );

  const appliedMonthRows = getAppliedBudgetRowsForMonth(budgetRows, safeMonth);
  const appliedRowsByCategoryId = new Map(
    appliedMonthRows.map((row) => [cleanText(row.category_id), row]),
  );

  const rootPlansBase = categoryIndex.rootRows.map((category) => {
    const categoryId = cleanText(category?.id);
    const behavior = normalizeBudgetBehavior(category?.budgetBehavior, getDefaultBudgetBehavior(category));
    const averageSpendSatang = historyMonthKeys.length
      ? Math.round(
          historyMonthKeys.reduce(
            (sum, monthKey) => sum + clampPositiveInt(historyTotals.expenseMonthByRoot.get(`${monthKey}:${categoryId}`)),
            0,
          ) / historyMonthKeys.length,
        )
      : 0;
    const appliedRow = appliedRowsByCategoryId.get(categoryId) || null;
    const appliedLimitSatang = clampPositiveInt(appliedRow?.limit_satang);

    return {
      categoryId,
      rootCategoryId: categoryId,
      name: cleanText(category?.name, "Category"),
      icon: cleanText(category?.icon),
      color: cleanText(category?.color, "#0f766e"),
      behavior,
      averageSpendSatang,
      suggestedLimitSatang: averageSpendSatang,
      appliedLimitSatang,
      spentMonthSatang: clampPositiveInt(monthIndexes.monthTotalByRoot.get(categoryId)),
      alertPct: Math.max(1, Math.min(100, toInt(appliedRow?.alert_pct, DEFAULT_BUDGET_ALERT_PCT))),
      source: appliedRow?.source || null,
      manualOverride: appliedRow?.manual_override === true,
      childPlans: [],
    };
  });

  const reducedSuggestion = reduceSuggestedPlans(
    rootPlansBase,
    selectedIncomeSatang - savingsReserveSatang - debtMinimumSatang,
  );

  const categoryPlans = reducedSuggestion.plans.map((plan) => ({
    ...plan,
    childPlans: buildChildPlans({
      rootId: plan.categoryId,
      childrenByParent: categoryIndex.childrenByParent,
      appliedRowsByCategoryId,
      monthTotalByCategory: monthIndexes.monthTotalByCategory,
      historyMonthKeys,
      historyCategoryTotals: historyTotals.expenseMonthByCategory,
    }),
  }));

  const availableExpenseSatang = Math.max(0, selectedIncomeSatang - savingsReserveSatang - debtMinimumSatang);
  const appliedExpenseBudgetSatang = categoryPlans.reduce(
    (sum, plan) => sum + clampPositiveInt(plan.appliedLimitSatang),
    0,
  );
  const fallbackMonthlyTargetSatang =
    appliedExpenseBudgetSatang > 0 ? 0 : clampPositiveInt(config.monthlyTargetSatang);
  const activeExpenseBudgetSatang = appliedExpenseBudgetSatang || fallbackMonthlyTargetSatang;
  const suggestedExpenseBudgetSatang = reducedSuggestion.suggestedExpenseBudgetSatang;
  const activeBudgetShortfallSatang = Math.max(0, monthIndexes.monthExpenseTotal - activeExpenseBudgetSatang);
  const suggestedBudgetShortfallSatang = clampPositiveInt(reducedSuggestion.shortfallSatang);
  const leftoverAfterSuggested = Math.max(
    0,
    selectedIncomeSatang - savingsReserveSatang - debtMinimumSatang - suggestedExpenseBudgetSatang,
  );
  const leftoverAfterApplied = Math.max(
    0,
    selectedIncomeSatang - savingsReserveSatang - debtMinimumSatang - activeExpenseBudgetSatang,
  );

  const safeMonthDays = daysInMonthKey(safeMonth);
  const isCurrentMonth = safeMonth === safeToday.slice(0, 7);
  const currentDay = isCurrentMonth ? Math.max(1, Number(safeToday.slice(-2)) || 1) : safeMonthDays;
  const daysRemaining = isCurrentMonth ? Math.max(1, safeMonthDays - currentDay + 1) : safeMonthDays;
  const spentForDailyBudget = isCurrentMonth ? monthIndexes.spentToDateTotal : 0;
  const dailyBudgetSatang = activeExpenseBudgetSatang
    ? Math.max(
        0,
        Math.floor(
          (isCurrentMonth
            ? Math.max(0, activeExpenseBudgetSatang - spentForDailyBudget)
            : activeExpenseBudgetSatang) / Math.max(1, daysRemaining),
        ),
      )
    : 0;
  const suggestedDailyBudgetSatang = suggestedExpenseBudgetSatang
    ? Math.max(
        0,
        Math.floor(
          (isCurrentMonth
            ? Math.max(0, suggestedExpenseBudgetSatang - spentForDailyBudget)
            : suggestedExpenseBudgetSatang) / Math.max(1, daysRemaining),
        ),
      )
    : 0;

  const prioritizedDebts = activeDebtPlans.slice().sort(sortDebtPriority);
  const debtTarget = config.debtStrategyMode === "paydown" ? prioritizedDebts[0] || null : null;

  return {
    monthKey: safeMonth,
    historyMonthKeys,
    incomeMode: config.incomeMode,
    fixedIncomeSatang: config.fixedIncomeSatang,
    rollingAverageIncomeSatang,
    selectedIncomeSatang,
    savingsMode: config.savingsMode,
    savingsReserveSatang,
    savingsAmountSatang: config.savingsAmountSatang,
    savingsPercentBps: config.savingsPercentBps,
    debtStrategyMode: config.debtStrategyMode,
    debtMinimumSatang,
    debtExtraSatang: config.debtStrategyMode === "paydown" ? leftoverAfterApplied : 0,
    suggestedDebtExtraSatang: config.debtStrategyMode === "paydown" ? leftoverAfterSuggested : 0,
    bufferSatang: config.debtStrategyMode === "survival" ? leftoverAfterApplied : 0,
    suggestedBufferSatang: config.debtStrategyMode === "survival" ? leftoverAfterSuggested : 0,
    availableExpenseSatang,
    dailyBudgetSatang,
    suggestedDailyBudgetSatang,
    shortfallSatang: activeExpenseBudgetSatang ? activeBudgetShortfallSatang : suggestedBudgetShortfallSatang,
    activeShortfallSatang: activeBudgetShortfallSatang,
    suggestedShortfallSatang: suggestedBudgetShortfallSatang,
    hasAppliedBudget: appliedExpenseBudgetSatang > 0,
    usesLegacyMonthlyTarget: appliedExpenseBudgetSatang === 0 && fallbackMonthlyTargetSatang > 0,
    activeExpenseBudgetSatang,
    appliedExpenseBudgetSatang,
    fallbackMonthlyTargetSatang,
    suggestedExpenseBudgetSatang,
    spentMonthSatang: monthIndexes.monthExpenseTotal,
    spentToDateSatang: monthIndexes.spentToDateTotal,
    daysRemaining,
    debtTarget: debtTarget
      ? {
          id: debtTarget.id,
          accountId: debtTarget.account_id,
          currentBalanceSatang: clampPositiveInt(debtTarget.current_balance_satang),
          minimumPaymentSatang: clampPositiveInt(debtTarget.minimum_payment_satang),
          aprBps: clampPositiveInt(debtTarget.apr_bps),
          dueDay: debtTarget.due_day ?? null,
        }
      : null,
    categoryPlans,
  };
}

export function buildBudgetHint({
  draft,
  budgetRows,
  categories,
  transactions,
} = {}) {
  const safeKind = cleanText(draft?.kind).toLowerCase();
  if (safeKind !== "expense") return null;

  const categoryId = cleanText(draft?.categoryId ?? draft?.category_id);
  const date = sanitizeIsoDate(draft?.date);
  const amountSatang = clampPositiveInt(draft?.amountSatang ?? draft?.amount_satang);
  if (!categoryId || !date) return null;

  const monthKey = date.slice(0, 7);
  const appliedRows = getAppliedBudgetRowsForMonth(budgetRows, monthKey);
  if (!appliedRows.length) return null;

  const categoryIndex = buildExpenseCategoryIndex(categories);
  const monthIndexes = buildMonthSpendIndexes({
    transactions,
    categoryMap: categoryIndex.categoryMap,
    monthKey,
    today: todayDate(),
  });
  const appliedRowsByCategoryId = new Map(
    appliedRows.map((row) => [cleanText(row.category_id), row]),
  );
  const rootId = getRootCategoryId(categoryId, categoryIndex.categoryMap);
  const childRow = appliedRowsByCategoryId.get(categoryId) || null;
  const parentRow = appliedRowsByCategoryId.get(rootId) || null;
  const activeRow = childRow || parentRow;
  if (!activeRow) return null;

  const spentSatang = childRow
    ? clampPositiveInt(monthIndexes.monthTotalByCategory.get(categoryId))
    : clampPositiveInt(monthIndexes.monthTotalByRoot.get(rootId));
  const plannedLimitSatang = clampPositiveInt(activeRow.limit_satang);
  const projectedSatang = spentSatang + amountSatang;
  const alertPct = Math.max(1, Math.min(100, toInt(activeRow.alert_pct, DEFAULT_BUDGET_ALERT_PCT)));
  const overBySatang = Math.max(0, projectedSatang - plannedLimitSatang);
  const remainingSatang = Math.max(0, plannedLimitSatang - spentSatang);
  const warnThresholdSatang = Math.round((plannedLimitSatang * alertPct) / 100);
  const status = overBySatang > 0 ? "over" : projectedSatang >= warnThresholdSatang ? "warning" : "ok";

  return {
    monthKey,
    scope: childRow ? "child" : "root",
    scopeCategoryId: childRow ? categoryId : rootId,
    plannedLimitSatang,
    spentSatang,
    projectedSatang,
    remainingSatang,
    overBySatang,
    alertPct,
    status,
  };
}

export function buildBudgetCompatRows({ monthKey, budgetPlanSnapshot, budgetRows } = {}) {
  const safeMonth = sanitizeMonthKey(monthKey);
  const rows = normalizeBudgetRows(budgetRows)
    .filter((row) => row.month_key === safeMonth)
    .map((row) => ({
      id: row.id != null ? `budget_${row.id}` : `${safeMonth}_${row.category_id}`,
      month: row.month_key,
      categoryId: row.category_id,
      limit: row.limit_satang,
      alertPct: row.alert_pct,
      source: row.source,
      manualOverride: row.manual_override === true,
    }));
  const compat = [];
  const monthlyLimit = clampPositiveInt(
    budgetPlanSnapshot?.activeExpenseBudgetSatang || budgetPlanSnapshot?.fallbackMonthlyTargetSatang,
  );
  if (monthlyLimit > 0) {
    compat.push({
      id: `budget_total_${safeMonth.replace("-", "_")}`,
      month: safeMonth,
      categoryId: "__TOTAL__",
      limit: monthlyLimit,
      alertPct: DEFAULT_BUDGET_ALERT_PCT,
      source: "compat",
      manualOverride: false,
    });
  }
  const dailyLimit = clampPositiveInt(budgetPlanSnapshot?.dailyBudgetSatang);
  if (dailyLimit > 0) {
    compat.push({
      id: `budget_daily_${safeMonth.replace("-", "_")}`,
      month: safeMonth,
      categoryId: "__DAILY__",
      limit: dailyLimit,
      alertPct: 100,
      source: "compat",
      manualOverride: false,
    });
  }
  return [...rows, ...compat];
}
