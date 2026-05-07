import { ensureSatangInt } from "../../utils/money.js";
import { parseDateSafe, toISODate } from "../../utils/format.js";

export const GOAL_TYPE_OPTIONS = Object.freeze([
  { id: "emergency_fund", label: "กองทุนฉุกเฉิน" },
  { id: "travel", label: "เที่ยว" },
  { id: "purchase", label: "ซื้อของใหญ่" },
  { id: "debt_buffer", label: "เงินสำรองจ่ายหนี้" },
  { id: "custom", label: "กำหนดเอง" },
]);

export const GOAL_STATUS_OPTIONS = Object.freeze([
  { id: "active", label: "กำลังออม" },
  { id: "paused", label: "พักไว้" },
  { id: "completed", label: "สำเร็จแล้ว" },
]);

const GOAL_TYPE_SET = new Set(GOAL_TYPE_OPTIONS.map((option) => option.id));
const GOAL_STATUS_SET = new Set(GOAL_STATUS_OPTIONS.map((option) => option.id));

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toPositiveSatang(value) {
  return Math.max(0, ensureSatangInt(value, 0));
}

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function readDate(value) {
  const text = cleanText(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function readTimestamp(value, fallback = 0) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return number;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeLinkedAccountIds(goal) {
  const source = toArray(goal?.linkedAccountIds ?? goal?.linked_account_ids);
  const fallbackId = goal?.linkedAccountId ?? goal?.linked_account_id;
  const list = source.length ? source : fallbackId != null && fallbackId !== "" ? [fallbackId] : [];
  const seen = new Set();
  const out = [];

  for (const value of list) {
    const id = String(value || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  return out;
}

export function getGoalTypeLabel(type) {
  return GOAL_TYPE_OPTIONS.find((option) => option.id === type)?.label || "กำหนดเอง";
}

export function getGoalStatusLabel(status) {
  return GOAL_STATUS_OPTIONS.find((option) => option.id === status)?.label || "กำลังออม";
}

export function getGoalStatusTone(status) {
  if (status === "completed") return "success";
  if (status === "paused") return "warning";
  return "default";
}

export function normalizeGoalForUi(goal, index = 0) {
  const raw = goal && typeof goal === "object" ? goal : {};
  const targetAmount = toPositiveSatang(raw.targetAmount ?? raw.targetAmountSatang ?? raw.target_amount_satang);
  const currentAmount = toPositiveSatang(raw.currentAmount ?? raw.currentAmountSatang ?? raw.current_amount_satang);
  const type = GOAL_TYPE_SET.has(String(raw.type || "")) ? String(raw.type) : "custom";
  const statusInput = String(raw.status || "").trim();
  const status = GOAL_STATUS_SET.has(statusInput)
    ? statusInput
    : targetAmount > 0 && currentAmount >= targetAmount
      ? "completed"
      : "active";

  return {
    ...raw,
    id: raw.id != null && raw.id !== "" ? String(raw.id) : "",
    name: cleanText(raw.name, "เป้าหมายการออม"),
    type,
    targetAmount,
    currentAmount,
    dueDate: readDate(raw.dueDate ?? raw.due_date ?? raw.targetDate ?? raw.target_date),
    linkedAccountIds: normalizeLinkedAccountIds(raw),
    priority: Math.max(1, Math.trunc(Number(raw.priority ?? index + 1) || index + 1)),
    monthlyContribution: toPositiveSatang(
      raw.monthlyContribution ?? raw.monthlyContributionSatang ?? raw.monthly_contribution_satang,
    ),
    autoReserveRule: raw.autoReserveRule && typeof raw.autoReserveRule === "object" ? raw.autoReserveRule : null,
    status,
    createdAt: readTimestamp(raw.createdAt ?? raw.created_at, Date.now()),
    updatedAt: readTimestamp(raw.updatedAt ?? raw.updated_at, Date.now()),
  };
}

export function calculateGoalProgressPercent(goal) {
  const normalized = normalizeGoalForUi(goal);
  if (!normalized.targetAmount) return 0;
  return Math.max(0, Math.min(100, Math.round((normalized.currentAmount / normalized.targetAmount) * 100)));
}

export function getGoalRemainingSatang(goal) {
  const normalized = normalizeGoalForUi(goal);
  return Math.max(0, normalized.targetAmount - normalized.currentAmount);
}

export function getMonthsUntilDueDate(dueDate, today = new Date()) {
  const due = readDate(dueDate);
  if (!due) return 0;

  const start = parseDateSafe(today);
  const end = parseDateSafe(due);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 0;
  if (end.getTime() <= start.getTime()) return 1;

  const monthDelta = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  const needsPartialMonth = end.getDate() > start.getDate() ? 1 : 0;
  return Math.max(1, monthDelta + needsPartialMonth);
}

export function calculateMonthlyNeeded(goal, today = new Date()) {
  const remaining = getGoalRemainingSatang(goal);
  if (!remaining) return 0;
  const months = getMonthsUntilDueDate(normalizeGoalForUi(goal).dueDate, today);
  if (!months) return remaining;
  return Math.ceil(remaining / months);
}

export function summarizeGoals(goals = [], { today = new Date() } = {}) {
  const normalizedGoals = toArray(goals).map((goal, index) => normalizeGoalForUi(goal, index));
  const activeGoals = normalizedGoals.filter((goal) => goal.status === "active");

  return {
    activeCount: activeGoals.length,
    totalTarget: activeGoals.reduce((sum, goal) => sum + goal.targetAmount, 0),
    totalCurrent: activeGoals.reduce((sum, goal) => sum + goal.currentAmount, 0),
    monthlyContributionNeeded: activeGoals.reduce((sum, goal) => {
      const needed = goal.dueDate ? calculateMonthlyNeeded(goal, today) : goal.monthlyContribution;
      return sum + needed;
    }, 0),
  };
}

export function sortGoalsForDisplay(goals = []) {
  return toArray(goals)
    .map((goal, index) => normalizeGoalForUi(goal, index))
    .sort((left, right) => {
      const statusRank = { active: 0, paused: 1, completed: 2 };
      const byStatus = (statusRank[left.status] ?? 9) - (statusRank[right.status] ?? 9);
      if (byStatus) return byStatus;
      const byPriority = (Number(left.priority) || 0) - (Number(right.priority) || 0);
      if (byPriority) return byPriority;
      return String(left.createdAt || "").localeCompare(String(right.createdAt || ""));
    });
}

export function createGoalDraft(goal = null) {
  const normalized = goal ? normalizeGoalForUi(goal) : null;
  const today = toISODate(new Date());

  return {
    id: normalized?.id || "",
    name: normalized?.name || "",
    type: normalized?.type || "emergency_fund",
    targetAmount: normalized ? (normalized.targetAmount / 100).toFixed(2) : "",
    currentAmount: normalized && normalized.currentAmount ? (normalized.currentAmount / 100).toFixed(2) : "",
    dueDate: normalized?.dueDate || "",
    linkedAccountIds: normalized?.linkedAccountIds || [],
    priority: String(normalized?.priority || 1),
    monthlyContribution:
      normalized && normalized.monthlyContribution ? (normalized.monthlyContribution / 100).toFixed(2) : "",
    status: normalized?.status || "active",
    createdAt: normalized?.createdAt || Date.now(),
    updatedAt: normalized?.updatedAt || Date.now(),
    today,
  };
}
