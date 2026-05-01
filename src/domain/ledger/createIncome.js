import { generateTxId } from "../../utils/id.js";
import { ensureSatangInt } from "../../utils/money.js";

function clean(value) {
  return String(value ?? "").trim();
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function positiveSatang(value) {
  return Math.max(0, Math.abs(ensureSatangInt(value, 0)));
}

export function createIncomeTransaction(input = {}) {
  const now = Number(input.now || Date.now());
  const category = clean(input.category ?? input.categoryId ?? input.category_id);

  return {
    ...input,
    id: clean(input.id) || generateTxId(),
    type: "income",
    amount: positiveSatang(input.amount ?? input.amountSatang ?? input.amount_satang),
    date: clean(input.date).slice(0, 10) || todayISO(),
    time: clean(input.time),
    category,
    categoryId: clean(input.categoryId ?? input.category_id ?? category),
    accountId: clean(input.accountId ?? input.account_id),
    note: clean(input.note),
    ref: clean(input.ref ?? input.reference ?? input.referenceId) || null,
    merchant: clean(input.merchant) || null,
    isTransfer: false,
    transferId: null,
    transferKind: null,
    createdAt: Number(input.createdAt || now),
    updatedAt: Number(input.updatedAt || now),
  };
}

export default createIncomeTransaction;
