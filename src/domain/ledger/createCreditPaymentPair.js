import { createTransferPair } from "./createTransferPair.js";
import { TRANSFER_KINDS } from "./transactionTypes.js";

export function createCreditPaymentPair(input = {}) {
  const common = {
    ...(input.common && typeof input.common === "object" ? input.common : {}),
    isCreditCardPayment: true,
    subtype: "credit_card_payment",
  };

  return createTransferPair({
    ...input,
    fromAccountId: input.fromAccountId ?? input.from_account_id ?? input.sourceAccountId ?? input.source_account_id,
    toAccountId: input.toAccountId ?? input.to_account_id ?? input.creditAccountId ?? input.credit_account_id,
    common,
    transferKind: TRANSFER_KINDS.CREDIT_CARD_PAYMENT,
    source: input.source || TRANSFER_KINDS.CREDIT_CARD_PAYMENT,
    category: input.category || "transfer",
    note: input.note || "Credit card payment",
  });
}

export default createCreditPaymentPair;
