import { ensureSatangInt, parseMoneyToSatang } from "./money.js";
import { clampBillingDay } from "./creditDates.js";
import { generateId } from "./id.js";

const CREDIT_STATEMENT_STATUSES = new Set(["open", "planned", "paid", "skipped"]);
const ACTIVE_STATEMENT_STATUSES = new Set(["open", "planned"]);
const SALARY_PLAN_STRATEGIES = new Set(["due_date", "highest_balance", "snowball"]);

function toLocalDate(value) {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time)
      ? new Date(value.getFullYear(), value.getMonth(), value.getDate())
      : new Date();
  }

  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isFinite(date.getTime()) ? date : new Date();
  }

  const date = value ? new Date(value) : new Date();
  return Number.isFinite(date.getTime())
    ? new Date(date.getFullYear(), date.getMonth(), date.getDate())
    : new Date();
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function dateForBillingDay(year, monthIndex, day) {
  const safeDay = Math.min(clampBillingDay(day), daysInMonth(year, monthIndex));
  return new Date(year, monthIndex, safeDay);
}

function toISODateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeISODateString(value) {
  const text = String(value || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function normalizeMonthKey(value) {
  const text = String(value || "").trim().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(text) ? text : "";
}

function normalizeTimestamp(value, fallback = Date.now()) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeOptionalApr(value) {
  if (value == null || String(value).trim() === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, number);
}

function coerceSatang(value, fallback = 0) {
  if (value == null || String(value).trim() === "") return fallback;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return fallback;
    if (!Number.isInteger(value)) return parseMoneyToSatang(value);
    return Math.round(value);
  }

  const text = String(value).trim();
  if (!text) return fallback;
  if (/^-?\d+$/.test(text)) {
    const number = Number(text);
    return Number.isFinite(number) ? Math.round(number) : fallback;
  }
  return parseMoneyToSatang(text);
}

function safeSatang(value, fallback = 0) {
  const satang = coerceSatang(value, NaN);
  return Number.isFinite(satang) ? ensureSatangInt(satang, fallback) : fallback;
}

function readPositiveAmount(source, valueKeys, satangKeys = [], fallback = 0) {
  const raw = source && typeof source === "object" ? source : {};
  for (const key of satangKeys) {
    if (raw[key] != null && String(raw[key]).trim() !== "") {
      return Math.max(0, safeSatang(raw[key], fallback));
    }
  }
  for (const key of valueKeys) {
    if (raw[key] != null && String(raw[key]).trim() !== "") {
      return Math.max(0, safeSatang(raw[key], fallback));
    }
  }
  return Math.max(0, fallback);
}

function normalizeStatus(value) {
  const status = String(value || "open").toLowerCase().trim();
  return CREDIT_STATEMENT_STATUSES.has(status) ? status : "open";
}

function normalizeStrategy(value) {
  const strategy = String(value || "due_date").toLowerCase().trim();
  return SALARY_PLAN_STRATEGIES.has(strategy) ? strategy : "due_date";
}

function compareDueDateThenId(a, b) {
  return (
    String(a.dueDate || "").localeCompare(String(b.dueDate || "")) ||
    String(a.accountId || "").localeCompare(String(b.accountId || "")) ||
    String(a.id || "").localeCompare(String(b.id || ""))
  );
}

export function makeCreditStatementCycleKey(accountId, statementDate) {
  const id = String(accountId || "").trim();
  const date = normalizeISODateString(statementDate) || normalizeMonthKey(statementDate);
  return id && date ? `${id}:${date}` : "";
}

export function getBillingCycleForCard(account, todayDate = new Date()) {
  const acc = account && typeof account === "object" ? account : {};
  const accountId = String(acc.id || acc.accountId || "").trim();
  const statementDay = clampBillingDay(acc.statementDay ?? 1);
  const dueDay = clampBillingDay(acc.dueDay ?? 25);
  const base = toLocalDate(todayDate);

  let statement = dateForBillingDay(base.getFullYear(), base.getMonth(), statementDay);
  if (statement.getTime() > base.getTime()) {
    statement = dateForBillingDay(base.getFullYear(), base.getMonth() - 1, statementDay);
  }

  const dueMonthOffset = dueDay < statementDay ? 1 : 0;
  const due = dateForBillingDay(statement.getFullYear(), statement.getMonth() + dueMonthOffset, dueDay);
  const statementDate = toISODateLocal(statement);
  const dueDate = toISODateLocal(due);

  return {
    accountId,
    statementDay,
    dueDay,
    statementDate,
    dueDate,
    cycleKey: makeCreditStatementCycleKey(accountId, statementDate),
  };
}

export function normalizeCreditStatement(raw) {
  const statement = raw && typeof raw === "object" ? raw : {};
  const accountId = String(statement.accountId ?? statement.account_id ?? "").trim();
  const statementDate = normalizeISODateString(statement.statementDate ?? statement.statement_date);
  const dueDate = normalizeISODateString(statement.dueDate ?? statement.due_date);
  const explicitMonth = normalizeMonthKey(
    statement.month ?? statement.monthKey ?? statement.month_key ?? statement.statementMonth ?? statement.statement_month
  );
  const month =
    explicitMonth ||
    normalizeMonthKey(statementDate) ||
    normalizeMonthKey(dueDate);
  const cycleKey =
    String(statement.cycleKey ?? statement.cycle_key ?? "").trim() ||
    makeCreditStatementCycleKey(accountId, statementDate || month);
  const idSeed = explicitMonth || statementDate || dueDate || month;
  const id =
    String(statement.id || (accountId && idSeed ? `credit_statement_${accountId}_${idSeed}` : "")).trim() ||
    cycleKey ||
    generateId();
  const createdAt = normalizeTimestamp(statement.createdAt ?? statement.created_at, Date.now());
  const updatedAt = normalizeTimestamp(statement.updatedAt ?? statement.updated_at, createdAt);

  const statementBalance = readPositiveAmount(
    statement,
    ["statementBalance", "statement_balance", "balance"],
    ["statementBalanceSatang", "statement_balance_satang", "balanceSatang", "balance_satang"],
    0
  );
  const fullDue = readPositiveAmount(
    statement,
    ["fullDue", "full_due", "statementBalance", "statement_balance", "balance"],
    ["fullDueSatang", "full_due_satang", "statementBalanceSatang", "statement_balance_satang", "balanceSatang", "balance_satang"],
    statementBalance
  );

  return {
    ...statement,
    id,
    accountId,
    cycleKey,
    month,
    statementDate,
    dueDate,
    minimumDue: readPositiveAmount(
      statement,
      ["minimumDue", "minimum_due", "minimumPayment", "minimum_payment"],
      ["minimumDueSatang", "minimum_due_satang", "minimumPaymentSatang", "minimum_payment_satang"],
      0
    ),
    fullDue,
    statementBalance: statementBalance || fullDue,
    paidAmount: readPositiveAmount(
      statement,
      ["paidAmount", "paid_amount", "paid"],
      ["paidAmountSatang", "paid_amount_satang", "paidSatang", "paid_satang"],
      0
    ),
    plannedPayAmount: readPositiveAmount(
      statement,
      ["plannedPayAmount", "planned_pay_amount", "plannedPayment", "planned_payment"],
      ["plannedPayAmountSatang", "planned_pay_amount_satang", "plannedPaymentSatang", "planned_payment_satang"],
      0
    ),
    apr: normalizeOptionalApr(statement.apr ?? statement.aprPercent ?? statement.apr_percent),
    status: normalizeStatus(statement.status),
    note: String(statement.note || "").trim(),
    createdAt,
    updatedAt,
  };
}

export function getStatementsNeedingInput(accounts, creditStatements, todayDate = new Date()) {
  const existingKeys = new Set();
  for (const raw of Array.isArray(creditStatements) ? creditStatements : []) {
    const statement = normalizeCreditStatement(raw);
    if (statement.cycleKey) existingKeys.add(statement.cycleKey);
    if (statement.accountId && statement.statementDate) {
      existingKeys.add(makeCreditStatementCycleKey(statement.accountId, statement.statementDate));
    }
  }

  return (Array.isArray(accounts) ? accounts : [])
    .filter((account) => String(account?.type || "").toLowerCase().trim() === "credit")
    .map((account) => ({ account, ...getBillingCycleForCard(account, todayDate) }))
    .filter((cycle) => cycle.accountId && cycle.cycleKey && !existingKeys.has(cycle.cycleKey))
    .sort(compareDueDateThenId);
}

function getAvailableDebtBudget({ salaryAmount, reserveAmount, debtBudget }) {
  const explicitDebtBudget = Math.max(0, safeSatang(debtBudget, 0));
  if (explicitDebtBudget > 0) return explicitDebtBudget;
  return Math.max(0, safeSatang(salaryAmount, 0) - safeSatang(reserveAmount, 0));
}

function sortForExtra(strategy, payments) {
  const list = payments.filter((payment) => payment.remainingAfterMinimum > 0).slice();
  if (strategy === "highest_balance") {
    return list.sort(
      (a, b) =>
        b.remainingAfterMinimum - a.remainingAfterMinimum ||
        compareDueDateThenId(a, b)
    );
  }
  if (strategy === "snowball") {
    return list.sort(
      (a, b) =>
        a.remainingAfterMinimum - b.remainingAfterMinimum ||
        compareDueDateThenId(a, b)
    );
  }
  return list.sort(compareDueDateThenId);
}

export function calculateCreditPaymentPlan({
  accounts = [],
  creditStatements = [],
  salaryAmount = 0,
  reserveAmount = 0,
  debtBudget = 0,
  strategy = "due_date",
} = {}) {
  const normalizedStrategy = normalizeStrategy(strategy);
  const accountById = new Map(
    (Array.isArray(accounts) ? accounts : [])
      .filter((account) => String(account?.type || "").toLowerCase().trim() === "credit")
      .map((account) => [String(account?.id || "").trim(), account])
      .filter(([id]) => !!id)
  );

  const payments = (Array.isArray(creditStatements) ? creditStatements : [])
    .map(normalizeCreditStatement)
    .filter((statement) => accountById.has(statement.accountId))
    .filter((statement) => ACTIVE_STATEMENT_STATUSES.has(statement.status))
    .map((statement) => {
      const remainingDue = Math.max(0, statement.fullDue - statement.paidAmount);
      const minimumRequired = Math.min(
        remainingDue,
        Math.max(0, statement.minimumDue - statement.paidAmount)
      );
      const account = accountById.get(statement.accountId) || {};
      return {
        accountId: statement.accountId,
        accountName: String(account.name || ""),
        statementId: statement.id,
        cycleKey: statement.cycleKey,
        statementDate: statement.statementDate,
        dueDate: statement.dueDate,
        status: statement.status,
        minimumDue: statement.minimumDue,
        minimumRequired,
        fullDue: statement.fullDue,
        paidAmount: statement.paidAmount,
        plannedPayAmount: statement.plannedPayAmount,
        remainingDue,
        remainingAfterMinimum: Math.max(0, remainingDue - minimumRequired),
        recommendedPayment: 0,
        minimumPayment: 0,
        extraPayment: 0,
        warnings: [],
      };
    })
    .filter((payment) => payment.remainingDue > 0)
    .sort(compareDueDateThenId);

  const availableDebtBudget = getAvailableDebtBudget({ salaryAmount, reserveAmount, debtBudget });
  const totalMinimumRequired = payments.reduce((sum, payment) => sum + payment.minimumRequired, 0);
  const totalFullDue = payments.reduce((sum, payment) => sum + payment.remainingDue, 0);
  const warnings = [];
  let remainingBudget = availableDebtBudget;

  for (const payment of payments) {
    const amount = Math.min(remainingBudget, payment.minimumRequired);
    payment.minimumPayment = amount;
    payment.recommendedPayment += amount;
    remainingBudget -= amount;
    if (amount < payment.minimumRequired) {
      payment.warnings.push("minimum_due_not_fully_funded");
    }
  }

  if (availableDebtBudget < totalMinimumRequired) {
    warnings.push("minimum_due_shortfall");
  }

  if (remainingBudget > 0) {
    for (const payment of sortForExtra(normalizedStrategy, payments)) {
      const capacity = Math.max(0, payment.remainingDue - payment.recommendedPayment);
      if (!capacity) continue;
      const extra = Math.min(remainingBudget, capacity);
      payment.extraPayment += extra;
      payment.recommendedPayment += extra;
      remainingBudget -= extra;
      if (remainingBudget <= 0) break;
    }
  }

  for (const payment of payments) {
    payment.remainingAfterPayment = Math.max(0, payment.remainingDue - payment.recommendedPayment);
    delete payment.remainingAfterMinimum;
  }

  const totalRecommended = payments.reduce((sum, payment) => sum + payment.recommendedPayment, 0);
  const shortfall = Math.max(0, totalMinimumRequired - availableDebtBudget);
  const surplus = Math.max(0, availableDebtBudget - totalRecommended);

  return {
    strategy: normalizedStrategy,
    payments,
    cards: payments,
    totalMinimumRequired,
    totalFullDue,
    availableDebtBudget,
    totalRecommended,
    shortfall,
    surplus,
    warnings,
  };
}
