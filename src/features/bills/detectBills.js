import {
  getTransactionType,
  isSplitParentTransaction,
  isTransferTransaction,
  TRANSACTION_TYPES,
} from "../../domain/ledger/transactionTypes.js";
import { parseDateSafe, toISODate } from "../../utils/format.js";
import { advanceRecurringDate, getRecurringAnchorDay } from "../../utils/recurring.js";
import { ensureSatangInt } from "../../utils/money.js";

const MS_PER_DAY = 86_400_000;
const DEFAULT_AMOUNT_TOLERANCE_PCT = 0.05;
const DEFAULT_AMOUNT_TOLERANCE_SATANG = 500;

const SUBSCRIPTION_WORDS = [
  "subscription",
  "member",
  "membership",
  "premium",
  "streaming",
  "netflix",
  "spotify",
  "youtube",
  "google",
  "icloud",
  "apple",
  "microsoft",
  "adobe",
  "disney",
  "prime",
];

const BILL_WORDS = [
  "bill",
  "utility",
  "utilities",
  "electric",
  "water",
  "internet",
  "phone",
  "mobile",
  "rent",
  "insurance",
  "loan",
  "mortgage",
  "tuition",
  "tax",
];

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function toInt(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.trunc(number);
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function amountOf(value) {
  return Math.abs(ensureSatangInt(value, 0));
}

function readAmount(source) {
  return amountOf(source?.amount ?? source?.amountSatang ?? source?.amount_satang);
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeIsoDate(value) {
  const text = String(value || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function daysBetween(startIso, endIso) {
  const start = parseDateSafe(startIso);
  const end = parseDateSafe(endIso);
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

function addDaysIso(isoDate, days) {
  const date = parseDateSafe(isoDate);
  date.setDate(date.getDate() + toInt(days, 0));
  return toISODate(date);
}

function addMonthsIso(isoDate, months) {
  const base = parseDateSafe(isoDate);
  const target = new Date(base.getFullYear(), base.getMonth() + toInt(months, 1), 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(base.getDate(), lastDay));
  return toISODate(target);
}

function advanceIso(isoDate, interval, intervalCount = 1) {
  const step = Math.max(1, toInt(intervalCount, 1));
  if (interval === "weekly") return addDaysIso(isoDate, 7 * step);
  if (interval === "monthly") return addMonthsIso(isoDate, step);
  return addDaysIso(isoDate, 30 * step);
}

function nextAfterDate(isoDate, interval, todayIso, intervalCount = 1) {
  let next = advanceIso(isoDate, interval, intervalCount);
  let guard = 0;
  while (todayIso && next < todayIso && guard < 120) {
    next = advanceIso(next, interval, intervalCount);
    guard += 1;
  }
  return next;
}

function amountTolerance(a, b, options = {}) {
  const pct = Number(options.amountTolerancePct ?? DEFAULT_AMOUNT_TOLERANCE_PCT);
  const fixed = Math.max(0, toInt(options.amountToleranceSatang, DEFAULT_AMOUNT_TOLERANCE_SATANG));
  const percentTolerance = Math.round(Math.max(Math.abs(a || 0), Math.abs(b || 0)) * (Number.isFinite(pct) ? pct : DEFAULT_AMOUNT_TOLERANCE_PCT));
  return Math.max(fixed, percentTolerance);
}

function amountsSimilar(a, b, options = {}) {
  return Math.abs(toInt(a, 0) - toInt(b, 0)) <= amountTolerance(a, b, options);
}

function stableId(input) {
  const text = String(input || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function candidateFromTransaction(tx) {
  if (!tx || typeof tx !== "object") return null;
  if (isTransferTransaction(tx) || isSplitParentTransaction(tx)) return null;

  const txType = getTransactionType(tx);
  if (txType !== TRANSACTION_TYPES.EXPENSE && txType !== TRANSACTION_TYPES.INCOME) return null;

  const amount = readAmount(tx);
  const date = sanitizeIsoDate(tx.date ?? tx.transactionDate ?? tx.postedDate);
  if (!amount || !date) return null;

  const merchant = cleanText(tx.merchant || tx.payee || tx.counterparty || "");
  const note = cleanText(tx.note || tx.description || tx.memo || "");
  const label = merchant || note;
  const normalizedLabel = normalizeText(label);
  if (!normalizedLabel) return null;

  const categoryId = cleanText(tx.categoryId || tx.category_id || tx.category || "");
  const accountId = cleanText(tx.accountId || tx.account_id || "");

  return {
    tx,
    date,
    amount,
    merchant,
    note,
    label,
    normalizedLabel,
    categoryId,
    accountId,
    txType,
  };
}

function groupKey(candidate) {
  return [
    candidate.normalizedLabel,
    normalizeText(candidate.categoryId) || "*",
    normalizeText(candidate.accountId) || "*",
    candidate.txType,
  ].join("|");
}

function collapseSameDate(candidates) {
  const byDate = new Map();
  for (const candidate of candidates) {
    byDate.set(candidate.date, candidate);
  }
  return [...byDate.values()].sort((left, right) => {
    const byDate = String(left.date).localeCompare(String(right.date));
    if (byDate !== 0) return byDate;
    return left.amount - right.amount;
  });
}

function intervalScore(occurrences, interval, options = {}) {
  const minimumOccurrences = interval === "weekly"
    ? Math.max(3, toInt(options.minWeeklyOccurrences, 3))
    : Math.max(2, toInt(options.minMonthlyOccurrences, 2));
  if (occurrences.length < minimumOccurrences) return null;

  const diffs = [];
  for (let index = 1; index < occurrences.length; index += 1) {
    const diff = daysBetween(occurrences[index - 1].date, occurrences[index].date);
    if (diff > 0) diffs.push(diff);
  }
  if (!diffs.length) return null;

  const matches = diffs.filter((diff) =>
    interval === "weekly" ? diff >= 6 && diff <= 8 : diff >= 25 && diff <= 35,
  ).length;
  const ratio = matches / diffs.length;
  if (ratio < Number(options.minIntervalMatchRatio ?? 0.75)) return null;

  return { interval, ratio, diffs, matches };
}

function detectInterval(occurrences, options = {}) {
  const weekly = intervalScore(occurrences, "weekly", options);
  const monthly = intervalScore(occurrences, "monthly", options);

  if (weekly && (!monthly || weekly.ratio > monthly.ratio)) return weekly;
  if (monthly) return monthly;
  return null;
}

function detectAmountPattern(occurrences, options = {}) {
  if (occurrences.length < 2) {
    return {
      accepted: true,
      score: 1,
      priceChange: null,
    };
  }

  let similarPairs = 0;
  for (let index = 1; index < occurrences.length; index += 1) {
    if (amountsSimilar(occurrences[index - 1].amount, occurrences[index].amount, options)) {
      similarPairs += 1;
    }
  }

  const pairCount = occurrences.length - 1;
  const consistency = pairCount ? similarPairs / pairCount : 1;
  const previous = occurrences.slice(0, -1);
  const previousAverage = Math.round(
    previous.reduce((sum, item) => sum + item.amount, 0) / Math.max(1, previous.length),
  );
  const last = occurrences[occurrences.length - 1];
  const lastDelta = last.amount - previousAverage;
  const hasPriceIncrease =
    previous.length >= 2 &&
    lastDelta > amountTolerance(previousAverage, last.amount, options) &&
    previous.every((item) => amountsSimilar(item.amount, previousAverage, options));

  const accepted = consistency >= 0.6 || hasPriceIncrease;
  return {
    accepted,
    score: hasPriceIncrease ? Math.max(0.7, consistency) : consistency,
    priceChange: hasPriceIncrease
      ? {
          previousAmount: previousAverage,
          currentAmount: last.amount,
          delta: lastDelta,
          pct: previousAverage > 0 ? lastDelta / previousAverage : 0,
          date: last.date,
        }
      : null,
  };
}

function classifyBillType({ txType, label, categoryId }) {
  if (txType === TRANSACTION_TYPES.INCOME) return "income";

  const text = normalizeText(`${label || ""} ${categoryId || ""}`);
  if (SUBSCRIPTION_WORDS.some((word) => text.includes(normalizeText(word)))) return "subscription";
  if (BILL_WORDS.some((word) => text.includes(normalizeText(word)))) return "bill";
  return "unknown";
}

function publicDetectedBill(item) {
  return {
    id: item.id,
    merchant: item.merchant,
    label: item.label,
    amount: item.amount,
    interval: item.interval,
    confidence: item.confidence,
    lastDate: item.lastDate,
    nextExpectedDate: item.nextExpectedDate,
    categoryId: item.categoryId,
    accountId: item.accountId,
    occurrenceCount: item.occurrenceCount,
    type: item.type,
  };
}

function detectRecurringChargesInternal(transactions, options = {}) {
  const todayIso = sanitizeIsoDate(options.today) || toISODate(new Date());
  const groups = new Map();

  for (const tx of listOf(transactions)) {
    const candidate = candidateFromTransaction(tx);
    if (!candidate) continue;
    const key = groupKey(candidate);
    const group = groups.get(key) || [];
    group.push(candidate);
    groups.set(key, group);
  }

  const detected = [];
  for (const [key, rawOccurrences] of groups.entries()) {
    const occurrences = collapseSameDate(rawOccurrences);
    const interval = detectInterval(occurrences, options);
    if (!interval) continue;

    const amountPattern = detectAmountPattern(occurrences, options);
    if (!amountPattern.accepted) continue;

    const last = occurrences[occurrences.length - 1];
    const first = occurrences[0];
    const occurrenceScore = Math.min(1, occurrences.length / (interval.interval === "weekly" ? 4 : 3));
    const confidence = clamp01(
      interval.ratio * 0.4 +
        amountPattern.score * 0.35 +
        occurrenceScore * 0.2 +
        (last.date >= addDaysIso(todayIso, -45) ? 0.05 : 0),
    );

    const id = `det_bill_${stableId(key)}`;
    detected.push({
      id,
      merchant: first.merchant || "",
      label: first.label,
      amount: last.amount,
      interval: interval.interval,
      confidence: Math.round(confidence * 100) / 100,
      lastDate: last.date,
      nextExpectedDate: nextAfterDate(last.date, interval.interval, todayIso),
      categoryId: first.categoryId,
      accountId: first.accountId,
      occurrenceCount: occurrences.length,
      type: classifyBillType({
        txType: first.txType,
        label: first.label,
        categoryId: first.categoryId,
      }),
      source: "detected",
      priceChange: amountPattern.priceChange,
    });
  }

  return detected.sort((left, right) => {
    const byDate = String(left.nextExpectedDate).localeCompare(String(right.nextExpectedDate));
    if (byDate !== 0) return byDate;
    const byConfidence = right.confidence - left.confidence;
    if (byConfidence !== 0) return byConfidence;
    return String(left.label).localeCompare(String(right.label));
  });
}

export function detectRecurringCharges(transactions = [], options = {}) {
  return detectRecurringChargesInternal(transactions, options).map(publicDetectedBill);
}

function recurringType(recurring) {
  const type = String(recurring?.type || recurring?.txType || recurring?.kind || "").toLowerCase().trim();
  return type === "income" ? "income" : "expense";
}

function recurringInterval(recurring) {
  const frequency = String(recurring?.frequency || "").toLowerCase().trim();
  if (frequency === "weekly") return "weekly";
  if (frequency === "monthly") return "monthly";
  return "unknown";
}

function recurringNextDate(recurring, todayIso) {
  const startDate = sanitizeIsoDate(recurring?.startDate || recurring?.start_date || todayIso) || todayIso;
  const lastGenerated = sanitizeIsoDate(recurring?.lastGenerated || recurring?.last_generated_date);
  const frequency = String(recurring?.frequency || "monthly").toLowerCase().trim() || "monthly";
  const interval = Math.max(1, toInt(recurring?.interval ?? recurring?.interval_count, 1));
  const anchorDay = getRecurringAnchorDay(recurring);
  let due = lastGenerated
    ? advanceRecurringDate(parseDateSafe(lastGenerated), frequency, interval, anchorDay)
    : parseDateSafe(startDate);

  let guard = 0;
  while (toISODate(due) < todayIso && guard < 240) {
    due = advanceRecurringDate(due, frequency, interval, anchorDay);
    guard += 1;
  }

  return toISODate(due);
}

function recurringToBill(recurring, options = {}) {
  const todayIso = sanitizeIsoDate(options.today) || toISODate(new Date());
  const amount = readAmount(recurring);
  if (!amount || recurring?.enabled === false) return null;

  const label = cleanText(recurring?.merchant || recurring?.note || recurring?.label || recurring?.name || "Recurring");
  const interval = recurringInterval(recurring);
  const type = recurringType(recurring);
  const categoryId = cleanText(recurring?.categoryId || recurring?.category_id || recurring?.category || "");
  const accountId = cleanText(recurring?.accountId || recurring?.account_id || "");
  const id = `rec_bill_${cleanText(recurring?.id) || stableId(`${label}|${categoryId}|${accountId}`)}`;

  return {
    id,
    merchant: cleanText(recurring?.merchant || ""),
    label,
    amount,
    interval,
    confidence: 1,
    lastDate: sanitizeIsoDate(recurring?.lastGenerated || recurring?.last_generated_date) || "",
    nextExpectedDate: recurringNextDate(recurring, todayIso),
    categoryId,
    accountId,
    occurrenceCount: 0,
    type: type === "income" ? "income" : classifyBillType({ txType: TRANSACTION_TYPES.EXPENSE, label, categoryId }),
    source: "recurring",
  };
}

function billsMatchRecurring(recurringBill, detectedBill, options = {}) {
  if (!recurringBill || !detectedBill) return false;
  const recurringName = normalizeText(recurringBill.merchant || recurringBill.label);
  const detectedName = normalizeText(detectedBill.merchant || detectedBill.label);
  if (!recurringName || !detectedName || recurringName !== detectedName) return false;
  if (recurringBill.categoryId && detectedBill.categoryId && recurringBill.categoryId !== detectedBill.categoryId) return false;
  if (recurringBill.accountId && detectedBill.accountId && recurringBill.accountId !== detectedBill.accountId) return false;
  if (recurringBill.interval !== "unknown" && detectedBill.interval !== recurringBill.interval) return false;
  return amountsSimilar(recurringBill.amount, detectedBill.amount, options);
}

export function getUpcomingBills(state = {}, options = {}) {
  const recurringBills = listOf(state?.recurring)
    .map((recurring) => recurringToBill(recurring, options))
    .filter(Boolean);
  const detectedBills = detectRecurringChargesInternal(state?.transactions || [], options)
    .filter((detected) => !recurringBills.some((recurring) => billsMatchRecurring(recurring, detected, options)))
    .map(publicDetectedBill)
    .map((bill) => ({ ...bill, source: "detected" }));

  return [...recurringBills, ...detectedBills].sort((left, right) => {
    const byDate = String(left.nextExpectedDate || "9999-99-99").localeCompare(String(right.nextExpectedDate || "9999-99-99"));
    if (byDate !== 0) return byDate;
    return String(left.label).localeCompare(String(right.label));
  });
}

function monthlyAmountFor(bill) {
  const amount = amountOf(bill?.amount);
  if (bill?.interval === "weekly") return Math.round((amount * 52) / 12);
  if (bill?.interval === "monthly") return amount;
  return 0;
}

function buildPriceChanges(transactions, options = {}) {
  return detectRecurringChargesInternal(transactions, options)
    .filter((item) => item.priceChange && item.type !== "income")
    .map((item) => ({
      id: item.id,
      merchant: item.merchant,
      label: item.label,
      previousAmount: item.priceChange.previousAmount,
      currentAmount: item.priceChange.currentAmount,
      delta: item.priceChange.delta,
      pct: item.priceChange.pct,
      date: item.priceChange.date,
      nextExpectedDate: item.nextExpectedDate,
    }));
}

function buildRecommendations({ upcoming, dueSoon, priceChanges, subscriptionTotal }) {
  const recommendations = [];

  if (!upcoming.length) {
    recommendations.push({
      id: "bills-start-tracking",
      severity: "info",
      title: "Track regular bills",
      body: "Recurring transactions will appear here after a few matching payments.",
      actionView: "transactions",
    });
    return recommendations;
  }

  if (dueSoon.length) {
    recommendations.push({
      id: "bills-due-soon",
      severity: "warning",
      title: "Bills due soon",
      body: `${dueSoon.length} recurring item${dueSoon.length === 1 ? " is" : "s are"} expected soon.`,
      actionView: "bills",
    });
  }

  if (priceChanges.length) {
    recommendations.push({
      id: "bills-price-change",
      severity: "warning",
      title: "Review price changes",
      body: `${priceChanges.length} recurring charge${priceChanges.length === 1 ? " looks" : "s look"} higher than before.`,
      actionView: "bills",
    });
  }

  if (subscriptionTotal > 0) {
    recommendations.push({
      id: "bills-review-subscriptions",
      severity: "info",
      title: "Review subscriptions",
      body: "Check whether each subscription still fits this month plan.",
      actionView: "bills",
    });
  }

  return recommendations;
}

export function summarizeBills(state = {}, options = {}) {
  const todayIso = sanitizeIsoDate(options.today) || toISODate(new Date());
  const dueSoonDays = Math.max(0, toInt(options.dueSoonDays, 7));
  const upcoming = getUpcomingBills(state, options);
  const dueSoon = upcoming
    .map((bill) => {
      const date = sanitizeIsoDate(bill.nextExpectedDate);
      if (!date) return null;
      const daysUntilDue = daysBetween(todayIso, date);
      if (daysUntilDue < 0 || daysUntilDue > dueSoonDays) return null;
      return { ...bill, daysUntilDue };
    })
    .filter(Boolean);
  const priceChanges = buildPriceChanges(state?.transactions || [], options);
  const monthlySubscriptionTotal = upcoming.reduce((sum, bill) => {
    if (bill.type !== "subscription") return sum;
    return sum + monthlyAmountFor(bill);
  }, 0);
  const monthlyBillsTotal = upcoming.reduce((sum, bill) => {
    if (bill.type !== "bill") return sum;
    return sum + monthlyAmountFor(bill);
  }, 0);

  return {
    monthlySubscriptionTotal,
    monthlyBillsTotal,
    upcomingCount: upcoming.length,
    dueSoon,
    priceChanges,
    recommendations: buildRecommendations({
      upcoming,
      dueSoon,
      priceChanges,
      subscriptionTotal: monthlySubscriptionTotal,
    }),
  };
}

export default {
  detectRecurringCharges,
  getUpcomingBills,
  summarizeBills,
};
