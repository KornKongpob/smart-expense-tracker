import { ArrowUpRight, CreditCard, PlusCircle, Target } from "lucide-react";

import { useExpenseApp } from "../AppProvider.jsx";
import { AmountText, MetricCard, ScreenShell, StatusPill } from "../ui.jsx";
import { getPresetLabel, resolvePresetForAccount } from "../accountPresetUtils.js";
import { formatCurrency } from "../../../utils/format.js";

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
    plannerSummary,
    selectedMonth,
    setSelectedMonth,
  } = useExpenseApp();

  const snapshot = dashboardSnapshot || {};
  const progress = percentOf(snapshot.expense_satang, snapshot.monthly_target_satang);
  const pendingReviewCount = Number(snapshot.pending_review_count || 0);
  const unmatchedCount = Number(snapshot.unmatched_count || 0);
  const topCategories = Array.isArray(snapshot.top_categories) ? snapshot.top_categories : [];
  const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
  const hasAccounts = accounts.length > 0;
  const hasCategories = topCategories.length > 0;
  const rawCashflow = Array.isArray(cashflowSeries) ? cashflowSeries : [];
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

  const buildChartPath = (key) =>
    chartPoints
      .map((point, index) => {
        const x = (index / Math.max(chartPoints.length - 1, 1)) * (320 - 8) + 4;
        const y = 160 - (Number(point?.[key] || 0) / chartMax) * (160 - 24) - 8;
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");

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
                {accounts.map((account) => (
                  <div key={account.id} className="finance-row">
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
                ))}
              </div>
            </article>
          ) : null}
        </section>
      ) : null}
    </ScreenShell>
  );
}
