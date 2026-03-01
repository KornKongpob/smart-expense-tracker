// src/utils/billSplitter.js
// Shared expenses / bill splitting utilities.
// Supports groups, members, expense items, and settlement calculation.

/**
 * Calculate who owes whom in a group.
 * Uses the "simplify debts" algorithm (minimize transactions).
 *
 * @param {Array} expenses - [{ id, description, amount (satang), paidBy (memberId), splitAmong ([memberIds]) }]
 * @param {Array} members - [{ id, name }]
 * @returns {{ balances: Map<id, satang>, settlements: [{ from, to, amount }] }}
 */
export function calculateSettlements(expenses, members) {
  const memberIds = (members || []).map((m) => m.id);
  const balances = new Map();
  for (const id of memberIds) balances.set(id, 0);

  for (const exp of expenses || []) {
    const amt = Math.abs(Number(exp.amount || 0));
    if (amt <= 0) continue;

    const paidBy = String(exp.paidBy || "");
    const splitAmong = Array.isArray(exp.splitAmong) && exp.splitAmong.length
      ? exp.splitAmong
      : memberIds;

    const share = Math.round(amt / splitAmong.length);

    // Payer gets credit
    balances.set(paidBy, (balances.get(paidBy) || 0) + amt);

    // Each participant owes their share
    for (const id of splitAmong) {
      balances.set(id, (balances.get(id) || 0) - share);
    }
  }

  // Simplify: minimize number of transfers
  const creditors = []; // positive balance = owed money
  const debtors = [];   // negative balance = owes money

  for (const [id, bal] of balances) {
    if (bal > 0) creditors.push({ id, amount: bal });
    else if (bal < 0) debtors.push({ id, amount: -bal });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const settlements = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
    const transfer = Math.min(c.amount, d.amount);

    if (transfer > 0) {
      settlements.push({
        from: d.id,
        to: c.id,
        amount: transfer,
      });
    }

    c.amount -= transfer;
    d.amount -= transfer;

    if (c.amount <= 0) ci++;
    if (d.amount <= 0) di++;
  }

  return { balances, settlements };
}

/**
 * Create a new expense group.
 */
export function createGroup(name, members = []) {
  return {
    id: `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: String(name || "กลุ่มใหม่"),
    members: members.map((m, i) => ({
      id: m.id || `m_${i}_${Date.now()}`,
      name: String(m.name || `สมาชิก ${i + 1}`),
    })),
    expenses: [],
    createdAt: Date.now(),
  };
}

/**
 * Add expense to group.
 */
export function addGroupExpense(group, expense) {
  return {
    ...group,
    expenses: [
      ...(group.expenses || []),
      {
        id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        description: String(expense.description || ""),
        amount: Math.abs(Number(expense.amount || 0)),
        paidBy: String(expense.paidBy || ""),
        splitAmong: Array.isArray(expense.splitAmong) ? expense.splitAmong : [],
        date: expense.date || new Date().toISOString().slice(0, 10),
        createdAt: Date.now(),
      },
    ],
  };
}

/**
 * Get total expenses and per-member summary for a group.
 */
export function getGroupSummary(group) {
  const expenses = group?.expenses || [];
  const members = group?.members || [];
  const totalAmount = expenses.reduce((s, e) => s + Math.abs(Number(e.amount || 0)), 0);
  const { balances, settlements } = calculateSettlements(expenses, members);

  const memberSummary = members.map((m) => ({
    ...m,
    paid: expenses
      .filter((e) => e.paidBy === m.id)
      .reduce((s, e) => s + Math.abs(Number(e.amount || 0)), 0),
    owes: Math.max(0, -(balances.get(m.id) || 0)),
    owed: Math.max(0, balances.get(m.id) || 0),
  }));

  return { totalAmount, memberSummary, settlements, expenseCount: expenses.length };
}
