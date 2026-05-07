import {
  calculateMonthlyPlan,
  forecastCashFlow,
} from "../money-plan/moneyPlan.js";
import {
  calculateMonthlyNeeded,
  normalizeGoalForUi,
} from "../goals/goalCalculators.js";
import {
  calculateDebtOverview,
  getDebtAccounts,
} from "../debts/debtPayoff.js";
import { summarizeBills } from "../bills/detectBills.js";
import { generateInsights } from "../../utils/aiInsights.js";
import { ensureSatangInt } from "../../utils/money.js";
import { parseDateSafe, toISODate } from "../../utils/format.js";

const SEVERITY_RANK = Object.freeze({
  critical: 0,
  warning: 1,
  info: 2,
  success: 3,
});

const VALID_SEVERITIES = new Set(Object.keys(SEVERITY_RANK));
const VALID_DOMAINS = new Set([
  "cashflow",
  "budget",
  "goal",
  "debt",
  "bill",
  "subscription",
  "setup",
]);

const BUDGET_TOTAL_ID = "__TOTAL__";
const MS_PER_DAY = 86_400_000;

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function toInt(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.trunc(number);
}

function readSatang(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const number = ensureSatangInt(value, NaN);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function normalizeToday(value) {
  if (value instanceof Date) return toISODate(value);
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return toISODate(new Date());
}

function monthKeyOf(isoDate) {
  return String(isoDate || "").slice(0, 7);
}

function daysBetween(startIso, endIso) {
  const start = parseDateSafe(startIso);
  const end = parseDateSafe(endIso);
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

function monthEndIso(monthKey) {
  const [yearText, monthText] = String(monthKey || "").split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return toISODate(new Date());
  return toISODate(new Date(year, month, 0));
}

function formatSatang(value) {
  const amount = ensureSatangInt(value, 0);
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const baht = Math.floor(abs / 100);
  const satang = String(abs % 100).padStart(2, "0");
  return `${sign}฿${baht.toLocaleString("th-TH")}.${satang}`;
}

function normalizeAccount(account) {
  const source = account && typeof account === "object" ? account : {};
  const id = cleanText(source.id ?? source.accountId ?? source.account_id);
  return {
    ...source,
    id,
    name: cleanText(source.name || source.accountName || "บัญชี"),
    type: cleanText(source.type || source.kind || "cash").toLowerCase(),
    openingBalance: readSatang(
      source.openingBalance,
      source.openingBalanceSatang,
      source.opening_balance_satang,
      source.balance,
      source.balance_satang,
    ),
    creditLimit: Math.max(0, readSatang(source.creditLimit, source.creditLimitSatang, source.credit_limit_satang, source.limit)),
    statementDay: toInt(source.statementDay ?? source.statement_day, 0),
    dueDay: toInt(source.dueDay ?? source.due_day ?? source.paymentDueDay, 0),
    apr: source.apr ?? source.aprPct ?? source.aprPercent,
    aprBps: source.aprBps ?? source.apr_bps,
    minimumPayment: source.minimumPayment ?? source.minimumPaymentSatang ?? source.minimum_payment_satang,
    extraPayment: source.extraPayment ?? source.extraPaymentSatang ?? source.extra_payment_satang,
  };
}

function normalizeTransaction(tx) {
  const source = tx && typeof tx === "object" ? tx : {};
  const type = cleanText(source.type || source.kind || source.txType || source.tx_type || "expense").toLowerCase();
  const categoryId = cleanText(source.categoryId ?? source.category_id ?? source.category);
  const accountId = cleanText(source.accountId ?? source.account_id ?? source.from_account_id ?? source.fromAccountId);

  return {
    ...source,
    id: source.id != null ? String(source.id) : "",
    type,
    kind: type,
    amount: Math.abs(readSatang(source.amount, source.amountSatang, source.amount_satang)),
    accountId,
    account_id: accountId,
    category: categoryId,
    categoryId,
    category_id: categoryId,
    merchant: cleanText(source.merchant || source.payee || source.counterparty),
    note: cleanText(source.note || source.description || source.memo),
    date: cleanText(source.date || source.transactionDate || source.postedDate).slice(0, 10),
    isTransfer: source.isTransfer === true || source.is_transfer === true || type === "transfer",
    isSplitParent: source.isSplitParent === true || source.is_split_parent === true || String(source.splitRole || source.split_role || "") === "parent",
    isSplitChild: source.isSplitChild === true || source.is_split_child === true || String(source.splitRole || source.split_role || "") === "child",
  };
}

function normalizeBudget(row) {
  const source = row && typeof row === "object" ? row : {};
  const categoryId = cleanText(source.categoryId ?? source.category_id ?? source.category ?? BUDGET_TOTAL_ID);
  return {
    ...source,
    month: cleanText(source.month ?? source.monthKey ?? source.month_key),
    categoryId,
    category_id: categoryId,
    limit: Math.max(0, readSatang(source.limit, source.limitSatang, source.limit_satang)),
  };
}

function normalizeRecurringRule(rule) {
  const source = rule && typeof rule === "object" ? rule : {};
  const kind = cleanText(source.type || source.kind || source.txType || "expense").toLowerCase();
  const accountId = cleanText(source.accountId ?? source.account_id);
  const categoryId = cleanText(source.categoryId ?? source.category_id ?? source.category);
  return {
    ...source,
    id: source.id != null ? String(source.id) : "",
    type: kind,
    kind,
    amount: Math.abs(readSatang(source.amount, source.amountSatang, source.amount_satang)),
    accountId,
    account_id: accountId,
    categoryId,
    category_id: categoryId,
    merchant: cleanText(source.merchant),
    note: cleanText(source.note || source.label || source.name || "Recurring"),
    frequency: cleanText(source.frequency || "monthly").toLowerCase(),
    interval: Math.max(1, toInt(source.interval ?? source.interval_count, 1)),
    startDate: cleanText(source.startDate ?? source.start_date).slice(0, 10),
    start_date: cleanText(source.start_date ?? source.startDate).slice(0, 10),
    lastGenerated: cleanText(source.lastGenerated ?? source.last_generated_date).slice(0, 10),
    last_generated_date: cleanText(source.last_generated_date ?? source.lastGenerated).slice(0, 10),
    enabled: source.enabled !== false,
  };
}

function mergeById(...groups) {
  const out = [];
  const seen = new Set();
  for (const group of groups) {
    for (const item of listOf(group)) {
      const id = cleanText(item?.id);
      const key = id || `idx:${out.length}`;
      if (id && seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function normalizeAssistantState(state = {}) {
  const source = state && typeof state === "object" ? state : {};
  const transactions = mergeById(source.transactions, source.recentTransactions, source.planningTransactions)
    .map(normalizeTransaction)
    .filter((tx) => tx.date && tx.amount > 0);
  const recurring = mergeById(source.recurring, source.recurringRules)
    .map(normalizeRecurringRule)
    .filter((rule) => rule.amount > 0);
  const goals = mergeById(source.goals, source.financialGoals).map((goal, index) => normalizeGoalForUi(goal, index));

  return {
    ...source,
    accounts: listOf(source.accounts).map(normalizeAccount).filter((account) => account.id),
    transactions,
    budgets: mergeById(source.budgets, source.budgetRows).map(normalizeBudget).filter((budget) => budget.month && budget.limit > 0),
    recurring,
    goals,
    categories: source.categories || { expense: [], income: [] },
  };
}

function recommendation(input) {
  const severity = VALID_SEVERITIES.has(input.severity) ? input.severity : "info";
  const domain = VALID_DOMAINS.has(input.domain) ? input.domain : "setup";
  return {
    id: cleanText(input.id, `${domain}-${severity}`),
    domain,
    severity,
    title: cleanText(input.title, "คำแนะนำ"),
    body: cleanText(input.body),
    actionLabel: cleanText(input.actionLabel),
    actionView: cleanText(input.actionView),
    actionPayload: input.actionPayload ?? null,
    priority: toInt(input.priority, 100),
  };
}

function addUnique(items, item) {
  const next = recommendation(item);
  if (!next.id || items.some((existing) => existing.id === next.id)) return;
  items.push(next);
}

function activeRecurringCount(state) {
  return listOf(state?.recurring).filter((rule) => rule?.enabled !== false).length;
}

function creditAccountCount(state) {
  return listOf(state?.accounts).filter((account) => String(account?.type || "").toLowerCase() === "credit").length;
}

function currentMonthBudgetUsage(plan) {
  if (!plan.monthlyBudgetLimit) return 0;
  return plan.expenseThisMonth / plan.monthlyBudgetLimit;
}

function isBeforeLastWeek(todayIso) {
  const monthKey = monthKeyOf(todayIso);
  return daysBetween(todayIso, monthEndIso(monthKey)) + 1 > 7;
}

function goalTitle(goal) {
  return cleanText(goal?.name, "เป้าหมายการออม");
}

function billTitle(item) {
  return cleanText(item?.merchant || item?.label || item?.name, "บิล");
}

function buildAiInsightRecommendations(state, plan) {
  const insights = generateInsights(state.transactions, state.categories, { currentMonth: plan.monthKey });
  return listOf(insights)
    .filter((item) => ["spending_up", "category_spike", "low_savings", "anomaly"].includes(String(item?.type || "")))
    .slice(0, 2)
    .map((item, index) =>
      recommendation({
        id: `insight-${cleanText(item.type, index)}`,
        domain: "budget",
        severity: item.severity === "warning" || item.severity === "success" ? item.severity : "info",
        title: cleanText(item.title, "มี pattern การใช้เงินที่ควรดู"),
        body: cleanText(item.body, "ลองเปิดรายการย้อนหลังเพื่อเช็ก pattern นี้"),
        actionLabel: "ดูรายการ",
        actionView: "transactions",
        actionPayload: { source: "aiInsights", type: item.type },
        priority: 85 + index,
      }),
    );
}

function sortRecommendations(items) {
  return listOf(items).slice().sort((left, right) => {
    const bySeverity = (SEVERITY_RANK[left.severity] ?? 99) - (SEVERITY_RANK[right.severity] ?? 99);
    if (bySeverity !== 0) return bySeverity;
    const byPriority = Number(left.priority || 0) - Number(right.priority || 0);
    if (byPriority !== 0) return byPriority;
    const byDomain = String(left.domain).localeCompare(String(right.domain));
    if (byDomain !== 0) return byDomain;
    return String(left.id).localeCompare(String(right.id));
  });
}

export function generateAssistantRecommendations(state = {}, options = {}) {
  const today = normalizeToday(options.today);
  const maxItems = Math.max(1, toInt(options.maxItems, 8));
  const normalizedState = normalizeAssistantState(state);
  const plan = calculateMonthlyPlan(normalizedState, { today });
  const forecast = forecastCashFlow(normalizedState, { today, days: 30 });
  const debtAccounts = getDebtAccounts(normalizedState, { today });
  const debtOverview = calculateDebtOverview(normalizedState, { today, debts: debtAccounts, dueSoonDays: 7 });
  const billsSummary = summarizeBills(normalizedState, { today, dueSoonDays: 7 });
  const items = [];

  if (forecast.lowestBalance < 0) {
    addUnique(items, {
      id: "cashflow-risk-30d",
      domain: "cashflow",
      severity: "critical",
      title: "เงินสดอาจติดลบใน 30 วัน",
      body: `คาดว่ายอดต่ำสุดจะอยู่ที่ ${formatSatang(forecast.lowestBalance)} วันที่ ${forecast.lowestBalanceDate} ลองกันเงินไว้ก่อนหรือเลื่อนรายจ่ายที่ไม่จำเป็น`,
      actionLabel: "ดูบิล",
      actionView: "bills",
      actionPayload: {
        lowestBalance: forecast.lowestBalance,
        lowestBalanceDate: forecast.lowestBalanceDate,
      },
      priority: 10,
    });
  }

  if (plan.safeToSpendPerDay <= 0) {
    addUnique(items, {
      id: "safe-to-spend-empty",
      domain: "cashflow",
      severity: "warning",
      title: "วันนี้ควรพักรายจ่ายยืดหยุ่น",
      body: "ยอดใช้ได้ต่อวันเหลือศูนย์หรือติดลบแล้ว ให้กันเงินไว้สำหรับบิลและรายการจำเป็นก่อน",
      actionLabel: "ดูภาพรวม",
      actionView: "dashboard",
      actionPayload: {
        safeToSpendPerDay: plan.safeToSpendPerDay,
        availableThisMonth: plan.availableThisMonth,
      },
      priority: 20,
    });
  } else {
    addUnique(items, {
      id: "safe-to-spend-positive",
      domain: "cashflow",
      severity: forecast.lowestBalance < 0 ? "info" : "success",
      title: "ยังมีกรอบใช้จ่ายต่อวัน",
      body: `ตอนนี้ใช้ได้ประมาณ ${formatSatang(plan.safeToSpendPerDay)} ต่อวัน ถ้าคุมใกล้เลขนี้ แผนเดือนนี้จะนิ่งขึ้น`,
      actionLabel: "ดูภาพรวม",
      actionView: "dashboard",
      actionPayload: {
        safeToSpendPerDay: plan.safeToSpendPerDay,
        availableThisMonth: plan.availableThisMonth,
      },
      priority: 70,
    });
  }

  if (plan.monthlyBudgetLimit > 0 && currentMonthBudgetUsage(plan) >= 0.9 && isBeforeLastWeek(today)) {
    addUnique(items, {
      id: "budget-used-early",
      domain: "budget",
      severity: "warning",
      title: "งบเดือนนี้ใช้เกิน 90% เร็วไป",
      body: `ใช้ไปแล้ว ${formatSatang(plan.expenseThisMonth)} จากงบ ${formatSatang(plan.monthlyBudgetLimit)} ทั้งที่ยังเหลือ ${plan.daysRemaining} วัน`,
      actionLabel: "ปรับงบ",
      actionView: "planner",
      actionPayload: {
        monthKey: plan.monthKey,
        usedPct: Math.round(currentMonthBudgetUsage(plan) * 100),
      },
      priority: 30,
    });
  }

  if (plan.monthlyBudgetLimit <= 0) {
    addUnique(items, {
      id: "setup-budget",
      domain: "setup",
      severity: "info",
      title: "ตั้งงบเดือนนี้",
      body: "ยังไม่มีงบรายเดือน ระบบจึงคำนวณกรอบใช้ต่อวันได้แบบระวังมากกว่าปกติ",
      actionLabel: "ตั้งงบ",
      actionView: "planner",
      actionPayload: { monthKey: plan.monthKey },
      priority: 60,
    });
  }

  const activeGoals = normalizedState.goals.filter((goal) => goal.status === "active");
  const completedGoals = normalizedState.goals.filter((goal) => goal.status === "completed");

  if (!normalizedState.goals.length) {
    addUnique(items, {
      id: "setup-goals",
      domain: "setup",
      severity: "info",
      title: "เพิ่มเป้าหมายการออม",
      body: "ตั้งเป้ากองทุนฉุกเฉิน ทริป หรือเงินก้อน เพื่อให้ผู้ช่วยช่วยกันเงินให้เห็นภาพ",
      actionLabel: "เพิ่มเป้าหมาย",
      actionView: "goals",
      actionPayload: null,
      priority: 62,
    });
  }

  for (const goal of activeGoals) {
    if (!goal.dueDate) continue;
    const monthlyNeeded = calculateMonthlyNeeded(goal, today);
    if (monthlyNeeded > plan.availableThisMonth) {
      addUnique(items, {
        id: `goal-hard-to-reach-${goal.id || goal.name}`,
        domain: "goal",
        severity: "warning",
        title: "เป้าหมายนี้อาจตึงเกินเดือนนี้",
        body: `${goalTitle(goal)} ต้องออมประมาณ ${formatSatang(monthlyNeeded)} ต่อเดือน แต่ตอนนี้เหลือใช้ปลอดภัย ${formatSatang(plan.availableThisMonth)}`,
        actionLabel: "ดูเป้าหมาย",
        actionView: "goals",
        actionPayload: { goalId: goal.id, monthlyNeeded },
        priority: 35 + Math.max(0, toInt(goal.priority, 1)),
      });
    }
  }

  if (completedGoals.length) {
    const goal = completedGoals[0];
    addUnique(items, {
      id: `goal-completed-${goal.id || goal.name}`,
      domain: "goal",
      severity: "success",
      title: "มีเป้าหมายสำเร็จแล้ว",
      body: `${goalTitle(goal)} ถึงยอดเป้าหมายแล้ว จะพักไว้หรือเริ่มเป้าหมายใหม่ก็ได้`,
      actionLabel: "ดูเป้าหมาย",
      actionView: "goals",
      actionPayload: { goalId: goal.id },
      priority: 80,
    });
  }

  if (creditAccountCount(normalizedState) > 0) {
    const highUtilization = debtOverview.highestUtilizationDebt;
    if (highUtilization?.utilizationPct > 80) {
      addUnique(items, {
        id: "debt-high-utilization",
        domain: "debt",
        severity: "warning",
        title: "วงเงินบัตรถูกใช้สูง",
        body: `${highUtilization.name} ใช้วงเงินไป ${highUtilization.utilizationPct}% แล้ว ควรลดก่อนรูดเพิ่ม`,
        actionLabel: "ดูแผนหนี้",
        actionView: "debts",
        actionPayload: { accountId: highUtilization.accountId, utilizationPct: highUtilization.utilizationPct },
        priority: 25,
      });
    }

    if (debtOverview.dueSoon.length) {
      const due = debtOverview.dueSoon[0];
      addUnique(items, {
        id: "debt-due-soon",
        domain: "debt",
        severity: "warning",
        title: "มีหนี้ใกล้ครบกำหนด",
        body: `${due.name} ครบกำหนด ${due.dueDate} เตรียมขั้นต่ำ ${formatSatang(due.minimumPayment)} ไว้ก่อน`,
        actionLabel: "ดูแผนหนี้",
        actionView: "debts",
        actionPayload: { accountId: due.accountId, dueDate: due.dueDate },
        priority: 28,
      });
    }

    const missingApr = debtAccounts.filter((debt) => debt.debtOwed > 0 && debt.aprMissing);
    if (missingApr.length) {
      addUnique(items, {
        id: "debt-missing-apr",
        domain: "debt",
        severity: "info",
        title: "เติม APR เพื่อให้แผนหนี้แม่นขึ้น",
        body: `มี ${missingApr.length} บัญชีที่ยังไม่มี APR ตอนนี้ประมาณดอกเบี้ยเป็น 0%`,
        actionLabel: "เติมข้อมูลหนี้",
        actionView: "debts",
        actionPayload: { accountIds: missingApr.map((debt) => debt.accountId) },
        priority: 64,
      });
    }
  }

  const billDueSoon = billsSummary.dueSoon.filter((bill) => bill.type !== "income");
  if (billDueSoon.length) {
    const bill = billDueSoon[0];
    addUnique(items, {
      id: "bill-due-soon",
      domain: bill.type === "subscription" ? "subscription" : "bill",
      severity: "warning",
      title: "มีบิลใกล้ตัดเงิน",
      body: `${billTitle(bill)} คาดว่าจะถึงรอบ ${bill.nextExpectedDate} ยอด ${formatSatang(bill.amount)}`,
      actionLabel: "ดูบิล",
      actionView: "bills",
      actionPayload: { billId: bill.id, nextExpectedDate: bill.nextExpectedDate },
      priority: 32,
    });
  }

  if (billsSummary.priceChanges.length) {
    const item = billsSummary.priceChanges[0];
    addUnique(items, {
      id: "subscription-price-increase",
      domain: "subscription",
      severity: "warning",
      title: "subscription บางรายการแพงขึ้น",
      body: `${billTitle(item)} เพิ่มจาก ${formatSatang(item.previousAmount)} เป็น ${formatSatang(item.currentAmount)} ลองเช็กว่ายังใช้คุ้มอยู่ไหม`,
      actionLabel: "ดูบิล",
      actionView: "bills",
      actionPayload: { billId: item.id, delta: item.delta },
      priority: 34,
    });
  }

  if (!activeRecurringCount(normalizedState)) {
    addUnique(items, {
      id: "setup-recurring",
      domain: "setup",
      severity: "info",
      title: "ตั้งรายการประจำ",
      body: "เพิ่มเงินเดือน ค่าเช่า หรือบิลประจำ จะช่วยให้ forecast เงินสดล่วงหน้าแม่นขึ้น",
      actionLabel: "ตั้ง Recurring",
      actionView: "recurring",
      actionPayload: null,
      priority: 63,
    });
  }

  for (const insight of buildAiInsightRecommendations(normalizedState, plan)) {
    addUnique(items, insight);
  }

  return sortRecommendations(items).slice(0, maxItems);
}

export const generatePersonalMoneyAssistantRecommendations = generateAssistantRecommendations;
export const generatePersonalMoneyRecommendations = generateAssistantRecommendations;
export const generateRecommendations = generateAssistantRecommendations;

export default {
  generateAssistantRecommendations,
  generatePersonalMoneyAssistantRecommendations,
  generatePersonalMoneyRecommendations,
  generateRecommendations,
};
