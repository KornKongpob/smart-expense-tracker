import { useMemo } from "react";
import { isCreditAccount } from "../../../utils/accountMatch";

export function useTransferFlow({ initialData, stateTransactions, accounts, isEditMode }) {
  const transferPair = useMemo(() => {
    if (!initialData?.isTransfer) return null;

    const tid = String(initialData?.transferId || "").trim();
    const group = tid
      ? (stateTransactions || []).filter((t) => String(t?.transferId || "").trim() === tid)
      : [initialData].filter(Boolean);

    const outTx =
      group.find((t) => String(t?.type || "").toLowerCase() === "expense") ||
      (String(initialData?.type || "").toLowerCase() === "expense" ? initialData : null);

    const inTx =
      group.find((t) => String(t?.type || "").toLowerCase() === "income") ||
      (String(initialData?.type || "").toLowerCase() === "income" ? initialData : null);

    const transferId = tid || String(outTx?.transferId || inTx?.transferId || "").trim() || null;
    if (!outTx && !inTx) return null;
    return { outTx, inTx, transferId, group };
  }, [initialData, stateTransactions]);

  const transferKindForEdit = useMemo(() => {
    if (!transferPair) return null;

    const explicit =
      String(transferPair?.outTx?.transferKind || transferPair?.inTx?.transferKind || "")
        .trim()
        .toLowerCase() || "";

    if (explicit === "credit_payment") return "credit_payment";

    const fromAcc = accounts.find((a) => a.id === transferPair?.outTx?.accountId) || null;
    const toAcc = accounts.find((a) => a.id === transferPair?.inTx?.accountId) || null;

    if (fromAcc && toAcc && isCreditAccount(toAcc) && !isCreditAccount(fromAcc)) return "credit_payment";

    return "transfer";
  }, [transferPair, accounts]);

  const isEditingTransferLike = !!(isEditMode && initialData?.isTransfer);
  const isEditingCreditPayment = isEditingTransferLike && transferKindForEdit === "credit_payment";

  const initialAttachmentId = useMemo(() => {
    const direct = String(initialData?.attachmentId || "").trim();
    if (direct) return direct;
    const out = String(transferPair?.outTx?.attachmentId || "").trim();
    if (out) return out;
    const inn = String(transferPair?.inTx?.attachmentId || "").trim();
    return inn || "";
  }, [initialData, transferPair]);

  return {
    transferPair,
    transferKindForEdit,
    isEditingTransferLike,
    isEditingCreditPayment,
    initialAttachmentId,
  };
}
