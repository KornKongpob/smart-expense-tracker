import { DEFAULT_CATEGORIES } from "../../../src/constants/categories.js";

export const STORAGE_KEY = "smart-expense-tracker_v1";
export const ONBOARDING_KEY = "onboarding_done_v1";
export const PIN_KEY = "privacy_pin_6";
export const THEME_KEY = "app_theme";

export const SEED_MONTH_KEY = "2026-03";
export const SEED_TODAY_ISO = "2026-03-25";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeTx({
  id,
  type,
  amount,
  date = SEED_TODAY_ISO,
  note,
  merchant = "",
  category,
  accountId,
  isTransfer = false,
  createdAt = Date.parse(`${SEED_TODAY_ISO}T09:00:00+07:00`),
}) {
  return {
    id,
    type,
    amount,
    date,
    note,
    merchant,
    category,
    categoryId: category,
    accountId,
    isTransfer,
    createdAt,
    updatedAt: createdAt,
  };
}

function makeInboxItem(base) {
  return {
    createdAt: Date.parse(`${SEED_TODAY_ISO}T12:00:00+07:00`),
    date: SEED_TODAY_ISO,
    includeDuplicate: true,
    status: "pending",
    scanWarnings: [],
    scanMeta: null,
    ...base,
  };
}

export function createSeedState() {
  const categories = clone(DEFAULT_CATEGORIES);

  const accounts = [
    {
      id: "acc_cash",
      name: "Cash Wallet",
      type: "cash",
      color: "#1DD1A1",
      icon: "💵",
      iconId: "cash",
      institutionId: "cash_wallet",
      openingBalance: 200000,
      accountNumber: "",
      matchDigits: [],
      creditLimit: 0,
      statementDay: 1,
      dueDay: 25,
      currency: "THB",
    },
    {
      id: "acc_scb_everyday",
      name: "SCB Everyday",
      type: "bank",
      color: "#4C1D95",
      icon: "🏦",
      iconId: "bank",
      institutionId: "scb",
      openingBalance: 750000,
      accountNumber: "1234567892345",
      matchDigits: ["2345"],
      creditLimit: 0,
      statementDay: 1,
      dueDay: 25,
      currency: "THB",
    },
    {
      id: "acc_ktb_payroll",
      name: "KTB Payroll",
      type: "bank",
      color: "#0F6CBD",
      icon: "🏦",
      iconId: "bank",
      institutionId: "ktb",
      openingBalance: 1500000,
      accountNumber: "1234567893456",
      matchDigits: ["3456"],
      creditLimit: 0,
      statementDay: 1,
      dueDay: 25,
      currency: "THB",
    },
    {
      id: "acc_bay_credit",
      name: "Krungsri Platinum",
      type: "credit",
      color: "#F4B400",
      icon: "💳",
      iconId: "card",
      institutionId: "bay",
      openingBalance: 0,
      accountNumber: "456789129988",
      matchDigits: ["9988"],
      creditLimit: 15000000,
      statementDay: 20,
      dueDay: 5,
      currency: "THB",
      cardLast4: "9988",
    },
    {
      id: "acc_truemoney_wallet",
      name: "TrueMoney Wallet",
      type: "cash",
      color: "#F97316",
      icon: "📱",
      iconId: "wallet",
      institutionId: "truemoney",
      openingBalance: 50000,
      accountNumber: "00005566",
      matchDigits: ["5566"],
      creditLimit: 0,
      statementDay: 1,
      dueDay: 25,
      currency: "THB",
    },
    {
      id: "acc_linebk_spare",
      name: "LINE BK Spare",
      type: "bank",
      color: "#06C755",
      icon: "🏦",
      iconId: "bank",
      institutionId: "line_bk",
      openingBalance: 10000,
      accountNumber: "00007788",
      matchDigits: ["7788"],
      creditLimit: 0,
      statementDay: 1,
      dueDay: 25,
      currency: "THB",
    },
  ];

  const transactions = [
    makeTx({
      id: "tx_salary_march",
      type: "income",
      amount: 6500000,
      date: "2026-03-25",
      note: "March salary",
      merchant: "Acme Co.",
      category: "salary",
      accountId: "acc_ktb_payroll",
      createdAt: Date.parse("2026-03-25T08:00:00+07:00"),
    }),
    makeTx({
      id: "tx_coffee",
      type: "expense",
      amount: 14500,
      date: "2026-03-25",
      note: "Morning latte",
      merchant: "Starbucks",
      category: "coffee",
      accountId: "acc_scb_everyday",
      createdAt: Date.parse("2026-03-25T09:30:00+07:00"),
    }),
    makeTx({
      id: "tx_dining",
      type: "expense",
      amount: 78000,
      date: "2026-03-24",
      note: "Team dinner",
      merchant: "Somtum House",
      category: "dining",
      accountId: "acc_scb_everyday",
      createdAt: Date.parse("2026-03-24T19:30:00+07:00"),
    }),
    makeTx({
      id: "tx_grocery",
      type: "expense",
      amount: 35400,
      date: "2026-03-23",
      note: "House groceries",
      merchant: "Lotus's",
      category: "groceries",
      accountId: "acc_cash",
      createdAt: Date.parse("2026-03-23T18:00:00+07:00"),
    }),
    makeTx({
      id: "tx_credit_purchase",
      type: "expense",
      amount: 280000,
      date: "2026-03-20",
      note: "Noise-cancelling headphones",
      merchant: "Power Buy",
      category: "electronics",
      accountId: "acc_bay_credit",
      createdAt: Date.parse("2026-03-20T14:30:00+07:00"),
    }),
  ];

  const budgets = [
    { id: "budget_total_2026_03", month: SEED_MONTH_KEY, categoryId: "__TOTAL__", limit: 2500000, alertPct: 90 },
    { id: "budget_daily_2026_03", month: SEED_MONTH_KEY, categoryId: "__DAILY__", limit: 90000, alertPct: 100 },
    { id: "budget_food_2026_03", month: SEED_MONTH_KEY, categoryId: "food", limit: 650000, alertPct: 85 },
  ];

  const recurring = [
    {
      id: "rec_netflix",
      enabled: true,
      type: "expense",
      amount: 39900,
      categoryId: "subscriptions",
      accountId: "acc_scb_everyday",
      note: "Netflix",
      startDate: "2026-03-01",
      frequency: "monthly",
      interval: 1,
      lastGenerated: null,
    },
    {
      id: "rec_salary_stub",
      enabled: false,
      type: "income",
      amount: 6500000,
      categoryId: "salary",
      accountId: "acc_ktb_payroll",
      note: "Salary template",
      startDate: "2026-03-01",
      frequency: "monthly",
      interval: 1,
      lastGenerated: "2026-02-01",
    },
  ];

  const merchants = [
    {
      id: "merch_starbucks",
      canonical: "Starbucks",
      enabled: true,
      aliases: ["STARBUCKS", "STARBUCKS TH"],
      prefs: {
        expense: { categoryId: "coffee", accountId: "acc_scb_everyday" },
        income: { categoryId: "", accountId: "" },
      },
    },
    {
      id: "merch_starbucks_reserve",
      canonical: "Starbucks Reserve",
      enabled: true,
      aliases: ["STARBUCKS RESERVE"],
      prefs: {
        expense: { categoryId: "coffee", accountId: "acc_scb_everyday" },
        income: { categoryId: "", accountId: "" },
      },
    },
    {
      id: "merch_grab",
      canonical: "Grab",
      enabled: true,
      aliases: ["GRAB", "GRABFOOD"],
      prefs: {
        expense: { categoryId: "ride_hailing", accountId: "acc_scb_everyday" },
        income: { categoryId: "", accountId: "" },
      },
    },
  ];

  const rules = [
    {
      id: "rule_grab_transport",
      name: "Grab -> Ride hailing",
      enabled: true,
      priority: 1,
      conditions: {
        keywordContains: "grab",
        regex: "",
        amountMin: null,
        amountMax: null,
        bankContains: "",
        refContains: "",
        fromDigitsEndsWith: "",
        toDigitsEndsWith: "",
      },
      actions: {
        setType: "expense",
        setCategoryId: "ride_hailing",
        setAccountId: "acc_scb_everyday",
        setFromAccountId: "",
        setToAccountId: "",
      },
    },
    {
      id: "rule_credit_payment",
      name: "PAYMENT -> Credit payment",
      enabled: true,
      priority: 2,
      conditions: {
        keywordContains: "payment",
        regex: "",
        amountMin: null,
        amountMax: null,
        bankContains: "",
        refContains: "",
        fromDigitsEndsWith: "",
        toDigitsEndsWith: "",
      },
      actions: {
        setType: "credit_payment",
        setCategoryId: "transfer",
        setAccountId: "",
        setFromAccountId: "acc_scb_everyday",
        setToAccountId: "acc_bay_credit",
      },
    },
  ];

  const inbox = [
    makeInboxItem({
      id: "inb_receipt_split",
      type: "expense",
      txType: "expense",
      amount: 26500,
      merchant: "Cafe Bloom",
      note: "Cafe Bloom",
      ref: "RCPT-265",
      categoryId: "coffee",
      accountId: "acc_scb_everyday",
      duplicate: false,
      docType: "receipt",
      splitByCategory: true,
      groups: [
        { key: "coffee", categoryId: "coffee", amount: 14500, note: "Iced latte", splitIndex: 1 },
        { key: "bakery", categoryId: "bakery", amount: 12000, note: "Butter croissant", splitIndex: 2 },
      ],
      items: [
        { name: "Iced latte", qty: 1, total: 145 },
        { name: "Butter croissant", qty: 1, total: 120 },
      ],
      scanMeta: {
        docType: "receipt",
        confidence: { overall: 0.95 },
        flags: { needs_human_review: false, has_line_items: true, has_zero_price_lines: false, has_discount_lines: false },
        accountMatch: {
          kind: "single",
          ready: true,
          source: "model",
          selected: { id: "acc_scb_everyday", score: 9, matchedAccountDigits: "2345", matchedSlipDigits: "2345" },
        },
      },
    }),
    makeInboxItem({
      id: "inb_duplicate_payment",
      type: "credit_payment",
      txType: "credit_payment",
      amount: 120000,
      merchant: "Krungsri Platinum",
      note: "Krungsri Platinum payment",
      ref: "TRX1234",
      categoryId: "transfer",
      accountId: "",
      fromAccountId: "acc_scb_everyday",
      toAccountId: "acc_bay_credit",
      duplicate: true,
      duplicateInfo: { kind: "fuzzy", score: 0.92, reasons: ["amount match", "ref exact match"] },
      docType: "transfer_slip",
      splitByCategory: false,
      groups: [],
      items: [],
      scanMeta: {
        docType: "transfer_slip",
        confidence: { overall: 0.92 },
        flags: { needs_human_review: false },
        accountMatch: {
          kind: "pair",
          ready: true,
          from: { id: "acc_scb_everyday", score: 8, matchedAccountDigits: "2345", matchedSlipDigits: "2345" },
          to: { id: "acc_bay_credit", score: 8, matchedAccountDigits: "9988", matchedSlipDigits: "9988" },
        },
      },
    }),
    makeInboxItem({
      id: "inb_manual_review",
      type: "expense",
      txType: "expense",
      amount: 8900,
      merchant: "Unknown kiosk",
      note: "Unknown kiosk",
      ref: "",
      categoryId: "",
      accountId: "",
      duplicate: false,
      docType: "receipt",
      splitByCategory: false,
      groups: [],
      items: [],
      scanWarnings: ["NEEDS_HUMAN_REVIEW"],
      scanMeta: {
        docType: "receipt",
        confidence: { overall: 0.42 },
        flags: { needs_human_review: true },
        accountMatch: {
          kind: "single",
          ready: false,
          source: "missing",
          selected: { id: "", score: 0, matchedAccountDigits: "", matchedSlipDigits: "" },
        },
      },
    }),
    makeInboxItem({
      id: "inb_approved_old",
      status: "approved",
      type: "income",
      txType: "income",
      amount: 450000,
      merchant: "Freelance client",
      note: "Freelance project",
      ref: "INV-22",
      categoryId: "freelance",
      accountId: "acc_ktb_payroll",
      duplicate: false,
      docType: "transfer_slip",
      splitByCategory: false,
      groups: [],
      items: [],
      scanMeta: {
        docType: "transfer_slip",
        confidence: { overall: 0.88 },
        flags: { needs_human_review: false },
        accountMatch: {
          kind: "single",
          ready: true,
          source: "digits",
          selected: { id: "acc_ktb_payroll", score: 8, matchedAccountDigits: "3456", matchedSlipDigits: "3456" },
        },
      },
    }),
  ];

  return {
    moneyUnit: "satang",
    transactions,
    accounts,
    categories,
    budgets,
    recurring,
    merchants,
    rules,
    inbox,
    scanInbox: clone(inbox),
    ui: { view: "dashboard", editingId: null },
  };
}

export function createStorageRecord(data = createSeedState()) {
  return {
    v: 1,
    updatedAt: Date.now(),
    data,
  };
}

export function createBackupPayload(data = createSeedState()) {
  return {
    v: 1,
    exportedAt: Date.now(),
    data,
  };
}

export function createImportBackupPayload() {
  const data = createSeedState();

  data.accounts.push({
    id: "acc_import_bbl",
    name: "Imported Bangkok Bank",
    type: "bank",
    color: "#1E3A8A",
    icon: "🏦",
    iconId: "bank",
    institutionId: "bbl",
    openingBalance: 125000,
    accountNumber: "00001234",
    matchDigits: ["1234"],
    creditLimit: 0,
    statementDay: 1,
    dueDay: 25,
    currency: "THB",
  });

  data.transactions.push(
    makeTx({
      id: "tx_import_marker",
      type: "expense",
      amount: 11100,
      date: "2026-03-22",
      note: "Imported backup marker",
      merchant: "Import Cafe",
      category: "coffee",
      accountId: "acc_import_bbl",
      createdAt: Date.parse("2026-03-22T10:15:00+07:00"),
    })
  );

  data.merchants.push({
    id: "merch_import_marker",
    canonical: "Import Cafe",
    enabled: true,
    aliases: ["IMPORT CAFE"],
    prefs: {
      expense: { categoryId: "coffee", accountId: "acc_import_bbl" },
      income: { categoryId: "", accountId: "" },
    },
  });

  return createBackupPayload(data);
}
