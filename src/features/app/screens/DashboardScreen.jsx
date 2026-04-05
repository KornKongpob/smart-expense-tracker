import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CreditCard, PencilLine, PlusCircle, Repeat2, Target, Trash2 } from "lucide-react";

import { useExpenseApp } from "../AppProvider.jsx";
import AccountSheetPicker from "../AccountSheetPicker.jsx";
import CategoryPresetChooser from "../CategoryPresetChooser.jsx";
import { AmountText, MetricCard, ScreenShell, Sheet, StatusPill } from "../ui.jsx";
import { getPresetLabel, resolvePresetForAccount } from "../accountPresetUtils.js";
import { formatCurrency } from "../../../utils/format.js";
import { parseMoneyToSatang, sanitizeMoneyInput } from "../../../utils/money.js";

function percentOf(value, total) {
  const numerator = Number(value || 0);
  const denominator = Number(total || 0);
  if (!denominator) return 0;
  return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
}

function hasValue(value) {
  return Math.abs(Number(value || 0)) > 0;
}

function navigateTo(hash) {
  window.location.hash = hash;
}

const ACCOUNT_DEEPLINK_KEY = "smart-expense-open-account";

function toId(value) {
  return String(value || "").trim();
}

function toMoneyInput(satang, allowEmpty = true) {
  const amount = Number(satang || 0) / 100;
  if (!Number.isFinite(amount)) return allowEmpty ? "" : "0.00";
  if (!amount && allowEmpty) return "";
  return amount.toFixed(2);
}

function getTransactionKindLabel(kind) {
  const key = String(kind || "expense").trim().toLowerCase();
  if (key === "income") return "รายรับ";
  if (key === "transfer") return "โอน";
  return "รายจ่าย";
}

function getTransactionAmountTone(kind) {
  const key = String(kind || "expense").trim().toLowerCase();
  if (key === "income") return "success";
  if (key === "expense") return "danger";
  return "default";
}

function TransactionKindIcon({ kind }) {
  const key = String(kind || "expense").trim().toLowerCase();
  if (key === "income") return <ArrowUpRight size={16} />;
  if (key === "transfer") return <Repeat2 size={16} />;
  return <ArrowDownLeft size={16} />;
}

function buildTransactionTitle(transaction) {
  const merchant = String(transaction?.merchant || "").trim();
  const note = String(transaction?.note || "").trim();
  if (merchant) return merchant;
  if (note) return note;
  return String(transaction?.kind || "").trim().toLowerCase() === "transfer" ? "โอนเงิน" : `รายการ${getTransactionKindLabel(transaction?.kind)}`;
}

function buildTransactionMeta(transaction, accountMap, categoryMap) {
  const date = String(transaction?.date || "").slice(0, 10);
  const kind = String(transaction?.kind || "").trim().toLowerCase();

  if (kind === "transfer") {
    const fromName = accountMap.get(toId(transaction?.from_account_id))?.name || "ไม่พบบัญชีต้นทาง";
    const toName = accountMap.get(toId(transaction?.to_account_id))?.name || "ไม่พบบัญชีปลายทาง";
    return [date, `${fromName} → ${toName}`].filter(Boolean).join(" • ");
  }

  const accountName = accountMap.get(toId(transaction?.account_id))?.name || "";
  const categoryName = categoryMap.get(toId(transaction?.category_id))?.name || "";
  return [date, accountName, categoryName].filter(Boolean).join(" • ");
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
    date: source?.date ? String(source.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
  };
}

function openAccountDetails(accountId) {
  const targetId = String(accountId || "").trim();
  if (!targetId || typeof window === "undefined") {
    navigateTo("#accounts");
    return;
  }
  window.sessionStorage.setItem(ACCOUNT_DEEPLINK_KEY, targetId);
  navigateTo("#accounts");
}

function getAccountMeta(account) {
  const presetLabel = getPresetLabel(resolvePresetForAccount(account), account.type);
  if (presetLabel && String(presetLabel).trim() !== String(account?.name || "").trim()) {
    return presetLabel;
  }
  return "";
}

export default function DashboardScreen() {
  const {
    dashboardSnapshot,
    cashflowSeries,
    loading,
    saving,
    plannerSummary,
    selectedMonth,
    setSelectedMonth,
    accounts,
    categories,
    recentTransactions,
    updateTransaction,
    deleteTransaction,
  } = useExpenseApp();

  const snapshot = dashboardSnapshot || {};
  const progress = percentOf(snapshot.expense_satang, snapshot.monthly_target_satang);
  const pendingReviewCount = Number(snapshot.pending_review_count || 0);
  const unmatchedCount = Number(snapshot.unmatched_count || 0);
  const topCategories = Array.isArray(snapshot.top_categories) ? snapshot.top_categories : [];
  const snapshotAccounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
  const allAccounts = useMemo(() => (Array.isArray(accounts) ? accounts : []), [accounts]);
  const allCategories = useMemo(
    () => [...(Array.isArray(categories?.expense) ? categories.expense : []), ...(Array.isArray(categories?.income) ? categories.income : [])],
    [categories],
  );
  const accountMap = useMemo(
    () => new Map(allAccounts.map((account) => [toId(account?.id), account])),
    [allAccounts],
  );
  const categoryMap = useMemo(
    () => new Map(allCategories.map((category) => [toId(category?.id), category])),
    [allCategories],
  );
  const history = Array.isArray(recentTransactions) ? recentTransactions.slice(0, 12) : [];
  const hasAccounts = snapshotAccounts.length > 0;
  const hasCategories = topCategories.length > 0;
  const rawCashflow = Array.isArray(cashflowSeries) ? cashflowSeries : [];
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editDraft, setEditDraft] = useState(createTransactionEditDraft());
  const [editAmountInput, setEditAmountInput] = useState("");
  const [editShowMore, setEditShowMore] = useState(false);
  const hasCashflow = rawCashflow.some(
    (row) => hasValue(row?.income_satang) || hasValue(row?.expense_satang),
  );
  const chartPoints = hasCashflow ? rawCashflow : [];
  const chartMax = hasCashflow
    ? Math.max(
        ...chartPoints.flatMap((row) => [Number(row?.income_satang || 0), Number(row?.expense_satang || 0)]),
        1,
      )
    : 1;
  const hasActivity =
    hasCashflow ||
    hasCategories ||
    hasValue(snapshot.expense_satang) ||
    hasValue(snapshot.income_satang) ||
    hasValue(snapshot.net_satang) ||
    pendingReviewCount > 0 ||
    unmatchedCount > 0;
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
      ? Boolean(editDraft.fromAccountId && editDraft.toAccountId && editDraft.fromAccountId !== editDraft.toAccountId)
      : Boolean(editDraft.accountId));

  const buildChartPath = (key) =>
    chartPoints
      .map((point, index) => {
        const x = (index / Math.max(chartPoints.length - 1, 1)) * (320 - 8) + 4;
        const y = 160 - (Number(point?.[key] || 0) / chartMax) * (160 - 24) - 8;
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");

  const openTransactionEditor = (transaction) => {
    if (!transaction || transaction?.is_split_parent || transaction?.is_split_child) return;
    const nextDraft = createTransactionEditDraft(transaction);
    setEditingTransaction(transaction);
    setEditDraft(nextDraft);
    setEditAmountInput(toMoneyInput(nextDraft.amountSatang));
    setEditShowMore(false);
  };

  const closeTransactionEditor = () => {
    setEditingTransaction(null);
    setEditDraft(createTransactionEditDraft());
    setEditAmountInput("");
    setEditShowMore(false);
  };

  const submitEdit = async () => {
    if (!editingTransaction) return;
    const saved = await updateTransaction(editingTransaction, {
      ...editDraft,
      amountSatang: parseMoneyToSatang(editAmountInput || "0"),
    });
    if (saved) closeTransactionEditor();
  };

  const confirmDelete = (transaction) => {
    if (!transaction) return;
    setDeleteTarget(transaction);
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    const deleted = await deleteTransaction(deleteTarget);
    if (!deleted) return;
    if (editingTransaction && String(editingTransaction?.id || "") === String(deleteTarget?.id || "")) {
      closeTransactionEditor();
    }
    setDeleteTarget(null);
  };

  return (
    <ScreenShell title="ภาพรวม">
      <article className="ui-card finance-panel finance-month-card">
        <div className="finance-month-card-copy">
          <div className="finance-panel-title">เดือนที่กำลังดู</div>
          <div className="finance-panel-copy">เลือกเดือนที่ต้องการสรุปและติดตามแผน</div>
        </div>
        <label className="finance-month-picker finance-month-picker-card">
          <input
            className="ui-input"
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
          />
        </label>
      </article>

      <article className="ui-card finance-panel finance-dashboard-hero">
        <div className="finance-dashboard-hero-head">
          <div>
            <div className="finance-panel-title">ใช้ไป</div>
            <div className="finance-dashboard-total">{formatCurrency(snapshot.expense_satang || 0)}</div>
          </div>
          {loading ? <StatusPill tone="default">อัปเดต</StatusPill> : null}
        </div>

        <div className="finance-dashboard-mini-grid">
          <div className="finance-dashboard-mini-card">
            <span>รายรับ</span>
            <strong>{formatCurrency(snapshot.income_satang || 0)}</strong>
          </div>
          <div className="finance-dashboard-mini-card">
            <span>สุทธิ</span>
            <strong>{formatCurrency(snapshot.net_satang || 0)}</strong>
          </div>
        </div>

        <div className="finance-dashboard-goal">
          <div className="finance-dashboard-goal-copy">
            <span>เป้าหมาย</span>
            <strong>{formatCurrency(snapshot.monthly_target_satang || 0)}</strong>
          </div>
          <div className={`dashboard-progress finance-progress-bar ${progress >= 85 ? "dashboard-progress--alert" : ""}`}>
            <span style={{ width: `${progress || 0}%` }} />
          </div>
          {(pendingReviewCount || unmatchedCount) ? (
            <div className="finance-chip-grid">
              {pendingReviewCount ? <StatusPill tone="warning">รอตรวจ {pendingReviewCount}</StatusPill> : null}
              {unmatchedCount ? <StatusPill tone="warning">ยังไม่จับคู่ {unmatchedCount}</StatusPill> : null}
            </div>
          ) : null}
        </div>
      </article>

      <section className="finance-grid finance-dashboard-planner-grid">
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

      <article className="ui-card finance-panel finance-dashboard-next">
        <div className="finance-panel-head">
          <div className="finance-panel-title">{hasAccounts ? (hasActivity ? "ทางลัด" : "เริ่มบันทึก") : "เริ่มต้น"}</div>
        </div>
        <div className="finance-dashboard-next-copy">
          {hasAccounts
            ? hasActivity
              ? "เพิ่มรายการวันนี้หรือเปิด planner เพื่อดูแผนหนี้และเป้าหมาย"
              : "เริ่มบันทึกรายการแรกหรือวางเป้าหมายการเงินได้เลย"
            : "สร้างบัญชีก่อนเพื่อเริ่มวางแผนและติดตามการเงิน"}
        </div>
        <div className="finance-dashboard-actions">
          {hasAccounts ? (
            <>
              <button type="button" className="ui-btn ui-btn-primary" onClick={() => navigateTo("#add")}>
                <PlusCircle size={16} />
                เพิ่มรายการ
              </button>
              <button type="button" className="ui-btn ui-btn-secondary" onClick={() => navigateTo("#planner")}>
                <Target size={16} />
                เปิด Planner
              </button>
            </>
          ) : (
            <button type="button" className="ui-btn ui-btn-primary" onClick={() => navigateTo("#accounts")}>
              <CreditCard size={16} />
              สร้างบัญชี
            </button>
          )}
        </div>
      </article>

      {hasCashflow ? (
        <article className="ui-card finance-panel">
          <div className="finance-panel-head">
            <div className="finance-panel-title">กระแสเงิน</div>
          </div>
          <div className="finance-chart">
            <svg viewBox="0 0 320 160" className="finance-chart-svg" aria-hidden="true">
              <path d={buildChartPath("expense_satang")} className="finance-chart-line finance-chart-line-expense" />
              <path d={buildChartPath("income_satang")} className="finance-chart-line finance-chart-line-income" />
            </svg>
            <div className="finance-chart-legend">
              <span>
                <i className="finance-dot finance-dot-income" />
                รายรับ
              </span>
              <span>
                <i className="finance-dot finance-dot-expense" />
                รายจ่าย
              </span>
            </div>
          </div>
        </article>
      ) : null}

      {history.length ? (
        <article className="ui-card finance-panel" data-testid="dashboard-recent-history">
          <div className="finance-panel-head">
            <div>
              <div className="finance-panel-title">รายการล่าสุด</div>
              <div className="finance-panel-copy">แก้ไขหรือลบรายการที่บันทึกซ้ำได้จากหน้านี้ทันที</div>
            </div>
          </div>

          <div className="finance-list">
            {history.map((transaction) => {
              const kindKey = String(transaction?.kind || "expense").trim().toLowerCase();
              const isSplitParent = transaction?.is_split_parent === true;

              return (
                <div
                  key={transaction.id}
                  className="finance-row finance-history-row"
                  data-testid={`dashboard-transaction-${transaction.id}`}
                >
                  <div className="finance-row-main">
                    <span className={["finance-category-icon", "finance-history-icon", `finance-history-icon-${kindKey}`].join(" ")}>
                      <TransactionKindIcon kind={transaction.kind} />
                    </span>
                    <div className="finance-account-copy">
                      <div className="finance-row-title">{buildTransactionTitle(transaction)}</div>
                      <div className="finance-row-meta">{buildTransactionMeta(transaction, accountMap, categoryMap)}</div>
                      <div className="finance-chip-grid finance-history-chip-grid">
                        <StatusPill tone={kindKey === "income" ? "success" : kindKey === "transfer" ? "default" : "danger"}>
                          {getTransactionKindLabel(transaction.kind)}
                        </StatusPill>
                        {isSplitParent ? <StatusPill tone="warning">แยกหมวด</StatusPill> : null}
                      </div>
                    </div>
                  </div>

                  <div className="finance-row-side finance-history-side">
                    <AmountText value={transaction.amount_satang} tone={getTransactionAmountTone(transaction.kind)} />
                    <div className="finance-history-actions">
                      {!isSplitParent ? (
                        <button
                          type="button"
                          className="ui-btn ui-btn-secondary ui-btn-compact"
                          onClick={() => openTransactionEditor(transaction)}
                          data-testid={`dashboard-edit-transaction-${transaction.id}`}
                        >
                          <PencilLine size={15} />
                          แก้ไข
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="ui-btn ui-btn-danger-outline ui-btn-compact"
                        onClick={() => confirmDelete(transaction)}
                        data-testid={`dashboard-delete-transaction-${transaction.id}`}
                      >
                        <Trash2 size={15} />
                        ลบ
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      ) : null}

      {(hasCategories || hasAccounts) ? (
        <section className="finance-grid finance-grid-main">
          {hasCategories ? (
            <article className="ui-card finance-panel" data-testid="dashboard-top-categories">
              <div className="finance-panel-head">
                <div className="finance-panel-title">หมวด</div>
              </div>

              <div className="finance-list">
                {topCategories.map((category) => (
                  <div key={category.id} className="finance-row" data-testid={`dashboard-category-${category.id}`}>
                    <div className="finance-row-main">
                      <span
                        className="finance-category-icon"
                        style={{ backgroundColor: `${category.color}18`, color: category.color }}
                      >
                        {category.icon || "•"}
                      </span>
                      <div className="finance-row-title">{category.name}</div>
                    </div>
                    <AmountText value={category.total_satang} />
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          {hasAccounts ? (
            <article className="ui-card finance-panel">
              <div className="finance-panel-head">
                <div className="finance-panel-title">บัญชี</div>
              </div>

              <div className="finance-list">
                {snapshotAccounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    className="finance-list-button finance-account-button finance-dashboard-account-button"
                    onClick={() => openAccountDetails(account.id)}
                    data-testid={`dashboard-account-${account.id}`}
                  >
                    <div className="finance-row">
                      <div className="finance-row-main">
                        <span className="finance-category-icon finance-account-icon">{account.icon || "•"}</span>
                        <div>
                          <div className="finance-row-title">{account.name}</div>
                          {getAccountMeta(account) ? <div className="finance-row-meta">{getAccountMeta(account)}</div> : null}
                        </div>
                      </div>
                      <div className="finance-balance">
                        {account.type === "credit" || account.type === "loan" ? (
                          <span className="finance-account-liability-label">ยอดหนี้</span>
                        ) : null}
                        <AmountText
                          value={account.balance_satang}
                          tone={
                            Number(account.balance_satang || 0) < 0 || account.type === "credit" || account.type === "loan"
                              ? "danger"
                              : "default"
                          }
                        />
                        <ArrowUpRight size={14} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </article>
          ) : null}
        </section>
      ) : null}

      <Sheet
        open={Boolean(editingTransaction)}
        onClose={closeTransactionEditor}
        title="แก้ไขรายการ"
        subtitle={editingTransaction ? buildTransactionTitle(editingTransaction) : "ปรับรายละเอียดรายการล่าสุด"}
        footer={
          editingTransaction ? (
            <div className="finance-sheet-actions-compact">
              <button
                type="button"
                className="ui-btn ui-btn-danger-outline ui-btn-compact finance-sheet-danger-trigger"
                disabled={saving}
                onClick={() => confirmDelete(editingTransaction)}
              >
                <Trash2 size={16} />
                ลบรายการ
              </button>
              <div className="finance-sheet-actions-end">
                <button type="button" className="ui-btn ui-btn-secondary" onClick={closeTransactionEditor}>
                  ยกเลิก
                </button>
                <button type="button" className="ui-btn ui-btn-primary" disabled={saving || !canSaveEdit} onClick={submitEdit}>
                  บันทึก
                </button>
              </div>
            </div>
          ) : null
        }
      >
        <div className="finance-form">
          <section className="finance-form-section">
            <div className="finance-grid finance-grid-2">
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
            </div>

            {editDraft.kind === "transfer" ? (
              <div className="finance-grid finance-grid-2">
                <label className="finance-field">
                  <span className="ui-label">จากบัญชี</span>
                  <AccountSheetPicker
                    accounts={allAccounts}
                    value={editDraft.fromAccountId}
                    onChange={(fromAccountId) =>
                      setEditDraft((current) => ({
                        ...current,
                        fromAccountId,
                        toAccountId: String(current.toAccountId || "") === String(fromAccountId || "") ? "" : current.toAccountId,
                      }))
                    }
                    title="เลือกบัญชีต้นทาง"
                    placeholder="เลือกบัญชีต้นทาง"
                  />
                </label>

                <label className="finance-field">
                  <span className="ui-label">ไปบัญชี</span>
                  <AccountSheetPicker
                    accounts={allAccounts}
                    value={editDraft.toAccountId}
                    onChange={(toAccountId) =>
                      setEditDraft((current) => ({
                        ...current,
                        toAccountId: String(toAccountId || "") === String(current.fromAccountId || "") ? "" : toAccountId,
                      }))
                    }
                    title="เลือกบัญชีปลายทาง"
                    placeholder="เลือกบัญชีปลายทาง"
                  />
                </label>
              </div>
            ) : (
              <div className="finance-grid finance-grid-2">
                <label className="finance-field">
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
                </label>

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
                      onChange={(event) => setEditDraft((current) => ({ ...current, reference: event.target.value }))}
                    />
                  </label>

                  <label className="finance-field">
                    <span className="ui-label">วิธีจ่าย</span>
                    <input
                      className="ui-input"
                      value={editDraft.paymentMethod}
                      onChange={(event) => setEditDraft((current) => ({ ...current, paymentMethod: event.target.value }))}
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
      </Sheet>

      <Sheet
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="ยืนยันการลบรายการ"
        subtitle={deleteTarget ? buildTransactionTitle(deleteTarget) : "รายการนี้จะถูกลบออกจากประวัติ"}
        footer={
          <div className="finance-sheet-actions">
            <button type="button" className="ui-btn ui-btn-secondary" onClick={() => setDeleteTarget(null)}>
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
                {deleteTarget?.is_split_parent
                  ? "รายการหลักและรายการย่อยในชุดเดียวกันจะถูกลบออกจากประวัติทั้งหมด"
                  : "รายการนี้จะถูกนำออกจากประวัติและยอดสรุปของหน้า Overview จะอัปเดตทันที"}
              </div>
            </div>
            <div className="finance-account-danger-checklist">
              <div className="finance-account-danger-check">ยอดสรุปจะคำนวณใหม่หลังลบ</div>
              <div className="finance-account-danger-check">
                {deleteTarget?.is_split_parent ? "รายการย่อยในชุดเดียวกันจะถูกลบพร้อมกัน" : "การลบรายการนี้ไม่สามารถย้อนกลับจากหน้านี้ได้"}
              </div>
              <div className="finance-account-danger-check">หากยังไม่แน่ใจ แนะนำให้ใช้การแก้ไขแทนการลบ</div>
            </div>
          </section>
        </div>
      </Sheet>
    </ScreenShell>
  );
}
