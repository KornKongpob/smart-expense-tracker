import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Edit3,
  PauseCircle,
  PiggyBank,
  PlayCircle,
  PlusCircle,
  Target,
  Trash2,
} from "lucide-react";

import ModalShell from "../../components/ModalShell.jsx";
import { formatCurrency, formatDateLong } from "../../utils/format.js";
import { parseMoneyToSatang, sanitizeMoneyInput } from "../../utils/money.js";
import { generateId } from "../../utils/id.js";
import {
  GOAL_STATUS_OPTIONS,
  GOAL_TYPE_OPTIONS,
  calculateGoalProgressPercent,
  calculateMonthlyNeeded,
  createGoalDraft,
  getGoalRemainingSatang,
  getGoalStatusLabel,
  getGoalStatusTone,
  getGoalTypeLabel,
  normalizeGoalForUi,
  sortGoalsForDisplay,
  summarizeGoals,
} from "./goalCalculators.js";

function MetricTile({ label, value, hint }) {
  return (
    <article className="ui-card finance-metric">
      <div className="finance-metric-label">{label}</div>
      <div className="finance-metric-value">{value}</div>
      {hint ? <div className="finance-metric-hint">{hint}</div> : null}
    </article>
  );
}

function StatusPill({ tone = "default", children }) {
  return <span className={["finance-pill", `finance-pill-${tone}`].join(" ")}>{children}</span>;
}

function GoalTypeIcon({ type }) {
  if (type === "emergency_fund") return <PiggyBank size={18} />;
  if (type === "debt_buffer") return <CheckCircle2 size={18} />;
  if (type === "travel") return <CalendarDays size={18} />;
  return <Target size={18} />;
}

function getAccountName(account) {
  return String(account?.name || account?.displayName || account?.title || "").trim();
}

function buildAccountMap(accounts) {
  const map = new Map();
  for (const account of Array.isArray(accounts) ? accounts : []) {
    const id = String(account?.id || "").trim();
    if (!id) continue;
    map.set(id, account);
  }
  return map;
}

function GoalCard({ goal, accountsById, onEdit, onContribute, onToggle, onDelete, saving }) {
  const progress = calculateGoalProgressPercent(goal);
  const remaining = getGoalRemainingSatang(goal);
  const monthlyNeeded = calculateMonthlyNeeded(goal);
  const linkedNames = goal.linkedAccountIds
    .map((id) => getAccountName(accountsById.get(String(id))))
    .filter(Boolean);
  const canPause = goal.status === "active";
  const toggleLabel = canPause ? "หยุดพัก" : "เปิดต่อ";

  return (
    <article className="ui-card finance-panel">
      <div className="finance-panel-head">
        <div className="finance-row-main">
          <span className="finance-category-icon finance-account-icon">
            <GoalTypeIcon type={goal.type} />
          </span>
          <div className="min-w-0">
            <div className="finance-row-title">{goal.name}</div>
            <div className="finance-row-meta finance-row-meta-wrap">{getGoalTypeLabel(goal.type)}</div>
          </div>
        </div>
        <StatusPill tone={getGoalStatusTone(goal.status)}>{getGoalStatusLabel(goal.status)}</StatusPill>
      </div>

      <div className="finance-grid finance-grid-2">
        <div>
          <div className="finance-metric-label">เป้าหมาย</div>
          <div className="finance-row-amount">{formatCurrency(goal.targetAmount)}</div>
        </div>
        <div>
          <div className="finance-metric-label">ออมแล้ว</div>
          <div className="finance-row-amount">{formatCurrency(goal.currentAmount)}</div>
        </div>
      </div>

      <div className="finance-form-section finance-form-section-compact">
        <div className="finance-progress-bar" aria-label={`ออมแล้ว ${progress}%`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="finance-planner-progress-meta">
          <span>{progress}%</span>
          <span>เหลือ {formatCurrency(remaining)}</span>
        </div>
      </div>

      <div className="finance-list">
        {goal.dueDate ? (
          <div className="finance-row">
            <div className="finance-row-main">
              <span className="finance-category-icon finance-account-icon">
                <CalendarDays size={16} />
              </span>
              <div>
                <div className="finance-row-title">กำหนดไว้</div>
                <div className="finance-row-meta">{formatDateLong(goal.dueDate)}</div>
              </div>
            </div>
            <div className="finance-row-side">
              <span className="finance-row-amount">{formatCurrency(monthlyNeeded)}/เดือน</span>
            </div>
          </div>
        ) : (
          <div className="finance-row">
            <div className="finance-row-main">
              <span className="finance-category-icon finance-account-icon">
                <CalendarDays size={16} />
              </span>
              <div>
                <div className="finance-row-title">แผนรายเดือน</div>
                <div className="finance-row-meta">ยังไม่กำหนดวันเป้าหมาย</div>
              </div>
            </div>
            <div className="finance-row-side">
              <span className="finance-row-amount">{formatCurrency(goal.monthlyContribution)}/เดือน</span>
            </div>
          </div>
        )}

        {linkedNames.length ? (
          <div className="finance-row">
            <div className="finance-row-main">
              <span className="finance-category-icon finance-account-icon">
                <PiggyBank size={16} />
              </span>
              <div>
                <div className="finance-row-title">บัญชีที่ผูกไว้</div>
                <div className="finance-row-meta finance-row-meta-wrap">{linkedNames.join(", ")}</div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="finance-inline-actions">
        <button type="button" className="ui-btn ui-btn-primary" disabled={saving} onClick={() => onContribute(goal)}>
          <PlusCircle size={16} />
          เพิ่มเงิน
        </button>
        <button type="button" className="ui-btn ui-btn-secondary" disabled={saving} onClick={() => onEdit(goal)}>
          <Edit3 size={16} />
          แก้ไข
        </button>
        <button type="button" className="ui-btn ui-btn-secondary" disabled={saving} onClick={() => onToggle(goal)}>
          {canPause ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
          {toggleLabel}
        </button>
        <button type="button" className="ui-btn ui-btn-danger-outline" disabled={saving} onClick={() => onDelete(goal)}>
          <Trash2 size={16} />
          ลบ
        </button>
      </div>
    </article>
  );
}

function GoalExamples({ onCreate }) {
  const examples = ["กองทุนฉุกเฉิน", "เที่ยว", "ซื้อของใหญ่", "เงินสำรองจ่ายหนี้"];

  return (
    <div className="view-empty">
      <div className="finance-empty-title">ยังไม่มีเป้าหมายการออม</div>
      <p className="finance-empty-copy">
        เริ่มจากเป้าหมายที่เห็นภาพชัด เช่น เงินฉุกเฉิน ทริปหน้า ของชิ้นใหญ่ หรือเงินกันไว้จ่ายหนี้
      </p>
      <div className="finance-type-grid">
        {examples.map((example) => (
          <div key={example} className="finance-type-chip">
            <span className="finance-type-chip-label">{example}</span>
          </div>
        ))}
      </div>
      <div className="finance-empty-action">
        <button type="button" className="ui-btn ui-btn-primary" onClick={onCreate}>
          <PlusCircle size={16} />
          สร้างเป้าหมายแรก
        </button>
      </div>
    </div>
  );
}

function AccountMultiSelect({ accounts, selectedIds, onChange }) {
  const selected = new Set((Array.isArray(selectedIds) ? selectedIds : []).map(String));

  if (!accounts.length) {
    return <div className="finance-field-helper">ยังไม่มีบัญชีให้ผูก เป้าหมายยังบันทึกได้ตามปกติ</div>;
  }

  return (
    <div className="finance-type-grid finance-type-grid-accounts">
      {accounts.map((account) => {
        const id = String(account?.id || "").trim();
        if (!id) return null;
        const active = selected.has(id);
        return (
          <button
            key={id}
            type="button"
            className={["finance-type-chip", active ? "is-active" : ""].join(" ")}
            onClick={() => {
              const next = new Set(selected);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              onChange([...next]);
            }}
          >
            <span className="finance-type-chip-label">{getAccountName(account) || "บัญชี"}</span>
            <span className="finance-type-chip-detail">{String(account?.type || "account")}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function GoalsWorkspace({
  goals = [],
  accounts = [],
  saving = false,
  onSaveGoal,
  onDeleteGoal,
  onContributeGoal,
  showAlert,
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(() => createGoalDraft());
  const [editingGoal, setEditingGoal] = useState(null);
  const [formError, setFormError] = useState("");
  const [contributeGoal, setContributeGoal] = useState(null);
  const [contributionAmount, setContributionAmount] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const normalizedGoals = useMemo(() => sortGoalsForDisplay(goals), [goals]);
  const summary = useMemo(() => summarizeGoals(normalizedGoals), [normalizedGoals]);
  const accountsById = useMemo(() => buildAccountMap(accounts), [accounts]);
  const accountList = useMemo(() => (Array.isArray(accounts) ? accounts : []), [accounts]);

  const openCreate = () => {
    setEditingGoal(null);
    setDraft(createGoalDraft());
    setFormError("");
    setEditorOpen(true);
  };

  const openEdit = (goal) => {
    const normalized = normalizeGoalForUi(goal);
    setEditingGoal(normalized);
    setDraft(createGoalDraft(normalized));
    setFormError("");
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingGoal(null);
    setDraft(createGoalDraft());
    setFormError("");
  };

  const updateDraft = (patch) => setDraft((current) => ({ ...current, ...patch }));

  const saveDraft = async () => {
    const targetAmount = parseMoneyToSatang(draft.targetAmount);
    const currentAmount = parseMoneyToSatang(draft.currentAmount);
    const monthlyContribution = parseMoneyToSatang(draft.monthlyContribution);
    const priority = Math.max(1, Math.trunc(Number(draft.priority || 1) || 1));
    const name = String(draft.name || "").trim();

    if (!name) {
      setFormError("กรุณาตั้งชื่อเป้าหมาย");
      return;
    }
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      setFormError("ยอดเป้าหมายต้องมากกว่า 0");
      return;
    }
    if (!Number.isFinite(currentAmount) || currentAmount < 0) {
      setFormError("ยอดออมแล้วต้องไม่ติดลบ");
      return;
    }
    if (!Number.isFinite(monthlyContribution) || monthlyContribution < 0) {
      setFormError("เงินออมต่อเดือนต้องไม่ติดลบ");
      return;
    }

    const now = Date.now();
    const payload = {
      id: draft.id || editingGoal?.id || generateId(),
      name,
      type: draft.type,
      targetAmount,
      currentAmount,
      dueDate: draft.dueDate || "",
      linkedAccountIds: draft.linkedAccountIds,
      priority,
      monthlyContribution,
      autoReserveRule: editingGoal?.autoReserveRule || null,
      status: draft.status,
      createdAt: editingGoal?.createdAt || now,
      updatedAt: now,
    };

    const result = await onSaveGoal?.(payload, editingGoal);
    if (result === false) return;
    closeEditor();
    showAlert?.(editingGoal ? "บันทึกเป้าหมายแล้ว" : "สร้างเป้าหมายแล้ว");
  };

  const toggleGoal = async (goal) => {
    const nextStatus = goal.status === "active" ? "paused" : "active";
    const result = await onSaveGoal?.({ ...goal, status: nextStatus, updatedAt: Date.now() }, goal);
    if (result !== false) showAlert?.(nextStatus === "paused" ? "พักเป้าหมายแล้ว" : "เปิดเป้าหมายต่อแล้ว");
  };

  const submitContribution = async () => {
    const amountSatang = parseMoneyToSatang(contributionAmount);
    if (!Number.isFinite(amountSatang) || amountSatang <= 0) {
      showAlert?.("กรุณาใส่จำนวนเงินที่ต้องการเพิ่ม");
      return;
    }
    const result = await onContributeGoal?.(contributeGoal?.id, amountSatang, contributeGoal);
    if (result === false) return;
    setContributeGoal(null);
    setContributionAmount("");
    showAlert?.("เพิ่มเงินเข้าเป้าหมายแล้ว");
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.id) return;
    const result = await onDeleteGoal?.(deleteTarget.id, deleteTarget);
    if (result === false) return;
    setDeleteTarget(null);
    showAlert?.("ลบเป้าหมายแล้ว");
  };

  return (
    <>
      <section className="finance-grid finance-grid-3">
        <MetricTile label="เป้าหมายที่กำลังออม" value={`${summary.activeCount}`} hint="รายการที่ยังเปิดอยู่" />
        <MetricTile label="ยอดเป้าหมายรวม" value={formatCurrency(summary.totalTarget)} hint="เฉพาะรายการ active" />
        <MetricTile label="ออมแล้ว" value={formatCurrency(summary.totalCurrent)} hint="ยอดปัจจุบันรวม" />
        <MetricTile label="ควรออมต่อเดือน" value={formatCurrency(summary.monthlyContributionNeeded)} hint="ตามวันเป้าหมาย" />
      </section>

      <article className="ui-card finance-panel">
        <div className="finance-panel-head">
          <div>
            <div className="finance-panel-title">เป้าหมายการออม</div>
            <div className="finance-panel-copy">ติดตามเงินก้อนที่ต้องเตรียมไว้ โดยไม่สร้างรายการธุรกรรมอัตโนมัติ</div>
          </div>
          <button type="button" className="ui-btn ui-btn-primary" onClick={openCreate} disabled={saving}>
            <PlusCircle size={16} />
            เพิ่มเป้าหมาย
          </button>
        </div>
      </article>

      {normalizedGoals.length ? (
        <section className="finance-grid finance-grid-2">
          {normalizedGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              accountsById={accountsById}
              onEdit={openEdit}
              onContribute={(item) => {
                setContributeGoal(item);
                setContributionAmount("");
              }}
              onToggle={toggleGoal}
              onDelete={setDeleteTarget}
              saving={saving}
            />
          ))}
        </section>
      ) : (
        <GoalExamples onCreate={openCreate} />
      )}

      <ModalShell
        isOpen={editorOpen}
        onClose={closeEditor}
        title={editingGoal ? "แก้ไขเป้าหมาย" : "เพิ่มเป้าหมายการออม"}
        description="กรอกยอดเป็นบาท ระบบจะแปลงเก็บเป็น satang อัตโนมัติ"
        maxWidth="sm:max-w-2xl"
      >
        <div className="finance-form">
          <label className="finance-field">
            <span className="ui-label">ชื่อเป้าหมาย</span>
            <input
              className="ui-input"
              value={draft.name}
              onChange={(event) => updateDraft({ name: event.target.value })}
              placeholder="เช่น กองทุนฉุกเฉิน 6 เดือน"
            />
          </label>

          <section className="finance-form-section finance-form-section-compact">
            <div className="finance-section-label">ประเภท</div>
            <div className="finance-type-grid">
              {GOAL_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={["finance-type-chip", draft.type === option.id ? "is-active" : ""].join(" ")}
                  onClick={() => updateDraft({ type: option.id })}
                >
                  <span className="finance-type-chip-label">{option.label}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="finance-grid finance-grid-2">
            <label className="finance-field">
              <span className="ui-label">ยอดเป้าหมาย</span>
              <input
                className="ui-input"
                inputMode="decimal"
                value={draft.targetAmount}
                onChange={(event) => updateDraft({ targetAmount: sanitizeMoneyInput(event.target.value) })}
                placeholder="0.00"
              />
            </label>
            <label className="finance-field">
              <span className="ui-label">ออมแล้ว</span>
              <input
                className="ui-input"
                inputMode="decimal"
                value={draft.currentAmount}
                onChange={(event) => updateDraft({ currentAmount: sanitizeMoneyInput(event.target.value) })}
                placeholder="0.00"
              />
            </label>
          </div>

          <div className="finance-grid finance-grid-2">
            <label className="finance-field">
              <span className="ui-label">วันเป้าหมาย</span>
              <input
                className="ui-input"
                type="date"
                value={draft.dueDate}
                onChange={(event) => updateDraft({ dueDate: event.target.value })}
              />
            </label>
            <label className="finance-field">
              <span className="ui-label">ออมต่อเดือน</span>
              <input
                className="ui-input"
                inputMode="decimal"
                value={draft.monthlyContribution}
                onChange={(event) => updateDraft({ monthlyContribution: sanitizeMoneyInput(event.target.value) })}
                placeholder="0.00"
              />
            </label>
          </div>

          <div className="finance-grid finance-grid-2">
            <label className="finance-field">
              <span className="ui-label">ลำดับความสำคัญ</span>
              <input
                className="ui-input"
                inputMode="numeric"
                value={draft.priority}
                onChange={(event) => updateDraft({ priority: event.target.value.replace(/\D+/g, "") || "1" })}
                placeholder="1"
              />
            </label>
            <label className="finance-field">
              <span className="ui-label">สถานะ</span>
              <select className="ui-select" value={draft.status} onChange={(event) => updateDraft({ status: event.target.value })}>
                {GOAL_STATUS_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <section className="finance-form-section finance-form-section-compact">
            <div className="finance-section-label">บัญชีที่เกี่ยวข้อง</div>
            <AccountMultiSelect
              accounts={accountList}
              selectedIds={draft.linkedAccountIds}
              onChange={(linkedAccountIds) => updateDraft({ linkedAccountIds })}
            />
          </section>

          {formError ? <div className="ui-toast ui-toast--error">{formError}</div> : null}

          <div className="finance-sheet-actions finance-sheet-actions-sticky">
            <button type="button" className="ui-btn ui-btn-secondary" onClick={closeEditor}>
              ยกเลิก
            </button>
            <button type="button" className="ui-btn ui-btn-primary" disabled={saving} onClick={saveDraft}>
              บันทึก
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        isOpen={Boolean(contributeGoal)}
        onClose={() => {
          setContributeGoal(null);
          setContributionAmount("");
        }}
        title="เพิ่มเงินเข้าเป้าหมาย"
        description={contributeGoal?.name || ""}
      >
        <div className="finance-form">
          <label className="finance-field">
            <span className="ui-label">จำนวนเงิน</span>
            <input
              className="ui-input"
              inputMode="decimal"
              value={contributionAmount}
              onChange={(event) => setContributionAmount(sanitizeMoneyInput(event.target.value))}
              placeholder="0.00"
            />
          </label>
          <div className="finance-sheet-actions finance-sheet-actions-sticky">
            <button
              type="button"
              className="ui-btn ui-btn-secondary"
              onClick={() => {
                setContributeGoal(null);
                setContributionAmount("");
              }}
            >
              ยกเลิก
            </button>
            <button type="button" className="ui-btn ui-btn-primary" disabled={saving} onClick={submitContribution}>
              เพิ่มเงิน
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="ลบเป้าหมาย"
        description={deleteTarget?.name || ""}
      >
        <div className="finance-form">
          <div className="finance-panel-copy">การลบเป้าหมายจะไม่ลบธุรกรรมหรือยอดบัญชีเดิม</div>
          <div className="finance-sheet-actions finance-sheet-actions-sticky">
            <button type="button" className="ui-btn ui-btn-secondary" onClick={() => setDeleteTarget(null)}>
              ยกเลิก
            </button>
            <button type="button" className="ui-btn ui-btn-danger" disabled={saving} onClick={confirmDelete}>
              ลบเป้าหมายนี้
            </button>
          </div>
        </div>
      </ModalShell>
    </>
  );
}
