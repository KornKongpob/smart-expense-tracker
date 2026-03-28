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
import AccountPill from "../components/AccountPill.jsx";
import { useAppStore } from "../store/store.jsx";
import { getBudget, toMonthKey, calcAccountBalance } from "../store/selectors.js";
import { formatCurrency, toISODate } from "../utils/format";
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

function DashboardAction({ title, hint, icon, onClick, primary = false, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={["dashboard-action", primary ? "dashboard-action--primary" : ""].join(" ")}
    >
      <span className="dashboard-action-icon">{icon}</span>
      <div className="dashboard-action-title">{title}</div>
      <div className="dashboard-action-copy">{hint}</div>
    </button>
  );
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
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
      .slice(0, 6)
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
      : "ยังไม่ได้ตั้งงบรวมของเดือนนี้";

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
        subtitle={`ภาพรวม ${currentMonth}`}
        right={
          <button
            type="button"
            onClick={() => navigate(monthlyLimit > 0 ? "budgets" : "inbox")}
            className="ui-chip"
          >
            {monthlyLimit > 0 ? `${formatCurrency(monthlyLimit)} / เดือน` : pendingInboxCount ? `Inbox ${pendingInboxCount}` : "พร้อมใช้งาน"}
          </button>
        }
      />

      <main className="ui-page pt-4 pb-8 view-flow">
        <section className="dashboard-hero">
          <div className="dashboard-hero-grid">
            <div>
              <div className="dashboard-kicker">Daily Control</div>
              <h2 className="dashboard-hero-heading">เช็กยอดหลักของวันนี้และเดือนนี้ได้ทันที</h2>
              <p className="dashboard-hero-copy">
                เปิดสแกนบิล จัดการ Inbox และติดตามงบจากหน้าหลักเดียว เพื่อให้การบันทึกรายจ่ายต่อเนื่องขึ้นทุกวัน
              </p>

              <div className="dashboard-hero-badges">
                <button type="button" onClick={() => navigate("budgets")} className="dashboard-hero-badge">
                  <Target size={14} />
                  {monthlyLimit > 0 ? `งบเดือน ${formatCurrency(monthlyLimit)}` : "ตั้งงบรายเดือน"}
                </button>
                <button type="button" onClick={() => navigate("inbox")} className="dashboard-hero-badge">
                  <InboxIcon size={14} />
                  {pendingInboxCount ? `Inbox ${pendingInboxCount} รายการ` : "Inbox ว่าง"}
                </button>
                <span className="dashboard-hero-badge">
                  <Sparkles size={14} />
                  {recentItems.length ? `${recentItems.length} รายการล่าสุด` : "พร้อมเริ่มบันทึกครั้งแรก"}
                </span>
              </div>
            </div>

            <div className="dashboard-stat-grid">
              <div className="dashboard-stat">
                <div className="dashboard-stat-label">วันนี้ใช้ไป</div>
                <div className="dashboard-stat-value">{formatCurrency(todaySpent)}</div>
                {dailyLimit > 0 ? (
                  <div className={["dashboard-progress", dailyOver > 0 ? "dashboard-progress--alert" : ""].join(" ")}>
                    <span style={{ width: `${clampPercent(dailyPct)}%` }} />
                  </div>
                ) : null}
                <div className="dashboard-stat-hint">{dailySummary}</div>
              </div>

              <div className="dashboard-stat">
                <div className="dashboard-stat-label">เดือนนี้ใช้ไป</div>
                <div className="dashboard-stat-value">{formatCurrency(monthSpent)}</div>
                {monthlyLimit > 0 ? (
                  <div className={["dashboard-progress", monthlyOver > 0 ? "dashboard-progress--alert" : ""].join(" ")}>
                    <span style={{ width: `${clampPercent(monthlyPct)}%` }} />
                  </div>
                ) : null}
                <div className="dashboard-stat-hint">{budgetSummary}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="dashboard-action-grid">
          <DashboardAction
            title="สแกนใบเสร็จ"
            hint="เพิ่มรายการจากภาพทันที แล้วตรวจต่อใน Inbox ได้เลย"
            icon={<Camera size={20} />}
            onClick={() => openScan("receipt")}
            primary
            testId="today-action-receipt"
          />
          <DashboardAction
            title="กรอกเอง"
            hint="บันทึกรายรับหรือรายจ่ายแบบเร็ว"
            icon={<Wallet size={20} />}
            onClick={() => openManual("expense")}
            testId="today-action-manual"
          />
          <DashboardAction
            title="โอนเงิน"
            hint="ย้ายยอดระหว่างบัญชีอย่างเป็นระเบียบ"
            icon={<CreditCard size={20} />}
            onClick={() => openManual("transfer")}
            testId="today-action-transfer"
          />
          <DashboardAction
            title="Inbox"
            hint={pendingInboxCount ? `รอตรวจ ${pendingInboxCount} รายการ` : "ไม่มีรายการค้างตรวจ"}
            icon={<InboxIcon size={20} />}
            onClick={() => navigate("inbox")}
            testId="today-action-inbox"
          />
        </section>

        <section className="dashboard-section-shell">
          <div className="view-section-head">
            <div>
              <h2 className="view-section-title">รายการล่าสุด</h2>
              <p className="view-section-copy">ตรวจรายการที่เพิ่งบันทึก แล้วแตะเพื่อแก้ไขต่อได้ทันที</p>
            </div>
            <button type="button" onClick={() => navigate("stats")} className="text-[13px] font-semibold text-[color:var(--accent-ink)] flex items-center gap-1">
              ดูทั้งหมด
              <ChevronRight size={14} />
            </button>
          </div>

          {recentItems.length ? (
            <div className="space-y-3">
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
            <div className="dashboard-empty">
              <div className="flex items-start gap-3">
                <span className="dashboard-action-icon shrink-0">
                  <Camera size={18} />
                </span>
                <div>
                  <div className="text-base font-semibold text-[color:var(--text)]">เริ่มบันทึกรายการแรกของคุณ</div>
                  <div className="mt-1 text-sm leading-6 text-[color:var(--muted)]">
                    ถ้ามีสลิปหรือใบเสร็จให้เริ่มจากการสแกน หากไม่มีเอกสารก็กรอกเองได้ทันที
                  </div>
                </div>
              </div>

              <div className="dashboard-empty-actions">
                <button type="button" onClick={() => openScan("receipt")} className="ui-btn ui-btn-primary">
                  <Camera size={16} />
                  เริ่มสแกน
                </button>
                <button type="button" onClick={() => openManual("expense")} className="ui-btn ui-btn-secondary">
                  <Wallet size={16} />
                  กรอกเอง
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="dashboard-section-shell">
          <div className="view-section-head">
            <div>
              <h2 className="view-section-title">บัญชี</h2>
              <p className="view-section-copy">เช็กยอดคงเหลือของบัญชีหลัก แล้วไปต่อที่หน้าบัญชีเมื่อพร้อม</p>
            </div>
            <button type="button" onClick={() => navigate("accounts")} className="text-[13px] font-semibold text-[color:var(--accent-ink)] flex items-center gap-1">
              ดูทั้งหมด
              <ChevronRight size={14} />
            </button>
          </div>

          {accountSnapshots.length ? (
            <div>
              {accountSnapshots.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => navigate("accounts")}
                  className="dashboard-account-row w-full"
                >
                  <AccountPill account={account} fallbackName={account.name} size="md" />
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums text-[color:var(--text)]" style={{ fontFamily: "'Inter', sans-serif" }}>
                      {formatCurrency(Math.abs(account.balance || 0))}
                    </div>
                    <div className="text-[11px] font-medium text-[color:var(--muted)]">{account.balance >= 0 ? "ยอดสุทธิ" : "ยอดติดลบ"}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="dashboard-empty">
              <div className="flex items-start gap-3">
                <span className="dashboard-action-icon shrink-0">
                  <Landmark size={18} />
                </span>
                <div>
                  <div className="text-base font-semibold text-[color:var(--text)]">ยังไม่มีบัญชีเพิ่มเติม</div>
                  <div className="mt-1 text-sm leading-6 text-[color:var(--muted)]">
                    บัญชีเงินสดเริ่มต้นพร้อมใช้งานแล้ว และคุณสามารถเพิ่มธนาคารหรือบัตรเครดิตทีหลังได้จากหน้า บัญชี
                  </div>
                </div>
              </div>

              <div className="dashboard-empty-actions">
                <button type="button" onClick={() => navigate("accounts")} className="ui-btn ui-btn-secondary">
                  <Landmark size={16} />
                  ไปที่หน้าบัญชี
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
