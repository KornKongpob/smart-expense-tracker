// src/utils/budgetNotifications.js
// Smart budget alert using Web Notifications API.
// Checks if monthly spending exceeds budget threshold and sends a browser notification.

const NOTIF_KEY = "budget_notif_last";

/**
 * Request notification permission (call once, e.g., from settings).
 * Returns "granted" | "denied" | "default"
 */
export async function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/**
 * Check budgets and send notification if over threshold.
 * Should be called after transactions change (e.g., in App.jsx useEffect).
 *
 * @param {Object} opts
 * @param {number} opts.monthSpent - total expense this month (satang)
 * @param {number} opts.monthlyLimit - budget limit (satang)
 * @param {number} opts.alertPct - threshold percentage (e.g., 90)
 * @param {string} opts.monthKey - "YYYY-MM"
 * @param {function} opts.formatCurrency - satang → display string
 */
export function checkBudgetAndNotify({ monthSpent, monthlyLimit, alertPct = 90, monthKey, formatCurrency }) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (!monthlyLimit || monthlyLimit <= 0) return;

  const pct = Math.round((monthSpent / monthlyLimit) * 100);
  if (pct < alertPct) return;

  // Throttle: only notify once per month per threshold crossing
  const key = `${NOTIF_KEY}_${monthKey}_${pct >= 100 ? "over" : "warn"}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // ignore
  }

  const fmt = typeof formatCurrency === "function" ? formatCurrency : (v) => `฿${(v / 100).toFixed(2)}`;
  const isOver = pct >= 100;
  const title = isOver ? "⚠️ เกินงบรายเดือน!" : "📊 ใกล้ถึงงบรายเดือน";
  const body = isOver
    ? `ใช้ไป ${fmt(monthSpent)} จากงบ ${fmt(monthlyLimit)} (${pct}%)`
    : `ใช้ไปแล้ว ${pct}% ของงบเดือนนี้ (${fmt(monthSpent)} / ${fmt(monthlyLimit)})`;

  try {
    new Notification(title, {
      body,
      icon: "/vite.svg",
      tag: key,
    });
  } catch {
    // ignore
  }
}
