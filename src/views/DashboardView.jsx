// src/views/DashboardView.jsx
import { useMemo, useState } from "react";
import { Filter, TrendingDown, TrendingUp, FileText, Search, AlertTriangle } from "lucide-react";
import TransactionCard from "../components/TransactionCard";
import { useAppStore } from "../store/store";
import { calcTotals, calcAccountBalance } from "../store/selectors";
import { formatCurrency } from "../utils/format";

function getTxOrderKey(t) {
  const d = t?.date ? new Date(String(t.date).slice(0, 10)).getTime() : 0;
  // fallback tie-breaker so stable ordering even when same date
  const idScore = String(t?.id || "").split("").reduce((s, ch) => s + ch.charCodeAt(0), 0);
  return d * 1000 + (idScore % 1000);
}

export default function DashboardView() {
  const store = useAppStore();
  const { state, navigate } = store;

  const [filterAccount, setFilterAccount] = useState("");
  const [q, setQ] = useState("");

  const totals = useMemo(() => calcTotals(state.transactions || []), [state.transactions]);

  const allCats = useMemo(() => {
    const exp = state.categories?.expense || [];
    const inc = state.categories?.income || [];
    return [...exp, ...inc];
  }, [state.categories]);

  const accountName = (id) => state.accounts?.find((a) => a.id === id)?.name || "—";

  const filtered = useMemo(() => {
    const txsAll = state.transactions || [];
    const accountsArr = state.accounts || [];
    const expenseCats = state.categories?.expense || [];
    const incomeCats = state.categories?.income || [];

    const accountsById = new Map(accountsArr.map((a) => [a.id, a]));

    const isTransferLike = (t) => {
      if (!t) return false;
      if (t.isTransfer) return true;
      const c = String(t.category || "").toLowerCase().trim();
      if (c === "transfer") return true;
      // future-proof: allow other internal tags to still behave as 2-legs
      if (String(t.transferId || "").trim()) return true;
      return false;
    };

    const isCreditAccount = (acc) => {
      const t = String(acc?.type || "").toLowerCase().trim();
      if (t === "credit") return true;
      if (Number(acc?.creditLimit || 0) > 0) return true;
      return false;
    };

    const qn = String(q || "").trim().toLowerCase();

    const matchQuery = (t) => {
      if (!qn) return true;
      const catName = String(allCats.find((c) => c.id === t.category)?.name || "").toLowerCase();
      const text = `${t.note || ""} ${t.merchant || ""} ${t.ref || ""} ${catName}`.toLowerCase();
      return text.includes(qn);
    };

    // 1) filter raw tx list (behaviorเดิม)
    let base = txsAll.slice();

    if (filterAccount) base = base.filter((t) => t.accountId === filterAccount);

    base = base.filter(matchQuery);

    // keep ordering (latest first)
    base.sort((a, b) => getTxOrderKey(b) - getTxOrderKey(a));

    // 2) index transfer pairs from ALL txs (so we can still show From→To even when filterAccount is set)
    const byTransferId = new Map();
    for (const t of txsAll) {
      if (!isTransferLike(t)) continue;
      const tid = String(t.transferId || "").trim();
      if (!tid) continue;
      if (!byTransferId.has(tid)) byTransferId.set(tid, []);
      byTransferId.get(tid).push(t);
    }

    // 3) build display list (Transfer/ชำระบัตร: แสดงครั้งเดียว)
    const seenTransferIds = new Set();
    const out = [];

    for (const t of base) {
      const tid = String(t.transferId || "").trim();

      if (isTransferLike(t) && tid) {
        if (seenTransferIds.has(tid)) continue;
        seenTransferIds.add(tid);

        const group = byTransferId.get(tid) || [t];

        const outTx = group.find((x) => x.type === "expense") || group[0] || null;
        const inTx = group.find((x) => x.type === "income") || group.find((x) => x.id !== outTx?.id) || null;

        // representative: prefer the leg that matches current account filter (for edit context),
        // else prefer expense leg (เหมาะกับมุมมอง "จ่ายออก")
        let rep = t;
        if (filterAccount) rep = group.find((x) => x.accountId === filterAccount) || outTx || t;
        else rep = outTx || t;

        const fromAcc = accountsById.get(outTx?.accountId || "") || null;
        const toAcc = accountsById.get(inTx?.accountId || "") || null;

        // credit-card payment = โอนจากบัญชีปกติ -> บัตรเครดิต (2 legs แต่ UI แสดง 1 ครั้ง)
        const isCardPayment = !!(fromAcc && toAcc && !isCreditAccount(fromAcc) && isCreditAccount(toAcc));

        const fromName = fromAcc?.name || (outTx?.accountId ? "บัญชีต้นทาง" : "");
        const toName = toAcc?.name || (inTx?.accountId ? "บัญชีปลายทาง" : "");

        const accountLabel =
          fromName && toName
            ? `${fromName} → ${toName}`
            : accountsById.get(rep?.accountId || "")?.name || "—";

        const prefix = isCardPayment ? "ชำระบัตรเครดิต" : "Transfer";

        // note for display only (ไม่แก้ของจริงใน store)
        const baseNote = String(rep?.note || outTx?.note || inTx?.note || "").trim();
        const displayNote = baseNote
          ? baseNote.toLowerCase().includes(prefix.toLowerCase())
            ? baseNote
            : `${prefix} • ${baseNote}`
          : `${prefix} • ${accountLabel}`;

        const displayTx = {
          ...rep,
          // keep real tx id for edit (START_EDIT_TRANSACTION uses id)
          id: rep?.id || outTx?.id || t.id,
          isTransfer: true,
          transferId: tid,
          category: String(rep?.category || outTx?.category || "transfer") || "transfer",
          // extra flags for downstream UI (TransactionCard can use later)
          transferKind: isCardPayment ? "card_payment" : "transfer",
          isCardPayment,
          note: displayNote,
        };

        const cat =
          expenseCats.find((c) => c.id === displayTx.category) ||
          incomeCats.find((c) => c.id === displayTx.category) ||
          null;

        out.push({ tx: displayTx, category: cat, accountName: accountLabel });
      } else {
        const cat =
          expenseCats.find((c) => c.id === t.category) ||
          incomeCats.find((c) => c.id === t.category) ||
          null;

        const accName = accountsById.get(t.accountId)?.name || "—";
        out.push({ tx: t, category: cat, accountName: accName });
      }

      if (out.length >= 40) break;
    }

    return out;
  }, [state.transactions, state.accounts, state.categories, filterAccount, q, allCats]);

  const startNewTransaction = () => {
    store.startNewTransaction();
  };

  const startEditTransaction = (id) => {
    if (!id) return;
    store.startEditTransaction(id);
  };

  const accounts = state.accounts || [];

  const balances = useMemo(() => {
    return accounts.map((acc) => ({
      ...acc,
      balance: calcAccountBalance(accounts, state.transactions || [], acc.id),
    }));
  }, [accounts, state.transactions]);

  return (
    <div className="p-4 pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-extrabold text-gray-900">Dashboard</h1>
        <button
          onClick={() => navigate("accounts")}
          className="glass-icon-btn w-10 h-10 rounded-full flex items-center justify-center text-gray-800 active:scale-95"
          type="button"
          aria-label="accounts"
        >
          <Filter size={18} />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="glass-card rounded-3xl p-4">
          <div className="text-xs font-bold text-gray-900/60 mb-2 flex items-center gap-2">
            <TrendingUp size={14} /> รายรับ
          </div>
          <div className="text-lg font-extrabold text-emerald-700">{formatCurrency(totals.income)}</div>
        </div>
        <div className="glass-card rounded-3xl p-4">
          <div className="text-xs font-bold text-gray-900/60 mb-2 flex items-center gap-2">
            <TrendingDown size={14} /> รายจ่าย
          </div>
          <div className="text-lg font-extrabold text-red-700">{formatCurrency(totals.expense)}</div>
        </div>
      </div>

      {/* Accounts balance preview */}
      <div className="glass-card rounded-3xl p-4 mb-5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-extrabold text-gray-900">ยอดคงเหลือแต่ละบัญชี</div>
          <button
            onClick={() => navigate("accounts")}
            className="text-xs font-extrabold text-indigo-700"
            type="button"
          >
            จัดการบัญชี
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {balances.slice(0, 4).map((acc) => (
            <div key={acc.id} className="flex items-center justify-between text-sm">
              <div className="font-extrabold text-gray-900 truncate">{acc.name}</div>
              <div className="font-extrabold text-gray-900">{formatCurrency(acc.balance)}</div>
            </div>
          ))}
          {balances.length > 4 ? (
            <div className="text-[11px] text-gray-900/55">และอีก {balances.length - 4} บัญชี</div>
          ) : null}
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card rounded-3xl p-4 mb-4">
        <div className="text-sm font-extrabold text-gray-900 mb-3 flex items-center gap-2">
          <Search size={16} /> ค้นหา & กรอง
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div className="glass-panel border border-white/20 rounded-2xl px-4 py-3">
            <div className="text-xs font-bold text-gray-900/60 mb-1">ค้นหา</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full outline-none bg-transparent text-sm font-extrabold text-gray-900"
              placeholder="เช่น ร้าน, หมวด, ref"
            />
          </div>

          <div className="glass-panel border border-white/20 rounded-2xl px-4 py-3">
            <div className="text-xs font-bold text-gray-900/60 mb-2">บัญชี</div>
            <select
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
              className="w-full bg-transparent outline-none text-sm font-extrabold text-gray-900"
            >
              <option value="">ทั้งหมด</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filterAccount || q ? (
          <div className="mt-3 text-[11px] text-gray-900/60 flex items-center gap-2">
            <AlertTriangle size={12} />
            กรองอยู่ • Transfer/ชำระบัตรเครดิต จะแสดงเป็น 1 รายการ (แม้ข้อมูลจริงเป็น 2 legs)
          </div>
        ) : null}
      </div>

      {/* Recent list */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
          <FileText size={16} /> รายการล่าสุด
        </h2>
        <div className="text-xs text-gray-900/55 font-extrabold">{filtered.length ? `${filtered.length} รายการ` : ""}</div>
      </div>

      {filtered.length ? (
        <div className="space-y-3">
          {filtered.map((item) => {
            const tx = item?.tx || item;

            const fallbackCategory =
              allCats.find((c) => c.id === tx.category) || { name: "ไม่ระบุ", icon: "❓", color: "#ccc" };

            const category =
              tx.isTransfer
                ? { name: tx.isCardPayment ? "ชำระบัตรเครดิต" : "Transfer", icon: "🔁", color: "#94a3b8" }
                : item?.category || fallbackCategory;

            return (
              <TransactionCard
                key={tx.id}
                tx={tx}
                category={category}
                accountName={item?.accountName || accountName(tx.accountId)}
                onClick={() => startEditTransaction(tx.id)}
              />
            );
          })}
        </div>
      ) : (
        <div className="glass-card rounded-3xl p-8 text-center">
          <p className="text-gray-900 font-extrabold">ยังไม่มีรายการ</p>
          <button onClick={startNewTransaction} className="mt-3 text-indigo-700 text-sm font-extrabold" type="button">
            เริ่มบันทึกรายการแรก
          </button>
        </div>
      )}
    </div>
  );
}
