import { useMemo, useState } from "react";
import { ChevronRight, Save } from "lucide-react";
import { useAppStore } from "../store/store";
import { formatCurrency } from "../utils/format";
import { calcSpentByCategoryInMonth, monthKeyOf } from "../store/selectors";

export default function BudgetsView({ showAlert }) {
  const { state, actions } = useAppStore();
  const monthKey = monthKeyOf(new Date());

  const expenseCats = state.categories.expense || [];
  const spentMap = useMemo(() => calcSpentByCategoryInMonth(state.transactions, new Date()), [state.transactions]);
  const budgetMap = state.budgets?.[monthKey] || {};

  const [draft, setDraft] = useState(() => ({ ...budgetMap }));

  const save = () => {
    for (const [catId, val] of Object.entries(draft)) {
      actions.setBudget({ monthKey, categoryId: catId, amount: Number(val) || 0 });
    }
    showAlert?.("บันทึก budgets แล้ว");
  };

  return (
    <div className="pb-28 pt-6 px-4 min-h-dvh bg-gray-50">
      <header className="mb-6 flex items-center gap-3">
        <button
          onClick={() => actions.navigate("more")}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-gray-600"
          type="button"
        >
          <ChevronRight className="rotate-180" size={24} />
        </button>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-gray-900">Budgets</h1>
          <p className="text-gray-500 text-sm">เดือน {monthKey}</p>
        </div>
      </header>

      <div className="space-y-3">
        {expenseCats.map((c) => {
          const spent = spentMap[c.id] || 0;
          const b = Number(draft[c.id] || 0);
          const over = b > 0 && spent > b;

          return (
            <div key={c.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg" style={{ backgroundColor: `${c.color}20` }}>
                    {c.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-gray-900 truncate">{c.name}</div>
                    <div className={`text-xs ${over ? "text-red-500" : "text-gray-500"}`}>
                      ใช้ไป {formatCurrency(spent)} {b > 0 ? ` / งบ ${formatCurrency(b)}` : ""}
                    </div>
                  </div>
                </div>

                <input
                  type="number"
                  value={draft[c.id] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                  className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm text-right"
                  placeholder="0"
                />
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={save}
        className="fixed bottom-6 left-4 right-4 bg-gray-900 text-white py-4 rounded-2xl font-bold shadow-xl shadow-gray-200 active:scale-95 transition-all flex items-center justify-center gap-2"
        type="button"
      >
        <Save size={18} /> บันทึก Budgets
      </button>
    </div>
  );
}
