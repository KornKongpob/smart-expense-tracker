import { useEffect, useMemo, useState } from "react";
import { CalendarClock, PauseCircle, PlayCircle, PlusCircle, Repeat2, Trash2 } from "lucide-react";

import AccountSheetPicker from "../AccountSheetPicker.jsx";
import CategoryPresetChooser from "../CategoryPresetChooser.jsx";
import { useExpenseApp } from "../AppProvider.jsx";
import { AmountText, EmptyPanel, ScreenShell, Sheet, StatusPill } from "../ui.jsx";
import {
  buildRecurringOccurrences,
  buildRecurringRulePayload,
  getRecurringDueState,
  getRecurringFrequencyLabel,
  normalizeRecurringKind,
} from "../recurringState.js";
import { getNextRecurringDueISO } from "../../../utils/recurring.js";
import { parseMoneyToSatang, sanitizeMoneyInput } from "../../../utils/money.js";
import { formatDateLong } from "../../../utils/format.js";

const RECURRING_KIND_OPTIONS = [
  { id: "expense", label: "รายจ่าย" },
  { id: "income", label: "รายรับ" },
  { id: "transfer", label: "โอน" },
];

const RECURRING_FREQUENCY_OPTIONS = [
  { id: "daily", label: "รายวัน" },
  { id: "weekly", label: "รายสัปดาห์" },
  { id: "monthly", label: "รายเดือน" },
  { id: "yearly", label: "รายปี" },
];

function toId(value) {
  return String(value || "").trim();
}

function toMoneyInput(value, allowEmpty = true) {
  const amount = Number(value || 0) / 100;
  if (!Number.isFinite(amount)) return allowEmpty ? "" : "0.00";
  if (!amount && allowEmpty) return "";
  return amount.toFixed(2);
}

function getVisibleCategoriesForKind(categories, kind) {
  if (kind === "income") {
    return Array.isArray(categories?.income) ? categories.income.filter((category) => category?.isHidden !== true) : [];
  }
  if (kind === "transfer") return [];
  return Array.isArray(categories?.expense) ? categories.expense.filter((category) => category?.isHidden !== true) : [];
}

function createRecurringDraft(rule, accounts, categories) {
  const allAccounts = Array.isArray(accounts) ? accounts : [];
  const expenseCategories = getVisibleCategoriesForKind(categories, "expense");
  const incomeCategories = getVisibleCategoriesForKind(categories, "income");
  const firstAccountId = allAccounts[0] ? String(allAccounts[0].id) : "";

  if (!rule) {
    return {
      id: null,
      kind: "expense",
      amountInput: "",
      accountId: firstAccountId,
      fromAccountId: firstAccountId,
      toAccountId: "",
      categoryId: expenseCategories[0] ? String(expenseCategories[0].id) : incomeCategories[0] ? String(incomeCategories[0].id) : "",
      merchant: "",
      note: "รายการประจำ",
      frequency: "monthly",
      intervalCount: "1",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: "",
      enabled: true,
    };
  }

  const normalizedKind = normalizeRecurringKind(rule.kind);
  const categoryList = normalizedKind === "income" ? incomeCategories : expenseCategories;

  return {
    id: rule.id || null,
    kind: normalizedKind,
    amountInput: toMoneyInput(rule.amount_satang, false),
    accountId: rule.account_id ? String(rule.account_id) : firstAccountId,
    fromAccountId: rule.from_account_id ? String(rule.from_account_id) : firstAccountId,
    toAccountId: rule.to_account_id ? String(rule.to_account_id) : "",
    categoryId:
      normalizedKind === "transfer"
        ? ""
        : rule.category_id
        ? String(rule.category_id)
        : categoryList[0]
        ? String(categoryList[0].id)
        : "",
    merchant: String(rule.merchant || ""),
    note: String(rule.note || "รายการประจำ"),
    frequency: String(rule.frequency || "monthly"),
    intervalCount: String(rule.interval_count || 1),
    startDate: String(rule.start_date || new Date().toISOString().slice(0, 10)).slice(0, 10),
    endDate: String(rule.end_date || "").slice(0, 10),
    enabled: rule.enabled !== false,
  };
}

function getRuleTitle(rule) {
  const merchant = String(rule?.merchant || "").trim();
  const note = String(rule?.note || "").trim();
  if (merchant) return merchant;
  if (note) return note;
  return "รายการประจำ";
}

function getRuleAccountLabel(rule, accountsById) {
  if (rule.kind === "transfer") {
    const fromName = accountsById.get(toId(rule.from_account_id))?.name || "ไม่พบบัญชีต้นทาง";
    const toName = accountsById.get(toId(rule.to_account_id))?.name || "ไม่พบบัญชีปลายทาง";
    return `${fromName} -> ${toName}`;
  }
  return accountsById.get(toId(rule.account_id))?.name || "-";
}

function getSectionTitle(section) {
  if (section === "due") return "ถึงรอบแล้ว";
  if (section === "paused") return "ปิดใช้งาน";
  return "เปิดใช้งาน";
}

function RecurringRuleSection({
  section,
  rules,
  accountsById,
  onEdit,
  onToggle,
  onDelete,
}) {
  if (!rules.length) return null;

  return (
    <section className="finance-form-section finance-form-section-compact">
      <div className="finance-section-label">{getSectionTitle(section)}</div>
      <div className="finance-list">
        {rules.map((rule) => {
          const dueISO = getNextRecurringDueISO(rule);
          return (
            <article key={rule.id} className="finance-recurring-card">
              <button type="button" className="finance-recurring-main" onClick={() => onEdit(rule)}>
                <div className="finance-row">
                  <div className="finance-row-main">
                    <span className="finance-category-icon finance-account-icon">
                      <Repeat2 size={16} />
                    </span>
                    <div className="finance-account-copy">
                      <div className="finance-row-title">{getRuleTitle(rule)}</div>
                      <div className="finance-row-meta finance-row-meta-wrap">
                        {getRuleAccountLabel(rule, accountsById)} · {getRecurringFrequencyLabel(rule)}
                      </div>
                      <div className="finance-row-meta finance-row-meta-wrap">
                        รอบถัดไป {dueISO ? formatDateLong(dueISO) : "ไม่มีรอบถัดไป"}
                      </div>
                    </div>
                  </div>
                  <div className="finance-row-side finance-recurring-side">
                    <AmountText value={rule.amount_satang} tone={rule.kind === "income" ? "success" : rule.kind === "expense" ? "danger" : "default"} />
                    {section === "due" ? <StatusPill tone="warning">ถึงรอบ</StatusPill> : null}
                  </div>
                </div>
              </button>

              <div className="finance-recurring-actions">
                <button type="button" className="ui-btn ui-btn-secondary" onClick={() => onToggle(rule)}>
                  {rule.enabled ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
                  {rule.enabled ? "พัก" : "เปิด"}
                </button>
                <button type="button" className="ui-btn ui-btn-danger-outline" onClick={() => onDelete(rule)}>
                  <Trash2 size={16} />
                  ลบ
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function RecurringScreen() {
  const {
    accounts,
    categories,
    recurringRules,
    recurringDueToday,
    saveRecurringRule,
    deleteRecurringRule,
    toggleRecurringRule,
    runRecurringNow,
    saving,
  } = useExpenseApp();
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [draft, setDraft] = useState(() => createRecurringDraft(null, accounts, categories));

  const accountsById = useMemo(
    () => new Map((Array.isArray(accounts) ? accounts : []).map((account) => [toId(account?.id), account])),
    [accounts],
  );
  const categoryOptions = useMemo(() => getVisibleCategoriesForKind(categories, draft.kind), [categories, draft.kind]);
  const groupedRules = useMemo(() => {
    const rules = Array.isArray(recurringRules) ? recurringRules : [];
    return {
      due: rules.filter((rule) => getRecurringDueState(rule) === "due"),
      active: rules.filter((rule) => getRecurringDueState(rule) === "active"),
      paused: rules.filter((rule) => getRecurringDueState(rule) === "paused"),
    };
  }, [recurringRules]);

  useEffect(() => {
    if (editorOpen) return;
    setDraft(createRecurringDraft(null, accounts, categories));
  }, [accounts, categories, editorOpen]);

  const amountSatang = parseMoneyToSatang(draft.amountInput || "0");
  const canSave =
    amountSatang > 0 &&
    Boolean(draft.startDate) &&
    Number(draft.intervalCount || 0) > 0 &&
    (draft.kind === "transfer"
      ? Boolean(draft.fromAccountId && draft.toAccountId && draft.fromAccountId !== draft.toAccountId)
      : Boolean(draft.accountId && draft.categoryId));
  const previewRule = buildRecurringRulePayload({
    id: draft.id,
    kind: draft.kind,
    amountSatang,
    accountId: draft.accountId,
    fromAccountId: draft.fromAccountId,
    toAccountId: draft.toAccountId,
    categoryId: draft.categoryId,
    merchant: draft.merchant,
    note: draft.note,
    frequency: draft.frequency,
    intervalCount: draft.intervalCount,
    startDate: draft.startDate,
    endDate: draft.endDate,
    enabled: draft.enabled,
  });
  const previewNextDueISO = getNextRecurringDueISO(previewRule);
  const previewOccurrences = buildRecurringOccurrences(previewRule);

  const openNew = () => {
    setDraft(createRecurringDraft(null, accounts, categories));
    setEditorOpen(true);
  };

  const openEdit = (rule) => {
    setDraft(createRecurringDraft(rule, accounts, categories));
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setDraft(createRecurringDraft(null, accounts, categories));
  };

  const submit = async () => {
    if (!canSave) return;
    const saved = await saveRecurringRule({
      id: draft.id,
      kind: draft.kind,
      amountSatang,
      accountId: draft.accountId,
      fromAccountId: draft.fromAccountId,
      toAccountId: draft.toAccountId,
      categoryId: draft.categoryId,
      merchant: draft.merchant,
      note: draft.note,
      frequency: draft.frequency,
      intervalCount: draft.intervalCount,
      startDate: draft.startDate,
      endDate: draft.endDate,
      enabled: draft.enabled,
    });
    if (saved !== false) closeEditor();
  };

  return (
    <ScreenShell
      title="รายการประจำ"
      subtitle="ตั้งกฎรายรับ รายจ่าย หรือโอนเงินล่วงหน้า แล้วให้ระบบสร้างรายการตามรอบให้อัตโนมัติ"
      headerMode="visible"
      actions={
        <button type="button" className="ui-btn ui-btn-primary" onClick={openNew}>
          <PlusCircle size={16} />
          เพิ่มกฎ
        </button>
      }
    >
      <article className="ui-card finance-panel">
        <div className="finance-panel-head">
          <div>
            <div className="finance-panel-title">สร้างรายการที่ถึงรอบ</div>
            <div className="finance-panel-copy">สร้างรายการที่ถึงรอบตอนนี้ได้ทันที และระบบจะหยุดที่ 200 รายการต่อครั้งเพื่อกันการสร้างย้อนหลังจำนวนมากเกินไป</div>
          </div>
          {recurringDueToday.length ? <StatusPill tone="warning">ถึงรอบ {recurringDueToday.length}</StatusPill> : null}
        </div>
        <div className="finance-inline-actions">
          <button type="button" className="ui-btn ui-btn-primary" disabled={saving} onClick={() => void runRecurringNow()}>
            <PlayCircle size={16} />
            สร้างรายการตอนนี้
          </button>
          <button type="button" className="ui-btn ui-btn-secondary" onClick={openNew}>
            <CalendarClock size={16} />
            ตั้งกฎใหม่
          </button>
        </div>
      </article>

      {groupedRules.due.length || groupedRules.active.length || groupedRules.paused.length ? (
        <article className="ui-card finance-panel">
          <div className="finance-panel-head">
            <div>
              <div className="finance-panel-title">กฎรายการประจำ</div>
              <div className="finance-panel-copy">แตะรายการเพื่อแก้ไข หรือสลับเปิดพักใช้งานได้จากตรงนี้</div>
            </div>
          </div>

          <div className="finance-form">
            <RecurringRuleSection
              section="due"
              rules={groupedRules.due}
              accountsById={accountsById}
              onEdit={openEdit}
              onToggle={(rule) => void toggleRecurringRule(rule, false)}
              onDelete={setDeleteTarget}
            />
            <RecurringRuleSection
              section="active"
              rules={groupedRules.active}
              accountsById={accountsById}
              onEdit={openEdit}
              onToggle={(rule) => void toggleRecurringRule(rule, false)}
              onDelete={setDeleteTarget}
            />
            <RecurringRuleSection
              section="paused"
              rules={groupedRules.paused}
              accountsById={accountsById}
              onEdit={openEdit}
              onToggle={(rule) => void toggleRecurringRule(rule, true)}
              onDelete={setDeleteTarget}
            />
          </div>
        </article>
      ) : (
        <EmptyPanel
          title="ยังไม่มีกฎรายการประจำ"
          copy="ตั้งรายการประจำอย่างเงินเดือน ค่าบ้าน หรือการโอนเข้าเงินออม แล้วให้ระบบสร้างรายการให้ตามรอบได้เลย"
          action={
            <button type="button" className="ui-btn ui-btn-primary" onClick={openNew}>
              เริ่มตั้งกฎแรก
            </button>
          }
        />
      )}

      <Sheet
        open={editorOpen}
        onClose={closeEditor}
        title={draft.id ? "แก้ไขรายการประจำ" : "เพิ่มรายการประจำ"}
        subtitle={previewNextDueISO ? `รอบถัดไป ${formatDateLong(previewNextDueISO)}` : "กำหนดข้อมูลของกฎรายจ่าย/รายรับ/โอน"}
        footer={
          <div className="finance-sheet-actions finance-sheet-actions-sticky">
            <button type="button" className="ui-btn ui-btn-secondary" onClick={closeEditor}>
              ยกเลิก
            </button>
            <button type="button" className="ui-btn ui-btn-primary" disabled={saving || !canSave} onClick={submit}>
              บันทึก
            </button>
          </div>
        }
      >
        <div className="finance-form">
          <section className="finance-form-section finance-form-section-compact">
            <div className="finance-section-label">ประเภท</div>
            <div className="finance-type-grid">
              {RECURRING_KIND_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={["finance-type-chip", draft.kind === option.id ? "is-active" : ""].join(" ")}
                  onClick={() =>
                    setDraft((current) => {
                      const nextKind = option.id;
                      const nextCategories = getVisibleCategoriesForKind(categories, nextKind);
                      return {
                        ...current,
                        kind: nextKind,
                        categoryId:
                          nextKind === "transfer"
                            ? ""
                            : nextCategories.some((category) => String(category?.id || "") === String(current.categoryId || ""))
                            ? current.categoryId
                            : nextCategories[0]
                            ? String(nextCategories[0].id)
                            : "",
                      };
                    })
                  }
                >
                  <span className="finance-type-chip-label">{option.label}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="finance-grid finance-grid-2">
            <label className="finance-field">
              <span className="ui-label">จำนวนเงิน</span>
              <input
                className="ui-input"
                inputMode="decimal"
                value={draft.amountInput}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    amountInput: sanitizeMoneyInput(event.target.value),
                  }))
                }
                placeholder="0.00"
              />
            </label>

            <label className="finance-field">
              <span className="ui-label">เริ่มวันที่</span>
              <input
                className="ui-input"
                type="date"
                value={draft.startDate}
                onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))}
              />
            </label>
          </div>

          <div className="finance-grid finance-grid-2">
            <label className="finance-field">
              <span className="ui-label">ความถี่</span>
              <select
                className="ui-select"
                value={draft.frequency}
                onChange={(event) => setDraft((current) => ({ ...current, frequency: event.target.value }))}
              >
                {RECURRING_FREQUENCY_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="finance-field">
              <span className="ui-label">ทุกกี่รอบ</span>
              <input
                className="ui-input"
                inputMode="numeric"
                value={draft.intervalCount}
                onChange={(event) => setDraft((current) => ({ ...current, intervalCount: event.target.value.replace(/\D+/g, "") || "1" }))}
                placeholder="1"
              />
            </label>
          </div>

          {draft.kind === "transfer" ? (
            <div className="finance-grid finance-grid-2">
              <div className="finance-field">
                <span className="ui-label">จากบัญชี</span>
                <AccountSheetPicker
                  accounts={accounts}
                  value={draft.fromAccountId}
                  onChange={(fromAccountId) => setDraft((current) => ({ ...current, fromAccountId }))}
                  title="เลือกบัญชีต้นทาง"
                  placeholder="เลือกบัญชีต้นทาง"
                />
              </div>
              <div className="finance-field">
                <span className="ui-label">ไปบัญชี</span>
                <AccountSheetPicker
                  accounts={accounts}
                  value={draft.toAccountId}
                  onChange={(toAccountId) => setDraft((current) => ({ ...current, toAccountId }))}
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
                  accounts={accounts}
                  value={draft.accountId}
                  onChange={(accountId) => setDraft((current) => ({ ...current, accountId }))}
                  title="เลือกบัญชี"
                  placeholder="เลือกบัญชี"
                />
              </div>
              <CategoryPresetChooser
                categories={categoryOptions}
                value={draft.categoryId}
                onChange={(categoryId) => setDraft((current) => ({ ...current, categoryId }))}
              />
            </div>
          )}

          <div className="finance-grid finance-grid-2">
            <label className="finance-field">
              <span className="ui-label">ชื่อรายการ/ร้านค้า</span>
              <input
                className="ui-input"
                value={draft.merchant}
                onChange={(event) => setDraft((current) => ({ ...current, merchant: event.target.value }))}
                placeholder="เช่น เงินเดือน / ค่าเช่า / โอนเข้าบัญชีออม"
              />
            </label>
            <label className="finance-field">
              <span className="ui-label">หมายเหตุ</span>
              <input
                className="ui-input"
                value={draft.note}
                onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                placeholder="เช่น เงินเดือนเข้าบัญชีออม"
              />
            </label>
          </div>

          <div className="finance-grid finance-grid-2">
            <label className="finance-field">
              <span className="ui-label">สิ้นสุดวันที่</span>
              <input
                className="ui-input"
                type="date"
                value={draft.endDate}
                onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))}
              />
            </label>
            <label className="finance-field">
              <span className="ui-label">สถานะ</span>
              <select
                className="ui-select"
                value={draft.enabled ? "enabled" : "paused"}
                onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.value === "enabled" }))}
              >
                <option value="enabled">เปิดใช้งาน</option>
                <option value="paused">พักไว้</option>
              </select>
            </label>
          </div>

          <div className="ui-toast ui-toast--info finance-inline-note">
            <div className="finance-toast-copy">
              รอบถัดไป {previewNextDueISO ? formatDateLong(previewNextDueISO) : "ยังไม่คำนวณได้"} ·
              {previewOccurrences.drafts.length
                ? ` ถ้ากดสร้างตอนนี้จะสร้าง ${previewOccurrences.drafts.length} รายการ`
                : " ยังไม่มีรายการที่ถึงรอบในวันนี้"}
            </div>
          </div>
        </div>
      </Sheet>

      <Sheet
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="ลบรายการประจำ"
        subtitle={deleteTarget ? getRuleTitle(deleteTarget) : ""}
        footer={
          <div className="finance-sheet-actions finance-sheet-actions-sticky">
            <button type="button" className="ui-btn ui-btn-secondary" onClick={() => setDeleteTarget(null)}>
              ยกเลิก
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-danger"
              disabled={saving}
              onClick={async () => {
                if (!deleteTarget?.id) return;
                await deleteRecurringRule(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              ลบกฎนี้
            </button>
          </div>
        }
      >
        <div className="finance-panel-copy">
          กฎนี้จะหยุดสร้างรายการใหม่ทันที แต่รายการที่เคยสร้างไปแล้วจะยังคงอยู่ในประวัติรายการเดิม
        </div>
      </Sheet>
    </ScreenShell>
  );
}
