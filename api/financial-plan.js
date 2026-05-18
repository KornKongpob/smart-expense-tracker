import { enforceAccess, setSecurityHeaders } from "../lib/scan/access.js";
import { normalizeOpenAIModel, OPENAI_SCAN_DEFAULT_MODEL } from "../lib/scan/openaiModel.js";
import { parseJsonBody } from "../lib/scan/requestParse.js";
import { createRateLimiter } from "../lib/scan/rateLimit.js";
import { extractResponsesOutputText, findFirstParsedObject } from "../lib/scan/resultHelpers.js";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const DISCLAIMER = "เป็นคำแนะนำทั่วไป ไม่ใช่คำแนะนำการเงินส่วนบุคคลจากผู้เชี่ยวชาญ";
const FALLBACK_MESSAGE = "ตอนนี้ยังไม่สามารถสร้างแผนด้วย AI ได้ จะแสดงแผนพื้นฐานจากข้อมูลที่มีแทน";

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback;
}

const MAX_JSON_BODY_BYTES = positiveInt(process.env.FINANCIAL_PLAN_MAX_JSON_BODY_BYTES, 96 * 1024);
const OPENAI_TIMEOUT_MS = positiveInt(process.env.FINANCIAL_PLAN_OPENAI_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS, 45_000);
const RATE_LIMIT_PER_MINUTE = positiveInt(process.env.FINANCIAL_PLAN_RATE_LIMIT_PER_MINUTE, 20);

const enforceRateLimit = createRateLimiter({
  keyPrefix: "financial-plan",
  limit: RATE_LIMIT_PER_MINUTE,
  windowMs: 60_000,
});

export const config = { api: { bodyParser: false } };

const PLAN_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "cashflowPlan", "savingsPlan", "debtPlan", "warnings", "nextActions"],
  properties: {
    summary: { type: "string" },
    cashflowPlan: {
      type: "object",
      additionalProperties: false,
      required: ["status", "monthlyNet", "cashAvailable", "recommendedExpenseLimit", "notes"],
      properties: {
        status: { type: "string" },
        monthlyNet: { type: "number" },
        cashAvailable: { type: "number" },
        recommendedExpenseLimit: { type: "number" },
        notes: { type: "array", items: { type: "string" } },
      },
    },
    savingsPlan: {
      type: "object",
      additionalProperties: false,
      required: ["emergencyFundAction", "recommendedSavings", "notes"],
      properties: {
        emergencyFundAction: { type: "string" },
        recommendedSavings: { type: "number" },
        notes: { type: "array", items: { type: "string" } },
      },
    },
    debtPlan: {
      type: "object",
      additionalProperties: false,
      required: ["strategy", "totalRecommendedPayment", "cards", "notes"],
      properties: {
        strategy: { type: "string" },
        totalRecommendedPayment: { type: "number" },
        cards: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["accountId", "name", "recommendedPayment", "reason"],
            properties: {
              accountId: { type: "string" },
              name: { type: "string" },
              recommendedPayment: { type: "number" },
              reason: { type: "string" },
            },
          },
        },
        notes: { type: "array", items: { type: "string" } },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
    nextActions: { type: "array", items: { type: "string" } },
  },
};

function fetchWithTimeout(url, options, timeoutMs = OPENAI_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...(options || {}), signal: controller.signal }).finally(() => clearTimeout(timeout));
}

function isAbortError(err) {
  const name = String(err?.name || "").trim();
  const message = String(err?.message || err || "").trim();
  return name === "AbortError" || /operation was aborted/i.test(message);
}

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value, maxLength = 160) {
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

function intSatang(value, fallback = 0, { allowNegative = true } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const rounded = Math.trunc(number);
  if (!allowNegative && rounded < 0) return 0;
  return Math.max(-1_000_000_000_000, Math.min(1_000_000_000_000, rounded));
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1000, number));
}

function normalizeMonth(value) {
  const match = cleanText(value, 16).match(/^(\d{4})-(\d{2})/);
  if (!match) return "";
  const month = Number(match[2]);
  if (month < 1 || month > 12) return "";
  return `${match[1]}-${match[2]}`;
}

function normalizeDate(value) {
  const match = cleanText(value, 16).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function sanitizeCategorySpendTop(value) {
  return listOf(value)
    .map((item) => {
      const categoryId = cleanText(item?.categoryId ?? item?.category_id ?? item?.id ?? item?.key, 80);
      const name = cleanText((item?.name ?? item?.label ?? categoryId) || "Category", 120);
      const amount = intSatang(item?.amount ?? item?.amountSatang ?? item?.amount_satang ?? item?.expense_satang, 0, {
        allowNegative: false,
      });
      if (!categoryId && !name && !amount) return null;
      return { categoryId, name, amount };
    })
    .filter(Boolean)
    .slice(0, 12);
}

function sanitizeAccountsSummary(value) {
  return listOf(value)
    .map((account) => {
      const id = cleanText(account?.id ?? account?.accountId ?? account?.account_id, 80);
      const name = cleanText(account?.name ?? account?.label ?? "Account", 120);
      const type = cleanText(account?.type ?? account?.kind ?? "", 40);
      const balance = intSatang(account?.balance ?? account?.balanceSatang ?? account?.balance_satang, 0);
      const creditLimit = intSatang(account?.creditLimit ?? account?.credit_limit_satang, 0, { allowNegative: false });
      if (!id && !name) return null;
      return { id, name, type, balance, creditLimit };
    })
    .filter(Boolean)
    .slice(0, 20);
}

function sanitizeCreditCards(value) {
  return listOf(value)
    .map((card) => {
      const accountId = cleanText(card?.accountId ?? card?.account_id ?? card?.id, 80);
      const name = cleanText(card?.name ?? card?.label ?? "Credit card", 120);
      const balance = intSatang(card?.balance ?? card?.currentBalance ?? card?.current_balance_satang, 0, {
        allowNegative: false,
      });
      const statementBalance = intSatang(card?.statementBalance ?? card?.statement_balance_satang, 0, {
        allowNegative: false,
      });
      const minimumDue = intSatang(card?.minimumDue ?? card?.minimum_due_satang, 0, { allowNegative: false });
      const dueDate = normalizeDate(card?.dueDate ?? card?.due_date);
      const statementDate = normalizeDate(card?.statementDate ?? card?.statement_date);
      const apr = numberValue(card?.apr ?? card?.aprPct ?? card?.aprPercent, 0);
      if (!accountId && !name) return null;
      return { accountId, name, balance, statementBalance, minimumDue, dueDate, statementDate, apr };
    })
    .filter(Boolean)
    .slice(0, 12);
}

function sanitizeCreditStatements(value, month) {
  return listOf(value)
    .map((statement) => {
      const accountId = cleanText(statement?.accountId ?? statement?.account_id, 80);
      const statementMonth =
        normalizeMonth(statement?.month ?? statement?.monthKey ?? statement?.month_key) ||
        normalizeMonth(statement?.statementDate ?? statement?.statement_date) ||
        normalizeMonth(statement?.dueDate ?? statement?.due_date) ||
        month;
      const statementBalance = intSatang(statement?.statementBalance ?? statement?.statement_balance_satang, 0, {
        allowNegative: false,
      });
      const minimumDue = intSatang(statement?.minimumDue ?? statement?.minimum_due_satang, 0, { allowNegative: false });
      const statementDate = normalizeDate(statement?.statementDate ?? statement?.statement_date);
      const dueDate = normalizeDate(statement?.dueDate ?? statement?.due_date);
      const apr = numberValue(statement?.apr ?? statement?.aprPct ?? statement?.aprPercent, 0);
      if (!accountId) return null;
      return { accountId, month: statementMonth, statementBalance, minimumDue, statementDate, dueDate, apr };
    })
    .filter((statement) => !month || !statement.month || statement.month === month)
    .slice(0, 12);
}

function sanitizeBudgets(value) {
  return listOf(value)
    .map((budget) => {
      const categoryId = cleanText(budget?.categoryId ?? budget?.category_id ?? budget?.id, 80);
      const name = cleanText((budget?.name ?? budget?.label ?? categoryId) || "Budget", 120);
      const limit = intSatang(budget?.limit ?? budget?.limitSatang ?? budget?.limit_satang, 0, { allowNegative: false });
      const spent = intSatang(budget?.spent ?? budget?.spentSatang ?? budget?.spent_satang, 0, { allowNegative: false });
      const remaining = intSatang(budget?.remaining ?? budget?.remainingSatang ?? limit - spent, limit - spent);
      if (!categoryId && !name && !limit) return null;
      return { categoryId, name, limit, spent, remaining };
    })
    .filter(Boolean)
    .slice(0, 24);
}

function sanitizeDeterministicDebtPlan(value) {
  const source = value && typeof value === "object" ? value : {};
  const cards = listOf(source.cards)
    .map((card) => ({
      accountId: cleanText(card?.accountId ?? card?.account_id ?? card?.id, 80),
      name: cleanText(card?.name ?? "Credit card", 120),
      balance: intSatang(card?.balance ?? card?.currentBalance, 0, { allowNegative: false }),
      minimumDue: intSatang(card?.minimumDue, 0, { allowNegative: false }),
      recommendedPayment: intSatang(card?.recommendedPayment, 0, { allowNegative: false }),
      dueDate: normalizeDate(card?.dueDate),
      apr: numberValue(card?.apr, 0),
      reason: cleanText(card?.reason, 180),
      warnings: listOf(card?.warnings).map((warning) => cleanText(warning, 120)).filter(Boolean).slice(0, 6),
    }))
    .filter((card) => card.accountId || card.name)
    .slice(0, 12);

  return {
    strategy: cleanText(source.strategy ?? source.selectedStrategy ?? "", 40),
    totals: {
      totalMinimum: intSatang(source?.totals?.totalMinimum, 0, { allowNegative: false }),
      totalRecommended: intSatang(source?.totals?.totalRecommended, 0, { allowNegative: false }),
      cashAfterPayments: intSatang(source?.totals?.cashAfterPayments, 0),
    },
    cards,
    warnings: listOf(source.warnings).map((warning) => cleanText(warning, 120)).filter(Boolean).slice(0, 12),
  };
}

function sanitizeFinancialSnapshot(input) {
  const source = input && typeof input === "object" ? input : {};
  if (Array.isArray(source.transactions) || Array.isArray(source.rawTransactions) || Array.isArray(source.raw_transactions)) {
    const error = new Error("raw_transactions_not_allowed");
    error.code = "raw_transactions_not_allowed";
    throw error;
  }

  const month = normalizeMonth(source.month) || currentMonthKey();
  return {
    month,
    incomeTotal: intSatang(source.incomeTotal ?? source.income_total_satang, 0, { allowNegative: false }),
    expenseTotal: intSatang(source.expenseTotal ?? source.expense_total_satang, 0, { allowNegative: false }),
    categorySpendTop: sanitizeCategorySpendTop(source.categorySpendTop ?? source.category_spend_top),
    cashAvailable: intSatang(source.cashAvailable ?? source.cash_available_satang, 0),
    accountsSummary: sanitizeAccountsSummary(source.accountsSummary ?? source.accounts_summary),
    creditCards: sanitizeCreditCards(source.creditCards ?? source.credit_cards),
    creditStatements: sanitizeCreditStatements(source.creditStatements ?? source.credit_statements, month),
    budgets: sanitizeBudgets(source.budgets),
    deterministicDebtPlan: sanitizeDeterministicDebtPlan(source.deterministicDebtPlan ?? source.deterministic_debt_plan),
  };
}

function strings(value, fallback = []) {
  const items = listOf(value)
    .map((item) => cleanText(item, 220))
    .filter(Boolean)
    .slice(0, 8);
  return items.length ? items : fallback;
}

function outputNumber(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.trunc(number);
}

function buildFallbackPlan(snapshot, reason = "") {
  const monthlyNet = intSatang(snapshot?.incomeTotal, 0) - intSatang(snapshot?.expenseTotal, 0);
  const deterministic = sanitizeDeterministicDebtPlan(snapshot?.deterministicDebtPlan);
  const totalRecommended = intSatang(deterministic?.totals?.totalRecommended, 0, { allowNegative: false });
  const totalMinimum = intSatang(deterministic?.totals?.totalMinimum, 0, { allowNegative: false });
  const warnings = [
    reason ? cleanText(reason, 160) : "",
    ...strings(deterministic.warnings),
    totalMinimum > intSatang(snapshot?.cashAvailable, 0) ? "เงินสดที่พร้อมใช้อาจไม่พอจ่ายขั้นต่ำทั้งหมด" : "",
  ].filter(Boolean);

  return normalizePlanResponse({
    summary: `${DISCLAIMER} ${FALLBACK_MESSAGE}`,
    cashflowPlan: {
      status: monthlyNet >= 0 ? "stable" : "tight",
      monthlyNet,
      cashAvailable: intSatang(snapshot?.cashAvailable, 0),
      recommendedExpenseLimit: Math.max(0, intSatang(snapshot?.incomeTotal, 0) - totalRecommended),
      notes: ["ใช้ยอดรวมรายเดือนและงบที่มีเพื่อประเมินกระแสเงินสดแบบปลอดภัย"],
    },
    savingsPlan: {
      emergencyFundAction:
        monthlyNet > 0
          ? "กันส่วนเกินบางส่วนไว้เป็นเงินสำรองฉุกเฉินก่อนเพิ่มค่าใช้จ่ายใหม่"
          : "ชะลอการออมใหม่ชั่วคราวและหาจุดลดรายจ่ายเพื่อให้กระแสเงินสดกลับมาเป็นบวก",
      recommendedSavings: Math.max(0, Math.min(monthlyNet, Math.floor(intSatang(snapshot?.cashAvailable, 0) * 0.1))),
      notes: ["เน้นเงินสำรองฉุกเฉินและสภาพคล่อง ไม่แนะนำการลงทุนเสี่ยง"],
    },
    debtPlan: {
      strategy: deterministic.strategy || "deterministic",
      totalRecommendedPayment: totalRecommended,
      cards: deterministic.cards.map((card) => ({
        accountId: card.accountId,
        name: card.name,
        recommendedPayment: card.recommendedPayment,
        reason: card.reason || "ใช้แผนชำระหนี้ที่คำนวณได้จากข้อมูลขั้นต่ำ",
      })),
      notes: ["จ่ายอย่างน้อยตามแผนขั้นต่ำก่อน แล้วค่อยเพิ่มส่วนเกินตามกลยุทธ์ที่เลือก"],
    },
    warnings,
    nextActions: [
      "ตรวจสอบยอดขั้นต่ำและวันครบกำหนดของบัตรทุกใบ",
      "อัปเดตเงินสดที่พร้อมจ่ายหนี้ก่อนตัดสินใจชำระ",
      "ลองเรียก AI planner ใหม่เมื่อการเชื่อมต่อพร้อม",
    ],
  });
}

function normalizePlanResponse(parsed) {
  const source = parsed && typeof parsed === "object" ? parsed : {};
  const summaryText = cleanText(source.summary, 800);
  const summary = summaryText.includes(DISCLAIMER) ? summaryText : `${DISCLAIMER} ${summaryText || FALLBACK_MESSAGE}`;
  const cashflow = source.cashflowPlan && typeof source.cashflowPlan === "object" ? source.cashflowPlan : {};
  const savings = source.savingsPlan && typeof source.savingsPlan === "object" ? source.savingsPlan : {};
  const debt = source.debtPlan && typeof source.debtPlan === "object" ? source.debtPlan : {};

  return {
    summary,
    cashflowPlan: {
      status: cleanText(cashflow.status || "review", 60),
      monthlyNet: outputNumber(cashflow.monthlyNet, 0),
      cashAvailable: outputNumber(cashflow.cashAvailable, 0),
      recommendedExpenseLimit: outputNumber(cashflow.recommendedExpenseLimit, 0),
      notes: strings(cashflow.notes, ["ติดตามกระแสเงินสดรายเดือนและกันเงินจำเป็นก่อนจ่ายเพิ่ม"]),
    },
    savingsPlan: {
      emergencyFundAction: cleanText(savings.emergencyFundAction, 300) || "กันเงินสำรองฉุกเฉินเท่าที่กระแสเงินสดยังไหว",
      recommendedSavings: outputNumber(savings.recommendedSavings, 0),
      notes: strings(savings.notes, ["เน้นเงินสำรองฉุกเฉินก่อนเป้าหมายอื่น"]),
    },
    debtPlan: {
      strategy: cleanText(debt.strategy || "review", 60),
      totalRecommendedPayment: outputNumber(debt.totalRecommendedPayment, 0),
      cards: listOf(debt.cards)
        .map((card) => ({
          accountId: cleanText(card?.accountId ?? card?.account_id, 80),
          name: cleanText(card?.name || "Credit card", 120),
          recommendedPayment: outputNumber(card?.recommendedPayment, 0),
          reason: cleanText(card?.reason, 240) || "จ่ายตามลำดับความสำคัญของแผนหนี้",
        }))
        .filter((card) => card.accountId || card.name)
        .slice(0, 12),
      notes: strings(debt.notes, ["จ่ายขั้นต่ำให้ครบก่อน แล้วค่อยใช้เงินส่วนเกินลดหนี้หลัก"]),
    },
    warnings: strings(source.warnings),
    nextActions: strings(source.nextActions, ["ตรวจสอบข้อมูลเดือนนี้แล้วลองสร้างแผนอีกครั้ง"]),
  };
}

function parsePlanFromResponse(openaiJson) {
  const parsed = findFirstParsedObject(openaiJson);
  if (parsed && typeof parsed === "object") return parsed;

  const text = extractResponsesOutputText(openaiJson);
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function callOpenAI(snapshot) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    const error = new Error("missing_openai_api_key");
    error.code = "missing_openai_api_key";
    throw error;
  }

  const model = normalizeOpenAIModel(
    process.env.FINANCIAL_PLAN_OPENAI_MODEL || process.env.OPENAI_MODEL || OPENAI_SCAN_DEFAULT_MODEL,
  );

  const response = await fetchWithTimeout(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "You are a cautious financial planning assistant for a personal budgeting app.",
                "Respond in Thai, using concise and practical wording.",
                `The summary must include this exact disclaimer: ${DISCLAIMER}`,
                "Use input amounts and output numeric amounts in satang.",
                "Do not recommend specific investments, crypto, leverage, trading, or risky instruments.",
                "Focus only on budgeting, savings, debt repayment, monthly cashflow, and emergency funds.",
                "Return JSON only, matching the provided schema.",
              ].join("\n"),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                task: "Build a monthly financial plan from this sanitized snapshot.",
                snapshot,
              }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "financial_plan",
          strict: true,
          schema: PLAN_RESPONSE_SCHEMA,
        },
      },
    }),
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    const message = cleanText(json?.error?.message || json?.message || `OpenAI request failed (${response.status})`, 240);
    const error = new Error(message || "openai_request_failed");
    error.code = "openai_request_failed";
    error.status = response.status;
    throw error;
  }

  const parsed = parsePlanFromResponse(json);
  if (!parsed) {
    const error = new Error("openai_parse_failed");
    error.code = "openai_parse_failed";
    throw error;
  }

  return { plan: normalizePlanResponse(parsed), model };
}

function sendPlan(res, status, body, plan) {
  res.status(status).json({
    ...plan,
    ...body,
    plan,
    data: plan,
  });
}

export default async function handler(req, res) {
  let snapshot = null;
  try {
    setSecurityHeaders(res);
    if (!enforceAccess(req, res)) return;
    if (!enforceRateLimit(req, res)) return;

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).json({ ok: false, code: "method_not_allowed", message: "Use POST" });
      return;
    }

    const body = await parseJsonBody(req, MAX_JSON_BODY_BYTES);
    if (Array.isArray(body?.transactions) || Array.isArray(body?.rawTransactions) || Array.isArray(body?.raw_transactions)) {
      const error = new Error("raw_transactions_not_allowed");
      error.code = "raw_transactions_not_allowed";
      throw error;
    }
    snapshot = sanitizeFinancialSnapshot(body?.snapshot ?? body);
    const { plan, model } = await callOpenAI(snapshot);
    sendPlan(res, 200, { ok: true, model }, plan);
  } catch (error) {
    const code = String(error?.code || error?.message || "financial_plan_failed");
    const fallbackSnapshot = snapshot || sanitizeFinancialSnapshot({});
    const fallbackPlan = buildFallbackPlan(fallbackSnapshot, code);

    if (isAbortError(error)) {
      sendPlan(res, 504, { ok: false, code: "financial_plan_timeout", message: FALLBACK_MESSAGE }, fallbackPlan);
      return;
    }

    if (code === "body_too_large") {
      sendPlan(res, 413, { ok: false, code: "body_too_large", message: "Request body too large" }, fallbackPlan);
      return;
    }

    if (code === "raw_transactions_not_allowed") {
      sendPlan(res, 400, { ok: false, code, message: "Send a sanitized financial snapshot, not raw transactions" }, fallbackPlan);
      return;
    }

    if (code === "missing_openai_api_key") {
      sendPlan(res, 503, { ok: false, code, message: "ยังไม่ได้ตั้งค่า OPENAI_API_KEY บนเซิร์ฟเวอร์" }, fallbackPlan);
      return;
    }

    sendPlan(res, Number(error?.status || 502), { ok: false, code, message: FALLBACK_MESSAGE }, fallbackPlan);
  }
}

export { DISCLAIMER as FINANCIAL_PLAN_DISCLAIMER, buildFallbackPlan, sanitizeFinancialSnapshot };
