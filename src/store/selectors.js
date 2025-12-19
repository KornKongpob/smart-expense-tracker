export const nonTransfer = (t) => !t?.isTransfer;

export const calcTotals = (transactions = []) => {
  const income = transactions
    .filter((t) => t.type === "income" && nonTransfer(t))
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const expense = transactions
    .filter((t) => t.type === "expense" && nonTransfer(t))
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

  return { income, expense, net: income - expense };
};

export const calcAccountTxNet = (transactions = [], accountId) =>
  transactions
    .filter((t) => t.accountId === accountId)
    .reduce((s, t) => s + (t.type === "income" ? (Number(t.amount) || 0) : -(Number(t.amount) || 0)), 0);

export const calcAccountBalance = (accounts = [], transactions = [], accountId) => {
  const acc = accounts.find((a) => a.id === accountId);
  const opening = Number(acc?.openingBalance || 0);
  return opening + calcAccountTxNet(transactions, accountId);
};

// ---- budget helpers ----
function toDateSafe(input) {
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export const monthKeyOf = (dateInput = new Date()) => {
  const d = toDateSafe(dateInput);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
};

export const calcSpentByCategoryInMonth = (transactions = [], dateOrISO = new Date()) => {
  const d = toDateSafe(dateOrISO);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);

  const out = Object.create(null);

  for (const t of transactions) {
    if (!t) continue;
    if (t.type !== "expense") continue;
    if (!nonTransfer(t)) continue;

    const td = toDateSafe(t.date);
    if (td < start || td >= end) continue;

    const catId = String(t.category || "other");
    out[catId] = (out[catId] || 0) + (Number(t.amount) || 0);
  }

  return out;
};
