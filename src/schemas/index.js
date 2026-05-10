// src/schemas/index.js
// Zod schemas for core data models.
// Used to validate data before persist (storage.js) and on import (backup).
// Keeps the app resilient to corrupt/malformed data from scan, import, or legacy formats.

import { z } from "zod";
import { normalizeBackupCore } from "../utils/backupPayload.js";

// ===== Primitives =====

const satangInt = z.number().int().finite().default(0);
const isoDateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.string().length(0)).default("");
const timeHHmmStr = z.string().regex(/^\d{2}:\d{2}$/).or(z.string().length(0)).default("");
const transactionTimeStr = z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/).or(z.string().length(0)).default("");
const optionalStr = z.string().default("");
const optionalBool = z.boolean().default(false);
const timestamp = z.number().finite().default(0);

// ===== Receipt Scan =====

export const ReceiptAdjustmentSchema = z.object({
  id: optionalStr,
  type: z.enum(["discount", "service_charge", "tax", "rounding", "fee", "unknown"]).default("unknown"),
  label: optionalStr,
  amountSatang: satangInt,
  effect: z.enum(["add", "subtract"]).default("add"),
}).passthrough();

export const ReceiptLineItemSchema = z.lazy(() =>
  z.object({
    id: optionalStr,
    rawName: optionalStr,
    normalizedName: optionalStr,
    qty: z.number().finite().positive().default(1),
    unitPriceSatang: z.number().int().finite().nullable().default(null),
    totalSatang: satangInt,
    suggestedCategoryId: z.string().nullable().default(null),
    categoryConfidence: z.number().finite().min(0).max(100).nullable().default(null),
    categoryReason: optionalStr,
    userConfirmedCategory: optionalBool,
    source: z.string().default("scan"),
    children: z.array(ReceiptLineItemSchema).default([]),
  }).passthrough()
);

export const ReceiptScanSchema = z.object({
  merchant: z.string().nullable().default(null),
  date: z.string().nullable().default(null),
  paidTotalSatang: satangInt,
  subtotalSatang: satangInt,
  discountSatang: satangInt,
  serviceChargeSatang: satangInt,
  taxSatang: satangInt,
  roundingSatang: satangInt,
  paymentMethod: z.string().nullable().default(null),
  referenceId: z.string().nullable().default(null),
  confidence: z.number().finite().min(0).max(100).nullable().default(null),
  items: z.array(ReceiptLineItemSchema).default([]),
  adjustments: z.array(ReceiptAdjustmentSchema).default([]),
  warnings: z.array(z.string()).default([]),
}).passthrough();

// ===== Transaction =====

export const TransactionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["expense", "income"]).default("expense"),
  amount: satangInt,
  date: isoDateStr,
  time: timeHHmmStr,
  transactionTime: transactionTimeStr,
  category: optionalStr,
  accountId: optionalStr,
  note: optionalStr,
  ref: optionalStr,
  merchant: optionalStr,

  // Transfer fields
  isTransfer: optionalBool,
  transferId: z.string().nullable().default(null),
  transferKind: optionalStr,

  // Split fields
  isSplitParent: optionalBool,
  isSplitChild: optionalBool,
  splitGroupId: optionalStr,
  splitParentId: optionalStr,
  splitLabel: optionalStr,
  splitIndex: z.number().int().finite().default(0),

  // Receipt adjustment
  adjustmentEffect: optionalStr,
  adjustmentType: optionalStr,
  receiptLineType: optionalStr,

  // Installment
  isInstallment: optionalBool,
  installmentGroupId: optionalStr,
  installmentIndex: z.number().int().finite().default(0),
  installmentTotal: z.number().int().finite().default(0),

  // Tags / Labels
  tags: z.array(z.string()).default([]),

  // Metadata
  source: optionalStr,
  createdAt: timestamp,
  updatedAt: timestamp,
  attachmentId: z.string().nullable().default(null),
  fileHash: z.string().nullable().default(null),
  paymentMethod: optionalStr,
  receipt: ReceiptScanSchema.nullable().default(null),
  normalizedReceipt: ReceiptScanSchema.nullable().default(null),

  // GPS
  location: z
    .object({
      lat: z.number().finite(),
      lng: z.number().finite(),
    })
    .nullable()
    .default(null),

  // Receipt lines (embedded for single-tx receipts)
  receiptLines: z.array(z.object({
    categoryId: optionalStr,
    note: optionalStr,
    amount: satangInt,
    receiptLineType: optionalStr,
    adjustmentEffect: optionalStr,
    adjustmentType: optionalStr,
    splitIndex: z.number().int().finite().default(0),
    children: z.array(z.object({
      name: optionalStr,
      amount: satangInt,
    })).nullable().default(null),
    childrenIncludedInParent: optionalBool,
  })).nullable().default(null),
}).passthrough();

// ===== Account =====

export const AccountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).default("บัญชีใหม่"),
  type: z.enum(["cash", "bank", "credit", "ewallet", "investment"]).default("cash"),
  color: z.string().default("#1DD1A1"),
  icon: z.string().default("💳"),
  iconId: optionalStr,
  currency: z.string().default("THB"),

  openingBalance: satangInt,
  accountNumber: optionalStr,
  digits: optionalStr,
  cardLast4: optionalStr,

  // Credit-specific
  creditLimit: satangInt,
  statementDay: z.number().int().min(1).max(31).default(1),
  dueDay: z.number().int().min(1).max(31).default(25),
}).passthrough();

// ===== Category =====

export const CategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  icon: z.string().default("🏷️"),
  color: z.string().default("#94A3B8"),
  parentId: optionalStr,
  assignable: z.boolean().optional(),

  // Tombstone
  isDeleted: optionalBool,
  deletedAt: z.number().nullable().default(null),
  updatedAt: timestamp,

  // Matching
  keywords: z.array(z.string()).default([]),
}).passthrough();

export const CategoriesSchema = z.object({
  expense: z.array(CategorySchema).default([]),
  income: z.array(CategorySchema).default([]),
});

// ===== Budget =====

export const BudgetSchema = z.object({
  id: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/).default(""),
  categoryId: z.string().min(1),
  limit: satangInt,
  alertPct: z.number().int().min(1).max(100).default(90),
}).passthrough();

// ===== Recurring =====

export const RecurringSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean().default(true),
  type: z.enum(["expense", "income"]).default("expense"),
  amount: satangInt,
  categoryId: optionalStr,
  accountId: optionalStr,
  note: z.string().default("Recurring"),
  startDate: isoDateStr,
  frequency: z.enum(["weekly", "monthly"]).default("monthly"),
  interval: z.number().int().min(1).max(120).default(1),
  lastGenerated: z.string().nullable().default(null),
}).passthrough();

// ===== Savings Goal =====

export const GoalSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).default("Savings goal"),
  type: z.enum(["emergency_fund", "travel", "purchase", "debt_buffer", "custom"]).default("custom"),
  targetAmount: satangInt,
  currentAmount: satangInt,
  dueDate: isoDateStr,
  linkedAccountIds: z.array(z.string()).default([]),
  priority: z.number().int().finite().default(1),
  monthlyContribution: satangInt,
  autoReserveRule: z.object({}).passthrough().nullable().default(null),
  status: z.enum(["active", "paused", "completed"]).default("active"),
  createdAt: timestamp,
  updatedAt: timestamp,
}).passthrough();

// ===== Automation Rule =====

export const RuleConditionsSchema = z.object({
  keywordContains: optionalStr,
  regex: optionalStr,
  amountMin: z.number().nullable().default(null),
  amountMax: z.number().nullable().default(null),
  bankContains: optionalStr,
  refContains: optionalStr,
  fromDigitsEndsWith: optionalStr,
  toDigitsEndsWith: optionalStr,
}).passthrough();

export const RuleActionsSchema = z.object({
  setType: optionalStr,
  setCategoryId: optionalStr,
  setAccountId: optionalStr,
  setFromAccountId: optionalStr,
  setToAccountId: optionalStr,
}).passthrough();

export const RuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().default("Automation Rule"),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(1).max(9999).default(1000),
  conditions: RuleConditionsSchema.default({}),
  actions: RuleActionsSchema.default({}),
  createdAt: timestamp,
  updatedAt: timestamp,
}).passthrough();

// ===== Merchant =====

export const MerchantSchema = z.object({
  id: z.string().min(1),
  canonical: z.string().min(1),
  enabled: z.boolean().default(true),
  aliases: z.array(z.string()).default([]),
  prefs: z.object({
    expense: z.object({
      categoryId: optionalStr,
      accountId: optionalStr,
    }).default({}),
    income: z.object({
      categoryId: optionalStr,
      accountId: optionalStr,
    }).default({}),
  }).default({}),
}).passthrough();

// ===== Inbox Item =====

export const InboxItemSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["pending", "approved"]).default("pending"),
  type: z.string().default("expense"),
  amount: satangInt,
  date: isoDateStr,
  time: timeHHmmStr,
  transactionTime: transactionTimeStr,
  categoryId: optionalStr,
  accountId: optionalStr,
  fromAccountId: optionalStr,
  toAccountId: optionalStr,
  merchant: optionalStr,
  note: optionalStr,
  referenceId: optionalStr,
  attachmentId: z.string().nullable().default(null),
  fileHash: z.string().nullable().default(null),
  createdAt: timestamp,
  receipt: ReceiptScanSchema.nullable().default(null),
  normalizedReceipt: ReceiptScanSchema.nullable().default(null),
}).passthrough();

// ===== Full App State (for backup import validation) =====

export const AppStateSchema = z.object({
  moneyUnit: z.enum(["satang", "baht"]).default("satang"),
  transactions: z.array(TransactionSchema).default([]),
  accounts: z.array(AccountSchema).default([]),
  categories: CategoriesSchema.default({ expense: [], income: [] }),
  budgets: z.array(BudgetSchema).default([]),
  recurring: z.array(RecurringSchema).default([]),
  goals: z.array(GoalSchema).default([]),
  rules: z.array(RuleSchema).default([]),
  merchants: z.array(MerchantSchema).default([]),
  inbox: z.array(InboxItemSchema).default([]),
}).passthrough();

// ===== Validation helpers =====

/**
 * Safely validate and return parsed data. Returns { success, data, error }.
 * Never throws — returns error info for the caller to handle gracefully.
 */
export function safeParse(schema, data) {
  try {
    const result = schema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data, error: null };
    }
    return {
      success: false,
      data: null,
      error: result.error?.issues?.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") || "Validation failed",
    };
  } catch (err) {
    return { success: false, data: null, error: String(err?.message || err) };
  }
}

/**
 * Validate a single transaction. Returns cleaned data or null.
 */
export function validateTransaction(tx) {
  const result = safeParse(TransactionSchema, tx);
  return result.success ? result.data : null;
}

/**
 * Validate a single account. Returns cleaned data or null.
 */
export function validateAccount(acc) {
  const result = safeParse(AccountSchema, acc);
  return result.success ? result.data : null;
}

/**
 * Validate an imported backup payload. Returns { success, data, error }.
 * Strips invalid items instead of rejecting the whole backup.
 */
export function validateBackupImport(raw) {
  const root = normalizeBackupCore(raw);
  return safeParse(AppStateSchema, root);
}
