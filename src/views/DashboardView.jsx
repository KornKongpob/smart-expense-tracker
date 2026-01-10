// src/views/DashboardView.jsx
import { useMemo, useState } from "react";
import { Filter, TrendingDown, TrendingUp, FileText, Search, AlertTriangle } from "lucide-react";
import TransactionCard from "../components/TransactionCard";
import { useAppStore } from "../store/store";
import { calcTotals } from "../store/selectors";
import { formatCurrency } from "../utils/format";

function getTxDateMs(t) {
  return t?.date ? new Date(String(t.date).slice(0, 10)).getTime() : 0;
}

function getTxCreatedAt(t) {
  return Number(t?.createdAt || t?.updatedAt || 0) || 0;
}

function compareTxNewestFirst(a, b) {
  const da = getTxDateMs(a);
  const db = getTxDateMs(b);
  if (db !== da) return db - da;

  // Same date: most recently added/updated should be on top
  const ca = getTxCreatedAt(a);
  const cb = getTxCreatedAt(b);
  if (cb !== ca) return cb - ca;

  // Final stable tie-breaker
  const ia = String(a?.id || "");
  const ib = String(b?.id || "");
  return ib.localeCompare(ia);
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

    // ✅ hide split child transactions from the main list (children show inside parent breakdown)
    base = base.filter((t) => !t?.isSplitChild);

    base = base.filter(matchQuery);

    // keep ordering (latest date first; same date: latest added first)
    base.sort(compareTxNewestFirst);

    // 2) index transfer pairs from ALL txs (so we can still show From→To even when filterAccount is set)
    const byTransferId = new Map();
    for (const t of txsAll) {
      if (!isTransferLike(t)) continue;
      const tid = String(t.transferId || "").trim();
      if (!tid) continue;
      if (!byTransferId.has(tid)) byTransferId.set(tid, []);
      byTransferId.get(tid).push(t);
    }

    // 2.1) index split groups from ALL txs (เพื่อ group ใน UI แต่ยังเก็บ tx แยกจริง)
    const bySplitGroupId = new Map();
    for (const t of txsAll) {
      if (isTransferLike(t)) continue;
      const gid = String(t?.splitGroupId || "").trim();
      if (!gid) continue;
      if (!bySplitGroupId.has(gid)) bySplitGroupId.set(gid, []);
      bySplitGroupId.get(gid).push(t);
    }

    // 3) build display list (Transfer/ชำระบัตร: แสดงครั้งเดียว)
    const seenTransferIds = new Set();
    const seenSplitGroupIds = new Set();
    const out = [];

    for (const t of base) {
      const tid = String(t.transferId || "").trim();
      const gid = String(t?.splitGroupId || "").trim();

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
          // For ordering: if same date, prefer the leg that was added most recently
          createdAt: Math.max(getTxCreatedAt(rep), getTxCreatedAt(outTx), getTxCreatedAt(inTx)),
        };

        const cat =
          expenseCats.find((c) => c.id === displayTx.category) ||
          incomeCats.find((c) => c.id === displayTx.category) ||
          null;

        out.push({ tx: displayTx, category: cat, accountName: accountLabel });
      } else if (!isTransferLike(t) && gid) {
        // ✅ Split group: show a single card. If we have a split-parent tx, use it as the representative.
        // Children are the "real" categorized transactions (used for budgets/reports).
        if (seenSplitGroupIds.has(gid)) continue;
        seenSplitGroupIds.add(gid);

        const group = bySplitGroupId.get(gid) || [t];

        const parent = group.find((x) => !!x?.isSplitParent) || null;
        const rawLines = parent
          ? group.filter(
              (x) =>
                !!x?.isSplitChild || String(x?.splitParentId || "").trim() === String(parent?.id || "").trim()
            )
          : group.filter((x) => !x?.isSplitParent);

        const linesBase = rawLines && rawLines.length ? rawLines : group.filter((x) => !x?.isSplitParent);

        const groupSorted = [...linesBase].sort((a, b) => {
          const ia = Number(a?.splitIndex || 0) || 0;
          const ib = Number(b?.splitIndex || 0) || 0;
          if (ia && ib && ia !== ib) return ia - ib;
          return Math.abs(Number(b?.amount || 0)) - Math.abs(Number(a?.amount || 0));
        });

        // representative for edit context
        let rep = parent || t;
        if (!parent) {
          if (filterAccount) rep = groupSorted.find((x) => x.accountId === filterAccount) || groupSorted[0] || t;
          else rep = groupSorted[0] || t;
        }

        const total = parent ? Number(parent?.amount || 0) || 0 : groupSorted.reduce((s, x) => s + (Number(x?.amount) || 0), 0);
        const label = String(
          (parent?.splitLabel || rep?.splitLabel || groupSorted.find((x) => x?.splitLabel)?.splitLabel || "")
        ).trim();

        const baseNote = String((parent?.note || rep?.note || "").trim());
        const displayNote = label || baseNote || `Split (${groupSorted.length})`;

        const createdAtCandidates = []
          .concat(parent ? [getTxCreatedAt(parent)] : [])
          .concat(groupSorted.map((x) => getTxCreatedAt(x)));

        const displayTx = {
          ...(parent || rep),
          id: (parent || rep)?.id || t.id,
          amount: total,
          note: displayNote,
          isSplitGroup: true,
          splitGroupId: gid,
          splitLines: groupSorted,
          createdAt: Math.max(...createdAtCandidates),
        };

        const accName = accountsById.get(displayTx.accountId)?.name || "—";
        out.push({ tx: displayTx, category: null, accountName: accName });
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
            กรองอยู่ • Transfer/ชำระบัตรเครดิต และ Split จะถูกรวมแสดงเป็น 1 รายการ (ข้อมูลจริงยังเป็นหลาย transactions)
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
