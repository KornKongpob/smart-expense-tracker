import { calcAccountBalance, calcTotals, getBudget, toMonthKey } from "../../store/selectors.js";
import { isCreditAccount } from "../../utils/accountMatch.js";
import { ensureSatangInt } from "../../utils/money.js";
import { sumCategoryBudgetsForMonth, sumExpenseForDate } from "../../utils/transaction.js";
import { advanceRecurringDate, getRecurringAnchorDay } from "../../utils/recurring.js";
import { selectCreditCardOutstanding } from "../../store/selectors/accountSelectors.js";

const BUDGET_TOTAL_ID = "__TOTAL__";
const BUDGET_DAILY_ID = "__DAILY__";
const MS_PER_DAY = 86_400_000;

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function toInt(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.trunc(number);
}

function clampSatang(value, fallback = 0) {
  return Math.max(0, ensureSatangInt(value, fallback));
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function isoDateLocal(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const safe = Number.isFinite(date.getTime()) ? date : new Date();
  const year = safe.getFullYear();
  const month = String(safe.getMonth() + 1).padStart(2, "0");
  const day = String(safe.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromIso(isoDate) {
  const text = String(isoDate || "").slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addDaysIso(isoDate, days) {
  const date = dateFromIso(isoDate);
  date.setDate(date.getDate() + toInt(days, 0));
  return isoDateLocal(date);
}

function monthEndIso(monthKey) {
  const text = String(monthKey || "").slice(0, 7);
  const match = text.match(/^(\d{4})-(\d{2})$/);
  if (!match) return isoDateLocal();
  const end = new Date(Number(match[1]), Number(match[2]), 0);
  return isoDateLocal(end);
}

function normalizeToday(value) {
  if (value instanceof Date) return isoDateLocal(value);
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return isoDateLocal(new Date());
}

function daysBetweenInclusive(startIso, endIso) {
  const start = dateFromIso(startIso);
  const end = dateFromIso(endIso);
  const diff = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY);
  return Math.max(1, diff + 1);
}

function amountOf(value) {
  return Math.abs(ensureSatangInt(value, 0));
}

function recurringType(recurring) {
  return String(recurring?.type || recurring?.txType || "").toLowerCase().trim() === "income" ? "income" : "expense";
}

function recurringLabel(recurring) {
  return String(recurring?.note || recurring?.label || recurring?.name || "Recurring").trim() || "Recurring";
}

function nextRecurringDateOnOrAfter(recurring, startIso) {
  const startDate = String(recurring?.startDate || recurring?.start_date || startIso || "").slice(0, 10);
  const lastGenerated = String(recurring?.lastGenerated || recurring?.last_generated_date || "").slice(0, 10);
  const anchorDay = getRecurringAnchorDay(recurring);
  const frequency = String(recurring?.frequency || "monthly").toLowerCase().trim() || "monthly";
  const interval = Math.max(1, Math.min(120, toInt(recurring?.interval ?? recurring?.interval_count, 1)));

  let due = lastGenerated
    ? advanceRecurringDate(dateFromIso(lastGenerated), frequency, interval, anchorDay)
    : dateFromIso(startDate || startIso);

  let guard = 0;
  while (isoDateLocal(due) < startIso && guard < 500) {
    due = advanceRecurringDate(due, frequency, interval, anchorDay);
    guard += 1;
  }

  return guard >= 500 ? null : due;
}

function buildRecurringEvents(state, { startDate, endDate } = {}) {
  const events = [];
  const startIso = normalizeToday(startDate);
  const endIso = normalizeToday(endDate || startIso);

  for (const recurring of listOf(state?.recurring)) {
    if (!recurring || recurring.enabled === false) continue;

    const amount = amountOf(recurring.amount ?? recurring.amountSatang ?? recurring.amount_satang);
    if (!amount) continue;

    const type = recurringType(recurring);
    const frequency = String(recurring.frequency || "monthly").toLowerCase().trim() || "monthly";
    const interval = Math.max(1, Math.min(120, toInt(recurring.interval ?? recurring.interval_count, 1)));
    const anchorDay = getRecurringAnchorDay(recurring);
    let due = nextRecurringDateOnOrAfter(recurring, startIso);
    let guard = 0;

    while (due && isoDateLocal(due) <= endIso && guard < 500) {
      const date = isoDateLocal(due);
      if (date >= startIso) {
        events.push({
          date,
          type,
          amount: type === "income" ? amount : -amount,
          label: recurringLabel(recurring),
          source: "recurring",
        });
      }
      due = advanceRecurringDate(due, frequency, interval, anchorDay);
      guard += 1;
    }
  }

  return events.sort((left, right) => {
    const byDate = String(left.date).localeCompare(String(right.date));
    if (byDate !== 0) return byDate;
    const byType = String(left.type).localeCompare(String(right.type));
    if (byType !== 0) return byType;
    return String(left.label).localeCompare(String(right.label));
  });
}

function sumSpendableBalance(state) {
  const accounts = listOf(state?.accounts);
  const transactions = listOf(state?.transactions);
  return accounts.reduce((sum, account) => {
    if (!account || isCreditAccount(account)) return sum;
    return sum + ensureSatangInt(calcAccountBalance(accounts, transactions, account.id), 0);
  }, 0);
}

function monthlyBudgetLimitFor(state, monthKey) {
  const budgets = listOf(state?.budgets);
  const totalBudget = getBudget(budgets, monthKey, BUDGET_TOTAL_ID);
  const totalLimit = clampSatang(totalBudget?.limit);
  if (totalLimit > 0) return totalLimit;
  return sumCategoryBudgetsForMonth(budgets, monthKey);
}

function dailyBudgetLimitFor(state, monthKey) {
  const dailyBudget = getBudget(listOf(state?.budgets), monthKey, BUDGET_DAILY_ID);
  return clampSatang(dailyBudget?.limit);
}

function monthTransactions(state, monthKey) {
  return listOf(state?.transactions).filter((tx) => String(tx?.date || "").slice(0, 7) === monthKey);
}

function sumEvents(events, type) {
  return events.reduce((sum, event) => {
    if (event?.type !== type) return sum;
    return sum + Math.abs(ensureSatangInt(event.amount, 0));
  }, 0);
}

export function calculateMonthlyPlan(state = {}, options = {}) {
  const today = normalizeToday(options.today);
  const monthKey = toMonthKey(today);
  const endOfMonth = monthEndIso(monthKey);
  const daysRemaining = daysBetweenInclusive(today, endOfMonth);
  const totals = calcTotals(monthTransactions(state, monthKey));
  const recurringEvents = buildRecurringEvents(state, { startDate: today, endDate: endOfMonth });

  const recurringIncomeRemaining = sumEvents(recurringEvents, "income");
  const recurringExpenseRemaining = sumEvents(recurringEvents, "expense");
  const monthlyBudgetLimit = monthlyBudgetLimitFor(state, monthKey);
  const monthlyBudgetRemaining = monthlyBudgetLimit
    ? Math.max(0, monthlyBudgetLimit - clampSatang(totals.expense) - recurringExpenseRemaining)
    : 0;

  const spendableBalance = sumSpendableBalance(state);
  const cashAfterRecurring = spendableBalance + recurringIncomeRemaining - recurringExpenseRemaining;
  const availableThisMonth = Math.max(
    0,
    monthlyBudgetLimit ? Math.min(monthlyBudgetRemaining, cashAfterRecurring) : cashAfterRecurring,
  );
  const safeToSpendPerDay = Math.floor(availableThisMonth / Math.max(1, daysRemaining));
  const dailyBudgetLimit = dailyBudgetLimitFor(state, monthKey);
  const todaySpent = sumExpenseForDate(listOf(state?.transactions), today);
  const dailyBudgetRemaining = dailyBudgetLimit ? Math.max(0, dailyBudgetLimit - todaySpent) : safeToSpendPerDay;
  const safeToSpendToday = Math.max(0, Math.min(safeToSpendPerDay, dailyBudgetRemaining));

  const warnings = [];
  if (!listOf(state?.accounts).length) warnings.push("missing_accounts");
  if (!monthlyBudgetLimit) warnings.push("missing_monthly_budget");
  if (availableThisMonth <= 0) warnings.push("no_safe_spend_available");
  if (spendableBalance < 0) warnings.push("negative_spendable_balance");

  return {
    monthKey,
    daysRemaining,
    incomeThisMonth: clampSatang(totals.income),
    expenseThisMonth: clampSatang(totals.expense),
    recurringIncomeRemaining,
    recurringExpenseRemaining,
    monthlyBudgetLimit,
    monthlyBudgetRemaining,
    availableThisMonth,
    safeToSpendToday,
    safeToSpendPerDay,
    warnings,
  };
}

export function forecastCashFlow(state = {}, options = {}) {
  const startDate = normalizeToday(options.today);
  const days = Math.max(1, Math.min(366, toInt(options.days, 30)));
  const endDate = addDaysIso(startDate, days - 1);
  const startingBalance = sumSpendableBalance(state);
  const events = buildRecurringEvents(state, { startDate, endDate });
  const eventsByDate = new Map();

  for (const event of events) {
    eventsByDate.set(event.date, (eventsByDate.get(event.date) || 0) + ensureSatangInt(event.amount, 0));
  }

  const daily = [];
  let balance = startingBalance;
  let lowestBalance = balance;
  let lowestBalanceDate = startDate;

  for (let index = 0; index < days; index += 1) {
    const date = addDaysIso(startDate, index);
    balance += ensureSatangInt(eventsByDate.get(date), 0);
    daily.push({ date, balance });
    if (balance < lowestBalance) {
      lowestBalance = balance;
      lowestBalanceDate = date;
    }
  }

  return {
    startDate,
    endDate,
    startingBalance,
    projectedEndingBalance: daily.length ? daily[daily.length - 1].balance : startingBalance,
    lowestBalance,
    lowestBalanceDate,
    events,
    daily,
  };
}

function scoreToGrade(score) {
  if (score >= 85) return "great";
  if (score >= 70) return "good";
  if (score >= 40) return "fair";
  return "poor";
}

export function calculateMoneyHealthScore(state = {}, options = {}) {
  const plan = calculateMonthlyPlan(state, options);
  const forecast = forecastCashFlow(state, { ...options, days: options.days || 30 });
  const income = Math.max(0, plan.incomeThisMonth + plan.recurringIncomeRemaining);
  const expense = Math.max(0, plan.expenseThisMonth + plan.recurringExpenseRemaining);
  const savingsRate = income > 0 ? (income - expense) / income : plan.expenseThisMonth > 0 ? -1 : 0;
  const creditDebt = selectCreditCardOutstanding(listOf(state?.accounts), listOf(state?.transactions));

  const budgetScore = plan.monthlyBudgetLimit
    ? plan.monthlyBudgetRemaining > 0
      ? Math.min(100, 70 + Math.round((plan.monthlyBudgetRemaining / plan.monthlyBudgetLimit) * 30))
      : 20
    : 50;
  const cashFlowScore = forecast.lowestBalance < 0
    ? 20
    : forecast.lowestBalance === 0
      ? 50
      : forecast.lowestBalance < plan.safeToSpendPerDay * 3
        ? 65
        : 90;
  const savingsScore = savingsRate >= 0.3
    ? 100
    : savingsRate >= 0.1
      ? 80
      : savingsRate >= 0
        ? 60
        : 25;
  const debtRatio = income > 0 ? creditDebt / income : creditDebt > 0 ? 3 : 0;
  const debtScore = creditDebt <= 0
    ? 100
    : debtRatio <= 0.5
      ? 80
      : debtRatio <= 1
        ? 60
        : debtRatio <= 2
          ? 40
          : 20;

  const factors = [
    {
      id: "budget",
      label: "Budget",
      score: clampScore(budgetScore),
      message: plan.monthlyBudgetLimit ? "Monthly spending is compared with the active budget." : "Set a monthly budget for a clearer plan.",
    },
    {
      id: "cash_flow",
      label: "Cash flow",
      score: clampScore(cashFlowScore),
      message: forecast.lowestBalance < 0 ? "Projected balance drops below zero." : "Projected balance stays non-negative.",
    },
    {
      id: "savings_rate",
      label: "Savings rate",
      score: clampScore(savingsScore),
      message: income > 0 ? "Income and planned spending leave a monthly buffer." : "Income data is limited this month.",
    },
    {
      id: "debt_load",
      label: "Debt load",
      score: clampScore(debtScore),
      message: creditDebt > 0 ? "Credit-card balances reduce financial flexibility." : "No credit-card debt detected.",
    },
  ];

  const score = clampScore(factors.reduce((sum, factor) => sum + factor.score, 0) / factors.length);
  return {
    score,
    grade: scoreToGrade(score),
    factors,
  };
}

export function generateMoneyPlanRecommendations(state = {}, options = {}) {
  const plan = calculateMonthlyPlan(state, options);
  const forecast = forecastCashFlow(state, { ...options, days: options.days || 30 });
  const health = calculateMoneyHealthScore(state, options);
  const recommendations = [];

  if (!listOf(state?.accounts).length) {
    recommendations.push({
      id: "setup-accounts",
      severity: "info",
      title: "Add accounts",
      body: "Add cash, bank, or wallet accounts so the plan can estimate spendable balance.",
      actionLabel: "Accounts",
      actionView: "accounts",
    });
  }

  if (!plan.monthlyBudgetLimit) {
    recommendations.push({
      id: "setup-budget",
      severity: "warning",
      title: "Set a monthly budget",
      body: "A monthly budget lets the plan calculate safer daily spending.",
      actionLabel: "Budgets",
      actionView: "budgets",
    });
  }

  if (forecast.lowestBalance < 0) {
    recommendations.push({
      id: "cash-flow-risk",
      severity: "warning",
      title: "Cash flow may go negative",
      body: "Upcoming recurring items are projected to push spendable cash below zero.",
      actionLabel: "Review recurring",
      actionView: "recurring",
    });
  }

  if (plan.availableThisMonth <= 0 && plan.monthlyBudgetLimit > 0) {
    recommendations.push({
      id: "pause-discretionary-spend",
      severity: "warning",
      title: "Pause flexible spending",
      body: "The remaining budget is reserved by current spending and upcoming recurring expenses.",
      actionLabel: "Dashboard",
      actionView: "dashboard",
    });
  } else if (plan.safeToSpendPerDay > 0) {
    recommendations.push({
      id: "daily-safe-spend",
      severity: "info",
      title: "Use the daily safe-spend number",
      body: "Keep discretionary spending near the daily safe amount to stay inside this month plan.",
      actionLabel: "Dashboard",
      actionView: "dashboard",
    });
  }

  if (health.grade === "great") {
    recommendations.push({
      id: "money-health-great",
      severity: "success",
      title: "Money health looks strong",
      body: "Projected cash flow, budget room, and debt load are all in a healthy range.",
      actionLabel: "Dashboard",
      actionView: "dashboard",
    });
  }

  const severityOrder = { warning: 0, info: 1, success: 2 };
  return recommendations
    .sort((left, right) => {
      const bySeverity = (severityOrder[left.severity] ?? 9) - (severityOrder[right.severity] ?? 9);
      if (bySeverity !== 0) return bySeverity;
      return String(left.id).localeCompare(String(right.id));
    })
    .slice(0, 5);
}

export default {
  calculateMonthlyPlan,
  forecastCashFlow,
  calculateMoneyHealthScore,
  generateMoneyPlanRecommendations,
};
