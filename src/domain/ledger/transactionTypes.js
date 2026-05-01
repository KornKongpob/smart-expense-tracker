export const TRANSACTION_TYPES = Object.freeze({
  EXPENSE: "expense",
  INCOME: "income",
  TRANSFER: "transfer",
  CREDIT_CARD_PAYMENT: "credit_card_payment",
});

export const TRANSFER_KINDS = Object.freeze({
  TRANSFER: "transfer",
  CREDIT_CARD_PAYMENT: "credit_payment",
});

export const SPLIT_FLAGS = Object.freeze({
  PARENT: "parent",
  CHILD: "child",
});

function clean(value) {
  return String(value ?? "").trim();
}

function cleanLower(value) {
  return clean(value).toLowerCase();
}

export function getTransactionType(tx) {
  const raw = cleanLower(tx?.type || tx?.kind || tx?.txType || tx?.tx_type);
  if (raw === "income") return TRANSACTION_TYPES.INCOME;
  if (raw === "expense") return TRANSACTION_TYPES.EXPENSE;
  if (raw === "transfer") return TRANSACTION_TYPES.TRANSFER;
  if (raw === "credit_payment" || raw === "credit_card_payment") {
    return TRANSACTION_TYPES.CREDIT_CARD_PAYMENT;
  }
  return raw || TRANSACTION_TYPES.EXPENSE;
}

export function isCreditCardPaymentTransaction(tx) {
  if (!tx || typeof tx !== "object") return false;

  const values = [
    tx.transferKind,
    tx.transfer_kind,
    tx.subtype,
    tx.kind,
    tx.txType,
    tx.tx_type,
    tx.paymentType,
    tx.payment_type,
    tx.category,
    tx.categoryId,
    tx.category_id,
  ].map(cleanLower);

  return (
    tx.isCreditCardPayment === true ||
    tx.is_credit_card_payment === true ||
    values.includes("credit_payment") ||
    values.includes("credit_card_payment")
  );
}

export function isTransferTransaction(tx) {
  if (!tx || typeof tx !== "object") return false;

  const type = getTransactionType(tx);
  const transferKind = cleanLower(tx.transferKind || tx.transfer_kind);
  const category = cleanLower(tx.category || tx.categoryId || tx.category_id);

  return (
    tx.isTransfer === true ||
    tx.is_transfer === true ||
    type === TRANSACTION_TYPES.TRANSFER ||
    type === TRANSACTION_TYPES.CREDIT_CARD_PAYMENT ||
    !!clean(tx.transferId || tx.transfer_id) ||
    transferKind === TRANSFER_KINDS.TRANSFER ||
    transferKind === TRANSFER_KINDS.CREDIT_CARD_PAYMENT ||
    category === "transfer" ||
    isCreditCardPaymentTransaction(tx)
  );
}

export function isSplitParentTransaction(tx) {
  if (!tx || typeof tx !== "object") return false;
  return tx.isSplitParent === true || tx.is_split_parent === true || cleanLower(tx.splitRole || tx.split_role) === SPLIT_FLAGS.PARENT;
}

export function isSplitChildTransaction(tx) {
  if (!tx || typeof tx !== "object") return false;
  return tx.isSplitChild === true || tx.is_split_child === true || cleanLower(tx.splitRole || tx.split_role) === SPLIT_FLAGS.CHILD;
}

export function isAdjustmentTransaction(tx) {
  if (!tx || typeof tx !== "object") return false;
  const lineType = cleanLower(tx.receiptLineType || tx.receipt_line_type || tx.lineType || tx.line_type);
  return lineType === "adjustment" || !!clean(tx.adjustmentType || tx.adjustment_type);
}

export function isReportableExpenseTransaction(tx) {
  return (
    getTransactionType(tx) === TRANSACTION_TYPES.EXPENSE &&
    !isTransferTransaction(tx) &&
    !isCreditCardPaymentTransaction(tx) &&
    !isSplitParentTransaction(tx)
  );
}

export function isReportableIncomeTransaction(tx) {
  return (
    getTransactionType(tx) === TRANSACTION_TYPES.INCOME &&
    !isTransferTransaction(tx) &&
    !isCreditCardPaymentTransaction(tx) &&
    !isSplitParentTransaction(tx)
  );
}

export function isReportableTransaction(tx) {
  return isReportableExpenseTransaction(tx) || isReportableIncomeTransaction(tx);
}

export function isBudgetRelevantTransaction(tx) {
  return isReportableExpenseTransaction(tx);
}

export default {
  TRANSACTION_TYPES,
  TRANSFER_KINDS,
  SPLIT_FLAGS,
  getTransactionType,
  isTransferTransaction,
  isCreditCardPaymentTransaction,
  isSplitParentTransaction,
  isSplitChildTransaction,
  isAdjustmentTransaction,
  isReportableExpenseTransaction,
  isReportableIncomeTransaction,
  isReportableTransaction,
  isBudgetRelevantTransaction,
};
