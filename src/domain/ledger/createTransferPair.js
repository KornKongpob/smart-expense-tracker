import { generateTransferId, generateTxId } from "../../utils/id.js";
import { ensureSatangInt } from "../../utils/money.js";
import { TRANSFER_KINDS } from "./transactionTypes.js";

function clean(value) {
  return String(value ?? "").trim();
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function positiveSatang(value) {
  return Math.max(0, Math.abs(ensureSatangInt(value, 0)));
}

function buildTransferLeg({
  id,
  type,
  accountId,
  amount,
  date,
  time,
  note,
  ref,
  source,
  transferId,
  transferKind,
  category,
  common,
  legExtra,
}) {
  return {
    ...common,
    ...legExtra,
    id: clean(id) || generateTxId(),
    type,
    amount,
    category,
    categoryId: category,
    accountId: clean(accountId),
    date,
    time,
    note,
    isTransfer: true,
    transferId,
    transferKind,
    ref,
    source,
    isSplit: false,
    isSplitParent: false,
    isSplitChild: false,
  };
}

export function createTransferPair(input = {}) {
  const amount = positiveSatang(input.amount ?? input.amountSatang ?? input.amount_satang);
  const transferId = clean(input.transferId ?? input.transfer_id) || generateTransferId();
  const transferKind = clean(input.transferKind ?? input.transfer_kind) || TRANSFER_KINDS.TRANSFER;
  const date = clean(input.date).slice(0, 10) || todayISO();
  const time = clean(input.time);
  const note = clean(input.note) || "Transfer";
  const ref = clean(input.ref ?? input.reference ?? input.referenceId) || null;
  const category = clean(input.category ?? input.categoryId ?? input.category_id) || "transfer";
  const source = clean(input.source) || transferKind;

  const common = {
    ...(input.common && typeof input.common === "object" ? input.common : {}),
  };

  const outTx = buildTransferLeg({
    id: input.outId ?? input.expenseId ?? input.fromTransactionId,
    type: "expense",
    accountId: input.fromAccountId ?? input.from_account_id,
    amount,
    date,
    time,
    note,
    ref,
    source,
    transferId,
    transferKind,
    category,
    common,
    legExtra: input.outExtra,
  });

  const inTx = buildTransferLeg({
    id: input.inId ?? input.incomeId ?? input.toTransactionId,
    type: "income",
    accountId: input.toAccountId ?? input.to_account_id,
    amount,
    date,
    time,
    note,
    ref,
    source,
    transferId,
    transferKind,
    category,
    common,
    legExtra: input.inExtra,
  });

  return [outTx, inTx];
}

export default createTransferPair;
