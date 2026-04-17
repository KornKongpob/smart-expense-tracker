import { daysInMonthKey } from "../../utils/transaction.js";
import {
  DEFAULT_BUDGET_ALERT_PCT,
  getDefaultBudgetBehavior,
  normalizeBudgetBehavior,
  normalizeBudgetRows,
  normalizePlanningConfig,
  sanitizeMonthKey,
  shiftMonthKey,
} from "./budgetPlanningState.js";
import { normalizeDebtPlans } from "./plannerState.js";

export const PLANNER_ENGINE_VERSION = "planner-v2";
export const PLANNER_SCENARIO_OPTIONS = Object.freeze([
  { id: "baseline", label: "Baseline" },
  { id: "tight", label: "Tight" },
  { id: "comfort", label: "Comfort" },
]);

const ROOT_EXCLUDED_FROM_BUDGETING = new Set([
  "debt",
  "discount",
  "adjust_balance",
  "mixed",
]);

const REASON_LABELS = Object.freeze({
  rising_trend: "เทรนด์กำลังขึ้น",
  over_budget_run_rate: "จังหวะใช้เงินเดือนนี้สูงกว่าฐาน",
  stable_fixed_cost: "ค่าใช้จ่ายคงที่และนิ่ง",
  inactive_recently: "ไม่มีการใช้ต่อเนื่อง 3 เดือน",
  manual_locked: "ล็อกงบด้วยตัวเอง",
});

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

function clampRatio(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function sanitizeIsoDate(value) {
  const text = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function compareMonthKeys(left, right) {
  return sanitizeMonthKey(left).localeCompare(sanitizeMonthKey(right));
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

function buildExpenseCategoryIndex(groupedCategories) {
  const expenseRows = Array.isArray(groupedCategories?.expense) ? groupedCategories.expense : [];
  const categoryMap = new Map();

  for (const row of expenseRows) {
    categoryMap.set(cleanText(row?.id), row);
  }

  return {
    categoryMap,
    rootRows: expenseRows.filter(isRootExpenseCategory),
  };
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
    kind: cleanText(row?.kind),
    category_id: cleanText(row?.category_id ?? row?.categoryId),
    amount_satang: clampPositiveInt(row?.amount_satang ?? row?.amount),
    date: sanitizeIsoDate(row?.date),
    is_split_parent: row?.is_split_parent === true || row?.isSplitParent === true,
  };
}

function listClosedMonths(monthKey, count = 6) {
  const months = [];
  for (let index = 1; index <= count; index += 1) {
    months.push(shiftMonthKey(monthKey, -index));
  }
  return months;
}

function averageFromValues(values) {
  const list = values.filter((value) => Number.isFinite(Number(value)));
  if (!list.length) return 0;
  return Math.round(list.reduce((sum, value) => sum + Number(value || 0), 0) / list.length);
}

function stdDev(values, mean) {
  const list = values.filter((value) => Number.isFinite(Number(value)));
  if (!list.length || !mean) return 0;
  const variance =
    list.reduce((sum, value) => sum + (Number(value || 0) - mean) ** 2, 0) / Math.max(1, list.length);
  return Math.sqrt(variance);
}

function roundToNearestHundred(value) {
  const safeValue = clampPositiveInt(value);
  if (!safeValue) return 0;
  return Math.round(safeValue / 100) * 100;
}

function normalizePlannerPlanRow(row) {
  return {
    ...row,
    id: row?.id != null && row?.id !== "" ? Number(row.id) : null,
    month_key: sanitizeMonthKey(row?.month_key),
    scenario_key: cleanText(row?.scenario_key),
    status: cleanText(row?.status, "draft"),
    engine_version: cleanText(row?.engine_version),
    income_basis_satang: clampPositiveInt(row?.income_basis_satang),
    savings_reserve_satang: clampPositiveInt(row?.savings_reserve_satang),
    debt_minimum_satang: clampPositiveInt(row?.debt_minimum_satang),
    available_expense_satang: clampPositiveInt(row?.available_expense_satang),
    recommended_expense_satang: clampPositiveInt(row?.recommended_expense_satang),
    shortfall_satang: clampPositiveInt(row?.shortfall_satang),
    confidence_score: clampRatio(row?.confidence_score),
    generated_at: row?.generated_at || null,
    metadata: row?.metadata && typeof row.metadata === "object" ? row.metadata : {},
  };
}

function normalizePlannerPlanItemRow(row) {
  return {
    ...row,
    id: row?.id != null && row?.id !== "" ? Number(row.id) : null,
    plan_id: row?.plan_id != null && row?.plan_id !== "" ? Number(row.plan_id) : null,
    month_key: sanitizeMonthKey(row?.month_key),
    scenario_key: cleanText(row?.scenario_key),
    category_id: cleanText(row?.category_id),
    behavior: normalizeBudgetBehavior(row?.behavior, "flexible"),
    baseline_spend_satang: clampPositiveInt(row?.baseline_spend_satang),
    recent_spend_satang: clampPositiveInt(row?.recent_spend_satang),
    current_pace_satang: clampPositiveInt(row?.current_pace_satang),
    volatility_score: clampRatio(row?.volatility_score),
    recommended_limit_satang: clampPositiveInt(row?.recommended_limit_satang),
    delta_satang: toInt(row?.delta_satang, 0),
    confidence_score: clampRatio(row?.confidence_score),
    reason_codes: Array.isArray(row?.reason_codes)
      ? row.reason_codes.map((code) => cleanText(code)).filter(Boolean)
      : [],
    locked_by_user: row?.locked_by_user === true,
    decision_status: cleanText(row?.decision_status, "pending"),
    applied_limit_satang: clampPositiveInt(row?.applied_limit_satang),
    locked_limit_satang: clampPositiveInt(row?.locked_limit_satang),
    metadata: row?.metadata && typeof row.metadata === "object" ? row.metadata : {},
  };
}

export function normalizePlannerMonthlyPlans(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(normalizePlannerPlanRow)
    .filter((row) => row.month_key && row.scenario_key);
}

export function normalizePlannerMonthlyPlanItems(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(normalizePlannerPlanItemRow)
    .filter((row) => row.month_key && row.scenario_key && row.category_id);
}

function buildStoredItemIndex(rows, monthKey) {
  const index = new Map();
  for (const row of normalizePlannerMonthlyPlanItems(rows)) {
    if (row.month_key !== monthKey) continue;
    index.set(`${row.scenario_key}:${row.category_id}`, row);
  }
  return index;
}

function buildStoredPlanIndex(rows, monthKey) {
  const index = new Map();
  for (const row of normalizePlannerMonthlyPlans(rows)) {
    if (row.month_key !== monthKey) continue;
    index.set(row.scenario_key, row);
  }
  return index;
}

function getReasonLabels(reasonCodes) {
  return (Array.isArray(reasonCodes) ? reasonCodes : [])
    .map((code) => REASON_LABELS[code] || code)
    .filter(Boolean);
}

function buildHistoryIndexes({ transactions, categoryMap, monthKey, today }) {
  const closedMonths = listClosedMonths(monthKey, 6);
  const closedMonthSet = new Set(closedMonths);
  const observedMonthSet = new Set();
  const rootTotalsByMonth = new Map();
  const currentRootTotals = new Map();
  let currentSpentToDateSatang = 0;

  const safeMonth = sanitizeMonthKey(monthKey);
  const safeToday = sanitizeIsoDate(today) || todayDate();
  const isCurrentMonth = safeToday.slice(0, 7) === safeMonth;

  for (const raw of Array.isArray(transactions) ? transactions : []) {
    const row = normalizePlanningTransaction(raw);
    if (!row.date || row.kind !== "expense" || row.is_split_parent) continue;
    const rowMonth = row.date.slice(0, 7);
    observedMonthSet.add(rowMonth);

    const rootId = getRootCategoryId(row.category_id, categoryMap);
    if (closedMonthSet.has(rowMonth)) {
      const rootKey = `${rowMonth}:${rootId}`;
      rootTotalsByMonth.set(rootKey, (rootTotalsByMonth.get(rootKey) || 0) + row.amount_satang);
    }

    if (rowMonth !== safeMonth) continue;
    currentRootTotals.set(rootId, (currentRootTotals.get(rootId) || 0) + row.amount_satang);
    if (!isCurrentMonth || row.date <= safeToday) {
      currentSpentToDateSatang += row.amount_satang;
    }
  }

  return {
    closedMonths,
    observedMonthSet,
    rootTotalsByMonth,
    currentRootTotals,
    currentSpentToDateSatang,
    isCurrentMonth,
  };
}

function getObservedMonthValues(months, map, categoryId, observedMonthSet) {
  return months
    .filter((month) => observedMonthSet.has(month))
    .map((month) => clampPositiveInt(map.get(`${month}:${categoryId}`)));
}

function calculateWeightedBaseline({ categoryId, rootTotalsByMonth, observedMonthSet, closedMonths }) {
  const lastClosedMonth = closedMonths[0];
  const lastClosedValue = observedMonthSet.has(lastClosedMonth)
    ? clampPositiveInt(rootTotalsByMonth.get(`${lastClosedMonth}:${categoryId}`))
    : null;
  const threeMonthValues = getObservedMonthValues(closedMonths.slice(0, 3), rootTotalsByMonth, categoryId, observedMonthSet);
  const sixMonthValues = getObservedMonthValues(closedMonths.slice(0, 6), rootTotalsByMonth, categoryId, observedMonthSet);
  const weightedParts = [];

  if (lastClosedValue != null) weightedParts.push({ weight: 0.5, value: lastClosedValue });
  if (threeMonthValues.length) weightedParts.push({ weight: 0.3, value: averageFromValues(threeMonthValues) });
  if (sixMonthValues.length) weightedParts.push({ weight: 0.2, value: averageFromValues(sixMonthValues) });

  if (!weightedParts.length) {
    return {
      baselineSpendSatang: 0,
      lastClosedValue: 0,
      recentSpendSatang: 0,
      sixMonthAverageSatang: 0,
      observedMonthCount: 0,
    };
  }

  const weightTotal = weightedParts.reduce((sum, part) => sum + part.weight, 0);
  const baselineSpendSatang = Math.round(
    weightedParts.reduce((sum, part) => sum + part.value * part.weight, 0) / Math.max(weightTotal, 0.0001),
  );

  return {
    baselineSpendSatang,
    lastClosedValue: clampPositiveInt(lastClosedValue),
    recentSpendSatang: averageFromValues(threeMonthValues),
    sixMonthAverageSatang: averageFromValues(sixMonthValues),
    observedMonthCount: sixMonthValues.length,
  };
}

function getProjectedMonthEndSatang({ currentSpentSatang, safeMonth, safeToday, isCurrentMonth }) {
  if (!currentSpentSatang) return 0;
  const monthDays = daysInMonthKey(safeMonth);
  if (!isCurrentMonth) return clampPositiveInt(currentSpentSatang);
  const currentDay = Math.max(1, Number(safeToday.slice(-2)) || 1);
  return Math.round((currentSpentSatang / Math.max(1, currentDay)) * monthDays);
}

function getReductionFloor(behavior, baselineSpendSatang, currentLimitSatang, lockedByUser) {
  if (lockedByUser) return clampPositiveInt(currentLimitSatang || baselineSpendSatang);
  const baseline = clampPositiveInt(baselineSpendSatang);
  if (behavior === "fixed") return baseline;
  if (behavior === "essential") return Math.round(baseline * 0.9);
  return Math.round(baseline * 0.75);
}

function getScenarioConfig(id, baselineTargetSatang, availableExpenseSatang, floorTotalSatang) {
  if (id === "tight") {
    return {
      recommendedExpenseSatang: Math.max(floorTotalSatang, Math.round(baselineTargetSatang * 0.92)),
      status: "draft",
    };
  }
  if (id === "comfort") {
    return {
      recommendedExpenseSatang: Math.min(
        availableExpenseSatang,
        Math.round(baselineTargetSatang + Math.max(0, availableExpenseSatang - baselineTargetSatang) * 0.55),
      ),
      status: "draft",
    };
  }
  return {
    recommendedExpenseSatang: Math.min(availableExpenseSatang, baselineTargetSatang),
    status: "draft",
  };
}

function distributeDelta(rows, targetTotal, mode) {
  const safeTarget = clampPositiveInt(targetTotal);
  const currentTotal = rows.reduce((sum, row) => sum + clampPositiveInt(row.currentLimitSatang), 0);
  let remaining = safeTarget - currentTotal;
  const next = rows.map((row) => ({ ...row, nextLimitSatang: clampPositiveInt(row.currentLimitSatang) }));
  if (!next.length || remaining === 0) return next;

  if (remaining < 0) {
    let deficit = Math.abs(remaining);
    for (const behavior of ["flexible", "essential", "fixed"]) {
      if (deficit <= 0) break;
      const bucket = next.filter((row) => row.behavior === behavior && row.nextLimitSatang > row.floorSatang);
      const capacity = bucket.reduce((sum, row) => sum + Math.max(0, row.nextLimitSatang - row.floorSatang), 0);
      if (!capacity) continue;
      let assigned = 0;
      bucket.forEach((row, index) => {
        const available = Math.max(0, row.nextLimitSatang - row.floorSatang);
        const reduction = index === bucket.length - 1
          ? Math.min(available, deficit - assigned)
          : Math.min(available, Math.round((deficit * available) / Math.max(1, capacity)));
        row.nextLimitSatang = Math.max(row.floorSatang, row.nextLimitSatang - reduction);
        assigned += reduction;
      });
      deficit -= assigned;
    }
    return next;
  }

  const bucketWeights = mode === "comfort"
    ? { fixed: 0.8, essential: 1, flexible: 1.2 }
    : { fixed: 0.7, essential: 0.9, flexible: 1 };
  const weightTotal = next.reduce(
    (sum, row) => sum + Math.max(1, row.currentLimitSatang || row.baselineSpendSatang || 1) * (bucketWeights[row.behavior] || 1),
    0,
  );
  next.forEach((row, index) => {
    const weight = Math.max(1, row.currentLimitSatang || row.baselineSpendSatang || 1) * (bucketWeights[row.behavior] || 1);
    const addition = index === next.length - 1
      ? remaining
      : Math.round((remaining * weight) / Math.max(1, weightTotal));
    row.nextLimitSatang += addition;
    remaining -= addition;
  });
  return next;
}

function buildRootRecommendationBase({
  rootCategory,
  history,
  safeMonth,
  safeToday,
  appliedRowsByCategoryId,
  legacyPlan,
  storedItem,
}) {
  const categoryId = cleanText(rootCategory?.id);
  const behavior = normalizeBudgetBehavior(rootCategory?.budgetBehavior, getDefaultBudgetBehavior(rootCategory));
  const baselineSummary = calculateWeightedBaseline({
    categoryId,
    rootTotalsByMonth: history.rootTotalsByMonth,
    observedMonthSet: history.observedMonthSet,
    closedMonths: history.closedMonths,
  });
  const observedValues = getObservedMonthValues(
    history.closedMonths,
    history.rootTotalsByMonth,
    categoryId,
    history.observedMonthSet,
  );
  const monthAverage = averageFromValues(observedValues);
  const volatilityRatio = monthAverage ? stdDev(observedValues, monthAverage) / Math.max(1, monthAverage) : 0;
  const currentSpentSatang = clampPositiveInt(history.currentRootTotals.get(categoryId));
  const projectedMonthEndSatang = getProjectedMonthEndSatang({
    currentSpentSatang,
    safeMonth,
    safeToday,
    isCurrentMonth: history.isCurrentMonth,
  });
  const appliedRow = appliedRowsByCategoryId.get(categoryId) || null;
  const appliedLimitSatang = clampPositiveInt(appliedRow?.limit_satang ?? legacyPlan?.appliedLimitSatang);
  const lockedByUser = storedItem?.locked_by_user === true || appliedRow?.manual_override === true || legacyPlan?.manualOverride === true;
  const lockedLimitSatang = clampPositiveInt(storedItem?.locked_limit_satang);
  const currentLimitSatang = lockedByUser
    ? clampPositiveInt(lockedLimitSatang || appliedLimitSatang || baselineSummary.baselineSpendSatang)
    : clampPositiveInt(appliedLimitSatang || baselineSummary.baselineSpendSatang);

  const reasonCodes = [];
  let recommendedLimitSatang = clampPositiveInt(baselineSummary.baselineSpendSatang);

  if (behavior === "fixed" && volatilityRatio <= 0.12 && baselineSummary.baselineSpendSatang > 0) {
    reasonCodes.push("stable_fixed_cost");
  }
  if (
    baselineSummary.lastClosedValue > 0 &&
    baselineSummary.sixMonthAverageSatang > 0 &&
    baselineSummary.lastClosedValue >= Math.round(baselineSummary.sixMonthAverageSatang * 1.1)
  ) {
    reasonCodes.push("rising_trend");
  }
  if (
    projectedMonthEndSatang > 0 &&
    baselineSummary.baselineSpendSatang > 0 &&
    projectedMonthEndSatang >= Math.round(baselineSummary.baselineSpendSatang * 1.15)
  ) {
    reasonCodes.push("over_budget_run_rate");
    if (!reasonCodes.includes("rising_trend")) reasonCodes.push("rising_trend");
    recommendedLimitSatang = Math.round(
      baselineSummary.baselineSpendSatang +
        Math.max(0, projectedMonthEndSatang - baselineSummary.baselineSpendSatang) * 0.4,
    );
  }

  const inactiveLastThreeMonths = history.closedMonths
    .slice(0, 3)
    .every((month) => !history.observedMonthSet.has(month) || !clampPositiveInt(history.rootTotalsByMonth.get(`${month}:${categoryId}`)));
  if (inactiveLastThreeMonths && behavior !== "fixed" && !lockedByUser) {
    reasonCodes.push("inactive_recently");
    recommendedLimitSatang = Math.round(recommendedLimitSatang * 0.5);
  }

  if (lockedByUser) {
    reasonCodes.push("manual_locked");
    recommendedLimitSatang = currentLimitSatang;
  }

  const floorSatang = getReductionFloor(
    behavior,
    baselineSummary.baselineSpendSatang,
    currentLimitSatang,
    lockedByUser,
  );
  const confidenceCoverage = baselineSummary.observedMonthCount / 6;
  const volatilityConfidence = 1 - Math.min(1, volatilityRatio * 0.9);
  const confidenceScore = clampRatio(
    0.25 + confidenceCoverage * 0.35 + volatilityConfidence * 0.25 + (currentSpentSatang > 0 ? 0.1 : 0),
    0.3,
  );

  return {
    categoryId,
    rootCategoryId: categoryId,
    name: cleanText(rootCategory?.name, "Category"),
    icon: cleanText(rootCategory?.icon),
    color: cleanText(rootCategory?.color, "#0f766e"),
    behavior,
    baselineSpendSatang: roundToNearestHundred(baselineSummary.baselineSpendSatang),
    recentSpendSatang: roundToNearestHundred(baselineSummary.recentSpendSatang),
    sixMonthAverageSatang: roundToNearestHundred(baselineSummary.sixMonthAverageSatang),
    currentSpentSatang,
    projectedMonthEndSatang: roundToNearestHundred(projectedMonthEndSatang),
    currentPaceSatang: roundToNearestHundred(projectedMonthEndSatang),
    currentLimitSatang,
    appliedLimitSatang,
    recommendedLimitSatang: roundToNearestHundred(recommendedLimitSatang),
    floorSatang: roundToNearestHundred(floorSatang),
    confidenceScore,
    volatilityScore: clampRatio(volatilityRatio),
    reasonCodes: Array.from(new Set(reasonCodes)),
    reasonLabels: getReasonLabels(reasonCodes),
    lockedByUser,
    lockedLimitSatang,
    decisionStatus: cleanText(storedItem?.decision_status, "pending"),
    needsAttention:
      lockedByUser ||
      Math.abs(recommendedLimitSatang - currentLimitSatang) >= 500 ||
      reasonCodes.includes("over_budget_run_rate") ||
      reasonCodes.includes("inactive_recently"),
    childPlans: Array.isArray(legacyPlan?.childPlans) ? legacyPlan.childPlans : [],
    spentMonthSatang: clampPositiveInt(legacyPlan?.spentMonthSatang ?? currentSpentSatang),
    averageSpendSatang: clampPositiveInt(legacyPlan?.averageSpendSatang ?? baselineSummary.recentSpendSatang),
    alertPct: Math.max(
      1,
      Math.min(100, toInt(appliedRow?.alert_pct ?? legacyPlan?.alertPct, DEFAULT_BUDGET_ALERT_PCT)),
    ),
    source: appliedRow?.source ?? legacyPlan?.source ?? null,
    manualOverride: appliedRow?.manual_override === true || legacyPlan?.manualOverride === true,
  };
}

function buildScenario({ id, label, status, items, baseSnapshot, storedPlan }) {
  const recommendedExpenseSatang = items.reduce((sum, item) => sum + clampPositiveInt(item.recommendedLimitSatang), 0);
  const shortfallSatang = Math.max(0, recommendedExpenseSatang - clampPositiveInt(baseSnapshot.availableExpenseSatang));
  const monthDays = daysInMonthKey(baseSnapshot.monthKey);
  const currentDay = baseSnapshot.isCurrentMonth ? Math.max(1, Number(baseSnapshot.today.slice(-2)) || 1) : monthDays;
  const daysRemaining = baseSnapshot.isCurrentMonth ? Math.max(1, monthDays - currentDay + 1) : monthDays;
  const dailyBudgetSatang = recommendedExpenseSatang
    ? Math.max(
        0,
        Math.floor(
          (baseSnapshot.isCurrentMonth
            ? Math.max(0, recommendedExpenseSatang - clampPositiveInt(baseSnapshot.spentToDateSatang))
            : recommendedExpenseSatang) / Math.max(1, daysRemaining),
        ),
      )
    : 0;
  const leftoverSatang = Math.max(0, clampPositiveInt(baseSnapshot.availableExpenseSatang) - recommendedExpenseSatang);
  const confidenceScore = clampRatio(
    items.length ? items.reduce((sum, item) => sum + clampRatio(item.confidenceScore), 0) / items.length : 0,
  );

  return {
    id,
    label,
    status: storedPlan?.status || status,
    engineVersion: PLANNER_ENGINE_VERSION,
    monthKey: baseSnapshot.monthKey,
    incomeBasisSatang: clampPositiveInt(baseSnapshot.selectedIncomeSatang),
    savingsReserveSatang: clampPositiveInt(baseSnapshot.savingsReserveSatang),
    debtMinimumSatang: clampPositiveInt(baseSnapshot.debtMinimumSatang),
    availableExpenseSatang: clampPositiveInt(baseSnapshot.availableExpenseSatang),
    recommendedExpenseSatang,
    shortfallSatang,
    confidenceScore,
    generatedAt: storedPlan?.generated_at || new Date().toISOString(),
    dailyBudgetSatang,
    bufferSatang: baseSnapshot.debtStrategyMode === "survival" ? leftoverSatang : 0,
    debtExtraSatang: baseSnapshot.debtStrategyMode === "paydown" ? leftoverSatang : 0,
    attentionCount: items.filter((item) => item.needsAttention).length,
    changedCategoryCount: items.filter((item) => item.deltaSatang !== 0).length,
    items,
    metadata: {
      daysRemaining,
      spentToDateSatang: clampPositiveInt(baseSnapshot.spentToDateSatang),
      debtStrategyMode: baseSnapshot.debtStrategyMode,
      debtTarget: baseSnapshot.debtTarget || null,
    },
  };
}

function cloneItemForScenario(item, nextLimitSatang, scenarioKey, storedItem) {
  const recommendedLimitSatang = roundToNearestHundred(nextLimitSatang);
  const decisionStatus = cleanText(storedItem?.decision_status || item.decisionStatus, "pending");
  const lockedByUser = storedItem?.locked_by_user === true || item.lockedByUser;
  const lockedLimitSatang = clampPositiveInt(storedItem?.locked_limit_satang) || item.lockedLimitSatang;

  return {
    ...item,
    scenarioKey,
    decisionStatus,
    lockedByUser,
    lockedLimitSatang,
    recommendedLimitSatang,
    deltaSatang: toInt(recommendedLimitSatang - clampPositiveInt(item.currentLimitSatang), 0),
    needsAttention:
      lockedByUser ||
      Math.abs(recommendedLimitSatang - clampPositiveInt(item.currentLimitSatang)) >= 500 ||
      item.reasonCodes.includes("over_budget_run_rate") ||
      item.reasonCodes.includes("inactive_recently"),
  };
}

export function buildPlannerMonthlyPlanState({
  profile,
  categories,
  debtPlans,
  budgetRows,
  transactions,
  monthValue,
  today = todayDate(),
  storedPlans = [],
  storedItems = [],
  legacySnapshot = null,
} = {}) {
  const safeMonth = sanitizeMonthKey(monthValue);
  const safeToday = sanitizeIsoDate(today) || todayDate();
  const categoryIndex = buildExpenseCategoryIndex(categories);
  const planningConfig = normalizePlanningConfig(profile);
  const baseSnapshot = legacySnapshot || {
    monthKey: safeMonth,
    today: safeToday,
    isCurrentMonth: compareMonthKeys(safeMonth, safeToday.slice(0, 7)) === 0,
    selectedIncomeSatang: 0,
    savingsReserveSatang: 0,
    debtMinimumSatang: normalizeDebtPlans(debtPlans).reduce((sum, plan) => sum + clampPositiveInt(plan.minimum_payment_satang), 0),
    availableExpenseSatang: 0,
    spentToDateSatang: 0,
    debtStrategyMode: planningConfig.debtStrategyMode,
    debtTarget: null,
    categoryPlans: [],
  };
  const history = buildHistoryIndexes({
    transactions,
    categoryMap: categoryIndex.categoryMap,
    monthKey: safeMonth,
    today: safeToday,
  });
  const appliedRowsByCategoryId = new Map(
    normalizeBudgetRows(budgetRows)
      .filter((row) => row.month_key === safeMonth)
      .map((row) => [cleanText(row.category_id), row]),
  );
  const legacyPlanMap = new Map(
    (Array.isArray(baseSnapshot.categoryPlans) ? baseSnapshot.categoryPlans : []).map((plan) => [plan.categoryId, plan]),
  );
  const storedPlanIndex = buildStoredPlanIndex(storedPlans, safeMonth);
  const storedItemIndex = buildStoredItemIndex(storedItems, safeMonth);

  const rootItems = categoryIndex.rootRows.map((rootCategory) =>
    buildRootRecommendationBase({
      rootCategory,
      history,
      safeMonth,
      safeToday,
      appliedRowsByCategoryId,
      legacyPlan: legacyPlanMap.get(cleanText(rootCategory?.id)) || null,
      storedItem: storedItemIndex.get(`baseline:${cleanText(rootCategory?.id)}`) || null,
    }),
  );

  const baselineRawTotal = rootItems.reduce((sum, item) => sum + clampPositiveInt(item.recommendedLimitSatang), 0);
  const floorTotalSatang = rootItems.reduce((sum, item) => sum + clampPositiveInt(item.floorSatang), 0);
  const baselineTargetSatang = Math.min(
    clampPositiveInt(baseSnapshot.availableExpenseSatang),
    baselineRawTotal || clampPositiveInt(baseSnapshot.availableExpenseSatang),
  );

  const scenarios = PLANNER_SCENARIO_OPTIONS.map((scenario) => {
    const scenarioConfig = getScenarioConfig(
      scenario.id,
      baselineTargetSatang,
      clampPositiveInt(baseSnapshot.availableExpenseSatang),
      floorTotalSatang,
    );
    const distributed = distributeDelta(
      rootItems.map((item) => ({
        categoryId: item.categoryId,
        behavior: item.behavior,
        floorSatang: item.floorSatang,
        baselineSpendSatang: item.baselineSpendSatang,
        currentLimitSatang: item.recommendedLimitSatang,
      })),
      scenarioConfig.recommendedExpenseSatang,
      scenario.id,
    );
    const distributedMap = new Map(distributed.map((item) => [item.categoryId, item.nextLimitSatang]));
    const items = rootItems.map((item) =>
      cloneItemForScenario(
        item,
        distributedMap.get(item.categoryId) ?? item.recommendedLimitSatang,
        scenario.id,
        storedItemIndex.get(`${scenario.id}:${item.categoryId}`) || null,
      ),
    );

    return buildScenario({
      id: scenario.id,
      label: scenario.label,
      status: scenarioConfig.status,
      items,
      baseSnapshot: {
        ...baseSnapshot,
        monthKey: safeMonth,
        today: safeToday,
        isCurrentMonth: compareMonthKeys(safeMonth, safeToday.slice(0, 7)) === 0,
      },
      storedPlan: storedPlanIndex.get(scenario.id) || null,
    });
  });

  const baselineScenario = scenarios.find((scenario) => scenario.id === "baseline") || scenarios[0] || null;

  return {
    monthKey: safeMonth,
    engineVersion: PLANNER_ENGINE_VERSION,
    unavailable: false,
    scenarios,
    recommendations: Array.isArray(baselineScenario?.items)
      ? baselineScenario.items.slice().sort((left, right) => {
        const attentionDelta = Number(right.needsAttention === true) - Number(left.needsAttention === true);
        if (attentionDelta !== 0) return attentionDelta;
        const lockDelta = Number(right.lockedByUser === true) - Number(left.lockedByUser === true);
        if (lockDelta !== 0) return lockDelta;
        const deltaGap = Math.abs(Number(right.deltaSatang || 0)) - Math.abs(Number(left.deltaSatang || 0));
        if (deltaGap !== 0) return deltaGap;
        return cleanText(left.name).localeCompare(cleanText(right.name), "th");
      })
      : [],
    syncPayload: {
      plans: scenarios.map((scenario) => ({
        month_key: safeMonth,
        scenario_key: scenario.id,
        status: scenario.status,
        engine_version: PLANNER_ENGINE_VERSION,
        income_basis_satang: scenario.incomeBasisSatang,
        savings_reserve_satang: scenario.savingsReserveSatang,
        debt_minimum_satang: scenario.debtMinimumSatang,
        available_expense_satang: scenario.availableExpenseSatang,
        recommended_expense_satang: scenario.recommendedExpenseSatang,
        shortfall_satang: scenario.shortfallSatang,
        confidence_score: scenario.confidenceScore,
        generated_at: scenario.generatedAt,
        metadata: {
          dailyBudgetSatang: scenario.dailyBudgetSatang,
          bufferSatang: scenario.bufferSatang,
          debtExtraSatang: scenario.debtExtraSatang,
          attentionCount: scenario.attentionCount,
          changedCategoryCount: scenario.changedCategoryCount,
        },
      })),
      items: scenarios.flatMap((scenario) =>
        scenario.items.map((item) => ({
          month_key: safeMonth,
          scenario_key: scenario.id,
          category_id: item.categoryId,
          behavior: item.behavior,
          baseline_spend_satang: item.baselineSpendSatang,
          recent_spend_satang: item.recentSpendSatang,
          current_pace_satang: item.currentPaceSatang,
          volatility_score: item.volatilityScore,
          recommended_limit_satang: item.recommendedLimitSatang,
          delta_satang: item.deltaSatang,
          confidence_score: item.confidenceScore,
          reason_codes: item.reasonCodes,
          locked_by_user: item.lockedByUser === true,
          decision_status: cleanText(item.decisionStatus, "pending"),
          applied_limit_satang: item.currentLimitSatang,
          locked_limit_satang: item.lockedLimitSatang,
          metadata: {
            label: item.name,
            projectedMonthEndSatang: item.projectedMonthEndSatang,
            currentSpentSatang: item.currentSpentSatang,
          },
        })),
      ),
    },
  };
}

export function buildPlannerDecisionSummary(monthlyPlan, scenarioKey = "baseline") {
  const scenario = Array.isArray(monthlyPlan?.scenarios)
    ? monthlyPlan.scenarios.find((entry) => entry.id === scenarioKey) || monthlyPlan.scenarios[0] || null
    : null;
  if (!scenario) {
    return {
      scenarioKey,
      confidenceScore: 0,
      attentionCount: 0,
      acceptedCount: 0,
      dismissedCount: 0,
      lockedCount: 0,
      tone: "default",
      title: "ยังไม่มีแผนรายเดือน",
      copy: "เพิ่มข้อมูลรายรับและหมวดใช้จ่ายก่อนเพื่อให้ Planner สร้างคำแนะนำได้",
    };
  }

  const acceptedCount = scenario.items.filter((item) => item.decisionStatus === "accepted").length;
  const dismissedCount = scenario.items.filter((item) => item.decisionStatus === "dismissed").length;
  const lockedCount = scenario.items.filter((item) => item.lockedByUser).length;
  const tone = scenario.shortfallSatang > 0 ? "danger" : scenario.attentionCount > 0 ? "warning" : "success";
  const title = scenario.shortfallSatang > 0
    ? `แผน ${scenario.label} ยังเกินกรอบ`
    : scenario.attentionCount > 0
      ? `แผน ${scenario.label} ยังมีหมวดที่ต้องตัดสินใจ`
      : `แผน ${scenario.label} พร้อมใช้`;
  const copy = scenario.shortfallSatang > 0
    ? `ยังต้องลดงบอีก ${(scenario.shortfallSatang / 100).toFixed(2)} บาท หรือปรับรายรับ/เงินออมเพื่อให้แผนสมดุล`
    : scenario.attentionCount > 0
      ? `มี ${scenario.attentionCount} หมวดที่ควรยืนยัน พร้อมงบเฉลี่ยต่อวัน ${(scenario.dailyBudgetSatang / 100).toFixed(2)} บาท`
      : `แผนนี้เหลือ ${(((scenario.bufferSatang || scenario.debtExtraSatang) || 0) / 100).toFixed(2)} บาทสำหรับ ${scenario.metadata?.debtStrategyMode === "paydown" ? "โปะหนี้เพิ่ม" : "buffer"}`;

  return {
    scenarioKey: scenario.id,
    confidenceScore: scenario.confidenceScore,
    attentionCount: scenario.attentionCount,
    acceptedCount,
    dismissedCount,
    lockedCount,
    tone,
    title,
    copy,
    recommendedExpenseSatang: scenario.recommendedExpenseSatang,
    dailyBudgetSatang: scenario.dailyBudgetSatang,
    bufferSatang: scenario.bufferSatang,
    debtExtraSatang: scenario.debtExtraSatang,
    shortfallSatang: scenario.shortfallSatang,
    changedCategoryCount: scenario.changedCategoryCount,
  };
}

export function getActivePlannerScenarioKey(monthlyPlan, fallback = "baseline") {
  const scenarios = Array.isArray(monthlyPlan?.scenarios) ? monthlyPlan.scenarios : [];
  if (!scenarios.length) return fallback;
  return (
    scenarios.find((entry) => entry.status === "applied")?.id ||
    scenarios.find((entry) => entry.id === fallback)?.id ||
    scenarios[0]?.id ||
    fallback
  );
}

export function buildBudgetPlanSnapshotCompat({
  legacySnapshot,
  plannerMonthlyPlan,
  scenarioKey = "baseline",
} = {}) {
  if (!legacySnapshot || !Array.isArray(plannerMonthlyPlan?.scenarios)) return legacySnapshot;
  const scenario =
    plannerMonthlyPlan.scenarios.find((entry) => entry.id === scenarioKey) ||
    plannerMonthlyPlan.scenarios.find((entry) => entry.id === "baseline") ||
    plannerMonthlyPlan.scenarios[0] ||
    null;
  if (!scenario) return legacySnapshot;

  const recommendationByCategoryId = new Map(
    (Array.isArray(scenario.items) ? scenario.items : []).map((item) => [item.categoryId, item]),
  );
  const categoryPlans = (Array.isArray(legacySnapshot.categoryPlans) ? legacySnapshot.categoryPlans : []).map((plan) => {
    const recommendation = recommendationByCategoryId.get(plan.categoryId) || null;
    if (!recommendation) return plan;
    return {
      ...plan,
      behavior: recommendation.behavior,
      suggestedLimitSatang: recommendation.recommendedLimitSatang,
      recommendedLimitSatang: recommendation.recommendedLimitSatang,
      recommendedDeltaSatang: recommendation.deltaSatang,
      baselineSpendSatang: recommendation.baselineSpendSatang,
      recentSpendSatang: recommendation.recentSpendSatang,
      currentPaceSatang: recommendation.currentPaceSatang,
      projectedMonthEndSatang: recommendation.projectedMonthEndSatang,
      confidenceScore: recommendation.confidenceScore,
      reasonCodes: recommendation.reasonCodes,
      reasonLabels: recommendation.reasonLabels,
      lockedByUser: recommendation.lockedByUser,
      lockedLimitSatang: recommendation.lockedLimitSatang,
      decisionStatus: recommendation.decisionStatus,
      needsAttention: recommendation.needsAttention,
      currentLimitSatang: recommendation.currentLimitSatang,
    };
  });

  return {
    ...legacySnapshot,
    plannerScenarioKey: scenario.id,
    plannerScenarios: plannerMonthlyPlan.scenarios.map((entry) => ({
      id: entry.id,
      label: entry.label,
      recommendedExpenseSatang: entry.recommendedExpenseSatang,
      dailyBudgetSatang: entry.dailyBudgetSatang,
      bufferSatang: entry.bufferSatang,
      debtExtraSatang: entry.debtExtraSatang,
      shortfallSatang: entry.shortfallSatang,
      confidenceScore: entry.confidenceScore,
      attentionCount: entry.attentionCount,
      changedCategoryCount: entry.changedCategoryCount,
    })),
    plannerConfidenceScore: scenario.confidenceScore,
    plannerAttentionCount: scenario.attentionCount,
    suggestedExpenseBudgetSatang: scenario.recommendedExpenseSatang,
    suggestedDailyBudgetSatang: scenario.dailyBudgetSatang,
    suggestedShortfallSatang: scenario.shortfallSatang,
    suggestedBufferSatang: scenario.bufferSatang,
    suggestedDebtExtraSatang: scenario.debtExtraSatang,
    categoryPlans,
  };
}

export function buildBudgetHintCompat({
  baseHint,
  plannerMonthlyPlan,
  categories,
  categoryId,
  scenarioKey = "baseline",
} = {}) {
  if (!baseHint || !plannerMonthlyPlan || !categoryId) return baseHint;
  const categoryMap = new Map(
    [...(Array.isArray(categories?.expense) ? categories.expense : []), ...(Array.isArray(categories?.income) ? categories.income : [])]
      .map((category) => [cleanText(category?.id), category]),
  );
  const scenario =
    plannerMonthlyPlan.scenarios.find((entry) => entry.id === scenarioKey) ||
    plannerMonthlyPlan.scenarios.find((entry) => entry.id === "baseline") ||
    plannerMonthlyPlan.scenarios[0] ||
    null;
  if (!scenario) return baseHint;
  const rootCategoryId = getRootCategoryId(categoryId, categoryMap);
  const recommendation =
    scenario.items.find((item) => item.categoryId === categoryId) ||
    scenario.items.find((item) => item.categoryId === rootCategoryId) ||
    null;
  if (!recommendation) return baseHint;

  return {
    ...baseHint,
    planner: {
      scenarioKey: scenario.id,
      recommendedLimitSatang: recommendation.recommendedLimitSatang,
      currentLimitSatang: recommendation.currentLimitSatang,
      deltaSatang: recommendation.deltaSatang,
      confidenceScore: recommendation.confidenceScore,
      reasonCodes: recommendation.reasonCodes,
      reasonLabels: recommendation.reasonLabels,
      needsAttention: recommendation.needsAttention,
      lockedByUser: recommendation.lockedByUser,
      decisionStatus: recommendation.decisionStatus,
    },
  };
}
