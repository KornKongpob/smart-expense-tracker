// src/views/StatsView.jsx
import { useMemo, useState } from "react";
import { Activity, TrendingUp, TrendingDown, Sparkles, PieChart as PieIcon, BarChart3 } from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { formatCurrency, formatDateShort } from "../utils/format";
import { useAppStore } from "../store/store";
import { parseDateSafe, toISODateSafe } from "../store/selectors";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function safeNumber(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function getPeriodLabel(period) {
  if (period === "week") return "7 วันล่าสุด";
  if (period === "month") return "เดือนนี้";
  if (period === "year") return "ปีนี้";
  return "ทั้งหมด";
}

function getPeriodStart(period, now) {
  if (period === "week") return new Date(now.getTime() - 7 * 86400000);
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "year") return new Date(now.getFullYear(), 0, 1);
  return new Date(0);
}

function GlassKpiCard({ icon, title, value, sub, tone = "neutral" }) {
  const toneCls =
    tone === "income"
      ? "bg-emerald-600/15 border-emerald-600/20 text-emerald-800"
      : tone === "expense"
      ? "bg-rose-600/15 border-rose-600/20 text-rose-800"
      : tone === "net"
      ? "bg-indigo-600/15 border-indigo-600/20 text-indigo-800"
      : "bg-white/18 border-white/20 text-gray-800";

  return (
    <div className="glass-card rounded-3xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-extrabold text-gray-900/70">{title}</div>
          <div className="mt-1 text-2xl font-extrabold text-gray-900 truncate">{value}</div>
          {sub ? <div className="mt-1 text-[11px] text-gray-800/60">{sub}</div> : null}
        </div>
        <div className={`shrink-0 w-11 h-11 rounded-2xl border flex items-center justify-center ${toneCls}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="glass-card rounded-3xl text-center py-12">
      <Activity size={48} className="mx-auto mb-3 opacity-25 text-gray-600" />
      <p className="font-extrabold text-gray-800">ไม่มีข้อมูลในช่วงเวลานี้</p>
      <p className="text-sm text-gray-800/60 mt-1">ลองเปลี่ยนช่วงเวลา หรือเพิ่มรายการก่อน</p>
    </div>
  );
}

export default function StatsView() {
  const { state } = useAppStore();
  const [period, setPeriod] = useState("month"); // week | month | year

  const now = useMemo(() => new Date(), []);
  const periodLabel = useMemo(() => getPeriodLabel(period), [period]);
  const periodStart = useMemo(() => getPeriodStart(period, now), [period, now]);

  const filtered = useMemo(() => {
    return (state.transactions || []).filter((t) => {
      if (t.isTransfer) return false;
      const d = parseDateSafe(t.date);
      if (period === "week") return d >= periodStart;
      if (period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (period === "year") return d.getFullYear() === now.getFullYear();
      return true;
    });
  }, [state.transactions, period, periodStart, now]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;

    for (const t of filtered) {
      const amt = safeNumber(t.amount);
      if (t.type === "income") income += amt;
      else if (t.type === "expense") expense += amt;
    }

    const net = income - expense;

    // avg spend per day (use days in the period window, not just days with transactions)
    const start = periodStart;
    const end = now;
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
    const avgSpendPerDay = expense / days;

    return { income, expense, net, avgSpendPerDay, days };
  }, [filtered, periodStart, now]);

  const expenseCats = state.categories?.expense || [];

  const pieData = useMemo(() => {
    // aggregate expense categories
    const map = new Map();
    for (const t of filtered) {
      if (t.type !== "expense") continue;
      map.set(t.category, (map.get(t.category) || 0) + safeNumber(t.amount));
    }

    const items = [...map.entries()]
      .map(([catId, value]) => {
        const cat = expenseCats.find((c) => c.id === catId) || { name: "ไม่ทราบหมวด", color: "#cbd5e1" };
        return { id: catId, name: cat.name, value, color: cat.color || "#cbd5e1" };
      })
      .sort((a, b) => b.value - a.value);

    // keep top 6, rest -> Other
    const top = items.slice(0, 6);
    const rest = items.slice(6);
    const restSum = rest.reduce((s, x) => s + safeNumber(x.value), 0);

    if (restSum > 0) top.push({ id: "other_agg", name: "อื่นๆ", value: restSum, color: "#94a3b8" });

    return top;
  }, [filtered, expenseCats]);

  const totalExpense = useMemo(() => pieData.reduce((s, x) => s + safeNumber(x.value), 0), [pieData]);

  const topCategory = useMemo(() => {
    const top = pieData[0];
    if (!top) return null;
    const pct = totalExpense ? Math.round((top.value / totalExpense) * 100) : 0;
    return { ...top, pct };
  }, [pieData, totalExpense]);

  const trend = useMemo(() => {
    // key by ISO (YYYY-MM-DD) for correct sorting
    const map = new Map();

    for (const t of filtered) {
      const iso = toISODateSafe(t.date);
      const prev = map.get(iso) || { iso, date: formatDateShort(iso), income: 0, expense: 0, net: 0 };

      const amt = safeNumber(t.amount);
      if (t.type === "income") prev.income += amt;
      else if (t.type === "expense") prev.expense += amt;

      prev.net = prev.income - prev.expense;
      map.set(iso, prev);
    }

    // sort by iso ascending; take last 12 points (more readable)
    return [...map.values()]
      .sort((a, b) => String(a.iso).localeCompare(String(b.iso)))
      .slice(-12)
      .map(({ iso, ...rest }) => rest);
  }, [filtered]);

  const hasAny = filtered.length > 0;

  return (
    <div className="pb-28 pt-6 px-4 min-h-dvh">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold text-gray-900">สรุปผลการเงิน</h1>
            <p className="text-sm text-gray-800/60 mt-1">
              ช่วงเวลา: <span className="font-extrabold text-gray-900">{periodLabel}</span> • ไม่รวม Transfer
            </p>
          </div>

          <div className="shrink-0 w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600/20 via-purple-600/15 to-rose-600/15 border border-white/20 flex items-center justify-center">
            <Sparkles size={18} className="text-indigo-700" />
          </div>
        </div>
      </div>

      {/* Period segmented */}
      <div className="glass-panel p-1 rounded-2xl mb-5 flex">
        {[
          { id: "week", label: "7 วัน" },
          { id: "month", label: "เดือนนี้" },
          { id: "year", label: "ปีนี้" },
        ].map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`flex-1 py-2.5 text-xs font-extrabold rounded-xl transition-all ${
              period === p.id ? "bg-gray-900/90 text-white shadow-sm" : "text-gray-700 hover:bg-white/10"
            }`}
            type="button"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <GlassKpiCard
          tone="income"
          title="รายรับรวม"
          value={formatCurrency(totals.income)}
          sub={hasAny ? `ในช่วง ${periodLabel}` : ""}
          icon={<TrendingUp size={18} />}
        />
        <GlassKpiCard
          tone="expense"
          title="รายจ่ายรวม"
          value={formatCurrency(totals.expense)}
          sub={hasAny ? `เฉลี่ย/วัน ≈ ${formatCurrency(totals.avgSpendPerDay)}` : ""}
          icon={<TrendingDown size={18} />}
        />
        <GlassKpiCard
          tone="net"
          title="ยอดสุทธิ"
          value={formatCurrency(totals.net)}
          sub={hasAny ? (totals.net >= 0 ? "กำไรสุทธิ" : "ขาดดุลสุทธิ") : ""}
          icon={<Sparkles size={18} />}
        />
      </div>

      {!hasAny ? (
        <EmptyState />
      ) : (
        <>
          {/* Expenses Breakdown */}
          <div className="glass-card rounded-3xl p-5 mb-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="min-w-0">
                <div className="font-extrabold text-gray-900 flex items-center gap-2">
                  <span className="w-9 h-9 rounded-2xl glass-chip flex items-center justify-center text-gray-700">
                    <PieIcon size={18} />
                  </span>
                  สัดส่วนค่าใช้จ่าย
                </div>
                <div className="text-xs text-gray-800/60 mt-1">แสดง Top หมวด + รวม “อื่นๆ”</div>
              </div>

              {topCategory ? (
                <div className="text-right shrink-0">
                  <div className="text-[11px] text-gray-800/60">หมวดที่ใช้มากสุด</div>
                  <div className="text-sm font-extrabold text-gray-900 truncate">
                    {topCategory.name} • {topCategory.pct}%
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={92}
                      paddingAngle={6}
                      dataKey="value"
                      nameKey="name"
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={entry.id || i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(v)} />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Top list with progress bars */}
              <div className="space-y-3">
                {pieData.map((it) => {
                  const pct = totalExpense ? Math.round((it.value / totalExpense) * 100) : 0;
                  return (
                    <div key={it.id} className="glass-panel border border-white/20 rounded-2xl p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-extrabold text-gray-900 truncate">{it.name}</div>
                          <div className="text-[12px] text-gray-800/60 mt-0.5">
                            {formatCurrency(it.value)} • {pct}%
                          </div>
                        </div>
                        <div
                          className="w-10 h-10 rounded-2xl border border-white/20 shrink-0"
                          style={{ backgroundColor: `${it.color}22` }}
                          title={it.name}
                        />
                      </div>

                      <div className="mt-2 h-2 rounded-full bg-white/30 overflow-hidden">
                        <div
                          className="h-full"
                          style={{
                            width: `${clamp(pct, 0, 100)}%`,
                            backgroundColor: it.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Trend */}
          <div className="glass-card rounded-3xl p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <div className="font-extrabold text-gray-900 flex items-center gap-2">
                  <span className="w-9 h-9 rounded-2xl glass-chip flex items-center justify-center text-gray-700">
                    <BarChart3 size={18} />
                  </span>
                  แนวโน้มรายรับ-จ่าย
                </div>
                <div className="text-xs text-gray-800/60 mt-1">แสดง 12 จุดล่าสุดในช่วงเวลาที่เลือก</div>
              </div>

              <div className="text-right">
                <div className="text-[11px] text-gray-800/60">ช่วงเวลา</div>
                <div className="text-sm font-extrabold text-gray-900">{periodLabel}</div>
              </div>
            </div>

            <div className="h-72 w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickMargin={8} />
                  <YAxis hide />
                  <Tooltip formatter={(v, name) => [formatCurrency(v), name]} />
                  <Legend verticalAlign="bottom" height={32} />
                  <Bar dataKey="income" name="รายรับ" radius={[6, 6, 0, 0]} fill="#10b981" />
                  <Bar dataKey="expense" name="รายจ่าย" radius={[6, 6, 0, 0]} fill="#f43f5e" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Quick insights */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="glass-panel border border-white/20 rounded-2xl p-4">
                <div className="text-xs font-extrabold text-gray-900/70">เฉลี่ยรายจ่ายต่อวัน</div>
                <div className="mt-1 text-xl font-extrabold text-gray-900">{formatCurrency(totals.avgSpendPerDay)}</div>
                <div className="text-[11px] text-gray-800/55 mt-1">คำนวณจากจำนวนวันในช่วง {periodLabel}</div>
              </div>

              <div className="glass-panel border border-white/20 rounded-2xl p-4">
                <div className="text-xs font-extrabold text-gray-900/70">หมวดที่ใช้มากสุด</div>
                <div className="mt-1 text-xl font-extrabold text-gray-900">
                  {topCategory ? topCategory.name : "—"}
                </div>
                <div className="text-[11px] text-gray-800/55 mt-1">
                  {topCategory ? `${formatCurrency(topCategory.value)} • ${topCategory.pct}%` : "ไม่มีข้อมูล"}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
