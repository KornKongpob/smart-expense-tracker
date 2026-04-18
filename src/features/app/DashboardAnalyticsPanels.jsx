import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { EmptyPanel, MetricCard } from "./ui.jsx";
import { formatCurrency, formatDateShort } from "../../utils/format.js";

function clampPositiveInt(value, fallback = 0) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, number);
}

function buildChange(currentValue, previousValue) {
  const current = Number(currentValue || 0);
  const previous = Number(previousValue || 0);
  const delta = current - previous;
  if (!previous) {
    return {
      delta,
      pct: current ? 100 : 0,
    };
  }
  return {
    delta,
    pct: Math.round((delta / previous) * 100),
  };
}

function formatDeltaLabel(value) {
  const amount = Math.abs(Number(value || 0));
  if (!amount) return "0.00";
  return `${Number(value || 0) > 0 ? "+" : "-"}${formatCurrency(amount)}`;
}

function formatPctLabel(value) {
  const pct = Number(value || 0);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

function buildComparisonCards(snapshot, previousSnapshot) {
  const current = snapshot || {};
  const previous = previousSnapshot || {};

  const expenseChange = buildChange(current.expense_satang, previous.expense_satang);
  const incomeChange = buildChange(current.income_satang, previous.income_satang);
  const netChange = buildChange(current.net_satang, previous.net_satang);

  return [
    {
      id: "mom-expense",
      label: "เทียบเดือนก่อน · รายจ่าย",
      value: formatPctLabel(expenseChange.pct),
      hint: `${formatDeltaLabel(expenseChange.delta)} จาก ${formatCurrency(previous.expense_satang || 0)}`,
      tone: expenseChange.delta > 0 ? "danger" : "success",
    },
    {
      id: "mom-income",
      label: "เทียบเดือนก่อน · รายรับ",
      value: formatPctLabel(incomeChange.pct),
      hint: `${formatDeltaLabel(incomeChange.delta)} จาก ${formatCurrency(previous.income_satang || 0)}`,
      tone: incomeChange.delta >= 0 ? "success" : "danger",
    },
    {
      id: "mom-net",
      label: "เทียบเดือนก่อน · สุทธิ",
      value: formatPctLabel(netChange.pct),
      hint: `${formatDeltaLabel(netChange.delta)} จาก ${formatCurrency(previous.net_satang || 0)}`,
      tone: netChange.delta >= 0 ? "success" : "danger",
    },
  ];
}

function ChartTooltip({ active, payload }) {
  if (!active || !Array.isArray(payload) || !payload.length) return null;
  const row = payload[0]?.payload || null;
  if (!row) return null;

  return (
    <div className="finance-chart-tooltip">
      <div className="finance-row-title">{row.name}</div>
      <div className="finance-row-meta">{formatCurrency(row.value || 0)}</div>
    </div>
  );
}

function buildHeatmapCells(series) {
  const rows = Array.isArray(series) ? series : [];
  const expenseMax = Math.max(
    1,
    ...rows.map((row) => clampPositiveInt(row?.expense_satang)),
  );

  return rows.map((row) => {
    const expense = clampPositiveInt(row?.expense_satang);
    const income = clampPositiveInt(row?.income_satang);
    const ratio = Math.max(0, Math.min(1, expense / expenseMax));
    const bucket = String(row?.bucket || "").slice(0, 10);
    return {
      key: bucket || `bucket-${Math.random()}`,
      label: bucket ? formatDateShort(bucket) : "-",
      income,
      expense,
      opacity: 0.14 + ratio * 0.86,
    };
  });
}

export default function DashboardAnalyticsPanels({ snapshot, previousSnapshot, cashflowSeries }) {
  const comparisonCards = useMemo(
    () => buildComparisonCards(snapshot, previousSnapshot),
    [previousSnapshot, snapshot],
  );
  const categoryData = useMemo(
    () =>
      (Array.isArray(snapshot?.top_categories) ? snapshot.top_categories : []).map((category) => ({
        id: category.id,
        name: category.name,
        value: clampPositiveInt(category.total_satang),
        color: category.color || "#0f766e",
      })),
    [snapshot?.top_categories],
  );
  const heatmapCells = useMemo(() => buildHeatmapCells(cashflowSeries), [cashflowSeries]);

  return (
    <>
      <section className="finance-grid finance-dashboard-analytics-grid">
        {comparisonCards.map((card) => (
          <MetricCard key={card.id} label={card.label} value={card.value} hint={card.hint} tone={card.tone} />
        ))}
      </section>

      <section className="finance-grid finance-dashboard-analytics-grid">
        <article className="ui-card finance-panel">
          <div className="finance-panel-head">
            <div>
              <div className="finance-panel-title">Category breakdown</div>
              <div className="finance-panel-copy">หมวดที่ใช้จ่ายมากสุดของเดือนนี้</div>
            </div>
          </div>

          {categoryData.length ? (
            <div className="finance-dashboard-donut">
              <div className="finance-dashboard-donut-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={46} outerRadius={74} strokeWidth={0}>
                      {categoryData.map((entry) => (
                        <Cell key={entry.id} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="finance-dashboard-breakdown-list">
                {categoryData.map((entry) => (
                  <div key={entry.id} className="finance-dashboard-breakdown-row">
                    <div className="finance-dashboard-breakdown-copy">
                      <span className="finance-dot" style={{ backgroundColor: entry.color }} />
                      <span>{entry.name}</span>
                    </div>
                    <strong>{formatCurrency(entry.value)}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyPanel title="ยังไม่มี breakdown" copy="เริ่มบันทึกรายจ่ายก่อน แล้วหมวดหลักจะมาแสดงที่นี่" />
          )}
        </article>

        <article className="ui-card finance-panel">
          <div className="finance-panel-head">
            <div>
              <div className="finance-panel-title">Spend heatmap</div>
              <div className="finance-panel-copy">วันที่สีเข้มกว่าคือวันที่ใช้จ่ายมากกว่า</div>
            </div>
          </div>

          {heatmapCells.length ? (
            <div className="finance-dashboard-heatmap">
              <div className="finance-dashboard-heatmap-grid">
                {heatmapCells.map((cell) => (
                  <div key={cell.key} className="finance-dashboard-heatmap-cell-wrap">
                    <div
                      className="finance-dashboard-heatmap-cell"
                      title={`${cell.label} · ใช้ ${formatCurrency(cell.expense)} · รับ ${formatCurrency(cell.income)}`}
                      style={{ opacity: cell.opacity }}
                    />
                    <span className="finance-dashboard-heatmap-label">{cell.label.slice(0, 5)}</span>
                  </div>
                ))}
              </div>
              <div className="finance-dashboard-heatmap-legend">
                <span>น้อย</span>
                <div className="finance-dashboard-heatmap-scale" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <span>มาก</span>
              </div>
            </div>
          ) : (
            <EmptyPanel title="ยังไม่มี heatmap" copy="เมื่อมีข้อมูลรายวันของเดือนนี้ ระบบจะแสดง pattern การใช้จ่ายให้ที่นี่" />
          )}
        </article>
      </section>
    </>
  );
}
