import { useMemo } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ReceiptText,
  Repeat2,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import {
  detectRecurringCharges,
  getUpcomingBills,
  summarizeBills,
} from "../features/bills/detectBills.js";
import { AmountText, EmptyPanel, MetricCard, ScreenShell, StatusPill } from "../features/app/ui.jsx";
import { formatCurrency, formatDateShort, parseDateSafe, toISODate } from "../utils/format.js";

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function toId(value) {
  return String(value || "").trim();
}

function buildCategoryList(categories) {
  if (Array.isArray(categories)) return categories;
  return [...asList(categories?.expense), ...asList(categories?.income)];
}

function buildLookups({ accounts, categories }) {
  return {
    accountsById: new Map(asList(accounts).map((account) => [toId(account?.id), account])),
    categoriesById: new Map(buildCategoryList(categories).map((category) => [toId(category?.id), category])),
  };
}

function daysBetween(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const start = parseDateSafe(startIso);
  const end = parseDateSafe(endIso);
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return Number.isFinite(diff) ? diff : null;
}

function formatDate(value) {
  const iso = String(value || "").slice(0, 10);
  return iso ? formatDateShort(iso) : "-";
}

function intervalLabel(interval) {
  if (interval === "weekly") return "รายสัปดาห์";
  if (interval === "monthly") return "รายเดือน";
  return "ยังไม่ชัด";
}

function typeLabel(type) {
  if (type === "subscription") return "Subscription";
  if (type === "bill") return "บิล";
  if (type === "income") return "รายรับประจำ";
  return "Recurring";
}

function confidenceLabel(confidence) {
  const pct = Math.round(Math.max(0, Math.min(1, Number(confidence || 0))) * 100);
  return `${pct}%`;
}

function getBillTitle(item) {
  return String(item?.merchant || item?.label || "Recurring").trim();
}

function getMetaLine(item, lookups) {
  const accountName = lookups.accountsById.get(toId(item?.accountId))?.name || "";
  const categoryName = lookups.categoriesById.get(toId(item?.categoryId))?.name || "";
  return [accountName, categoryName].filter(Boolean).join(" · ");
}

function sourcePill(item) {
  if (item?.source === "recurring") return <StatusPill tone="success">ยืนยันแล้ว</StatusPill>;
  if (item?.source === "detected") return <StatusPill tone="warning">ตรวจพบ</StatusPill>;
  return null;
}

function Section({ title, subtitle, children }) {
  return (
    <article className="ui-card finance-panel">
      <div className="finance-panel-head">
        <div>
          <div className="finance-panel-title">{title}</div>
          {subtitle ? <div className="finance-panel-copy">{subtitle}</div> : null}
        </div>
      </div>
      {children}
    </article>
  );
}

function BillRow({ item, lookups, todayIso, confirmDisabled = false }) {
  const dueInDays = daysBetween(todayIso, item?.nextExpectedDate);
  const metaLine = getMetaLine(item, lookups);
  const dueSoon = dueInDays != null && dueInDays >= 0 && dueInDays <= 7;

  return (
    <div className="finance-list-button">
      <div className="finance-row finance-history-row">
        <div className="finance-row-main">
          <span className="finance-category-icon finance-account-icon">
            {item?.type === "subscription" ? <Repeat2 size={16} /> : <ReceiptText size={16} />}
          </span>
          <div className="finance-account-copy finance-history-copy">
            <div className="finance-row-title">{getBillTitle(item)}</div>
            <div className="finance-row-meta finance-row-meta-wrap">
              {typeLabel(item?.type)} · {intervalLabel(item?.interval)} · รอบถัดไป {formatDate(item?.nextExpectedDate)}
            </div>
            {metaLine ? <div className="finance-row-meta finance-row-meta-wrap">{metaLine}</div> : null}
            <div className="finance-chip-grid">
              {sourcePill(item)}
              {dueSoon ? <StatusPill tone="warning">ใกล้ถึงกำหนด</StatusPill> : null}
              {item?.confidence != null ? <StatusPill tone="default">มั่นใจ {confidenceLabel(item.confidence)}</StatusPill> : null}
            </div>
          </div>
        </div>

        <div className="finance-row-side finance-history-side">
          <AmountText value={item?.amount || 0} tone={item?.type === "income" ? "success" : "danger"} />
          {dueInDays != null ? (
            <div className="finance-row-meta finance-history-time">
              {dueInDays < 0 ? "เลยกำหนดแล้ว" : dueInDays === 0 ? "วันนี้" : `อีก ${dueInDays} วัน`}
            </div>
          ) : null}
        </div>
      </div>

      {confirmDisabled ? (
        <div className="finance-inline-actions">
          <button type="button" className="ui-btn ui-btn-secondary" disabled title="จะเพิ่มใน phase ถัดไป">
            ยืนยันเป็น Recurring
          </button>
          <span className="finance-row-meta">จะเพิ่มใน phase ถัดไป</span>
        </div>
      ) : null}
    </div>
  );
}

const SUGGESTION_COPY = {
  "bills-start-tracking": {
    title: "เริ่มเก็บ pattern รายการประจำ",
    body: "เมื่อมีรายการซ้ำมากพอ ระบบจะแยกบิลและ subscription ให้เห็นตรงนี้",
  },
  "bills-due-soon": {
    title: "มีบิลใกล้ถึงกำหนด",
    body: "กันเงินไว้ก่อนวันตัดบัญชี จะช่วยให้ cash flow นิ่งขึ้น",
  },
  "bills-price-change": {
    title: "เช็กยอดที่แพงขึ้น",
    body: "มีรายการประจำที่ยอดล่าสุดสูงกว่าเดิม ลองดูว่ายังจำเป็นอยู่ไหม",
  },
  "bills-review-subscriptions": {
    title: "ทบทวน subscription",
    body: "รายการเล็ก ๆ ที่ตัดทุกเดือนรวมกันแล้วกระทบงบได้",
  },
};

function suggestionTone(severity) {
  if (severity === "warning") return "warning";
  if (severity === "success") return "success";
  return "default";
}

export default function BillsView({
  state,
  accounts,
  categories,
  transactions,
  recurring,
  today = new Date(),
  onOpenRecurring,
}) {
  const todayIso = useMemo(() => toISODate(today), [today]);
  const billState = useMemo(
    () => ({
      transactions: transactions || state?.transactions || [],
      recurring: recurring || state?.recurring || [],
    }),
    [recurring, state?.recurring, state?.transactions, transactions],
  );
  const lookups = useMemo(
    () =>
      buildLookups({
        accounts: accounts || state?.accounts || [],
        categories: categories || state?.categories || {},
      }),
    [accounts, categories, state?.accounts, state?.categories],
  );

  const upcoming = useMemo(
    () => getUpcomingBills(billState, { today: todayIso }).filter((item) => item?.type !== "income"),
    [billState, todayIso],
  );
  const detected = useMemo(
    () => detectRecurringCharges(billState.transactions, { today: todayIso }),
    [billState.transactions, todayIso],
  );
  const detectedSubscriptions = useMemo(
    () => detected.filter((item) => item?.type === "subscription"),
    [detected],
  );
  const summary = useMemo(
    () => summarizeBills(billState, { today: todayIso, dueSoonDays: 7 }),
    [billState, todayIso],
  );
  const recurringMonthlyTotal = Number(summary.monthlyBillsTotal || 0) + Number(summary.monthlySubscriptionTotal || 0);

  return (
    <ScreenShell
      title="บิล & Subscription"
      subtitle="รู้ก่อนเงินออก และหา recurring ที่อาจลืมอยู่"
      headerMode="visible"
      actions={
        onOpenRecurring ? (
          <button type="button" className="ui-btn ui-btn-secondary" onClick={onOpenRecurring}>
            <CalendarClock size={16} />
            Recurring
          </button>
        ) : null
      }
    >
      <section className="finance-grid finance-dashboard-planner-grid" data-testid="bills-summary">
        <MetricCard
          label="รวมรายเดือน"
          value={formatCurrency(recurringMonthlyTotal)}
          hint="บิล + subscription ที่พบ"
          tone={recurringMonthlyTotal ? "warning" : "default"}
        />
        <MetricCard
          label="ใกล้ถึงกำหนด"
          value={`${summary.dueSoon.length}`}
          hint="ภายใน 7 วัน"
          tone={summary.dueSoon.length ? "warning" : "success"}
        />
        <MetricCard
          label="Subscription ที่พบ"
          value={`${detectedSubscriptions.length}`}
          hint="จากรายการย้อนหลัง"
          tone={detectedSubscriptions.length ? "default" : "success"}
        />
        <MetricCard
          label="ยอดเปลี่ยน"
          value={`${summary.priceChanges.length}`}
          hint="รายการที่แพงขึ้น"
          tone={summary.priceChanges.length ? "danger" : "success"}
        />
      </section>

      <Section title="Upcoming bills" subtitle="เรียงตามวันที่คาดว่าจะมีเงินออก">
        {upcoming.length ? (
          <div className="finance-list">
            {upcoming.map((item) => (
              <BillRow key={item.id} item={item} lookups={lookups} todayIso={todayIso} />
            ))}
          </div>
        ) : (
          <EmptyPanel
            title="ยังไม่พบบิลข้างหน้า"
            copy="ตั้ง Recurring หรือบันทึกรายการซ้ำสักพัก ระบบจะช่วยจับรอบให้"
          />
        )}
      </Section>

      <Section title="Detected subscriptions" subtitle="รายการที่ดูเหมือนตัดซ้ำจากข้อมูลที่มี">
        {detectedSubscriptions.length ? (
          <div className="finance-list">
            {detectedSubscriptions.map((item) => (
              <BillRow key={item.id} item={{ ...item, source: "detected" }} lookups={lookups} todayIso={todayIso} confirmDisabled />
            ))}
          </div>
        ) : (
          <EmptyPanel
            title="ยังไม่เจอ subscription ที่ชัดเจน"
            copy="ต้องมีรายการซ้ำอย่างน้อย 2-3 รอบ ระบบถึงจะมั่นใจพอ"
          />
        )}
      </Section>

      <Section title="Price change warnings" subtitle="ยอดล่าสุดที่สูงกว่า pattern เดิม">
        {summary.priceChanges.length ? (
          <div className="finance-list">
            {summary.priceChanges.map((item) => (
              <div key={item.id} className="finance-row">
                <div className="finance-row-main">
                  <span className="finance-category-icon finance-account-icon">
                    <TrendingUp size={16} />
                  </span>
                  <div className="finance-account-copy">
                    <div className="finance-row-title">{getBillTitle(item)}</div>
                    <div className="finance-row-meta finance-row-meta-wrap">
                      จาก {formatCurrency(item.previousAmount)} เป็น {formatCurrency(item.currentAmount)} · รอบถัดไป {formatDate(item.nextExpectedDate)}
                    </div>
                  </div>
                </div>
                <div className="finance-row-side">
                  <StatusPill tone="warning">+{formatCurrency(item.delta)}</StatusPill>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="ui-toast ui-toast--success finance-inline-note">
            <CheckCircle2 size={18} />
            <div className="finance-toast-copy">ยังไม่พบยอด subscription หรือบิลที่เพิ่มขึ้นผิด pattern</div>
          </div>
        )}
      </Section>

      <Section title="Suggestions" subtitle="สิ่งที่ควรเช็กต่อจากรายการประจำ">
        {summary.recommendations.length ? (
          <div className="finance-list">
            {summary.recommendations.map((item) => {
              const copy = SUGGESTION_COPY[item.id] || item;
              return (
                <div key={item.id} className="finance-row">
                  <div className="finance-row-main">
                    <span className="finance-category-icon finance-account-icon">
                      {item.severity === "warning" ? <AlertTriangle size={16} /> : <Sparkles size={16} />}
                    </span>
                    <div className="finance-account-copy">
                      <div className="finance-row-title">{copy.title}</div>
                      <div className="finance-row-meta finance-row-meta-wrap">{copy.body}</div>
                    </div>
                  </div>
                  <div className="finance-row-side">
                    <StatusPill tone={suggestionTone(item.severity)}>{item.severity || "info"}</StatusPill>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyPanel
            title="ยังไม่มีข้อเสนอแนะ"
            copy="เมื่อมีบิลใกล้ถึงกำหนดหรือ subscription เปลี่ยนราคา ระบบจะสรุปให้ตรงนี้"
          />
        )}
      </Section>
    </ScreenShell>
  );
}
