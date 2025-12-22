// src/store/selectors.js
// Central selectors + safe date helpers
// ✅ Goal: make date handling stable across timezone (especially for YYYY-MM-DD strings)

export const nonTransfer = (t) => !t?.isTransfer;

// -----------------------------
// Safe date parsing utilities
// -----------------------------
// Why we need this:
// - Many parts of the app store dates as "YYYY-MM-DD" (date-only).
// - JS Date("YYYY-MM-DD") is parsed as UTC in many runtimes, which can shift day in some timezones.
// - We want "YYYY-MM-DD" to always mean "local date at midnight" consistently.

export function parseDateSafe(input, fallback = new Date()) {
  // Accept Date | string | number
  if (input == null || input === "") return fallback instanceof Date ? fallback : new Date();

  // Date instance
  if (input instanceof Date) {
    const t = input.getTime();
    return Number.isFinite(t) ? input : new Date();
  }

  // timestamp (ms)
  if (typeof input === "number") {
    const d = new Date(input);
    return Number.isFinite(d.getTime()) ? d : new Date();
  }

  const s = String(input).trim();
  if (!s) return fallback instanceof Date ? fallback : new Date();

  /**
   * ✅ If the string begins with YYYY-MM-DD
   * treat it as "local date" and ignore timezone shifting.
   * We also accept strings like:
   * - "2025-12-22"
   * - "2025-12-22T10:00:00Z"
   * - "2025-12-22 10:00"
   */
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);

    // guard invalid numeric parts
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return new Date();

    // local midnight (stable)
    const local = new Date(y, mo - 1, d);
    return Number.isFinite(local.getTime()) ? local : new Date();
  }

  // Otherwise, let Date parse (ISO with time or other formats)
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : new Date();
}

export function toISODateSafe(input) {
  // Always returns "YYYY-MM-DD"
  const d = parseDateSafe(input);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toMonthKey(input) {
  // Always returns "YYYY-MM"
  const d = parseDateSafe(input);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// -----------------------------
// Receipt scan / duplication helpers
// -----------------------------
export function isDuplicateByRef(transactions, ref) {
  const r = String(ref || "").trim();
  if (!r) return false;
  return (transactions || []).some((t) => String(t?.ref || "").trim() === r);
}

// -----------------------------
// Totals / balances
// -----------------------------
export function calcTotals(transactions) {
  let income = 0;
  let expense = 0;

  for (const t of transactions || []) {
    if (!t) continue;
    if (t.isTransfer) continue; // transfers should not affect "income/expense totals"

    const amt = Number(t.amount) || 0;
    if (t.type === "income") income += amt;
    else if (t.type === "expense") expense += amt;
  }

  return {
    income,
    expense,
    net: income - expense,
  };
}

/**
 * ✅ Net effect of transactions on a specific account
 * - income => +amount
 * - expense => -amount
 * - transfer txs are usually stored as expense/income with isTransfer=true
 *   For balance, we DO count them because they still move money for that account.
 */
export function calcAccountTxNet(transactions, accountId) {
  const accId = String(accountId || "").trim();
  if (!accId) return 0;

  return (transactions || [])
    .filter((t) => t?.accountId === accId)
    .reduce((sum, t) => {
      const amt = Number(t?.amount) || 0;
      if (t?.type === "income") return sum + amt;
      if (t?.type === "expense") return sum - amt;
      return sum;
    }, 0);
}

/**
 * ✅ Opening balance + net transactions
 * This matches how AccountsView displays and how store.jsx adjusts openingBalance.
 */
export function calcAccountBalance(accounts, transactions, accountId) {
  const accId = String(accountId || "").trim();
  if (!accId) return 0;

  const acc = (accounts || []).find((a) => a?.id === accId);
  const opening = Number(acc?.openingBalance || 0);
  return opening + calcAccountTxNet(transactions, accId);
}

/**
 * ✅ required by BudgetsView.jsx + DashboardView.jsx + AddTransactionView.jsx
 * Returns Map(categoryId => spentAmount) for the given monthKey "YYYY-MM"
 * - excludes transfers
 * - counts only expense transactions
 */
export function calcSpentByCategoryInMonth(transactions, monthKey) {
  const mk = String(monthKey || "").trim(); // "YYYY-MM"
  const map = new Map();
  if (!mk) return map;

  for (const t of transactions || []) {
    if (!t) continue;
    if (t.isTransfer) continue; // ✅ transfers should not count as spending
    if (t.type !== "expense") continue;

    const iso = toISODateSafe(t.date);
    if (!iso.startsWith(mk)) continue;

    const cat = String(t.category || "").trim();
    if (!cat) continue;

    const amt = Number(t.amount) || 0;
    map.set(cat, (map.get(cat) || 0) + amt);
  }

  return map;
}

export function getBudget(budgets, month, categoryId) {
  const m = String(month || "").trim();
  const c = String(categoryId || "").trim();
  if (!m || !c) return null;

  return (
    (budgets || []).find(
      (b) => String(b.month || "").trim() === m && String(b.categoryId || "").trim() === c
    ) || null
  );
}

/**
 * Optional (safe) helpers you might use later:
 * - sum transactions in month
 * - get transactions of day
 * Kept small and pure (not used unless imported).
 */
export function getTransactionsInMonth(transactions, monthKey) {
  const mk = String(monthKey || "").trim();
  if (!mk) return [];
  return (transactions || []).filter((t) => toISODateSafe(t?.date).startsWith(mk));
}

export function getTransactionsOnDate(transactions, isoDate) {
  const d = String(isoDate || "").slice(0, 10);
  if (!d) return [];
  return (transactions || []).filter((t) => toISODateSafe(t?.date) === d);
}
