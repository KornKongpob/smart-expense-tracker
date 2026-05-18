import { normalizeBootPayload } from "../store/boot.js";
import { resolveMoneyUnit } from "./moneyUnit.js";

export { resolveMoneyUnit } from "./moneyUnit.js";

const EMPTY_CATEGORIES = Object.freeze({ expense: [], income: [] });

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function ensureArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

export function unwrapBackupPayload(raw) {
  const root = isPlainObject(raw) ? raw : {};
  return isPlainObject(root.data) ? root.data : root;
}

function normalizeCategories(value, fallback = EMPTY_CATEGORIES) {
  if (!isPlainObject(value)) return fallback;
  return {
    expense: ensureArray(value.expense, fallback.expense),
    income: ensureArray(value.income, fallback.income),
  };
}

function pickInboxList(primary, secondary, fallback = []) {
  if (Array.isArray(primary)) return primary;
  if (Array.isArray(secondary)) return secondary;
  return fallback;
}

export function normalizeBackupCore(raw, defaults = {}) {
  const container = isPlainObject(raw) ? raw : {};
  const source = unwrapBackupPayload(raw);
  const resolvedMoneyUnit = resolveMoneyUnit(
    source.moneyUnit || source.amountUnit || container.moneyUnit || container.amountUnit,
    "satang",
  );
  const repaired = {
    ...source,
    moneyUnit: resolvedMoneyUnit,
    inbox: pickInboxList(source.inbox, source.scanInbox, ensureArray(defaults.defaultInbox, [])),
    scanInbox: pickInboxList(source.scanInbox, source.inbox, ensureArray(defaults.defaultScanInbox, [])),
    goals: ensureArray(source.goals, ensureArray(defaults.defaultGoals, [])),
    merchants: ensureArray(source.merchants, ensureArray(defaults.defaultMerchants, [])),
  };

  const normalized = normalizeBootPayload(repaired);
  const inbox = pickInboxList(normalized.inbox, normalized.scanInbox, ensureArray(defaults.defaultInbox, []));
  const scanInbox = pickInboxList(normalized.scanInbox, normalized.inbox, ensureArray(defaults.defaultScanInbox, inbox));

  return {
    moneyUnit: resolvedMoneyUnit,
    transactions: ensureArray(normalized.transactions, ensureArray(defaults.defaultTransactions, [])),
    accounts: ensureArray(normalized.accounts, ensureArray(defaults.defaultAccounts, [])),
    categories: normalizeCategories(
      normalized.categories,
      normalizeCategories(defaults.defaultCategories, EMPTY_CATEGORIES),
    ),
    budgets: ensureArray(normalized.budgets, ensureArray(defaults.defaultBudgets, [])),
    recurring: ensureArray(normalized.recurring, ensureArray(defaults.defaultRecurring, [])),
    creditStatements: ensureArray(
      normalized.creditStatements,
      ensureArray(defaults.defaultCreditStatements, []),
    ),
    goals: ensureArray(normalized.goals, ensureArray(defaults.defaultGoals, [])),
    rules: ensureArray(normalized.rules, ensureArray(defaults.defaultRules, [])),
    merchants: ensureArray(normalized.merchants, ensureArray(defaults.defaultMerchants, [])),
    inbox,
    scanInbox,
    ui: isPlainObject(normalized.ui)
      ? normalized.ui
      : isPlainObject(defaults.defaultUI)
        ? defaults.defaultUI
        : undefined,
  };
}

export function extractBackupSupplementalData(raw) {
  const container = isPlainObject(raw) ? raw : {};
  const source = unwrapBackupPayload(raw);

  return {
    profile: isPlainObject(source.profile)
      ? source.profile
      : isPlainObject(container.profile)
        ? container.profile
        : null,
    categoryPreferences: ensureArray(
      source.categoryPreferences ?? source.category_preferences,
      ensureArray(container.categoryPreferences ?? container.category_preferences, []),
    ),
    attachments: ensureArray(container.attachments, []),
  };
}
