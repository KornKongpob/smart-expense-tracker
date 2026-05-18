import { accountLedgerBalanceSatang } from "../domain/ledger/ledgerMath.js";
import { isCreditAccount } from "./accountMatch.js";
import { ensureSatangInt } from "./money.js";

const MINIMUM_KEYS = [
  "minimumDue",
  "minimumDueSatang",
  "minimum_due_satang",
  "minimumPayment",
  "minimumPaymentSatang",
  "minimum_payment_satang",
];

const BALANCE_KEYS = [
  "statementBalance",
  "statementBalanceSatang",
  "statement_balance_satang",
  "balanceSatang",
  "balance",
];

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function clampSatang(value, fallback = 0) {
  return Math.max(0, ensureSatangInt(value, fallback));
}

function pickFirstDefined(source, keys) {
  for (const key of keys) {
    if (source && Object.prototype.hasOwnProperty.call(source, key)) return source[key];
  }
  return undefined;
}

function hasAnyOwn(source, keys) {
  return keys.some((key) => source && Object.prototype.hasOwnProperty.call(source, key));
}

function normalizeMonthKey(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})-(\d{2})/);
  if (!match) return "";
  const month = Number(match[2]);
  if (month < 1 || month > 12) return "";
  return `${match[1]}-${match[2]}`;
}

function normalizeIsoDate(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function clampDay(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const day = Math.trunc(number);
  return day >= 1 && day <= 31 ? day : 0;
}

function accountDueDateForMonth(account, month) {
  const monthKey = normalizeMonthKey(month);
  const day = clampDay(account?.dueDay ?? account?.paymentDueDay);
  if (!monthKey || !day) return "";

  const [year, monthNumber] = monthKey.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return `${monthKey}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function readApr(account, statement) {
  const bps = pickFirstDefined(statement, ["aprBps", "apr_bps"]) ?? pickFirstDefined(account, ["aprBps", "apr_bps"]);
  if (bps != null && Number.isFinite(Number(bps))) return Math.max(0, Number(bps) / 100);

  const raw =
    pickFirstDefined(statement, ["apr", "aprPct", "aprPercent", "annualPercentageRate"]) ??
    pickFirstDefined(account, ["apr", "aprPct", "aprPercent", "annualPercentageRate"]);
  const number = Number(raw);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function readDebtOwed(account, rawBalance) {
  const explicit = pickFirstDefined(account, [
    "debtOwed",
    "debtOwedSatang",
    "debt_owed_satang",
    "outstandingBalance",
    "outstandingBalanceSatang",
    "outstanding_balance_satang",
  ]);

  if (explicit != null && Number.isFinite(Number(explicit))) return Math.abs(ensureSatangInt(explicit, 0));
  return Math.max(0, ensureSatangInt(rawBalance, 0));
}

function readStatementBalance(statement) {
  if (!statement || !hasAnyOwn(statement, BALANCE_KEYS)) return 0;
  return clampSatang(pickFirstDefined(statement, BALANCE_KEYS));
}

function hasRealMinimum(statement) {
  if (!statement || !hasAnyOwn(statement, MINIMUM_KEYS)) return false;
  const value = pickFirstDefined(statement, MINIMUM_KEYS);
  return Number.isFinite(Number(value)) && clampSatang(value) > 0;
}

function readMinimumDue(statement, balance, options = {}) {
  const warnings = [];
  const minimumMode = String(options.minimumMode || "real").toLowerCase().trim();
  const hasMinimum = hasRealMinimum(statement);

  if (hasMinimum) {
    const minimumDue = Math.min(balance, clampSatang(pickFirstDefined(statement, MINIMUM_KEYS)));
    if (minimumDue < clampSatang(pickFirstDefined(statement, MINIMUM_KEYS))) warnings.push("minimum_due_capped_to_balance");
    return { minimumDue, warnings };
  }

  if (balance > 0 && minimumMode === "estimated") {
    const pct = Math.max(0, Number(options.estimatedMinimumPct ?? 0.1) || 0);
    const minimumDue = Math.min(balance, Math.ceil(balance * pct));
    warnings.push("minimum_due_estimated");
    return { minimumDue, warnings };
  }

  if (balance > 0) warnings.push("missing_minimum_due");
  return { minimumDue: 0, warnings };
}

function statementMonth(statement) {
  return normalizeMonthKey(statement?.month ?? statement?.monthKey ?? statement?.statementDate ?? statement?.dueDate);
}

function pickStatement(statements, accountId, month) {
  const targetMonth = normalizeMonthKey(month);
  const matches = listOf(statements).filter((statement) => {
    if (String(statement?.accountId ?? statement?.account_id ?? "") !== accountId) return false;
    return targetMonth ? statementMonth(statement) === targetMonth : true;
  });

  if (!matches.length) return null;

  return [...matches].sort((left, right) => {
    const byMonth = statementMonth(right).localeCompare(statementMonth(left));
    if (byMonth !== 0) return byMonth;
    const byStatementDate = normalizeIsoDate(right?.statementDate ?? right?.statement_date).localeCompare(
      normalizeIsoDate(left?.statementDate ?? left?.statement_date)
    );
    if (byStatementDate !== 0) return byStatementDate;
    const byDueDate = normalizeIsoDate(right?.dueDate ?? right?.due_date).localeCompare(
      normalizeIsoDate(left?.dueDate ?? left?.due_date)
    );
    if (byDueDate !== 0) return byDueDate;
    const byUpdated = ensureSatangInt(right?.updatedAt ?? right?.updated_at, 0) - ensureSatangInt(left?.updatedAt ?? left?.updated_at, 0);
    if (byUpdated !== 0) return byUpdated;
    return String(left?.id || "").localeCompare(String(right?.id || ""));
  })[0];
}

function addWarning(warnings, warning) {
  if (warning && !warnings.includes(warning)) warnings.push(warning);
}

function dueSortValue(card) {
  return card.dueDate || "9999-12-31";
}

function sortCardsByStrategy(cards, strategy) {
  const selected = String(strategy || "avalanche").toLowerCase().trim();
  const normalized = selected === "snowball" || selected === "due_date" ? selected : "avalanche";

  return [...cards].sort((left, right) => {
    if (normalized === "snowball") {
      const byBalance = left.balance - right.balance;
      if (byBalance !== 0) return byBalance;
      const byDueDate = dueSortValue(left).localeCompare(dueSortValue(right));
      if (byDueDate !== 0) return byDueDate;
      const byApr = right.apr - left.apr;
      if (byApr !== 0) return byApr;
    } else if (normalized === "due_date") {
      const byDueDate = dueSortValue(left).localeCompare(dueSortValue(right));
      if (byDueDate !== 0) return byDueDate;
      const byApr = right.apr - left.apr;
      if (byApr !== 0) return byApr;
      const byBalance = right.balance - left.balance;
      if (byBalance !== 0) return byBalance;
    } else {
      const byApr = right.apr - left.apr;
      if (byApr !== 0) return byApr;
      const byBalance = right.balance - left.balance;
      if (byBalance !== 0) return byBalance;
      const byDueDate = dueSortValue(left).localeCompare(dueSortValue(right));
      if (byDueDate !== 0) return byDueDate;
    }

    return String(left.accountId).localeCompare(String(right.accountId));
  });
}

function strategyReason(strategy) {
  const selected = String(strategy || "avalanche").toLowerCase().trim();
  if (selected === "snowball") return "Smallest balance after minimums";
  if (selected === "due_date") return "Earliest due date after minimums";
  return "Highest APR after minimums";
}

function allocateShortfall(cards, paymentBudget, totalMinimum, strategy) {
  const allocations = new Map(cards.map((card) => [card.accountId, 0]));
  const minimumCards = cards.filter((card) => card.balance > 0 && card.minimumDue > 0);
  let spent = 0;

  for (const card of minimumCards) {
    const amount = Math.min(card.minimumDue, Math.floor((paymentBudget * card.minimumDue) / totalMinimum));
    allocations.set(card.accountId, amount);
    spent += amount;
  }

  let remaining = Math.max(0, paymentBudget - spent);
  const priority = sortCardsByStrategy(minimumCards, strategy);

  while (remaining > 0) {
    let changed = false;
    for (const card of priority) {
      if (remaining <= 0) break;
      const current = allocations.get(card.accountId) || 0;
      const room = Math.min(card.minimumDue, card.balance) - current;
      if (room <= 0) continue;
      const add = Math.min(room, remaining);
      allocations.set(card.accountId, current + add);
      remaining -= add;
      changed = true;
    }
    if (!changed) break;
  }

  return allocations;
}

export function buildCreditDebtSnapshot({ accounts, transactions, creditStatements, month, minimumMode, estimatedMinimumPct } = {}) {
  const accountList = listOf(accounts);
  const transactionList = listOf(transactions);
  const warnings = [];
  const monthKey = normalizeMonthKey(month);

  const cards = accountList
    .filter((account) => isCreditAccount(account))
    .map((account) => {
      const accountId = String(account?.id || "").trim();
      const rawBalance = accountLedgerBalanceSatang(account, transactionList);
      const currentBalance = readDebtOwed(account, rawBalance);
      const statement = pickStatement(creditStatements, accountId, monthKey);
      const statementBalance = readStatementBalance(statement);
      const balance = statementBalance > 0 ? Math.min(currentBalance, statementBalance) : currentBalance;
      const dueDate = normalizeIsoDate(statement?.dueDate ?? statement?.due_date) || accountDueDateForMonth(account, monthKey);
      const statementDate = normalizeIsoDate(statement?.statementDate ?? statement?.statement_date);
      const cardWarnings = [];
      const minimum = readMinimumDue(statement, balance, { minimumMode, estimatedMinimumPct });

      for (const warning of minimum.warnings) {
        addWarning(cardWarnings, warning);
        if (warning === "missing_minimum_due" || warning === "minimum_due_estimated") addWarning(warnings, warning);
      }

      return {
        accountId,
        name: String(account?.name || "Credit card"),
        balance,
        currentBalance,
        statementBalance,
        minimumDue: minimum.minimumDue,
        dueDate,
        statementDate,
        apr: readApr(account, statement),
        statementId: statement?.id || "",
        statementStatus: statement?.status || "",
        reason: balance > 0 ? "Statement minimum loaded" : "No outstanding card balance",
        warnings: cardWarnings,
      };
    });

  const totalBalance = cards.reduce((sum, card) => sum + card.balance, 0);
  const totalMinimum = cards.reduce((sum, card) => sum + card.minimumDue, 0);

  return {
    cards,
    totals: {
      totalBalance,
      totalMinimum,
    },
    warnings,
  };
}

export function planCreditCardPayments({
  accounts,
  transactions,
  creditStatements,
  month,
  availableCashToPay,
  minimumCashBuffer,
  strategy = "avalanche",
  minimumMode,
  estimatedMinimumPct,
} = {}) {
  const snapshot = buildCreditDebtSnapshot({
    accounts,
    transactions,
    creditStatements,
    month,
    minimumMode,
    estimatedMinimumPct,
  });
  const availableCash = clampSatang(availableCashToPay);
  const cashBuffer = clampSatang(minimumCashBuffer);
  const paymentBudget = Math.max(0, availableCash - cashBuffer);
  const warnings = [...snapshot.warnings];
  const normalizedStrategy = ["avalanche", "snowball", "due_date"].includes(String(strategy || "").toLowerCase().trim())
    ? String(strategy || "").toLowerCase().trim()
    : "avalanche";

  if (cashBuffer > 0) addWarning(warnings, "minimum_cash_buffer_reserved");
  if (availableCash < cashBuffer) addWarning(warnings, "cash_below_minimum_buffer");

  const totalMinimum = snapshot.totals.totalMinimum;
  const plannedCards = snapshot.cards.map((card) => ({
    ...card,
    recommendedPayment: 0,
    extraPayment: 0,
  }));

  if (paymentBudget <= 0) {
    if (totalMinimum > 0) addWarning(warnings, "cash_shortfall_minimum_due");
    const cards = plannedCards.map((card) => ({
      ...card,
      reason: card.balance > 0 ? "No cash available after buffer" : "No outstanding card balance",
      warnings: card.minimumDue > 0 ? [...card.warnings, "minimum_due_not_fully_funded"] : card.warnings,
    }));
    return {
      cards,
      totals: {
        totalMinimum,
        totalRecommended: 0,
        cashAfterPayments: availableCash,
      },
      warnings,
    };
  }

  if (totalMinimum > paymentBudget) {
    addWarning(warnings, "cash_shortfall_minimum_due");
    const allocations = allocateShortfall(plannedCards, paymentBudget, totalMinimum, normalizedStrategy);
    const cards = plannedCards.map((card) => {
      const recommendedPayment = Math.min(card.balance, allocations.get(card.accountId) || 0);
      const cardWarnings = recommendedPayment < card.minimumDue ? [...card.warnings, "minimum_due_not_fully_funded"] : card.warnings;
      return {
        ...card,
        recommendedPayment,
        extraPayment: 0,
        reason: recommendedPayment > 0 ? "Partial minimum due within available cash" : "Minimum due not funded",
        warnings: cardWarnings,
      };
    });
    const totalRecommended = cards.reduce((sum, card) => sum + card.recommendedPayment, 0);
    return {
      cards,
      totals: {
        totalMinimum,
        totalRecommended,
        cashAfterPayments: availableCash - totalRecommended,
      },
      warnings,
    };
  }

  for (const card of plannedCards) {
    card.recommendedPayment = Math.min(card.balance, card.minimumDue);
    card.reason = card.recommendedPayment > 0 ? "Minimum due" : "No outstanding card balance";
  }

  let extraBudget = paymentBudget - totalMinimum;
  const priority = sortCardsByStrategy(
    plannedCards.filter((card) => card.balance > 0),
    normalizedStrategy
  );
  const reason = strategyReason(normalizedStrategy);

  for (const card of priority) {
    if (extraBudget <= 0) break;
    const planned = plannedCards.find((item) => item.accountId === card.accountId);
    if (!planned) continue;
    const room = Math.max(0, planned.balance - planned.recommendedPayment);
    if (room <= 0) continue;
    const add = Math.min(room, extraBudget);
    planned.recommendedPayment += add;
    planned.extraPayment += add;
    planned.reason = reason;
    extraBudget -= add;
  }

  const cards = plannedCards.map((card) => ({
    ...card,
    recommendedPayment: Math.min(card.balance, card.recommendedPayment),
    extraPayment: Math.max(0, Math.min(card.balance, card.recommendedPayment) - card.minimumDue),
  }));
  const totalRecommended = cards.reduce((sum, card) => sum + card.recommendedPayment, 0);

  return {
    cards,
    totals: {
      totalMinimum,
      totalRecommended,
      cashAfterPayments: availableCash - totalRecommended,
    },
    warnings,
  };
}
