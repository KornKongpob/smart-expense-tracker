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
  X,
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
import { formatCurrency, formatDateShort } from "../utils/format";
import { useAppStore } from "../store/store.jsx";
import { parseDateSafe } from "../store/selectors.js";
import AppHeader from "../components/AppHeader";
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
  const t = tx && typeof tx === "object" ? tx : {};
  if (String(t?.type || "").toLowerCase().trim() !== "expense") return 0;
  const amt = safeNumber(t?._amt ?? t?.amount);
  const eff = String(t?.adjustmentEffect || "").toLowerCase().trim();
  return eff === "subtract" ? -amt : amt;
}

function isSplitParentTx(tx) {
  const t = tx && typeof tx === "object" ? tx : {};
  return !!t?.isSplitParent;
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
  const updated = Number(tx?.updatedAt);
  const created = Number(tx?.createdAt);
  if (Number.isFinite(updated) && updated > 0) return updated;
  if (Number.isFinite(created) && created > 0) return created;

  const t = Number(tx?._time);
  return Number.isFinite(t) ? t : 0;
}

function GlassKpiCard({ icon, title, value, sub, tone = "neutral" }) {
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
          <div className="text-[11px] font-extrabold text-gray-900/65 tracking-wide uppercase">{title}</div>
        </div>
        <div className={`shrink-0 w-11 h-11 rounded-2xl border flex items-center justify-center ${toneCls}`}>
          {icon}
        </div>
      </div>

      <div className="mt-2">
        <div
          className="text-[clamp(20px,6.5vw,26px)] leading-tight font-black text-gray-900 tabular-nums whitespace-nowrap overflow-x-auto no-scrollbar"
          role="text"
          aria-label={String(title || "").trim() ? `${title}: ${value}` : String(value)}
          title={String(value)}
        >
          {value}
        </div>
        {sub ? <div className="mt-1 text-[11px] font-bold text-gray-800/60 leading-snug">{sub}</div> : null}
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
      className={"inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[12px] font-extrabold " + cls}
    >
      {children}
    </span>
  );
}

function SummaryMetaCard({ rangeText, countText, discountSaved }) {
  return (
    <div className="ui-card-strong p-4 mb-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TonePill tone="net">
              <CalendarDays size={14} />
              {rangeText}
            </TonePill>
            <TonePill tone="neutral">{countText}</TonePill>
          </div>
          <div className="mt-2 text-[12px] font-bold text-gray-800/65 leading-snug">
            {discountSaved ? (
              <>
                ส่วนลดที่พบในบิล (ไม่นับเป็นค่าใช้จ่ายตามหมวด):
                <span className="ml-1 tabular-nums">{formatCurrency(discountSaved)}</span>
              </>
            ) : (
              "ข้อมูลสรุปตามรายการที่บันทึกไว้ (ไม่นับ Transfer / Split parent)"
            )}
          </div>
        </div>

        <div className="shrink-0 w-10 h-10 rounded-2xl bg-indigo-600/10 border border-indigo-600/15 flex items-center justify-center">
          <Info size={18} className="text-indigo-700" />
        </div>
      </div>
    </div>
  );
}

function StatsEmptyState() {
  return (
    <div className="ui-card text-center py-12">
      <Activity size={48} className="mx-auto mb-3 opacity-25 text-gray-600" />
      <p className="font-extrabold text-gray-800">ไม่มีข้อมูลในช่วงเวลานี้</p>
      <p className="text-sm text-gray-800/60 mt-1">ลองเปลี่ยนช่วงเวลา หรือเพิ่มรายการก่อน</p>
    </div>
  );
}

function ModalShell({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-md glass-card rounded-t-3xl sm:rounded-3xl p-5 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold text-gray-900 truncate">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full glass-icon-btn text-gray-700 flex items-center justify-center"
            aria-label="close"
          >
            <X size={18} />
          </button>
        </div>
        {children}
        <div className="h-3 pb-safe" />
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
  const dateText = tx?._iso ? formatDateShort(tx._iso) : formatDateShort(tx?.date);

  return (
    <div className="glass-panel border border-white/20 rounded-2xl p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-gray-800/60 flex flex-wrap items-center gap-2">
            <span className="font-extrabold">{dateText}</span>
            <span className="text-gray-900/25 font-black">•</span>
            <AccountPill account={account} fallbackName={account?.name} size="sm" showHint={false} />
          </div>

          <div className="mt-1 font-extrabold text-gray-900 truncate">
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
              <div className={`text-sm font-extrabold ${isDiscount ? "text-emerald-700" : "text-rose-700"}`}>
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
  const { state } = useAppStore();
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

  // ✅ Today's expense (global KPI)
  const todayExpense = useMemo(() => {
    let sum = 0;
    for (const t of normalizedTxs) {
      if (t?.isTransfer) continue;
      if (isSplitParentTx(t)) continue;
      if (t?._iso !== todayIso) continue;
      sum += signedExpenseAmount(t);
    }
    return Math.max(0, sum);
  }, [normalizedTxs, todayIso]);

  // Filter by selected period (still excludes Transfer)
  const filtered = useMemo(() => {
    const out = [];
    for (const t of normalizedTxs) {
      if (t?.isTransfer) continue;
      if (isSplitParentTx(t)) continue;

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
      if (t.type === "income") {
        income += t._amt;
        continue;
      }

      if (t.type === "expense") {
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
      if (t.type !== "expense") continue;
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

      if (t.type === "income") prev.income += t._amt;
      else if (t.type === "expense") prev.expense += signedExpenseAmount(t);

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
      .filter((t) => t.type === "expense" && t.category === selectedCatId)
      .slice()
      .sort((a, b) => getTxOrderKey(b) - getTxOrderKey(a));
    return txs;
  }, [filtered, selectedCatId]);

  const catTotal = useMemo(() => catTxs.reduce((s, t) => s + signedExpenseAmount(t), 0), [catTxs]);

  const openCategory = (catId) => {
    setSelectedCatId(catId);
    setOpenCat(true);
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

      <main className="ui-page pt-4 pb-10">

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
            className={`flex-1 py-2.5 text-xs font-extrabold rounded-xl transition-all ${
              period === p.id ? "bg-gray-900/90 text-white shadow-sm" : "text-gray-700 hover:bg-white/10"
            }`}
            type="button"
          >
            {p.label}
          </button>
        ))}
      </div>

      <SummaryMetaCard rangeText={rangeText} countText={countText} discountSaved={totals.discountSaved} />

      {/* KPI cards (mobile-first: full-width so long numbers don't get cut) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <GlassKpiCard
          tone="income"
          title="รายรับรวม"
          value={formatCurrency(totals.income)}
          sub={hasAny ? `ในช่วง ${periodLabel}` : ""}
          icon={<TrendingUp size={18} />}
        />
        <GlassKpiCard
          tone="expense"
          title="รายจ่ายรวม"
          value={formatCurrency(totals.expense)}
          sub={
            hasAny
              ? `เฉลี่ย/วัน ≈ ${formatCurrency(totals.avgSpendPerDay)}${totals.discountSaved ? ` • ส่วนลด ${formatCurrency(totals.discountSaved)}` : ""}`
              : ""
          }
          icon={<TrendingDown size={18} />}
        />
        <GlassKpiCard
          tone="net"
          title="ยอดสุทธิ"
          value={formatCurrency(totals.net)}
          sub={hasAny ? (totals.net >= 0 ? "กำไรสุทธิ" : "ขาดดุลสุทธิ") : ""}
          icon={<Sparkles size={18} />}
        />
        <GlassKpiCard
          tone="today"
          title="ค่าใช้จ่ายวันนี้"
          value={formatCurrency(todayExpense)}
          sub="Expense สุทธิ (หักส่วนลด) • ไม่นับ Transfer / Split parent"
          icon={<CalendarDays size={18} />}
        />
      </div>

      {!hasAny ? (
        <StatsEmptyState />
      ) : (
        <>
          {/* Expenses Breakdown */}
          <div className="ui-card-strong p-5 mb-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="min-w-0">
                <div className="font-extrabold text-gray-900 flex items-center gap-2">
                  <span className="w-9 h-9 rounded-2xl glass-chip flex items-center justify-center text-gray-700">
                    <PieIcon size={18} />
                  </span>
                  สัดส่วนค่าใช้จ่าย
                </div>
                <div className="text-xs text-gray-800/60 mt-1">
                  แตะที่หมวดเพื่อดูรายการในหมวดนั้น • ช่วงเวลา: <span className="font-extrabold">{periodLabel}</span>
                </div>
              </div>

              {topCategory ? (
                <div className="text-right shrink-0">
                  <div className="text-[11px] text-gray-800/60">หมวดที่ใช้มากสุด</div>
                  <div className="text-sm font-extrabold text-gray-900 truncate">
                    {topCategory.icon ? `${topCategory.icon} ` : ""}
                    {topCategory.name} • {topCategory.pct}%
                  </div>
                </div>
              ) : null}
            </div>

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
                            <div className="font-extrabold text-gray-900 truncate">{it.name}</div>
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
                        <div className="mt-2 text-[11px] text-indigo-700 font-extrabold">แตะเพื่อดูรายการในหมวดนี้</div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Trend */}
          <div className="ui-card-strong rounded-3xl p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <div className="font-extrabold text-gray-900 flex items-center gap-2">
                  <span className="w-9 h-9 rounded-2xl glass-chip flex items-center justify-center text-gray-700">
                    <BarChart3 size={18} />
                  </span>
                  แนวโน้มรายรับ-จ่าย
                </div>
                <div className="text-xs text-gray-800/60 mt-1">แสดง 12 จุดล่าสุดในช่วงเวลาที่เลือก</div>
              </div>

              <div className="text-right">
                <div className="text-[11px] text-gray-800/60">ช่วงเวลา</div>
                <div className="text-sm font-extrabold text-gray-900">{periodLabel}</div>
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
                <div className="text-[11px] font-extrabold text-gray-900/65 tracking-wide uppercase">เฉลี่ยรายจ่ายต่อวัน</div>
                <div className="mt-1 text-xl font-extrabold text-gray-900">{formatCurrency(totals.avgSpendPerDay)}</div>
                <div className="text-[11px] text-gray-800/55 mt-1">คำนวณจากจำนวนวันในช่วง {periodLabel}</div>
              </div>

              <div className="glass-panel border border-white/20 rounded-2xl p-4">
                <div className="text-[11px] font-extrabold text-gray-900/65 tracking-wide uppercase">หมวดที่ใช้มากสุด</div>
                <div className="mt-1 text-xl font-extrabold text-gray-900">
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
                <div className="text-[11px] font-extrabold text-gray-900/65 tracking-wide uppercase">รวมทั้งสิ้น</div>
                <div className="mt-1 text-2xl font-extrabold text-rose-700">-{formatCurrency(Math.max(0, catTotal))}</div>
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
              <p className="text-gray-700 font-extrabold">ไม่มีรายการในหมวดนี้</p>
              <p className="text-xs text-gray-700/70 mt-1">ลองเปลี่ยนช่วงเวลา แล้วแตะหมวดอีกครั้ง</p>
            </div>
          )}
        </ModalShell>
      ) : null}
      </main>
    </div>
  );
}