import { useMemo } from "react";
import {
  Camera,
  ChevronRight,
  CreditCard,
  Inbox as InboxIcon,
  Landmark,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react";
import TransactionCard from "../components/TransactionCard";
import AppHeader from "../components/AppHeader";
import EmptyState from "../components/EmptyState";
import AccountPill from "../components/AccountPill.jsx";
import { useAppStore } from "../store/store.jsx";
import { getBudget, toMonthKey, calcAccountBalance } from "../store/selectors.js";
import { formatCurrency, toISODate } from "../utils/format";
// generateInsights removed — no longer used in minimal dashboard
import {
  compareTxNewestFirst,
  daysInMonthKey,
  isTransferLike,
  sumCategoryBudgetsForMonth,
  sumExpenseForDate,
  sumExpenseForMonth,
} from "../utils/transaction";

const BUDGET_TOTAL_ID = "__TOTAL__";
const BUDGET_DAILY_ID = "__DAILY__";

function ActionButton({ title, hint, icon, onClick, strong = false, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={[
        "rounded-[1.6rem] border p-4 text-left transition-all active:scale-[0.985]",
        strong
          ? "bg-slate-950 text-white border-slate-950 shadow-[0_26px_60px_-36px_rgba(15,23,42,0.75)]"
          : "bg-white/80 text-slate-950 border-slate-900/10 hover:bg-white",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={strong ? "text-sm font-semibold" : "text-sm font-semibold text-slate-950"}>{title}</div>
          <div className={strong ? "mt-1 text-[12px] font-semibold text-white/70" : "mt-1 text-[12px] font-semibold text-slate-600"}>
            {hint}
          </div>
        </div>
        <div className={strong ? "text-white" : "text-slate-950"}>{icon}</div>
      </div>
    </button>
  );
}

function MetricCard({ label, value, hint, tone = "default" }) {
  const toneClass =
    tone === "alert"
      ? "text-red-700"
      : tone === "success"
      ? "text-emerald-700"
      : "text-slate-950";

  return (
    <div className="ui-card p-4">
      <div className="text-[11px] font-semibold tracking-[0.04em] text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tracking-[-0.02em] tabular-nums ${toneClass}`}>{value}</div>
      <div className="mt-1 text-[12px] font-medium text-slate-600">{hint}</div>
    </div>
  );
}

export default function DashboardView() {
  const store = useAppStore();
  const { state, navigate } = store;

  const todayISO = toISODate(new Date());
  const currentMonth = toMonthKey(todayISO);
  const accounts = useMemo(() => (Array.isArray(state.accounts) ? state.accounts : []), [state.accounts]);
  const transactions = useMemo(() => (Array.isArray(state.transactions) ? state.transactions : []), [state.transactions]);
  const categories = useMemo(
    () => (state.categories && typeof state.categories === "object" ? state.categories : { expense: [], income: [] }),
    [state.categories]
  );

  const todaySpent = useMemo(() => sumExpenseForDate(transactions, todayISO), [transactions, todayISO]);
  const monthSpent = useMemo(() => sumExpenseForMonth(transactions, currentMonth), [transactions, currentMonth]);

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

  const monthlyLimit =
    (Number(monthlyBudgetCustom?.limit || 0) > 0 ? Number(monthlyBudgetCustom.limit) : perCatMonthlyLimit) || 0;
  const derivedDailyLimit = monthlyLimit > 0 ? Math.round(monthlyLimit / daysInMonthKey(currentMonth)) : 0;
  const dailyLimit =
    (Number(dailyBudgetCustom?.limit || 0) > 0 ? Number(dailyBudgetCustom.limit) : derivedDailyLimit) || 0;

  const dailyPct = dailyLimit > 0 ? Math.round((todaySpent / dailyLimit) * 100) : 0;
  const monthlyPct = monthlyLimit > 0 ? Math.round((monthSpent / monthlyLimit) * 100) : 0;
  const dailyOver = dailyLimit > 0 ? Math.max(0, todaySpent - dailyLimit) : 0;
  const monthlyOver = monthlyLimit > 0 ? Math.max(0, monthSpent - monthlyLimit) : 0;

  const inboxList = Array.isArray(state?.inbox) ? state.inbox : [];
  const pendingInboxCount = inboxList.filter((item) => String(item?.status || "pending").toLowerCase() !== "approved").length;

  const allCategories = useMemo(() => {
    const all = [...(categories.expense || []), ...(categories.income || [])];
    return new Map(all.map((category) => [String(category.id), category]));
  }, [categories]);

  const recentItems = useMemo(() => {
    const accountMap = new Map(accounts.map((account) => [String(account.id), account]));
    const seenTransfers = new Set();
    const seenSplitGroups = new Set();

    return [...transactions]
      .sort(compareTxNewestFirst)
      .filter((tx) => {
        if (tx?.isSplitChild) return false;
        const transferId = String(tx?.transferId || "").trim();
        if (isTransferLike(tx)) {
          if (transferId) {
            if (seenTransfers.has(transferId)) return false;
            seenTransfers.add(transferId);
          } else if (tx?.type === "income") {
            return false;
          }
        }

        const splitGroupId = String(tx?.splitGroupId || "").trim();
        if (splitGroupId) {
          if (seenSplitGroups.has(splitGroupId)) return false;
          seenSplitGroups.add(splitGroupId);
          if (!tx?.isSplitParent) return false;
        }
        return true;
      })
      .slice(0, 8)
      .map((tx) => ({
        tx,
        category: allCategories.get(String(tx?.category || "")) || null,
        accountName: accountMap.get(String(tx?.accountId || ""))?.name || "—",
      }));
  }, [accounts, allCategories, transactions]);

  const accountSnapshots = useMemo(() => {
    return accounts
      .map((account) => ({
        ...account,
        balance: calcAccountBalance(accounts, transactions, account.id),
      }))
      .sort((a, b) => Math.abs(Number(b.balance || 0)) - Math.abs(Number(a.balance || 0)))
      .slice(0, 4);
  }, [accounts, transactions]);


  const budgetSummary =
    monthlyLimit > 0
      ? monthlyOver > 0
        ? `เกินงบเดือน ${formatCurrency(monthlyOver)}`
        : `เหลืองบเดือน ${formatCurrency(Math.max(0, monthlyLimit - monthSpent))}`
      : "ยังไม่ได้ตั้งงบรวมเดือนนี้";

  const dailySummary =
    dailyLimit > 0
      ? dailyOver > 0
        ? `วันนี้เกินงบ ${formatCurrency(dailyOver)}`
        : `วันนี้เหลืองบ ${formatCurrency(Math.max(0, dailyLimit - todaySpent))}`
      : "ยังไม่ได้ตั้งงบรายวัน";

  const openScan = (kind = "receipt") => {
    try {
      sessionStorage.setItem("add.entryMode.force", "scan");
      sessionStorage.setItem("add.scanUploadKind.force", kind);
    } catch {
      // ignore
    }
    store.startNewTransaction();
  };

  const openManual = (txType = "expense") => {
    try {
      sessionStorage.setItem("add.entryMode.force", "manual");
      sessionStorage.setItem("add.txType.force", txType);
    } catch {
      // ignore
    }
    store.startNewTransaction();
  };

  return (
    <div className="min-h-dvh">
      <AppHeader
        title="หน้าหลัก"
        subtitle={currentMonth}
      />

      <main className="ui-page pt-4 pb-6 view-flow">
        {/* ── Spending Summary ── */}
        <section className="ui-card p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[13px] font-medium text-slate-500">วันนี้ใช้ไป</div>
              <div className={`mt-1 text-xl font-semibold tabular-nums ${dailyOver > 0 ? "text-red-600" : "text-slate-900"}`} style={{ fontFamily: "'Inter', sans-serif" }}>
                {formatCurrency(todaySpent)}
              </div>
              {dailyLimit > 0 ? (
                <>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={dailyOver > 0 ? "h-full bg-red-500" : "h-full bg-teal-500"}
                      style={{ width: `${Math.min(100, Math.max(0, dailyPct || 0))}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[12px] text-slate-500">{dailySummary}</div>
                </>
              ) : null}
            </div>
            <div>
              <div className="text-[13px] font-medium text-slate-500">เดือนนี้ใช้ไป</div>
              <div className={`mt-1 text-xl font-semibold tabular-nums ${monthlyOver > 0 ? "text-red-600" : "text-slate-900"}`} style={{ fontFamily: "'Inter', sans-serif" }}>
                {formatCurrency(monthSpent)}
              </div>
              {monthlyLimit > 0 ? (
                <>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={monthlyOver > 0 ? "h-full bg-red-500" : "h-full bg-teal-500"}
                      style={{ width: `${Math.min(100, Math.max(0, monthlyPct || 0))}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[12px] text-slate-500">{budgetSummary}</div>
                </>
              ) : null}
            </div>
          </div>
        </section>

        {/* ── Quick Actions ── */}
        <section className="grid grid-cols-4 gap-3">
          {[
            { icon: <Camera size={20} />, label: "สแกน", onClick: () => openScan("receipt"), testId: "today-action-receipt" },
            { icon: <Wallet size={20} />, label: "กรอกเอง", onClick: () => openManual("expense"), testId: "today-action-manual" },
            { icon: <CreditCard size={20} />, label: "โอน", onClick: () => openManual("transfer"), testId: "today-action-transfer" },
            { icon: <InboxIcon size={20} />, label: `Inbox${pendingInboxCount ? ` (${pendingInboxCount})` : ""}`, onClick: () => navigate("inbox"), testId: "today-action-inbox" },
          ].map((action) => (
            <button
              key={action.testId}
              type="button"
              onClick={action.onClick}
              data-testid={action.testId}
              className="flex flex-col items-center gap-1.5 rounded-xl py-3 text-slate-600 transition-colors hover:bg-slate-100 active:scale-95"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-50 text-teal-600">
                {action.icon}
              </div>
              <span className="text-[12px] font-medium">{action.label}</span>
            </button>
          ))}
        </section>

        {/* ── Recent Activity ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-slate-900">รายการล่าสุด</h2>
            <button type="button" onClick={() => navigate("stats")} className="text-[13px] font-medium text-teal-600 flex items-center gap-0.5">
              ดูทั้งหมด <ChevronRight size={14} />
            </button>
          </div>
          {recentItems.length ? (
            <div className="ui-card overflow-hidden divide-y divide-slate-100">
              {recentItems.map((item) => (
                <TransactionCard
                  key={item.tx.id}
                  tx={item.tx}
                  category={item.category}
                  accountName={item.accountName}
                  onClick={() => store.startEditTransaction(item.tx.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Camera size={28} />}
              title="เริ่มบันทึกรายการแรก"
              description="สแกนใบเสร็จหรือกรอกเองก็ได้"
              action={
                <button type="button" onClick={() => openScan("receipt")} className="ui-btn ui-btn-primary">
                  <Camera size={16} /> เริ่มสแกน
                </button>
              }
            />
          )}
        </section>

        {/* ── Accounts ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-slate-900">บัญชี</h2>
            <button type="button" onClick={() => navigate("accounts")} className="text-[13px] font-medium text-teal-600 flex items-center gap-0.5">
              ดูทั้งหมด <ChevronRight size={14} />
            </button>
          </div>
          {accountSnapshots.length ? (
            <div className="ui-card overflow-hidden divide-y divide-slate-100">
              {accountSnapshots.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => navigate("accounts")}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100"
                >
                  <AccountPill account={account} fallbackName={account.name} size="md" />
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums text-slate-900" style={{ fontFamily: "'Inter', sans-serif" }}>{formatCurrency(Math.abs(account.balance || 0))}</div>
                    <div className="text-[11px] text-slate-500">{account.balance >= 0 ? "ยอดสุทธิ" : "ยอดติดลบ"}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Landmark size={28} />}
              title="ยังไม่มีบัญชี"
              description="เพิ่มธนาคารหรือบัตรเครดิตจากหน้าบัญชี"
            />
          )}
        </section>
      </main>
    </div>
  );
}
