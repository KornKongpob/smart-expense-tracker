function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toInt(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.trunc(number);
}

function clampPositiveInt(value, fallback = 0) {
  return Math.max(0, toInt(value, fallback));
}

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function cleanNullableText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function sanitizeIsoDate(value) {
  const text = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function sanitizeMonthValue(value) {
  const text = cleanText(value);
  return /^\d{4}-\d{2}$/.test(text) ? text : todayMonth();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function todayMonth() {
  return new Date().toISOString().slice(0, 7);
}

function lastDayOfMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function buildUtcDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function addDays(isoDate, days) {
  const base = parseIsoDate(isoDate);
  if (!base) return "";
  const next = new Date(base.getTime());
  next.setUTCDate(next.getUTCDate() + Math.trunc(days || 0));
  return next.toISOString().slice(0, 10);
}

function parseIsoDate(value) {
  const iso = sanitizeIsoDate(value);
  if (!iso) return null;
  return new Date(`${iso}T00:00:00.000Z`);
}

function getMonthFromIso(value) {
  const iso = sanitizeIsoDate(value);
  return iso ? iso.slice(0, 7) : "";
}

function isBetweenInclusive(target, start, end) {
  const safeTarget = sanitizeIsoDate(target);
  const safeStart = sanitizeIsoDate(start);
  const safeEnd = sanitizeIsoDate(end);
  if (!safeTarget || !safeStart || !safeEnd) return false;
  return safeTarget >= safeStart && safeTarget <= safeEnd;
}

function getGoalStatus(value) {
  const status = cleanText(value, "active").toLowerCase();
  if (status === "paused" || status === "completed" || status === "archived") return status;
  return "active";
}

function getDebtStatus(value) {
  const status = cleanText(value, "active").toLowerCase();
  if (status === "paused" || status === "paid_off" || status === "archived") return status;
  return "active";
}

function isGoalActive(goal) {
  return getGoalStatus(goal?.status) === "active";
}

function isDebtActive(plan) {
  return getDebtStatus(plan?.status) === "active";
}

export function normalizeFinancialGoals(rows) {
  return toArray(rows).map((row) => ({
    ...row,
    name: cleanText(row?.name, "เป้าหมายการเงิน"),
    target_amount_satang: clampPositiveInt(row?.target_amount_satang),
    current_amount_satang: clampPositiveInt(row?.current_amount_satang),
    monthly_contribution_satang: clampPositiveInt(row?.monthly_contribution_satang),
    target_date: sanitizeIsoDate(row?.target_date),
    linked_account_id: row?.linked_account_id != null ? Number(row.linked_account_id) : null,
    status: getGoalStatus(row?.status),
  }));
}

export function normalizeDebtPlans(rows) {
  return toArray(rows).map((row) => ({
    ...row,
    account_id: row?.account_id != null ? Number(row.account_id) : null,
    current_balance_satang: clampPositiveInt(row?.current_balance_satang),
    minimum_payment_satang: clampPositiveInt(row?.minimum_payment_satang ?? row?.minimumPaymentSatang),
    target_payment_satang: clampPositiveInt(row?.target_payment_satang),
    apr_bps: Math.max(0, toInt(row?.apr_bps ?? row?.aprBps, 0)),
    due_day:
      row?.due_day != null && row?.due_day !== ""
        ? Math.max(1, Math.min(31, Math.trunc(Number(row.due_day) || 1)))
        : null,
    payoff_target_date: sanitizeIsoDate(row?.payoff_target_date),
    note: cleanNullableText(row?.note),
    status: getDebtStatus(row?.status),
  }));
}

export function getGoalProgressPercent(goal) {
  const target = clampPositiveInt(goal?.target_amount_satang);
  const current = clampPositiveInt(goal?.current_amount_satang);
  if (!target) return 0;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

export function getGoalRemainingSatang(goal) {
  return Math.max(
    0,
    clampPositiveInt(goal?.target_amount_satang) - clampPositiveInt(goal?.current_amount_satang),
  );
}

export function getNextDebtDueDateISO(plan, referenceDate = todayDate()) {
  const safeToday = sanitizeIsoDate(referenceDate) || todayDate();
  const dueDay =
    plan?.due_day != null && plan?.due_day !== ""
      ? Math.max(1, Math.min(31, Math.trunc(Number(plan.due_day) || 1)))
      : null;

  if (!dueDay) {
    return sanitizeIsoDate(plan?.payoff_target_date) || "";
  }

  const [yearText, monthText, dayText] = safeToday.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const todayDay = Number(dayText);

  const currentMonthDay = Math.min(dueDay, lastDayOfMonth(year, monthIndex));
  const currentMonthIso = buildUtcDate(year, monthIndex, currentMonthDay).toISOString().slice(0, 10);
  if (todayDay <= currentMonthDay) {
    return currentMonthIso;
  }

  const nextMonthIndex = monthIndex === 11 ? 0 : monthIndex + 1;
  const nextMonthYear = monthIndex === 11 ? year + 1 : year;
  const nextMonthDay = Math.min(dueDay, lastDayOfMonth(nextMonthYear, nextMonthIndex));
  return buildUtcDate(nextMonthYear, nextMonthIndex, nextMonthDay).toISOString().slice(0, 10);
}

export function buildPlannerSnapshot({ goals = [], debts = [], monthValue = todayMonth(), today = todayDate() } = {}) {
  const safeMonth = sanitizeMonthValue(monthValue);
  const normalizedGoals = normalizeFinancialGoals(goals);
  const normalizedDebts = normalizeDebtPlans(debts);
  const activeGoals = normalizedGoals.filter(isGoalActive);
  const activeDebts = normalizedDebts.filter(isDebtActive);

  const totalGoalTargetSatang = activeGoals.reduce(
    (sum, goal) => sum + clampPositiveInt(goal.target_amount_satang),
    0,
  );
  const totalGoalCurrentSatang = activeGoals.reduce(
    (sum, goal) => sum + clampPositiveInt(goal.current_amount_satang),
    0,
  );
  const totalDebtBalanceSatang = activeDebts.reduce(
    (sum, plan) => sum + clampPositiveInt(plan.current_balance_satang),
    0,
  );
  const monthlyPlannedPaymentSatang = activeDebts.reduce((sum, plan) => {
    const dueDate = getNextDebtDueDateISO(plan, today);
    if (getMonthFromIso(dueDate) !== safeMonth) return sum;
    return sum + clampPositiveInt(plan.target_payment_satang);
  }, 0);

  const dueSoonCount = buildPlannerReminders({
    goals: activeGoals,
    debts: activeDebts,
    today,
  }).length;

  return {
    activeGoalCount: activeGoals.length,
    activeDebtCount: activeDebts.length,
    totalGoalTargetSatang,
    totalGoalCurrentSatang,
    totalDebtBalanceSatang,
    monthlyPlannedPaymentSatang,
    dueSoonCount,
    goalProgressPercent:
      totalGoalTargetSatang > 0
        ? Math.max(0, Math.min(100, Math.round((totalGoalCurrentSatang / totalGoalTargetSatang) * 100)))
        : 0,
  };
}

export function buildPlannerReminders({
  goals = [],
  debts = [],
  today = todayDate(),
  daysAhead = 7,
  accountsById = new Map(),
} = {}) {
  const safeToday = sanitizeIsoDate(today) || todayDate();
  const reminderEnd = addDays(safeToday, daysAhead);
  const reminders = [];

  for (const goal of normalizeFinancialGoals(goals)) {
    if (!isGoalActive(goal)) continue;
    if (!goal.target_date || !isBetweenInclusive(goal.target_date, safeToday, reminderEnd)) continue;

    reminders.push({
      id: `goal-${goal.id || goal.legacy_id || goal.name}`,
      type: "goal",
      due_date: goal.target_date,
      title: goal.name,
      copy: getGoalRemainingSatang(goal) > 0 ? "เป้าหมายใกล้ถึงกำหนด" : "ใกล้ถึงวันที่ตั้งเป้าไว้",
      amount_satang: getGoalRemainingSatang(goal),
      linked_account_id: goal.linked_account_id,
    });
  }

  for (const plan of normalizeDebtPlans(debts)) {
    if (!isDebtActive(plan)) continue;

    const nextDueDate = getNextDebtDueDateISO(plan, safeToday);
    if (!nextDueDate || !isBetweenInclusive(nextDueDate, safeToday, reminderEnd)) continue;

    const accountName = cleanText(
      accountsById.get(Number(plan.account_id))?.name,
      "แผนชำระหนี้",
    );

    reminders.push({
      id: `debt-${plan.id || plan.legacy_id || plan.account_id || nextDueDate}`,
      type: "debt",
      due_date: nextDueDate,
      title: accountName,
      copy: `ครบกำหนดชำระภายใน ${daysAhead} วัน`,
      amount_satang: clampPositiveInt(plan.target_payment_satang),
      account_id: plan.account_id,
    });
  }

  return reminders.sort((left, right) => {
    const byDate = String(left.due_date || "").localeCompare(String(right.due_date || ""));
    if (byDate !== 0) return byDate;
    return String(left.title || "").localeCompare(String(right.title || ""), "th");
  });
}

export function buildFinancialGoalPayload(input) {
  const linkedAccountValue = input?.linked_account_id ?? input?.linkedAccountId;
  return {
    id: input?.id ? Number(input.id) : null,
    legacy_id: cleanNullableText(input?.legacy_id),
    name: cleanText(input?.name, "เป้าหมายการเงิน"),
    target_amount_satang: clampPositiveInt(
      input?.target_amount_satang ?? input?.targetAmountSatang,
    ),
    current_amount_satang: clampPositiveInt(
      input?.current_amount_satang ?? input?.currentAmountSatang,
    ),
    target_date: sanitizeIsoDate(input?.target_date ?? input?.targetDate),
    monthly_contribution_satang: clampPositiveInt(
      input?.monthly_contribution_satang ?? input?.monthlyContributionSatang,
    ),
    linked_account_id:
      linkedAccountValue != null && linkedAccountValue !== ""
        ? Number(linkedAccountValue)
        : null,
    status: getGoalStatus(input?.status),
  };
}

export function buildDebtPlanPayload(input) {
  const dueValue = input?.due_day ?? input?.dueDay;
  const accountValue = input?.account_id ?? input?.accountId;
  return {
    id: input?.id ? Number(input.id) : null,
    legacy_id: cleanNullableText(input?.legacy_id),
    account_id: accountValue != null && accountValue !== "" ? Number(accountValue) : null,
    current_balance_satang: clampPositiveInt(
      input?.current_balance_satang ?? input?.currentBalanceSatang,
    ),
    minimum_payment_satang: clampPositiveInt(
      input?.minimum_payment_satang ?? input?.minimumPaymentSatang,
    ),
    target_payment_satang: clampPositiveInt(
      input?.target_payment_satang ?? input?.targetPaymentSatang,
    ),
    apr_bps: Math.max(0, toInt(input?.apr_bps ?? input?.aprBps, 0)),
    due_day:
      dueValue != null && dueValue !== ""
        ? Math.max(1, Math.min(31, Math.trunc(Number(dueValue) || 1)))
        : null,
    payoff_target_date: sanitizeIsoDate(input?.payoff_target_date ?? input?.payoffTargetDate),
    status: getDebtStatus(input?.status),
    note: cleanNullableText(input?.note),
  };
}
