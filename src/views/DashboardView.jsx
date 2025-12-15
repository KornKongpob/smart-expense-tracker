// src/views/DashboardView.jsx
import { useMemo, useState } from "react";
import { Filter, TrendingDown, TrendingUp, FileText } from "lucide-react";
import TransactionCard from "../components/TransactionCard";
import { formatCurrency } from "../utils/format";
import { calcTotals } from "../store/selectors";
import { useAppStore } from "../store/store";

export default function DashboardView() {
  const { state, navigate, startNew, startEdit } = useAppStore();
  const [filterAccount, setFilterAccount] = useState("all");

  const totals = useMemo(() => calcTotals(state.transactions), [state.transactions]);

  const filtered = useMemo(() => {
    let txs = state.transactions;
    if (filterAccount !== "all") txs = txs.filter((t) => t.accountId === filterAccount);
    return txs.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 12);
  }, [state.transactions, filterAccount]);

  const accountName = (id) => state.accounts.find((a) => a.id === id)?.name || "";
  const allCats = [...state.categories.expense, ...state.categories.income];

  return (
    <div className="pb-28 pt-6 px-4">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">ภาพรวมบัญชี</h1>
          <p className="text-gray-500 text-xs mt-1">Smart Expense Tracker</p>
        </div>

        <div className="relative">
          <select
            value={filterAccount}
            onChange={(e) => setFilterAccount(e.target.value)}
            className="appearance-none bg-white border border-gray-200 text-gray-600 py-2 pl-3 pr-8 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 shadow-sm"
          >
            <option value="all">ทุกบัญชี</option>
            {state.accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
          <Filter size={14} className="absolute right-2.5 top-2.5 text-gray-400 pointer-events-none" />
        </div>
      </header>

      <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-purple-800 rounded-3xl p-6 text-white shadow-xl shadow-indigo-200 mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-indigo-400/20 rounded-full blur-2xl -ml-6 -mb-6" />

        <p className="text-indigo-100 text-sm mb-1 font-medium relative z-10">ยอดสุทธิ (ไม่รวม Transfer)</p>
        <h2 className="text-4xl font-bold mb-6 relative z-10 tracking-tight">{formatCurrency(totals.net)}</h2>

        <div className="flex gap-4 relative z-10">
          <div className="flex-1 bg-white/10 rounded-xl p-3 backdrop-blur-md border border-white/10">
            <div className="flex items-center gap-1 text-green-300 text-xs mb-1 font-bold">
              <TrendingUp size={14} /> รายรับ
            </div>
            <p className="font-semibold text-lg">{formatCurrency(totals.income)}</p>
          </div>
          <div className="flex-1 bg-white/10 rounded-xl p-3 backdrop-blur-md border border-white/10">
            <div className="flex items-center gap-1 text-red-300 text-xs mb-1 font-bold">
              <TrendingDown size={14} /> รายจ่าย
            </div>
            <p className="font-semibold text-lg">{formatCurrency(totals.expense)}</p>
          </div>
        </div>
      </div>

      <div className="mb-4 flex justify-between items-end">
        <h3 className="font-bold text-lg text-gray-800">รายการล่าสุด</h3>
        <button
          onClick={() => navigate("stats")}
          className="text-xs text-indigo-600 font-bold bg-indigo-50 px-3 py-1 rounded-full"
          type="button"
        >
          ดูสรุป
        </button>
      </div>

      {filtered.length ? (
        <div className="space-y-3">
          {filtered.map((tx) => {
            const category = allCats.find((c) => c.id === tx.category) || { name: "ไม่ระบุ", icon: "❓", color: "#ccc" };
            return (
              <TransactionCard
                key={tx.id}
                tx={tx}
                category={category}
                accountName={accountName(tx.accountId)}
                onClick={() => startEdit(tx.id)}
              />
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-200">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-300">
            <FileText size={32} />
          </div>
          <p className="text-gray-400 font-medium">ยังไม่มีรายการบันทึก</p>
          <button onClick={startNew} className="mt-3 text-indigo-600 text-sm font-bold" type="button">
            เริ่มบันทึกรายการแรก
          </button>
        </div>
      )}
    </div>
  );
}
