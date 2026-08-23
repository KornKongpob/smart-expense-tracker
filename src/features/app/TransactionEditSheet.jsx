import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Repeat2, Trash2 } from "lucide-react";

import AccountSheetPicker from "./AccountSheetPicker.jsx";
import CategoryPresetChooser from "./CategoryPresetChooser.jsx";
import { AmountText, Sheet } from "./ui.jsx";
import { formatTransactionDateTime, normalizeTimeHHmm, toISODate } from "../../utils/format.js";
import { parseMoneyToSatang, sanitizeMoneyInput } from "../../utils/money.js";

function toId(value) {
  return String(value || "").trim();
}

function toMoneyInput(satang, allowEmpty = true) {
  const amount = Number(satang || 0) / 100;
  if (!Number.isFinite(amount)) return allowEmpty ? "" : "0.00";
  if (!amount && allowEmpty) return "";
  return amount.toFixed(2);
}

export function getTransactionKindLabel(kind) {
  const key = String(kind || "expense").trim().toLowerCase();
  if (key === "income") return "รายรับ";
  if (key === "transfer") return "โอน";
  return "รายจ่าย";
}

export function getTransactionAmountTone(kind) {
  const key = String(kind || "expense").trim().toLowerCase();
  if (key === "income") return "success";
  if (key === "expense") return "danger";
  return "default";
}

export function TransactionKindIcon({ kind }) {
  const key = String(kind || "expense").trim().toLowerCase();
  if (key === "income") return <ArrowUpRight size={16} />;
  if (key === "transfer") return <Repeat2 size={16} />;
  return <ArrowDownLeft size={16} />;
}

export function buildTransactionTitle(transaction) {
  const merchant = String(transaction?.merchant || "").trim();
  const note = String(transaction?.note || "").trim();
  if (merchant) return merchant;
  if (note) return note;
  return String(transaction?.kind || "").trim().toLowerCase() === "transfer"
    ? "โอนเงิน"
    : `รายการ${getTransactionKindLabel(transaction?.kind)}`;
}

export function buildTransactionAccountLabel(transaction, accountMap) {
  const kind = String(transaction?.kind || "").trim().toLowerCase();

  if (kind === "transfer") {
    const fromName = accountMap.get(toId(transaction?.from_account_id))?.name || "ไม่พบบัญชีต้นทาง";
    const toName = accountMap.get(toId(transaction?.to_account_id))?.name || "ไม่พบบัญชีปลายทาง";
    return `${fromName} -> ${toName}`;
  }

  return accountMap.get(toId(transaction?.account_id))?.name || "";
}

export function buildTransactionDateTimeLabel(transaction) {
  return formatTransactionDateTime(
    transaction?.date,
    transaction?.transactionTime || transaction?.transaction_time || transaction?.raw?.transactionTime || transaction?.raw?.time || transaction?.time || "",
  );
}

export function canEditTransactionFromHistory(transaction) {
  return Boolean(transaction) && transaction?.is_split_parent !== true && transaction?.is_split_child !== true;
}

function getReadOnlyTransactionNote(transaction) {
  if (transaction?.is_split_parent) {
    return "รายการนี้เป็นรายการแยกหมวด จึงเปิดแก้จากการ์ดนี้ไม่ได้ แต่ยังดูสรุปและลบทั้งชุดได้";
  }
  if (transaction?.is_split_child) {
    return "รายการนี้เป็นรายการย่อยจากการแยกหมวด จึงต้องกลับไปแก้จากรายการหลัก";
  }
  return "รายการนี้ยังไม่รองรับการแก้ไขจากการ์ดล่าสุด แต่ยังดูสรุปและลบรายการได้";
}

function createTransactionEditDraft(transaction = null) {
  const source = transaction && typeof transaction === "object" ? transaction : {};
  const kind = String(source?.kind || "expense").trim().toLowerCase() || "expense";
  return {
    kind,
    accountId: kind === "transfer" ? "" : toId(source?.account_id),
    fromAccountId: toId(source?.from_account_id),
    toAccountId: toId(source?.to_account_id),
    categoryId: kind === "transfer" ? "" : toId(source?.category_id),
    amountSatang: Number(source?.amount_satang || 0),
    merchant: String(source?.merchant || ""),
    note: String(source?.note || ""),
    reference: String(source?.reference || ""),
    paymentMethod: String(source?.payment_method || ""),
    date: source?.date ? String(source.date).slice(0, 10) : toISODate(new Date()),
    time: normalizeTimeHHmm(source?.raw?.time || source?.time) || "",
  };
}

export default function TransactionEditSheet({
  transaction,
  open,
  onClose,
  accounts,
  categories,
  saving,
  updateTransaction,
  deleteTransaction,
}) {
  const allAccounts = useMemo(() => (Array.isArray(accounts) ? accounts : []), [accounts]);
  const accountMap = useMemo(
    () => new Map(allAccounts.map((account) => [toId(account?.id), account])),
    [allAccounts],
  );
  const [editDraft, setEditDraft] = useState(createTransactionEditDraft());
  const [editAmountInput, setEditAmountInput] = useState("");
  const [editShowMore, setEditShowMore] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const editable = canEditTransactionFromHistory(transaction);
  const transactionKey = toId(transaction?.id);

  const resetEditDraft = useEffectEvent(() => {
    if (!open || !transaction) {
      setEditDraft(createTransactionEditDraft());
      setEditAmountInput("");
      setEditShowMore(false);
      setDeleteConfirmOpen(false);
      return;
    }

    const nextDraft = createTransactionEditDraft(transaction);
    setEditDraft(nextDraft);
    setEditAmountInput(toMoneyInput(nextDraft.amountSatang));
    setEditShowMore(false);
    setDeleteConfirmOpen(false);
  });

  // Keyed on the transaction id, not the object: a background refresh hands over
  // a new object for the same row and would otherwise reset edits in progress.
  useEffect(() => {
    resetEditDraft();
  }, [open, transactionKey]);

  const editCategories = (
    editDraft.kind === "income"
      ? Array.isArray(categories?.income)
        ? categories.income
        : []
      : editDraft.kind === "transfer"
        ? []
        : Array.isArray(categories?.expense)
          ? categories.expense
          : []
  ).filter((category) => category?.isHidden !== true);

  const canSaveEdit =
    parseMoneyToSatang(editAmountInput || "0") > 0 &&
    (editDraft.kind === "transfer"
      ? Boolean(
          editDraft.fromAccountId &&
            editDraft.toAccountId &&
            editDraft.fromAccountId !== editDraft.toAccountId,
        )
      : Boolean(editDraft.accountId));

  const closeSheet = () => {
    setDeleteConfirmOpen(false);
    onClose?.();
  };

  const submitEdit = async () => {
    if (!transaction || !editable || !canSaveEdit) return;
    const saved = await updateTransaction?.(transaction, {
      ...editDraft,
      amountSatang: parseMoneyToSatang(editAmountInput || "0"),
    });
    if (saved) closeSheet();
  };

  const submitDelete = async () => {
    if (!transaction) return;
    const deleted = await deleteTransaction?.(transaction);
    if (!deleted) return;
    setDeleteConfirmOpen(false);
    onClose?.();
  };

  if (!open || !transaction) return null;

  return (
    <>
      <Sheet
        open={open}
        onClose={closeSheet}
        title={editable ? "แก้ไขรายการ" : "รายละเอียดรายการ"}
        subtitle={buildTransactionTitle(transaction)}
        footer={
          editable ? (
            <div className="finance-sheet-actions-compact">
              <button
                type="button"
                className="ui-btn ui-btn-danger-outline ui-btn-compact finance-sheet-danger-trigger"
                disabled={saving}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 size={16} />
                ลบรายการ
              </button>
              <div className="finance-sheet-actions-end">
                <button type="button" className="ui-btn ui-btn-secondary" onClick={closeSheet}>
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn-primary"
                  disabled={saving || !canSaveEdit}
                  onClick={submitEdit}
                >
                  บันทึก
                </button>
              </div>
            </div>
          ) : (
            <div className="finance-sheet-actions-compact">
              <button
                type="button"
                className="ui-btn ui-btn-danger-outline ui-btn-compact finance-sheet-danger-trigger"
                disabled={saving}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 size={16} />
                ลบรายการ
              </button>
              <div className="finance-sheet-actions-end">
                <button type="button" className="ui-btn ui-btn-secondary" onClick={closeSheet}>
                  ปิดหน้านี้
                </button>
              </div>
            </div>
          )
        }
      >
        {editable ? (
          <div className="finance-form">
            <section className="finance-form-section">
              <div className="finance-grid finance-grid-3">
                <label className="finance-field">
                  <span className="ui-label">จำนวนเงิน</span>
                  <input
                    className="ui-input"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={editAmountInput}
                    onChange={(event) => setEditAmountInput(sanitizeMoneyInput(event.target.value))}
                  />
                </label>

                <label className="finance-field">
                  <span className="ui-label">วันที่</span>
                  <input
                    className="ui-input"
                    type="date"
                    value={editDraft.date}
                    onChange={(event) => setEditDraft((current) => ({ ...current, date: event.target.value }))}
                  />
                </label>

                <label className="finance-field">
                  <span className="ui-label">เวลา</span>
                  <input
                    className="ui-input"
                    type="time"
                    value={editDraft.time || ""}
                    onChange={(event) => setEditDraft((current) => ({ ...current, time: event.target.value }))}
                  />
                </label>
              </div>

              {editDraft.kind === "transfer" ? (
                <div className="finance-grid finance-grid-2">
                  <div className="finance-field">
                    <span className="ui-label">จากบัญชี</span>
                    <AccountSheetPicker
                      accounts={allAccounts}
                      value={editDraft.fromAccountId}
                      onChange={(fromAccountId) =>
                        setEditDraft((current) => ({
                          ...current,
                          fromAccountId,
                          toAccountId:
                            String(current.toAccountId || "") === String(fromAccountId || "")
                              ? ""
                              : current.toAccountId,
                        }))
                      }
                      title="เลือกบัญชีต้นทาง"
                      placeholder="เลือกบัญชีต้นทาง"
                    />
                  </div>

                  <div className="finance-field">
                    <span className="ui-label">ไปบัญชี</span>
                    <AccountSheetPicker
                      accounts={allAccounts}
                      value={editDraft.toAccountId}
                      onChange={(toAccountId) =>
                        setEditDraft((current) => ({
                          ...current,
                          toAccountId:
                            String(toAccountId || "") === String(current.fromAccountId || "")
                              ? ""
                              : toAccountId,
                        }))
                      }
                      title="เลือกบัญชีปลายทาง"
                      placeholder="เลือกบัญชีปลายทาง"
                    />
                  </div>
                </div>
              ) : (
                <div className="finance-grid finance-grid-2">
                  <div className="finance-field">
                    <span className="ui-label">บัญชี</span>
                    <AccountSheetPicker
                      accounts={allAccounts}
                      value={editDraft.accountId}
                      onChange={(accountId) =>
                        setEditDraft((current) => ({
                          ...current,
                          accountId,
                          fromAccountId: accountId || current.fromAccountId,
                        }))
                      }
                      title="เลือกบัญชี"
                      placeholder="เลือกบัญชี"
                    />
                  </div>

                  <CategoryPresetChooser
                    categories={editCategories}
                    value={editDraft.categoryId}
                    onChange={(categoryId) => setEditDraft((current) => ({ ...current, categoryId }))}
                  />
                </div>
              )}

              <label className="finance-field">
                <span className="ui-label">รายการ</span>
                <input
                  className="ui-input"
                  value={editDraft.merchant}
                  onChange={(event) => setEditDraft((current) => ({ ...current, merchant: event.target.value }))}
                  placeholder="เช่น ค่าอาหาร"
                />
              </label>
            </section>

            <details className="finance-details" open={editShowMore}>
              <summary
                className="finance-details-summary bento-summary"
                onClick={(event) => {
                  event.preventDefault();
                  setEditShowMore((current) => !current);
                }}
              >
                <span>รายละเอียดเพิ่ม</span>
                <span className="finance-details-caret">{editShowMore ? "ซ่อน" : "แสดง"}</span>
              </summary>

              {editShowMore ? (
                <div className="finance-details-body">
                  <div className="finance-grid finance-grid-2">
                    <label className="finance-field">
                      <span className="ui-label">อ้างอิง</span>
                      <input
                        className="ui-input"
                        value={editDraft.reference}
                        onChange={(event) =>
                          setEditDraft((current) => ({ ...current, reference: event.target.value }))
                        }
                      />
                    </label>

                    <label className="finance-field">
                      <span className="ui-label">วิธีจ่าย</span>
                      <input
                        className="ui-input"
                        value={editDraft.paymentMethod}
                        onChange={(event) =>
                          setEditDraft((current) => ({ ...current, paymentMethod: event.target.value }))
                        }
                      />
                    </label>
                  </div>

                  <label className="finance-field">
                    <span className="ui-label">บันทึกเพิ่ม</span>
                    <textarea
                      className="ui-input finance-textarea"
                      value={editDraft.note}
                      onChange={(event) => setEditDraft((current) => ({ ...current, note: event.target.value }))}
                    />
                  </label>
                </div>
              ) : null}
            </details>
          </div>
        ) : (
          <div className="finance-form">
            <section className="finance-history-preview-sheet">
              <div className="finance-history-preview-note">{getReadOnlyTransactionNote(transaction)}</div>
              <div className="finance-list finance-history-preview-list">
                <div className="finance-row finance-history-preview-row">
                  <div className="finance-history-preview-copy">
                    <div className="finance-history-preview-label">ประเภท</div>
                    <div className="finance-history-preview-value">{getTransactionKindLabel(transaction.kind)}</div>
                  </div>
                  <AmountText
                    value={transaction.amount_satang}
                    tone={getTransactionAmountTone(transaction.kind)}
                  />
                </div>
                <div className="finance-row finance-history-preview-row">
                  <div className="finance-history-preview-copy">
                    <div className="finance-history-preview-label">บัญชี</div>
                    <div className="finance-history-preview-value finance-history-preview-value-muted">
                      {buildTransactionAccountLabel(transaction, accountMap) || "-"}
                    </div>
                  </div>
                </div>
                <div className="finance-row finance-history-preview-row">
                  <div className="finance-history-preview-copy">
                    <div className="finance-history-preview-label">วันเวลา</div>
                    <div className="finance-history-preview-value finance-history-preview-value-muted">
                      {buildTransactionDateTimeLabel(transaction) || "-"}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </Sheet>

      <Sheet
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="ยืนยันการลบรายการ"
        subtitle={buildTransactionTitle(transaction)}
        footer={
          <div className="finance-sheet-actions">
            <button type="button" className="ui-btn ui-btn-secondary" onClick={() => setDeleteConfirmOpen(false)}>
              กลับไปแก้ไข
            </button>
            <button type="button" className="ui-btn ui-btn-danger" disabled={saving} onClick={submitDelete}>
              <Trash2 size={16} />
              ยืนยันการลบ
            </button>
          </div>
        }
      >
        <div className="finance-form">
          <section className="finance-account-danger-sheet">
            <div className="finance-account-danger-sheet-copy">
              <div className="finance-panel-title">สิ่งที่จะเกิดขึ้นหลังลบ</div>
              <div className="finance-panel-copy">
                {transaction?.is_split_parent
                  ? "รายการหลักและรายการย่อยในชุดเดียวกันจะถูกลบออกจากประวัติทั้งหมด"
                  : "รายการนี้จะถูกนำออกจากประวัติและยอดสรุปของหน้า Overview จะอัปเดตทันที"}
              </div>
            </div>
            <div className="finance-account-danger-checklist">
              <div className="finance-account-danger-check">ยอดสรุปจะคำนวณใหม่หลังลบ</div>
              <div className="finance-account-danger-check">
                {transaction?.is_split_parent
                  ? "รายการย่อยในชุดเดียวกันจะถูกลบพร้อมกัน"
                  : "การลบรายการนี้ไม่สามารถย้อนกลับจากหน้านี้ได้"}
              </div>
              <div className="finance-account-danger-check">หากยังไม่แน่ใจ แนะนำให้ใช้การแก้ไขแทนการลบ</div>
            </div>
          </section>
        </div>
      </Sheet>
    </>
  );
}
