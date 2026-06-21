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

export function clampBillingDay(day) {
  const number = Math.trunc(Number(day));
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(31, number));
}

export function getNextStatementDate(statementDay, today = new Date()) {
  const base = toLocalDate(today);
  let candidate = dateForBillingDay(base.getFullYear(), base.getMonth(), statementDay);

  if (candidate.getTime() < base.getTime()) {
    candidate = dateForBillingDay(base.getFullYear(), base.getMonth() + 1, statementDay);
  }

  return toISODateLocal(candidate);
}

export function getNextDueDate(statementDay, dueDay, today = new Date()) {
  const base = toLocalDate(today);
  const dueMonthOffset = clampBillingDay(dueDay) < clampBillingDay(statementDay) ? 1 : 0;
  const candidates = [-1, 0, 1, 2]
    .map((monthOffset) => {
      const statement = dateForBillingDay(base.getFullYear(), base.getMonth() + monthOffset, statementDay);
      return dateForBillingDay(statement.getFullYear(), statement.getMonth() + dueMonthOffset, dueDay);
    })
    .filter((date) => date.getTime() >= base.getTime())
    .sort((a, b) => a.getTime() - b.getTime());

  return toISODateLocal(candidates[0] || dateForBillingDay(base.getFullYear(), base.getMonth() + dueMonthOffset, dueDay));
}
