import { useState } from "react";
import { CreditCard, PlusCircle, Target, Trash2 } from "lucide-react";

import { useExpenseApp } from "../AppProvider.jsx";
import { EmptyPanel, MetricCard, ScreenShell, Sheet, StatusPill } from "../ui.jsx";
import { getGoalProgressPercent, getGoalRemainingSatang, getNextDebtDueDateISO } from "../plannerState.js";
import { formatCurrency, formatDateLong } from "../../../utils/format.js";
import { parseMoneyToSatang } from "../../../utils/money.js";

const GOAL_STATUS_OPTIONS = [
  { id: "active", label: "กำลังติดตาม" },
  { id: "paused", label: "พักไว้" },
  { id: "completed", label: "สำเร็จแล้ว" },
];

const DEBT_STATUS_OPTIONS = [
  { id: "active", label: "กำลังจ่าย" },
  { id: "paused", label: "พักไว้" },
  { id: "paid_off", label: "ปิดหนี้แล้ว" },
];

function navigateTo(hash) {
  window.location.hash = hash;
}

function toMoneyInput(satang, allowEmpty = true) {
  const amount = Number(satang || 0) / 100;
  if (!Number.isFinite(amount)) return allowEmpty ? "" : "0.00";
  if (!amount && allowEmpty) return "";
  return amount.toFixed(2);
}

function createGoalDraft(goal = null) {
  return {
    id: goal?.id || null,
    name: goal?.name || "",
    targetAmount: toMoneyInput(goal?.target_amount_satang, false),
    currentAmount: toMoneyInput(goal?.current_amount_satang),
    monthlyContribution: toMoneyInput(goal?.monthly_contribution_satang),
    targetDate: goal?.target_date || "",
    linkedAccountId: goal?.linked_account_id ? String(goal.linked_account_id) : "",
    status: goal?.status || "active",
  };
}

function createDebtDraft(plan = null) {
  return {
    id: plan?.id || null,
    accountId: plan?.account_id ? String(plan.account_id) : "",
    currentBalance: toMoneyInput(plan?.current_balance_satang, false),
    targetPayment: toMoneyInput(plan?.target_payment_satang, false),
    dueDay: plan?.due_day ? String(plan.due_day) : "",
    payoffTargetDate: plan?.payoff_target_date || "",
    status: plan?.status || "active",
    note: plan?.note || "",
  };
}

function getGoalStatusLabel(status) {
  return GOAL_STATUS_OPTIONS.find((option) => option.id === status)?.label || "กำลังติดตาม";
}

function getDebtStatusLabel(status) {
  return DEBT_STATUS_OPTIONS.find((option) => option.id === status)?.label || "กำลังจ่าย";
}

export default function PlannerScreen() {
  const {
    accounts,
    financialGoals,
    debtPlans,
    plannerSummary,
    saveFinancialGoal,
    deleteFinancialGoal,
    saveDebtPlan,
    deleteDebtPlan,
    saving,
  } = useExpenseApp();

  const debtAccounts = accounts.filter((account) => account.type === "credit" || account.type === "loan");
  const accountNameMap = new Map(accounts.map((account) => [Number(account.id), account.name]));

  const [goalEditorOpen, setGoalEditorOpen] = useState(false);
  const [goalDeleteConfirmOpen, setGoalDeleteConfirmOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState(createGoalDraft());
  const [debtEditorOpen, setDebtEditorOpen] = useState(false);
  const [debtDeleteConfirmOpen, setDebtDeleteConfirmOpen] = useState(false);
  const [debtDraft, setDebtDraft] = useState(createDebtDraft());

  const openGoalEditor = (goal = null) => {
    setGoalDraft(createGoalDraft(goal));
    setGoalDeleteConfirmOpen(false);
    setGoalEditorOpen(true);
  };

  const closeGoalEditor = () => {
    setGoalDraft(createGoalDraft());
    setGoalDeleteConfirmOpen(false);
    setGoalEditorOpen(false);
  };

  const openDebtEditor = (plan = null) => {
    setDebtDraft(createDebtDraft(plan));
    setDebtDeleteConfirmOpen(false);
    setDebtEditorOpen(true);
  };

  const closeDebtEditor = () => {
    setDebtDraft(createDebtDraft());
    setDebtDeleteConfirmOpen(false);
    setDebtEditorOpen(false);
  };

  const submitGoal = async () => {
    if (!String(goalDraft.name || "").trim()) return;

    await saveFinancialGoal({
      id: goalDraft.id,
      name: goalDraft.name,
      targetAmountSatang: parseMoneyToSatang(goalDraft.targetAmount),
      currentAmountSatang: parseMoneyToSatang(goalDraft.currentAmount || "0"),
      monthlyContributionSatang: parseMoneyToSatang(goalDraft.monthlyContribution || "0"),
      targetDate: goalDraft.targetDate,
      linkedAccountId: goalDraft.linkedAccountId || null,
      status: goalDraft.status,
    });

    closeGoalEditor();
  };

  const submitDebtPlan = async () => {
    if (!debtDraft.accountId) return;

    await saveDebtPlan({
      id: debtDraft.id,
      accountId: debtDraft.accountId,
      currentBalanceSatang: parseMoneyToSatang(debtDraft.currentBalance),
      targetPaymentSatang: parseMoneyToSatang(debtDraft.targetPayment),
      dueDay: debtDraft.dueDay,
      payoffTargetDate: debtDraft.payoffTargetDate,
      status: debtDraft.status,
      note: debtDraft.note,
    });

    closeDebtEditor();
  };

  const handleDeleteGoal = async () => {
    if (!goalDraft.id) return;
    await deleteFinancialGoal(goalDraft.id);
    closeGoalEditor();
  };

  const handleDeleteDebtPlan = async () => {
    if (!debtDraft.id) return;
    await deleteDebtPlan(debtDraft.id);
    closeDebtEditor();
  };

  return (
    <ScreenShell title="วางแผนการเงิน" subtitle="ติดตามเป้าหมายและแผนชำระในที่เดียว">
      <section className="finance-grid finance-planner-summary-grid">
        <MetricCard
          label="จ่ายตามแผนเดือนนี้"
          value={formatCurrency(plannerSummary.monthlyPlannedPaymentSatang)}
          hint={`${plannerSummary.activeDebtCount} แผนที่กำลังติดตาม`}
        />
        <MetricCard
          label="หนี้คงเหลือ"
          value={formatCurrency(plannerSummary.totalDebtBalanceSatang)}
          hint={`${plannerSummary.dueSoonCount} รายการใกล้ถึงกำหนด`}
          tone={plannerSummary.totalDebtBalanceSatang > 0 ? "danger" : "success"}
        />
        <MetricCard
          label="ความคืบหน้าเป้าหมาย"
          value={`${plannerSummary.goalProgressPercent}%`}
          hint={
            plannerSummary.activeGoalCount
              ? `${plannerSummary.activeGoalCount} เป้าหมาย · เก็บแล้ว ${formatCurrency(plannerSummary.totalGoalCurrentSatang)}`
              : "ยังไม่มีเป้าหมายที่กำลังติดตาม"
          }
          tone={plannerSummary.goalProgressPercent >= 100 ? "success" : "default"}
        />
      </section>

      <section className="finance-grid finance-planner-columns">
        <article className="ui-card finance-panel">
          <div className="finance-planner-section-head">
            <div className="finance-planner-section-copy">
              <div className="finance-panel-title">Goals</div>
              <div className="finance-panel-copy">ตั้งเป้าออมเงินและดูว่าต้องเติมอีกเท่าไร</div>
            </div>
            <button type="button" className="ui-btn ui-btn-secondary" onClick={() => openGoalEditor()}>
              <PlusCircle size={16} />
              เพิ่มเป้าหมาย
            </button>
          </div>

          {financialGoals.length ? (
            <div className="finance-planner-list">
              {financialGoals.map((goal) => {
                const progress = getGoalProgressPercent(goal);
                const linkedAccountName = goal.linked_account_id
                  ? accountNameMap.get(Number(goal.linked_account_id))
                  : "";

                return (
                  <button
                    key={goal.id}
                    type="button"
                    className="finance-list-button finance-planner-button"
                    onClick={() => openGoalEditor(goal)}
                  >
                    <div className="finance-planner-item">
                      <div className="finance-planner-item-top">
                        <div className="finance-planner-item-copy">
                          <div className="finance-row-title">{goal.name}</div>
                          <div className="finance-row-meta">
                            {goal.target_date ? `ถึงกำหนด ${formatDateLong(goal.target_date)}` : "ยังไม่กำหนดวัน"}
                            {linkedAccountName ? ` · เก็บใน ${linkedAccountName}` : ""}
                          </div>
                        </div>
                        <div className="finance-row-side">
                          <div className="finance-row-amount">{progress}%</div>
                          <div className="finance-row-meta">{formatCurrency(goal.target_amount_satang)}</div>
                        </div>
                      </div>

                      <div className="finance-planner-item-progress">
                        <div className="finance-progress-bar">
                          <span style={{ width: `${progress}%` }} />
                        </div>
                        <div className="finance-planner-progress-meta">
                          <span>{formatCurrency(goal.current_amount_satang)} / {formatCurrency(goal.target_amount_satang)}</span>
                          <span>เหลือ {formatCurrency(getGoalRemainingSatang(goal))}</span>
                        </div>
                      </div>

                      <div className="finance-chip-grid">
                        {goal.monthly_contribution_satang > 0 ? (
                          <StatusPill tone="default">
                            เติมเดือนละ {formatCurrency(goal.monthly_contribution_satang)}
                          </StatusPill>
                        ) : null}
                        {goal.status !== "active" ? (
                          <StatusPill tone={goal.status === "completed" ? "success" : "warning"}>
                            {getGoalStatusLabel(goal.status)}
                          </StatusPill>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyPanel
              title="ยังไม่มีเป้าหมาย"
              copy="เริ่มจากเป้าหมายก้อนเล็ก เช่น เงินฉุกเฉิน ค่าเดินทาง หรือกองทุนทริปถัดไป"
              action={
                <button type="button" className="ui-btn ui-btn-primary" onClick={() => openGoalEditor()}>
                  <Target size={16} />
                  สร้างเป้าหมายแรก
                </button>
              }
            />
          )}
        </article>

        <article className="ui-card finance-panel">
          <div className="finance-planner-section-head">
            <div className="finance-planner-section-copy">
              <div className="finance-panel-title">Debt</div>
              <div className="finance-panel-copy">วางแผนยอดคงเหลือ ยอดที่ต้องจ่าย และวันครบกำหนด</div>
            </div>
            <button
              type="button"
              className="ui-btn ui-btn-secondary"
              onClick={() => openDebtEditor()}
              disabled={!debtAccounts.length}
            >
              <PlusCircle size={16} />
              เพิ่มแผนหนี้
            </button>
          </div>

          {debtPlans.length ? (
            <div className="finance-planner-list">
              {debtPlans.map((plan) => {
                const nextDueDate = getNextDebtDueDateISO(plan);
                const accountName = accountNameMap.get(Number(plan.account_id)) || "บัญชีที่เชื่อมไว้";

                return (
                  <button
                    key={plan.id}
                    type="button"
                    className="finance-list-button finance-planner-button"
                    onClick={() => openDebtEditor(plan)}
                  >
                    <div className="finance-planner-item">
                      <div className="finance-planner-item-top">
                        <div className="finance-planner-item-copy">
                          <div className="finance-row-title">{accountName}</div>
                          <div className="finance-row-meta">
                            {nextDueDate ? `ครบกำหนด ${formatDateLong(nextDueDate)}` : "ยังไม่กำหนดวันชำระ"}
                            {plan.payoff_target_date ? ` · เป้าปิด ${formatDateLong(plan.payoff_target_date)}` : ""}
                          </div>
                        </div>
                        <div className="finance-row-side">
                          <div className="finance-row-amount">{formatCurrency(plan.current_balance_satang)}</div>
                          <div className="finance-row-meta">คงเหลือ</div>
                        </div>
                      </div>

                      <div className="finance-planner-progress-meta finance-planner-progress-meta-wide">
                        <span>จ่ายตามแผน {formatCurrency(plan.target_payment_satang)}</span>
                        <span>{plan.due_day ? `ทุกวันที่ ${plan.due_day}` : "ไม่ระบุวันครบกำหนด"}</span>
                      </div>

                      <div className="finance-chip-grid">
                        {plan.status !== "active" ? (
                          <StatusPill tone={plan.status === "paid_off" ? "success" : "warning"}>
                            {getDebtStatusLabel(plan.status)}
                          </StatusPill>
                        ) : null}
                        {plan.note ? <StatusPill tone="default">{plan.note}</StatusPill> : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : debtAccounts.length ? (
            <EmptyPanel
              title="ยังไม่มีแผนหนี้"
              copy="เลือกบัญชีบัตรเครดิตหรือสินเชื่อ แล้วกำหนดยอดที่อยากจ่ายในแต่ละงวด"
              action={
                <button type="button" className="ui-btn ui-btn-primary" onClick={() => openDebtEditor()}>
                  <CreditCard size={16} />
                  สร้างแผนชำระ
                </button>
              }
            />
          ) : (
            <EmptyPanel
              title="ยังไม่มีบัญชีหนี้"
              copy="เพิ่มบัญชีประเภทบัตรเครดิตหรือสินเชื่อก่อน แล้วค่อยสร้างแผนชำระ"
              action={
                <button type="button" className="ui-btn ui-btn-primary" onClick={() => navigateTo("#accounts")}>
                  <CreditCard size={16} />
                  ไปที่บัญชี
                </button>
              }
            />
          )}
        </article>
      </section>

      <Sheet
        open={goalEditorOpen}
        onClose={closeGoalEditor}
        title={goalDraft.id ? "แก้ไขเป้าหมาย" : "เป้าหมายใหม่"}
        footer={
          <div className="finance-sheet-actions finance-sheet-actions-sticky">
            <button type="button" className="ui-btn ui-btn-secondary" onClick={closeGoalEditor}>
              ยกเลิก
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-primary"
              disabled={saving || !String(goalDraft.name || "").trim()}
              onClick={submitGoal}
            >
              {goalDraft.id ? "บันทึก" : "สร้างเป้าหมาย"}
            </button>
          </div>
        }
      >
        <div className="finance-form">
          <div className="finance-grid finance-grid-2">
            <label className="finance-field">
              <span className="ui-label">ชื่อเป้าหมาย</span>
              <input
                className="ui-input"
                value={goalDraft.name}
                onChange={(event) => setGoalDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="เช่น เงินฉุกเฉิน"
              />
            </label>

            <label className="finance-field">
              <span className="ui-label">ยอดเป้าหมาย</span>
              <input
                className="ui-input"
                inputMode="decimal"
                value={goalDraft.targetAmount}
                onChange={(event) => setGoalDraft((current) => ({ ...current, targetAmount: event.target.value }))}
                placeholder="0.00"
              />
            </label>
          </div>

          <div className="finance-grid finance-grid-2">
            <label className="finance-field">
              <span className="ui-label">เก็บแล้ว</span>
              <input
                className="ui-input"
                inputMode="decimal"
                value={goalDraft.currentAmount}
                onChange={(event) => setGoalDraft((current) => ({ ...current, currentAmount: event.target.value }))}
                placeholder="0.00"
              />
            </label>

            <label className="finance-field">
              <span className="ui-label">อยากเติมต่อเดือน</span>
              <input
                className="ui-input"
                inputMode="decimal"
                value={goalDraft.monthlyContribution}
                onChange={(event) =>
                  setGoalDraft((current) => ({ ...current, monthlyContribution: event.target.value }))
                }
                placeholder="0.00"
              />
            </label>
          </div>

          <div className="finance-grid finance-grid-2">
            <label className="finance-field">
              <span className="ui-label">วันที่ตั้งเป้าไว้</span>
              <input
                className="ui-input"
                type="date"
                value={goalDraft.targetDate}
                onChange={(event) => setGoalDraft((current) => ({ ...current, targetDate: event.target.value }))}
              />
            </label>

            <label className="finance-field">
              <span className="ui-label">บัญชีที่เชื่อม</span>
              <select
                className="ui-select"
                value={goalDraft.linkedAccountId}
                onChange={(event) =>
                  setGoalDraft((current) => ({ ...current, linkedAccountId: event.target.value }))
                }
              >
                <option value="">ไม่ผูกบัญชี</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="finance-field">
            <span className="ui-label">สถานะ</span>
            <select
              className="ui-select"
              value={goalDraft.status}
              onChange={(event) => setGoalDraft((current) => ({ ...current, status: event.target.value }))}
            >
              {GOAL_STATUS_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {goalDraft.id ? (
            <section className="finance-danger-zone">
              <div className="finance-section-label">โซนอันตราย</div>
              <div className="ui-card finance-danger-card">
                <div className="finance-danger-copy">
                  <div className="finance-panel-title">ลบเป้าหมายนี้ออกจาก Planner</div>
                  <div className="finance-panel-copy">
                    ความคืบหน้าและยอดติดตามของเป้าหมายนี้จะถูกลบออกจากรายการเป้าหมาย
                  </div>
                </div>
                <button
                  type="button"
                  className="ui-btn ui-btn-danger"
                  disabled={saving}
                  onClick={() => setGoalDeleteConfirmOpen(true)}
                  data-testid="planner-goal-delete-trigger"
                >
                  <Trash2 size={16} />
                  ลบเป้าหมาย
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </Sheet>

      <Sheet
        open={debtEditorOpen}
        onClose={closeDebtEditor}
        title={debtDraft.id ? "แก้ไขแผนชำระ" : "แผนชำระใหม่"}
        footer={
          <div className="finance-sheet-actions finance-sheet-actions-sticky">
            <button type="button" className="ui-btn ui-btn-secondary" onClick={closeDebtEditor}>
              ยกเลิก
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-primary"
              disabled={saving || !debtDraft.accountId}
              onClick={submitDebtPlan}
            >
              {debtDraft.id ? "บันทึก" : "สร้างแผนชำระ"}
            </button>
          </div>
        }
      >
        <div className="finance-form">
          <label className="finance-field">
            <span className="ui-label">บัญชีหนี้</span>
            <select
              className="ui-select"
              value={debtDraft.accountId}
              onChange={(event) => setDebtDraft((current) => ({ ...current, accountId: event.target.value }))}
            >
              <option value="">เลือกบัญชี</option>
              {debtAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          <div className="finance-grid finance-grid-2">
            <label className="finance-field">
              <span className="ui-label">ยอดคงเหลือ</span>
              <input
                className="ui-input"
                inputMode="decimal"
                value={debtDraft.currentBalance}
                onChange={(event) => setDebtDraft((current) => ({ ...current, currentBalance: event.target.value }))}
                placeholder="0.00"
              />
            </label>

            <label className="finance-field">
              <span className="ui-label">ยอดที่อยากจ่าย</span>
              <input
                className="ui-input"
                inputMode="decimal"
                value={debtDraft.targetPayment}
                onChange={(event) => setDebtDraft((current) => ({ ...current, targetPayment: event.target.value }))}
                placeholder="0.00"
              />
            </label>
          </div>

          <div className="finance-grid finance-grid-2">
            <label className="finance-field">
              <span className="ui-label">วันครบกำหนด</span>
              <input
                className="ui-input"
                type="number"
                min="1"
                max="31"
                value={debtDraft.dueDay}
                onChange={(event) => setDebtDraft((current) => ({ ...current, dueDay: event.target.value }))}
                placeholder="เช่น 5"
              />
            </label>

            <label className="finance-field">
              <span className="ui-label">เป้าปิดหนี้</span>
              <input
                className="ui-input"
                type="date"
                value={debtDraft.payoffTargetDate}
                onChange={(event) =>
                  setDebtDraft((current) => ({ ...current, payoffTargetDate: event.target.value }))
                }
              />
            </label>
          </div>

          <label className="finance-field">
            <span className="ui-label">สถานะ</span>
            <select
              className="ui-select"
              value={debtDraft.status}
              onChange={(event) => setDebtDraft((current) => ({ ...current, status: event.target.value }))}
            >
              {DEBT_STATUS_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="finance-field">
            <span className="ui-label">บันทึกเพิ่มเติม</span>
            <textarea
              className="ui-input finance-textarea"
              value={debtDraft.note}
              onChange={(event) => setDebtDraft((current) => ({ ...current, note: event.target.value }))}
            />
          </label>

          {debtDraft.id ? (
            <section className="finance-danger-zone">
              <div className="finance-section-label">โซนอันตราย</div>
              <div className="ui-card finance-danger-card">
                <div className="finance-danger-copy">
                  <div className="finance-panel-title">ลบแผนชำระนี้ออกจาก Planner</div>
                  <div className="finance-panel-copy">
                    ระบบจะลบแผนติดตามงวดนี้ออก แต่บัญชีหนี้และรายการที่เคยบันทึกไว้จะยังอยู่
                  </div>
                </div>
                <button
                  type="button"
                  className="ui-btn ui-btn-danger"
                  disabled={saving}
                  onClick={() => setDebtDeleteConfirmOpen(true)}
                  data-testid="planner-debt-delete-trigger"
                >
                  <Trash2 size={16} />
                  ลบแผนชำระ
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </Sheet>

      <Sheet
        open={goalEditorOpen && goalDeleteConfirmOpen}
        onClose={() => setGoalDeleteConfirmOpen(false)}
        title="ยืนยันการลบเป้าหมาย"
        subtitle={goalDraft.name ? `เป้าหมาย ${goalDraft.name}` : "เป้าหมายนี้จะถูกลบออกจาก Planner"}
        footer={
          <div className="finance-sheet-actions">
            <button
              type="button"
              className="ui-btn ui-btn-secondary"
              onClick={() => setGoalDeleteConfirmOpen(false)}
            >
              กลับไปแก้ไข
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-danger"
              disabled={saving}
              onClick={handleDeleteGoal}
              data-testid="planner-goal-delete-confirm"
            >
              <Trash2 size={16} />
              ยืนยันการลบ
            </button>
          </div>
        }
      >
        <div className="finance-form">
          <section className="finance-danger-sheet">
            <div className="finance-danger-sheet-copy">
              <div className="finance-panel-title">สิ่งที่จะเกิดขึ้นหลังลบ</div>
              <div className="finance-panel-copy">
                เป้าหมายนี้จะหายจากหน้า Planner และจะไม่ถูกนับรวมใน progress summary อีกต่อไป
              </div>
            </div>
            <div className="finance-danger-checklist">
              <div className="finance-danger-check">ยอดสะสมของเป้าหมายนี้จะไม่ถูกนับรวมในความคืบหน้าแล้ว</div>
              <div className="finance-danger-check">บัญชีที่เชื่อมไว้จะไม่ถูกลบตามไปด้วย</div>
              <div className="finance-danger-check">หากยังไม่แน่ใจ แนะนำให้เปลี่ยนสถานะเป็นพักไว้แทน</div>
            </div>
          </section>
        </div>
      </Sheet>

      <Sheet
        open={debtEditorOpen && debtDeleteConfirmOpen}
        onClose={() => setDebtDeleteConfirmOpen(false)}
        title="ยืนยันการลบแผนชำระ"
        subtitle="แผนนี้จะถูกลบออกจากรายการติดตามหนี้"
        footer={
          <div className="finance-sheet-actions">
            <button
              type="button"
              className="ui-btn ui-btn-secondary"
              onClick={() => setDebtDeleteConfirmOpen(false)}
            >
              กลับไปแก้ไข
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-danger"
              disabled={saving}
              onClick={handleDeleteDebtPlan}
              data-testid="planner-debt-delete-confirm"
            >
              <Trash2 size={16} />
              ยืนยันการลบ
            </button>
          </div>
        }
      >
        <div className="finance-form">
          <section className="finance-danger-sheet">
            <div className="finance-danger-sheet-copy">
              <div className="finance-panel-title">สิ่งที่จะเกิดขึ้นหลังลบ</div>
              <div className="finance-panel-copy">
                แผนชำระนี้จะหายจากหน้า Planner แต่บัญชีหนี้จริงและรายการธุรกรรมเดิมยังอยู่เหมือนเดิม
              </div>
            </div>
            <div className="finance-danger-checklist">
              <div className="finance-danger-check">บัญชีบัตรเครดิตหรือสินเชื่อจะไม่ถูกลบ</div>
              <div className="finance-danger-check">รายการธุรกรรมเดิมจะยังอยู่ในระบบ</div>
              <div className="finance-danger-check">หากยังอยากเก็บไว้ แนะนำให้เปลี่ยนสถานะเป็นพักไว้แทน</div>
            </div>
          </section>
        </div>
      </Sheet>
    </ScreenShell>
  );
}
