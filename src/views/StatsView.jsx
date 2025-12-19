// src/views/StatsView.jsx
import { useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { formatCurrency, formatDateShort } from "../utils/format";
import { useAppStore } from "../store/store";

const isTransferTx = (t) => t?.type === "transfer" || t?.isTransfer === true;

export default function StatsView() {
  const { state } = useAppStore();
  const [period, setPeriod] = useState("month"); // week | month | year

  const filtered = useMemo(() => {
    const now = new Date();
    return state.transactions.filter((t) => {
      if (isTransferTx(t)) return false;
      const d = new Date(t.date);
      if (period === "week") return d >= new Date(now.getTime() - 7 * 86400000);
      if (period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (period === "year") return d.getFullYear() === now.getFullYear();
      return true;
    });
  }, [state.transactions, period]);

  const expenses = filtered.filter((t) => t.type === "expense");
  const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);

  const pieData = useMemo(() => {
    const map = new Map();
    for (const t of expenses) map.set(t.category, (map.get(t.category) || 0) + t.amount);
    return [...map.entries()]
      .map(([catId, value]) => {
        const cat = state.categories.expense.find((c) => c.id === catId) || { name: "Unknown", color: "#ccc" };
        return { name: cat.name, value, color: cat.color };
      })
      .sort((a, b) => b.value - a.value);
  }, [expenses, state.categories.expense]);

  const trend = useMemo(() => {
    const map = new Map();
    for (const t of filtered) {
      const key = formatDateShort(t.date);
      const prev = map.get(key) || { date: key, income: 0, expense: 0 };
      if (t.type === "income") prev.income += t.amount;
      else prev.expense += t.amount;
      map.set(key, prev);
    }
    return [...map.values()].slice(-10);
  }, [filtered]);

  return (
    <div className="pb-28 pt-6 px-4">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">สรุปผลการเงิน</h1>

      <div className="flex bg-gray-100 p-1 rounded-lg mb-6">
        {["week", "month", "year"].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${period === p ? "bg-white shadow text-indigo-600" : "text-gray-500"}`}
            type="button"
          >
            {p === "week" ? "7 วัน" : p === "month" ? "เดือนนี้" : "ปีนี้"}
          </button>
        ))}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 text-center mb-6">
        <p className="text-gray-500 text-sm mb-1">รายจ่ายรวม</p>
        <h2 className="text-3xl font-bold text-red-500">{formatCurrency(totalExpense)}</h2>
      </div>

      {expenses.length ? (
        <>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
            <h3 className="font-bold text-gray-800 mb-4">สัดส่วนค่าใช้จ่าย</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
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

          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-4">แนวโน้มรายรับ-จ่าย</h3>
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
        <div className="text-center py-12 text-gray-400">
          <Activity size={48} className="mx-auto mb-3 opacity-20" />
          <p>ไม่มีข้อมูลรายจ่ายในช่วงเวลานี้</p>
        </div>
      )}
    </div>
  );
}
