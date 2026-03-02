// src/views/DashboardView.jsx
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Calendar, Search, AlertTriangle, FileText, CreditCard, Inbox as InboxIcon, Camera } from "lucide-react";
import TransactionCard from "../components/TransactionCard";
import AppHeader from "../components/AppHeader";
import EmptyState from "../components/EmptyState";
import AccountPicker from "../components/AccountPicker";
import BentoGrid from "../components/bento/BentoGrid";
import { useAppStore } from "../store/store.jsx";
import { getBudget, toMonthKey, calcAccountBalance } from "../store/selectors.js";
import { formatCurrency, toISODate } from "../utils/format";
import { isCreditAccount } from "../utils/accountMatch";
import { Landmark, Sparkles } from "lucide-react";
import { generateInsights } from "../utils/aiInsights";
import {
  isTransferLike,
  signedExpenseSatang,
  sumExpenseForDate,
  sumExpenseForMonth,
  daysInMonthKey,
  compareTxNewestFirst,
  sumCategoryBudgetsForMonth,
} from "../utils/transaction";

const BUDGET_TOTAL_ID = "__TOTAL__";
const BUDGET_DAILY_ID = "__DAILY__";
// ✅ Safe createdAt accessor (prevents crash when rendering transfer/split groups)
const getTxCreatedAt = (t) => {
  const n = Number(t?.createdAt || t?.updatedAt || 0);
  return Number.isFinite(n) ? n : 0;
};


export default function DashboardView() {
  const store = useAppStore();
  const { state, navigate } = store;

  const [filterAccount, setFilterAccount] = useState("");
  const [q, setQ] = useState("");
  const [filterTag, setFilterTag] = useState("");
const PAGE_SIZE = 40;
const [limit, setLimit] = useState(PAGE_SIZE);

// Reset paging when filters change
useEffect(() => {
  setLimit(PAGE_SIZE);
}, [filterAccount, q, filterTag]);


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

  // ===== Net Worth =====
  const netWorth = useMemo(() => {
    const accs = state.accounts || [];
    const txs = state.transactions || [];
    let total = 0;
    for (const a of accs) {
      const bal = calcAccountBalance(accs, txs, a.id);
      total += bal;
    }
    return total;
  }, [state.accounts, state.transactions]);

  const accountName = (id) => state.accounts?.find((a) => a.id === id)?.name || "—";

  // ===== AI Insights =====
  const insights = useMemo(() => {
    try {
      return generateInsights(state.transactions || [], state.categories, { currentMonth });
    } catch { return []; }
  }, [state.transactions, state.categories, currentMonth]);

  // ===== All tags for filter dropdown =====
  const allTags = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const t of state.transactions || []) {
      for (const tag of Array.isArray(t?.tags) ? t.tags : []) {
        const nt = String(tag || "").trim().toLowerCase();
        if (!nt || seen.has(nt)) continue;
        seen.add(nt);
        out.push(nt);
      }
    }
    return out.sort();
  }, [state.transactions]);

  const { items: filtered, hasMore } = useMemo(() => {
    const txsAll = state.transactions || [];
    const accountsArr = state.accounts || [];
    const expenseCats = state.categories?.expense || [];
    const incomeCats = state.categories?.income || [];

    const accountsById = new Map(accountsArr.map((a) => [a.id, a]));

    const qn = String(q || "").trim().toLowerCase();

    const matchQuery = (t) => {
      if (!qn) return true;
      const catName = String(allCats.find((c) => c.id === t.category)?.name || "").toLowerCase();
      const tagsText = Array.isArray(t?.tags) ? t.tags.join(" ") : "";
      const text = `${t.note || ""} ${t.merchant || ""} ${t.ref || ""} ${catName} ${tagsText}`.toLowerCase();
      return text.includes(qn);
    };

    const ftag = String(filterTag || "").trim().toLowerCase();
    const matchTag = (t) => {
      if (!ftag) return true;
      const arr = Array.isArray(t?.tags) ? t.tags : [];
      return arr.some((tag) => String(tag || "").trim().toLowerCase() === ftag);
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
    base = base.filter(matchTag);

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
  }, [state.transactions, state.accounts, state.categories, filterAccount, q, filterTag, allCats, limit]);

  const startNewTransaction = () => {
    store.startNewTransaction();
  };

  const startEditTransaction = (id) => {
    if (!id) return;
    store.startEditTransaction(id);
  };

  const accounts = state.accounts || [];

  return (
    <div className="min-h-dvh">
      <AppHeader
        title="หน้าแรก"
        subtitle={currentMonth}
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => store.startNewTransaction()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-600/10 border border-indigo-600/15 text-indigo-700 text-xs font-extrabold active:scale-95 transition-all"
              type="button"
              aria-label="Quick Scan"
              title="สแกนใบเสร็จ"
            >
              <Camera size={14} /> สแกน
            </button>
            <button
              onClick={() => navigate("inbox")}
              className="ui-icon-btn text-gray-800 active:scale-95"
              type="button"
              aria-label="Inbox"
              title="Inbox"
            >
              <InboxIcon size={18} />
            </button>
          </div>
        }
      />

      <main className="ui-page pt-4 pb-6">
        {/* Budget status (tap to edit in Budget page) */}
        <BentoGrid className="mb-5">
          <button
            type="button"
            onClick={() => navigate("budgets")}
            className="ui-card p-4 text-left active:scale-[0.99] transition-transform focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300/40 md:col-span-6"
          >
            <div className="text-xs font-extrabold text-gray-700/70 mb-2 flex items-center gap-2">
              <CalendarDays size={14} /> วันนี้
            </div>

            <div className="text-lg font-black text-gray-900 tabular-nums">{formatCurrency(todaySpent)}</div>

            <div className="mt-1 text-[11px] text-gray-700/70 font-bold">
              {dailyLimit > 0
                ? `งบ ${formatCurrency(dailyLimit)} • ${dailyPct}%`
                : "ยังไม่ตั้ง Daily budget (แตะเพื่อตั้ง)"}
            </div>

            {dailyLimit > 0 ? (
              <div className="mt-3">
                <div className="h-2 rounded-full bg-slate-900/10 overflow-hidden">
                  <div
                    className={dailyOver > 0 ? "h-full bg-red-600/80" : "h-full bg-slate-900/60"}
                    style={{ width: `${Math.min(100, Math.max(0, dailyPct))}%` }}
                  />
                </div>
                <div
                  className={
                    `mt-2 text-[11px] font-extrabold ${dailyOver > 0 ? "text-red-700" : "text-gray-700/70"}`
                  }
                >
                  {dailyOver > 0
                    ? `เกินงบ ${formatCurrency(dailyOver)}`
                    : `เหลือ ${formatCurrency(Math.max(0, dailyLimit - todaySpent))}`}
                </div>
                {!(Number(dailyBudgetCustom?.limit || 0) > 0) && dailyLimit > 0 && monthlyLimit > 0 ? (
                  <div className="mt-0.5 text-[10px] text-gray-600/70">* คำนวณจากงบรายเดือน / จำนวนวัน</div>
                ) : null}
              </div>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => navigate("budgets")}
            className="ui-card p-4 text-left active:scale-[0.99] transition-transform focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300/40 md:col-span-6"
          >
            <div className="text-xs font-extrabold text-gray-700/70 mb-2 flex items-center gap-2">
              <Calendar size={14} /> เดือนนี้
            </div>

            <div className="text-lg font-black text-gray-900 tabular-nums">{formatCurrency(monthSpent)}</div>

            <div className="mt-1 text-[11px] text-gray-700/70 font-bold">
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
                <div className="h-2 rounded-full bg-slate-900/10 overflow-hidden">
                  <div
                    className={monthlyOver > 0 ? "h-full bg-red-600/80" : "h-full bg-slate-900/60"}
                    style={{ width: `${Math.min(100, Math.max(0, monthlyPct))}%` }}
                  />
                </div>
                <div
                  className={
                    `mt-2 text-[11px] font-extrabold ${monthlyOver > 0 ? "text-red-700" : "text-gray-700/70"}`
                  }
                >
                  {monthlyOver > 0
                    ? `เกินงบ ${formatCurrency(monthlyOver)}`
                    : `เหลือ ${formatCurrency(Math.max(0, monthlyLimit - monthSpent))}`}
                </div>
              </div>
            ) : null}
          </button>
        </BentoGrid>

        {/* Net Worth */}
        <div className="ui-card p-4 mb-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-extrabold text-gray-700/70 mb-1 flex items-center gap-2">
                <Landmark size={14} /> มูลค่าสุทธิ (Net Worth)
              </div>
              <div className={`text-xl font-black tabular-nums ${netWorth >= 0 ? "text-gray-900" : "text-red-700"}`}>
                {formatCurrency(Math.abs(netWorth))}
              </div>
              {netWorth < 0 && (
                <div className="text-[11px] font-bold text-red-600/80 mt-0.5">ติดลบ — หนี้มากกว่าเงินออม</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => navigate("accounts")}
              className="text-xs font-extrabold text-indigo-700 active:scale-95"
            >
              ดูบัญชี →
            </button>
          </div>
        </div>

        {/* AI Insights */}
        {insights.length > 0 && (
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-indigo-600" />
              <span className="text-xs font-extrabold text-gray-700/70 uppercase tracking-wider">Insights</span>
            </div>
            <div className="space-y-2">
              {insights.map((ins, i) => (
                <div
                  key={`${ins.type}-${i}`}
                  className={`ui-card p-3.5 border-l-4 ${
                    ins.severity === "warning" ? "border-l-amber-500" :
                    ins.severity === "success" ? "border-l-emerald-500" :
                    "border-l-indigo-500"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-lg shrink-0">{ins.icon}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-gray-900">{ins.title}</div>
                      <div className="text-xs text-gray-600 mt-0.5">{ins.body}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="ui-card p-4 mb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-black text-gray-900">ค้นหา & กรอง</div>
            {filterAccount || q || filterTag ? (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setFilterAccount("");
                  setFilterTag("");
                }}
                className="ui-btn ui-btn-secondary !min-h-[40px] px-3 py-2"
              >
                ล้าง
              </button>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3">
            <div>
              <div className="ui-label">ค้นหา</div>
              <div className="mt-1 relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-900/45" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="ui-input pl-10"
                  placeholder="เช่น ร้าน, หมวด, ref"
                />
              </div>
            </div>

            <div>
              <div className="ui-label">บัญชี</div>
              <div className="mt-1">
                <AccountPicker
                  accounts={accounts}
                  value={filterAccount}
                  onChange={setFilterAccount}
                  title="เลือกบัญชี"
                  placeholder="ทั้งหมด"
                  allowEmpty
                  emptyLabel="ทั้งหมด"
                />
              </div>
            </div>

            {allTags.length > 0 && (
              <div>
                <div className="ui-label">แท็ก</div>
                <div className="mt-1">
                  <select
                    value={filterTag}
                    onChange={(e) => setFilterTag(e.target.value)}
                    className="ui-select"
                  >
                    <option value="">ทั้งหมด</option>
                    {allTags.map((tag) => (
                      <option key={tag} value={tag}>#{tag}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {filterAccount || q || filterTag ? (
            <div className="mt-3 ui-help flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-[2px]" />
              <div>
                กรองอยู่ • Transfer/ชำระบัตรเครดิต และ Split จะแสดงเป็น 1 รายการ (ข้อมูลจริงยังเป็นหลายรายการ)
              </div>
            </div>
          ) : null}
        </div>

        {/* Recent list */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-black text-gray-900 flex items-center gap-2">
            <FileText size={16} /> รายการล่าสุด
          </h2>
          <div className="text-xs text-gray-700/60 font-extrabold tabular-nums">
            {filtered.length ? `${filtered.length}${hasMore ? "+" : ""} รายการ` : ""}
          </div>
        </div>

        {filtered.length ? (
          <div className="space-y-1">
            {(() => {
              const groups = [];
              let currentDate = "";
              let currentGroup = null;

              for (const item of filtered) {
                const tx = item?.tx || item;
                const txDate = String(tx?.date || "").slice(0, 10);

                if (txDate !== currentDate) {
                  currentDate = txDate;
                  currentGroup = { date: txDate, items: [] };
                  groups.push(currentGroup);
                }
                currentGroup.items.push(item);
              }

              return groups.map((group) => {
                // Calculate daily expense subtotal
                let dailyExpense = 0;
                let dailyIncome = 0;
                for (const item of group.items) {
                  const tx = item?.tx || item;
                  if (isTransferLike(tx)) continue;
                  if (tx?.isSplitParent) continue;
                  const amt = Number(tx?.amount || 0);
                  if (String(tx?.type || "").toLowerCase() === "expense") {
                    dailyExpense += signedExpenseSatang(tx);
                  } else if (String(tx?.type || "").toLowerCase() === "income") {
                    dailyIncome += amt;
                  }
                }

                // Format date header
                let dateLabel = group.date;
                try {
                  const [y, m, d] = group.date.split("-").map(Number);
                  const dt = new Date(y, m - 1, d);
                  const isToday = group.date === todayISO;
                  const yesterday = new Date();
                  yesterday.setDate(yesterday.getDate() - 1);
                  const yISO = toISODate(yesterday);
                  const isYesterday = group.date === yISO;

                  const dayName = isToday ? "วันนี้" : isYesterday ? "เมื่อวาน" : new Intl.DateTimeFormat("th-TH", { weekday: "short" }).format(dt);
                  const dateStr = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(dt);
                  dateLabel = `${dayName} ${dateStr}`;
                } catch {
                  // ignore
                }

                return (
                  <div key={group.date} className="mb-4">
                    {/* Date header */}
                    <div className="flex items-center justify-between px-1 py-2">
                      <div className="text-xs font-extrabold text-gray-700/70">{dateLabel}</div>
                      <div className="flex items-center gap-3 text-xs font-extrabold tabular-nums">
                        {dailyIncome > 0 && (
                          <span className="text-emerald-700">+{formatCurrency(dailyIncome)}</span>
                        )}
                        {dailyExpense > 0 && (
                          <span className="text-red-700">-{formatCurrency(dailyExpense)}</span>
                        )}
                      </div>
                    </div>

                    {/* Transaction cards for this date */}
                    <div className="space-y-2">
                      {group.items.map((item) => {
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
                  </div>
                );
              });
            })()}

            {hasMore ? (
              <button
                type="button"
                onClick={() => setLimit((n) => n + PAGE_SIZE)}
                className="w-full ui-btn ui-btn-secondary"
              >
                โหลดเพิ่ม
              </button>
            ) : null}
          </div>
        ) : (
          <EmptyState
            title="ยังไม่มีรายการ"
            description="เริ่มบันทึกรายการแรกของคุณได้เลย"
            action={
              <button onClick={startNewTransaction} className="ui-btn ui-btn-primary" type="button">
                เริ่มบันทึก
              </button>
            }
          />
        )}
      </main>
    </div>
  );
}
