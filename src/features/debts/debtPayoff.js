import { calcAccountBalance, toISODateSafe } from "../../store/selectors.js";
import { isCreditAccount } from "../../utils/accountMatch.js";
import { ensureSatangInt } from "../../utils/money.js";

const DEFAULT_MINIMUM_PAYMENT = 30_000;
const DEFAULT_MINIMUM_PAYMENT_PCT = 0.03;
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

function clampPct(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.round(number));
}

function isoToLocalDate(value) {
  const iso = toISODateSafe(value);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addMonthsClamped(date, months, dayOfMonth) {
  const year = date.getFullYear();
  const month = date.getMonth() + months;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(dayOfMonth, lastDay));
}

function daysBetween(start, end) {
  const startDate = isoToLocalDate(start);
  const endDate = isoToLocalDate(end);
  return Math.ceil((endDate.getTime() - startDate.getTime()) / MS_PER_DAY);
}

function pickFirstDefined(source, keys) {
  for (const key of keys) {
    if (source && Object.prototype.hasOwnProperty.call(source, key)) return source[key];
  }
  return undefined;
}

function readPercent(account, keys, fallback = 0) {
  const value = pickFirstDefined(account, keys);
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, number);
}

function readApr(account, options = {}) {
  const bps = pickFirstDefined(account, ["aprBps", "apr_bps"]);
  if (bps != null && Number.isFinite(Number(bps))) {
    return {
      apr: Math.max(0, Number(bps) / 100),
      aprMissing: false,
    };
  }

  const raw = pickFirstDefined(account, ["apr", "aprPct", "aprPercent", "annualPercentageRate"]);
  const number = Number(raw);
  if (Number.isFinite(number)) {
    return {
      apr: Math.max(0, number),
      aprMissing: false,
    };
  }

  const fallback = readPercent(options, ["defaultApr", "defaultAprPct"], 0);
  return {
    apr: fallback,
    aprMissing: fallback === 0,
  };
}

function readDebtOwed(account, balance) {
  const explicit = pickFirstDefined(account, [
    "debtOwed",
    "debtOwedSatang",
    "debt_owed_satang",
    "outstandingBalance",
    "outstandingBalanceSatang",
  ]);

  if (explicit != null && Number.isFinite(Number(explicit))) return Math.abs(ensureSatangInt(explicit, 0));

  // Existing app paths have used both positive-debt and negative-liability
  // balances for credit accounts. The planner displays the owed amount as
  // positive satang while keeping the raw balance available for callers.
  return Math.abs(ensureSatangInt(balance, 0));
}

function readMinimumPayment(account, debtOwed, options = {}) {
  if (debtOwed <= 0) return 0;

  const explicit = pickFirstDefined(account, [
    "minimumPayment",
    "minimumPaymentSatang",
    "minimum_payment_satang",
    "minPayment",
    "minPaymentSatang",
  ]);

  if (explicit != null && Number.isFinite(Number(explicit))) {
    return Math.min(debtOwed, clampSatang(explicit));
  }

  const fixedDefault = clampSatang(options.defaultMinimumPaymentSatang, DEFAULT_MINIMUM_PAYMENT);
  const pctDefault = Math.ceil(debtOwed * (Number(options.defaultMinimumPaymentPct) || DEFAULT_MINIMUM_PAYMENT_PCT));
  return Math.min(debtOwed, Math.max(fixedDefault, pctDefault));
}

function readExtraPayment(account) {
  const explicit = pickFirstDefined(account, [
    "extraPayment",
    "extraPaymentSatang",
    "extra_payment_satang",
    "plannedExtraPayment",
    "plannedExtraPaymentSatang",
  ]);
  return explicit == null ? 0 : clampSatang(explicit);
}

function normalizeDay(value) {
  const day = toInt(value, 0);
  if (day < 1 || day > 31) return 0;
  return day;
}

function getNextDueDate(dueDay, today) {
  const day = normalizeDay(dueDay);
  if (!day) return null;

  const start = isoToLocalDate(today);
  const thisMonth = addMonthsClamped(start, 0, day);
  const todayIso = toISODateSafe(start);
  const thisMonthIso = toISODateSafe(thisMonth);
  return thisMonthIso >= todayIso ? thisMonth : addMonthsClamped(start, 1, day);
}

function buildDueSoon(debts, options = {}) {
  const today = toISODateSafe(options.today || new Date());
  const windowDays = Math.max(0, toInt(options.dueSoonDays, 7));

  return listOf(debts)
    .map((debt) => {
      if (!debt || debt.debtOwed <= 0 || !normalizeDay(debt.dueDay)) return null;
      const dueDate = getNextDueDate(debt.dueDay, today);
      if (!dueDate) return null;
      const dueDateIso = toISODateSafe(dueDate);
      const daysUntilDue = daysBetween(today, dueDateIso);
      if (daysUntilDue < 0 || daysUntilDue > windowDays) return null;
      return {
        accountId: debt.accountId,
        name: debt.name,
        dueDate: dueDateIso,
        daysUntilDue,
        debtOwed: debt.debtOwed,
        minimumPayment: debt.minimumPayment,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const byDate = String(left.dueDate).localeCompare(String(right.dueDate));
      if (byDate !== 0) return byDate;
      return String(left.name).localeCompare(String(right.name));
    });
}

function normalizeDebtInput(debt) {
  const debtOwed = readDebtOwed(debt || {}, debt?.balance ?? debt?.debtOwed ?? 0);
  const minimumPayment = readMinimumPayment(debt || {}, debtOwed);
  return {
    accountId: String(debt?.accountId || debt?.id || ""),
    name: String(debt?.name || debt?.accountName || "Debt"),
    balance: ensureSatangInt(debt?.balance ?? -debtOwed, -debtOwed),
    debtOwed,
    creditLimit: clampSatang(debt?.creditLimit),
    utilizationPct: clampPct(debt?.utilizationPct ?? debt?.utilization),
    statementDay: normalizeDay(debt?.statementDay),
    dueDay: normalizeDay(debt?.dueDay),
    apr: Math.max(0, Number(debt?.apr) || 0),
    minimumPayment,
    extraPayment: clampSatang(debt?.extraPayment),
    aprMissing: !!debt?.aprMissing,
  };
}

function compareDebtIdentity(left, right) {
  const byAccount = String(left.accountId).localeCompare(String(right.accountId));
  if (byAccount !== 0) return byAccount;
  return String(left.name).localeCompare(String(right.name));
}

export function getDebtAccounts(state = {}, options = {}) {
  const accounts = listOf(state?.accounts);
  const transactions = listOf(state?.transactions);

  return accounts
    .filter((account) => isCreditAccount(account))
    .map((account) => {
      const accountId = String(account?.id || "");
      const balance = ensureSatangInt(calcAccountBalance(accounts, transactions, accountId), 0);
      const debtOwed = readDebtOwed(account, balance);
      const creditLimit = clampSatang(account?.creditLimit ?? account?.limit ?? account?.credit_limit_satang);
      const utilizationPct = creditLimit > 0 ? Math.round((debtOwed / creditLimit) * 100) : 0;
      const { apr, aprMissing } = readApr(account, options);
      const dueDay = normalizeDay(account?.dueDay ?? account?.paymentDueDay);
      const statementDay = normalizeDay(account?.statementDay);
      const minimumPayment = readMinimumPayment(account, debtOwed, options);
      const extraPayment = readExtraPayment(account);

      return {
        accountId,
        name: String(account?.name || "Credit account"),
        balance,
        debtOwed,
        creditLimit,
        utilizationPct,
        statementDay,
        dueDay,
        apr,
        minimumPayment,
        extraPayment,
        aprMissing,
      };
    });
}

export function calculateDebtOverview(state = {}, options = {}) {
  const debts = listOf(options.debts).length ? listOf(options.debts).map(normalizeDebtInput) : getDebtAccounts(state, options);
  const activeDebts = debts.filter((debt) => debt.debtOwed > 0);
  const totalDebt = activeDebts.reduce((sum, debt) => sum + debt.debtOwed, 0);
  const totalMinimumPayment = activeDebts.reduce((sum, debt) => sum + debt.minimumPayment, 0);
  const averageUtilizationPct = activeDebts.length
    ? Math.round(activeDebts.reduce((sum, debt) => sum + debt.utilizationPct, 0) / activeDebts.length)
    : 0;

  const highestAprDebt = activeDebts.reduce((best, debt) => {
    if (!best) return debt;
    if (debt.apr > best.apr) return debt;
    if (debt.apr === best.apr && debt.debtOwed > best.debtOwed) return debt;
    return best;
  }, null);

  const highestUtilizationDebt = activeDebts.reduce((best, debt) => {
    if (!best) return debt;
    if (debt.utilizationPct > best.utilizationPct) return debt;
    if (debt.utilizationPct === best.utilizationPct && debt.debtOwed > best.debtOwed) return debt;
    return best;
  }, null);

  return {
    totalDebt,
    totalMinimumPayment,
    averageUtilizationPct,
    highestAprDebt,
    highestUtilizationDebt,
    dueSoon: buildDueSoon(activeDebts, options),
  };
}

export function sortDebtsByStrategy(debts = [], strategy = "avalanche") {
  const normalized = listOf(debts).map(normalizeDebtInput);
  const selected = String(strategy || "avalanche").toLowerCase().trim();

  return normalized.sort((left, right) => {
    if (selected === "snowball") {
      const leftDebt = left.debtOwed > 0 ? left.debtOwed : Number.MAX_SAFE_INTEGER;
      const rightDebt = right.debtOwed > 0 ? right.debtOwed : Number.MAX_SAFE_INTEGER;
      if (leftDebt !== rightDebt) return leftDebt - rightDebt;
      if (right.apr !== left.apr) return right.apr - left.apr;
      return compareDebtIdentity(left, right);
    }

    if (selected === "utilization") {
      if (right.utilizationPct !== left.utilizationPct) return right.utilizationPct - left.utilizationPct;
      if (right.apr !== left.apr) return right.apr - left.apr;
      if (right.debtOwed !== left.debtOwed) return right.debtOwed - left.debtOwed;
      return compareDebtIdentity(left, right);
    }

    if (right.apr !== left.apr) return right.apr - left.apr;
    if (right.debtOwed !== left.debtOwed) return right.debtOwed - left.debtOwed;
    return compareDebtIdentity(left, right);
  });
}

export function simulateDebtPayoff(debts = [], options = {}) {
  const strategy = String(options.strategy || "avalanche").toLowerCase().trim() || "avalanche";
  const maxMonths = Math.max(1, toInt(options.maxMonths, 360));
  const monthlyBudgetForDebt = clampSatang(options.monthlyBudgetForDebt);
  const orderedDebts = sortDebtsByStrategy(debts, strategy).filter((debt) => debt.debtOwed > 0);
  const payoffOrder = orderedDebts.map((debt) => debt.accountId);

  if (!orderedDebts.length) {
    return {
      strategy,
      monthsToPayoff: 0,
      totalInterestEstimate: 0,
      payoffOrder,
      schedule: [],
    };
  }

  if (monthlyBudgetForDebt <= 0) {
    return {
      strategy,
      monthsToPayoff: null,
      totalInterestEstimate: 0,
      payoffOrder,
      schedule: [],
    };
  }

  const balances = new Map(orderedDebts.map((debt) => [debt.accountId, debt.debtOwed]));
  const schedule = [];
  let totalInterestEstimate = 0;

  for (let monthIndex = 1; monthIndex <= maxMonths; monthIndex += 1) {
    const paymentsByAccount = new Map();
    const interestByAccount = new Map();
    let remainingBudget = monthlyBudgetForDebt;

    for (const debt of orderedDebts) {
      const balance = balances.get(debt.accountId) || 0;
      if (balance <= 0) continue;
      const monthlyRate = Math.max(0, Number(debt.apr) || 0) / 12 / 100;
      const interest = Math.round(balance * monthlyRate);
      if (interest > 0) {
        balances.set(debt.accountId, balance + interest);
        interestByAccount.set(debt.accountId, interest);
        totalInterestEstimate += interest;
      }
    }

    for (const debt of orderedDebts) {
      if (remainingBudget <= 0) break;
      const balance = balances.get(debt.accountId) || 0;
      if (balance <= 0) continue;

      const targetPayment = Math.min(balance, debt.minimumPayment);
      const payment = Math.min(targetPayment, remainingBudget);
      if (payment <= 0) continue;

      balances.set(debt.accountId, balance - payment);
      remainingBudget -= payment;
      paymentsByAccount.set(debt.accountId, (paymentsByAccount.get(debt.accountId) || 0) + payment);
    }

    for (const debt of orderedDebts) {
      if (remainingBudget <= 0) break;
      const balance = balances.get(debt.accountId) || 0;
      if (balance <= 0) continue;

      const payment = Math.min(balance, remainingBudget);
      if (payment <= 0) continue;

      balances.set(debt.accountId, balance - payment);
      remainingBudget -= payment;
      paymentsByAccount.set(debt.accountId, (paymentsByAccount.get(debt.accountId) || 0) + payment);
    }

    const payments = orderedDebts
      .map((debt) => ({
        accountId: debt.accountId,
        name: debt.name,
        amount: paymentsByAccount.get(debt.accountId) || 0,
        interest: interestByAccount.get(debt.accountId) || 0,
      }))
      .filter((payment) => payment.amount > 0 || payment.interest > 0);

    const remainingDebt = orderedDebts.reduce((sum, debt) => sum + (balances.get(debt.accountId) || 0), 0);
    schedule.push({
      monthIndex,
      payments,
      remainingDebt,
    });

    if (remainingDebt <= 0) {
      return {
        strategy,
        monthsToPayoff: monthIndex,
        totalInterestEstimate,
        payoffOrder,
        schedule,
      };
    }
  }

  return {
    strategy,
    monthsToPayoff: null,
    totalInterestEstimate,
    payoffOrder,
    schedule,
  };
}

export function generateDebtRecommendations(state = {}, options = {}) {
  const debts = getDebtAccounts(state, options);
  const overview = calculateDebtOverview(state, { ...options, debts });
  const recommendations = [];

  if (overview.totalDebt <= 0) {
    recommendations.push({
      id: "debt-clear",
      severity: "success",
      title: "No credit debt detected",
      body: "Credit accounts are not showing an outstanding balance right now.",
      actionLabel: "Debts",
      actionView: "debts",
    });
  }

  if (overview.dueSoon.length) {
    const next = overview.dueSoon[0];
    recommendations.push({
      id: "debt-due-soon",
      severity: "warning",
      title: "Payment due soon",
      body: `${next.name} is due on ${next.dueDate}. Keep the minimum payment ready.`,
      actionLabel: "Debts",
      actionView: "debts",
    });
  }

  if (overview.highestUtilizationDebt?.utilizationPct >= 80) {
    recommendations.push({
      id: "debt-high-utilization",
      severity: "warning",
      title: "High card utilization",
      body: `${overview.highestUtilizationDebt.name} is using ${overview.highestUtilizationDebt.utilizationPct}% of its limit.`,
      actionLabel: "Debts",
      actionView: "debts",
    });
  }

  const missingAprCount = debts.filter((debt) => debt.debtOwed > 0 && debt.aprMissing).length;
  if (missingAprCount) {
    recommendations.push({
      id: "debt-missing-apr",
      severity: "info",
      title: "Add APR for better payoff estimates",
      body: "APR is missing on one or more credit accounts, so interest estimates use 0%.",
      actionLabel: "Debts",
      actionView: "debts",
    });
  }

  if (overview.totalDebt > 0) {
    recommendations.push({
      id: "debt-payoff-plan",
      severity: "info",
      title: "Pick a payoff strategy",
      body: "Compare avalanche, snowball, and utilization-first ordering before choosing a plan.",
      actionLabel: "Debts",
      actionView: "debts",
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
  getDebtAccounts,
  calculateDebtOverview,
  sortDebtsByStrategy,
  simulateDebtPayoff,
  generateDebtRecommendations,
};
