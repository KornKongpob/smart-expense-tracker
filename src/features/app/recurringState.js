import { parseDateSafe, toISODate } from "../../utils/format.js";
import { advanceRecurringDate, getRecurringAnchorDay, getNextRecurringDueISO, isRecurringDue } from "../../utils/recurring.js";

export const MAX_RECURRING_CREATE_PER_RUN = 200;

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function cleanNullableText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function clampInt(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function clampPositiveInt(value, fallback = 0) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, number);
}

export function normalizeRecurringFrequency(value) {
  const frequency = String(value || "").trim().toLowerCase();
  if (frequency === "daily" || frequency === "weekly" || frequency === "monthly" || frequency === "yearly") {
    return frequency;
  }
  return "monthly";
}

export function normalizeRecurringKind(value) {
  const kind = String(value || "").trim().toLowerCase();
  if (kind === "income" || kind === "transfer") return kind;
  return "expense";
}

function sanitizeIsoDate(value, fallback = toISODate(new Date())) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return fallback;
}

export function normalizeRecurringRule(row) {
  const source = row && typeof row === "object" ? row : {};
  const kind = normalizeRecurringKind(source.kind);
  const startDate = sanitizeIsoDate(source.start_date || source.startDate);
  const lastGeneratedDate = cleanNullableText(source.last_generated_date || source.lastGenerated);
  const frequency = normalizeRecurringFrequency(source.frequency);
  const intervalCount = clampInt(source.interval_count ?? source.interval, 1, 120, 1);
  const anchorDay = clampInt(
    source.anchor_day,
    1,
    31,
    getRecurringAnchorDay({
      startDate,
      lastGenerated: lastGeneratedDate,
    }),
  );

  return {
    id: source.id != null ? Number(source.id) || source.id : null,
    legacy_id: cleanNullableText(source.legacy_id || source.legacyId),
    kind,
    amount_satang: clampPositiveInt(source.amount_satang ?? source.amountSatang ?? source.amount),
    account_id: kind === "transfer" ? null : cleanNullableText(source.account_id || source.accountId),
    from_account_id: kind === "transfer" ? cleanNullableText(source.from_account_id || source.fromAccountId) : null,
    to_account_id: kind === "transfer" ? cleanNullableText(source.to_account_id || source.toAccountId) : null,
    category_id: kind === "transfer" ? null : cleanNullableText(source.category_id || source.categoryId),
    merchant: cleanNullableText(source.merchant),
    note: cleanText(source.note, "Recurring"),
    frequency,
    interval_count: intervalCount,
    anchor_day: anchorDay,
    start_date: startDate,
    end_date: cleanNullableText(source.end_date || source.endDate),
    last_generated_date: lastGeneratedDate,
    enabled: source.enabled !== false,
    created_at: source.created_at || source.createdAt || null,
    updated_at: source.updated_at || source.updatedAt || null,
  };
}

export function normalizeRecurringRules(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => normalizeRecurringRule(row))
    .sort((left, right) => {
      const enabledDelta = Number(right.enabled === true) - Number(left.enabled === true);
      if (enabledDelta !== 0) return enabledDelta;
      const dueDelta = getNextRecurringDueISO(left).localeCompare(getNextRecurringDueISO(right));
      if (dueDelta !== 0) return dueDelta;
      return String(left.note || "").localeCompare(String(right.note || ""), "th");
    });
}

export function buildRecurringRulePayload(input) {
  const source = input && typeof input === "object" ? input : {};
  const kind = normalizeRecurringKind(source.kind);
  const startDate = sanitizeIsoDate(source.start_date || source.startDate);
  const lastGeneratedDate = cleanNullableText(source.last_generated_date || source.lastGeneratedDate);

  return normalizeRecurringRule({
    ...source,
    id: source.id ?? null,
    kind,
    amount_satang: source.amount_satang ?? source.amountSatang ?? source.amount,
    account_id: kind === "transfer" ? null : source.account_id ?? source.accountId,
    from_account_id:
      kind === "transfer" ? source.from_account_id ?? source.fromAccountId ?? source.account_id ?? source.accountId : null,
    to_account_id: kind === "transfer" ? source.to_account_id ?? source.toAccountId : null,
    category_id: kind === "transfer" ? null : source.category_id ?? source.categoryId,
    merchant: source.merchant,
    note: source.note,
    frequency: source.frequency,
    interval_count: source.interval_count ?? source.intervalCount ?? source.interval,
    anchor_day: source.anchor_day ?? source.anchorDay,
    start_date: startDate,
    end_date: source.end_date ?? source.endDate,
    last_generated_date: lastGeneratedDate,
    enabled: source.enabled,
  });
}

export function buildRecurringTransactionDraft(rule, dueDateISO) {
  const normalized = normalizeRecurringRule(rule);
  const date = sanitizeIsoDate(dueDateISO, normalized.start_date);

  return {
    kind: normalized.kind,
    accountId: normalized.account_id ? String(normalized.account_id) : "",
    fromAccountId: normalized.from_account_id ? String(normalized.from_account_id) : "",
    toAccountId: normalized.to_account_id ? String(normalized.to_account_id) : "",
    categoryId: normalized.category_id || "",
    amountSatang: normalized.amount_satang,
    merchant: normalized.merchant || "",
    note: normalized.note || "Recurring",
    reference: "",
    paymentMethod: "",
    date,
    time: "",
    lineItems: [],
    receiptGroups: [],
    splitByCategory: false,
  };
}

export function getRecurringFrequencyLabel(rule) {
  const normalized = normalizeRecurringRule(rule);
  const every = normalized.interval_count > 1 ? `ทุก ${normalized.interval_count} รอบ` : "ทุกงวด";
  if (normalized.frequency === "daily") return `${every} รายวัน`;
  if (normalized.frequency === "weekly") return `${every} รายสัปดาห์`;
  if (normalized.frequency === "yearly") return `${every} รายปี`;
  return `${every} รายเดือน`;
}

export function getRecurringDueState(rule, todayISO = toISODate(new Date())) {
  const normalized = normalizeRecurringRule(rule);
  if (!normalized.enabled) return "paused";
  return isRecurringDue(normalized, todayISO) ? "due" : "active";
}

export function buildRecurringOccurrences(rule, todayISO = toISODate(new Date())) {
  const normalized = normalizeRecurringRule(rule);
  if (!normalized.enabled) {
    return {
      drafts: [],
      nextRule: normalized,
      truncated: false,
      nextDueISO: getNextRecurringDueISO(normalized, todayISO),
      cap: MAX_RECURRING_CREATE_PER_RUN,
    };
  }

  const today = parseDateSafe(todayISO);
  const start = parseDateSafe(normalized.start_date || todayISO);
  const end = normalized.end_date ? parseDateSafe(normalized.end_date) : null;

  let nextDue = normalized.last_generated_date
    ? advanceRecurringDate(
        parseDateSafe(normalized.last_generated_date),
        normalized.frequency,
        normalized.interval_count,
        normalized.anchor_day,
      )
    : start;

  if (end && nextDue.getTime() > end.getTime()) {
    return {
      drafts: [],
      nextRule: normalized,
      truncated: false,
      nextDueISO: null,
      cap: MAX_RECURRING_CREATE_PER_RUN,
    };
  }

  if (nextDue.getTime() > today.getTime()) {
    return {
      drafts: [],
      nextRule: normalized,
      truncated: false,
      nextDueISO: toISODate(nextDue),
      cap: MAX_RECURRING_CREATE_PER_RUN,
    };
  }

  const drafts = [];
  let lastGeneratedDate = normalized.last_generated_date;
  let truncated = false;
  let nextDueISO = null;
  let created = 0;

  while (nextDue.getTime() <= today.getTime() && (!end || nextDue.getTime() <= end.getTime())) {
    created += 1;
    if (created > MAX_RECURRING_CREATE_PER_RUN) {
      truncated = true;
      nextDueISO = toISODate(nextDue);
      break;
    }

    const dueISO = toISODate(nextDue);
    drafts.push(buildRecurringTransactionDraft(normalized, dueISO));
    lastGeneratedDate = dueISO;
    nextDue = advanceRecurringDate(nextDue, normalized.frequency, normalized.interval_count, normalized.anchor_day);
  }

  if (!truncated && (!end || nextDue.getTime() <= end.getTime())) {
    nextDueISO = nextDue.getTime() > today.getTime() ? toISODate(nextDue) : null;
  }

  return {
    drafts,
    nextRule: {
      ...normalized,
      last_generated_date: lastGeneratedDate,
    },
    truncated,
    nextDueISO,
    cap: MAX_RECURRING_CREATE_PER_RUN,
  };
}
