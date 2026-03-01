// src/utils/debtTracker.js
// Debt tracking utilities for credit card balances and payment schedules.

import { isCreditAccount } from "./accountMatch";

/**
 * Calculate outstanding balance for each credit account.
 * Balance = openingBalance + net transactions (expenses increase debt, payments decrease).
 */
export function getCreditCardBalances(accounts, transactions) {
  const creditAccs = (accounts || []).filter((a) => isCreditAccount(a));
  if (!creditAccs.length) return [];

  const txs = transactions || [];
  const results = [];

  for (const acc of creditAccs) {
    const accId = String(acc.id || "");
    let balance = Number(acc.openingBalance || 0); // positive = debt owed

    for (const t of txs) {
      if (!t || String(t.accountId || "") !== accId) continue;
      const amt = Math.abs(Number(t.amount || 0));

      if (t.isTransfer) {
        // Transfer TO credit card = payment (reduces debt)
        if (String(t.type || "").toLowerCase() === "income") {
          balance -= amt;
        }
        // Transfer FROM credit card (rare) = increases debt
        if (String(t.type || "").toLowerCase() === "expense") {
          balance += amt;
        }
      } else if (String(t.type || "").toLowerCase() === "expense") {
        balance += amt; // spending increases debt
      } else if (String(t.type || "").toLowerCase() === "income") {
        balance -= amt; // refund/cashback reduces debt
      }
    }

    const limit = Number(acc.creditLimit || acc.limit || 0);
    const utilization = limit > 0 ? Math.round((Math.max(0, balance) / limit) * 100) : 0;

    // Due date from account metadata
    const dueDay = Number(acc.dueDay || acc.paymentDueDay || 0);
    const dueDate = dueDay > 0 ? getNextDueDate(dueDay) : null;
    const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / 86400000) : null;

    results.push({
      accountId: accId,
      accountName: acc.name || "บัตรเครดิต",
      icon: acc.icon || "💳",
      balance, // satang (positive = owed)
      creditLimit: limit,
      utilization,
      dueDay,
      dueDate,
      daysUntilDue,
      minimumPayment: Math.max(0, Math.round(balance * 0.1)), // estimated 10%
    });
  }

  return results.sort((a, b) => b.balance - a.balance);
}

function getNextDueDate(dueDay) {
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), dueDay);
  if (thisMonth > now) return thisMonth;
  // Next month
  return new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
}

/**
 * Get alerts for upcoming due dates and high utilization.
 */
export function getDebtAlerts(creditCards) {
  const alerts = [];
  for (const card of creditCards || []) {
    if (card.balance <= 0) continue;

    if (card.daysUntilDue !== null && card.daysUntilDue <= 5 && card.daysUntilDue >= 0) {
      alerts.push({
        type: "due_soon",
        icon: "⏰",
        title: `${card.accountName} ครบกำหนดชำระ`,
        body: card.daysUntilDue === 0
          ? "ครบกำหนดวันนี้!"
          : `อีก ${card.daysUntilDue} วัน`,
        severity: card.daysUntilDue <= 2 ? "danger" : "warning",
        accountId: card.accountId,
      });
    }

    if (card.utilization > 80) {
      alerts.push({
        type: "high_utilization",
        icon: "⚠️",
        title: `${card.accountName} ใช้วงเงิน ${card.utilization}%`,
        body: "ควรชำระยอดเพื่อลดภาระดอกเบี้ย",
        severity: card.utilization > 90 ? "danger" : "warning",
        accountId: card.accountId,
      });
    }
  }
  return alerts;
}
