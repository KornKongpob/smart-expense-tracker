import { formatCurrency } from "../../utils/format.js";

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeData(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clampPositiveInt(value, fallback = 0) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, number);
}

export function getNotificationDataKey(notification) {
  return cleanText(notification?.data?.key);
}

export function normalizeNotificationRow(row) {
  const source = row && typeof row === "object" ? row : {};
  return {
    id: source.id != null ? Number(source.id) || source.id : null,
    kind: cleanText(source.kind, "info"),
    title: cleanText(source.title, "การแจ้งเตือน"),
    body: cleanText(source.body),
    data: normalizeData(source.data),
    is_read: source.is_read === true,
    created_at: source.created_at || source.createdAt || null,
    read_at: source.read_at || source.readAt || null,
  };
}

export function normalizeNotifications(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => normalizeNotificationRow(row))
    .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")));
}

function buildNotification(kind, key, title, body, data = {}) {
  return {
    kind,
    title,
    body,
    data: {
      ...data,
      key,
    },
  };
}

function formatNotificationCurrency(value) {
  return formatCurrency(clampPositiveInt(value));
}

export function buildRuntimeNotifications({
  budgetPlanSnapshot,
  plannerReminders,
  recurringDueToday,
  scanDocuments,
} = {}) {
  const notifications = [];
  const categoryPlans = Array.isArray(budgetPlanSnapshot?.categoryPlans) ? budgetPlanSnapshot.categoryPlans : [];

  const budgetAlerts = categoryPlans
    .filter((plan) => Number(plan?.appliedLimitSatang || 0) > 0)
    .map((plan) => {
      const spent = clampPositiveInt(plan?.spentMonthSatang);
      const limit = clampPositiveInt(plan?.appliedLimitSatang);
      const alertPct = Math.max(1, Math.min(100, Math.trunc(Number(plan?.alertPct || 90) || 90)));
      const ratio = limit > 0 ? spent / limit : 0;
      const state = ratio >= 1 ? "over" : ratio >= alertPct / 100 ? "warning" : "";
      return {
        ...plan,
        ratio,
        state,
      };
    })
    .filter((plan) => plan.state)
    .sort((left, right) => right.ratio - left.ratio)
    .slice(0, 4);

  for (const plan of budgetAlerts) {
    const key = `budget-${budgetPlanSnapshot?.monthKey || ""}-${plan.categoryId}-${plan.state}`;
    notifications.push(
      buildNotification(
        "budget_alert",
        key,
        plan.state === "over" ? `งบ ${plan.name} เกินแล้ว` : `งบ ${plan.name} ใกล้ถึงเพดาน`,
        `${formatNotificationCurrency(plan.spentMonthSatang)} จากงบ ${formatNotificationCurrency(plan.appliedLimitSatang)}`,
        {
          categoryId: plan.categoryId,
          monthKey: budgetPlanSnapshot?.monthKey || "",
          state: plan.state,
        },
      ),
    );
  }

  for (const reminder of Array.isArray(plannerReminders) ? plannerReminders : []) {
    const dueDate = cleanText(reminder?.due_date);
    const reminderType = cleanText(reminder?.type);
    const baseKey = `${reminderType}-${cleanText(reminder?.id)}-${dueDate}`;
    notifications.push(
      buildNotification(
        reminderType === "debt" ? "debt_due" : "goal_due",
        baseKey,
        cleanText(reminder?.title, reminderType === "debt" ? "บิลหนี้" : "เป้าหมาย"),
        `${cleanText(reminder?.copy)}${reminder?.amount_satang ? ` · ${formatNotificationCurrency(reminder.amount_satang)}` : ""}`,
        {
          dueDate,
          reminderType,
        },
      ),
    );
  }

  const dueRules = Array.isArray(recurringDueToday) ? recurringDueToday : [];
  if (dueRules.length) {
    notifications.push(
      buildNotification(
        "recurring_due",
        `recurring-${dueRules.map((rule) => rule.id).join("-")}`,
        "มีรายการประจำถึงรอบ",
        `${dueRules.length} กฎพร้อมสร้างรายการในวันนี้`,
        {
          count: dueRules.length,
        },
      ),
    );
  }

  const pendingScans = (Array.isArray(scanDocuments) ? scanDocuments : []).filter(
    (scan) => String(scan?.status || "").trim() === "pending_review",
  );
  if (pendingScans.length) {
    notifications.push(
      buildNotification(
        "scan_pending",
        `scan-pending-${pendingScans.length}`,
        "มีเอกสารรอตรวจใน Inbox",
        `${pendingScans.length} รายการยังรออนุมัติหรือจัดหมวด`,
        {
          count: pendingScans.length,
        },
      ),
    );
  }

  return notifications;
}
