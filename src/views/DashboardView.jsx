// src/views/DashboardView.jsx
import { useEffect, useMemo, useState } from "react";
import { Filter, CalendarDays, Calendar, Search, AlertTriangle, FileText } from "lucide-react";
import TransactionCard from "../components/TransactionCard";
import { useAppStore } from "../store/store";
import { getBudget, toMonthKey } from "../store/selectors";
import { formatCurrency, toISODate } from "../utils/format";
import { isCreditAccount } from "../utils/accountMatch";

const BUDGET_TOTAL_ID = "__TOTAL__";
const BUDGET_DAILY_ID = "__DAILY__";

function daysInMonthKey(monthKey) {
  const s = String(monthKey || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return 30;
  const y = Number(m[1]);
  const mo = Math.max(1, Math.min(12, Number(m[2]) || 1));
  return new Date(y, mo, 0).getDate(); // mo is 1-based, day 0 => last day prev month
}

function isTransferLike(t) {
  if (!t) return false;
  if (t.isTransfer) return true;
  const c = String(t.category || "").toLowerCase().trim();
  if (c === "transfer") return true;
  if (String(t.transferId || "").trim()) return true;
  return false;
}

function signedExpenseSatang(t) {
  const amt = Number(t?.amount || 0) || 0;
  if (!(amt > 0)) return 0;
  const eff = String(t?.adjustmentEffect || "").toLowerCase().trim();
  // discount adjustment reduces expense
  return eff === "subtract" ? -Math.abs(amt) : Math.abs(amt);
}

function sumExpenseForDate(transactions, dateISO) {
  const d = String(dateISO || "").slice(0, 10);
  let sum = 0;
  for (const t of transactions || []) {
    if (!t) continue;
    if (isTransferLike(t)) continue;
    if (t?.isSplitParent) continue; // prevent double counting
    if (String(t?.type || "").toLowerCase().trim() !== "expense") continue;
    const td = String(t?.date || "").slice(0, 10);
    if (td !== d) continue;
    sum += signedExpenseSatang(t);
  }
  return Math.max(0, Math.round(sum));
}

function sumExpenseForMonth(transactions, monthKey) {
  const mk = String(monthKey || "").slice(0, 7);
  let sum = 0;
  for (const t of transactions || []) {
    if (!t) continue;
    if (isTransferLike(t)) continue;
    if (t?.isSplitParent) continue;
    if (String(t?.type || "").toLowerCase().trim() !== "expense") continue;
    const td = String(t?.date || "").slice(0, 7);
    if (td !== mk) continue;
    sum += signedExpenseSatang(t);
  }
  return Math.max(0, Math.round(sum));
}

function sumCategoryBudgetsForMonth(budgets, monthKey) {
  const mk = String(monthKey || "").trim();
  let sum = 0;
  for (const b of budgets || []) {
    if (!b) continue;
    if (String(b?.month || "").trim() !== mk) continue;
    const cid = String(b?.categoryId || "").trim();
    // exclude global budgets
    if (cid === BUDGET_TOTAL_ID || cid === BUDGET_DAILY_ID) continue;
    const lim = Number(b?.limit || 0) || 0;
    if (lim > 0) sum += lim;
  }
  return Math.max(0, Math.round(sum));
}

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
const PAGE_SIZE = 40;
const [limit, setLimit] = useState(PAGE_SIZE);

// Reset paging when filters change
useEffect(() => {
  setLimit(PAGE_SIZE);
}, [filterAccount, q]);


  // ===== Budget tracking (Daily / Monthly) =====
  const todayISO = toISODate(new Date());
  const currentMonth = toMonthKey(todayISO);

  const todaySpent = useMemo(
    () => sumExpenseForDate(state.transactions || [], todayISO),
    [state.transactions, todayISO]
  );

  const monthSpent = useMemo(
    () => sumExpenseForMonth(state.transactions || [], currentMonth),
    [state.transactions, currentMonth]
  );

  const monthlyBudgetCustom = useMemo(
    () => getBudget(state.budgets || [], currentMonth, BUDGET_TOTAL_ID),
    [state.budgets, currentMonth]
  );

  const dailyBudgetCustom = useMemo(
    () => getBudget(state.budgets || [], currentMonth, BUDGET_DAILY_ID),
    [state.budgets, currentMonth]
  );

  const perCatMonthlyLimit = useMemo(
    () => sumCategoryBudgetsForMonth(state.budgets || [], currentMonth),
    [state.budgets, currentMonth]
  );

  const monthlyLimit = (Number(monthlyBudgetCustom?.limit || 0) > 0 ? Number(monthlyBudgetCustom.limit) : perCatMonthlyLimit) || 0;
  const derivedDailyLimit = monthlyLimit > 0 ? Math.round(monthlyLimit / daysInMonthKey(currentMonth)) : 0;
  const dailyLimit = (Number(dailyBudgetCustom?.limit || 0) > 0 ? Number(dailyBudgetCustom.limit) : derivedDailyLimit) || 0;

  const dailyPct = dailyLimit > 0 ? Math.round((todaySpent / dailyLimit) * 100) : 0;
  const monthlyPct = monthlyLimit > 0 ? Math.round((monthSpent / monthlyLimit) * 100) : 0;

  const dailyOver = dailyLimit > 0 ? Math.max(0, todaySpent - dailyLimit) : 0;
  const monthlyOver = monthlyLimit > 0 ? Math.max(0, monthSpent - monthlyLimit) : 0;

  const allCats = useMemo(() => {
    const exp = state.categories?.expense || [];
    const inc = state.categories?.income || [];
    return [...exp, ...inc];
  }, [state.categories]);

  const accountName = (id) => state.accounts?.find((a) => a.id === id)?.name || "—";

  const { items: filtered, hasMore } = useMemo(() => {
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

    // ✅ Search should include split-children so keywords inside child lines can be found.
    // Without a query, keep the list clean by hiding children (they show inside parent breakdown).
    if (!qn) {
      base = base.filter((t) => !t?.isSplitChild);
    }
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
    let hasMore = false;

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

      if (out.length >= limit) {
        hasMore = true;
        break;
      }
    }

    return { items: out, hasMore };
  }, [state.transactions, state.accounts, state.categories, filterAccount, q, allCats, limit]);

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

      {/* Budget status (tap to edit in Budget page) */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <button
          type="button"
          onClick={() => navigate("budgets")}
          className="glass-card rounded-3xl p-4 text-left hover:scale-[1.01] active:scale-[0.99] transition-transform"
        >
          <div className="text-xs font-bold text-gray-900/60 mb-2 flex items-center gap-2">
            <CalendarDays size={14} /> วันนี้
          </div>

          <div className="text-lg font-extrabold text-gray-900">{formatCurrency(todaySpent)}</div>

          <div className="mt-1 text-[11px] text-gray-900/60">
            {dailyLimit > 0
              ? `งบ ${formatCurrency(dailyLimit)} • ${dailyPct}%`
              : "ยังไม่ตั้ง Daily budget (แตะเพื่อตั้ง)"}
          </div>

          {dailyLimit > 0 ? (
            <div className="mt-3">
              <div className="h-2 rounded-full bg-white/25 overflow-hidden">
                <div
                  className={`h-full ${dailyOver > 0 ? "bg-red-600/80" : "bg-gray-900/50"}`}
                  style={{ width: `${Math.min(100, Math.max(0, dailyPct))}%` }}
                />
              </div>
              <div
                className={`mt-2 text-[11px] font-extrabold ${dailyOver > 0 ? "text-red-700" : "text-gray-900/60"}`}
              >
                {dailyOver > 0
                  ? `เกินงบ ${formatCurrency(dailyOver)}`
                  : `เหลือ ${formatCurrency(Math.max(0, dailyLimit - todaySpent))}`}
              </div>
              {!(Number(dailyBudgetCustom?.limit || 0) > 0) && dailyLimit > 0 && monthlyLimit > 0 ? (
                <div className="mt-0.5 text-[10px] text-gray-900/45">* คำนวณจากงบรายเดือน / จำนวนวัน</div>
              ) : null}
            </div>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => navigate("budgets")}
          className="glass-card rounded-3xl p-4 text-left hover:scale-[1.01] active:scale-[0.99] transition-transform"
        >
          <div className="text-xs font-bold text-gray-900/60 mb-2 flex items-center gap-2">
            <Calendar size={14} /> เดือนนี้
          </div>

          <div className="text-lg font-extrabold text-gray-900">{formatCurrency(monthSpent)}</div>

          <div className="mt-1 text-[11px] text-gray-900/60">
            {monthlyLimit > 0 ? (
              Number(monthlyBudgetCustom?.limit || 0) > 0
                ? `งบ ${formatCurrency(monthlyLimit)} • ${monthlyPct}%`
                : `งบ ${formatCurrency(monthlyLimit)} (รวมจากหมวด) • ${monthlyPct}%`
            ) : (
              "ยังไม่ตั้ง Monthly budget (แตะเพื่อตั้ง)"
            )}
          </div>

          {monthlyLimit > 0 ? (
            <div className="mt-3">
              <div className="h-2 rounded-full bg-white/25 overflow-hidden">
                <div
                  className={`h-full ${monthlyOver > 0 ? "bg-red-600/80" : "bg-gray-900/50"}`}
                  style={{ width: `${Math.min(100, Math.max(0, monthlyPct))}%` }}
                />
              </div>
              <div
                className={`mt-2 text-[11px] font-extrabold ${monthlyOver > 0 ? "text-red-700" : "text-gray-900/60"}`}
              >
                {monthlyOver > 0
                  ? `เกินงบ ${formatCurrency(monthlyOver)}`
                  : `เหลือ ${formatCurrency(Math.max(0, monthlyLimit - monthSpent))}`}
              </div>
            </div>
          ) : null}
        </button>
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
        <div className="text-xs text-gray-900/55 font-extrabold">{filtered.length ? `${filtered.length}${hasMore ? "+" : ""} รายการ` : ""}</div>
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
{hasMore ? (
  <button
    type="button"
    onClick={() => setLimit((n) => n + PAGE_SIZE)}
    className="w-full glass-btn py-3 rounded-2xl font-extrabold text-gray-900 active:scale-[0.99]"
  >
    โหลดเพิ่ม
  </button>
) : null}

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
