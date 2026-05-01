import { ensureSatangInt } from "../../utils/money.js";
import {
  selectBudgetVsActual,
  selectExpenseByCategory,
  selectExpenseByParentCategory,
  selectIncomeVsExpense,
  toSelectorMonthKey,
} from "./reportSelectors.js";

export const BUDGET_TOTAL_ID = "__TOTAL__";
export const BUDGET_DAILY_ID = "__DAILY__";

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  return String(value ?? "").trim();
}

function budgetLimitSatang(budget) {
  return Math.max(0, ensureSatangInt(budget?.limit ?? budget?.limitSatang ?? budget?.limit_satang, 0));
}

export function selectBudgetSummary(transactions = [], budgets = [], categories = [], monthKey = "") {
  const month = toSelectorMonthKey(monthKey || new Date());
  const rows = selectBudgetVsActual(transactions, budgets, categories, month);
  const totalBudget = rows.find((row) => row.categoryId === BUDGET_TOTAL_ID);
  const categoryBudgetLimit = rows
    .filter((row) => row.categoryId !== BUDGET_TOTAL_ID && row.categoryId !== BUDGET_DAILY_ID)
    .reduce((sum, row) => sum + row.limit, 0);
  const totalLimit = totalBudget?.limit || categoryBudgetLimit;
  const actual = selectIncomeVsExpense(transactions, { monthKey: month }).expense;
  const overRows = rows
    .filter((row) => row.categoryId !== BUDGET_TOTAL_ID && row.categoryId !== BUDGET_DAILY_ID && row.over)
    .sort((a, b) => b.actual - b.limit - (a.actual - a.limit));

  return {
    monthKey: month,
    totalLimitSatang: totalLimit,
    actualSatang: actual,
    remainingSatang: totalLimit > 0 ? totalLimit - actual : 0,
    percent: totalLimit > 0 ? Math.round((actual * 100) / totalLimit) : 0,
    overBudget: totalLimit > 0 && actual > totalLimit,
    topOverBudget: overRows[0] || null,
    rows,
  };
}

export function selectCategoryBudgetActuals(transactions = [], budgets = [], categories = [], monthKey = "") {
  const month = toSelectorMonthKey(monthKey || new Date());
  const expenseByCategory = selectExpenseByCategory(transactions, { monthKey: month });
  const expenseByParent = selectExpenseByParentCategory(transactions, categories, { monthKey: month });
  const categoryById = new Map(
    (Array.isArray(categories)
      ? categories
      : [...listOf(categories?.expense), ...listOf(categories?.income)]).map((category) => [clean(category?.id), category]),
  );

  return listOf(budgets)
    .filter((budget) => clean(budget?.month) === month)
    .filter((budget) => ![BUDGET_TOTAL_ID, BUDGET_DAILY_ID].includes(clean(budget?.categoryId)))
    .map((budget) => {
      const categoryId = clean(budget.categoryId);
      const isChildCategory = !!clean(categoryById.get(categoryId)?.parentId);
      const directActual = expenseByCategory.get(categoryId) || 0;
      const rollupActual = expenseByParent.get(categoryId) || 0;
      const actual = isChildCategory ? directActual : rollupActual || directActual;
      const limit = budgetLimitSatang(budget);
      return {
        budget,
        categoryId,
        limitSatang: limit,
        actualSatang: actual,
        remainingSatang: limit - actual,
        overBudget: limit > 0 && actual > limit,
      };
    });
}

export default {
  BUDGET_DAILY_ID,
  BUDGET_TOTAL_ID,
  selectBudgetSummary,
  selectCategoryBudgetActuals,
};
