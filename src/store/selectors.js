// src/store/selectors.js
// Central selectors + safe date helpers
// ✅ Goal: make date handling stable across timezone (especially for YYYY-MM-DD strings)

export const nonTransfer = (t) => !t?.isTransfer;

// --- Safe date parsing ---
// Prefer parsing YYYY-MM-DD as local date to avoid timezone shifting issues.
export function parseDateSafe(input) {
  // Accept Date | string | number
  if (!input) return new Date();

  if (input instanceof Date) {
    const t = input.getTime();
    return Number.isFinite(t) ? input : new Date();
  }

  if (typeof input === "number") {
    const d = new Date(input);
    return Number.isFinite(d.getTime()) ? d : new Date();
  }

  const s = String(input).trim();
  if (!s) return new Date();

  // ✅ If starts with date-only: YYYY-MM-DD (even if has time after) => local date
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const local = new Date(y, mo - 1, d); // local midnight
    return Number.isFinite(local.getTime()) ? local : new Date();
  }

  // Otherwise let Date parse (ISO with time, etc.)
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : new Date();
}

export function toISODateSafe(input) {
  const d = parseDateSafe(input);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toMonthKey(input) {
  // input can be Date or string (YYYY-MM-DD)
  const d = parseDateSafe(input);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function isDuplicateByRef(transactions, ref) {
  const r = String(ref || "").trim();
  if (!r) return false;
  return (transactions || []).some((t) => String(t?.ref || "").trim() === r);
}

export function calcTotals(transactions) {
  let income = 0;
  let expense = 0;

  for (const t of transactions || []) {
    if (!t) continue;
    if (t.isTransfer) continue;

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

// ✅ Net effect of transactions on a specific account (income +, expense -)
// Transfer transactions are stored as expense/income with isTransfer=true.
// For balance, we STILL want to count them because they affect account balance.
export function calcAccountTxNet(transactions, accountId) {
  return (transactions || [])
    .filter((t) => t?.accountId === accountId)
    .reduce((s, t) => {
      const amt = Number(t?.amount) || 0;
      if (t?.type === "income") return s + amt;
      if (t?.type === "expense") return s - amt;
      return s;
    }, 0);
}

// ✅ Opening balance + tx net
export function calcAccountBalance(accounts, transactions, accountId) {
  const acc = (accounts || []).find((a) => a?.id === accountId);
  const opening = Number(acc?.openingBalance || 0);
  return opening + calcAccountTxNet(transactions, accountId);
}

// ✅ required by BudgetsView.jsx + DashboardView.jsx + AddTransactionView.jsx
export function calcSpentByCategoryInMonth(transactions, monthKey) {
  const mk = String(monthKey || "").trim(); // "YYYY-MM"
  const map = new Map();

  for (const t of transactions || []) {
    if (!t) continue;
    if (t.isTransfer) continue; // ✅ do not count transfers into spend
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
