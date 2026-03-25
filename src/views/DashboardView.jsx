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
import { generateInsights } from "../utils/aiInsights";
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
          <div className={strong ? "text-sm font-extrabold" : "text-sm font-extrabold text-slate-950"}>{title}</div>
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
      <div className={`mt-2 text-2xl font-extrabold tracking-[-0.02em] tabular-nums ${toneClass}`}>{value}</div>
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
  const duplicateInboxCount = inboxList.filter(
    (item) => !!item?.duplicate && String(item?.status || "pending").toLowerCase() !== "approved"
  ).length;

  const netWorth = useMemo(() => {
    let total = 0;
    for (const account of accounts) total += calcAccountBalance(accounts, transactions, account.id);
    return total;
  }, [accounts, transactions]);

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

  const insights = useMemo(() => {
    try {
      return generateInsights(transactions, categories, { currentMonth }).slice(0, 2);
    } catch {
      return [];
    }
  }, [categories, currentMonth, transactions]);

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
        title="Dashboard"
        subtitle={`ภาพรวมการเงิน • ${currentMonth}`}
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => openScan("receipt")}
              data-testid="today-open-scan"
              className="flex items-center gap-2 rounded-2xl bg-slate-950 px-3 py-2 text-xs font-extrabold text-white shadow-[0_20px_36px_-24px_rgba(15,23,42,0.72)] active:scale-95"
              type="button"
              aria-label="Open scan"
            >
              <Camera size={15} /> Scan
            </button>
            <button
              onClick={() => navigate("inbox")}
              className="ui-icon-btn text-gray-800 active:scale-95"
              type="button"
              aria-label="Inbox"
            >
              <InboxIcon size={18} />
            </button>
          </div>
        }
      />

      <main className="ui-page pt-4 pb-6 view-flow">
        <section className="ui-card-strong overflow-hidden">
          <div className="relative p-5 md:p-6">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(640px 220px at 0% 0%, rgba(16,185,129,0.20), transparent 56%), radial-gradient(540px 240px at 100% 0%, rgba(15,23,42,0.18), transparent 54%)",
              }}
            />
            <div className="relative">
              <div className="text-[11px] font-semibold tracking-[0.05em] text-slate-500">Dashboard overview</div>
              <div className="mt-2 text-3xl font-extrabold tracking-[-0.02em] text-slate-950">
                สรุปเงินเข้าออก งานค้าง และงบในหน้าเดียว
              </div>
              <div className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-600">
                เช็กภาพรวมวันนี้และเดือนนี้ เปิดงานที่ต้องทำต่อได้ทันที แล้วค่อยลงรายละเอียดในส่วนอื่นของแอพ
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <MetricCard
                  label="Today spend"
                  value={formatCurrency(todaySpent)}
                  hint={dailySummary}
                  tone={dailyOver > 0 ? "alert" : "default"}
                />
                <MetricCard
                  label="Month spend"
                  value={formatCurrency(monthSpent)}
                  hint={budgetSummary}
                  tone={monthlyOver > 0 ? "alert" : "default"}
                />
                <MetricCard
                  label="Balance"
                  value={formatCurrency(Math.abs(netWorth))}
                  hint={netWorth >= 0 ? "สถานะรวมยังเป็นบวก" : "ภาระหนี้มากกว่าสินทรัพย์"}
                  tone={netWorth >= 0 ? "success" : "alert"}
                />
                <MetricCard
                  label="Inbox pending"
                  value={String(pendingInboxCount)}
                  hint={duplicateInboxCount ? `มีรายการซ้ำต้องเช็ก ${duplicateInboxCount}` : "พร้อมตรวจและอนุมัติ"}
                  tone={pendingInboxCount > 0 ? "alert" : "success"}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <ActionButton title="Receipt scan" hint="สแกนใบเสร็จหลายใบแล้วค่อย review" icon={<Camera size={18} />} onClick={() => openScan("receipt")} strong testId="today-action-receipt" />
          <ActionButton title="Slip scan" hint="เปิดเข้า lane สำหรับสลิปโอน/ชำระทันที" icon={<InboxIcon size={18} />} onClick={() => openScan("slip")} testId="today-action-slip" />
          <ActionButton title="Manual entry" hint="กรอก expense หรือ income แบบเร็ว" icon={<Wallet size={18} />} onClick={() => openManual("expense")} testId="today-action-manual" />
          <ActionButton title="Transfer / card" hint="สร้างโอนเงินหรือชำระบัตร" icon={<CreditCard size={18} />} onClick={() => openManual("transfer")} testId="today-action-transfer" />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="ui-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-extrabold text-slate-950">Budget pressure</div>
                <div className="mt-1 text-[12px] font-medium text-slate-600">
                  ดูงบรายวันและรายเดือนจากมุมเดียวก่อนลงไปแก้รายละเอียด
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate("budgets")}
                className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700"
              >
                Budgets <ChevronRight size={14} />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between gap-3 text-[12px] font-medium text-slate-600">
                  <span>Daily budget</span>
                  <span className="tabular-nums">{dailyLimit > 0 ? `${dailyPct}%` : "ยังไม่ตั้ง"}</span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-900/10">
                  <div
                    className={dailyOver > 0 ? "h-full bg-red-600" : "h-full bg-emerald-500"}
                    style={{ width: `${Math.min(100, Math.max(0, dailyPct || 0))}%` }}
                  />
                </div>
                <div className="mt-2 text-[12px] font-medium text-slate-600">{dailySummary}</div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3 text-[12px] font-medium text-slate-600">
                  <span>Monthly budget</span>
                  <span className="tabular-nums">{monthlyLimit > 0 ? `${monthlyPct}%` : "ยังไม่ตั้ง"}</span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-900/10">
                  <div
                    className={monthlyOver > 0 ? "h-full bg-red-600" : "h-full bg-slate-950"}
                    style={{ width: `${Math.min(100, Math.max(0, monthlyPct || 0))}%` }}
                  />
                </div>
                <div className="mt-2 text-[12px] font-medium text-slate-600">{budgetSummary}</div>
              </div>
            </div>
          </div>

          <div className="ui-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-extrabold text-slate-950">Accounts snapshot</div>
                <div className="mt-1 text-[12px] font-medium text-slate-600">
                  สรุปบัญชีหลักที่กระทบยอดรวมมากที่สุดตอนนี้
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate("accounts")}
                className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700"
              >
                Accounts <ChevronRight size={14} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {accountSnapshots.length ? (
                accountSnapshots.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => navigate("accounts")}
                    className="flex w-full items-center justify-between gap-3 rounded-[1.2rem] border border-slate-900/8 bg-white/72 px-3 py-3 text-left active:scale-[0.99]"
                  >
                    <AccountPill account={account} fallbackName={account.name} size="md" />
                    <div className="text-right">
                      <div className="text-sm font-extrabold tabular-nums text-slate-950">{formatCurrency(Math.abs(account.balance || 0))}</div>
                      <div className="text-[11px] font-medium text-slate-600">{account.balance >= 0 ? "ยอดสุทธิ" : "ยอดติดลบ"}</div>
                    </div>
                  </button>
                ))
              ) : (
                <EmptyState
                  icon={<Landmark size={28} />}
                  title="ยังไม่มีบัญชีเพิ่มเติม"
                  description="เริ่มจากเงินสดก่อน แล้วเพิ่มธนาคารไทยหรือบัตรเครดิตจากหน้า Accounts"
                />
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="ui-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-extrabold text-slate-950">Recent activity</div>
                <div className="mt-1 text-[12px] font-medium text-slate-600">
                  ใช้กลุ่มรายการล่าสุดเป็นพื้นที่ review ก่อนแก้ไขหรือแตกยอดต่อ
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate("stats")}
                className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700"
              >
                Analytics <ChevronRight size={14} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {recentItems.length ? (
                recentItems.map((item) => (
                  <TransactionCard
                    key={item.tx.id}
                    tx={item.tx}
                    category={item.category}
                    accountName={item.accountName}
                    onClick={() => store.startEditTransaction(item.tx.id)}
                  />
                ))
              ) : (
                <EmptyState
                  icon={<Camera size={28} />}
                  title="เริ่มบันทึกรายการแรก"
                  description="สแกนใบเสร็จหรือกรอกเองก็ได้ ระบบจะเริ่มจำหมวด ร้านค้า และบัญชีให้ทันที"
                  action={
                    <button type="button" onClick={() => openScan("receipt")} className="ui-btn ui-btn-primary">
                      <Camera size={16} /> เริ่มสแกน
                    </button>
                  }
                />
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="ui-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-extrabold text-slate-950">Inbox workspace</div>
                  <div className="mt-1 text-[12px] font-medium text-slate-600">
                    จุดรวมรายการที่ยังรอ approve, แก้ซ้ำ, หรือเติมข้อมูลก่อนบันทึกจริง
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("inbox")}
                  className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700"
                >
                  Open <ChevronRight size={14} />
                </button>
              </div>

              <div className="mt-4 rounded-[1.4rem] bg-slate-950 p-4 text-white">
                <div className="text-[11px] font-semibold tracking-[0.05em] text-white/60">Pending review</div>
                <div className="mt-2 text-3xl font-extrabold tabular-nums">{pendingInboxCount}</div>
                <div className="mt-2 text-[12px] font-medium text-white/70">
                  {duplicateInboxCount
                    ? `มีรายการซ้ำหรือใกล้เคียง ${duplicateInboxCount} รายการ`
                    : "ถ้าสแกนหลายใบ ระบบจะส่งมาพักไว้ที่นี่อัตโนมัติ"}
                </div>
              </div>
            </div>

            <div className="ui-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-extrabold text-slate-950">
                    <Sparkles size={16} className="text-emerald-600" /> Smart signals
                  </div>
                  <div className="mt-1 text-[12px] font-medium text-slate-600">
                    AI insight ยังอยู่ แต่ขยับลงมาเป็น layer รองเพื่อไม่กลบงานประจำวัน
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("more")}
                  className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700"
                >
                  Hub <ChevronRight size={14} />
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {insights.length ? (
                  insights.map((insight, index) => (
                    <div key={`${insight.type}-${index}`} className="rounded-[1.25rem] border border-slate-900/10 bg-white/80 p-4">
                      <div className="text-sm font-extrabold text-slate-950">{insight.title}</div>
                      <div className="mt-1 text-[12px] font-medium leading-relaxed text-slate-600">{insight.body}</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.25rem] border border-dashed border-slate-900/12 bg-white/60 p-4 text-[12px] font-medium leading-relaxed text-slate-600">
                    เมื่อมีประวัติการใช้งานมากขึ้น ระบบจะช่วยชี้ pattern รายรับรายจ่าย, budget risk และหมวดที่ต้องเฝ้าดูให้จากตรงนี้
                  </div>
                )}
              </div>
            </div>

            <div className="ui-card p-5">
              <div className="flex items-center gap-2 text-sm font-extrabold text-slate-950">
                <Target size={16} className="text-emerald-600" /> What next
              </div>
              <div className="mt-3 space-y-2 text-[12px] font-medium leading-relaxed text-slate-600">
                <div>ถ้าเพิ่งสแกนหลายใบ ให้ไปที่ Inbox เพื่อ approve แบบชุดเดียว</div>
                <div>ถ้าจะเช็กงบหรือ recurring, กด Hub เพื่อเข้าถึง power tools ทั้งหมด</div>
                <div>ถ้าบัญชียังไม่ครบ ให้เพิ่มจาก Accounts แล้วผูกเลขท้ายสลิปเพื่อจับแมตช์อัตโนมัติ</div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
