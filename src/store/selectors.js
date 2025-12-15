// src/store/selectors.js

export const nonTransfer = (t) => !t.isTransfer;

export const calcTotals = (transactions) => {
  const income = transactions
    .filter((t) => t.type === "income" && nonTransfer(t))
    .reduce((s, t) => s + t.amount, 0);
  const expense = transactions
    .filter((t) => t.type === "expense" && nonTransfer(t))
    .reduce((s, t) => s + t.amount, 0);
  return { income, expense, net: income - expense };
};

// เฉพาะผลรวมจาก transactions (ไม่รวม openingBalance)
export const calcAccountTxNet = (transactions, accountId) =>
  transactions
    .filter((t) => t.accountId === accountId)
    .reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0);

// ยอดคงเหลือจริง = openingBalance + txNet
export const calcAccountBalance = (accounts, transactions, accountId) => {
  const acc = accounts.find((a) => a.id === accountId);
  const opening = Number(acc?.openingBalance || 0);
  return opening + calcAccountTxNet(transactions, accountId);
};
