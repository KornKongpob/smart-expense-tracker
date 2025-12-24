// src/views/DashboardView.jsx
import { useMemo, useState } from "react";
import { Filter, TrendingDown, TrendingUp, FileText, Search, AlertTriangle } from "lucide-react";
import TransactionCard from "../components/TransactionCard";
import { formatCurrency } from "../utils/format";
import { calcTotals, toMonthKey, calcSpentByCategoryInMonth, parseDateSafe } from "../store/selectors";
import { useAppStore } from "../store/store";

function getTxOrderKey(tx) {
  // Prefer "recently added/updated" if your store tracks it.
  const created = Number(tx?.createdAt);
  const updated = Number(tx?.updatedAt);

  if (Number.isFinite(updated) && updated > 0) return updated;
  if (Number.isFinite(created) && created > 0) return created;

  // Fallback: transaction date
  const t = parseDateSafe(tx?.date).getTime();
  return Number.isFinite(t) ? t : 0;
}

export default function DashboardView() {
  const { state, navigate, startEditTransaction, startNewTransaction } = useAppStore();

  const [filterAccount, setFilterAccount] = useState("all");
  const [q, setQ] = useState("");

  const totals = useMemo(() => calcTotals(state.transactions || []), [state.transactions]);
  const allCats = [...(state.categories?.expense || []), ...(state.categories?.income || [])];

  const accountName = (id) => state.accounts.find((a) => a.id === id)?.name || "";

  const filtered = useMemo(() => {
    let txs = state.transactions || [];

    if (filterAccount !== "all") txs = txs.filter((t) => t.accountId === filterAccount);

    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      txs = txs.filter((t) => {
        const cat = allCats.find((c) => c.id === t.category);
        const hay = `${t.note || ""} ${cat?.name || ""} ${accountName(t.accountId)} ${t.ref || ""}`.toLowerCase();
        return hay.includes(needle);
      });
    }

    return txs
      .slice()
      .sort((a, b) => {
        const kb = getTxOrderKey(b);
        const ka = getTxOrderKey(a);
        if (kb !== ka) return kb - ka;

        // tie-break: date desc (if createdAt absent and same day)
        const db = parseDateSafe(b.date).getTime();
        const da = parseDateSafe(a.date).getTime();
        if (db !== da) return db - da;

        // final tie-break by id (stable-ish)
        return String(b.id || "").localeCompare(String(a.id || ""));
      })
      .slice(0, 40);
  }, [state.transactions, filterAccount, q, allCats]);

  // Budget alerts (current month)
  const budgetAlerts = useMemo(() => {
    const month = toMonthKey(new Date());
    const spentMap = calcSpentByCategoryInMonth(state.transactions || [], month);

    const alerts = [];
    for (const b of state.budgets || []) {
      if (b.month !== month) continue;
      if (!b.limit) continue;
      const spent = spentMap.get(b.categoryId) || 0;
      const pct = (spent / b.limit) * 100;
      if (pct >= (b.alertPct || 90)) {
        const cat = state.categories?.expense?.find((c) => c.id === b.categoryId);
        alerts.push({
          id: b.id,
          name: cat?.name || b.categoryId,
          spent,
          limit: b.limit,
          pct: Math.round(pct),
        });
      }
    }
    return alerts.sort((a, b) => b.pct - a.pct).slice(0, 3);
  }, [state.transactions, state.budgets, state.categories?.expense]);

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
            {state.accounts.map((acc) => (
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
            <div className="min-w-0">
              <div className="font-extrabold text-amber-900">Budget Alert</div>
              <div className="text-xs text-amber-900/80 mt-1 space-y-1">
                {budgetAlerts.map((a) => (
                  <div key={a.id} className="truncate">
                    {a.name}: ใช้แล้ว {formatCurrency(a.spent)} / {formatCurrency(a.limit)} ({a.pct}%)
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => navigate("budgets")}
                className="mt-2 text-xs font-extrabold text-amber-900 glass-chip px-3 py-1 rounded-full active:scale-95"
              >
                จัดการงบประมาณ
              </button>
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
            const category =
              tx.isTransfer
                ? { name: "Transfer", icon: "🔁", color: "#94a3b8" }
                : allCats.find((c) => c.id === tx.category) || { name: "ไม่ระบุ", icon: "❓", color: "#ccc" };

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
