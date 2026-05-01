import { buildReceiptSplitPlan } from "../receipt/receiptSplitBuilder.js";

export function createReceiptSplitTransactions(options = {}) {
  const plan = buildReceiptSplitPlan(options);
  if (plan.transaction) return [plan.transaction];
  return plan.transactions || [];
}

export default createReceiptSplitTransactions;
