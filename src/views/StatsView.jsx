// src/views/StatsView.jsx
import { useMemo, useState } from "react";
import { Activity } from "lucide-react";
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

import { formatCurrency, formatDateShort, toISODateSafe } from "../utils/format";
import { useAppStore } from "../store/store";
import { parseDateSafe } from "../store/selectors";

export default function StatsView() {
  const { state } = useAppStore();
  const [period, setPeriod] = useState("month"); // week | month | year

  const filtered = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now.getTime() - 7 * 86400000);

    return (state.transactions || []).filter((t) => {
      if (t.isTransfer) return false;

      const d = parseDateSafe(t.date);

      if (period === "week") return d >= weekStart;
      if (period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (period === "year") return d.getFullYear() === now.getFullYear();
      return true;
    });
  }, [state.transactions, period]);

  const expenses = useMemo(() => filtered.filter((t) => t.type === "expense"), [filtered]);
  const totalExpense = useMemo(() => expenses.reduce((s, t) => s + (Number(t.amount) || 0), 0), [expenses]);

  const expenseCats = state.categories?.expense || [];

  const pieData = useMemo(() => {
    const map = new Map();
    for (const t of expenses) map.set(t.category, (map.get(t.category) || 0) + (Number(t.amount) || 0));

    return [...map.entries()]
      .map(([catId, value]) => {
        const cat = expenseCats.find((c) => c.id === catId) || { name: "Unknown", color: "#ccc" };
        return { name: cat.name, value, color: cat.color };
      })
      .sort((a, b) => b.value - a.value);
  }, [expenses, expenseCats]);

  const trend = useMemo(() => {
    // key by ISO (YYYY-MM-DD) for correct sorting
    const map = new Map();

    for (const t of filtered) {
      const iso = toISODateSafe(t.date); // ✅ use utils/format (local-safe)
      const prev = map.get(iso) || { iso, date: formatDateShort(iso), income: 0, expense: 0 };

      if (t.type === "income") prev.income += Number(t.amount) || 0;
      else prev.expense += Number(t.amount) || 0;

      map.set(iso, prev);
    }

    // sort by iso ascending; take last 10 points
    return [...map.values()]
      .sort((a, b) => String(a.iso).localeCompare(String(b.iso)))
      .slice(-10)
      .map(({ iso, ...rest }) => rest);
  }, [filtered]);

  return (
    <div className="pb-28 pt-6 px-4 min-h-dvh">
      <h1 className="text-2xl font-extrabold text-gray-900 mb-6">สรุปผลการเงิน</h1>

      {/* Segmented control (glass) */}
      <div className="glass-panel p-1 rounded-xl mb-6 flex">
        {["week", "month", "year"].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-2 text-xs font-extrabold rounded-lg transition-all ${
              period === p ? "bg-gray-900/90 text-white shadow-sm" : "text-gray-700 hover:bg-white/10"
            }`}
            type="button"
          >
            {p === "week" ? "7 วัน" : p === "month" ? "เดือนนี้" : "ปีนี้"}
          </button>
        ))}
      </div>

      <div className="glass-card p-6 rounded-2xl text-center mb-6">
        <p className="text-gray-700 text-sm mb-1">รายจ่ายรวม</p>
        <h2 className="text-3xl font-extrabold text-red-600">{formatCurrency(totalExpense)}</h2>
      </div>

      {expenses.length ? (
        <>
          <div className="glass-card p-4 rounded-2xl mb-6">
            <h3 className="font-extrabold text-gray-900 mb-4">สัดส่วนค่าใช้จ่าย</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value">
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatCurrency(v)} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-card p-4 rounded-2xl">
            <h3 className="font-extrabold text-gray-900 mb-4">แนวโน้มรายรับ-จ่าย</h3>
            <div className="h-64 w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" />
                  <YAxis hide />
                  <Tooltip formatter={(v) => formatCurrency(v)} />
                  <Bar dataKey="income" name="รายรับ" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="รายจ่าย" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : (
        <div className="glass-card rounded-3xl text-center py-12">
          <Activity size={48} className="mx-auto mb-3 opacity-25 text-gray-600" />
          <p className="font-extrabold text-gray-800">ไม่มีข้อมูลรายจ่ายในช่วงเวลานี้</p>
        </div>
      )}
    </div>
  );
}
