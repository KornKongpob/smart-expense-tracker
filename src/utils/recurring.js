import { parseDateSafe, toISODate } from "./format.js";

const safeNum = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const clampInt = (value, min, max, fallback) => {
  const num = Math.trunc(safeNum(value, fallback));
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
};

export function addDaysLocal(dateObj, days) {
  const base = parseDateSafe(dateObj);
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonthsClampedLocal(dateObj, months, anchorDay = parseDateSafe(dateObj).getDate()) {
  const base = parseDateSafe(dateObj);
  const target = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const day = Math.min(clampInt(anchorDay, 1, 31, base.getDate()), lastDay);
  return new Date(target.getFullYear(), target.getMonth(), day);
}

export function getRecurringAnchorDay(recurring) {
  const explicitAnchor = recurring?.anchorDay ?? recurring?.anchor_day;
  const anchoredDay = clampInt(explicitAnchor, 1, 31, NaN);
  if (Number.isFinite(anchoredDay)) return anchoredDay;

  const source =
    recurring?.startDate ||
    recurring?.start_date ||
    recurring?.lastGenerated ||
    recurring?.last_generated_date ||
    new Date();
  return parseDateSafe(source).getDate();
}

export function advanceRecurringDate(dateObj, frequency, interval, anchorDay = parseDateSafe(dateObj).getDate()) {
  const step = clampInt(interval, 1, 120, 1);
  if (frequency === "daily") return addDaysLocal(dateObj, step);
  if (frequency === "weekly") return addDaysLocal(dateObj, 7 * step);
  if (frequency === "yearly") return addMonthsClampedLocal(dateObj, 12 * step, anchorDay);
  return addMonthsClampedLocal(dateObj, step, anchorDay);
}

export function getNextRecurringDueDate(recurring, todayISO = toISODate(new Date())) {
  const start = parseDateSafe(recurring?.startDate || recurring?.start_date || todayISO);
  const anchorDay = getRecurringAnchorDay(recurring);
  const lastGenerated = recurring?.lastGenerated || recurring?.last_generated_date;
  const interval = recurring?.interval ?? recurring?.interval_count;
  return lastGenerated
    ? advanceRecurringDate(parseDateSafe(lastGenerated), recurring.frequency, interval, anchorDay)
    : start;
}

export function getNextRecurringDueISO(recurring, todayISO = toISODate(new Date())) {
  return toISODate(getNextRecurringDueDate(recurring, todayISO));
}

export function isRecurringDue(recurring, todayISO = toISODate(new Date())) {
  const nextDue = getNextRecurringDueDate(recurring, todayISO).getTime();
  const today = parseDateSafe(todayISO).getTime();
  return nextDue <= today;
}

export function getRecurringDueCount(list, todayISO = toISODate(new Date())) {
  return (Array.isArray(list) ? list : []).filter(
    (recurring) => recurring?.enabled !== false && isRecurringDue(recurring, todayISO),
  ).length;
}
