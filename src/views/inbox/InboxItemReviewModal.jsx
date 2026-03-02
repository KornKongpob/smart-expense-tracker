import React, { useEffect, useMemo, useState } from "react";

import TransactionReviewModal from "../../components/TransactionReviewModal";
import { useBlobInfo } from "../../utils/useBlobInfo";
import { isCreditAccount } from "../../utils/accountMatch";
import { toISODate } from "../../utils/format";
import { isAdjustmentLike } from "../../utils/receiptAdjustments";

const safeStr = (v) => String(v || "").trim();
const safeSatang = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
};
const normalizeType = (v) => {
  const t = safeStr(v).toLowerCase();
  if (t === "income" || t === "transfer" || t === "credit_payment") return t;
  return "expense";
};

function sanitizeGroups(groups, parentCategoryId = "") {
  const list = Array.isArray(groups) ? groups : [];
  const out = [];
  for (const g of list) {
    if (!g || typeof g !== "object") continue;
    const amount = safeSatang(g.amount);
    const note = safeStr(g.note || g.name || g.title);
    const categoryId = safeStr(g.categoryId || g.category) || safeStr(parentCategoryId);
    out.push({ ...g, amount, note, categoryId });
  }
  return out;
}

export default function InboxItemReviewModal({
  isOpen,
  item,
  onClose,
  onSave,
  showAlert,
  accounts,
  categoriesByType, // { expense: [], income: [] }
  merchants,
  recentExpenseCats = [],
  recentIncomeCats = [],
  recentExpenseAccounts = [],
  recentIncomeAccounts = [],
}) {
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    // clone shallowly to avoid mutating store item
    setDraft(item ? { ...item } : null);
  }, [isOpen, item?.id]);

  const { url: blobUrl, mimeType } = useBlobInfo(draft?.attachmentId);

  const expenseCatsAll = useMemo(() => categoriesByType?.expense || [], [categoriesByType]);
  const incomeCatsAll = useMemo(() => categoriesByType?.income || [], [categoriesByType]);

  const nonCreditAccounts = useMemo(
    () => (Array.isArray(accounts) ? accounts : []).filter((a) => !isCreditAccount(a)),
    [accounts]
  );

  const recentCatsByType = useMemo(
    () => ({
      expense: recentExpenseCats,
      income: recentIncomeCats,
    }),
    [recentExpenseCats, recentIncomeCats]
  );

  const recentAccountsByType = useMemo(
    () => ({
      expense: recentExpenseAccounts,
      income: recentIncomeAccounts,
    }),
    [recentExpenseAccounts, recentIncomeAccounts]
  );

  const catIndexByType = useMemo(() => {
    const mk = (catsAll) => {
      const byId = new Map();
      for (const c of Array.isArray(catsAll) ? catsAll : []) {
        const id = safeStr(c?.id);
        if (id) byId.set(id, c);
      }
      return { byId };
    };
    return {
      expense: mk(expenseCatsAll),
      income: mk(incomeCatsAll),
    };
  }, [expenseCatsAll, incomeCatsAll]);

  const txForModal = useMemo(() => {
    if (!draft) return null;

    const fileKind = String(mimeType || "").toLowerCase().includes("pdf") ? "pdf" : "img";
    return {
      ...draft,
      // normalize naming to what modal expects
      txType: draft?.txType || draft?.type,
      type: draft?.type || draft?.txType,
      previewUrl: blobUrl || draft?.previewUrl || null,
      fileKind: draft?.fileKind || fileKind,
      fileName: draft?.fileName || draft?.originalName || "attachment",
      amount: safeSatang(draft?.amount),
      date: draft?.date ? String(draft.date).slice(0, 10) : toISODate(new Date()),
    };
  }, [draft, blobUrl, mimeType]);

  const handleUpdateItem = (id, patch) => {
    const p = patch && typeof patch === "object" ? patch : {};
    setDraft((prev) => {
      const cur = prev && typeof prev === "object" ? prev : {};
      const next = { ...cur, ...p };

      // Keep both keys in sync for compatibility across flows
      if (p.txType != null && next.type == null) next.type = p.txType;
      if (p.type != null && next.txType == null) next.txType = p.type;

      if (p.ref != null && next.referenceId == null) next.referenceId = p.ref;
      if (p.referenceId != null && next.ref == null) next.ref = p.referenceId;

      return next;
    });
  };

  const handleUpdateGroup = (id, idx, patch) => {
    const i = Number(idx);
    if (!Number.isFinite(i)) return;
    const p = patch && typeof patch === "object" ? patch : {};
    setDraft((prev) => {
      const cur = prev && typeof prev === "object" ? prev : {};
      const groups = Array.isArray(cur.groups) ? cur.groups.slice() : [];
      if (!groups[i]) return cur;
      groups[i] = { ...groups[i], ...p };
      return { ...cur, groups };
    });
  };

  const handleTypeChange = (id, nextType) => {
    const t = normalizeType(nextType);
    setDraft((prev) => {
      const cur = prev && typeof prev === "object" ? prev : {};
      return { ...cur, type: t, txType: t };
    });
  };

  const validateBeforeSave = (d) => {
    const t = normalizeType(d?.type || d?.txType);
    const amt = safeSatang(d?.amount);
    if (amt < 0) {
      showAlert?.("ยอดเงินไม่ถูกต้อง");
      return false;
    }

    if ((t === "transfer" || t === "credit_payment") && (!safeStr(d?.fromAccountId) || !safeStr(d?.toAccountId))) {
      showAlert?.("กรุณาเลือกบัญชีต้นทางและปลายทางให้ครบ");
      return false;
    }
    if ((t === "transfer" || t === "credit_payment") && safeStr(d?.fromAccountId) === safeStr(d?.toAccountId)) {
      showAlert?.("บัญชีต้นทางและปลายทางต้องไม่เป็นบัญชีเดียวกัน");
      return false;
    }

    if (t === "expense" && d?.splitByCategory && Array.isArray(d?.groups) && d.groups.length) {
      const positives = d.groups
        .map((g) => ({ ...g, amount: safeSatang(g?.amount) }))
        .filter((g) => Number(g.amount) > 0);
      const nonAdjPos = positives.filter((g) => !isAdjustmentLike(g));
      if (nonAdjPos.length < 2) {
        showAlert?.("Split ต้องมีอย่างน้อย 2 รายการสินค้า (ไม่รวมส่วนลด/ค่าธรรมเนียม)");
        return false;
      }

      for (const g of positives) {
        const cat = safeStr(g?.categoryId || g?.category) || safeStr(d?.categoryId);
        if (!cat) {
          showAlert?.("กรุณาเลือกหมวดหมู่ให้ครบ (ในกลุ่มแยกหมวด)");
          return false;
        }
      }
    }

    if (d?.isInstallment) {
      if (t !== "expense") {
        showAlert?.("ผ่อนชำระใช้ได้เฉพาะรายการรายจ่าย");
        return false;
      }
      if (d?.splitByCategory) {
        showAlert?.("ผ่อนชำระ: กรุณาปิด Split ก่อน");
        return false;
      }
      const acc =
        (Array.isArray(accounts) ? accounts : []).find((a) => safeStr(a?.id) === safeStr(d?.accountId)) || null;
      if (!acc || !isCreditAccount(acc)) {
        showAlert?.("ผ่อนชำระ: ต้องเลือกบัญชีเป็นบัตรเครดิต");
        return false;
      }
      const m = Math.max(2, Math.min(120, Math.trunc(Number(d?.installmentMonths) || 2)));
      if (m < 2) {
        showAlert?.("ผ่อนชำระ: จำนวนงวดต้องมากกว่าหรือเท่ากับ 2");
        return false;
      }
    }

    return true;
  };

  const handleDone = () => {
    if (!draft) return;
    if (!validateBeforeSave(draft)) return;

    const t = normalizeType(draft?.type || draft?.txType);
    const date = draft?.date ? String(draft.date).slice(0, 10) : toISODate(new Date());
    const referenceId = safeStr(draft?.referenceId || draft?.ref);

    const patch = {
      type: t,
      txType: t,
      amount: safeSatang(draft?.amount),
      date,
      merchant: safeStr(draft?.merchant),
      note: safeStr(draft?.note),
      referenceId,
      ref: referenceId,

      accountId: safeStr(draft?.accountId),
      fromAccountId: safeStr(draft?.fromAccountId),
      toAccountId: safeStr(draft?.toAccountId),

      categoryId: safeStr(draft?.categoryId),
      splitByCategory: !!draft?.splitByCategory,
      groups: sanitizeGroups(draft?.groups, draft?.categoryId),

      isInstallment: !!draft?.isInstallment,
      installmentMonths: Math.max(2, Math.min(120, Math.trunc(Number(draft?.installmentMonths) || 2))),

      includeDuplicate: !!draft?.includeDuplicate,
    };

    onSave?.(safeStr(draft?.id), patch);
    onClose?.();
  };

  if (!isOpen) return null;

  return (
    <TransactionReviewModal
      isOpen={isOpen}
      q={txForModal}
      title="แก้ไขรายการใน Inbox"
      onClose={onClose}
      onDone={handleDone}
      doneLabel="บันทึกการแก้ไข"
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
