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
  const source = recurring?.startDate || recurring?.lastGenerated || new Date();
  return parseDateSafe(source).getDate();
}

export function advanceRecurringDate(dateObj, frequency, interval, anchorDay = parseDateSafe(dateObj).getDate()) {
  const step = clampInt(interval, 1, 120, 1);
  if (frequency === "weekly") return addDaysLocal(dateObj, 7 * step);
  return addMonthsClampedLocal(dateObj, step, anchorDay);
}

export function getNextRecurringDueDate(recurring, todayISO = toISODate(new Date())) {
  const start = parseDateSafe(recurring?.startDate || todayISO);
  const anchorDay = getRecurringAnchorDay(recurring);
  return recurring?.lastGenerated
    ? advanceRecurringDate(parseDateSafe(recurring.lastGenerated), recurring.frequency, recurring.interval, anchorDay)
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
