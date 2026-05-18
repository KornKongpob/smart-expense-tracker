// src/views/StatsView.jsx
import { memo, useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Sparkles,
  PieChart as PieIcon,
  BarChart3,
  CalendarDays,
  Plus,
  ReceiptText,
  Info,
} from "lucide-react";
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
import { combineLocalDateTime, formatCurrency, formatDateShort, formatTransactionDateTime, normalizeTimeHHmm } from "../utils/format";
import { useAppStore } from "../store/store.jsx";
import { parseDateSafe } from "../store/selectors.js";
import { signedExpenseAmountSatang } from "../domain/ledger/ledgerMath.js";
import {
  isReportableExpenseTransaction,
  isReportableIncomeTransaction,
} from "../domain/ledger/transactionTypes.js";
import AppHeader from "../components/AppHeader";
import ModalShell from "../components/ModalShell";
import AccountPill from "../components/AccountPill";
import { useLockBodyScroll } from "../utils/useLockBodyScroll";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function safeNumber(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function useIsSmallScreen() {
  const [isSm, setIsSm] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return true;
    return window.matchMedia("(max-width: 640px)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = (e) => setIsSm(!!e.matches);
    try {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    } catch {
      // Safari fallback
      mq.addListener(onChange);
      return () => mq.removeListener(onChange);
    }
  }, []);

  return isSm;
}

// Expense math must respect receipt adjustments.
// - normal expense line => +amount
// - discount adjustment (adjustmentEffect='subtract') => -amount
function signedExpenseAmount(tx) {
  return signedExpenseAmountSatang(tx);
}

function toISODateFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getPeriodLabel(period) {
  if (period === "today") return "วันนี้";
  if (period === "week") return "7 วันล่าสุด";
  if (period === "month") return "เดือนนี้";
  if (period === "year") return "ปีนี้";
  return "ทั้งหมด";
}

function getPeriodStart(period, now) {
  if (period === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "week") return new Date(now.getTime() - 7 * 86400000);
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "year") return new Date(now.getFullYear(), 0, 1);
  return new Date(0);
}

function getTxOrderKey(tx) {
  const combined = combineLocalDateTime(tx?._iso || tx?.date, normalizeTimeHHmm(tx?.time));
  if (combined) return combined.getTime();

  const updated = Number(tx?.updatedAt);
  const created = Number(tx?.createdAt);
  if (Number.isFinite(updated) && updated > 0) return updated;
  if (Number.isFinite(created) && created > 0) return created;

  const t = Number(tx?._time);
  return Number.isFinite(t) ? t : 0;
}

function GlassKpiCard({ icon, title, value, sub, notes = [], tone = "neutral" }) {
  const toneCls =
    tone === "income"
      ? "bg-emerald-600/15 border-emerald-600/20 text-emerald-800"
      : tone === "expense"
      ? "bg-rose-600/15 border-rose-600/20 text-rose-800"
      : tone === "net"
      ? "bg-indigo-600/15 border-indigo-600/20 text-indigo-800"
      : tone === "today"
      ? "bg-amber-600/15 border-amber-600/20 text-amber-900"
      : "bg-white/18 border-white/20 text-gray-800";

  // UX rule from user: numbers must stay on ONE line (no wrap) and must never be visually cut.
  // We solve this by:
  // 1) giving the number full card width (title/icon are above),
  // 2) forcing single-line with whitespace-nowrap,
  // 3) enabling horizontal scroll if the number is still longer than the viewport.
  return (
    <div className="ui-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-gray-900/65 tracking-wide uppercase">{title}</div>
        </div>
        <div className={`shrink-0 w-11 h-11 rounded-2xl border flex items-center justify-center ${toneCls}`}>
          {icon}
        </div>
      </div>

      <div className="mt-2">
        <div
          className="text-[clamp(20px,6.5vw,26px)] leading-tight font-semibold text-gray-900 tabular-nums whitespace-nowrap overflow-x-auto no-scrollbar"
          role="text"
          aria-label={String(title || "").trim() ? `${title}: ${value}` : String(value)}
          title={String(value)}
        >
          {value}
        </div>
        {sub ? <div className="mt-1 text-[11px] font-bold text-gray-800/60 leading-snug">{sub}</div> : null}
        {notes.length ? (
          <div className="mt-2 space-y-1">
            {notes.map((note) => (
              <div key={note} className="text-[11px] font-semibold leading-snug text-gray-700/60">
                {note}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TonePill({ tone, children }) {
  const cls =
    tone === "income"
      ? "bg-emerald-600/15 text-emerald-800 border-emerald-700/15"
      : tone === "expense"
      ? "bg-rose-600/15 text-rose-800 border-rose-700/15"
      : tone === "net"
      ? "bg-indigo-600/15 text-indigo-800 border-indigo-700/15"
      : "bg-white/60 text-gray-800 border-gray-900/10";

  return (
    <span
      className={"inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[12px] font-semibold " + cls}
    >
      {children}
    </span>
  );
}

function SummaryNote({ children }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-white/20 bg-white/45 px-3 py-2 text-[11px] font-semibold leading-snug text-gray-700/70">
      <Info size={14} className="mt-0.5 shrink-0 text-indigo-700" />
      <span>{children}</span>
    </div>
  );
}

function StatsEmptyState({ onAdd, onScan, title, description, compact = false }) {
  return (
    <div className={`${compact ? "glass-panel border border-white/20" : "ui-card"} text-center ${compact ? "px-4 py-8" : "py-12"}`}>
      <Activity size={compact ? 38 : 48} className="mx-auto mb-3 opacity-25 text-gray-600" />
      <p className="font-semibold text-gray-800">{title || "ไม่มีข้อมูลในช่วงเวลานี้"}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-gray-800/60">
        {description || "ลองเปลี่ยนช่วงเวลา หรือเพิ่มรายการก่อน"}
      </p>
      <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
        <button type="button" className="ui-btn ui-btn-primary" onClick={onAdd}>
          <Plus size={16} />
          เพิ่มรายการ
        </button>
        <button type="button" className="ui-btn ui-btn-secondary" onClick={onScan}>
          <ReceiptText size={16} />
          สแกนใบเสร็จ
        </button>
      </div>
    </div>
  );
}

const CatIcon = memo(function CatIcon({ icon, color, title }) {
  const ico = String(icon || "").trim();
  return (
    <div
      className="w-10 h-10 rounded-2xl border border-white/20 shrink-0 flex items-center justify-center"
      style={{ backgroundColor: `${color || "#cbd5e1"}22` }}
      title={title}
    >
      <span className="text-lg leading-none">{ico || "❓"}</span>
    </div>
  );
});

const TxRow = memo(function TxRow({ tx, cat, account }) {
  const note = String(tx?.note || "").trim();
  const ref = String(tx?.ref || "").trim();
  const dateText = formatTransactionDateTime(tx?._iso || tx?.date, tx?.time);

  return (
    <div className="glass-panel border border-white/20 rounded-2xl p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-gray-800/60 flex flex-wrap items-center gap-2">
            <span className="font-semibold">{dateText}</span>
            <span className="text-gray-900/25 font-semibold">•</span>
            <AccountPill account={account} fallbackName={account?.name} size="sm" showHint={false} />
          </div>

          <div className="mt-1 font-semibold text-gray-900 truncate">
            {cat?.icon ? `${cat.icon} ` : ""}
            {cat?.name || "ไม่ทราบหมวด"}
          </div>

          {note ? <div className="text-[12px] text-gray-800/70 mt-0.5 truncate">{note}</div> : null}
          {ref ? <div className="text-[11px] text-gray-800/55 mt-0.5 truncate">Ref: {ref}</div> : null}
        </div>

        <div className="shrink-0 text-right">
          {(() => {
            const signed = signedExpenseAmount(tx);
            const isDiscount = signed < 0;
            const absAmt = Math.abs(safeNumber(tx?._amt ?? tx?.amount));
            return (
              <div className={`text-sm font-semibold ${isDiscount ? "text-emerald-700" : "text-rose-700"}`}>
                {isDiscount ? "+" : "-"}
                {formatCurrency(absAmt)}
              </div>
            );
          })()}
          <div className="text-[11px] text-gray-800/55 mt-0.5">{tx?.type || "expense"}</div>
        </div>
      </div>
    </div>
  );
});

export default function StatsView() {
  const store = useAppStore();
  const { state } = store;
  const [period, setPeriod] = useState("month"); // today | week | month | year
  const [isPending, startTransition] = useTransition();
  const isSm = useIsSmallScreen();

  // Drill-down modal state
  const [openCat, setOpenCat] = useState(false);

  // Prevent background scroll while the detail sheet is open
  useLockBodyScroll(openCat);
  const [selectedCatId, setSelectedCatId] = useState(null);

  const now = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => toISODateFromDate(now), [now]);

  const periodLabel = useMemo(() => getPeriodLabel(period), [period]);
  const periodStart = useMemo(() => getPeriodStart(period, now), [period, now]);

  const expenseCats = useMemo(() => state.categories?.expense || [], [state.categories]);
  const expenseCatMap = useMemo(() => {
    const m = new Map();
    for (const c of expenseCats) m.set(c.id, c);
    return m;
  }, [expenseCats]);

  const accountMap = useMemo(() => {
    const m = new Map();
    for (const a of state.accounts || []) m.set(a.id, a);
    return m;
  }, [state.accounts]);

  // ✅ Normalize transactions once (reduce parse overhead)
  const normalizedTxs = useMemo(() => {
    const txs = state.transactions || [];
    return txs.map((t) => {
      const d = parseDateSafe(t?.date);
      const time = d?.getTime?.() || 0;
      const iso = time ? toISODateFromDate(d) : String(t?.date || "");
      const amt = safeNumber(t?.amount);
      return { ...t, _d: d, _time: time, _iso: iso, _amt: amt };
    });
  }, [state.transactions]);

  // Filter by selected period (still excludes Transfer)
  const filtered = useMemo(() => {
    const out = [];
    for (const t of normalizedTxs) {
      if (!isReportableExpenseTransaction(t) && !isReportableIncomeTransaction(t)) continue;

      if (period === "today") {
        if (t._iso === todayIso) out.push(t);
        continue;
      }

      const d = t._d;
      if (!d || !Number.isFinite(t._time)) continue;

      if (period === "week") {
        if (d >= periodStart) out.push(t);
        continue;
      }
      if (period === "month") {
        if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) out.push(t);
        continue;
      }
      if (period === "year") {
        if (d.getFullYear() === now.getFullYear()) out.push(t);
        continue;
      }

      out.push(t);
    }
    return out;
  }, [normalizedTxs, period, todayIso, periodStart, now]);

  // ✅ Make heavy parts smooth
  const deferredFiltered = useDeferredValue(filtered);

  const totals = useMemo(() => {
    let income = 0;
    let expenseSigned = 0;
    let discountSaved = 0;

    for (const t of filtered) {
      if (isReportableIncomeTransaction(t)) {
        income += t._amt;
        continue;
      }

      if (isReportableExpenseTransaction(t)) {
        const s = signedExpenseAmount(t);
        expenseSigned += s;
        if (String(t?.adjustmentEffect || "").toLowerCase().trim() === "subtract") {
          discountSaved += safeNumber(t?._amt);
        }
      }
    }

    const expense = Math.max(0, expenseSigned);
    const net = income - expense;

    const start = periodStart;
    const end = now;
    const daysRaw = Math.ceil((end.getTime() - start.getTime()) / 86400000);
    const days = Math.max(1, daysRaw);
    const avgSpendPerDay = expense / days;

    return { income, expense, net, avgSpendPerDay, days, discountSaved };
  }, [filtered, periodStart, now]);

  const pieData = useMemo(() => {
    const map = new Map();
    for (const t of deferredFiltered) {
      if (!isReportableExpenseTransaction(t)) continue;
      // Exclude discount adjustments from category distribution (they are savings)
      // but keep them in overall expense totals (totals.expense).
      const s = signedExpenseAmount(t);
      if (!(s > 0)) continue;
      map.set(t.category, (map.get(t.category) || 0) + s);
    }

    const items = [...map.entries()]
      .map(([catId, value]) => {
        const cat = expenseCatMap.get(catId) || {};
        return {
          id: catId,
          name: cat.name || "ไม่ทราบหมวด",
          icon: cat.icon || "❓",
          value,
          color: cat.color || "#cbd5e1",
        };
      })
      .sort((a, b) => b.value - a.value);

    const top = items.slice(0, 6);
    const rest = items.slice(6);
    const restSum = rest.reduce((s, x) => s + safeNumber(x.value), 0);

    if (restSum > 0) top.push({ id: "other_agg", name: "อื่นๆ", icon: "🧩", value: restSum, color: "#94a3b8" });

    return top;
  }, [deferredFiltered, expenseCatMap]);

  const totalExpense = useMemo(() => pieData.reduce((s, x) => s + safeNumber(x.value), 0), [pieData]);

  const topCategory = useMemo(() => {
    const top = pieData[0];
    if (!top) return null;
    const pct = totalExpense ? Math.round((top.value / totalExpense) * 100) : 0;
    return { ...top, pct };
  }, [pieData, totalExpense]);

  const trend = useMemo(() => {
    const map = new Map();

    for (const t of deferredFiltered) {
      const iso = t._iso;
      const prev = map.get(iso) || { iso, date: formatDateShort(iso), income: 0, expense: 0, net: 0 };

      if (isReportableIncomeTransaction(t)) prev.income += t._amt;
      else if (isReportableExpenseTransaction(t)) prev.expense += signedExpenseAmount(t);

      // Don't let expense go below 0 on chart (e.g., discount-only day)
      if (prev.expense < 0) prev.expense = 0;

      prev.net = prev.income - prev.expense;
      map.set(iso, prev);
    }

    return [...map.values()]
      .sort((a, b) => String(a.iso).localeCompare(String(b.iso)))
      .slice(-12)
      .map((x) => {
        const { iso: _iso, ...rest } = x;
        return rest;
      });
  }, [deferredFiltered]);

  const hasAny = filtered.length > 0;

  const rangeText = useMemo(() => {
    const startIso = toISODateFromDate(periodStart);
    const endIso = todayIso;
    if (period === "today") return formatDateShort(endIso);
    return formatDateShort(startIso) + " – " + formatDateShort(endIso);
  }, [period, periodStart, todayIso]);

  const countText = useMemo(() => {
    const n = filtered.length;
    const d = totals.days;
    return n.toLocaleString("th-TH") + " รายการ • " + d.toLocaleString("th-TH") + " วัน";
  }, [filtered.length, totals.days]);

  const xInterval = useMemo(() => {
    const len = trend.length;
    if (!isSm) return 0;
    return Math.max(0, Math.ceil(len / 6) - 1);
  }, [trend.length, isSm]);

  // Drill-down list for selected category in current period
  const selectedCat = useMemo(() => {
    if (!selectedCatId) return null;
    return expenseCatMap.get(selectedCatId) || null;
  }, [selectedCatId, expenseCatMap]);

  const catTxs = useMemo(() => {
    if (!selectedCatId) return [];
    const txs = filtered
      .filter((t) => isReportableExpenseTransaction(t) && t.category === selectedCatId)
      .slice()
      .sort((a, b) => getTxOrderKey(b) - getTxOrderKey(a));
    return txs;
  }, [filtered, selectedCatId]);

  const catTotal = useMemo(() => catTxs.reduce((s, t) => s + signedExpenseAmount(t), 0), [catTxs]);

  const openCategory = (catId) => {
    setSelectedCatId(catId);
    setOpenCat(true);
  };

  const openManualEntry = () => {
    if (typeof store.startNewTransaction === "function") {
      store.startNewTransaction({ entryMode: "manual", txType: "expense" });
      return;
    }
    store.navigate?.("add");
  };

  const openReceiptScan = () => {
    if (typeof store.startNewTransaction === "function") {
      store.startNewTransaction({ entryMode: "scan", scanUploadKind: "receipt" });
      return;
    }
    store.navigate?.("add");
  };

  return (
    <div className="min-h-dvh">
      <AppHeader
        title="สรุปผล"
        subtitle={`ช่วงเวลา: ${periodLabel} • ไม่รวม Transfer / Split parent${isPending ? " • กำลังอัปเดต…" : ""}`}
        right={
          <div className="shrink-0 w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600/20 via-purple-600/15 to-rose-600/15 border border-white/20 flex items-center justify-center">
            <Sparkles size={18} className="text-indigo-700" />
          </div>
        }
      />

    <main className="ui-page pt-4 pb-nav">

      {/* Period segmented */}
      <div className="ui-card p-1 rounded-2xl mb-5 flex">
        {[
          { id: "today", label: "วันนี้" },
          { id: "week", label: "7 วัน" },
          { id: "month", label: "เดือนนี้" },
          { id: "year", label: "ปีนี้" },
        ].map((p) => (
          <button
            key={p.id}
            onClick={() => startTransition(() => setPeriod(p.id))}
            className={`flex-1 py-2.5 text-xs font-semibold rounded-xl transition-all ${
              period === p.id ? "bg-gray-900/90 text-white shadow-sm" : "text-gray-700 hover:bg-white/10"
            }`}
            type="button"
          >
            {p.label}
          </button>
        ))}
      </div>

      <section className="mb-6" aria-labelledby="stats-period-summary-title">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div id="stats-period-summary-title" className="text-lg font-semibold text-gray-950">
              สรุปช่วงเวลานี้
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <TonePill tone="net">
                <CalendarDays size={14} />
                {rangeText}
              </TonePill>
              <TonePill tone="neutral">{countText}</TonePill>
            </div>
          </div>
          {totals.discountSaved ? (
            <div className="text-[12px] font-bold text-gray-700/65 sm:text-right">
              ส่วนลดในใบเสร็จ: <span className="tabular-nums">{formatCurrency(totals.discountSaved)}</span>
            </div>
          ) : null}
        </div>

        {/* KPI cards (mobile-first: full-width so long numbers don't get cut) */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <GlassKpiCard
            tone="income"
            title="รายรับ"
            value={formatCurrency(totals.income)}
            sub={hasAny ? `ในช่วง ${periodLabel}` : "ยังไม่มีรายรับในช่วงนี้"}
            notes={["ไม่รวม Transfer / Split parent"]}
            icon={<TrendingUp size={18} />}
          />
          <GlassKpiCard
            tone="expense"
            title="รายจ่าย"
            value={formatCurrency(totals.expense)}
            sub={totals.discountSaved ? `หักส่วนลดแล้ว ${formatCurrency(totals.discountSaved)}` : "ยอดรายจ่ายสุทธิ"}
            notes={["ไม่รวม Transfer / Split parent", "ส่วนลดในใบเสร็จไม่นับเป็นรายจ่าย"]}
            icon={<TrendingDown size={18} />}
          />
          <GlassKpiCard
            tone="net"
            title="คงเหลือสุทธิ"
            value={formatCurrency(totals.net)}
            sub={hasAny ? (totals.net >= 0 ? "รายรับมากกว่ารายจ่าย" : "รายจ่ายมากกว่ารายรับ") : "รายรับ - รายจ่าย"}
            notes={["ไม่รวม Transfer / Split parent"]}
            icon={<Sparkles size={18} />}
          />
          <GlassKpiCard
            tone="neutral"
            title="จำนวนรายการ"
            value={filtered.length.toLocaleString("th-TH")}
            sub="รายการที่ใช้ในรายงานนี้"
            notes={["ไม่รวม Transfer / Split parent"]}
            icon={<Activity size={18} />}
          />
          <GlassKpiCard
            tone="today"
            title="เฉลี่ยรายจ่ายต่อวัน"
            value={formatCurrency(totals.avgSpendPerDay)}
            sub={`คำนวณจาก ${totals.days.toLocaleString("th-TH")} วัน`}
            notes={["ส่วนลดในใบเสร็จไม่นับเป็นรายจ่าย"]}
            icon={<CalendarDays size={18} />}
          />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <SummaryNote>ไม่รวม Transfer / Split parent เพื่อไม่ให้ยอดเงินย้ายบัญชีถูกนับเป็นรายรับหรือรายจ่าย</SummaryNote>
          <SummaryNote>ส่วนลดในใบเสร็จไม่นับเป็นรายจ่าย จึงช่วยให้ยอดรายจ่ายสุทธิอ่านง่ายขึ้น</SummaryNote>
        </div>
      </section>

      {!hasAny ? (
        <StatsEmptyState onAdd={openManualEntry} onScan={openReceiptScan} />
      ) : (
        <>
          {/* Expenses Breakdown */}
          <div className="ui-card-strong p-5 mb-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="min-w-0">
                <div className="font-semibold text-gray-900 flex items-center gap-2">
                  <span className="w-9 h-9 rounded-2xl glass-chip flex items-center justify-center text-gray-700">
                    <PieIcon size={18} />
                  </span>
                  สัดส่วนค่าใช้จ่าย
                </div>
                <div className="text-xs text-gray-800/60 mt-1">
                  แตะที่หมวดเพื่อดูรายการในหมวดนั้น • ช่วงเวลา: <span className="font-semibold">{periodLabel}</span>
                </div>
              </div>

              {topCategory ? (
                <div className="text-right shrink-0">
                  <div className="text-[11px] text-gray-800/60">หมวดที่ใช้มากสุด</div>
                  <div className="text-sm font-semibold text-gray-900 truncate">
                    {topCategory.icon ? `${topCategory.icon} ` : ""}
                    {topCategory.name} • {topCategory.pct}%
                  </div>
                </div>
              ) : null}
            </div>

            {pieData.length ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div className={isSm ? "h-60 w-full" : "h-64 w-full"}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={isSm ? 56 : 62}
                        outerRadius={isSm ? 88 : 92}
                        paddingAngle={6}
                        dataKey="value"
                        nameKey="name"
                        isAnimationActive={false} // ✅ smoother on mobile
                      >
                        {pieData.map((entry, i) => (
                          <Cell key={entry.id || i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatCurrency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Top list with progress bars (clickable) */}
                <div className="space-y-3">
                  {pieData.map((it) => {
                    const pct = totalExpense ? Math.round((it.value / totalExpense) * 100) : 0;
                    const clickable = it.id && it.id !== "other_agg";

                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => (clickable ? openCategory(it.id) : null)}
                        className={`w-full text-left glass-panel border border-white/20 rounded-2xl p-3 transition-all active:scale-[0.99] ${
                          clickable ? "hover:bg-white/10" : "opacity-95"
                        }`}
                        aria-label={`category ${it.name}`}
                        title={clickable ? "แตะเพื่อดูรายการในหมวดนี้" : it.name}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <CatIcon icon={it.icon} color={it.color} title={it.name} />
                            <div className="min-w-0">
                              <div className="font-semibold text-gray-900 truncate">{it.name}</div>
                              <div className="text-[12px] text-gray-800/60 mt-0.5">
                                {formatCurrency(it.value)} • {pct}%
                              </div>
                            </div>
                          </div>

                          <div
                            className="w-10 h-10 rounded-2xl border border-white/20 shrink-0"
                            style={{ backgroundColor: `${it.color}22` }}
                            title={it.name}
                          />
                        </div>

                        <div className="mt-2 h-2 rounded-full bg-white/30 overflow-hidden">
                          <div
                            className="h-full"
                            style={{
                              width: `${clamp(pct, 0, 100)}%`,
                              backgroundColor: it.color,
                            }}
                          />
                        </div>

                        {clickable ? (
                          <div className="mt-2 text-[11px] text-indigo-700 font-semibold">แตะเพื่อดูรายการในหมวดนี้</div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <StatsEmptyState
                compact
                title="ยังไม่มีรายจ่ายสำหรับกราฟนี้"
                description="ช่วงเวลานี้อาจมีเฉพาะรายรับ หรือยังไม่มีรายการรายจ่ายที่ใช้ทำรายงาน"
                onAdd={openManualEntry}
                onScan={openReceiptScan}
              />
            )}
          </div>

          {/* Trend */}
          <div className="ui-card-strong rounded-3xl p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <div className="font-semibold text-gray-900 flex items-center gap-2">
                  <span className="w-9 h-9 rounded-2xl glass-chip flex items-center justify-center text-gray-700">
                    <BarChart3 size={18} />
                  </span>
                  แนวโน้มรายรับ-จ่าย
                </div>
                <div className="text-xs text-gray-800/60 mt-1">แสดง 12 จุดล่าสุดในช่วงเวลาที่เลือก</div>
              </div>

              <div className="text-right">
                <div className="text-[11px] text-gray-800/60">ช่วงเวลา</div>
                <div className="text-sm font-semibold text-gray-900">{periodLabel}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              <TonePill tone="income">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                รายรับ
              </TonePill>
              <TonePill tone="expense">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                รายจ่าย
              </TonePill>
            </div>

            <div className={isSm ? "h-72 w-full text-xs" : "h-80 w-full text-xs"}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: isSm ? 26 : 16 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickMargin={10} interval={xInterval} angle={isSm ? -25 : 0} textAnchor={isSm ? "end" : "middle"} height={isSm ? 50 : 30} />
                  <YAxis hide />
                  <Tooltip formatter={(v, name) => [formatCurrency(v), name]} />
                  <Bar dataKey="income" name="รายรับ" radius={[6, 6, 0, 0]} fill="#10b981" isAnimationActive={false} />
                  <Bar
                    dataKey="expense"
                    name="รายจ่าย"
                    radius={[6, 6, 0, 0]}
                    fill="#f43f5e"
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Quick insights */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="glass-panel border border-white/20 rounded-2xl p-4">
                <div className="text-[11px] font-semibold text-gray-900/65 tracking-wide uppercase">เฉลี่ยรายจ่ายต่อวัน</div>
                <div className="mt-1 text-xl font-semibold text-gray-900">{formatCurrency(totals.avgSpendPerDay)}</div>
                <div className="text-[11px] text-gray-800/55 mt-1">คำนวณจากจำนวนวันในช่วง {periodLabel}</div>
              </div>

              <div className="glass-panel border border-white/20 rounded-2xl p-4">
                <div className="text-[11px] font-semibold text-gray-900/65 tracking-wide uppercase">หมวดที่ใช้มากสุด</div>
                <div className="mt-1 text-xl font-semibold text-gray-900">
                  {topCategory ? `${topCategory.icon || ""} ${topCategory.name}`.trim() : "—"}
                </div>
                <div className="text-[11px] text-gray-800/55 mt-1">
                  {topCategory ? `${formatCurrency(topCategory.value)} • ${topCategory.pct}%` : "ไม่มีข้อมูล"}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Drill-down modal */}
      {openCat && selectedCat ? (
        <ModalShell
          title={`${selectedCat.icon ? selectedCat.icon + " " : ""}${selectedCat.name} • ${periodLabel}`}
          onClose={() => setOpenCat(false)}
        >
          <div className="glass-panel border border-white/20 rounded-2xl p-4 mb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-gray-900/65 tracking-wide uppercase">รวมทั้งสิ้น</div>
                <div className="mt-1 text-2xl font-semibold text-rose-700">-{formatCurrency(Math.max(0, catTotal))}</div>
                <div className="text-[11px] text-gray-800/55 mt-1">
                  {catTxs.length} รายการ • ไม่รวม Transfer / Split parent • ช่วงเวลา {periodLabel}
                </div>
              </div>
              <div className="shrink-0 w-11 h-11 rounded-2xl glass-chip flex items-center justify-center text-gray-700">
                <ReceiptText size={18} />
              </div>
            </div>
          </div>

          {catTxs.length ? (
            <div className="space-y-3">
              {catTxs.map((tx) => {
                const acc = accountMap.get(tx.accountId);
                return (
                  <TxRow key={tx.id} tx={tx} cat={selectedCat} account={acc || null} />
                );
              })}
            </div>
          ) : (
            <div className="glass-card rounded-3xl border border-dashed glass-divider text-center py-12">
              <div className="w-16 h-16 glass-chip rounded-full flex items-center justify-center mx-auto mb-3 text-gray-500">
                <ReceiptText size={32} />
              </div>
              <p className="text-gray-700 font-semibold">ไม่มีรายการในหมวดนี้</p>
              <p className="text-xs text-gray-700/70 mt-1">ลองเปลี่ยนช่วงเวลา แล้วแตะหมวดอีกครั้ง</p>
            </div>
          )}
        </ModalShell>
      ) : null}
      </main>
    </div>
  );
}
