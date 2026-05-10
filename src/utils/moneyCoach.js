import { isCreditAccount } from "./accountMatch.js";
import { formatCurrency, toISODate } from "./format.js";
import { ensureSatangInt } from "./money.js";
import { accountLedgerBalanceSatang, signedExpenseAmountSatang } from "../domain/ledger/ledgerMath.js";
import {
  isReportableExpenseTransaction,
  isReportableIncomeTransaction,
  isTransferTransaction,
} from "../domain/ledger/transactionTypes.js";

const TOTAL_BUDGET_IDS = new Set(["__TOTAL__", "__MONTHLY__", "__DAILY__", "total", "monthly", "monthly_total"]);
const DAY_MS = 24 * 60 * 60 * 1000;

function clean(value) {
  return String(value ?? "").trim();
}

function cleanLower(value) {
  return clean(value).toLowerCase();
}

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function satang(value) {
  return Math.abs(ensureSatangInt(value, 0));
}

function monthKeyFromDate(date) {
  return clean(date).slice(0, 7);
}

function normalizeToday(todayISO) {
  const raw = clean(todayISO);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return toISODate(new Date());
}

function addMonths(monthKey, offset) {
  const [year, month] = clean(monthKey).split("-").map(Number);
  const date = new Date(year || new Date().getFullYear(), (month || 1) - 1 + Number(offset || 0), 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(monthKey) {
  const [year, month] = clean(monthKey).split("-").map(Number);
  if (!year || !month) return 30;
  return new Date(year, month, 0).getDate();
}

function dayOfMonth(dateISO) {
  const day = Number(clean(dateISO).slice(8, 10));
  return Number.isFinite(day) && day > 0 ? day : 1;
}

function isoToMs(dateISO) {
  const match = clean(dateISO).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function daysBetween(a, b) {
  const ams = isoToMs(a);
  const bms = isoToMs(b);
  if (!Number.isFinite(ams) || !Number.isFinite(bms)) return Infinity;
  return Math.abs(Math.round((bms - ams) / DAY_MS));
}

function categoryIdOf(value) {
  return clean(value?.categoryId ?? value?.category_id ?? value?.category ?? value?.key);
}

function accountIdOf(value) {
  return clean(value?.accountId ?? value?.account_id);
}

function merchantOf(value) {
  return clean(value?.merchant ?? value?.payee ?? value?.counterparty ?? value?.raw?.merchant ?? value?.note);
}

function refOf(value) {
  return clean(value?.ref ?? value?.reference ?? value?.referenceId ?? value?.reference_id ?? value?.raw?.ref ?? value?.raw?.reference);
}

function amountOf(value) {
  return satang(value?.amount ?? value?.amountSatang ?? value?.amount_satang);
}

function dateOf(value) {
  return clean(value?.date).slice(0, 10);
}

function categoryName(category, fallback = "") {
  return clean(category?.name) || fallback || "หมวดนี้";
}

function flattenCategories(categories) {
  if (Array.isArray(categories)) return categories;
  return [...listOf(categories?.expense), ...listOf(categories?.income)];
}

function buildCategoryHelpers(categories) {
  const byId = new Map();
  const childrenByParent = new Map();

  for (const category of flattenCategories(categories)) {
    const id = clean(category?.id ?? category?.category_id);
    if (!id) continue;
    byId.set(id, category);
    const parentId = clean(category?.parentId ?? category?.parent_id);
    if (parentId) {
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
      childrenByParent.get(parentId).push(id);
    }
  }

  const descendantsCache = new Map();
  const descendantIds = (id) => {
    const key = clean(id);
    if (!key) return [];
    if (descendantsCache.has(key)) return descendantsCache.get(key);

    const out = new Set([key]);
    const stack = [...(childrenByParent.get(key) || [])];
    while (stack.length) {
      const childId = stack.pop();
      if (!childId || out.has(childId)) continue;
      out.add(childId);
      stack.push(...(childrenByParent.get(childId) || []));
    }
    const list = Array.from(out);
    descendantsCache.set(key, list);
    return list;
  };

  return { byId, descendantIds };
}

function normalizeBudgetRows(budgets, monthKey) {
  const totalBudgets = [];
  const categoryBudgets = [];
  for (const budget of listOf(budgets)) {
    const budgetMonth = clean(budget?.month ?? budget?.monthKey ?? budget?.month_key).slice(0, 7);
    if (budgetMonth && budgetMonth !== monthKey) continue;

    const limit = satang(budget?.limit ?? budget?.limitSatang ?? budget?.limit_satang ?? budget?.amountSatang);
    if (!limit) continue;

    const categoryId = categoryIdOf(budget);
    const normalized = { categoryId, limitSatang: limit, source: budget };
    if (!categoryId || TOTAL_BUDGET_IDS.has(categoryId)) totalBudgets.push(normalized);
    else categoryBudgets.push(normalized);
  }
  return { totalBudgets, categoryBudgets };
}

function makeInsight(input) {
  return {
    id: clean(input.id),
    severity: ["info", "warning", "danger", "positive"].includes(input.severity) ? input.severity : "info",
    title: clean(input.title),
    message: clean(input.message),
    metric: clean(input.metric),
    actionLabel: clean(input.actionLabel),
    ...(input.actionTarget ? { actionTarget: clean(input.actionTarget) } : {}),
    ...(input.relatedCategoryId ? { relatedCategoryId: clean(input.relatedCategoryId) } : {}),
    ...(input.relatedAccountId ? { relatedAccountId: clean(input.relatedAccountId) } : {}),
    _rank: Number(input.rank || 100),
  };
}

function accountBalanceSatang(account, transactions) {
  const explicit = account?.balanceSatang ?? account?.balance_satang ?? account?.currentBalanceSatang ?? account?.current_balance_satang;
  if (explicit != null && Number.isFinite(Number(explicit))) return ensureSatangInt(explicit, 0);
  return accountLedgerBalanceSatang(account, transactions);
}

function creditLimitSatang(account) {
  return satang(account?.creditLimit ?? account?.credit_limit_satang ?? account?.limit);
}

function nextDueDateFor(account, todayISO) {
  if (!isCreditAccount(account)) return "";
  const dueDay = Math.max(1, Math.min(31, Math.trunc(Number(account?.dueDay ?? account?.due_day ?? 25) || 25)));
  const [year, month] = todayISO.split("-").map(Number);
  const build = (monthOffset) => {
    const date = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
    const maxDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(dueDay, maxDay)).padStart(2, "0")}`;
  };
  const current = build(0);
  return isoToMs(current) >= isoToMs(todayISO) ? current : build(1);
}

function sumMonth(items, monthKey) {
  return items.reduce((sum, item) => (monthKeyFromDate(item.date) === monthKey ? sum + item.amountSatang : sum), 0);
}

function sumCategoryMonth(items, categoryIds, monthKey) {
  const allowed = new Set(categoryIds);
  return items.reduce((sum, item) => {
    if (monthKeyFromDate(item.date) !== monthKey) return sum;
    return allowed.has(item.categoryId) ? sum + item.amountSatang : sum;
  }, 0);
}

function buildExpenseItems(transactions) {
  return listOf(transactions)
    .filter((tx) => isReportableExpenseTransaction(tx))
    .map((tx) => ({
      tx,
      date: dateOf(tx),
      amountSatang: signedExpenseAmountSatang(tx),
      absAmountSatang: amountOf(tx),
      categoryId: categoryIdOf(tx) || "uncategorized",
      merchant: merchantOf(tx),
      ref: refOf(tx),
      accountId: accountIdOf(tx),
    }))
    .filter((item) => item.date && item.absAmountSatang > 0);
}

function buildIncomeItems(transactions) {
  return listOf(transactions)
    .filter((tx) => isReportableIncomeTransaction(tx))
    .map((tx) => ({
      tx,
      date: dateOf(tx),
      amountSatang: amountOf(tx),
      categoryId: categoryIdOf(tx) || "uncategorized",
      merchant: merchantOf(tx),
      ref: refOf(tx),
      accountId: accountIdOf(tx),
    }))
    .filter((item) => item.date && item.amountSatang > 0);
}

function detectDuplicate(transactions, todayISO) {
  const cutoffMs = isoToMs(todayISO) - 45 * DAY_MS;
  const candidates = listOf(transactions)
    .filter((tx) => !isTransferTransaction(tx) && !tx?.isSplitParent && !tx?.is_split_parent)
    .map((tx) => ({
      tx,
      date: dateOf(tx),
      amountSatang: amountOf(tx),
      merchant: merchantOf(tx).toLowerCase(),
      ref: refOf(tx).toLowerCase(),
    }))
    .filter((item) => item.date && item.amountSatang > 0 && isoToMs(item.date) >= cutoffMs)
    .sort((a, b) => isoToMs(a.date) - isoToMs(b.date));

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i];
      const b = candidates[j];
      const gap = daysBetween(a.date, b.date);
      if (gap > 3) break;
      if (a.amountSatang !== b.amountSatang) continue;
      const sameRef = a.ref && b.ref && a.ref === b.ref;
      const sameMerchant = a.merchant && b.merchant && a.merchant === b.merchant;
      if (!sameRef && !sameMerchant) continue;
      return { first: a, second: b, gap };
    }
  }
  return null;
}

function recurringSignal(recurring, expenseItems, currentMonth) {
  const explicit = listOf(recurring).filter((item) => cleanLower(item?.status) !== "inactive" && item?.enabled !== false);
  if (explicit.length) return { count: explicit.length, merchant: "", explicit: true };

  const byMerchant = new Map();
  for (const item of expenseItems) {
    if (!item.merchant) continue;
    const key = item.merchant.toLowerCase();
    if (!byMerchant.has(key)) byMerchant.set(key, []);
    byMerchant.get(key).push(item);
  }

  let best = null;
  for (const [merchant, items] of byMerchant) {
    const months = new Set(items.map((item) => monthKeyFromDate(item.date)));
    if (months.size < 3 && !months.has(currentMonth)) continue;
    const amounts = items.map((item) => item.absAmountSatang).sort((a, b) => a - b);
    const min = amounts[0] || 0;
    const max = amounts[amounts.length - 1] || 0;
    if (min > 0 && max - min <= Math.max(2000, min * 0.1)) {
      best = { count: months.size, merchant, explicit: false };
      break;
    }
  }
  return best;
}

function sortInsights(insights) {
  const severityRank = { danger: 0, warning: 1, positive: 2, info: 3 };
  return insights
    .filter((insight) => insight.id && insight.title && insight.message)
    .sort((a, b) => {
      const severityDiff = severityRank[a.severity] - severityRank[b.severity];
      if (severityDiff) return severityDiff;
      return a._rank - b._rank || a.id.localeCompare(b.id);
    })
    .slice(0, 8)
    .map((insight) => {
      const publicInsight = { ...insight };
      delete publicInsight._rank;
      return publicInsight;
    });
}

export function generateMoneyCoachInsights({
  transactions = [],
  accounts = [],
  categories = {},
  budgets = [],
  recurring = [],
  todayISO = "",
} = {}) {
  const today = normalizeToday(todayISO);
  const currentMonth = monthKeyFromDate(today);
  const previousMonth = addMonths(currentMonth, -1);
  const day = dayOfMonth(today);
  const monthDays = daysInMonth(currentMonth);
  const remainingDays = Math.max(1, monthDays - day + 1);
  const categoryHelpers = buildCategoryHelpers(categories);
  const expenseItems = buildExpenseItems(transactions);
  const incomeItems = buildIncomeItems(transactions);
  const currentExpense = Math.max(0, sumMonth(expenseItems, currentMonth));
  const previousExpense = Math.max(0, sumMonth(expenseItems, previousMonth));
  const currentIncome = sumMonth(incomeItems, currentMonth);
  const { totalBudgets, categoryBudgets } = normalizeBudgetRows(budgets, currentMonth);
  const totalBudget = totalBudgets[0]?.limitSatang || categoryBudgets.reduce((sum, row) => sum + row.limitSatang, 0);
  const insights = [];

  if (totalBudget > 0) {
    const expectedSpend = Math.round((totalBudget * day) / monthDays);
    if (currentExpense > expectedSpend * 1.12) {
      const pct = expectedSpend > 0 ? Math.round((currentExpense / expectedSpend) * 100) : 0;
      insights.push(
        makeInsight({
          id: "monthly_spend_pace",
          severity: currentExpense > expectedSpend * 1.35 ? "danger" : "warning",
          title: "ใช้เงินเร็วกว่าแผน",
          message: `ใช้ไป ${formatCurrency(currentExpense)} แล้ว จาก pace วันนี้ควรอยู่ใกล้ ${formatCurrency(expectedSpend)} ลองชะลอรายการที่เลื่อนได้`,
          metric: `${pct}% ของ pace`,
          actionLabel: "ดูงบ",
          actionTarget: "budgets",
          rank: 10,
        }),
      );
    } else if (currentExpense > 0 && currentExpense < expectedSpend * 0.8) {
      insights.push(
        makeInsight({
          id: "monthly_spend_pace_good",
          severity: "positive",
          title: "คุม pace เดือนนี้ได้ดี",
          message: `ใช้ไป ${formatCurrency(currentExpense)} ต่ำกว่า pace ที่ควรเป็นตอนนี้`,
          metric: `${Math.round((currentExpense / Math.max(1, expectedSpend)) * 100)}% ของ pace`,
          actionLabel: "ดูรายการ",
          actionTarget: "transactions",
          rank: 70,
        }),
      );
    }

    const remainingBudget = totalBudget - currentExpense;
    insights.push(
      makeInsight({
        id: "daily_spend_limit",
        severity: remainingBudget < 0 ? "danger" : remainingBudget / remainingDays < totalBudget / monthDays * 0.5 ? "warning" : "info",
        title: remainingBudget < 0 ? "เดือนนี้เกินงบแล้ว" : "วงเงินใช้ต่อวัน",
        message:
          remainingBudget < 0
            ? `เกินงบไป ${formatCurrency(Math.abs(remainingBudget))} แล้ว ควรตรวจรายการใหญ่และหมวดที่เกิน`
            : `เหลือ ${formatCurrency(remainingBudget)} สำหรับ ${remainingDays} วัน เฉลี่ยใช้ได้วันละ ${formatCurrency(Math.floor(remainingBudget / remainingDays))}`,
        metric: remainingBudget < 0 ? `-${formatCurrency(Math.abs(remainingBudget))}` : `${formatCurrency(Math.floor(remainingBudget / remainingDays))}/วัน`,
        actionLabel: "วางแผนงบ",
        actionTarget: "budgets",
        rank: 25,
      }),
    );
  } else if (previousExpense > 0) {
    const expectedFromHistory = Math.round((previousExpense * day) / monthDays);
    if (currentExpense > expectedFromHistory * 1.2) {
      insights.push(
        makeInsight({
          id: "monthly_spend_pace",
          severity: "warning",
          title: "ใช้เร็วกว่ารอบก่อน",
          message: `เทียบกับเดือนก่อน วันนี้ควรอยู่ใกล้ ${formatCurrency(expectedFromHistory)} แต่ใช้ไป ${formatCurrency(currentExpense)}`,
          metric: `${Math.round((currentExpense / Math.max(1, expectedFromHistory)) * 100)}%`,
          actionLabel: "ตรวจรายการ",
          actionTarget: "transactions",
          rank: 10,
        }),
      );
    }
  }

  const categoryAlerts = categoryBudgets
    .map((budget) => {
      const ids = categoryHelpers.descendantIds(budget.categoryId);
      const actual = Math.max(0, sumCategoryMonth(expenseItems, ids, currentMonth));
      const ratio = budget.limitSatang ? actual / budget.limitSatang : 0;
      return { ...budget, actual, ratio };
    })
    .filter((row) => row.ratio >= 0.85)
    .sort((a, b) => b.ratio - a.ratio);

  if (categoryAlerts.length) {
    const row = categoryAlerts[0];
    const category = categoryHelpers.byId.get(row.categoryId);
    const name = categoryName(category, row.categoryId);
    insights.push(
      makeInsight({
        id: `category_budget_${row.categoryId}`,
        severity: row.ratio >= 1 ? "danger" : "warning",
        title: row.ratio >= 1 ? `${name} เกินงบ` : `${name} ใกล้เต็มงบ`,
        message: `ใช้ไป ${formatCurrency(row.actual)} จากงบ ${formatCurrency(row.limitSatang)} แล้ว`,
        metric: `${Math.round(row.ratio * 100)}%`,
        actionLabel: "ดูงบหมวดนี้",
        actionTarget: "budgets",
        relatedCategoryId: row.categoryId,
        rank: 5,
      }),
    );
  }

  const spikeCandidates = [];
  const categoryIds = new Set(expenseItems.map((item) => item.categoryId));
  for (const categoryId of categoryIds) {
    const current = Math.max(0, sumCategoryMonth(expenseItems, [categoryId], currentMonth));
    const previous = Math.max(0, sumCategoryMonth(expenseItems, [categoryId], previousMonth));
    if (current < 10000 || previous < 5000) continue;
    const increase = current - previous;
    const pct = Math.round((increase / previous) * 100);
    if (pct >= 50 && increase >= 10000) spikeCandidates.push({ categoryId, current, previous, pct });
  }
  spikeCandidates.sort((a, b) => b.pct - a.pct);
  if (spikeCandidates.length) {
    const row = spikeCandidates[0];
    const category = categoryHelpers.byId.get(row.categoryId);
    const name = categoryName(category, row.categoryId);
    insights.push(
      makeInsight({
        id: `spending_spike_${row.categoryId}`,
        severity: row.pct >= 100 ? "danger" : "warning",
        title: `${name} พุ่งขึ้น`,
        message: `เดือนนี้ ${formatCurrency(row.current)} เทียบกับเดือนก่อน ${formatCurrency(row.previous)}`,
        metric: `+${row.pct}%`,
        actionLabel: "ตรวจหมวดนี้",
        actionTarget: "transactions",
        relatedCategoryId: row.categoryId,
        rank: 30,
      }),
    );
  }

  const duplicate = detectDuplicate(transactions, today);
  if (duplicate) {
    const label = duplicate.second.merchant || duplicate.second.ref || "รายการนี้";
    insights.push(
      makeInsight({
        id: "duplicate_possible",
        severity: "warning",
        title: "อาจมีรายการซ้ำ",
        message: `${label} ยอด ${formatCurrency(duplicate.second.amountSatang)} เกิดใกล้กันภายใน ${duplicate.gap || 1} วัน`,
        metric: "ตรวจซ้ำ",
        actionLabel: "ตรวจรายการ",
        actionTarget: "transactions",
        rank: 15,
      }),
    );
  }

  const recurringInfo = recurringSignal(recurring, expenseItems, currentMonth);
  if (recurringInfo) {
    insights.push(
      makeInsight({
        id: "recurring_watch",
        severity: "info",
        title: recurringInfo.explicit ? "มีรายการประจำที่ต้องติดตาม" : "เจอรูปแบบจ่ายซ้ำ",
        message: recurringInfo.explicit
          ? `มีรายการประจำ ${recurringInfo.count} รายการ ตรวจรอบจ่ายเพื่อกันเงินไว้ล่วงหน้า`
          : `${recurringInfo.merchant} คล้ายรายการจ่ายซ้ำ ควรตั้งเป็นรายการประจำ`,
        metric: recurringInfo.explicit ? `${recurringInfo.count} รายการ` : "จ่ายซ้ำ",
        actionLabel: "ดูรายการประจำ",
        actionTarget: "recurring",
        rank: 60,
      }),
    );
  }

  const nonCreditBalance = listOf(accounts)
    .filter((account) => !isCreditAccount(account))
    .reduce((sum, account) => sum + Math.max(0, accountBalanceSatang(account, transactions)), 0);
  const thirtyDaysAgoMs = isoToMs(today) - 29 * DAY_MS;
  const last30Expense = expenseItems.reduce((sum, item) => (isoToMs(item.date) >= thirtyDaysAgoMs ? sum + Math.max(0, item.amountSatang) : sum), 0);
  const averageDailyExpense = Math.round((last30Expense || currentExpense) / Math.max(1, last30Expense ? 30 : day));
  if (averageDailyExpense > 0 && nonCreditBalance > 0) {
    const runwayDays = Math.floor(nonCreditBalance / averageDailyExpense);
    if (runwayDays < 14 || runwayDays >= 90) {
      insights.push(
        makeInsight({
          id: "cash_runway",
          severity: runwayDays < 14 ? "danger" : "positive",
          title: runwayDays < 14 ? "เงินสดพอใช้ไม่นาน" : "เงินสดสำรองแข็งแรง",
          message: `จากรายจ่ายเฉลี่ย ${formatCurrency(averageDailyExpense)}/วัน เงินสดที่มีรองรับได้ประมาณ ${runwayDays} วัน`,
          metric: `${runwayDays} วัน`,
          actionLabel: "ดูบัญชี",
          actionTarget: "accounts",
          rank: runwayDays < 14 ? 20 : 80,
        }),
      );
    }
  }

  if (currentIncome > 0) {
    const savingsRate = Math.round(((currentIncome - currentExpense) / currentIncome) * 100);
    if (savingsRate >= 20 || savingsRate < 10) {
      insights.push(
        makeInsight({
          id: "savings_rate",
          severity: savingsRate >= 20 ? "positive" : savingsRate < 0 ? "danger" : "warning",
          title: savingsRate >= 20 ? "อัตราออมเดือนนี้ดี" : "อัตราออมยังบาง",
          message:
            savingsRate >= 20
              ? `รายรับ ${formatCurrency(currentIncome)} หลังหักรายจ่ายยังเหลือประมาณ ${savingsRate}%`
              : `รายรับ ${formatCurrency(currentIncome)} เทียบรายจ่าย ${formatCurrency(currentExpense)} เหลือออมประมาณ ${savingsRate}%`,
          metric: `${savingsRate}%`,
          actionLabel: savingsRate >= 20 ? "รักษาแผนนี้" : "ลดรายจ่าย",
          actionTarget: savingsRate >= 20 ? "planner" : "budgets",
          rank: 55,
        }),
      );
    }
  }

  const creditRows = listOf(accounts)
    .filter((account) => isCreditAccount(account))
    .map((account) => {
      const balance = Math.max(0, accountBalanceSatang(account, transactions));
      const limit = creditLimitSatang(account);
      const dueDate = nextDueDateFor(account, today);
      return {
        account,
        balance,
        limit,
        dueDate,
        dueInDays: dueDate ? daysBetween(today, dueDate) : Infinity,
        utilization: limit > 0 ? balance / limit : 0,
      };
    })
    .filter((row) => row.balance > 0)
    .sort((a, b) => a.dueInDays - b.dueInDays || b.balance - a.balance);
  if (creditRows.length) {
    const row = creditRows[0];
    if (row.dueInDays <= 7 || row.utilization >= 0.7) {
      const name = clean(row.account?.name) || "บัตรเครดิต";
      insights.push(
        makeInsight({
          id: "credit_payment_warning",
          severity: row.dueInDays <= 3 || row.utilization >= 0.9 ? "danger" : "warning",
          title: "ติดตามยอดบัตรเครดิต",
          message:
            row.dueInDays <= 7
              ? `${name} มียอด ${formatCurrency(row.balance)} ใกล้ถึงกำหนดชำระใน ${row.dueInDays} วัน`
              : `${name} ใช้วงเงินไป ${Math.round(row.utilization * 100)}% แล้ว`,
          metric: row.dueInDays <= 7 ? `${row.dueInDays} วัน` : `${Math.round(row.utilization * 100)}%`,
          actionLabel: "ดูบัญชี",
          actionTarget: "accounts",
          relatedAccountId: clean(row.account?.id),
          rank: 12,
        }),
      );
    }
  }

  if (!insights.length && (expenseItems.length || incomeItems.length)) {
    insights.push(
      makeInsight({
        id: "coach_baseline",
        severity: "positive",
        title: "ยังไม่เจอสัญญาณเสี่ยงใหญ่",
        message: "รายการล่าสุดยังดูปกติ โค้ชจะจับตา pace งบ รายการซ้ำ และเงินสดสำรองให้ต่อเนื่อง",
        metric: "ปกติ",
        actionLabel: "ดูรายการ",
        actionTarget: "transactions",
        rank: 90,
      }),
    );
  }

  return sortInsights(insights);
}

export default {
  generateMoneyCoachInsights,
};
