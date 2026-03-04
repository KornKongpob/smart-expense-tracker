// ScanItemReviewModal
// Wraps TransactionReviewModal with local draft state so that edits
// don't trigger parent (AddTransactionView) re-renders on every keystroke.
// Changes are committed back to the scan queue only when the user closes/finishes.

import React, { useEffect, useState, useCallback } from "react";
import TransactionReviewModal from "../../../components/TransactionReviewModal";

const safeStr = (v) => String(v || "").trim();

export default function ScanItemReviewModal({
  isOpen,
  q,
  onClose,
  onUpdateItem,
  // eslint-disable-next-line no-unused-vars
  onUpdateGroup,
  onTypeChange,
  accounts,
  nonCreditAccounts,
  expenseCatsAll,
  incomeCatsAll,
  recentCatsByType,
  recentAccountsByType,
  catIndexByType,
  merchants,
}) {
  // ---- Local draft state ----
  const [draft, setDraft] = useState(null);

  // Sync draft from queue item when modal opens (or item id changes while open)
  useEffect(() => {
    if (!isOpen || !q) {
      setDraft(null);
      return;
    }
    setDraft({ ...q });
  }, [isOpen, q?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Local handlers (modify draft only, no parent re-render) ----
  const handleUpdateItem = useCallback((_id, patch) => {
    const p = patch && typeof patch === "object" ? patch : {};
    setDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...p };
      // Keep txType / type in sync
      if (p.txType != null && next.type == null) next.type = p.txType;
      if (p.type != null && next.txType == null) next.txType = p.type;
      if (p.ref != null && next.referenceId == null) next.referenceId = p.ref;
      if (p.referenceId != null && next.ref == null) next.ref = p.referenceId;
      return next;
    });
  }, []);

  const handleUpdateGroup = useCallback((_id, idx, patch) => {
    const i = Number(idx);
    if (!Number.isFinite(i)) return;
    const p = patch && typeof patch === "object" ? patch : {};
    setDraft((prev) => {
      if (!prev) return prev;
      const groups = Array.isArray(prev.groups) ? prev.groups.slice() : [];
      if (!groups[i]) return prev;
      groups[i] = { ...groups[i], ...p };
      return { ...prev, groups };
    });
  }, []);

  const handleTypeChange = useCallback((_id, nextType) => {
    const t = safeStr(nextType).toLowerCase() || "expense";
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, type: t, txType: t };
    });
  }, []);

  // ---- Commit draft back to queue on close/done ----
  const commitAndClose = useCallback(() => {
    if (draft && q && onUpdateItem) {
      // Build a patch of all changed fields
      const patch = {};
      const keys = [
        "txType", "type", "amount", "amountEdited", "date", "dateEdited", "dateWasDefault",
        "merchant", "note", "ref", "referenceId",
        "accountId", "fromAccountId", "toAccountId",
        "categoryId", "splitByCategory", "groups",
        "isInstallment", "installmentMonths",
        "includeDuplicate", "suggestedCategoryId", "suggestedReason",
      ];
      let changed = false;
      for (const k of keys) {
        if (draft[k] !== q[k]) {
          patch[k] = draft[k];
          changed = true;
        }
      }
      // Always sync groups if present (deep comparison is too expensive)
      if (Array.isArray(draft.groups) && draft.groups.length > 0) {
        patch.groups = draft.groups;
        changed = true;
      }
      if (changed) {
        onUpdateItem(q.id, patch);
      }
    }
    onClose?.();
  }, [draft, q, onUpdateItem, onClose]);

  // Also commit type changes
  const commitTypeAndClose = useCallback(() => {
    if (draft && q && onTypeChange && safeStr(draft.txType) !== safeStr(q.txType)) {
      onTypeChange(q.id, draft.txType);
    }
    commitAndClose();
  }, [draft, q, onTypeChange, commitAndClose]);

  // ---- Render ----
  if (!isOpen) return null;

  return (
    <TransactionReviewModal
      isOpen={isOpen}
      q={draft || q}
      onClose={commitAndClose}
      onDone={commitTypeAndClose}
      doneLabel="เสร็จแล้ว"
      onUpdateItem={handleUpdateItem}
      onUpdateGroup={handleUpdateGroup}
      onTypeChange={handleTypeChange}
      accounts={accounts}
      nonCreditAccounts={nonCreditAccounts}
      expenseCatsAll={expenseCatsAll}
      incomeCatsAll={incomeCatsAll}
      recentCatsByType={recentCatsByType}
      recentAccountsByType={recentAccountsByType}
      catIndexByType={catIndexByType}
      merchants={merchants}
    />
  );
}
