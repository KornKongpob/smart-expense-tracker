import { AlertTriangle, ArrowUpRight, Wallet } from "lucide-react";

import { useExpenseApp } from "../AppProvider.jsx";
import { AmountText, EmptyPanel, MetricCard, MiniCashflowChart, ScreenShell, StatusPill } from "../ui.jsx";
import { formatCurrency } from "../../../utils/format.js";

function percentOf(value, total) {
  const numerator = Number(value || 0);
  const denominator = Number(total || 0);
  if (!denominator) return 0;
  return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
}

export default function DashboardScreen() {
  const {
    dashboardSnapshot,
    cashflowSeries,
    loading,
    selectedMonth,
    setSelectedMonth,
  } = useExpenseApp();

  const snapshot = dashboardSnapshot || {};
  const progress = percentOf(snapshot.expense_satang, snapshot.monthly_target_satang);

  return (
    <ScreenShell
      eyebrow="Dashboard"
      title="See the month at a glance."
      subtitle="Spend, target, inbox, and balances."
      actions={
        <label className="finance-month-picker">
          <span className="ui-label">Month</span>
          <input
            className="ui-input"
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
          />
        </label>
      }
    >
      <section className="dashboard-hero">
        <div className="dashboard-hero-grid">
          <div>
            <div className="dashboard-kicker">Month in motion</div>
            <h2 className="dashboard-hero-heading">{formatCurrency(snapshot.expense_satang || 0)} spent so far.</h2>
            <p className="dashboard-hero-copy">Income {formatCurrency(snapshot.income_satang || 0)}. Net {formatCurrency(snapshot.net_satang || 0)}.</p>

            <div className="dashboard-hero-badges">
              <span className="dashboard-hero-badge">
                <AlertTriangle size={14} />
                {Number(snapshot.pending_review_count || 0)} waiting in Inbox
              </span>
              <span className="dashboard-hero-badge">
                <Wallet size={14} />
                {Number(snapshot.unmatched_count || 0)} need account or category attention
              </span>
            </div>
          </div>

          <div className="dashboard-stat-grid">
            <div className="dashboard-stat">
              <div className="dashboard-stat-label">Monthly target</div>
              <div className="dashboard-stat-value">{formatCurrency(snapshot.monthly_target_satang || 0)}</div>
              <div className="dashboard-stat-hint">
                {snapshot.monthly_target_satang
                  ? `${progress}% used`
                  : "Set a target in Settings"}
              </div>
              <div className={`dashboard-progress ${progress >= 85 ? "dashboard-progress--alert" : ""}`}>
                <span style={{ width: `${progress || 0}%` }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="finance-grid finance-grid-3">
        <MetricCard
          label="Pending review"
          value={String(snapshot.pending_review_count || 0)}
          hint="Waiting in Inbox."
          tone="warning"
        />
        <MetricCard
          label="Income"
          value={formatCurrency(snapshot.income_satang || 0)}
          hint="This month."
          tone="success"
        />
        <MetricCard
          label="Net"
          value={formatCurrency(snapshot.net_satang || 0)}
          hint="Income minus expense."
          tone={Number(snapshot.net_satang || 0) < 0 ? "danger" : "default"}
        />
      </section>

      <section className="finance-grid finance-grid-main">
        <article className="ui-card finance-panel">
          <div className="finance-panel-head">
            <div>
              <div className="finance-panel-title">Cashflow trend</div>
              <p className="finance-panel-copy">Income vs expense.</p>
            </div>
            {loading ? <StatusPill tone="default">Refreshing</StatusPill> : null}
          </div>
          <MiniCashflowChart series={cashflowSeries} />
        </article>

        <article className="ui-card finance-panel">
          <div className="finance-panel-head">
            <div>
              <div className="finance-panel-title">Needs attention</div>
              <p className="finance-panel-copy">What to clear next.</p>
            </div>
          </div>
          <div className="finance-chip-grid">
            <StatusPill tone={Number(snapshot.pending_review_count || 0) ? "warning" : "success"}>
              {Number(snapshot.pending_review_count || 0)} scans in review
            </StatusPill>
            <StatusPill tone={Number(snapshot.unmatched_count || 0) ? "warning" : "success"}>
              {Number(snapshot.unmatched_count || 0)} unmatched hints
            </StatusPill>
            <StatusPill tone={progress >= 100 ? "danger" : progress >= 85 ? "warning" : "default"}>
              {progress}% of target used
            </StatusPill>
          </div>
        </article>
      </section>

      <section className="finance-grid finance-grid-main">
        <article className="ui-card finance-panel">
          <div className="finance-panel-head">
            <div>
              <div className="finance-panel-title">Top categories</div>
              <p className="finance-panel-copy">Where the month is going.</p>
            </div>
          </div>

          {Array.isArray(snapshot.top_categories) && snapshot.top_categories.length ? (
            <div className="finance-list">
              {snapshot.top_categories.map((category) => (
                <div key={category.id} className="finance-row">
                  <div className="finance-row-main">
                    <span className="finance-category-icon" style={{ backgroundColor: `${category.color}22`, color: category.color }}>
                      {category.icon || "•"}
                    </span>
                    <div>
                      <div className="finance-row-title">{category.name}</div>
                      <div className="finance-row-meta">{category.id}</div>
                    </div>
                  </div>
                  <AmountText value={category.total_satang} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyPanel
              title="No category movement yet"
              copy="Categories appear after your first posted transactions."
            />
          )}
        </article>

        <article className="ui-card finance-panel">
          <div className="finance-panel-head">
            <div>
              <div className="finance-panel-title">Account health</div>
              <p className="finance-panel-copy">Balances across your accounts.</p>
            </div>
          </div>

          {Array.isArray(snapshot.accounts) && snapshot.accounts.length ? (
            <div className="finance-list">
              {snapshot.accounts.map((account) => (
                <div key={account.id} className="finance-row">
                  <div className="finance-row-main">
                    <span className="finance-category-icon finance-account-icon">{account.icon || "•"}</span>
                    <div>
                      <div className="finance-row-title">{account.name}</div>
                      <div className="finance-row-meta">{account.type}</div>
                    </div>
                  </div>
                  <div className="finance-balance">
                    <AmountText value={account.balance_satang} tone={Number(account.balance_satang || 0) < 0 ? "danger" : "default"} />
                    <ArrowUpRight size={14} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyPanel
              title="No accounts yet"
              copy="Add an account to start tracking balances."
            />
          )}
        </article>
      </section>
    </ScreenShell>
  );
}
