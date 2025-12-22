// src/views/DashboardView.jsx
import { useMemo, useState } from "react";
import { Filter, TrendingDown, TrendingUp, FileText, Search, AlertTriangle, ChevronRight } from "lucide-react";
import TransactionCard from "../components/TransactionCard";
import { formatCurrency } from "../utils/format";
import { calcTotals, toMonthKey, calcSpentByCategoryInMonth, parseDateSafe } from "../store/selectors";
import { useAppStore } from "../store/store";

export default function DashboardView() {
  const { state, navigate, startEditTransaction, startNewTransaction } = useAppStore();

  const accounts = state.accounts || [];
  const expenseCats = state.categories?.expense || [];
  const incomeCats = state.categories?.income || [];

  // ✅ memo maps for fast lookup + stable deps
  const allCats = useMemo(() => [...expenseCats, ...incomeCats], [expenseCats, incomeCats]);

  const accountById = useMemo(() => {
    const m = new Map();
    for (const a of accounts) m.set(a.id, a);
    return m;
  }, [accounts]);

  const catById = useMemo(() => {
    const m = new Map();
    for (const c of allCats) m.set(c.id, c);
    return m;
  }, [allCats]);

  const accountName = (id) => accountById.get(id)?.name || "";

  // UI state
  const [filterAccount, setFilterAccount] = useState("all");
  const [q, setQ] = useState("");

  // ✅ Totals exclude transfers (as designed)
  const totals = useMemo(() => calcTotals(state.transactions || []), [state.transactions]);

  // ===== budget alerts (current month) =====
  const budgetAlerts = useMemo(() => {
    const month = toMonthKey(new Date());
    const spentMap = calcSpentByCategoryInMonth(state.transactions || [], month);

    const alerts = [];
    for (const b of state.budgets || []) {
      if (b.month !== month) continue;
      if (!b.limit) continue;

      const spent = spentMap.get(b.categoryId) || 0;
      const pctRaw = b.limit ? (spent / b.limit) * 100 : 0;
      const pct = Math.round(pctRaw);
      const ap = Number(b.alertPct || 90) || 90;

      if (pctRaw >= ap) {
        const cat = expenseCats.find((c) => c.id === b.categoryId);
        alerts.push({
          id: b.id,
          name: cat?.name || b.categoryId,
          icon: cat?.icon || "⚠️",
          color: cat?.color || "#f59e0b",
          spent,
          limit: b.limit,
          pct,
          alertPct: ap,
        });
      }
    }
    return alerts.sort((a, b) => b.pct - a.pct).slice(0, 3);
  }, [state.transactions, state.budgets, expenseCats]);

  // ===== filtered recent list =====
  const filtered = useMemo(() => {
    let txs = state.transactions || [];

    if (filterAccount !== "all") txs = txs.filter((t) => t?.accountId === filterAccount);

    const needle = q.trim().toLowerCase();
    if (needle) {
      txs = txs.filter((t) => {
        const cat = t?.isTransfer ? null : catById.get(t?.category);
        const hay = `${t?.note || ""} ${cat?.name || ""} ${accountName(t?.accountId)} ${t?.ref || ""}`.toLowerCase();
        return hay.includes(needle);
      });
    }

    return txs
      .slice()
      .sort((a, b) => parseDateSafe(b?.date).getTime() - parseDateSafe(a?.date).getTime())
      .slice(0, 60);
  }, [state.transactions, filterAccount, q, catById, accountById]);

  return (
    <div className="pb-28 pt-6 px-4">
      <header className="mb-4 flex justify-between items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-gray-900 truncate">ภาพรวมบัญชี</h1>
          <p className="text-gray-500 text-xs mt-1">Smart Expense Tracker</p>
        </div>

        <div className="relative shrink-0">
          <select
            value={filterAccount}
            onChange={(e) => setFilterAccount(e.target.value)}
            className="appearance-none glass-input text-gray-700 py-2 pl-3 pr-8 rounded-xl text-xs font-extrabold focus:outline-none focus:border-gray-900"
          >
            <option value="all">ทุกบัญชี</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
          <Filter size={14} className="absolute right-2.5 top-2.5 text-gray-500 pointer-events-none" />
        </div>
      </header>

      {/* Budget alerts */}
      {budgetAlerts.length ? (
        <div className="glass-card rounded-3xl p-4 mb-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl glass-chip text-amber-700 flex items-center justify-center shrink-0">
              <AlertTriangle size={20} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="font-extrabold text-amber-900">Budget Alert</div>
                <button
                  type="button"
                  onClick={() => navigate("budgets")}
                  className="text-[11px] font-extrabold text-amber-900 glass-chip px-3 py-1 rounded-full active:scale-95 inline-flex items-center gap-1"
                >
                  จัดการ <ChevronRight size={14} />
                </button>
              </div>

              <div className="mt-2 space-y-2">
                {budgetAlerts.map((a) => (
                  <div key={a.id} className="glass-panel border border-amber-500/15 rounded-2xl p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-amber-900 truncate">
                          <span className="mr-2">{a.icon}</span>
                          {a.name}
                        </div>
                        <div className="text-[12px] text-amber-900/80 mt-0.5 truncate">
                          ใช้แล้ว {formatCurrency(a.spent)} / {formatCurrency(a.limit)} ({a.pct}%)
                        </div>
                      </div>
                      <div className="text-[11px] font-extrabold text-amber-900/80 shrink-0">
                        เตือน {a.alertPct}%
                      </div>
                    </div>

                    <div className="mt-2 h-2 rounded-full bg-white/30 overflow-hidden">
                      <div
                        className="h-full"
                        style={{
                          width: `${Math.min(100, a.pct)}%`,
                          backgroundColor: "#f59e0b",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Search */}
      <div className="mb-6">
        <div className="glass-input rounded-2xl px-3 py-2 flex items-center gap-2">
          <Search size={16} className="text-gray-600" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาโน้ต / หมวด / บัญชี / Ref"
            className="w-full outline-none text-sm bg-transparent text-gray-800 placeholder:text-gray-500"
          />
        </div>
      </div>

      {/* Summary card */}
      <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-purple-800 rounded-3xl p-6 text-white shadow-xl shadow-indigo-200 mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-indigo-400/20 rounded-full blur-2xl -ml-6 -mb-6" />

        <p className="text-indigo-100 text-sm mb-1 font-medium relative z-10">ยอดสุทธิ (ไม่รวม Transfer)</p>
        <h2 className="text-4xl font-extrabold mb-6 relative z-10 tracking-tight">{formatCurrency(totals.net)}</h2>

        <div className="flex gap-4 relative z-10">
          <div className="flex-1 bg-white/10 rounded-xl p-3 backdrop-blur-md border border-white/10">
            <div className="flex items-center gap-1 text-green-300 text-xs mb-1 font-extrabold">
              <TrendingUp size={14} /> รายรับ
            </div>
            <p className="font-extrabold text-lg">{formatCurrency(totals.income)}</p>
          </div>
          <div className="flex-1 bg-white/10 rounded-xl p-3 backdrop-blur-md border border-white/10">
            <div className="flex items-center gap-1 text-red-300 text-xs mb-1 font-extrabold">
              <TrendingDown size={14} /> รายจ่าย
            </div>
            <p className="font-extrabold text-lg">{formatCurrency(totals.expense)}</p>
          </div>
        </div>
      </div>

      <div className="mb-4 flex justify-between items-end">
        <h3 className="font-extrabold text-lg text-gray-900">รายการล่าสุด</h3>
        <button
          onClick={() => navigate("stats")}
          className="text-xs text-indigo-700 font-extrabold glass-chip px-3 py-1 rounded-full active:scale-95"
          type="button"
        >
          ดูสรุป
        </button>
      </div>

      {filtered.length ? (
        <div className="space-y-3">
          {filtered.map((tx) => {
            const category = tx?.isTransfer
              ? { name: "Transfer", icon: "🔁", color: "#94a3b8" }
              : catById.get(tx?.category) || { name: "ไม่ระบุ", icon: "❓", color: "#ccc" };

            return (
              <TransactionCard
                key={tx.id}
                tx={tx}
                category={category}
                accountName={accountName(tx.accountId)}
                onClick={() => startEditTransaction(tx.id)}
              />
            );
          })}
        </div>
      ) : (
        <div className="glass-card rounded-3xl border border-dashed glass-divider text-center py-16">
          <div className="w-16 h-16 glass-chip rounded-full flex items-center justify-center mx-auto mb-3 text-gray-500">
            <FileText size={32} />
          </div>
          <p className="text-gray-700 font-extrabold">ยังไม่มีรายการบันทึก</p>
          <button onClick={startNewTransaction} className="mt-3 text-indigo-700 text-sm font-extrabold" type="button">
            เริ่มบันทึกรายการแรก
          </button>
        </div>
      )}
    </div>
  );
}
