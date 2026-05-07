import { getUpcomingBills, summarizeBills } from "../bills/detectBills.js";
import {
  calculateDebtOverview,
  getDebtAccounts,
  sortDebtsByStrategy,
} from "../debts/debtPayoff.js";
import { calculateMonthlyNeeded, normalizeGoalForUi } from "../goals/goalCalculators.js";
import { calculateMonthlyPlan, forecastCashFlow } from "../money-plan/moneyPlan.js";
import { generatePersonalMoneyRecommendations } from "./recommendationEngine.js";
import { formatCurrency, formatDateShort, toISODate } from "../../utils/format.js";
import { ensureSatangInt } from "../../utils/money.js";

export const LOCAL_ASSISTANT_PRIVACY_NOTE =
  "คำตอบนี้คำนวณจากข้อมูลในเครื่อง ไม่ส่งข้อมูลการเงินออกนอกเครื่อง";

export const ASSISTANT_SUGGESTED_PROMPTS = Object.freeze([
  "เดือนนี้เหลือใช้เท่าไร",
  "วันนี้ใช้ได้อีกเท่าไร",
  "30 วันข้างหน้า",
  "ควรจ่ายหนี้ใบไหนก่อน",
  "มีบิลอะไรใกล้ถึงกำหนด",
  "เป้าหมายออมไหนตามไม่ทัน",
  "ช่วยแนะนำ action ต่อไป",
]);

const INTENTS = Object.freeze({
  MONTHLY_AVAILABLE: "monthly_available",
  TODAY_AVAILABLE: "today_available",
  FORECAST_30D: "forecast_30d",
  DEBT_PRIORITY: "debt_priority",
  UPCOMING_BILLS: "upcoming_bills",
  LAGGING_GOALS: "lagging_goals",
  NEXT_ACTION: "next_action",
});

const VALID_ACTION_VIEWS = new Set([
  "budgets",
  "goals",
  "debts",
  "bills",
  "recurring",
  "accounts",
  "inbox",
  "dashboard",
  "transactions",
  "plan",
]);

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function cleanId(value) {
  return String(value || "").trim();
}

function cleanText(value, fallback = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function readSatang(...values) {
  return ensureSatangInt(firstDefined(...values), 0);
}

function normalizeQuestionText(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFKC");
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function sanitizeDate(value) {
  const text = cleanText(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function normalizeToday(value) {
  if (value instanceof Date) return toISODate(value);
  return sanitizeDate(value) || toISODate(new Date());
}

function dateFromIso(isoDate) {
  const text = sanitizeDate(isoDate);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function daysBetween(startIso, endIso) {
  const start = dateFromIso(startIso);
  const end = dateFromIso(endIso);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return Number.isFinite(days) ? days : 0;
}

function formatDate(value) {
  const iso = sanitizeDate(value);
  return iso ? formatDateShort(iso) : "-";
}

function normalizeTransaction(tx) {
  const source = tx && typeof tx === "object" ? tx : {};
  const type = cleanText(source.type || source.kind || source.txType || source.tx_type || "expense").toLowerCase();
  const accountId = cleanId(source.accountId ?? source.account_id ?? source.fromAccountId ?? source.from_account_id);
  const categoryId = cleanId(source.categoryId ?? source.category_id ?? source.category);

  return {
    ...source,
    id: cleanId(source.id),
    type,
    kind: type,
    amount: Math.abs(readSatang(source.amount, source.amountSatang, source.amount_satang)),
    accountId,
    account_id: accountId,
    category: categoryId,
    categoryId,
    category_id: categoryId,
    date: sanitizeDate(source.date || source.transactionDate || source.postedDate),
    merchant: cleanText(source.merchant || source.payee || source.counterparty),
    note: cleanText(source.note || source.description || source.memo),
    isTransfer: source.isTransfer === true || source.is_transfer === true || type === "transfer",
    isSplitParent:
      source.isSplitParent === true ||
      source.is_split_parent === true ||
      String(source.splitRole || source.split_role || "").toLowerCase() === "parent",
    adjustmentEffect: source.adjustmentEffect || source.adjustment_effect || "",
  };
}

function transactionNet(tx) {
  if (!tx?.accountId || tx?.isSplitParent) return 0;
  if (tx.type === "income") return tx.amount;
  if (tx.type !== "expense") return 0;
  return String(tx.adjustmentEffect || "").toLowerCase() === "subtract" ? tx.amount : -tx.amount;
}

function normalizeBudget(row) {
  const source = row && typeof row === "object" ? row : {};
  const month = cleanText(source.month || source.monthKey || source.month_key);
  const categoryId = cleanId(source.categoryId ?? source.category_id ?? source.category);
  const limit = Math.max(0, readSatang(source.limit, source.limitSatang, source.limit_satang));

  return {
    ...source,
    id: cleanId(source.id) || `${month}:${categoryId}`,
    month,
    categoryId,
    category_id: categoryId,
    limit,
  };
}

function normalizeRecurring(rule) {
  const source = rule && typeof rule === "object" ? rule : {};
  const type = cleanText(source.type || source.kind || source.txType || "expense").toLowerCase() === "income"
    ? "income"
    : "expense";
  const accountId = cleanId(source.accountId ?? source.account_id);
  const categoryId = cleanId(source.categoryId ?? source.category_id ?? source.category);

  return {
    ...source,
    id: cleanId(source.id),
    type,
    kind: type,
    amount: Math.abs(readSatang(source.amount, source.amountSatang, source.amount_satang)),
    accountId,
    account_id: accountId,
    categoryId,
    category_id: categoryId,
    note: cleanText(source.note || source.label || source.name || source.merchant || "Recurring"),
    merchant: cleanText(source.merchant),
    frequency: cleanText(source.frequency || "monthly").toLowerCase(),
    interval: Math.max(1, Math.trunc(Number(source.interval ?? source.interval_count ?? 1) || 1)),
    startDate: sanitizeDate(source.startDate ?? source.start_date),
    lastGenerated: sanitizeDate(source.lastGenerated ?? source.last_generated_date),
    enabled: source.enabled !== false,
  };
}

function normalizeAccounts(accounts, transactions) {
  const netByAccount = new Map();
  for (const tx of transactions) {
    if (!tx.accountId) continue;
    netByAccount.set(tx.accountId, (netByAccount.get(tx.accountId) || 0) + transactionNet(tx));
  }

  return listOf(accounts)
    .map((account) => {
      const source = account && typeof account === "object" ? account : {};
      const id = cleanId(source.id ?? source.accountId ?? source.account_id);
      if (!id) return null;

      const currentBalance = firstDefined(
        source.balanceSatang,
        source.balance_satang,
        source.currentBalanceSatang,
        source.current_balance_satang,
        source.balance,
      );
      const hasCurrentBalance = currentBalance !== undefined;
      const openingBalance = hasCurrentBalance
        ? readSatang(currentBalance) - (netByAccount.get(id) || 0)
        : readSatang(source.openingBalance, source.openingBalanceSatang, source.opening_balance_satang);

      return {
        ...source,
        id,
        name: cleanText(source.name || source.accountName || "บัญชี"),
        type: cleanText(source.type || source.kind || "cash").toLowerCase(),
        openingBalance,
        creditLimit: Math.max(
          0,
          readSatang(source.creditLimit, source.creditLimitSatang, source.credit_limit_satang, source.limit),
        ),
        statementDay: source.statementDay ?? source.statement_day ?? "",
        dueDay: source.dueDay ?? source.due_day ?? source.paymentDueDay ?? "",
        apr: source.apr ?? source.aprPct ?? source.aprPercent,
        aprBps: source.aprBps ?? source.apr_bps,
        minimumPayment: source.minimumPayment ?? source.minimumPaymentSatang ?? source.minimum_payment_satang,
        extraPayment: source.extraPayment ?? source.extraPaymentSatang ?? source.extra_payment_satang,
      };
    })
    .filter(Boolean);
}

export function normalizeAssistantState(state = {}) {
  const source = state && typeof state === "object" ? state : {};
  const transactions = listOf(source.transactions)
    .map(normalizeTransaction)
    .filter((tx) => tx.date && tx.amount > 0);
  const goals = listOf(source.goals).length ? source.goals : source.financialGoals;

  return {
    accounts: normalizeAccounts(source.accounts, transactions),
    transactions,
    budgets: listOf(source.budgets || source.budgetRows)
      .map(normalizeBudget)
      .filter((budget) => budget.month && budget.categoryId && budget.limit > 0),
    recurring: listOf(source.recurring || source.recurringRules)
      .map(normalizeRecurring)
      .filter((rule) => rule.amount > 0),
    goals: listOf(goals).map((goal, index) => normalizeGoalForUi(goal, index)),
    categories: source.categories || { expense: [], income: [] },
  };
}

export function detectLocalAssistantIntent(question = "") {
  const text = normalizeQuestionText(question);

  if (!text) return INTENTS.NEXT_ACTION;
  if (
    includesAny(text, ["หนี้", "debt", "credit", "บัตร"]) &&
    includesAny(text, ["ก่อน", "จ่าย", "ปิด", "pay", "first", "priority"])
  ) {
    return INTENTS.DEBT_PRIORITY;
  }
  if (includesAny(text, ["บิล", "bill", "subscription", "subscriptions", "กำหนด", "due"])) {
    return INTENTS.UPCOMING_BILLS;
  }
  if (includesAny(text, ["เป้าหมาย", "goal", "goals", "ออม"]) && includesAny(text, ["ไม่ทัน", "ช้า", "เสี่ยง", "behind", "late"])) {
    return INTENTS.LAGGING_GOALS;
  }
  if (includesAny(text, ["30 วัน", "30-day", "30 days", "ข้างหน้า", "เดือนหน้า", "cash flow", "cashflow", "พอไหม"])) {
    return INTENTS.FORECAST_30D;
  }
  if (includesAny(text, ["วันนี้", "today", "ต่อวัน", "per day", "daily"])) {
    return INTENTS.TODAY_AVAILABLE;
  }
  if (includesAny(text, ["เดือนนี้", "this month", "เหลือใช้", "เหลือ", "available"])) {
    return INTENTS.MONTHLY_AVAILABLE;
  }
  if (includesAny(text, ["แนะนำ", "action", "ต่อไป", "recommend", "next", "ทำอะไร"])) {
    return INTENTS.NEXT_ACTION;
  }

  return INTENTS.NEXT_ACTION;
}

function normalizeActionView(view) {
  const key = cleanText(view).toLowerCase();
  if (!key) return "";
  if (key === "planner") return "budgets";
  return VALID_ACTION_VIEWS.has(key) ? key : "";
}

function card({
  id,
  severity = "info",
  title,
  body,
  actionLabel,
  actionView,
  actionPayload,
  valueSatang,
  meta = {},
}) {
  return {
    id,
    severity,
    title,
    body,
    actionLabel,
    actionView: normalizeActionView(actionView),
    actionPayload,
    valueSatang,
    meta,
  };
}

function response({ intent, query, title, summary, cards }) {
  return {
    intent,
    query: cleanText(query),
    title,
    summary,
    privacyNote: LOCAL_ASSISTANT_PRIVACY_NOTE,
    cards: listOf(cards).filter(Boolean),
    suggestedPrompts: ASSISTANT_SUGGESTED_PROMPTS,
  };
}

function monthlyAvailableAnswer(state, query, todayIso) {
  const plan = calculateMonthlyPlan(state, { today: todayIso });
  const severity = plan.availableThisMonth > 0 ? "success" : "warning";
  const budgetLine = plan.monthlyBudgetLimit
    ? `งบคงเหลือ ${formatCurrency(plan.monthlyBudgetRemaining)}`
    : "ยังไม่ได้ตั้งงบเดือนนี้";

  return response({
    intent: INTENTS.MONTHLY_AVAILABLE,
    query,
    title: "เงินเหลือใช้เดือนนี้",
    summary: `เดือน ${plan.monthKey} เหลือใช้ประมาณ ${formatCurrency(plan.availableThisMonth)}`,
    cards: [
      card({
        id: "monthly-available",
        severity,
        title: formatCurrency(plan.availableThisMonth),
        body: `${budgetLine} หลังหัก recurring ที่เหลือ ${formatCurrency(plan.recurringExpenseRemaining)}`,
        actionLabel: plan.monthlyBudgetLimit ? "ดูงบ" : "ตั้งงบ",
        actionView: "budgets",
        valueSatang: plan.availableThisMonth,
        meta: { monthKey: plan.monthKey, daysRemaining: plan.daysRemaining },
      }),
      card({
        id: "monthly-safe-per-day",
        severity: plan.safeToSpendPerDay > 0 ? "info" : "warning",
        title: `เฉลี่ยต่อวัน ${formatCurrency(plan.safeToSpendPerDay)}`,
        body: `เหลืออีก ${plan.daysRemaining} วันในเดือนนี้`,
        actionLabel: "ดูแผน",
        actionView: "plan",
        valueSatang: plan.safeToSpendPerDay,
      }),
    ],
  });
}

function todayAvailableAnswer(state, query, todayIso) {
  const plan = calculateMonthlyPlan(state, { today: todayIso });
  const severity = plan.safeToSpendToday > 0 ? "success" : "warning";

  return response({
    intent: INTENTS.TODAY_AVAILABLE,
    query,
    title: "วันนี้ใช้ได้อีกเท่าไร",
    summary: `วันนี้ใช้ได้ประมาณ ${formatCurrency(plan.safeToSpendToday)}`,
    cards: [
      card({
        id: "today-safe-spend",
        severity,
        title: formatCurrency(plan.safeToSpendToday),
        body: `เพดานเฉลี่ยต่อวันคือ ${formatCurrency(plan.safeToSpendPerDay)} จากเงินเหลือเดือนนี้ ${formatCurrency(plan.availableThisMonth)}`,
        actionLabel: "ดู Dashboard",
        actionView: "dashboard",
        valueSatang: plan.safeToSpendToday,
      }),
    ],
  });
}

function forecastAnswer(state, query, todayIso) {
  const forecast = forecastCashFlow(state, { today: todayIso, days: 30 });
  const risk = forecast.lowestBalance < 0;
  const nextEvents = listOf(forecast.events).slice(0, 3);
  const eventLine = nextEvents.length
    ? nextEvents
        .map((event) => `${event.label || "Recurring"} ${formatCurrency(Math.abs(event.amount))} (${formatDate(event.date)})`)
        .join(" · ")
    : "ยังไม่มี recurring ในช่วงนี้";

  return response({
    intent: INTENTS.FORECAST_30D,
    query,
    title: "30 วันข้างหน้า",
    summary: risk
      ? `ยอดต่ำสุดอาจติดลบที่ ${formatCurrency(forecast.lowestBalance)}`
      : `คาดว่าสิ้นงวดจะเหลือ ${formatCurrency(forecast.projectedEndingBalance)}`,
    cards: [
      card({
        id: "forecast-30d",
        severity: risk ? "critical" : "success",
        title: risk ? "มีช่วงที่เงินอาจไม่พอ" : "ภาพรวมยังเป็นบวก",
        body: `ยอดต่ำสุด ${formatCurrency(forecast.lowestBalance)} วันที่ ${formatDate(forecast.lowestBalanceDate)} · สิ้นงวด ${formatCurrency(forecast.projectedEndingBalance)}`,
        actionLabel: risk ? "ดูบิล" : "ดูแผน",
        actionView: risk ? "bills" : "plan",
        valueSatang: forecast.projectedEndingBalance,
        meta: {
          lowestBalance: forecast.lowestBalance,
          lowestBalanceDate: forecast.lowestBalanceDate,
          endDate: forecast.endDate,
        },
      }),
      card({
        id: "forecast-events",
        severity: "info",
        title: "รายการที่คาดว่าจะเกิด",
        body: eventLine,
        actionLabel: "จัดการ recurring",
        actionView: "recurring",
      }),
    ],
  });
}

function debtPriorityAnswer(state, query, todayIso) {
  const debts = getDebtAccounts(state, { today: todayIso });
  const activeDebts = debts.filter((debt) => debt.debtOwed > 0);
  const overview = calculateDebtOverview(state, { today: todayIso, debts, dueSoonDays: 7 });

  if (!activeDebts.length) {
    return response({
      intent: INTENTS.DEBT_PRIORITY,
      query,
      title: "ควรจ่ายหนี้ใบไหนก่อน",
      summary: "ยังไม่พบยอดหนี้บัตรเครดิตที่ต้องจัดลำดับ",
      cards: [
        card({
          id: "debt-none",
          severity: "success",
          title: "ยังไม่มีหนี้ที่ต้องโฟกัส",
          body: "ถ้ามีบัตรเครดิต ให้เพิ่มเป็นบัญชีชนิด credit เพื่อให้ผู้ช่วยจัดลำดับได้",
          actionLabel: "ดูบัญชี",
          actionView: "accounts",
        }),
      ],
    });
  }

  const sorted = sortDebtsByStrategy(activeDebts, "avalanche");
  const focus = sorted[0];
  const missingAprCount = activeDebts.filter((debt) => debt.aprMissing).length;

  return response({
    intent: INTENTS.DEBT_PRIORITY,
    query,
    title: "จ่ายหนี้ใบไหนก่อน",
    summary: `วิธี conservative: โฟกัสดอกสูงก่อน เริ่มที่ ${focus.name}`,
    cards: [
      card({
        id: `debt-focus-${focus.accountId}`,
        severity: focus.aprMissing ? "warning" : "info",
        title: focus.name,
        body: `ยอดหนี้ ${formatCurrency(focus.debtOwed)} · APR ${focus.aprMissing ? "ยังไม่ระบุ" : `${focus.apr}%`} · utilization ${focus.utilizationPct}%`,
        actionLabel: "เปิดแผนหนี้",
        actionView: "debts",
        valueSatang: focus.debtOwed,
        meta: { accountId: focus.accountId, strategy: "avalanche" },
      }),
      missingAprCount
        ? card({
            id: "debt-missing-apr-note",
            severity: "info",
            title: "เติม APR จะคำนวณแม่นขึ้น",
            body: `มี ${missingAprCount} บัญชีที่ยังไม่มี APR ตอนนี้จึงถือว่า 0% ในการจำลอง`,
            actionLabel: "ดูบัญชี",
            actionView: "accounts",
          })
        : null,
      overview.dueSoon.length
        ? card({
            id: "debt-due-soon-note",
            severity: "warning",
            title: "มีหนี้ใกล้ครบกำหนด",
            body: `${overview.dueSoon[0].name} ครบกำหนด ${formatDate(overview.dueSoon[0].dueDate)}`,
            actionLabel: "เปิดแผนหนี้",
            actionView: "debts",
          })
        : null,
    ],
  });
}

function upcomingBillsAnswer(state, query, todayIso) {
  const upcoming = getUpcomingBills(state, { today: todayIso }).filter((bill) => bill?.type !== "income");
  const summary = summarizeBills(state, { today: todayIso, dueSoonDays: 7 });
  const focusBills = summary.dueSoon.length ? summary.dueSoon : upcoming.slice(0, 3);

  if (!focusBills.length) {
    return response({
      intent: INTENTS.UPCOMING_BILLS,
      query,
      title: "บิลใกล้ถึงกำหนด",
      summary: "ยังไม่พบบิลหรือ subscription ที่ใกล้ถึงกำหนด",
      cards: [
        card({
          id: "bills-none",
          severity: "info",
          title: "ยังไม่มีบิลที่ต้องกันเงินตอนนี้",
          body: "ตั้ง recurring หรือบันทึกรายการซ้ำสักพัก ระบบจะจับรอบให้เอง",
          actionLabel: "ตั้ง recurring",
          actionView: "recurring",
        }),
      ],
    });
  }

  return response({
    intent: INTENTS.UPCOMING_BILLS,
    query,
    title: "บิลใกล้ถึงกำหนด",
    summary: summary.dueSoon.length
      ? `มี ${summary.dueSoon.length} รายการใน 7 วัน`
      : `รายการถัดไปคือ ${focusBills[0]?.label || "Recurring"}`,
    cards: focusBills.slice(0, 3).map((bill, index) => {
      const days = bill.daysUntilDue ?? daysBetween(todayIso, bill.nextExpectedDate);
      return card({
        id: `bill-${bill.id || index}`,
        severity: days <= 3 ? "warning" : "info",
        title: bill.label || bill.merchant || "Recurring",
        body: `${formatCurrency(bill.amount)} · ${formatDate(bill.nextExpectedDate)}${days >= 0 ? ` · อีก ${days} วัน` : ""}`,
        actionLabel: "ดูบิล",
        actionView: "bills",
        valueSatang: bill.amount,
        meta: { nextExpectedDate: bill.nextExpectedDate, source: bill.source },
      });
    }),
  });
}

function laggingGoalsAnswer(state, query, todayIso) {
  const plan = calculateMonthlyPlan(state, { today: todayIso });
  const activeGoals = listOf(state.goals).filter((goal) => goal.status === "active");
  const lagging = activeGoals
    .map((goal) => {
      const monthlyNeeded = goal.dueDate ? calculateMonthlyNeeded(goal, todayIso) : 0;
      return { goal, monthlyNeeded };
    })
    .filter((item) => item.goal.dueDate && item.monthlyNeeded > plan.availableThisMonth)
    .sort((left, right) => {
      const byNeed = right.monthlyNeeded - left.monthlyNeeded;
      if (byNeed) return byNeed;
      return String(left.goal.dueDate).localeCompare(String(right.goal.dueDate));
    });

  if (!activeGoals.length) {
    return response({
      intent: INTENTS.LAGGING_GOALS,
      query,
      title: "เป้าหมายออม",
      summary: "ยังไม่มีเป้าหมาย active ให้ติดตาม",
      cards: [
        card({
          id: "goals-setup",
          severity: "info",
          title: "เริ่มจากเป้าหมายเงินก้อนหนึ่งอย่าง",
          body: "เช่น กองทุนฉุกเฉิน ทริป หรือเงินสำรองจ่ายหนี้",
          actionLabel: "เพิ่มเป้าหมาย",
          actionView: "goals",
        }),
      ],
    });
  }

  if (!lagging.length) {
    return response({
      intent: INTENTS.LAGGING_GOALS,
      query,
      title: "เป้าหมายออม",
      summary: "ยังไม่พบเป้าหมายที่ตามไม่ทันจากข้อมูลตอนนี้",
      cards: [
        card({
          id: "goals-on-track",
          severity: "success",
          title: "ยังดูพอไหว",
          body: `เงินเหลือเดือนนี้ ${formatCurrency(plan.availableThisMonth)} เทียบกับเป้าหมายที่มี due date`,
          actionLabel: "ดูเป้าหมาย",
          actionView: "goals",
          valueSatang: plan.availableThisMonth,
        }),
      ],
    });
  }

  return response({
    intent: INTENTS.LAGGING_GOALS,
    query,
    title: "เป้าหมายที่อาจตามไม่ทัน",
    summary: `พบ ${lagging.length} เป้าหมายที่ต้องออมต่อเดือนเกินเงินเหลือเดือนนี้`,
    cards: lagging.slice(0, 3).map(({ goal, monthlyNeeded }) =>
      card({
        id: `goal-lagging-${goal.id}`,
        severity: "warning",
        title: goal.name,
        body: `ต้องออมประมาณ ${formatCurrency(monthlyNeeded)}/เดือน ถึง ${formatDate(goal.dueDate)} แต่เดือนนี้เหลือ ${formatCurrency(plan.availableThisMonth)}`,
        actionLabel: "ปรับเป้าหมาย",
        actionView: "goals",
        valueSatang: monthlyNeeded,
        meta: { goalId: goal.id, dueDate: goal.dueDate },
      }),
    ),
  });
}

function nextActionAnswer(state, query, todayIso, options = {}) {
  const maxItems = Math.max(1, Math.min(8, Number(options.maxCards || 5) || 5));
  const recommendations = generatePersonalMoneyRecommendations(state, {
    today: todayIso,
    maxItems,
  });

  if (!recommendations.length) {
    return response({
      intent: INTENTS.NEXT_ACTION,
      query,
      title: "Action ต่อไป",
      summary: "ยังไม่มีรายการที่ต้องเตือนเป็นพิเศษ",
      cards: [
        card({
          id: "next-action-calm",
          severity: "success",
          title: "ตอนนี้ภาพรวมดูนิ่ง",
          body: "เพิ่มรายการใหม่ ตั้งงบ หรือ recurring เพิ่มเติมเพื่อให้ผู้ช่วยจับ pattern ได้แม่นขึ้น",
          actionLabel: "ดูแผน",
          actionView: "plan",
        }),
      ],
    });
  }

  return response({
    intent: INTENTS.NEXT_ACTION,
    query,
    title: "Action ต่อไป",
    summary: `เรียง ${Math.min(maxItems, recommendations.length)} รายการที่ควรดูจากความเร่งด่วน`,
    cards: recommendations.slice(0, maxItems).map((item) =>
      card({
        id: item.id,
        severity: item.severity || "info",
        title: item.title,
        body: item.body,
        actionLabel: item.actionLabel || "เปิดดู",
        actionView: item.actionView,
        actionPayload: item.actionPayload,
        meta: { domain: item.domain, priority: item.priority },
      }),
    ),
  });
}

export function answerLocalAssistantQuestion(state = {}, question = "", options = {}) {
  const todayIso = normalizeToday(options.today);
  const normalizedState = normalizeAssistantState(state);
  const intent = detectLocalAssistantIntent(question);

  if (intent === INTENTS.MONTHLY_AVAILABLE) {
    return monthlyAvailableAnswer(normalizedState, question, todayIso);
  }
  if (intent === INTENTS.TODAY_AVAILABLE) {
    return todayAvailableAnswer(normalizedState, question, todayIso);
  }
  if (intent === INTENTS.FORECAST_30D) {
    return forecastAnswer(normalizedState, question, todayIso);
  }
  if (intent === INTENTS.DEBT_PRIORITY) {
    return debtPriorityAnswer(normalizedState, question, todayIso);
  }
  if (intent === INTENTS.UPCOMING_BILLS) {
    return upcomingBillsAnswer(normalizedState, question, todayIso);
  }
  if (intent === INTENTS.LAGGING_GOALS) {
    return laggingGoalsAnswer(normalizedState, question, todayIso);
  }
  return nextActionAnswer(normalizedState, question, todayIso, options);
}

export default {
  ASSISTANT_SUGGESTED_PROMPTS,
  LOCAL_ASSISTANT_PRIVACY_NOTE,
  answerLocalAssistantQuestion,
  detectLocalAssistantIntent,
  normalizeAssistantState,
};
