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
const optionalStr = z.string().default("");
const optionalBool = z.boolean().default(false);
const timestamp = z.number().finite().default(0);

// ===== Transaction =====

export const TransactionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["expense", "income"]).default("expense"),
  amount: satangInt,
  date: isoDateStr,
  time: timeHHmmStr,
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
}).passthrough();

// ===== Full App State (for backup import validation) =====

export const AppStateSchema = z.object({
  moneyUnit: z.enum(["satang", "baht"]).default("satang"),
  transactions: z.array(TransactionSchema).default([]),
  accounts: z.array(AccountSchema).default([]),
  categories: CategoriesSchema.default({ expense: [], income: [] }),
  budgets: z.array(BudgetSchema).default([]),
  recurring: z.array(RecurringSchema).default([]),
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
