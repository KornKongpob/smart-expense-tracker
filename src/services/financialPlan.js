import { DEFAULT_CATEGORIES } from "../constants/categories.js";
import { accountLedgerBalanceSatang, signedExpenseAmountSatang } from "../domain/ledger/ledgerMath.js";
import {
  isReportableExpenseTransaction,
  isReportableIncomeTransaction,
} from "../domain/ledger/transactionTypes.js";
import { isCreditAccount } from "../utils/accountMatch.js";
import { planCreditCardPayments } from "../utils/debtPlan.js";
import { ensureSatangInt } from "../utils/money.js";

export const FINANCIAL_PLAN_DISCLAIMER = "เป็นคำแนะนำทั่วไป ไม่ใช่คำแนะนำการเงินส่วนบุคคลจากผู้เชี่ยวชาญ";
export const FINANCIAL_PLAN_FALLBACK_MESSAGE =
  "ตอนนี้ยังไม่สามารถสร้างแผนด้วย AI ได้ จะแสดงแผนพื้นฐานจากข้อมูลที่มีแทน";

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value, maxLength = 140) {
  let text = "";
  for (const char of String(value ?? "")) {
    const code = char.charCodeAt(0);
    text += (code >= 0 && code <= 31) || code === 127 ? " " : char;
  }
  return text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function clampSatang(value, fallback = 0, { allowNegative = true } = {}) {
  const amount = ensureSatangInt(value, fallback);
  if (!allowNegative && amount < 0) return 0;
  return Math.max(-1_000_000_000_000, Math.min(1_000_000_000_000, amount));
}

function readSatang(source, keys, fallback = 0, options) {
  for (const key of keys) {
    if (source && Object.prototype.hasOwnProperty.call(source, key)) {
      return clampSatang(source[key], fallback, options);
    }
  }
  return fallback;
}

function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeMonthKey(value, fallback = currentMonthKey()) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})-(\d{2})/);
  if (!match) return fallback;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return fallback;
  return `${match[1]}-${match[2]}`;
}

function normalizeIsoDate(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function normalizeStrategy(value) {
  const raw = String(value || "avalanche").toLowerCase().trim().replace(/\s+/g, "_");
  if (raw === "snowball") return "snowball";
  if (raw === "due_date" || raw === "duedate") return "due_date";
  return "avalanche";
}

function transactionDate(tx) {
  return String(tx?.date || tx?.transactionDate || tx?.transaction_date || tx?.created_at || tx?.createdAt || "").slice(0, 10);
}

function transactionMonth(tx) {
  return normalizeMonthKey(transactionDate(tx), "");
}

function txCategoryId(tx) {
  return cleanText(tx?.categoryId ?? tx?.category_id ?? tx?.category ?? "", 80);
}

function txAmountSatang(tx) {
  return Math.abs(readSatang(tx, ["amount", "amountSatang", "amount_satang"], 0, { allowNegative: false }));
}

function filterMonthTransactions(transactions, month) {
  return listOf(transactions).filter((tx) => transactionMonth(tx) === month);
}

function categoryNameMap(categories) {
  const source = categories && typeof categories === "object" ? categories : DEFAULT_CATEGORIES;
  const rows = [...listOf(source.expense), ...listOf(source.income)];
  const out = new Map();
  for (const category of rows) {
    const id = cleanText(category?.id ?? category?.category_id, 80);
    if (!id) continue;
    out.set(id, cleanText(category?.name || id, 120));
  }
  return out;
}

function buildTopCategorySpend(transactions, categories, fallbackTopCategories) {
  const fallbackRows = listOf(fallbackTopCategories)
    .map((row) => {
      const categoryId = cleanText(row?.categoryId ?? row?.category_id ?? row?.id ?? row?.key, 80);
      const name = cleanText(row?.name ?? row?.label ?? row?.category_name ?? categoryId, 120);
      const amount = readSatang(row, ["amount", "amountSatang", "amount_satang", "expense_satang", "spent_satang"], 0, {
        allowNegative: false,
      });
      if (!categoryId && !amount) return null;
      return { categoryId, name: name || categoryId || "Category", amount };
    })
    .filter(Boolean);
  if (fallbackRows.length) return fallbackRows.slice(0, 8);

  const names = categoryNameMap(categories);
  const byCategory = new Map();
  for (const tx of transactions) {
    if (!isReportableExpenseTransaction(tx)) continue;
    const categoryId = txCategoryId(tx) || "uncategorized";
    const amount = Math.max(0, signedExpenseAmountSatang(tx));
    if (!amount) continue;
    byCategory.set(categoryId, (byCategory.get(categoryId) || 0) + amount);
  }

  return [...byCategory.entries()]
    .map(([categoryId, amount]) => ({
      categoryId,
      name: names.get(categoryId) || categoryId,
      amount,
    }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 8);
}

function balanceSnapshotMap(state) {
  const rows = listOf(state?.accountBalanceSnapshot ?? state?.accountBalances ?? state?.accountBalanceRows);
  const out = new Map();
  for (const row of rows) {
    const id = String(row?.id ?? row?.accountId ?? row?.account_id ?? "").trim();
    if (!id) continue;
    out.set(id, readSatang(row, ["balance_satang", "balanceSatang", "balance", "current_balance_satang"], 0));
  }
  return out;
}

function accountId(account) {
  return String(account?.id ?? account?.accountId ?? account?.account_id ?? "").trim();
}

function accountName(account) {
  return cleanText(account?.name ?? account?.institution_label ?? account?.label ?? "Account", 120);
}

function accountType(account) {
  return cleanText(account?.type ?? account?.kind ?? "", 40);
}

function accountCreditLimit(account) {
  return readSatang(account, ["creditLimit", "credit_limit_satang", "creditLimitSatang"], 0, { allowNegative: false });
}

function accountStatementDay(account) {
  const day = Number(account?.statementDay ?? account?.statement_day);
  return Number.isFinite(day) ? Math.max(1, Math.min(31, Math.trunc(day))) : 1;
}

function accountDueDay(account) {
  const day = Number(account?.dueDay ?? account?.due_day ?? account?.paymentDueDay);
  return Number.isFinite(day) ? Math.max(1, Math.min(31, Math.trunc(day))) : 25;
}

function accountBalance(account, transactions, snapshotBalances) {
  const id = accountId(account);
  if (id && snapshotBalances.has(id)) return snapshotBalances.get(id);

  const explicit = readSatang(
    account,
    ["balance_satang", "balanceSatang", "current_balance_satang", "currentBalanceSatang"],
    NaN,
  );
  if (Number.isFinite(explicit)) return explicit;

  return accountLedgerBalanceSatang(account, transactions);
}

function normalizeAccountForPlanner(account, balance) {
  const isCredit = isCreditAccount(account);
  const positiveBalance = isCredit ? Math.abs(balance) : balance;
  return {
    ...account,
    id: accountId(account),
    name: accountName(account),
    type: accountType(account) || (isCredit ? "credit" : "cash"),
    openingBalance: positiveBalance,
    opening_balance_satang: positiveBalance,
    creditLimit: accountCreditLimit(account),
    credit_limit_satang: accountCreditLimit(account),
    statementDay: accountStatementDay(account),
    statement_day: accountStatementDay(account),
    dueDay: accountDueDay(account),
    due_day: accountDueDay(account),
  };
}

function buildAccountsSummary(accounts, transactions, snapshotAccounts, snapshotBalances) {
  const snapshotRows = listOf(snapshotAccounts);
  if (snapshotRows.length) {
    return snapshotRows
      .map((row) => {
        const type = accountType(row);
        const balance = readSatang(row, ["balance", "balance_satang", "balanceSatang"], 0);
        const isCredit = type === "credit";
        return {
          id: String(row?.id ?? row?.account_id ?? "").trim(),
          name: accountName(row),
          type,
          balance: isCredit ? Math.abs(balance) : balance,
          creditLimit: accountCreditLimit(row),
        };
      })
      .filter((account) => account.id || account.name)
      .slice(0, 20);
  }

  return listOf(accounts)
    .map((account) => {
      const balance = accountBalance(account, transactions, snapshotBalances);
      const isCredit = isCreditAccount(account);
      return {
        id: accountId(account),
        name: accountName(account),
        type: accountType(account),
        balance: isCredit ? Math.abs(balance) : balance,
        creditLimit: accountCreditLimit(account),
      };
    })
    .filter((account) => account.id || account.name)
    .slice(0, 20);
}

function cashAvailableFromAccounts(accountsSummary) {
  return listOf(accountsSummary).reduce((sum, account) => {
    const type = String(account?.type || "").toLowerCase().trim();
    if (type === "credit" || type === "loan" || type === "liability") return sum;
    return sum + Math.max(0, clampSatang(account?.balance, 0));
  }, 0);
}

function statementMonth(statement) {
  return (
    normalizeMonthKey(statement?.month ?? statement?.monthKey ?? statement?.month_key, "") ||
    normalizeMonthKey(statement?.statementDate ?? statement?.statement_date, "") ||
    normalizeMonthKey(statement?.dueDate ?? statement?.due_date, "")
  );
}

function normalizeCreditStatements(statements, month) {
  return listOf(statements)
    .map((statement) => {
      const accountIdValue = String(statement?.accountId ?? statement?.account_id ?? "").trim();
      const statementMonthKey = statementMonth(statement) || month;
      if (!accountIdValue || statementMonthKey !== month) return null;
      return {
        accountId: accountIdValue,
        month: statementMonthKey,
        statementBalance: readSatang(
          statement,
          ["statementBalance", "statementBalanceSatang", "statement_balance_satang", "balanceSatang", "balance_satang", "balance"],
          0,
          { allowNegative: false },
        ),
        minimumDue: readSatang(
          statement,
          ["minimumDue", "minimumDueSatang", "minimum_due_satang", "minimumPayment", "minimumPaymentSatang"],
          0,
          { allowNegative: false },
        ),
        statementDate: normalizeIsoDate(statement?.statementDate ?? statement?.statement_date),
        dueDate: normalizeIsoDate(statement?.dueDate ?? statement?.due_date),
        apr: readApr(statement),
      };
    })
    .filter(Boolean)
    .slice(0, 12);
}

function readApr(source) {
  const bps = Number(source?.aprBps ?? source?.apr_bps);
  if (Number.isFinite(bps) && bps > 0) return bps / 100;
  const apr = Number(source?.apr ?? source?.aprPct ?? source?.aprPercent ?? source?.apr_percent);
  return Number.isFinite(apr) ? Math.max(0, apr) : 0;
}

function statementForAccount(statements, accountIdValue) {
  return listOf(statements).find((statement) => String(statement?.accountId || "") === accountIdValue) || null;
}

function buildCreditCards(accounts, transactions, creditStatements, snapshotBalances) {
  return listOf(accounts)
    .filter((account) => isCreditAccount(account))
    .map((account) => {
      const id = accountId(account);
      const currentBalance = Math.abs(accountBalance(account, transactions, snapshotBalances));
      const statement = statementForAccount(creditStatements, id);
      return {
        accountId: id,
        name: accountName(account),
        balance: currentBalance,
        statementBalance: clampSatang(statement?.statementBalance, 0, { allowNegative: false }),
        minimumDue: clampSatang(statement?.minimumDue, 0, { allowNegative: false }),
        statementDate: statement?.statementDate || "",
        dueDate: statement?.dueDate || "",
        apr: statement?.apr || readApr(account),
      };
    })
    .slice(0, 12);
}

function normalizeBudgetRows(budgets, month, categorySpendTop, categories) {
  const names = categoryNameMap(categories);
  const spentByCategory = new Map(categorySpendTop.map((category) => [category.categoryId, category.amount]));

  return listOf(budgets)
    .map((budget) => {
      const budgetMonth = normalizeMonthKey(budget?.month ?? budget?.monthKey ?? budget?.month_key, "");
      if (budgetMonth && budgetMonth !== month) return null;

      const categoryId = cleanText(budget?.categoryId ?? budget?.category_id, 80);
      if (!categoryId || categoryId === "__DAILY__") return null;

      const limit = readSatang(budget, ["limit", "limitSatang", "limit_satang"], 0, { allowNegative: false });
      const spent = spentByCategory.get(categoryId) || 0;
      return {
        categoryId,
        name: cleanText(budget?.name || names.get(categoryId) || categoryId, 120),
        limit,
        spent,
        remaining: limit - spent,
      };
    })
    .filter(Boolean)
    .slice(0, 24);
}

function summarizeDebtPlan(plan, strategy) {
  const source = plan && typeof plan === "object" ? plan : {};
  const totals = source.totals && typeof source.totals === "object" ? source.totals : {};
  return {
    strategy,
    totals: {
      totalMinimum: clampSatang(totals.totalMinimum, 0, { allowNegative: false }),
      totalRecommended: clampSatang(totals.totalRecommended, 0, { allowNegative: false }),
      cashAfterPayments: clampSatang(totals.cashAfterPayments, 0),
    },
    cards: listOf(source.cards)
      .map((card) => ({
        accountId: cleanText(card?.accountId ?? card?.account_id, 80),
        name: cleanText(card?.name || "Credit card", 120),
        balance: clampSatang(card?.balance, 0, { allowNegative: false }),
        statementBalance: clampSatang(card?.statementBalance, 0, { allowNegative: false }),
        minimumDue: clampSatang(card?.minimumDue, 0, { allowNegative: false }),
        dueDate: normalizeIsoDate(card?.dueDate),
        statementDate: normalizeIsoDate(card?.statementDate),
        apr: Number.isFinite(Number(card?.apr)) ? Math.max(0, Number(card.apr)) : 0,
        recommendedPayment: clampSatang(card?.recommendedPayment, 0, { allowNegative: false }),
        extraPayment: clampSatang(card?.extraPayment, 0, { allowNegative: false }),
        reason: cleanText(card?.reason, 180),
        warnings: listOf(card?.warnings).map((warning) => cleanText(warning, 120)).filter(Boolean).slice(0, 6),
      }))
      .filter((card) => card.accountId || card.name)
      .slice(0, 12),
    warnings: listOf(source.warnings).map((warning) => cleanText(warning, 120)).filter(Boolean).slice(0, 12),
  };
}

function totalsFromTransactions(transactions) {
  let income = 0;
  let expense = 0;
  for (const tx of transactions) {
    if (isReportableIncomeTransaction(tx)) income += txAmountSatang(tx);
    else if (isReportableExpenseTransaction(tx)) expense += Math.max(0, signedExpenseAmountSatang(tx));
  }
  return { income, expense };
}

export function buildFinancialSnapshot(state, opts = {}) {
  const source = state && typeof state === "object" ? state : {};
  const month = normalizeMonthKey(opts.month ?? source.selectedMonth ?? source.month);
  const allTransactions = listOf(source.transactions ?? source.planningTransactions ?? source.recentTransactions);
  const monthTransactions = filterMonthTransactions(allTransactions, month);
  const snapshot = source.dashboardSnapshot && typeof source.dashboardSnapshot === "object" ? source.dashboardSnapshot : {};
  const totals = totalsFromTransactions(monthTransactions);
  const categories = source.categories || DEFAULT_CATEGORIES;
  const accounts = listOf(source.accounts);
  const snapshotBalances = balanceSnapshotMap(source);
  const hasSnapshotBalances = snapshotBalances.size > 0;
  const accountsSummary = buildAccountsSummary(accounts, allTransactions, snapshot.accounts, snapshotBalances);
  const cashAvailable =
    opts.cashAvailable != null
      ? clampSatang(opts.cashAvailable, 0)
      : snapshot.cash_available_satang != null
        ? clampSatang(snapshot.cash_available_satang, 0)
        : cashAvailableFromAccounts(accountsSummary);
  const categorySpendTop = buildTopCategorySpend(monthTransactions, categories, snapshot.top_categories);
  const creditStatements = normalizeCreditStatements(source.creditStatements, month);
  const creditCards = buildCreditCards(accounts, hasSnapshotBalances ? [] : allTransactions, creditStatements, snapshotBalances);
  const budgetRows = normalizeBudgetRows(source.budgets ?? source.budgetRows, month, categorySpendTop, categories);
  const strategy = normalizeStrategy(opts.strategy ?? source.debtStrategy ?? source.planningConfig?.debt_strategy_mode);
  const availableCashToPay = opts.availableCashToPay ?? opts.debtCashAvailable ?? cashAvailable;
  const minimumCashBuffer = opts.minimumCashBuffer ?? opts.minimumCashBufferSatang ?? 0;
  const plannerAccounts = accounts.map((account) =>
    normalizeAccountForPlanner(account, accountBalance(account, hasSnapshotBalances ? [] : allTransactions, snapshotBalances)),
  );
  const providedDebtPlan = opts.deterministicDebtPlan ?? source.deterministicDebtPlan;
  const deterministicDebtPlan = summarizeDebtPlan(
    providedDebtPlan ||
      planCreditCardPayments({
        accounts: plannerAccounts,
        transactions: hasSnapshotBalances ? [] : allTransactions,
        creditStatements,
        month,
        availableCashToPay,
        minimumCashBuffer,
        strategy,
      }),
    strategy,
  );

  return {
    month,
    incomeTotal:
      opts.incomeTotal != null
        ? clampSatang(opts.incomeTotal, 0, { allowNegative: false })
        : clampSatang(snapshot.income_satang ?? totals.income, 0, { allowNegative: false }),
    expenseTotal:
      opts.expenseTotal != null
        ? clampSatang(opts.expenseTotal, 0, { allowNegative: false })
        : clampSatang(snapshot.expense_satang ?? totals.expense, 0, { allowNegative: false }),
    categorySpendTop,
    cashAvailable,
    accountsSummary,
    creditCards,
    creditStatements,
    budgets: budgetRows,
    deterministicDebtPlan,
  };
}

function normalizePlanResponse(value, snapshot) {
  const source = value && typeof value === "object" ? value : {};
  if (!source.summary || !source.cashflowPlan || !source.savingsPlan || !source.debtPlan) {
    return buildFinancialPlanFallback(snapshot);
  }

  const summaryText = cleanText(source.summary, 800);
  return {
    summary: summaryText.includes(FINANCIAL_PLAN_DISCLAIMER)
      ? summaryText
      : `${FINANCIAL_PLAN_DISCLAIMER} ${summaryText}`,
    cashflowPlan: source.cashflowPlan,
    savingsPlan: source.savingsPlan,
    debtPlan: source.debtPlan,
    warnings: listOf(source.warnings).map((warning) => cleanText(warning, 220)).filter(Boolean),
    nextActions: listOf(source.nextActions).map((action) => cleanText(action, 220)).filter(Boolean),
  };
}

export function buildFinancialPlanFallback(snapshot = {}, reason = "") {
  const incomeTotal = clampSatang(snapshot?.incomeTotal, 0, { allowNegative: false });
  const expenseTotal = clampSatang(snapshot?.expenseTotal, 0, { allowNegative: false });
  const cashAvailable = clampSatang(snapshot?.cashAvailable, 0);
  const monthlyNet = incomeTotal - expenseTotal;
  const debtPlan = snapshot?.deterministicDebtPlan && typeof snapshot.deterministicDebtPlan === "object"
    ? snapshot.deterministicDebtPlan
    : {};
  const cards = listOf(debtPlan.cards).map((card) => ({
    accountId: cleanText(card?.accountId, 80),
    name: cleanText(card?.name || "Credit card", 120),
    recommendedPayment: clampSatang(card?.recommendedPayment, 0, { allowNegative: false }),
    reason: cleanText(card?.reason || "ใช้แผนคำนวณขั้นต่ำจากข้อมูลที่มี", 180),
  }));
  const totalRecommendedPayment =
    clampSatang(debtPlan?.totals?.totalRecommended, 0, { allowNegative: false }) ||
    cards.reduce((sum, card) => sum + clampSatang(card.recommendedPayment, 0, { allowNegative: false }), 0);

  return {
    summary: `${FINANCIAL_PLAN_DISCLAIMER} ${FINANCIAL_PLAN_FALLBACK_MESSAGE}`,
    cashflowPlan: {
      status: monthlyNet >= 0 ? "stable" : "tight",
      monthlyNet,
      cashAvailable,
      recommendedExpenseLimit: Math.max(0, incomeTotal - totalRecommendedPayment),
      notes: ["ใช้ข้อมูลรวมรายเดือนที่ส่งจากเครื่องผู้ใช้ โดยไม่ส่งรายการธุรกรรมดิบ"],
    },
    savingsPlan: {
      emergencyFundAction:
        monthlyNet > 0
          ? "กันส่วนเกินไว้เป็นเงินสำรองฉุกเฉินก่อนเพิ่มรายจ่ายใหม่"
          : "ชะลอเป้าหมายออมใหม่และลดรายจ่ายผันแปรเพื่อให้กระแสเงินสดกลับมาเป็นบวก",
      recommendedSavings: Math.max(0, Math.min(monthlyNet, Math.floor(Math.max(0, cashAvailable) * 0.1))),
      notes: ["เน้นสภาพคล่องและเงินสำรองฉุกเฉิน ไม่แนะนำการลงทุนเสี่ยง"],
    },
    debtPlan: {
      strategy: cleanText(debtPlan.strategy || "deterministic", 60),
      totalRecommendedPayment,
      cards,
      notes: ["จ่ายขั้นต่ำให้ครบก่อน แล้วค่อยใช้เงินส่วนเกินตามลำดับแผนหนี้"],
    },
    warnings: [
      reason ? cleanText(reason, 180) : "",
      ...listOf(debtPlan.warnings).map((warning) => cleanText(warning, 120)),
    ].filter(Boolean),
    nextActions: [
      "ตรวจสอบยอด statement และ minimum due ของบัตรเครดิต",
      "อัปเดตเงินสดที่พร้อมจ่ายหนี้ก่อนตัดสินใจชำระ",
      "ลองสร้างแผน AI ใหม่เมื่อ API พร้อมใช้งาน",
    ],
  };
}

async function readJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function requestFinancialPlan(snapshot, opts = {}) {
  const defaultEndpoint = process.env.NEXT_PUBLIC_FINANCIAL_PLAN_API_URL || "/api/financial-plan";
  const endpoint = cleanText(opts.endpoint || defaultEndpoint || "/api/financial-plan", 300);
  const timeoutMs = Number(opts.timeoutMs || 45_000);
  const returnMeta = opts.returnMeta === true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers && typeof opts.headers === "object" ? opts.headers : {}),
      },
      body: JSON.stringify({ snapshot }),
      signal: controller.signal,
    });
    const json = await readJsonSafely(response);
    const plan = json?.plan || json?.data || json;

    if (!response.ok || json?.ok === false) {
      const code = json?.message || json?.code || "financial_plan_failed";
      const fallback = buildFinancialPlanFallback(snapshot, code);
      return returnMeta
        ? { ok: false, source: "fallback", error: code, plan: fallback }
        : fallback;
    }

    const normalized = normalizePlanResponse(plan, snapshot);
    return returnMeta ? { ok: true, source: "openai", error: "", plan: normalized } : normalized;
  } catch (error) {
    const code = error?.name === "AbortError" ? "financial_plan_timeout" : "financial_plan_network_error";
    const fallback = buildFinancialPlanFallback(snapshot, code);
    return returnMeta
      ? { ok: false, source: "fallback", error: code, plan: fallback }
      : fallback;
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  buildFinancialSnapshot,
  requestFinancialPlan,
  buildFinancialPlanFallback,
  FINANCIAL_PLAN_DISCLAIMER,
  FINANCIAL_PLAN_FALLBACK_MESSAGE,
};
