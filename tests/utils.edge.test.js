import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  sanitizeMoneyInput,
  parseMoneyToSatang,
  satangToBahtNumber,
  ensureSatangInt,
} from '../src/utils/money.js';
import { hasExplicitMoneyUnit, readMoneyUnit, resolveMoneyUnit } from '../src/utils/moneyUnit.js';
import { getTransferPair } from '../src/utils/transferGrouping.js';
import {
  reconcileReceiptGroups,
  computeReceiptSumsSatang,
  signedReceiptGroupSatang,
} from '../src/utils/receiptAdjustments.js';
import {
  deriveReceiptCategoryKey,
  inferCategoryKeyFromText,
  sanitizeCategoryKey,
  splitReceiptItemsToLines,
} from '../src/utils/receiptCategorizer.js';
import { getNextRecurringDueISO, advanceRecurringDate } from '../src/utils/recurring.js';
import {
  clampBillingDay,
  getNextDueDate,
  getNextStatementDate,
} from '../src/utils/creditDates.js';
import {
  calculateCreditPaymentPlan,
  getCreditCardStatementStatus,
  getCreditStatementReminderSummary,
  getBillingCycleForCard,
  getStatementsNeedingInput,
  makeCreditStatementCycleKey,
  normalizeCreditStatement as normalizePlannerCreditStatement,
} from '../src/utils/creditPlanner.js';
import { duplicateStateFromMatch, toDuplicateComparable } from '../src/utils/duplicateDetection.js';
import {
  detectScanTextDocType,
  extractLikelyAmountFromScanText,
  extractMerchantFromScanText,
} from '../src/utils/scanPostprocess.js';
import {
  normalizeTransactionTime,
  parseTransactionTimeFromText,
} from '../src/utils/scanDateTime.js';
import {
  hasScannedLineItems,
  normalizeScannedTxType,
  resolveScannedDocType,
  resolveScannedTxTypeFromAccounts,
} from '../src/utils/scanTransactionType.js';
import { resolveTransactionDetailModel } from '../src/utils/transactionDetail.js';
import { generateMoneyCoachInsights } from '../src/utils/moneyCoach.js';
import { buildCreditDebtSnapshot, planCreditCardPayments } from '../src/utils/debtPlan.js';
import {
  buildFinancialSnapshot,
  FINANCIAL_PLAN_DISCLAIMER,
  requestFinancialPlan,
} from '../src/services/financialPlan.js';
import { compareTxNewestFirst } from '../src/utils/transaction.js';
import { loadAll, saveAll, STORAGE_SAVE_ERROR_EVENT } from '../src/services/storage.js';
import { importBlobsFromDataUrls } from '../src/services/blobStore.js';
import { normalizeBackupCore } from '../src/utils/backupPayload.js';
import { resolveAttachmentPreviewState } from '../src/utils/attachmentPreviewState.js';
import {
  collectAttachmentIds,
  getBackupData,
  normalizeAttachmentBackupMap,
  sumAttachmentBackupSize,
} from '../src/utils/attachmentBackup.js';
import { normalizeProviderScanResult } from '../server/legacy-api/scan.js';
import { scanWithProvider, normalizeProviderName } from '../lib/scan/providers/index.js';
import { parseScanRequest, assertAllowedInputMime, assertBase64UnderLimit } from '../lib/scan/requestParse.js';
import { normalizeOpenAIModel, OPENAI_SCAN_DEFAULT_MODEL } from '../lib/scan/openaiModel.js';
import { createRateLimiter } from '../lib/scan/rateLimit.js';
import {
  extractResponsesOutputText,
  findFirstParsedObject,
  normalizeScannedDate,
  safeNumber,
} from '../lib/scan/resultHelpers.js';
import { filterAllowedUploads, isPdfFile } from '../src/views/add-transaction/helpers/fileUploadHelpers.js';
import {
  applyAutomationToQueuePatch,
  buildQueueTypeChangeItem,
  normalizeQueueItemType,
} from '../src/views/add-transaction/helpers/queueTypeHelpers.js';
import { canonicalizeCategoryId } from '../src/utils/categoryIds.js';
import { buildCustomCategoryId } from '../src/utils/categoryCustomId.js';
import {
  applyGoalContribution,
  createInitialState,
  normalizeCreditStatement,
  normalizeGoal,
  normalizeSalaryPlan,
} from '../src/store/boot.js';
import {
  buildFallbackPlan as buildServerFinancialPlanFallback,
  sanitizeFinancialSnapshot as sanitizeServerFinancialSnapshot,
} from '../server/legacy-api/financial-plan.js';
import {
  applyCategoryPresentationToSnapshot,
  mergeCategoryState,
} from '../src/features/app/categoryState.js';
import {
  buildBudgetHint,
  buildBudgetPlanSnapshot,
  normalizePlanningConfig,
} from '../src/features/app/budgetPlanningState.js';
import {
  buildPlannerReminders,
  buildPlannerSnapshot,
  getGoalProgressPercent,
  getNextDebtDueDateISO,
} from '../src/features/app/plannerState.js';
import {
  buildAccountAdjustmentSummary,
  buildAccountBalanceMap,
  getEditableAccountBalanceSatang,
  isLiabilityAccountType,
  normalizeAccountBalanceForType,
  normalizeAccountBalanceRows,
} from '../src/features/app/accountBalanceState.js';
import {
  buildApprovedSuggestion,
  buildTransactionSavePlan,
  getScanDisplayAmountSatang,
  scanToDraft,
} from '../src/features/app/transactionDrafts.js';
import {
  buildDraftLineItemSummaries,
  replaceDraftLineItems,
  summarizeDraftLineItems,
} from '../src/features/app/lineItemDraftState.js';
import {
  buildCategoryPresetState,
  buildCategorySearchResults,
  resolveCategoryPresetFocusMainId,
} from '../src/features/app/categoryPresetState.js';
import {
  createScanUploadEntry,
  getScanUploadMeta,
  patchScanUploadEntry,
} from '../src/features/app/scanUploadState.js';
import {
  buildCategoryHierarchy,
  canSelectCategory,
  isAssignableCategory,
} from '../src/utils/categoryHierarchy.js';
import {
  calculateGoalProgressPercent,
  calculateMonthlyNeeded,
  summarizeGoals,
} from '../src/features/goals/goalCalculators.js';
import {
  getCanonicalPathForPathname,
  getInitialHomePath,
  getPathForView,
  getPathForLegacyHash,
  getViewForPathname,
} from '../src/features/app/routes.js';
import { buildHash, parseHash } from '../src/utils/hashRouter.js';
import { validateBackupImport } from '../src/schemas/index.js';
import {
  createNextPublicSupabaseEnv,
  hasResolvedSupabaseBrowserConfig,
  resolveSupabaseBrowserConfig,
} from '../src/lib/supabase/env.js';
import { normalizeScanResponse } from '../shared/scanSchema.js';
import {
  normalizeNewEntryIntent,
  resolveNewEntryIntent,
} from '../src/views/add-transaction/helpers/entryIntent.js';
import { deriveSplitParentCategoryId } from '../src/views/add-transaction/helpers/splitCategory.js';
import { getSystemCategoryRows } from '../lib/supabase/systemCategories.js';
import { importLegacySnapshot } from '../lib/import/local.js';
import { createSeedState, createStorageRecord } from './e2e/fixtures/seed-state.mjs';
import { DEFAULT_CATEGORIES } from '../src/constants/categories.js';

function installBrowserGlobals(t, { getItem = () => null, setItem = () => {}, removeItem = () => {} } = {}) {
  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevCustomEvent = globalThis.CustomEvent;
  const dispatched = [];

  globalThis.document = {};
  globalThis.window = {
    localStorage: { getItem, setItem, removeItem },
    dispatchEvent: (event) => {
      dispatched.push(event);
      return true;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    clearTimeout,
    setTimeout,
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };

  t.after(() => {
    globalThis.window = prevWindow;
    globalThis.document = prevDocument;
    globalThis.CustomEvent = prevCustomEvent;
  });

  return { dispatched };
}

function createImportAdmin({ userId = 'user-1' } = {}) {
  const tables = {
    profiles: [{ user_id: userId }],
    import_runs: [],
  };
  const nextIds = {
    accounts: 1,
    transactions: 1,
    import_runs: 1,
  };

  function ensureTable(table) {
    if (!tables[table]) tables[table] = [];
    return tables[table];
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function parseSelectFields(fields) {
    const text = String(fields || '').trim();
    if (!text || text === '*') return null;
    return text
      .split(',')
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .map((part) => part.replace(/\(\*\)$/u, ''));
  }

  function projectRows(rows, fields) {
    const selectedFields = parseSelectFields(fields);
    if (!selectedFields) return rows.map((row) => clone(row));
    return rows.map((row) => {
      const projected = {};
      for (const field of selectedFields) {
        if (field in row) projected[field] = row[field];
      }
      return projected;
    });
  }

  function matchesFilters(row, filters) {
    return filters.every((filter) => {
      if (filter.type === 'eq') return row?.[filter.column] === filter.value;
      if (filter.type === 'in') return filter.values.includes(row?.[filter.column]);
      return true;
    });
  }

  function nextIdFor(table) {
    const current = nextIds[table] || 1;
    nextIds[table] = current + 1;
    return current;
  }

  class QueryBuilder {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.operation = null;
      this.payload = null;
      this.options = null;
      this.fields = null;
    }

    select(fields) {
      this.fields = fields;
      return this;
    }

    eq(column, value) {
      this.filters.push({ type: 'eq', column, value });
      return this;
    }

    in(column, values) {
      this.filters.push({ type: 'in', column, values: Array.isArray(values) ? values : [] });
      return this;
    }

    order() {
      return this;
    }

    upsert(payload, options = {}) {
      this.operation = 'upsert';
      this.payload = Array.isArray(payload) ? payload : [payload];
      this.options = options;
      return this;
    }

    insert(payload) {
      this.operation = 'insert';
      this.payload = Array.isArray(payload) ? payload : [payload];
      this.options = null;
      return this;
    }

    update(payload) {
      this.operation = 'update';
      this.payload = payload && typeof payload === 'object' ? payload : {};
      this.options = null;
      return this;
    }

    delete() {
      this.operation = 'delete';
      this.payload = null;
      this.options = null;
      return this;
    }

    async maybeSingle() {
      const rows = ensureTable(this.table).filter((row) => matchesFilters(row, this.filters));
      const projected = projectRows(rows, this.fields);
      return { data: projected[0] || null, error: null };
    }

    async execute() {
      const tableRows = ensureTable(this.table);

      if (this.operation === 'upsert') {
        const touched = [];
        const conflictKeys = String(this.options?.onConflict || '')
          .split(',')
          .map((part) => String(part || '').trim())
          .filter(Boolean);

        for (const sourceRow of this.payload || []) {
          const row = clone(sourceRow);
          let index = -1;
          if (conflictKeys.length) {
            index = tableRows.findIndex((existing) =>
              conflictKeys.every((key) => existing?.[key] === row?.[key]),
            );
          }

          if (index >= 0) {
            row.id = tableRows[index]?.id ?? row.id;
            tableRows[index] = { ...tableRows[index], ...row };
            touched.push(tableRows[index]);
            continue;
          }

          if (
            row.id == null &&
            (this.table === 'accounts' || this.table === 'transactions' || this.table === 'import_runs')
          ) {
            row.id = nextIdFor(this.table);
          }

          tableRows.push(row);
          touched.push(row);
        }

        return {
          data: this.fields ? projectRows(touched, this.fields) : null,
          error: null,
        };
      }

      if (this.operation === 'insert') {
        const inserted = [];
        for (const sourceRow of this.payload || []) {
          const row = clone(sourceRow);
          if (
            row.id == null &&
            (this.table === 'accounts' || this.table === 'transactions' || this.table === 'import_runs')
          ) {
            row.id = nextIdFor(this.table);
          }
          tableRows.push(row);
          inserted.push(row);
        }

        return {
          data: this.fields ? projectRows(inserted, this.fields) : null,
          error: null,
        };
      }

      if (this.operation === 'update') {
        for (let index = 0; index < tableRows.length; index += 1) {
          if (!matchesFilters(tableRows[index], this.filters)) continue;
          tableRows[index] = { ...tableRows[index], ...clone(this.payload) };
        }
        return { data: null, error: null };
      }

      if (this.operation === 'delete') {
        const kept = tableRows.filter((row) => !matchesFilters(row, this.filters));
        tables[this.table] = kept;
        return { data: null, error: null };
      }

      const projected = projectRows(
        tableRows.filter((row) => matchesFilters(row, this.filters)),
        this.fields,
      );
      return { data: projected, error: null };
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }
  }

  return {
    admin: {
      from(table) {
        return new QueryBuilder(table);
      },
    },
    tables,
  };
}

test('money: negative/zero/excess decimals are sanitized and parsed safely', () => {
  assert.equal(sanitizeMoneyInput('-฿ 1,234.5678'), '-1234.56');
  assert.equal(parseMoneyToSatang('-1234.5678'), -123456);
  assert.equal(parseMoneyToSatang('0.00'), 0);
  assert.equal(parseMoneyToSatang('-'), 0);
  assert.equal(ensureSatangInt('12.9'), 12);
  assert.equal(satangToBahtNumber(-5), -0.05);
});

test('money: satang rounding for number input follows Math.round boundaries', () => {
  assert.equal(parseMoneyToSatang(10.005), 1001);
  assert.equal(parseMoneyToSatang(10.004), 1000);
  assert.equal(parseMoneyToSatang(-1.005), -100);
});

test('money: mixed Thai/Arabic digits parsing works', () => {
  assert.equal(parseMoneyToSatang('๑2๓.4๕'), 12345);
  assert.equal(parseMoneyToSatang('-๐.๐๙'), -9);
});

test('money unit: legacy aliases resolve consistently across boot, storage, and import paths', () => {
  assert.equal(resolveMoneyUnit('THB'), 'baht');
  assert.equal(resolveMoneyUnit('', 'baht'), 'baht');
  assert.equal(readMoneyUnit({ amountUnit: 'thb' }), 'baht');
  assert.equal(readMoneyUnit({ moneyUnit: 'satang', amountUnit: 'baht' }), 'satang');
  assert.equal(hasExplicitMoneyUnit({ amountUnit: 'baht' }), true);
  assert.equal(hasExplicitMoneyUnit({}), false);
});

test('transferGrouping: incomplete transfer pair returns single-leg fallback', () => {
  const tx = {
    id: 'tx-out-1',
    isTransfer: true,
    type: 'expense',
    transferId: 'T-missing-leg',
    amount: 5000,
    date: '2026-01-04',
    accountId: 'bank-a',
  };

  const pair = getTransferPair(tx, [tx]);
  assert.ok(pair);
  assert.equal(pair.outTx?.id, 'tx-out-1');
  assert.equal(pair.inTx, null);
  assert.deepEqual(pair.group.map((g) => g.id), ['tx-out-1']);
});

test('receiptAdjustments: reconciliation appends discount/fee so signed sum matches target', () => {
  const baseGroups = [
    { key: 'food', amount: 10000, adjustmentEffect: 'add' },
    { key: 'drinks', amount: 2750, adjustmentEffect: 'add' },
  ];

  const targetLower = 12500; // need subtract 250 satang
  const reconciledLower = reconcileReceiptGroups(baseGroups, targetLower);
  const sumsLower = computeReceiptSumsSatang(reconciledLower.groups);
  assert.equal(sumsLower.netSatang, targetLower);
  assert.equal(reconciledLower.meta.adjustmentEffect, 'subtract');

  const targetHigher = 13000; // need add 250 satang
  const reconciledHigher = reconcileReceiptGroups(baseGroups, targetHigher);
  const signed = reconciledHigher.groups.reduce((s, g) => s + signedReceiptGroupSatang(g), 0);
  assert.equal(signed, targetHigher);
  assert.equal(reconciledHigher.meta.adjustmentEffect, 'add');
});

test('receiptCategorizer: split lines parse mixed Thai/Arabic number strings', () => {
  const lines = splitReceiptItemsToLines(
    'expense',
    {
      items: [
        { name: 'น้ำดื่ม', total: '๑2.3๔' },
        { name: 'ส่วนลดท้ายบิล', total: '-๐.๕๐' },
      ],
    },
    'ร้านสะดวกซื้อ',
    'food',
  );

  const water = lines.find((l) => l.name === 'น้ำดื่ม');
  const discount = lines.find((l) => l.name === 'ส่วนลดท้ายบิล');

  assert.ok(water);
  assert.equal(water.amount, 12.34);
  assert.equal(water.receiptLineType, 'item');

  assert.ok(discount);
  assert.equal(discount.receiptLineType, 'adjustment');
  assert.equal(discount.adjustmentEffect, 'subtract');
  assert.equal(discount.amount, 0.5);
});

test('receiptCategorizer: child lines flatten into counted split lines without double counting', () => {
  const lines = splitReceiptItemsToLines(
    'expense',
    {
      items: [
        {
          name: 'Breakfast set',
          total: '150.00',
          children: [
            { name: 'Coffee', total: '40.00', category_key: 'coffee' },
            { name: 'Sandwich', total: '110.00', category_key: 'food' },
          ],
        },
      ],
    },
    'Cafe Bloom',
    'food',
  );

  assert.equal(lines.length, 2);
  assert.deepEqual(
    lines.map((line) => ({ name: line.name, key: line.key, amount: line.amount })),
    [
      { name: 'Coffee', key: 'coffee', amount: 40 },
      { name: 'Sandwich', key: 'dining', amount: 110 },
    ],
  );
  assert.equal(lines.reduce((sum, line) => sum + parseMoneyToSatang(line.amount), 0), 15000);
});

test('receiptCategorizer: top-level category prefers dominant category and only uses mixed for material multi-category receipts', () => {
  assert.equal(
    deriveReceiptCategoryKey(
      'expense',
      [
        { name: 'Lunch set', amountSatang: 9000, categoryId: 'food' },
        { name: 'Bottle water', amountSatang: 400, categoryId: 'drinks' },
      ],
      'Cafe Bloom',
      'food',
    ),
    'dining',
  );

  assert.equal(
    deriveReceiptCategoryKey(
      'expense',
      [
        { name: 'Lunch set', amountSatang: 6000, categoryId: 'food' },
        { name: 'Phone cable', amountSatang: 5000, categoryId: 'gadgets' },
      ],
      'Mall receipt',
      'shopping',
    ),
    'mixed',
  );
});

test('receiptCategorizer: scan item categories resolve to precise assignable leaves', () => {
  const broadIds = new Set(['food', 'transport', 'bills', 'utilities', 'shopping', 'groceries', 'home', 'mixed']);
  const samples = [
    ['น้ำดื่ม', 'drinks'],
    ['กาแฟ/ชา', 'coffee'],
    ['ขนม', 'snacks'],
    ['ข้าว/อาหารจานเดียว', 'dining'],
    ['ค่าไฟ PEA MEA', 'electricity'],
    ['ค่าน้ำ', 'water'],
    ['AIS True dtac mobile bill', 'phone_internet'],
    ['internet fiber broadband', 'internet_home'],
    ['น้ำยาล้างจาน', 'household_cleaning'],
    ['ผงซักฟอก', 'laundry_supplies'],
    ['ทิชชู่ กระดาษ', 'paper_goods'],
    ['ยาสีฟัน แปรงสีฟัน', 'oral_care'],
    ['ยา ร้านขายยา', 'pharmacy'],
    ['Grab Bolt ride', 'ride_hailing'],
    ['ค่าส่งพัสดุ', 'shipping'],
  ];

  for (const [text, expected] of samples) {
    const categoryId = inferCategoryKeyFromText('expense', text);
    assert.equal(categoryId, expected, text);
    assert.equal(broadIds.has(categoryId), false, text);
  }

  assert.equal(sanitizeCategoryKey('food'), 'dining');
  assert.equal(sanitizeCategoryKey('groceries'), 'packaged_food');
  assert.equal(sanitizeCategoryKey('home'), 'household_cleaning');
  assert.equal(sanitizeCategoryKey('bills'), 'subscriptions');
  assert.equal(sanitizeCategoryKey('mixed'), 'other');
});

test('receiptCategorizer: splitReceiptItemsToLines keeps supermarket items as precise line categories', () => {
  const broadIds = new Set(['groceries', 'utilities', 'bills', 'food', 'shopping', 'home']);
  const lines = splitReceiptItemsToLines(
    'expense',
    {
      items: [
        { name: '\u0e19\u0e49\u0e33\u0e14\u0e37\u0e48\u0e21', total: '12.00', category_key: 'groceries' },
        { name: '\u0e02\u0e19\u0e21', total: '15.00', category_key: 'food' },
        { name: '\u0e1c\u0e07\u0e0b\u0e31\u0e01\u0e1f\u0e2d\u0e01', total: '38.00', category_key: 'shopping' },
      ],
      adjustments: [{ name: 'Member discount', amount: '5.00', effect: 'subtract', type: 'discount' }],
      targetTotalSatang: 6000,
    },
    'Lotus 7-Eleven',
    'groceries',
  );

  const categories = new Map(lines.map((line) => [line.name, line.key || line.category_key]));
  assert.equal(categories.get('\u0e19\u0e49\u0e33\u0e14\u0e37\u0e48\u0e21'), 'drinks');
  assert.equal(categories.get('\u0e02\u0e19\u0e21'), 'snacks');
  assert.equal(categories.get('\u0e1c\u0e07\u0e0b\u0e31\u0e01\u0e1f\u0e2d\u0e01'), 'laundry_supplies');

  for (const line of lines) {
    assert.equal(broadIds.has(line.key || line.category_key), false, line.name);
  }
  assert.equal(lines.find((line) => line.receiptLineType === 'adjustment')?.adjustmentEffect, 'subtract');

  const signedTotal = lines.reduce((sum, line) => {
    const amountSatang = parseMoneyToSatang(line.amount);
    return sum + (line.adjustmentEffect === 'subtract' ? -amountSatang : amountSatang);
  }, 0);
  assert.equal(signedTotal, 6000);
});

test('receiptCategorizer: positive discount lines stay adjustments instead of purchased items', () => {
  const lines = splitReceiptItemsToLines(
    'expense',
    {
      items: [
        { name: 'Americano', total: '60.00', category_key: 'coffee' },
        { name: 'Member discount', total: '10.00' },
      ],
    },
    'Cafe Amazon',
    'coffee',
  );

  assert.equal(lines.filter((line) => line.receiptLineType === 'item').length, 1);
  assert.equal(lines.filter((line) => line.receiptLineType === 'adjustment').length, 1);
  assert.equal(lines.find((line) => line.receiptLineType === 'adjustment')?.adjustmentEffect, 'subtract');
});

test('recurring: monthly rollover clamps to end of month without losing anchor day', () => {
  const febDue = advanceRecurringDate(new Date(2026, 0, 31), 'monthly', 1, 31);
  assert.equal(febDue.getFullYear(), 2026);
  assert.equal(febDue.getMonth(), 1);
  assert.equal(febDue.getDate(), 28);

  const nextDue = getNextRecurringDueISO(
    {
      startDate: '2026-01-31',
      lastGenerated: '2026-02-28',
      frequency: 'monthly',
      interval: 1,
    },
    '2026-03-07',
  );

  assert.equal(nextDue, '2026-03-31');
});

test('recurring: explicit anchor_day keeps month-end rules aligned after February clamp', () => {
  const nextDue = getNextRecurringDueISO(
    {
      startDate: '2026-01-31',
      lastGenerated: '2026-02-28',
      frequency: 'monthly',
      interval: 1,
      anchor_day: 31,
    },
    '2026-03-01',
  );

  assert.equal(nextDue, '2026-03-31');
});

test('recurring: daily frequency advances by interval days', () => {
  const nextDue = advanceRecurringDate(new Date(2026, 3, 18), 'daily', 3, 18);
  assert.equal(nextDue.getFullYear(), 2026);
  assert.equal(nextDue.getMonth(), 3);
  assert.equal(nextDue.getDate(), 21);
});

test('recurring: yearly frequency preserves anchor day when possible', () => {
  const nextDue = getNextRecurringDueISO(
    {
      start_date: '2024-02-29',
      last_generated_date: '2024-02-29',
      frequency: 'yearly',
      interval_count: 1,
      anchor_day: 29,
    },
    '2025-02-28',
  );

  assert.equal(nextDue, '2025-02-28');
});

test('credit dates: billing days clamp to the valid statement range', () => {
  assert.equal(clampBillingDay(0), 1);
  assert.equal(clampBillingDay('32'), 31);
  assert.equal(clampBillingDay('12.9'), 12);
  assert.equal(clampBillingDay('bad'), 1);
});

test('credit dates: next statement date clamps month ends safely', () => {
  assert.equal(getNextStatementDate(31, '2026-02-01'), '2026-02-28');
  assert.equal(getNextStatementDate(31, '2026-02-28'), '2026-02-28');
  assert.equal(getNextStatementDate(31, '2026-03-01'), '2026-03-31');
});

test('credit dates: next due date follows the nearest open billing cycle', () => {
  assert.equal(getNextDueDate(20, 5, '2026-02-01'), '2026-02-05');
  assert.equal(getNextDueDate(20, 5, '2026-02-06'), '2026-03-05');
  assert.equal(getNextDueDate(20, 5, '2026-02-25'), '2026-03-05');
  assert.equal(getNextDueDate(20, 25, '2026-02-01'), '2026-02-25');
  assert.equal(getNextDueDate(31, 31, '2026-02-01'), '2026-02-28');
  assert.equal(getNextDueDate(31, 5, '2026-03-01'), '2026-03-05');
});

test('credit planner: billing cycle keys clamp month-end statement and due dates', () => {
  const account = { id: 'card-1', type: 'credit', statementDay: 31, dueDay: 5 };
  const cycle = getBillingCycleForCard(account, '2026-03-01');

  assert.equal(cycle.statementDate, '2026-02-28');
  assert.equal(cycle.dueDate, '2026-03-05');
  assert.equal(cycle.cycleKey, 'card-1:2026-02-28');
  assert.equal(makeCreditStatementCycleKey('card-1', '2026-02-28'), cycle.cycleKey);
});

test('credit planner: statements needing input include missing credit cycles only', () => {
  const accounts = [
    { id: 'card-a', name: 'Card A', type: 'credit', statementDay: 20, dueDay: 5 },
    { id: 'card-b', name: 'Card B', type: 'credit', statementDay: 15, dueDay: 25 },
    { id: 'cash', name: 'Cash', type: 'cash', statementDay: 1, dueDay: 1 },
  ];
  const existing = [
    normalizePlannerCreditStatement({
      accountId: 'card-a',
      statementDate: '2026-06-20',
      dueDate: '2026-07-05',
      fullDue: 100_000,
      minimumDue: 10_000,
    }),
  ];

  const missing = getStatementsNeedingInput(accounts, existing, '2026-06-21');

  assert.deepEqual(missing.map((item) => item.accountId), ['card-b']);
  assert.equal(missing[0].cycleKey, 'card-b:2026-06-15');
  assert.equal(missing[0].dueDate, '2026-06-25');
});

test('credit planner: reminder summary surfaces input needs, open totals, and due-soon warnings', () => {
  const accounts = [
    { id: 'card-input', name: 'Needs Input', type: 'credit', statementDay: 20, dueDay: 5 },
    { id: 'card-open', name: 'Open Card', type: 'credit', statementDay: 15, dueDay: 25 },
    { id: 'cash', name: 'Cash', type: 'cash' },
  ];
  const creditStatements = [
    { id: 'stmt-open', accountId: 'card-open', statementDate: '2026-06-15', dueDate: '2026-06-25', fullDue: 120_000, paidAmount: 20_000, minimumDue: 10_000, status: 'open' },
    { id: 'stmt-paid', accountId: 'card-input', statementDate: '2026-05-20', dueDate: '2026-06-05', fullDue: 80_000, paidAmount: 80_000, minimumDue: 8_000, status: 'paid' },
  ];

  const summary = getCreditStatementReminderSummary(accounts, creditStatements, '2026-06-21');

  assert.equal(summary.needingInputCount, 1);
  assert.deepEqual(summary.cardsNeedingInput.map((item) => item.accountId), ['card-input']);
  assert.equal(summary.openStatementCount, 1);
  assert.equal(summary.totalOpenFullDue, 100_000);
  assert.equal(summary.nearestDueDate, '2026-06-25');
  assert.equal(summary.hasDueSoon, true);
  assert.equal(summary.dueSoonStatements[0].accountId, 'card-open');
  assert.equal(summary.nextAction, 'input');
});

test('credit planner: account status prioritizes due soon, input needed, open, then normal', () => {
  const accounts = [
    { id: 'due', name: 'Due Soon', type: 'credit', statementDay: 10, dueDay: 25 },
    { id: 'input', name: 'Needs Input', type: 'credit', statementDay: 20, dueDay: 5 },
    { id: 'open', name: 'Open', type: 'credit', statementDay: 15, dueDay: 28 },
    { id: 'normal', name: 'Normal', type: 'credit', statementDay: 25, dueDay: 10 },
  ];
  const statements = [
    { id: 'stmt-due', accountId: 'due', statementDate: '2026-06-10', dueDate: '2026-06-25', fullDue: 100_000, paidAmount: 0, minimumDue: 10_000, status: 'planned' },
    { id: 'stmt-open', accountId: 'open', statementDate: '2026-06-15', dueDate: '2026-06-28', fullDue: 90_000, paidAmount: 10_000, minimumDue: 9_000, status: 'open' },
    { id: 'stmt-normal', accountId: 'normal', statementDate: '2026-05-25', dueDate: '2026-06-10', fullDue: 40_000, paidAmount: 40_000, minimumDue: 4_000, status: 'paid' },
  ];

  assert.equal(getCreditCardStatementStatus(accounts[0], statements, '2026-06-21').status, 'due_soon');
  assert.equal(getCreditCardStatementStatus(accounts[0], statements, '2026-06-21').label, 'ครบกำหนดใกล้ถึง');
  assert.equal(getCreditCardStatementStatus(accounts[1], statements, '2026-06-21').status, 'needs_input');
  assert.equal(getCreditCardStatementStatus(accounts[2], statements, '2026-06-21').status, 'open');
  assert.equal(getCreditCardStatementStatus(accounts[3], statements, '2026-06-21').status, 'normal');
});

test('credit planner: normalizes legacy and new statement fields as positive satang', () => {
  const normalized = normalizePlannerCreditStatement({
    account_id: 'card-1',
    statement_date: '2026-06-20',
    due_date: '2026-07-05',
    statement_balance_satang: 120_000,
    minimum_due_satang: 12_000,
    paid_amount_satang: 2_000,
    planned_pay_amount_satang: 10_000,
    status: 'planned',
    note: 'June cycle',
    created_at: 100,
    updated_at: 200,
  });

  assert.equal(normalized.id, 'credit_statement_card-1_2026-06-20');
  assert.equal(normalized.cycleKey, 'card-1:2026-06-20');
  assert.equal(normalized.fullDue, 120_000);
  assert.equal(normalized.statementBalance, 120_000);
  assert.equal(normalized.minimumDue, 12_000);
  assert.equal(normalized.paidAmount, 2_000);
  assert.equal(normalized.plannedPayAmount, 10_000);
  assert.equal(normalized.status, 'planned');
});

test('credit planner: pays minimums by due date before allocating due-date extra', () => {
  const accounts = [
    { id: 'card-a', name: 'Earlier', type: 'credit' },
    { id: 'card-b', name: 'Later', type: 'credit' },
    { id: 'cash', name: 'Cash', type: 'cash' },
  ];
  const creditStatements = [
    { id: 'stmt-b', accountId: 'card-b', statementDate: '2026-06-20', dueDate: '2026-07-10', fullDue: 100_000, minimumDue: 10_000, status: 'open' },
    { id: 'stmt-a', accountId: 'card-a', statementDate: '2026-06-15', dueDate: '2026-07-05', fullDue: 50_000, minimumDue: 20_000, status: 'open' },
  ];

  const plan = calculateCreditPaymentPlan({
    accounts,
    creditStatements,
    salaryAmount: 40_000,
    reserveAmount: 0,
    debtBudget: 0,
    strategy: 'due_date',
    todayDate: '2026-06-21',
  });

  assert.deepEqual(plan.payments.map((payment) => payment.accountId), ['card-a', 'card-b']);
  assert.equal(plan.totalMinimumRequired, 30_000);
  assert.equal(plan.totalFullDue, 150_000);
  assert.equal(plan.availableDebtBudget, 40_000);
  assert.equal(plan.payments[0].recommendedPayment, 30_000);
  assert.equal(plan.payments[0].extraPayment, 10_000);
  assert.equal(plan.payments[1].recommendedPayment, 10_000);
  assert.equal(plan.shortfall, 0);
});

test('credit planner: insufficient budget funds nearest minimums first and warns', () => {
  const accounts = [
    { id: 'card-a', type: 'credit' },
    { id: 'card-b', type: 'credit' },
  ];
  const creditStatements = [
    { id: 'stmt-a', accountId: 'card-a', statementDate: '2026-06-15', dueDate: '2026-07-05', fullDue: 50_000, minimumDue: 20_000, status: 'open' },
    { id: 'stmt-b', accountId: 'card-b', statementDate: '2026-06-20', dueDate: '2026-07-10', fullDue: 100_000, minimumDue: 10_000, status: 'planned' },
  ];

  const plan = calculateCreditPaymentPlan({
    accounts,
    creditStatements,
    salaryAmount: 15_000,
    reserveAmount: 0,
    debtBudget: 0,
    strategy: 'due_date',
  });

  assert.equal(plan.totalMinimumRequired, 30_000);
  assert.equal(plan.availableDebtBudget, 15_000);
  assert.equal(plan.shortfall, 15_000);
  assert.ok(plan.warnings.includes('minimum_due_shortfall'));
  assert.equal(plan.payments[0].recommendedPayment, 15_000);
  assert.equal(plan.payments[1].recommendedPayment, 0);
  assert.ok(plan.payments[0].warnings.includes('minimum_due_not_fully_funded'));
  assert.ok(plan.payments[1].warnings.includes('minimum_due_not_fully_funded'));
});

test('credit planner: explicit debt budget overrides salary minus reserve', () => {
  const accounts = [{ id: 'card-a', type: 'credit' }];
  const creditStatements = [
    { id: 'stmt-a', accountId: 'card-a', statementDate: '2026-06-15', dueDate: '2026-07-05', fullDue: 50_000, minimumDue: 10_000, status: 'open' },
  ];

  const plan = calculateCreditPaymentPlan({
    accounts,
    creditStatements,
    salaryAmount: 100_000,
    reserveAmount: 90_000,
    debtBudget: 30_000,
    strategy: 'due_date',
  });

  assert.equal(plan.availableDebtBudget, 30_000);
  assert.equal(plan.totalMinimumRequired, 10_000);
  assert.equal(plan.totalRecommended, 30_000);
  assert.equal(plan.payments[0].recommendedPayment, 30_000);
  assert.equal(plan.payments[0].remainingAfterPayment, 20_000);
});

test('credit planner: full payoff never recommends more than remaining full due', () => {
  const accounts = [
    { id: 'card-a', type: 'credit' },
    { id: 'card-b', type: 'credit' },
  ];
  const creditStatements = [
    { id: 'stmt-a', accountId: 'card-a', statementDate: '2026-06-15', dueDate: '2026-07-05', fullDue: 100_000, paidAmount: 40_000, minimumDue: 20_000, status: 'open' },
    { id: 'stmt-b', accountId: 'card-b', statementDate: '2026-06-20', dueDate: '2026-07-10', fullDue: 90_000, paidAmount: 0, minimumDue: 30_000, status: 'planned' },
  ];

  const plan = calculateCreditPaymentPlan({
    accounts,
    creditStatements,
    salaryAmount: 220_000,
    reserveAmount: 20_000,
    debtBudget: 0,
    strategy: 'highest_balance',
  });

  assert.equal(plan.availableDebtBudget, 200_000);
  assert.equal(plan.totalFullDue, 150_000);
  assert.equal(plan.totalRecommended, 150_000);
  assert.equal(plan.surplus, 50_000);
  assert.equal(plan.payments.find((payment) => payment.accountId === 'card-a').recommendedPayment, 60_000);
  assert.equal(plan.payments.find((payment) => payment.accountId === 'card-b').recommendedPayment, 90_000);
});

test('credit planner: extra payment strategies differ after minimums', () => {
  const accounts = [
    { id: 'large', type: 'credit' },
    { id: 'small', type: 'credit' },
  ];
  const creditStatements = [
    { id: 'stmt-large', accountId: 'large', statementDate: '2026-06-15', dueDate: '2026-07-08', fullDue: 100_000, minimumDue: 10_000, status: 'open' },
    { id: 'stmt-small', accountId: 'small', statementDate: '2026-06-15', dueDate: '2026-07-09', fullDue: 25_000, minimumDue: 10_000, status: 'open' },
  ];

  const highest = calculateCreditPaymentPlan({
    accounts,
    creditStatements,
    salaryAmount: 45_000,
    reserveAmount: 0,
    debtBudget: 0,
    strategy: 'highest_balance',
  });
  const snowball = calculateCreditPaymentPlan({
    accounts,
    creditStatements,
    salaryAmount: 45_000,
    reserveAmount: 0,
    debtBudget: 0,
    strategy: 'snowball',
  });

  assert.equal(highest.payments.find((payment) => payment.accountId === 'large').recommendedPayment, 35_000);
  assert.equal(highest.payments.find((payment) => payment.accountId === 'small').recommendedPayment, 10_000);
  assert.equal(snowball.payments.find((payment) => payment.accountId === 'small').recommendedPayment, 25_000);
  assert.equal(snowball.payments.find((payment) => payment.accountId === 'large').recommendedPayment, 20_000);
});

test('duplicate helpers: normalize comparable entries and duplicate reasons consistently', () => {
  const comparable = toDuplicateComparable({
    id: 'q-1',
    txType: 'credit_payment',
    referenceId: 'REF-001',
  });

  assert.equal(comparable.type, 'credit_payment');
  assert.equal(comparable.referenceId, 'REF-001');
  assert.equal(comparable.isTransfer, true);

  const dupState = duplicateStateFromMatch({
    isDuplicate: true,
    matchId: 'tx-1',
    score: 1,
    reasons: ['ref exact match'],
  });

  assert.equal(dupState.duplicate, true);
  assert.equal(dupState.duplicateInfo.kind, 'ref');
  assert.equal(dupState.duplicateInfo.matchId, 'tx-1');
});

test('scan date-time helpers: normalize transaction times and Thai digits', () => {
  assert.equal(normalizeTransactionTime('14:05'), '14:05');
  assert.equal(normalizeTransactionTime('14.05'), '14:05');
  assert.equal(normalizeTransactionTime('20:01:32'), '20:01:32');
  assert.equal(normalizeTransactionTime('2026-04-04T20:01:32+07:00'), '20:01:32');
  assert.equal(normalizeTransactionTime('\u0e40\u0e27\u0e25\u0e32 \u0e51\u0e53:\u0e54\u0e55'), '13:45');
  assert.equal(normalizeTransactionTime('1,234.56'), '');
});

test('scan date-time helpers: parse time from evidence text without amount false positives', () => {
  assert.equal(parseTransactionTimeFromText('Total 1,234.56\n\u0e40\u0e27\u0e25\u0e32 13:45'), '13:45');
  assert.equal(parseTransactionTimeFromText('Time 14:05'), '14:05');
  assert.equal(parseTransactionTimeFromText('paid 1,234.56 baht'), '');
});

test('transactions: newest-first sorting uses transactionTime before createdAt on the same date', () => {
  const sorted = [
    { id: 'created-only', date: '2026-04-04', createdAt: 9_999 },
    { id: 'early', date: '2026-04-04', transactionTime: '08:15', createdAt: 1 },
    { id: 'legacy', date: '2026-04-04', time: '19:59', createdAt: 1 },
    { id: 'late', date: '2026-04-04', transactionTime: '20:01:32', createdAt: 1 },
  ].sort(compareTxNewestFirst);

  assert.deepEqual(sorted.map((tx) => tx.id), ['late', 'legacy', 'early', 'created-only']);
});

test('money coach: flags a category that is over budget', () => {
  const insights = generateMoneyCoachInsights({
    todayISO: '2026-05-11',
    categories: { expense: [{ id: 'dining', name: 'Dining' }] },
    budgets: [{ month: '2026-05', categoryId: 'dining', limit: 10000 }],
    transactions: [
      { id: 'tx-1', type: 'expense', date: '2026-05-05', category: 'dining', amount: 15000 },
    ],
  });

  const categoryInsight = insights.find((insight) => insight.id === 'category_budget_dining');
  assert.equal(categoryInsight?.severity, 'danger');
  assert.equal(categoryInsight?.relatedCategoryId, 'dining');
});

test('money coach: warns when month-to-date spending is ahead of budget pace', () => {
  const insights = generateMoneyCoachInsights({
    todayISO: '2026-05-11',
    budgets: [{ month: '2026-05', categoryId: '__TOTAL__', limit: 300000 }],
    transactions: [
      { id: 'tx-1', type: 'expense', date: '2026-05-02', category: 'dining', amount: 140000 },
    ],
  });

  const paceInsight = insights.find((insight) => insight.id === 'monthly_spend_pace');
  assert.equal(paceInsight?.severity, 'warning');
  assert.equal(paceInsight?.actionTarget, 'budgets');
});

test('money coach: reports a positive savings rate when income stays ahead of expense', () => {
  const insights = generateMoneyCoachInsights({
    todayISO: '2026-05-11',
    transactions: [
      { id: 'income-1', type: 'income', date: '2026-05-01', category: 'salary', amount: 100000 },
      { id: 'expense-1', type: 'expense', date: '2026-05-02', category: 'dining', amount: 50000 },
    ],
  });

  const savingsInsight = insights.find((insight) => insight.id === 'savings_rate');
  assert.equal(savingsInsight?.severity, 'positive');
  assert.equal(savingsInsight?.metric, '50%');
});

test('money coach: detects likely duplicate transactions by merchant and amount', () => {
  const insights = generateMoneyCoachInsights({
    todayISO: '2026-05-11',
    transactions: [
      { id: 'tx-1', type: 'expense', date: '2026-05-09', merchant: 'Coffee Bar', amount: 12000 },
      { id: 'tx-2', type: 'expense', date: '2026-05-10', merchant: 'Coffee Bar', amount: 12000 },
    ],
  });

  const duplicateInsight = insights.find((insight) => insight.id === 'duplicate_possible');
  assert.equal(duplicateInsight?.severity, 'warning');
});

test('money coach: excludes split parents from budget calculations', () => {
  const insights = generateMoneyCoachInsights({
    todayISO: '2026-05-11',
    categories: { expense: [{ id: 'dining', name: 'Dining' }] },
    budgets: [{ month: '2026-05', categoryId: 'dining', limit: 50000 }],
    transactions: [
      {
        id: 'parent-1',
        type: 'expense',
        date: '2026-05-05',
        category: 'dining',
        amount: 900000,
        isSplitParent: true,
      },
      {
        id: 'child-1',
        type: 'expense',
        date: '2026-05-05',
        category: 'dining',
        amount: 20000,
        isSplitChild: true,
        splitParentId: 'parent-1',
      },
    ],
  });

  assert.equal(insights.some((insight) => insight.id === 'category_budget_dining'), false);
});

test('scan transaction type helpers: normalize scan type and infer receipt doc type from line items', () => {
  assert.equal(normalizeScannedTxType('credit_payment'), 'credit_payment');
  assert.equal(normalizeScannedTxType('unexpected'), 'expense');

  const scanResult = {
    tx_type: 'transfer',
    items: [
      { name: 'Water', total: '12.00' },
      { name: 'Promo line', total: '0.00' },
    ],
  };

  assert.equal(hasScannedLineItems(scanResult), true);
  assert.equal(
    resolveScannedDocType({
      docType: '',
      aiTxType: scanResult.tx_type,
      hasLineItems: hasScannedLineItems(scanResult),
    }),
    'receipt',
  );
  assert.equal(resolveScannedDocType({ aiTxType: 'transfer' }), 'transfer_slip');
  assert.equal(resolveScannedDocType({ docType: 'bill_payment', aiTxType: 'expense' }), 'bill_payment');
});

test('scan transaction type: account-aware transfer slip direction wins over AI type', () => {
  const bank = { id: 'kbank', type: 'bank', name: 'KBank' };
  const wallet = { id: 'wallet', type: 'wallet', name: 'Wallet' };
  const credit = { id: 'visa', type: 'credit', name: 'Visa' };

  assert.equal(
    resolveScannedTxTypeFromAccounts({
      docType: 'transfer_slip',
      aiTxType: 'transfer',
      matchedFromId: 'kbank',
      matchedFromAcc: bank,
      contextText: 'transfer to shop',
    }),
    'expense',
  );

  assert.equal(
    resolveScannedTxTypeFromAccounts({
      docType: 'transfer_slip',
      aiTxType: 'transfer',
      matchedFromAcc: bank,
      matchedToAcc: { name: 'External merchant account' },
      contextText: 'transfer to external shop account',
    }),
    'expense',
  );

  assert.equal(
    resolveScannedTxTypeFromAccounts({
      docType: 'transfer_slip',
      aiTxType: 'transfer',
      matchedToId: 'wallet',
      matchedToAcc: wallet,
      contextText: 'incoming transfer',
    }),
    'income',
  );

  assert.equal(
    resolveScannedTxTypeFromAccounts({
      docType: 'transfer_slip',
      aiTxType: 'expense',
      matchedFromId: 'kbank',
      matchedToId: 'wallet',
      matchedFromAcc: bank,
      matchedToAcc: wallet,
      contextText: 'transfer between own accounts',
    }),
    'transfer',
  );

  assert.equal(
    resolveScannedTxTypeFromAccounts({
      docType: 'bill_payment',
      aiTxType: 'transfer',
      matchedFromId: 'kbank',
      matchedToId: 'visa',
      matchedFromAcc: bank,
      matchedToAcc: credit,
      contextText: 'credit card payment',
    }),
    'credit_payment',
  );
});

test('scan transaction type: receipts and unknown unmatched scans stay conservative', () => {
  assert.equal(
    resolveScannedTxTypeFromAccounts({
      docType: 'receipt',
      aiTxType: 'transfer',
      hasLineItems: true,
      contextText: '7-Eleven receipt',
    }),
    'expense',
  );

  assert.equal(
    resolveScannedTxTypeFromAccounts({
      docType: 'transfer_slip',
      aiTxType: 'transfer',
      contextText: 'unknown recipient transfer',
    }),
    'expense',
  );
});

test('transaction detail resolver: selected split child resolves to parent with ordered receipt lines', () => {
  const accounts = [{ id: 'cash', name: 'Cash wallet', type: 'cash' }];
  const categories = {
    expense: [
      { id: 'mixed', name: 'Mixed' },
      { id: 'drinks', name: 'Drinks' },
      { id: 'snacks', name: 'Snacks' },
      { id: 'household_cleaning', name: 'Household cleaning' },
      { id: 'discount', name: 'Discount' },
    ],
  };
  const parent = {
    id: 'parent-1',
    type: 'expense',
    amount: 6000,
    date: '2026-04-04',
    transactionTime: '13:45',
    category: 'mixed',
    accountId: 'cash',
    merchant: 'Lotus',
    isSplitParent: true,
    splitGroupId: 'sg-1',
    attachmentId: 'att-1',
    fileHash: 'hash-1',
  };
  const water = {
    id: 'child-water',
    type: 'expense',
    amount: 1200,
    date: '2026-04-04',
    category: 'drinks',
    accountId: 'cash',
    itemName: 'Water',
    isSplitChild: true,
    splitParentId: 'parent-1',
    splitGroupId: 'sg-1',
    splitIndex: 1,
    attachmentId: 'att-1',
  };
  const snack = {
    id: 'child-snack',
    type: 'expense',
    amount: 1500,
    date: '2026-04-04',
    category: 'snacks',
    accountId: 'cash',
    itemName: 'Snack',
    isSplitChild: true,
    splitParentId: 'parent-1',
    splitGroupId: 'sg-1',
    splitIndex: 2,
    attachmentId: 'att-1',
  };
  const detergent = {
    id: 'child-detergent',
    type: 'expense',
    amount: 3800,
    date: '2026-04-04',
    category: 'household_cleaning',
    accountId: 'cash',
    itemName: 'Detergent',
    isSplitChild: true,
    splitParentId: 'parent-1',
    splitGroupId: 'sg-1',
    splitIndex: 3,
    attachmentId: 'att-1',
  };
  const discount = {
    id: 'child-discount',
    type: 'expense',
    amount: 500,
    date: '2026-04-04',
    category: 'discount',
    accountId: 'cash',
    itemName: 'Member discount',
    receiptLineType: 'adjustment',
    adjustmentEffect: 'subtract',
    adjustmentType: 'discount',
    isSplitChild: true,
    splitParentId: 'parent-1',
    splitGroupId: 'sg-1',
    splitIndex: 4,
    attachmentId: 'att-1',
  };

  const model = resolveTransactionDetailModel({
    transaction: snack,
    transactions: [parent, snack, discount, water, detergent],
    accounts,
    categories,
  });

  assert.equal(model.kind, 'split');
  assert.equal(model.primaryTxId, 'parent-1');
  assert.equal(model.editTargetId, 'parent-1');
  assert.equal(model.attachmentId, 'att-1');
  assert.equal(model.transactionTime, '13:45');
  assert.deepEqual(
    model.lines.map((line) => [line.itemName, line.categoryId, line.receiptLineType, line.adjustmentEffect]),
    [
      ['Water', 'drinks', 'item', 'add'],
      ['Snack', 'snacks', 'item', 'add'],
      ['Detergent', 'household_cleaning', 'item', 'add'],
      ['Member discount', 'discount', 'adjustment', 'subtract'],
    ],
  );
});

test('transaction detail resolver: transfer pair opens from selected leg and edits outgoing leg', () => {
  const accounts = [
    { id: 'bank', name: 'Checking', type: 'bank' },
    { id: 'visa', name: 'Visa', type: 'credit' },
  ];
  const outTx = {
    id: 'tx-out',
    type: 'expense',
    amount: 50000,
    date: '2026-04-04',
    transactionTime: '09:30',
    category: 'transfer',
    accountId: 'bank',
    isTransfer: true,
    transferId: 'tr-1',
    transferKind: 'credit_payment',
    ref: 'REF-1',
    attachmentId: 'att-slip',
  };
  const inTx = {
    id: 'tx-in',
    type: 'income',
    amount: 50000,
    date: '2026-04-04',
    transactionTime: '09:30',
    category: 'transfer',
    accountId: 'visa',
    isTransfer: true,
    transferId: 'tr-1',
    transferKind: 'credit_payment',
    ref: 'REF-1',
    attachmentId: 'att-slip',
  };

  const model = resolveTransactionDetailModel({
    transaction: inTx,
    transactions: [inTx, outTx],
    accounts,
    categories: { expense: [{ id: 'transfer', name: 'Transfer' }] },
  });

  assert.equal(model.kind, 'transfer');
  assert.equal(model.txType, 'credit_payment');
  assert.equal(model.primaryTxId, 'tx-out');
  assert.equal(model.editTargetId, 'tx-out');
  assert.equal(model.transfer.fromAccountName, 'Checking');
  assert.equal(model.transfer.toAccountName, 'Visa');
  assert.equal(model.attachmentId, 'att-slip');
});

test('transaction detail resolver: runtime snake-case rows expose amount and raw receipt lines', () => {
  const model = resolveTransactionDetailModel({
    transaction: {
      id: 42,
      kind: 'expense',
      amount_satang: 2222,
      date: '2026-04-04',
      category_id: 'drinks',
      account_id: 'cash',
      merchant: 'Mini mart',
      reference: 'R-42',
      raw: {
        time: '20:01',
        source: 'scan',
        receiptLines: [{ name: 'Water', amountSatang: 2222, categoryId: 'drinks' }],
      },
    },
    transactions: [],
    accounts: [{ id: 'cash', name: 'Cash wallet' }],
    categories: { expense: [{ id: 'drinks', name: 'Drinks' }] },
  });

  assert.equal(model.kind, 'normal');
  assert.equal(model.amountSatang, 2222);
  assert.equal(model.accountName, 'Cash wallet');
  assert.equal(model.categoryName, 'Drinks');
  assert.equal(model.transactionTime, '20:01');
  assert.equal(model.ref, 'R-42');
  assert.deepEqual(model.lines.map((line) => [line.itemName, line.categoryId, line.amountSatang]), [
    ['Water', 'drinks', 2222],
  ]);
});

test('transaction detail resolver: old transactions without time and old broad categories stay displayable', () => {
  const model = resolveTransactionDetailModel({
    transaction: {
      id: 'legacy-1',
      type: 'expense',
      amount: 12345,
      date: '2026-04-04',
      category: 'food',
      accountId: 'cash',
      note: 'Old broad category transaction',
      attachmentId: 'legacy-attachment',
    },
    transactions: [],
    accounts: [{ id: 'cash', name: 'Cash wallet' }],
    categories: { expense: [{ id: 'food', name: 'Food', assignable: false }] },
  });

  assert.equal(model.kind, 'normal');
  assert.equal(model.transactionTime, '');
  assert.equal(model.categoryName, 'Food');
  assert.equal(model.attachmentId, 'legacy-attachment');
});

test('attachment preview state: missing local blob resolves to Thai missing copy', () => {
  const state = resolveAttachmentPreviewState('att-missing', {
    url: null,
    mimeType: '',
    loading: false,
    resolved: true,
    missing: true,
  });

  assert.equal(state.hasAttachment, true);
  assert.equal(state.isMissing, true);
  assert.equal(state.isLoading, false);
  assert.equal(state.canOpen, false);
  assert.equal(state.label, 'ไฟล์แนบไม่พบในเครื่องนี้');
});

test('attachment preview state: loading only applies before resolution', () => {
  assert.equal(
    resolveAttachmentPreviewState('att-loading', {
      url: null,
      mimeType: '',
      loading: true,
      resolved: false,
      missing: false,
    }).isLoading,
    true,
  );

  assert.equal(
    resolveAttachmentPreviewState('att-resolved-empty', {
      url: null,
      mimeType: '',
      loading: false,
      resolved: true,
      missing: false,
    }).isMissing,
    true,
  );
});

test('attachment persistence source: hasBlob is based on stored blob size', () => {
  const source = readFileSync(new URL('../src/services/blobStore.js', import.meta.url), 'utf8');

  assert.match(
    source,
    /export async function hasBlob\(id\)\s*{\s*const info = await getBlobInfo\(id\);\s*return Number\(info\?\.size \|\| 0\) > 0;\s*}/,
  );
});

test('backup UI source: standard JSON backup copy says receipt images are excluded', () => {
  const source = readFileSync(new URL('../src/views/MoreView.jsx', import.meta.url), 'utf8');

  assert.match(source, /Backup JSON มาตรฐานไม่รวมรูปใบเสร็จ\/สลิป/);
  assert.match(source, /นำเข้า Backup JSON มาตรฐานอาจไม่มีรูปใบเสร็จ/);
});

test('attachment backup helpers: collect and normalize v2 attachment payloads', () => {
  const payload = {
    v: 2,
    exportedAt: '2026-05-20T00:00:00.000Z',
    data: {
      transactions: [
        { id: 'tx-1', attachmentId: 'att-1' },
        { id: 'tx-2', raw: { attachment_id: 'att-2' } },
        { id: 'tx-3', attachmentId: 'att-1' },
      ],
    },
    attachments: {
      'att-1': { dataUrl: 'data:image/png;base64,AAAA', mimeType: 'image/png', size: 12 },
      'att-2': { data_url: 'data:application/pdf;base64,BBBB', mime_type: 'application/pdf', size: '34' },
      empty: { dataUrl: '' },
    },
  };

  assert.deepEqual(Array.from(collectAttachmentIds(getBackupData(payload))).sort(), ['att-1', 'att-2']);
  assert.deepEqual(normalizeAttachmentBackupMap(payload.attachments), {
    'att-1': { dataUrl: 'data:image/png;base64,AAAA', mimeType: 'image/png', size: 12 },
    'att-2': { dataUrl: 'data:application/pdf;base64,BBBB', mimeType: 'application/pdf', size: 34 },
  });
  assert.equal(sumAttachmentBackupSize(normalizeAttachmentBackupMap(payload.attachments)), 46);
});

test('attachment import: unavailable IndexedDB does not count blobs as restored', async () => {
  const result = await importBlobsFromDataUrls({
    'att-node': { dataUrl: 'data:text/plain;base64,aGk=', mimeType: 'text/plain' },
  });

  assert.equal(result.imported, 0);
  assert.deepEqual(result.skipped, ['att-node']);
});

test('attachment backup UI source: exports v2 envelope and preserves restored blobs on import', () => {
  const source = readFileSync(new URL('../src/views/MoreView.jsx', import.meta.url), 'utf8');

  assert.match(source, /v:\s*2/);
  assert.match(source, /attachments,/);
  assert.match(source, /smart-expense-backup-with-receipts\.json/);
  assert.match(source, /importBackup\(validation\.data, \{ preserveBlobs: true \}\)/);
  assert.match(source, /totalSize >= LARGE_ATTACHMENT_BACKUP_BYTES/);
});

test('quick add source: daily entry stays guided and does not expose transfer shortcuts', () => {
  const source = readFileSync(new URL('../src/components/QuickAddSheet.jsx', import.meta.url), 'utf8');

  assert.match(source, /function StepLabel/);
  assert.match(source, /<StepLabel number="1">ยอดเงิน<\/StepLabel>/);
  assert.match(source, /<StepLabel number="2">บัญชี<\/StepLabel>/);
  assert.match(source, /<StepLabel number="3">หมวดหมู่<\/StepLabel>/);
  assert.match(source, /<StepLabel number="4">บันทึก<\/StepLabel>/);
  assert.match(source, /recentAccountForType\(state\.transactions \|\| \[\], accounts, "expense"\)/);
  assert.match(source, /recentCategoriesForType\(state\.transactions \|\| \[\], categoriesByType\.expense, "expense", 1\)/);
  assert.match(source, /const summaryText = `\$\{typeLabel\} \$\{summaryAmount\}/);
  assert.match(source, /หมวด \$\{selectedCategory\?\.name \|\| "ยังไม่เลือก"\}/);
  assert.match(source, /บัญชี \$\{selectedAccount\?\.name \|\| "ยังไม่เลือก"\}/);
  assert.match(source, /const saveDisabledReason = !parsedAmount/);
  assert.doesNotMatch(source, /ArrowRightLeft/);
  assert.doesNotMatch(source, /handleQuickTransfer/);
  assert.doesNotMatch(source, /txType: "transfer"/);
});

test('add transaction source: sticky review summary uses Thai-first save labels', () => {
  const source = readFileSync(new URL('../src/views/add-transaction/AddTransactionView.jsx', import.meta.url), 'utf8');

  assert.match(source, /function SaveReviewSummary/);
  assert.match(source, /<SaveReviewSummary[\s\S]*items=\{manualReviewItems\}/);
  assert.match(source, /title="ตรวจสอบคิวสแกนก่อนบันทึก"/);
  assert.match(source, /\{ label: "ประเภท", value: typeLabel \}/);
  assert.match(source, /\{ label: "ยอดเงิน", value: amountLabel \}/);
  assert.match(source, /\{ label: "วันที่", value: date \|\| "-" \}/);
  assert.match(source, /\{ label: "ไฟล์ทั้งหมด", value: String\(items\.length\) \}/);
  assert.match(source, /\{ label: "สแกนแล้ว", value: String\(ready \+ failed\) \}/);
  assert.match(source, /\{ label: "พร้อม", value: String\(ready\) \}/);
  assert.match(source, /\{ label: "ไม่สำเร็จ", value: String\(failed\) \}/);
  assert.match(source, /แยกหมวด \(Split\)/);
  assert.match(source, /ชื่อกลุ่มรายการย่อย \(Split\)/);
  assert.doesNotMatch(source, /\{ label: isSplitMode \? "Split" : "หมวด"/);
  assert.doesNotMatch(source, /\{ label: "Split", value: splitReady/);
  assert.doesNotMatch(source, /Advanced options/);
  assert.doesNotMatch(source, /Split label/);
});

test('stats source: period summary keeps reporting math and empty states actionable', () => {
  const source = readFileSync(new URL('../src/views/StatsView.jsx', import.meta.url), 'utf8');

  assert.match(source, /สรุปช่วงเวลานี้/);
  assert.match(source, /title="รายรับ"/);
  assert.match(source, /title="รายจ่าย"/);
  assert.match(source, /title="คงเหลือสุทธิ"/);
  assert.match(source, /title="จำนวนรายการ"/);
  assert.match(source, /title="เฉลี่ยรายจ่ายต่อวัน"/);
  assert.match(source, /ไม่รวม Transfer \/ Split parent/);
  assert.match(source, /ส่วนลดในใบเสร็จไม่นับเป็นรายจ่าย/);
  assert.match(source, /isReportableExpenseTransaction/);
  assert.match(source, /isReportableIncomeTransaction/);
  assert.match(source, /signedExpenseAmount\(t\)/);
  assert.match(source, /function StatsEmptyState/);
  assert.match(source, /store\.startNewTransaction\(\{ entryMode: "manual", txType: "expense" \}\)/);
  assert.match(source, /store\.startNewTransaction\(\{ entryMode: "scan", scanUploadKind: "receipt" \}\)/);
  assert.match(source, /title="ไม่มีรายการในหมวดนี้"/);
  assert.match(source, /onAdd=\{openManualEntry\}/);
  assert.match(source, /onScan=\{openReceiptScan\}/);
});

test('scan postprocess: detects transfer slip and extracts amount from Thai payment slip text', () => {
  const text = `
    SCB
    จ่ายเงินสำเร็จ
    08 มี.ค. 2569 - 14:21
    รหัสอ้างอิง: 12627021530cf8
    จาก
    VISA TEERAWUT SUEBSON
    ไปยัง
    you pa
    จำนวนเงิน 65.00
  `;

  assert.equal(detectScanTextDocType(text), 'transfer_slip');
  assert.equal(extractLikelyAmountFromScanText(text, { docType: 'transfer_slip' }), 65);
  assert.equal(extractMerchantFromScanText(text, { docType: 'transfer_slip' }), 'you pa');
});

test('scan postprocess: detects 7-Eleven style receipt screenshots and pulls receipt total', () => {
  const text = `
    รายการสั่งซื้อที่ร้านและ 7Delivery
    08/03/69 | 14:14
    เลขที่ใบเสร็จ 18604
    สาขา 7-Eleven โรงอาหารกลาง มธ.
    รายการสินค้า
    Hสตาร์บัคส์ดับเบิ้ลมัชชีอ 49.00
    ยอดสุทธิ 49.00
    All Member 0-2826-7777
  `;

  assert.equal(detectScanTextDocType(text), 'receipt');
  assert.equal(extractLikelyAmountFromScanText(text, { docType: 'receipt' }), 49);
  assert.equal(extractMerchantFromScanText(text, { docType: 'receipt' }), 'สาขา 7-Eleven โรงอาหารกลาง มธ.');
});

test('scan postprocess: picks single-item receipt total instead of member phone noise', () => {
  const text = `
    ใบเสร็จรับเงิน
    สาขา Test Mart
    รายการสินค้า
    กาแฟเย็น 49.00
    All Member 0-2826-7777
  `;

  assert.equal(detectScanTextDocType(text), 'receipt');
  assert.equal(extractLikelyAmountFromScanText(text, { docType: 'receipt' }), 49);
});

test('scan postprocess: reads transfer amount when amount label and value are on separate lines', () => {
  const text = `
    พร้อมเพย์
    โอนเงินสำเร็จ
    จาก
    123-4-56789-0
    ไปยัง
    ร้านค้าทดสอบ
    จำนวนเงิน
    430.00 บาท
    ค่าธรรมเนียม 0.00 บาท
    รหัสอ้างอิง 20260308123456
  `;

  assert.equal(detectScanTextDocType(text), 'transfer_slip');
  assert.equal(extractLikelyAmountFromScanText(text, { docType: 'transfer_slip' }), 430);
});

test('storage: loadAll defaults missing moneyUnit to satang and preserves explicit baht', (t) => {
  let raw = JSON.stringify({ data: { transactions: [] } });
  installBrowserGlobals(t, {
    getItem: () => raw,
  });

  const fallbackState = loadAll();
  assert.equal(fallbackState.moneyUnit, 'satang');

  raw = JSON.stringify({ data: { moneyUnit: 'baht', transactions: [] } });
  const explicitState = loadAll();
  assert.equal(explicitState.moneyUnit, 'baht');
});

test('backup normalization: wrapped payloads preserve merchants and normalize amountUnit consistently', () => {
  const normalized = normalizeBackupCore({
    data: {
      amountUnit: 'baht',
      merchants: [
        {
          id: 'merchant-1',
          canonical: 'Cafe Bloom',
          aliases: ['Cafe Bloom ถนนสุขุมวิท'],
          enabled: true,
          prefs: {
            expense: { categoryId: 'coffee', accountId: 'acc-1' },
            income: { categoryId: '', accountId: '' },
          },
        },
      ],
      transactions: [],
      accounts: [],
      categories: { expense: [], income: [] },
      budgets: [],
      recurring: [],
      rules: [],
      scanInbox: [],
    },
  });

  assert.equal(normalized.moneyUnit, 'baht');
  assert.equal(normalized.merchants.length, 1);
  assert.equal(normalized.merchants[0].canonical, 'Cafe Bloom');
  assert.deepEqual(normalized.goals, []);
  assert.ok(Array.isArray(normalized.inbox));
  assert.ok(Array.isArray(normalized.scanInbox));
});

test('credit statements: normalize model and default missing backups to empty list', () => {
  const empty = createInitialState({ transactions: [], accounts: [], categories: { expense: [], income: [] } });
  assert.deepEqual(empty.creditStatements, []);
  assert.deepEqual(empty.salaryPlans, []);

  const normalized = normalizeCreditStatement({
    account_id: 'card-1',
    month: '2026-05',
    statement_date: '2026-05-10',
    due_date: '2026-05-25',
    statement_balance_satang: 123_450,
    minimum_due_satang: 12_000,
    apr: '20.5',
    status: 'unknown',
    note: 'May statement',
    created_at: 100,
    updated_at: 200,
  });

  assert.equal(normalized.id, 'credit_statement_card-1_2026-05');
  assert.equal(normalized.accountId, 'card-1');
  assert.equal(normalized.cycleKey, 'card-1:2026-05-10');
  assert.equal(normalized.month, '2026-05');
  assert.equal(normalized.statementDate, '2026-05-10');
  assert.equal(normalized.dueDate, '2026-05-25');
  assert.equal(normalized.statementBalance, 123_450);
  assert.equal(normalized.fullDue, 123_450);
  assert.equal(normalized.minimumDue, 12_000);
  assert.equal(normalized.paidAmount, 0);
  assert.equal(normalized.plannedPayAmount, 0);
  assert.equal(normalized.apr, 20.5);
  assert.equal(normalized.status, 'open');

  const salaryPlan = normalizeSalaryPlan({
    month: '2026-06',
    salaryAmountSatang: 120_000,
    reserve_amount_satang: 40_000,
    debt_budget_satang: 70_000,
    strategy: 'snowball',
    created_at: 100,
    updated_at: 200,
  });

  assert.equal(salaryPlan.id, 'salary_plan_2026-06');
  assert.equal(salaryPlan.month, '2026-06');
  assert.equal(salaryPlan.salaryAmount, 120_000);
  assert.equal(salaryPlan.reserveAmount, 40_000);
  assert.equal(salaryPlan.debtBudget, 70_000);
  assert.equal(salaryPlan.strategy, 'snowball');

  const state = createInitialState({
    moneyUnit: 'baht',
    transactions: [],
    accounts: [],
    categories: { expense: [], income: [] },
    creditStatements: [
      {
        id: 'stmt-1',
        accountId: 'card-2',
        month: '2026-06',
        statementDate: '2026-06-12',
        dueDate: '2026-07-02',
        statementBalance: '1234.50',
        minimumDue: '125.25',
        status: 'paid',
      },
    ],
  });

  assert.equal(state.creditStatements.length, 1);
  assert.equal(state.creditStatements[0].statementBalance, 123_450);
  assert.equal(state.creditStatements[0].minimumDue, 12_525);
  assert.equal(state.creditStatements[0].status, 'paid');
  assert.deepEqual(state.salaryPlans, []);
});

test('credit statements and salary plans: persist through storage and backup validation', (t) => {
  let raw = '';
  installBrowserGlobals(t, {
    getItem: () => raw,
    setItem: (_key, value) => {
      raw = value;
    },
  });

  const statement = {
    id: 'stmt-card-1-2026-05',
    accountId: 'card-1',
    month: '2026-05',
    statementDate: '2026-05-10',
    dueDate: '2026-05-25',
    statementBalance: 500_000,
    minimumDue: 50_000,
    apr: 18,
    note: 'real minimum from bank',
    status: 'open',
    createdAt: 1,
    updatedAt: 2,
  };
  const salaryPlan = {
    id: 'salary-plan-2026-05',
    month: '2026-05',
    salaryAmount: 150_000,
    reserveAmount: 60_000,
    debtBudget: 80_000,
    strategy: 'due_date',
    createdAt: 3,
    updatedAt: 4,
  };

  saveAll({
    transactions: [],
    accounts: [],
    categories: { expense: [], income: [] },
    creditStatements: [statement],
    salaryPlans: [salaryPlan],
  });

  const saved = JSON.parse(raw);
  assert.equal(saved.data.creditStatements.length, 1);
  assert.equal(saved.data.creditStatements[0].minimumDue, 50_000);
  assert.equal(saved.data.salaryPlans.length, 1);
  assert.equal(saved.data.salaryPlans[0].salaryAmount, 150_000);

  const loaded = loadAll();
  assert.equal(loaded.creditStatements.length, 1);
  assert.equal(loaded.creditStatements[0].accountId, 'card-1');
  assert.equal(loaded.creditStatements[0].minimumDue, 50_000);
  assert.equal(loaded.salaryPlans.length, 1);
  assert.equal(loaded.salaryPlans[0].debtBudget, 80_000);

  const validation = validateBackupImport({ data: { moneyUnit: 'satang', creditStatements: [statement], salaryPlans: [salaryPlan] } });
  assert.equal(validation.success, true);
  assert.equal(validation.data.creditStatements.length, 1);
  assert.equal(validation.data.creditStatements[0].statementBalance, 500_000);
  assert.equal(validation.data.creditStatements[0].fullDue, 500_000);
  assert.equal(validation.data.salaryPlans.length, 1);
  assert.equal(validation.data.salaryPlans[0].reserveAmount, 60_000);

  const legacyValidation = validateBackupImport({ data: { moneyUnit: 'satang', transactions: [] } });
  assert.equal(legacyValidation.success, true);
  assert.deepEqual(legacyValidation.data.creditStatements, []);
  assert.deepEqual(legacyValidation.data.salaryPlans, []);
});

test('financial plan API source: keeps OpenAI usage server-side with strict JSON output', () => {
  const routeSource = readFileSync(new URL('../app/api/financial-plan/route.js', import.meta.url), 'utf8');
  const handlerSource = readFileSync(new URL('../server/legacy-api/financial-plan.js', import.meta.url), 'utf8');

  assert.match(routeSource, /server\/legacy-api\/financial-plan\.js/);
  assert.match(handlerSource, /process\.env\.OPENAI_API_KEY/);
  assert.doesNotMatch(handlerSource, /NEXT_PUBLIC_OPENAI/i);
  assert.match(handlerSource, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(handlerSource, /type:\s*"json_schema"/);
  assert.match(handlerSource, /strict:\s*true/);
  assert.match(handlerSource, /raw_transactions_not_allowed/);
  assert.match(handlerSource, /setSecurityHeaders/);
  assert.match(handlerSource, /enforceAccess/);
});

test('financial plan server: sanitizes snapshots and rejects raw transactions', () => {
  assert.throws(
    () => sanitizeServerFinancialSnapshot({ transactions: [{ id: 'raw-tx' }] }),
    /raw_transactions_not_allowed/,
  );

  const snapshot = sanitizeServerFinancialSnapshot({
    month: '2026-05',
    incomeTotal: 120_000,
    expenseTotal: 70_000,
    categorySpendTop: [{ categoryId: 'food', name: 'Food', amount: 20_000 }],
    cashAvailable: 500_000,
    accountsSummary: [{ id: 'cash', name: 'Cash', type: 'cash', balance: 500_000 }],
    creditCards: [{ accountId: 'card', name: 'Card', balance: 200_000, minimumDue: 20_000 }],
    creditStatements: [{ accountId: 'card', month: '2026-05', statementBalance: 200_000, minimumDue: 20_000 }],
    budgets: [{ categoryId: 'food', name: 'Food', limit: 40_000, spent: 20_000 }],
    deterministicDebtPlan: {
      strategy: 'avalanche',
      totals: { totalMinimum: 20_000, totalRecommended: 50_000, cashAfterPayments: 450_000 },
      cards: [{ accountId: 'card', name: 'Card', balance: 200_000, minimumDue: 20_000, recommendedPayment: 50_000 }],
      warnings: [],
    },
  });

  assert.deepEqual(Object.keys(snapshot), [
    'month',
    'incomeTotal',
    'expenseTotal',
    'categorySpendTop',
    'cashAvailable',
    'accountsSummary',
    'creditCards',
    'creditStatements',
    'budgets',
    'deterministicDebtPlan',
  ]);
  assert.equal(snapshot.month, '2026-05');
  assert.equal(snapshot.creditStatements[0].minimumDue, 20_000);

  const fallback = buildServerFinancialPlanFallback(snapshot, 'missing_openai_api_key');
  assert.ok(fallback.summary.includes(FINANCIAL_PLAN_DISCLAIMER));
  assert.equal(fallback.cashflowPlan.monthlyNet, 50_000);
  assert.equal(fallback.debtPlan.totalRecommendedPayment, 50_000);
  assert.ok(fallback.warnings.includes('missing_openai_api_key'));
});

test('financial plan service: posts sanitized snapshot without browser secrets', async (t) => {
  const originalFetch = globalThis.fetch;
  let captured = null;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const responsePlan = {
    summary: `${FINANCIAL_PLAN_DISCLAIMER} Monthly plan ready.`,
    cashflowPlan: {
      status: 'stable',
      monthlyNet: 90_000,
      cashAvailable: 480_000,
      recommendedExpenseLimit: 100_000,
      notes: ['Use snapshot totals only.'],
    },
    savingsPlan: {
      emergencyFundAction: 'Keep a cash buffer.',
      recommendedSavings: 20_000,
      notes: ['Prioritize liquidity.'],
    },
    debtPlan: {
      strategy: 'avalanche',
      totalRecommendedPayment: 50_000,
      cards: [{ accountId: 'card', name: 'Card', recommendedPayment: 50_000, reason: 'Highest APR first.' }],
      notes: ['Pay at least the statement minimum.'],
    },
    warnings: [],
    nextActions: ['Review statement due dates.'],
  };

  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ ok: true, plan: responsePlan }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const snapshot = buildFinancialSnapshot(
    {
      accounts: [
        { id: 'cash', name: 'Cash', type: 'cash', openingBalance: 500_000 },
        { id: 'card', name: 'Card', type: 'credit', openingBalance: 200_000, apr: 29 },
      ],
      categories: {
        expense: [{ id: 'food', name: 'Food' }],
        income: [{ id: 'salary', name: 'Salary' }],
      },
      transactions: [
        { id: 'income-raw-id', accountId: 'cash', type: 'income', amount: 120_000, category: 'salary', date: '2026-05-01' },
        { id: 'expense-raw-id', accountId: 'cash', type: 'expense', amount: 30_000, category: 'food', date: '2026-05-02' },
      ],
      creditStatements: [
        {
          id: 'stmt-card-2026-05',
          accountId: 'card',
          month: '2026-05',
          statementBalance: 200_000,
          minimumDue: 20_000,
          dueDate: '2026-05-25',
          apr: 29,
        },
      ],
      budgets: [{ categoryId: 'food', limit: 50_000, spent: 30_000 }],
    },
    { month: '2026-05', availableCashToPay: 70_000, minimumCashBuffer: 20_000, strategy: 'avalanche' },
  );

  assert.equal(snapshot.month, '2026-05');
  assert.equal(Object.hasOwn(snapshot, 'transactions'), false);
  assert.equal(snapshot.incomeTotal, 120_000);
  assert.equal(snapshot.expenseTotal, 30_000);
  assert.equal(snapshot.creditStatements[0].minimumDue, 20_000);

  const plan = await requestFinancialPlan(snapshot, { endpoint: '/api/financial-plan', timeoutMs: 1_000 });

  assert.equal(captured.url, '/api/financial-plan');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers.Authorization, undefined);
  assert.doesNotMatch(JSON.stringify(captured.options), /OPENAI_API_KEY|sk-/);

  const body = JSON.parse(captured.options.body);
  assert.deepEqual(Object.keys(body), ['snapshot']);
  assert.equal(Object.hasOwn(body.snapshot, 'transactions'), false);
  assert.doesNotMatch(JSON.stringify(body), /income-raw-id|expense-raw-id/);
  assert.ok(plan.summary.includes(FINANCIAL_PLAN_DISCLAIMER));
  assert.equal(plan.debtPlan.totalRecommendedPayment, 50_000);
});

test('financial plan UI source: dashboard exposes AI plan workflow with privacy and fallback copy', () => {
  const panelSource = readFileSync(new URL('../src/components/FinancialPlanPanel.jsx', import.meta.url), 'utf8');
  const dashboardSource = readFileSync(new URL('../src/features/app/screens/DashboardScreen.jsx', import.meta.url), 'utf8');
  const legacyDashboardSource = readFileSync(new URL('../src/views/DashboardView.jsx', import.meta.url), 'utf8');

  assert.match(panelSource, /แผนการเงินจาก AI/);
  assert.match(panelSource, /ให้ AI ช่วยวางแผนการเงิน/);
  assert.match(panelSource, /ข้อมูลที่จะส่งให้ AI/);
  assert.match(panelSource, /ระบบส่งเฉพาะข้อมูลสรุป ไม่ส่งรูปใบเสร็จ/);
  assert.match(panelSource, /สรุปสถานะ/);
  assert.match(panelSource, /แผนออมเงิน/);
  assert.match(panelSource, /แผนจ่ายหนี้/);
  assert.match(panelSource, /สิ่งที่ควรทำเดือนนี้/);
  assert.match(panelSource, /คำเตือน\/ความเสี่ยง/);
  assert.match(panelSource, /requestFinancialPlan\(snapshot,\s*\{[\s\S]*returnMeta:\s*true/);
  // The AI endpoint only answers signed-in callers, so the session token must be forwarded.
  assert.match(panelSource, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(panelSource, /buildFinancialPlanFallback\(snapshot/);
  assert.doesNotMatch(panelSource, /process\.env|OPENAI_API_KEY|NEXT_PUBLIC_OPENAI|sk-[A-Za-z0-9]/);
  assert.match(dashboardSource, /<FinancialPlanPanel[\s\S]*state=\{financialPlanState\}[\s\S]*month=\{selectedMonth\}/);
  assert.match(dashboardSource, /accessToken=\{session\?\.access_token \|\| ""\}/);
  assert.match(legacyDashboardSource, /<FinancialPlanPanel state=\{state\} month=\{monthKey\} \/>/);
});

test('debt payment plan: uses real statement minimums and avalanche extra', () => {
  const accounts = [
    { id: 'card-a', name: 'Card A', type: 'credit', openingBalance: 0, apr: 18 },
    { id: 'card-b', name: 'Card B', type: 'credit', openingBalance: 0, apr: 28 },
  ];
  const transactions = [
    { id: 'spend-a', accountId: 'card-a', type: 'expense', amount: 100_000, date: '2026-05-01' },
    { id: 'spend-b', accountId: 'card-b', type: 'expense', amount: 200_000, date: '2026-05-02' },
  ];
  const creditStatements = [
    {
      id: 'stmt-a',
      accountId: 'card-a',
      month: '2026-05',
      statementBalance: 100_000,
      minimumDue: 20_000,
      dueDate: '2026-05-20',
      apr: 18,
    },
    {
      id: 'stmt-b',
      accountId: 'card-b',
      month: '2026-05',
      statementBalance: 200_000,
      minimumDue: 30_000,
      dueDate: '2026-05-15',
      apr: 28,
    },
  ];

  const plan = planCreditCardPayments({
    accounts,
    transactions,
    creditStatements,
    month: '2026-05',
    availableCashToPay: 80_000,
    minimumCashBuffer: 10_000,
    strategy: 'avalanche',
  });
  const cardA = plan.cards.find((card) => card.accountId === 'card-a');
  const cardB = plan.cards.find((card) => card.accountId === 'card-b');

  assert.equal(cardA.minimumDue, 20_000);
  assert.equal(cardA.recommendedPayment, 20_000);
  assert.equal(cardB.minimumDue, 30_000);
  assert.equal(cardB.recommendedPayment, 50_000);
  assert.equal(cardB.extraPayment, 20_000);
  assert.equal(plan.totals.totalMinimum, 50_000);
  assert.equal(plan.totals.totalRecommended, 70_000);
  assert.equal(plan.totals.cashAfterPayments, 10_000);
});

test('debt payment plan: cash shortfall allocates partial minimums without exceeding cash', () => {
  const accounts = [
    { id: 'card-a', name: 'Card A', type: 'credit', openingBalance: 0 },
    { id: 'card-b', name: 'Card B', type: 'credit', openingBalance: 0 },
  ];
  const transactions = [
    { id: 'spend-a', accountId: 'card-a', type: 'expense', amount: 100_000, date: '2026-05-01' },
    { id: 'spend-b', accountId: 'card-b', type: 'expense', amount: 200_000, date: '2026-05-02' },
  ];
  const creditStatements = [
    { id: 'stmt-a', accountId: 'card-a', month: '2026-05', statementBalance: 100_000, minimumDue: 20_000 },
    { id: 'stmt-b', accountId: 'card-b', month: '2026-05', statementBalance: 200_000, minimumDue: 30_000 },
  ];

  const plan = planCreditCardPayments({
    accounts,
    transactions,
    creditStatements,
    month: '2026-05',
    availableCashToPay: 40_000,
    minimumCashBuffer: 10_000,
    strategy: 'due_date',
  });
  const cardA = plan.cards.find((card) => card.accountId === 'card-a');
  const cardB = plan.cards.find((card) => card.accountId === 'card-b');

  assert.equal(cardA.recommendedPayment, 12_000);
  assert.equal(cardB.recommendedPayment, 18_000);
  assert.equal(plan.totals.totalRecommended, 30_000);
  assert.equal(plan.totals.cashAfterPayments, 10_000);
  assert.ok(plan.warnings.includes('cash_shortfall_minimum_due'));
  assert.ok(cardA.warnings.includes('minimum_due_not_fully_funded'));
  assert.ok(cardB.warnings.includes('minimum_due_not_fully_funded'));
});

test('debt payment plan: snowball extra pays the smallest balance first', () => {
  const accounts = [
    { id: 'small', name: 'Small card', type: 'credit', openingBalance: 0, apr: 12 },
    { id: 'large', name: 'Large card', type: 'credit', openingBalance: 0, apr: 29 },
  ];
  const transactions = [
    { id: 'spend-small', accountId: 'small', type: 'expense', amount: 40_000, date: '2026-05-01' },
    { id: 'spend-large', accountId: 'large', type: 'expense', amount: 100_000, date: '2026-05-01' },
  ];
  const creditStatements = [
    { id: 'stmt-small', accountId: 'small', month: '2026-05', statementBalance: 40_000, minimumDue: 5_000 },
    { id: 'stmt-large', accountId: 'large', month: '2026-05', statementBalance: 100_000, minimumDue: 5_000 },
  ];

  const plan = planCreditCardPayments({
    accounts,
    transactions,
    creditStatements,
    month: '2026-05',
    availableCashToPay: 60_000,
    minimumCashBuffer: 0,
    strategy: 'snowball',
  });
  const small = plan.cards.find((card) => card.accountId === 'small');
  const large = plan.cards.find((card) => card.accountId === 'large');

  assert.equal(small.recommendedPayment, 40_000);
  assert.equal(small.extraPayment, 35_000);
  assert.equal(large.recommendedPayment, 20_000);
  assert.equal(large.extraPayment, 15_000);
  assert.equal(plan.totals.totalRecommended, 60_000);
});

test('debt payment plan: caps minimums and recommendations to statement/current balance', () => {
  const accounts = [{ id: 'card-cap', name: 'Capped card', type: 'credit', openingBalance: 0, apr: 30 }];
  const transactions = [
    { id: 'spend-cap', accountId: 'card-cap', type: 'expense', amount: 25_000, date: '2026-05-01' },
  ];
  const creditStatements = [
    {
      id: 'stmt-cap',
      accountId: 'card-cap',
      month: '2026-05',
      statementBalance: 100_000,
      minimumDue: 80_000,
      dueDate: '2026-05-20',
      apr: 30,
    },
  ];

  const plan = planCreditCardPayments({
    accounts,
    transactions,
    creditStatements,
    month: '2026-05',
    availableCashToPay: 200_000,
    minimumCashBuffer: 0,
    strategy: 'avalanche',
  });
  const card = plan.cards.find((item) => item.accountId === 'card-cap');

  assert.equal(card.balance, 25_000);
  assert.equal(card.minimumDue, 25_000);
  assert.equal(card.recommendedPayment, 25_000);
  assert.equal(card.extraPayment, 0);
  assert.ok(card.warnings.includes('minimum_due_capped_to_balance'));
  assert.equal(plan.totals.totalRecommended, 25_000);
});

test('debt payment snapshot: missing minimum falls back to zero with warning', () => {
  const accounts = [{ id: 'card-missing', name: 'Missing minimum card', type: 'credit', openingBalance: 0 }];
  const transactions = [
    { id: 'spend-missing', accountId: 'card-missing', type: 'expense', amount: 80_000, date: '2026-05-01' },
  ];

  const snapshot = buildCreditDebtSnapshot({
    accounts,
    transactions,
    creditStatements: [],
    month: '2026-05',
  });
  const card = snapshot.cards.find((item) => item.accountId === 'card-missing');

  assert.equal(card.balance, 80_000);
  assert.equal(card.minimumDue, 0);
  assert.ok(card.warnings.includes('missing_minimum_due'));
  assert.ok(snapshot.warnings.includes('missing_minimum_due'));
});

test('goals: boot normalization keeps satang integers and legacy backups default to empty goals', () => {
  const empty = createInitialState({ transactions: [], accounts: [], categories: { expense: [], income: [] } });
  assert.deepEqual(empty.goals, []);

  const state = createInitialState({
    moneyUnit: 'satang',
    transactions: [],
    accounts: [],
    categories: { expense: [], income: [] },
    goals: [
      {
        id: 'goal_trip',
        name: 'Japan trip',
        type: 'travel',
        targetAmount: 1500000,
        currentAmount: 250000,
        dueDate: '2026-12-01',
        linkedAccountIds: ['acc_cash', 'acc_cash', ''],
        priority: 4,
        monthlyContribution: 125000,
        autoReserveRule: { percent: 10 },
        status: 'active',
        createdAt: 100,
        updatedAt: 100,
      },
    ],
  });

  assert.equal(state.goals.length, 1);
  assert.equal(state.goals[0].targetAmount, 1500000);
  assert.equal(state.goals[0].currentAmount, 250000);
  assert.equal(state.goals[0].monthlyContribution, 125000);
  assert.deepEqual(state.goals[0].linkedAccountIds, ['acc_cash']);
});

test('goals: contribution is satang-safe and marks target as completed', () => {
  const goal = normalizeGoal({
    id: 'goal_emergency',
    name: 'Emergency fund',
    type: 'emergency_fund',
    targetAmount: 100000,
    currentAmount: 40000,
    monthlyContribution: 10000,
    status: 'active',
    createdAt: 100,
    updatedAt: 100,
  });

  const next = applyGoalContribution(goal, 60000, { now: 200 });

  assert.equal(next.currentAmount, 100000);
  assert.equal(next.status, 'completed');
  assert.equal(next.updatedAt, 200);
});

test('goals UI helpers: summarize active goals and monthly amount without baht floats', () => {
  const goals = [
    {
      id: 'goal_1',
      name: 'Emergency fund',
      type: 'emergency_fund',
      targetAmount: 120000,
      currentAmount: 30000,
      dueDate: '2026-08-01',
      monthlyContribution: 10000,
      status: 'active',
    },
    {
      id: 'goal_2',
      name: 'Paused trip',
      type: 'travel',
      targetAmount: 50000,
      currentAmount: 10000,
      dueDate: '',
      monthlyContribution: 5000,
      status: 'paused',
    },
  ];

  const summary = summarizeGoals(goals, { today: '2026-05-01' });

  assert.equal(summary.activeCount, 1);
  assert.equal(summary.totalTarget, 120000);
  assert.equal(summary.totalCurrent, 30000);
  assert.equal(calculateGoalProgressPercent(goals[0]), 25);
  assert.equal(calculateMonthlyNeeded(goals[0], '2026-05-01'), 30000);
  assert.equal(summary.monthlyContributionNeeded, 30000);
});

test('storage: saveAll persists savings goals in versioned payload', (t) => {
  const writes = [];
  installBrowserGlobals(t, {
    setItem: (_key, value) => writes.push(JSON.parse(value)),
  });

  saveAll({
    moneyUnit: 'satang',
    transactions: [],
    accounts: [],
    categories: { expense: [], income: [] },
    budgets: [],
    recurring: [],
    goals: [
      {
        id: 'goal_buffer',
        name: 'Buffer',
        type: 'debt_buffer',
        targetAmount: 300000,
        currentAmount: 100000,
        dueDate: '',
        linkedAccountIds: [],
        priority: 1,
        monthlyContribution: 50000,
        autoReserveRule: null,
        status: 'active',
        createdAt: 100,
        updatedAt: 100,
      },
    ],
    rules: [],
    merchants: [],
    inbox: [],
    scanInbox: [],
    ui: { view: 'dashboard', editingId: null },
  });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].data.goals[0].id, 'goal_buffer');
  assert.equal(writes[0].data.goals[0].targetAmount, 300000);
});

test('storage: saveAll emits a storage failure event when serialization fails', (t) => {
  const writes = [];
  const { dispatched } = installBrowserGlobals(t, {
    setItem: (...args) => writes.push(args),
  });

  const cyclicTx = { id: 'tx-cyclic' };
  cyclicTx.self = cyclicTx;

  saveAll({
    moneyUnit: 'satang',
    transactions: [cyclicTx],
    accounts: [],
    categories: { expense: [], income: [] },
    budgets: [],
    recurring: [],
    rules: [],
    merchants: [],
    inbox: [],
    scanInbox: [],
    ui: { view: 'dashboard', editingId: null },
  });

  assert.equal(writes.length, 0);
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0]?.type, STORAGE_SAVE_ERROR_EVENT);
  assert.equal(dispatched[0]?.detail?.message, 'serialize_failed');
});

test('auth config: Next exposes legacy Vite Supabase browser env for anonymous sign-in', () => {
  const legacyViteEnv = {
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon-vite',
  };

  assert.deepEqual(resolveSupabaseBrowserConfig(legacyViteEnv), {
    url: 'https://example.supabase.co',
    anonKey: 'anon-vite',
  });
  assert.equal(hasResolvedSupabaseBrowserConfig(legacyViteEnv), true);
  assert.deepEqual(createNextPublicSupabaseEnv(legacyViteEnv), {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-vite',
  });

  assert.deepEqual(
    createNextPublicSupabaseEnv({
      SUPABASE_URL: 'https://server.supabase.co',
      SUPABASE_ANON_KEY: 'anon-server',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-must-not-leak',
    }),
    {
      NEXT_PUBLIC_SUPABASE_URL: 'https://server.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-server',
    },
  );
});

test('categories: custom ids are user-scoped and deterministic', () => {
  const first = buildCustomCategoryId('user-1234-5678', 'expense:coffee');
  const second = buildCustomCategoryId('user-1234-5678', 'expense:coffee');
  const third = buildCustomCategoryId('another-user', 'expense:coffee');

  assert.equal(first, second);
  assert.notEqual(first, third);
  assert.match(first, /^cat_/);
});

test('categories: mergeCategoryState applies system overrides and cascades hidden custom parents', () => {
  const merged = mergeCategoryState(
    [
      { id: 'food', is_system: true, kind: 'expense', name: 'Food', icon: '🍜', color: '#ff6b6b', parent_id: null, sort_order: 0 },
      { id: 'cat_user_cafe', user_id: 'user-1', is_system: false, kind: 'expense', name: 'Cafe', icon: '☕', color: '#0b84ff', parent_id: null, sort_order: 90 },
      { id: 'cat_user_pastry', user_id: 'user-1', is_system: false, kind: 'expense', name: 'Pastry', icon: '🥐', color: '#f59e0b', parent_id: 'cat_user_cafe', sort_order: 91 },
    ],
    [
      { user_id: 'user-1', category_id: 'food', name: 'อาหาร', icon: '🍲', color: '#16a34a', hidden: false },
      { user_id: 'user-1', category_id: 'cat_user_cafe', hidden: true },
    ],
  );

  const food = merged.expense.find((category) => category.id === 'food');
  const cafe = merged.expense.find((category) => category.id === 'cat_user_cafe');
  const pastry = merged.expense.find((category) => category.id === 'cat_user_pastry');

  assert.equal(food?.name, 'อาหาร');
  assert.equal(food?.icon, '🍲');
  assert.equal(food?.color, '#16a34a');
  assert.equal(cafe?.isHidden, true);
  assert.equal(pastry?.isHidden, true);
});

test('categories: dashboard snapshot picks merged category presentation by id', () => {
  const grouped = mergeCategoryState(
    [{ id: 'food', is_system: true, kind: 'expense', name: 'Food', icon: '🍜', color: '#ff6b6b', parent_id: null, sort_order: 0 }],
    [{ user_id: 'user-1', category_id: 'food', name: 'อาหาร', icon: '🍲', color: '#16a34a', hidden: false }],
  );

  const snapshot = applyCategoryPresentationToSnapshot(
    {
      top_categories: [{ id: 'food', name: 'Food', icon: '🍜', color: '#ff6b6b', total_satang: 5000 }],
    },
    grouped,
  );

  assert.deepEqual(snapshot.top_categories[0], {
    id: 'food',
    name: 'อาหาร',
    icon: '🍲',
    color: '#16a34a',
    total_satang: 5000,
  });
});

test('boot: merchants survive initial boot and wrapped reload-shaped round trip', () => {
  const seed = createSeedState();
  const firstPass = createInitialState(seed);
  const secondPass = createInitialState(createStorageRecord(firstPass));

  assert.equal(firstPass.merchants.length, seed.merchants.length);
  assert.equal(secondPass.merchants.length, seed.merchants.length);
  assert.deepEqual(
    secondPass.merchants.map((merchant) => merchant.id).sort(),
    seed.merchants.map((merchant) => merchant.id).sort(),
  );
});

test('boot: legacy baht backups convert nested inbox and receipt line amounts to satang', () => {
  const state = createInitialState({
    moneyUnit: 'baht',
    transactions: [
      {
        id: 'tx_baht_nested',
        type: 'expense',
        amount: 265,
        date: '2026-03-25',
        categoryId: 'coffee',
        accountId: 'acc_cash',
        receiptLines: [
          {
            categoryId: 'coffee',
            amount: 145,
            children: [{ name: 'Iced latte', amount: 145 }],
          },
        ],
      },
    ],
    inbox: [
      {
        id: 'inb_baht_nested',
        type: 'expense',
        txType: 'expense',
        amount: 265,
        date: '2026-03-25',
        categoryId: 'coffee',
        accountId: 'acc_cash',
        groups: [
          {
            categoryId: 'coffee',
            amount: 145,
            children: [{ name: 'Iced latte', amount: 145 }],
          },
        ],
        lines: [{ categoryId: 'bakery', amount: 120 }],
      },
    ],
  });

  assert.equal(state.transactions[0].amount, 26500);
  assert.equal(state.transactions[0].receiptLines[0].amount, 14500);
  assert.equal(state.transactions[0].receiptLines[0].children[0].amount, 14500);
  assert.equal(state.inbox[0].amount, 26500);
  assert.equal(state.inbox[0].groups[0].amount, 14500);
  assert.equal(state.inbox[0].groups[0].children[0].amount, 14500);
  assert.equal(state.inbox[0].lines[0].amount, 12000);
});

test('backup validation: deterministic repairs pass and materially malformed imports are blocked', () => {
  const repaired = validateBackupImport({
    data: {
      amountUnit: 'baht',
      transactions: [],
      accounts: [],
      categories: { expense: [], income: [] },
      budgets: [],
      recurring: [],
      rules: [],
      goals: [
        {
          id: 'goal_schema',
          name: 'Schema goal',
          type: 'custom',
          targetAmount: 500000,
          currentAmount: 125000,
          dueDate: '',
          linkedAccountIds: [],
          priority: 1,
          monthlyContribution: 25000,
          autoReserveRule: null,
          status: 'active',
          createdAt: 100,
          updatedAt: 100,
        },
      ],
      merchants: [
        {
          id: 'merchant-2',
          canonical: 'Mini Big C',
          aliases: ['Big C Mini'],
          enabled: true,
          prefs: {
            expense: { categoryId: 'groceries', accountId: 'acc-cash' },
            income: { categoryId: '', accountId: '' },
          },
        },
      ],
    },
  });

  assert.equal(repaired.success, true);
  assert.equal(repaired.data.moneyUnit, 'baht');
  assert.equal(repaired.data.goals[0].targetAmount, 50000000);
  assert.equal(repaired.data.merchants[0].canonical, 'Mini Big C');

  const blocked = validateBackupImport({
    data: {
      transactions: [{ amount: 'oops' }],
    },
  });

  assert.equal(blocked.success, false);
});

test('import: legacy planner settings, debt fields, and budgets migrate into the new runtime shape', async () => {
  const userId = 'user-import-1';
  const { admin, tables } = createImportAdmin({ userId });
  const snapshot = {
    profile: {
      displayName: 'Planner Import',
      incomeMode: 'rolling_average',
      fixedIncomeSatang: 900000,
      incomeLookbackMonths: 6,
      savingsMode: 'percent',
      savingsPercentBps: 1500,
      debtStrategyMode: 'survival',
    },
    accounts: [
      {
        id: 'credit-card-1',
        name: 'Main Card',
        type: 'credit',
      },
    ],
    categoryPreferences: [
      {
        category_id: 'food',
        budget_behavior: 'essential',
      },
    ],
    debtPlans: [
      {
        id: 'debt-plan-1',
        accountId: 'credit-card-1',
        currentBalanceSatang: 120000,
        minimumPaymentSatang: 15000,
        targetPaymentSatang: 22000,
        aprBps: 1999,
        dueDay: 15,
        payoffTargetDate: '2026-12-31',
        note: 'focus card',
      },
    ],
    budgets: [
      {
        month_key: '2026-04',
        category_id: 'food',
        limit_satang: 400000,
        alert_pct: 85,
        source: 'manual',
        manual_override: true,
      },
      {
        month: '2026-04',
        categoryId: '__TOTAL__',
        limit: 550000,
      },
      {
        month_key: '2026-04',
        category_id: '__DAILY__',
        limit_satang: 20000,
      },
    ],
  };

  const firstRun = await importLegacySnapshot({
    admin,
    userId,
    snapshot,
  });

  assert.equal(firstRun.skipped, false);
  assert.equal(firstRun.counts.accounts, 1);
  assert.equal(firstRun.counts.categoryPreferences, 1);
  assert.equal(firstRun.counts.debtPlans, 1);
  assert.equal(firstRun.counts.budgets, 1);

  assert.equal(tables.accounts.length, 1);
  assert.equal(tables.accounts[0].legacy_id, 'credit-card-1');

  assert.equal(tables.category_preferences.length, 1);
  assert.equal(tables.category_preferences[0].category_id, 'food');
  assert.equal(tables.category_preferences[0].budget_behavior, 'essential');

  assert.equal(tables.budgets.length, 1);
  assert.equal(tables.budgets[0].month_key, '2026-04');
  assert.equal(tables.budgets[0].category_id, 'food');
  assert.equal(tables.budgets[0].limit_satang, 400000);
  assert.equal(tables.budgets[0].alert_pct, 85);
  assert.equal(tables.budgets[0].manual_override, true);

  assert.equal(tables.debt_plans.length, 1);
  assert.equal(tables.debt_plans[0].account_id, tables.accounts[0].id);
  assert.equal(tables.debt_plans[0].minimum_payment_satang, 15000);
  assert.equal(tables.debt_plans[0].target_payment_satang, 22000);
  assert.equal(tables.debt_plans[0].apr_bps, 1999);

  assert.equal(tables.profiles.length, 1);
  assert.equal(tables.profiles[0].display_name, 'Planner Import');
  assert.equal(tables.profiles[0].income_mode, 'rolling_average');
  assert.equal(tables.profiles[0].fixed_income_satang, 900000);
  assert.equal(tables.profiles[0].income_lookback_months, 6);
  assert.equal(tables.profiles[0].savings_mode, 'percent');
  assert.equal(tables.profiles[0].savings_percent_bps, 1500);
  assert.equal(tables.profiles[0].debt_strategy_mode, 'survival');
  assert.equal(tables.profiles[0].monthly_target_satang, 550000);
  assert.ok(tables.profiles[0].migrated_at);

  assert.equal(tables.import_runs.length, 1);
  assert.equal(tables.import_runs[0].status, 'completed');

  const secondRun = await importLegacySnapshot({
    admin,
    userId,
    snapshot,
  });

  assert.equal(secondRun.skipped, true);
  assert.equal(tables.import_runs.length, 1);
});

test('boot: category and categoryId stay mirrored for legacy and modern transactions', () => {
  const state = createInitialState({
    transactions: [
      {
        id: 'tx_category_id_only',
        type: 'expense',
        amount: 4999,
        date: '2026-03-25',
        categoryId: 'coffee',
        accountId: 'acc_cash',
      },
      {
        id: 'tx_category_legacy_only',
        type: 'expense',
        amount: 1899,
        date: '2026-03-25',
        category: 'food',
        accountId: 'acc_cash',
      },
    ],
  });

  assert.equal(state.transactions[0].category, 'coffee');
  assert.equal(state.transactions[0].categoryId, 'coffee');
  assert.equal(state.transactions[1].category, 'food');
  assert.equal(state.transactions[1].categoryId, 'food');
});

test('scan request parse: normalizes data-url mime aliases and filename fields', async () => {
  const parsed = await parseScanRequest(
    {
      body: {
        imageDataUrl: 'data:image/jpg;base64,QUJDRA==',
        fileName: 'receipt.jpg',
      },
    },
    { maxBytes: 1024 },
  );

  assert.equal(parsed.base64, 'QUJDRA==');
  assert.equal(parsed.mimeType, 'image/jpeg');
  assert.equal(parsed.filename, 'receipt.jpg');
});

test('scan request parse: enforces allowed mime types and base64 byte limits', () => {
  assert.equal(assertAllowedInputMime('image/jpg'), 'image/jpeg');
  assert.equal(assertAllowedInputMime('application/x-pdf'), 'application/pdf');
  assert.equal(assertAllowedInputMime('application/pdf', { allowPdf: false }), '');
  assert.deepEqual(assertBase64UnderLimit('QUJDRA==', 4), { ok: true, bytes: 4 });
  assert.deepEqual(assertBase64UnderLimit('QUJDRA==', 3), { ok: false, bytes: 4 });
});

test('scan provider: local handlers receive payload and return normalized provider result', async () => {
  const payload = {
    base64: 'QUJDRA==',
    mimeType: 'image/jpeg',
    filename: 'receipt.jpg',
    accounts: [{ id: 'acc_cash', name: 'Cash' }],
  };

  const seen = [];
  const result = await scanWithProvider({
    provider: 'openai',
    payload,
    scanOpenAI: async (input) => {
      seen.push(input);
      return {
        status: 200,
        body: {
          ok: true,
          suggestion: { amount: 123, merchant: 'Cafe Bloom' },
        },
      };
    },
  });

  assert.equal(normalizeProviderName('google'), 'gemini');
  assert.deepEqual(seen[0], payload);
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.json.suggestion.amount, 123);
});

test('scan provider: legacy HTTP JSON mode is injectable and preserves Gemini proxy behavior', async () => {
  const calls = [];
  const result = await scanWithProvider({
    url: 'https://example.test/gemini',
    payload: { contents: [{ parts: [{ text: 'prompt' }] }] },
    timeoutMs: 50,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: '{"amount":123}' }] } }] }),
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.test/gemini');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body), { contents: [{ parts: [{ text: 'prompt' }] }] });
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.json.candidates[0].content.parts[0].text, '{"amount":123}');
});

test('scan provider: unsupported providers return normalized errors', async () => {
  const result = await scanWithProvider({ provider: 'unknown-model', payload: {} });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.code, 'invalid_scan_provider');
  assert.match(result.json.message, /unknown-model/);
});

test('scan api: JSON/base64 OpenAI provider payload keeps account and filename context', () => {
  const source = readFileSync(new URL('../server/legacy-api/scan.js', import.meta.url), 'utf8');
  const providerCall = source.slice(source.indexOf('const out = await scanWithProvider({'));

  assert.match(providerCall, /provider:\s*process\.env\.SCAN_PROVIDER \|\| "openai"/);
  assert.match(providerCall, /accounts,/);
  assert.match(providerCall, /\{\s*filename,\s*fileName:\s*filename\s*\}/);
  assert.match(providerCall, /scanOpenAI:\s*callOpenAI/);
});

test('scan api: provider fallback normalization keeps success and error contracts distinct', () => {
  const success = normalizeProviderScanResult({
    ok: true,
    status: 200,
    json: {
      ok: true,
      suggestion: { amount: 265, merchant: 'Cafe Bloom' },
    },
  });

  assert.equal(success.status, 200);
  assert.equal(success.body.ok, true);
  assert.equal(success.body.suggestion.amount, 265);

  const failure = normalizeProviderScanResult({
    ok: false,
    status: 502,
    json: {
      ok: false,
      code: 'provider_unavailable',
      message: 'Provider down',
    },
  });

  assert.equal(failure.status, 502);
  assert.equal(failure.body.ok, false);
  assert.equal(failure.body.code, 'provider_unavailable');
  assert.equal(failure.body.message, 'Provider down');
});

test('scan schema: normalized responses keep child categories, adjustments, confidence, and flags', () => {
  const normalized = normalizeScanResponse({
    merchant: 'Cafe Bloom',
    amount: 150,
    date: '2026-04-04T10:30:00Z',
    time: '20:01:32',
    category: 'food',
    items: [
      {
        name: 'Breakfast set',
        line_total: 150,
        category_key: 'food',
        children: [
          { name: 'Coffee', amount: 40, category: 'coffee' },
          { name: 'Sandwich', line_total: 110, category_key: 'food' },
        ],
      },
    ],
    adjustments: [
      { name: 'Member discount', value: 10, effect: 'subtract', adjustmentType: 'discount', category: 'discount' },
    ],
    confidence: { score: 0.82, merchant: 0.9, items: 0.74 },
    flags: { has_line_items: true, needs_human_review: true },
  });

  assert.equal(normalized.category_key, 'dining');
  assert.equal(normalized.time, '20:01:32');
  assert.equal(normalized.transactionTime, '20:01:32');
  assert.equal(normalized.items[0].children[0].category_key, 'coffee');
  assert.equal(normalized.items[0].children[1].category_key, 'dining');
  assert.equal(normalized.adjustments[0].category_key, 'discount');
  assert.equal(normalized.confidence.overall, 0.82);
  assert.equal(normalized.flags.has_line_items, true);
  assert.equal(normalized.flags.needs_human_review, true);
});

test('scan rate limiter: limit takes precedence but legacy limitPerMinute still works', () => {
  const req = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };

  const legacyHeaders = {};
  const legacyRes = {
    setHeader(name, value) {
      legacyHeaders[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  const legacyLimiter = createRateLimiter({ limitPerMinute: 1, windowMs: 60_000 });
  assert.equal(legacyLimiter(req, legacyRes), true);
  assert.equal(legacyLimiter(req, legacyRes), false);
  assert.equal(legacyRes.statusCode, 429);
  assert.ok(legacyHeaders['Retry-After']);

  const precedenceHeaders = {};
  const precedenceRes = {
    setHeader(name, value) {
      precedenceHeaders[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  const precedenceLimiter = createRateLimiter({ limit: 2, limitPerMinute: 1, windowMs: 60_000 });
  assert.equal(precedenceLimiter(req, precedenceRes), true);
  assert.equal(precedenceLimiter(req, precedenceRes), true);
  assert.equal(precedenceLimiter(req, precedenceRes), false);
  assert.equal(precedenceRes.statusCode, 429);
  assert.ok(precedenceHeaders['Retry-After']);
});

test('queue type helpers: normalizeQueueItemType fixes credit payment account roles and clears split-only fields', () => {
  const accounts = [
    { id: 'bank-1', type: 'bank', digits: '1234' },
    { id: 'card-1', type: 'credit', digits: '5678' },
  ];

  const normalized = normalizeQueueItemType(
    {
      txType: 'credit_payment',
      accountId: 'card-1',
      fromAccountId: 'card-1',
      toAccountId: 'bank-1',
      categoryId: 'food',
      splitByCategory: true,
      isInstallment: true,
      items: [{ id: 'i1' }],
      groups: [{ id: 'g1' }],
    },
    { accounts },
  );

  assert.equal(normalized.txType, 'credit_payment');
  assert.equal(normalized.categoryId, 'transfer');
  assert.equal(normalized.splitByCategory, false);
  assert.equal(normalized.isInstallment, false);
  assert.deepEqual(normalized.items, []);
  assert.deepEqual(normalized.groups, []);
  assert.equal(normalized.fromAccountId, '');
  assert.equal(normalized.toAccountId, '');
  assert.equal(normalized.accountId, '');
});

test('queue type helpers: buildQueueTypeChangeItem preserves expense groups and prefers suggested category plus matched account', () => {
  const accounts = [
    { id: 'wallet', type: 'cash', digits: '1234' },
    { id: 'bank-2', type: 'bank', digits: '9876' },
    { id: 'card-1', type: 'credit', digits: '5678' },
  ];

  const changed = buildQueueTypeChangeItem(
    {
      txType: 'income',
      note: 'ร้าน A',
      fromDigits: '9876',
      toDigits: '',
      categoryId: 'transfer',
      groups: [{ id: 'g1', amount: 5000 }],
    },
    'expense',
    {
      accounts,
      ensureCategoryId: () => 'other',
      suggestCategoryId: () => 'food',
    },
  );

  assert.equal(changed.txType, 'expense');
  assert.equal(changed.categoryId, 'food');
  assert.equal(changed.accountId, 'bank-2');
  assert.deepEqual(changed.groups, [{ id: 'g1', amount: 5000 }]);
  assert.equal(changed.suggestedCategoryId, 'food');
  assert.equal(changed.suggestedReason, 'เคยใช้กับ ร้าน A');
});

test('queue type helpers: applyAutomationToQueuePatch keeps transfer-like patches structurally safe', () => {
  const accounts = [
    { id: 'bank-1', type: 'bank', digits: '1234' },
    { id: 'card-1', type: 'credit', digits: '5678' },
  ];

  const transferPatch = applyAutomationToQueuePatch(
    { txType: 'expense', accountId: 'bank-1', groups: [{ id: 'g1' }], categoryId: 'food' },
    { txType: 'transfer' },
    { accounts, ensureCategoryId: () => 'other' },
  );

  assert.equal(transferPatch.txType, 'transfer');
  assert.equal(transferPatch.categoryId, 'transfer');
  assert.equal(transferPatch.splitByCategory, false);
  assert.deepEqual(transferPatch.groups, []);
  assert.equal(transferPatch.fromAccountId, 'bank-1');

  const incomePatch = applyAutomationToQueuePatch(
    { txType: 'expense', accountId: 'bank-1', categoryId: 'transfer', groups: [{ id: 'g1' }] },
    { txType: 'income' },
    { accounts, ensureCategoryId: () => 'salary' },
  );

  assert.equal(incomePatch.txType, 'income');
  assert.equal(incomePatch.categoryId, 'salary');
  assert.equal(incomePatch.splitByCategory, false);
  assert.deepEqual(incomePatch.groups, []);
});

test('file upload helpers: keep only supported image/pdf files', () => {
  const files = [
    { type: 'image/png', name: 'photo.png' },
    { type: 'text/plain', name: 'notes.txt' },
    { type: '', name: 'receipt.PDF' },
  ];

  const allowed = filterAllowedUploads(files);

  assert.equal(isPdfFile(files[2]), true);
  assert.equal(allowed.length, 2);
  assert.deepEqual(allowed.map((f) => f.name), ['photo.png', 'receipt.PDF']);
});

test('scan result helpers: normalize Thai BE dates and parse response text/object safely', () => {
  assert.equal(normalizeScannedDate('20 ก.ย. 2567'), '2024-09-20');
  assert.equal(safeNumber('฿1,234.50'), 1234.5);

  const resp = {
    output: [
      {
        content: [
          { text: 'line 1' },
          { parsed: { amount: 2500, merchant: 'Cafe' } },
          { text: 'line 2' },
        ],
      },
    ],
  };

  assert.equal(extractResponsesOutputText(resp), 'line 1\nline 2');
  assert.deepEqual(findFirstParsedObject(resp), { amount: 2500, merchant: 'Cafe' });
});

test('runtime transaction drafts: scanToDraft converts baht scans into satang and preserves grouped receipts', () => {
  const draft = scanToDraft({
    matched_account_id: 12,
    matched_category_id: 'food',
    normalized_suggestion: {
      tx_type: 'expense',
      amount_unit: 'baht',
      amount: 255,
      merchant: 'Cafe Bloom',
      date: '2026-04-04',
      time: '20:01:32',
      items: [
        { name: 'Iced latte', total: 145, category_key: 'food' },
        { name: 'Croissant', total: 120, category_key: 'shopping' },
      ],
      adjustments: [
        { name: 'Member discount', amount: 10, effect: 'subtract', type: 'discount' },
      ],
    },
  });

  assert.equal(draft.kind, 'expense');
  assert.equal(draft.accountId, '12');
  assert.equal(draft.categoryId, 'mixed');
  assert.equal(draft.amountSatang, 25500);
  assert.equal(draft.time, '20:01');
  assert.equal(draft.transactionTime, '20:01:32');
  assert.equal(draft.splitByCategory, true);
  assert.equal(draft.receiptGroups.length, 3);
  assert.equal(draft.receiptGroups[0].amountSatang, 14500);
  assert.equal(draft.receiptGroups[2].receiptLineType, 'adjustment');
  assert.equal(draft.receiptGroups[2].adjustmentEffect, 'subtract');
});

test('runtime transaction drafts: scanToDraft flattens receipt children and keeps dominant parent category', () => {
  const draft = scanToDraft({
    normalized_suggestion: {
      tx_type: 'expense',
      amount_unit: 'baht',
      amount: 150,
      merchant: 'Cafe Bloom',
      items: [
        {
          name: 'Breakfast set',
          total: 150,
          children: [
            { name: 'Coffee', total: 40, category_key: 'coffee' },
            { name: 'Sandwich', total: 110, category_key: 'food' },
          ],
        },
      ],
    },
  });

  assert.equal(draft.amountSatang, 15000);
  assert.equal(draft.categoryId, 'dining');
  assert.equal(draft.splitByCategory, true);
  assert.deepEqual(
    draft.receiptGroups.map((group) => ({ name: group.name, categoryId: group.categoryId, amountSatang: group.amountSatang })),
    [
      { name: 'Coffee', categoryId: 'coffee', amountSatang: 4000 },
      { name: 'Sandwich', categoryId: 'dining', amountSatang: 11000 },
    ],
  );
});

test('runtime transaction drafts: inbox amount display follows canonical scan draft normalization', () => {
  const explicitBahtScan = {
    normalized_suggestion: {
      tx_type: 'expense',
      amount_unit: 'baht',
      amount: 60,
      merchant: 'Cafe Amazon',
    },
  };

  const legacyScan = {
    normalized_suggestion: {
      tx_type: 'expense',
      amount: 60,
      merchant: 'Cafe Amazon',
      items: [{ name: 'Tw Choco', total: 60, category_key: 'food' }],
    },
  };

  assert.equal(
    getScanDisplayAmountSatang(explicitBahtScan),
    scanToDraft(explicitBahtScan).amountSatang,
  );
  assert.equal(getScanDisplayAmountSatang(explicitBahtScan), 6000);
  assert.equal(
    getScanDisplayAmountSatang(legacyScan),
    scanToDraft(legacyScan).amountSatang,
  );
});

test('runtime transaction drafts: split save plans create one parent plus ordered child rows', () => {
  const plan = buildTransactionSavePlan({
    userId: 'user-1',
    source: 'scan_approval',
    scanDocumentId: 44,
    draft: {
      kind: 'expense',
      accountId: 'acc-1',
      amountSatang: 25500,
      merchant: 'Cafe Bloom',
      date: '2026-04-04',
      splitByCategory: true,
      receiptGroups: [
        { name: 'Iced latte', amountSatang: 14500, categoryId: 'food' },
        { name: 'Croissant', amountSatang: 12000, categoryId: 'shopping' },
        {
          name: 'Member discount',
          amountSatang: 1000,
          categoryId: 'discount',
          receiptLineType: 'adjustment',
          adjustmentEffect: 'subtract',
          adjustmentType: 'discount',
        },
      ],
    },
  });

  assert.equal(plan.mode, 'split');
  assert.equal(plan.parentRow.is_split_parent, true);
  assert.equal(plan.parentRow.category_id, 'mixed');
  assert.equal(plan.parentRow.amount_satang, 25500);
  assert.equal(plan.childRows.length, 3);
  assert.equal(plan.childRows[0].split_index, 1);
  assert.equal(plan.childRows[1].split_index, 2);
  assert.equal(plan.childRows[2].receipt_line_type, 'adjustment');
  assert.equal(plan.childRows[2].adjustment_effect, 'subtract');
  assert.ok(plan.childRows.every((row) => row.is_split_child === true));
  assert.ok(plan.childRows.every((row) => row.split_group_id === plan.parentRow.split_group_id));
});

test('runtime transaction drafts: approved suggestions preserve child categories for non-flattened detail lines', () => {
  const suggestion = buildApprovedSuggestion(
    { normalized_suggestion: {} },
    {
      kind: 'expense',
      amountSatang: 12000,
      categoryId: 'food',
      merchant: 'Cafe Bloom',
      date: '2026-04-04',
      receiptGroups: [
        {
          name: 'Burger set',
          amountSatang: 12000,
          categoryId: 'food',
          childrenIncludedInParent: true,
          children: [
            { name: 'Coffee', amountSatang: 4000, categoryId: 'coffee' },
            { name: 'Extra sauce', amountSatang: 0, categoryId: 'food' },
          ],
        },
      ],
    },
  );

  assert.equal(suggestion.category_key, 'dining');
  assert.equal(suggestion.groups[0].children_included_in_parent, true);
  assert.equal(suggestion.groups[0].children[0].category_key, 'coffee');
});

test('runtime transaction drafts: transfer-like scans stay on the single transfer path', () => {
  const plan = buildTransactionSavePlan({
    userId: 'user-1',
    source: 'scan_approval',
    draft: {
      kind: 'credit_payment',
      fromAccountId: 'card-1',
      toAccountId: 'bank-1',
      amountSatang: 120000,
      merchant: 'Card payment',
      date: '2026-04-04',
      lineItems: [{ name: 'Should be ignored', amountSatang: 5000 }],
    },
  });

  assert.equal(plan.mode, 'single');
  assert.equal(plan.row.kind, 'transfer');
  assert.equal(plan.row.account_id, null);
  assert.equal(plan.row.from_account_id, 'card-1');
  assert.equal(plan.row.to_account_id, 'bank-1');
  assert.deepEqual(plan.lineItems, []);
});

test('runtime line item editor state: receipt-group edits stay in sync with line items', () => {
  const nextDraft = replaceDraftLineItems(
    {
      kind: 'expense',
      amountSatang: 25500,
      splitByCategory: true,
      lineItems: [
        { name: 'Coffee', amountSatang: 14500, categoryId: 'food' },
        { name: 'Snack', amountSatang: 12000, categoryId: 'shopping' },
      ],
      receiptGroups: [
        { name: 'Coffee', amountSatang: 14500, categoryId: 'food' },
        { name: 'Snack', amountSatang: 12000, categoryId: 'shopping' },
      ],
    },
    [{ name: 'Coffee', amountSatang: 14500, categoryId: 'food' }],
  );

  assert.equal(nextDraft.lineItems.length, 1);
  assert.equal(nextDraft.receiptGroups.length, 1);
  assert.equal(nextDraft.receiptGroups[0].name, 'Coffee');
  assert.equal(nextDraft.splitByCategory, false);
});

test('runtime line item editor state: signed summaries reconcile receipt adjustments', () => {
  const summary = summarizeDraftLineItems({
    amountSatang: 25500,
    lineItems: [
      { name: 'Coffee', amountSatang: 14500, categoryId: 'food' },
      { name: 'Snack', amountSatang: 12000, categoryId: 'shopping' },
      {
        name: 'Member discount',
        amountSatang: 1000,
        categoryId: 'discount',
        receiptLineType: 'adjustment',
        adjustmentEffect: 'subtract',
      },
    ],
  });

  assert.equal(summary.grossTotalSatang, 27500);
  assert.equal(summary.netTotalSatang, 25500);
  assert.equal(summary.differenceSatang, 0);
  assert.equal(summary.adjustmentCount, 1);
  assert.equal(summary.hasAdjustments, true);
});

test('runtime line item editor state: summary rows stay compact and distinguish adjustments', () => {
  const rows = buildDraftLineItemSummaries(
    {
      lineItems: [
        { name: 'Iced latte', amountSatang: 6000, categoryId: 'coffee' },
        {
          name: 'Member discount',
          amountSatang: 500,
          categoryId: 'discount',
          receiptLineType: 'adjustment',
          adjustmentEffect: 'subtract',
        },
      ],
    },
    [
      { id: 'food', name: 'Food' },
      { id: 'coffee', name: 'Coffee', parentId: 'food' },
      { id: 'discount', name: 'Discount' },
    ],
  );

  assert.equal(rows.length, 2);
  assert.equal(rows[0].metaLabel, 'Food / Coffee');
  assert.equal(rows[0].amountPrefix, '');
  assert.equal(rows[1].isAdjustment, true);
  assert.equal(rows[1].adjustmentLabel, 'ปรับยอดลด');
  assert.equal(rows[1].amountPrefix, '-');
  assert.match(rows[1].metaLabel, /ปรับยอดลด/);
});

test('runtime category preset state: starts on main cards and only opens the chosen parent subcategories', () => {
  const categories = [
    { id: 'food', name: 'Food' },
    { id: 'coffee', name: 'Coffee', parentId: 'food' },
    { id: 'snack', name: 'Snack', parentId: 'food' },
    { id: 'travel', name: 'Travel' },
    { id: 'train', name: 'Train', parentId: 'travel' },
    { id: 'salary', name: 'Salary' },
  ];

  const mainStage = buildCategoryPresetState(categories, 'coffee');
  assert.equal(mainStage.showSubcategoryStage, false);
  assert.equal(mainStage.activeMainId, 'food');
  assert.equal(mainStage.subCategoryId, 'coffee');

  const subStage = buildCategoryPresetState(categories, 'coffee', 'food');
  assert.equal(subStage.showSubcategoryStage, true);
  assert.equal(subStage.stageMainId, 'food');
  assert.deepEqual(
    subStage.stageChildren.map((category) => category.id),
    ['coffee', 'snack'],
  );

  const parentOnly = buildCategoryPresetState(categories, 'salary', 'salary');
  assert.equal(parentOnly.activeMainId, 'salary');
  assert.equal(parentOnly.subCategoryId, '');
  assert.equal(parentOnly.showSubcategoryStage, false);
});

test('category hierarchy: broad parents are visible groups but not assignable transaction categories', () => {
  const hierarchy = buildCategoryHierarchy(DEFAULT_CATEGORIES.expense);
  const broadIds = ['food', 'transport', 'bills', 'shopping', 'groceries', 'home', 'mixed'];

  for (const id of broadIds) {
    assert.equal(isAssignableCategory(hierarchy.byId.get(id), hierarchy), false, id);
    assert.equal(canSelectCategory(hierarchy.byId.get(id), hierarchy, { selectedId: id }), true, id);
  }

  for (const id of ['dining', 'packaged_food', 'electricity', 'household_cleaning', 'oral_care', 'bank_fee']) {
    assert.equal(isAssignableCategory(hierarchy.byId.get(id), hierarchy), true, id);
  }
});

test('runtime category preset state: search finds visible main and subcategories and preserves parent focus after select', () => {
  const categories = [
    { id: 'food', name: 'Food' },
    { id: 'coffee', name: 'Coffee', parentId: 'food' },
    { id: 'snack', name: 'Snack', parentId: 'food' },
    { id: 'travel', name: 'Travel' },
    { id: 'train', name: 'Train', parentId: 'travel' },
    { id: 'hidden', name: 'Hidden', isHidden: true },
    { id: 'hidden-child', name: 'Hidden child', parentId: 'hidden', isHidden: true },
  ];

  assert.deepEqual(buildCategorySearchResults(categories, ''), []);

  const parentMatches = buildCategorySearchResults(categories, ' food ');
  assert.deepEqual(parentMatches.map((result) => result.id), ['food', 'coffee', 'snack']);
  assert.ok(parentMatches.every((result) => result.id !== 'hidden' && result.id !== 'hidden-child'));

  const coffeeMatches = buildCategorySearchResults(categories, 'coffee', 'coffee');
  assert.equal(coffeeMatches.length, 1);
  assert.equal(coffeeMatches[0].id, 'coffee');
  assert.equal(coffeeMatches[0].parentName, 'Food');
  assert.equal(coffeeMatches[0].isSubcategory, true);
  assert.equal(coffeeMatches[0].isActive, true);

  const focusedMainId = resolveCategoryPresetFocusMainId(categories, 'coffee');
  assert.equal(focusedMainId, 'food');
  assert.equal(resolveCategoryPresetFocusMainId(categories, 'travel'), '');

  const selectedState = buildCategoryPresetState(categories, 'coffee', focusedMainId);
  assert.equal(selectedState.stageMainId, 'food');
  assert.equal(selectedState.subCategoryId, 'coffee');
  assert.equal(selectedState.showSubcategoryStage, true);
});

test('runtime scan upload state: provider stages expose step-based progress copy', () => {
  const scanning = getScanUploadMeta('calling_api', 'receipt.jpg');
  assert.equal(scanning.stage, 'scanning');
  assert.equal(scanning.progressStage, 'scanning');
  assert.equal(scanning.stepText, '3/5');
  assert.equal(scanning.badgeText, '3/5');
  assert.equal(scanning.progress, 60);
  assert.match(scanning.detailText, /3\/5/);

  const done = getScanUploadMeta('done', 'receipt.jpg');
  assert.equal(done.stage, 'done');
  assert.equal(done.stepText, '5/5');
  assert.equal(done.badgeText, 'พร้อมใช้');
  assert.equal(done.progress, 100);
});

test('runtime scan upload state: error keeps prior stage progress instead of jumping to complete', () => {
  const entry = createScanUploadEntry(
    { name: 'receipt.jpg', size: 128000, type: 'image/jpeg' },
    { status: 'calling_api' },
  );
  const failed = patchScanUploadEntry(entry, {
    status: 'error',
    error: 'scan_failed',
  });

  assert.equal(failed.stage, 'error');
  assert.equal(failed.progressStage, 'scanning');
  assert.equal(failed.stepText, '3/5');
  assert.equal(failed.badgeText, 'ต้องตรวจ');
  assert.equal(failed.progress, 60);
  assert.match(failed.detailText, /3\/5/);
});

test('runtime source: category picker keeps card flow, account edit uses a compact delete trigger, and split editing uses a nested sheet', () => {
  const chooserSource = readFileSync(
    new URL('../src/features/app/CategoryPresetChooser.jsx', import.meta.url),
    'utf8',
  );
  const accountsSource = readFileSync(
    new URL('../src/features/app/screens/AccountsScreen.jsx', import.meta.url),
    'utf8',
  );
  const lineItemsSource = readFileSync(
    new URL('../src/features/app/LineItemEditorSection.jsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(chooserSource, /finance-category-fallback/);
  assert.match(chooserSource, /finance-category-step-back/);
  assert.match(chooserSource, /finance-category-search/);
  assert.match(chooserSource, /type="search"/);
  assert.match(chooserSource, /finance-category-search-empty/);
  assert.match(accountsSource, /finance-sheet-actions-compact/);
  assert.match(accountsSource, /ui-btn-danger-outline/);
  assert.match(accountsSource, /data-testid="account-delete-trigger"/);
  assert.match(lineItemsSource, /finance-line-item-summary-row/);
  assert.match(lineItemsSource, /<Sheet/);
});

test('runtime styles: sheet review containers clamp width and hide horizontal overflow', () => {
  const cssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

  assert.match(
    cssSource,
    /\.finance-sheet-body\s*\{[^}]*overflow-y:\s*auto;[^}]*overflow-x:\s*hidden;[^}]*\}/s,
  );
  assert.match(
    cssSource,
    /\.finance-sheet-scroll-root,\s*\.finance-sheet-scroll-root > \*,\s*\.finance-form,\s*\.finance-form-section,[\s\S]*?max-width:\s*100%;/s,
  );
  assert.match(cssSource, /\.finance-sheet-actions-compact\s*\{[\s\S]*display:\s*flex;/s);
  assert.match(cssSource, /\.finance-line-item-summary-row\s*\{[\s\S]*text-align:\s*left;/s);
});

test('runtime styles: category chooser search adds dedicated result and empty states', () => {
  const cssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

  assert.match(cssSource, /\.finance-category-search\s*\{[\s\S]*margin-bottom:\s*0\.7rem;/s);
  assert.match(cssSource, /\.finance-category-search-results\s*\{[\s\S]*display:\s*flex;/s);
  assert.match(cssSource, /\.finance-category-search-empty\s*\{[\s\S]*text-align:\s*center;/s);
});

test('runtime source: shared account picker is wired through add, inbox, dashboard, planner, and shell docks', () => {
  const addSource = readFileSync(
    new URL('../src/features/app/screens/AddScreen.jsx', import.meta.url),
    'utf8',
  );
  const inboxSource = readFileSync(
    new URL('../src/features/app/screens/InboxScreen.jsx', import.meta.url),
    'utf8',
  );
  const dashboardSource = readFileSync(
    new URL('../src/features/app/screens/DashboardScreen.jsx', import.meta.url),
    'utf8',
  );
  const plannerSource = readFileSync(
    new URL('../src/features/app/screens/PlannerScreen.jsx', import.meta.url),
    'utf8',
  );
  const uiSource = readFileSync(
    new URL('../src/features/app/ui.jsx', import.meta.url),
    'utf8',
  );
  const accountPickerSource = readFileSync(
    new URL('../src/features/app/AccountSheetPicker.jsx', import.meta.url),
    'utf8',
  );

  assert.match(addSource, /import AccountSheetPicker/);
  assert.match(addSource, /useKeyboardViewportState/);
  assert.match(addSource, /const manualConfirmationBar/);
  assert.match(addSource, /data-testid="manual-confirmation-bar"/);
  assert.match(addSource, /finance-manual-panel/);
  assert.doesNotMatch(addSource, /dock=\{manualDock\}/);
  assert.doesNotMatch(addSource, /const manualDock/);
  assert.match(addSource, /testId="manual-account-select"/);
  assert.match(addSource, /testId="manual-from-account-picker"/);
  assert.match(addSource, /testId="manual-to-account-picker"/);
  assert.match(addSource, /applySingleAccountSelection/);
  assert.match(addSource, /applyTransferFromAccountSelection/);
  assert.match(addSource, /applyTransferToAccountSelection/);
  assert.match(
    addSource,
    /await createManualTransaction\(prepareManualDraft\(draft\)\);[\s\S]*resetDraft\(\);[\s\S]*setMode\("scan"\);/s,
  );
  // Per-line categories must reach the save plan instead of being dropped.
  assert.match(addSource, /splitByCategory: true/);
  assert.match(addSource, /lineCategoryIds\.size >= 2/);
  assert.doesNotMatch(addSource, /<label className="finance-field">\s*<span className="ui-label">[^<]*<\/span>\s*<AccountSheetPicker/s);
  assert.doesNotMatch(addSource, /finance-page-actions/);

  assert.match(inboxSource, /import AccountSheetPicker/);
  assert.match(inboxSource, /testId="review-account-picker"/);
  assert.match(inboxSource, /testId="review-from-account-picker"/);
  assert.match(inboxSource, /testId="review-to-account-picker"/);
  assert.doesNotMatch(inboxSource, /<label className="finance-field">\s*<span className="ui-label">[^<]*<\/span>\s*<AccountSheetPicker/s);

  assert.match(dashboardSource, /import AccountSheetPicker/);
  assert.match(dashboardSource, /dashboardOverviewCards/);
  assert.match(dashboardSource, /data-testid="dashboard-money-overview"/);
  assert.match(dashboardSource, /ยอดบัญชีสุทธิ/);
  assert.match(dashboardSource, /สรุปเงินเดือนนี้/);
  assert.doesNotMatch(dashboardSource, /<label className="finance-field">\s*<span className="ui-label">[^<]*<\/span>\s*<AccountSheetPicker/s);

  assert.match(plannerSource, /import AccountSheetPicker/);
  assert.match(plannerSource, /testId="planner-goal-linked-account"/);
  assert.match(plannerSource, /emptyTestId="planner-goal-linked-account-empty"/);
  assert.match(plannerSource, /testId="planner-debt-account"/);
  assert.doesNotMatch(plannerSource, /<label className="finance-field">\s*<span className="ui-label">[^<]*<\/span>\s*<AccountSheetPicker/s);

  assert.match(uiSource, /finance-screen-head-sticky/);
  assert.match(uiSource, /finance-screen-dock/);
  assert.match(uiSource, /finance-screen-has-dock/);
  assert.match(uiSource, /export function useKeyboardViewportState/);
  assert.match(uiSource, /createPortal/);
  assert.match(uiSource, /document\.body/);

  assert.match(accountPickerSource, /suppressOpenUntilRef/);
  assert.match(accountPickerSource, /Date\.now\(\) < suppressOpenUntilRef\.current/);
  assert.match(accountPickerSource, /requestAnimationFrame/);
  assert.match(accountPickerSource, /event\?\.preventDefault/);
});

test('phase 14 polish source: mobile amounts and debt planner labels stay Thai-first', () => {
  const transactionCardSource = readFileSync(new URL('../src/components/TransactionCard.jsx', import.meta.url), 'utf8');
  const transactionDetailSource = readFileSync(new URL('../src/components/TransactionDetailModal.jsx', import.meta.url), 'utf8');
  const attachmentPreviewSource = readFileSync(new URL('../src/components/AttachmentPreview.jsx', import.meta.url), 'utf8');
  const debtWorkspaceSource = readFileSync(new URL('../src/features/debts/DebtPlannerWorkspace.jsx', import.meta.url), 'utf8');

  assert.match(transactionCardSource, /max-w-\[9rem\][\s\S]*truncate[\s\S]*text-right/);
  assert.match(transactionDetailSource, /if \(key === "credit_payment"\) return "ชำระบัตรเครดิต";/);
  assert.match(transactionDetailSource, /<SectionTitle icon=\{ArrowRightLeft\}>รายละเอียดการโอน<\/SectionTitle>/);
  assert.match(transactionDetailSource, /<DetailRow label="บัญชี" value=\{model\.accountName\} \/>/);
  assert.match(transactionDetailSource, /break-all[\s\S]*tabular-nums/);
  assert.doesNotMatch(transactionDetailSource, /Credit payment|Transfer details|<DetailRow label="Account"|<DetailRow label="Category"/);
  assert.match(attachmentPreviewSource, /tabIndex:\s*preview\.canOpen\s*\?\s*0\s*:\s*undefined/);
  assert.match(attachmentPreviewSource, /event\.key !== "Enter" && event\.key !== " "/);
  assert.match(attachmentPreviewSource, /onPointerDown:\s*stopAttachmentEvent/);
  assert.match(debtWorkspaceSource, /aria-label="กลยุทธ์จัดลำดับหนี้"/);
  assert.match(debtWorkspaceSource, />เดือน</);
  assert.match(debtWorkspaceSource, /ข้อมูล statement ในเครื่อง/);
  assert.match(debtWorkspaceSource, /ยอดแนะนำให้ชำระ/);
  assert.doesNotMatch(debtWorkspaceSource, />Month</);
  assert.doesNotMatch(debtWorkspaceSource, /local statement data/);
  assert.doesNotMatch(debtWorkspaceSource, /recommended payment/);
});

test('runtime source: debt planner duplicate checks use planner transaction metadata history', () => {
  const screenSource = readFileSync(
    new URL('../src/features/app/screens/DebtPlannerScreen.jsx', import.meta.url),
    'utf8',
  );
  const providerSource = readFileSync(
    new URL('../src/features/app/AppProvider.jsx', import.meta.url),
    'utf8',
  );

  assert.match(screenSource, /planningTransactions,/);
  assert.match(screenSource, /transactions:\s*planningTransactions/);
  assert.doesNotMatch(screenSource, /transactions:\s*recentTransactions/);
  assert.match(
    providerSource,
    /\.select\(\s*"id, kind, category_id, amount_satang, date, is_split_parent, is_split_child, raw, from_account_id, to_account_id"\s*\)/,
  );
});

test('runtime styles: mobile shell keeps app chrome in flow and preserves dock/account picker cards', () => {
  const cssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

  assert.match(cssSource, /--finance-viewport-h:\s*100dvh/);
  assert.match(cssSource, /body\[data-finance-shell="true"\]\s*\{[\s\S]*overflow-y:\s*hidden;/s);
  assert.match(cssSource, /\.finance-app-header\s*\{[\s\S]*position:\s*relative;/s);
  assert.match(cssSource, /\.finance-bottom-nav-wrap\s*\{[\s\S]*position:\s*relative;/s);
  assert.match(cssSource, /\.finance-app-main\s*\{[\s\S]*padding-top:\s*0\.55rem;[\s\S]*padding-bottom:\s*calc\(var\(--finance-screen-dock-h\) \+ 0\.55rem\);/s);
  assert.doesNotMatch(cssSource, /\.finance-app-main\s*\{[^}]*finance-nav-reserve/s);
  assert.match(cssSource, /\.finance-screen-head-sticky\s*\{[\s\S]*position:\s*static;/s);
  assert.match(cssSource, /\.finance-screen-dock\s*\{[\s\S]*position:\s*fixed;[\s\S]*bottom:\s*calc\(var\(--finance-nav-reserve\) - 0\.25rem\);/s);
  assert.match(cssSource, /\.finance-screen-has-dock \.finance-screen-body\s*\{[\s\S]*padding-bottom:\s*calc\(var\(--finance-screen-dock-h\)/s);
  assert.match(cssSource, /body\[data-keyboard-open="true"\] \.finance-screen-dock\s*\{[\s\S]*bottom:\s*calc\(var\(--keyboard-inset,\s*0px\) \+ env\(safe-area-inset-bottom\) \+ 0\.7rem\);/s);
  assert.match(cssSource, /body\[data-modal-open="true"\] \.finance-bottom-nav-wrap,\s*body\[data-keyboard-open="true"\] \.finance-bottom-nav-wrap\s*\{[\s\S]*display:\s*none;/s);
  assert.match(cssSource, /\.finance-picker-trigger\s*\{[\s\S]*min-height:\s*4\.15rem;/s);
  assert.match(cssSource, /\.finance-account-picker-card\.is-selected\s*\{[\s\S]*border-color:/s);
  assert.doesNotMatch(cssSource, /\.finance-app-shell\s*\{[\s\S]*touch-action:\s*pan-y;/s);
  assert.doesNotMatch(cssSource, /\.finance-bottom-nav-wrap\s*\{[\s\S]*touch-action:\s*pan-y;/s);
});

test('runtime styles: app-wide stability pass prevents responsive overlap', () => {
  const cssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

  assert.match(cssSource, /\/\* App-wide UX stability pass \*\//);
  assert.match(
    cssSource,
    /\/\* App-wide UX stability pass \*\/[\s\S]*\.finance-app-main\s*\{[\s\S]*padding-bottom:\s*calc\(var\(--finance-screen-dock-h,\s*0px\) \+ 0\.9rem\);/s,
  );
  assert.match(
    cssSource,
    /\/\* App-wide UX stability pass \*\/[\s\S]*\.finance-row-side\s*\{[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*min\(46%,\s*15rem\);/s,
  );
  assert.match(
    cssSource,
    /\/\* App-wide UX stability pass \*\/[\s\S]*\.finance-sheet\s*\{[\s\S]*max-width:\s*calc\(100vw - 1rem\);/s,
  );
  assert.match(
    cssSource,
    /@media \(max-width:\s*520px\)[\s\S]*\.finance-sheet-actions,\s*\.finance-screen-dock-actions,\s*\.finance-dashboard-actions,\s*\.finance-inline-actions\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s,
  );
  assert.match(
    cssSource,
    /\.finance-dashboard-overview-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s,
  );
  assert.match(
    cssSource,
    /@media \(min-width:\s*760px\)[\s\S]*\.finance-dashboard-overview-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/s,
  );
  assert.match(
    cssSource,
    /@media \(max-width:\s*380px\)[\s\S]*\.finance-row\s*\{[\s\S]*flex-direction:\s*column;[\s\S]*align-items:\s*stretch;/s,
  );
  assert.match(
    cssSource,
    /a:focus-visible,\s*button:focus-visible,\s*input:focus-visible,\s*select:focus-visible,\s*textarea:focus-visible,\s*\[tabindex\]:focus-visible\s*\{[\s\S]*outline:\s*2px solid rgba\(0,\s*122,\s*255,\s*0\.82\);/s,
  );
  const manualConfirmationBarBlock = cssSource.match(/\.finance-manual-confirmation-bar\s*\{[^}]*\}/)?.[0] || "";
  assert.match(manualConfirmationBarBlock, /position:\s*static;/);
  assert.match(manualConfirmationBarBlock, /background:\s*var\(--surface-strong\);/);
  assert.doesNotMatch(manualConfirmationBarBlock, /position:\s*(fixed|sticky|absolute);/);
  assert.match(
    cssSource,
    /body\[data-keyboard-open="true"\] \.finance-manual-confirmation-bar\s*\{[\s\S]*position:\s*static;/s,
  );
  assert.doesNotMatch(cssSource, /finance-add-dock-actions/);
});

test('runtime source: service worker only registers in production and clears old runtime caches in dev', () => {
  const appRootSource = readFileSync(new URL('../src/core/AppRoot.jsx', import.meta.url), 'utf8');

  assert.match(appRootSource, /const CACHE_PREFIX = "smart-expense-runtime";/);
  assert.match(appRootSource, /const isProd = String\(process\.env\.NODE_ENV \|\| ""\)\.toLowerCase\(\) === "production";/);
  assert.match(appRootSource, /const clearDevServiceWorkers = async \(\) => \{[\s\S]*navigator\.serviceWorker\.getRegistrations\(\)/s);
  assert.match(appRootSource, /if \(!isProd\) \{[\s\S]*clearDevServiceWorkers\(\)/s);
  assert.match(appRootSource, /window\.caches\.keys\(\)/);
  assert.match(appRootSource, /registration = await navigator\.serviceWorker\.register\(swUrl, \{ scope: "\/" \}\)/);
});

test('route helpers: canonical routes, aliases, and legacy hashes resolve to Next paths', () => {
  assert.equal(getCanonicalPathForPathname('/add-transaction'), '/add');
  assert.equal(getCanonicalPathForPathname('/budgets'), '/planner');
  assert.equal(getCanonicalPathForPathname('/debt-planner'), '/debts');
  assert.equal(getCanonicalPathForPathname('/subscriptions'), '/bills');
  assert.equal(getViewForPathname('/accounts'), 'accounts');
  assert.equal(getViewForPathname('/plan'), 'plan');
  assert.equal(getViewForPathname('/assistant'), 'assistant');
  assert.equal(getViewForPathname('/goals'), 'goals');
  assert.equal(getViewForPathname('/debts'), 'debts');
  assert.equal(getViewForPathname('/bills'), 'bills');
  assert.equal(getViewForPathname('/stats'), 'planner');
  assert.equal(getPathForLegacyHash('#dashboard'), '/dashboard');
  assert.equal(getPathForLegacyHash('#add-transaction'), '/add');
  assert.equal(getPathForLegacyHash('#stats'), '/planner');
  assert.equal(getPathForLegacyHash('#/stats'), '/planner');
  assert.equal(getPathForLegacyHash('#/plan'), '/plan');
  assert.equal(getPathForLegacyHash('#/assistant'), '/assistant');
  assert.equal(getPathForLegacyHash('#/recurring'), '/recurring');
  assert.equal(getPathForLegacyHash('#/goals'), '/goals');
  assert.equal(getPathForLegacyHash('#/debts'), '/debts');
  assert.equal(getPathForLegacyHash('#/bills'), '/bills');
  assert.equal(getInitialHomePath({ pathname: '/', hash: '#/stats' }), '/planner');
  assert.equal(getInitialHomePath({ pathname: '/', hash: '#/plan' }), '/plan');
  assert.equal(getInitialHomePath({ pathname: '/', hash: '#/assistant' }), '/assistant');
  assert.equal(getInitialHomePath({ pathname: '/accounts', hash: '#/stats' }), '/accounts');
  assert.equal(getInitialHomePath({ pathname: '/', hash: '' }), '/dashboard');
});

test('credit statements route: runtime, hash router, and settings entry are wired', () => {
  const appRootSource = readFileSync(new URL('../src/core/AppRoot.jsx', import.meta.url), 'utf8');
  const settingsSource = readFileSync(new URL('../src/features/app/screens/SettingsScreen.jsx', import.meta.url), 'utf8');
  const moreSource = readFileSync(new URL('../src/views/MoreView.jsx', import.meta.url), 'utf8');
  const screenSource = readFileSync(new URL('../src/views/CreditStatementsView.jsx', import.meta.url), 'utf8');
  const runtimePageSource = readFileSync(new URL('../app/(runtime)/credit-statements/page.js', import.meta.url), 'utf8');

  assert.equal(getPathForView('credit-statements'), '/credit-statements');
  assert.equal(getViewForPathname('/credit-statements'), 'credit-statements');
  assert.equal(getPathForLegacyHash('#/credit-statements'), '/credit-statements');
  assert.equal(parseHash('#/credit-statements').view, 'credit-statements');
  assert.equal(buildHash('credit-statements'), '#/credit-statements');
  assert.match(appRootSource, /credit-statements/);
  assert.match(appRootSource, /CreditStatementsScreen/);
  assert.match(settingsSource, /รอบบิลบัตรเครดิต/);
  assert.match(settingsSource, /navigateToView\("credit-statements"\)/);
  assert.match(moreSource, /รอบบิลบัตรเครดิต/);
  assert.match(moreSource, /navigate\("credit-statements"\)/);
  assert.match(screenSource, /ยอดขั้นต่ำ/);
  assert.match(screenSource, /ยอดเต็มที่ต้องจ่าย/);
  assert.match(runtimePageSource, /return null/);
});

test('salary planner route: runtime, hash router, More, and statement CTA are wired', () => {
  const appRootSource = readFileSync(new URL('../src/core/AppRoot.jsx', import.meta.url), 'utf8');
  const moreSource = readFileSync(new URL('../src/views/MoreView.jsx', import.meta.url), 'utf8');
  const creditStatementsSource = readFileSync(new URL('../src/views/CreditStatementsView.jsx', import.meta.url), 'utf8');
  const screenSource = readFileSync(new URL('../src/views/SalaryPlannerView.jsx', import.meta.url), 'utf8');
  const runtimePageSource = readFileSync(new URL('../app/(runtime)/salary-planner/page.js', import.meta.url), 'utf8');

  assert.equal(getPathForView('salary-planner'), '/salary-planner');
  assert.equal(getViewForPathname('/salary-planner'), 'salary-planner');
  assert.equal(getPathForLegacyHash('#/salary-planner'), '/salary-planner');
  assert.equal(parseHash('#/salary-planner').view, 'salary-planner');
  assert.equal(buildHash('salary-planner'), '#/salary-planner');
  assert.match(appRootSource, /salary-planner/);
  assert.match(appRootSource, /SalaryPlannerScreen/);
  assert.match(moreSource, /navigate\("salary-planner"\)/);
  assert.match(creditStatementsSource, /salary-planner/);
  assert.match(screenSource, /calculateCreditPaymentPlan/);
  assert.match(screenSource, /recommendedPayment/);
  assert.match(screenSource, /minimum_due_shortfall/);
  assert.match(runtimePageSource, /return null/);
});

test('credit statement reminders source: dashboard and accounts use shared reminder helpers', () => {
  const legacyDashboardSource = readFileSync(new URL('../src/views/DashboardView.jsx', import.meta.url), 'utf8');
  const legacyAccountsSource = readFileSync(new URL('../src/views/AccountsView.jsx', import.meta.url), 'utf8');
  const runtimeDashboardSource = readFileSync(new URL('../src/features/app/screens/DashboardScreen.jsx', import.meta.url), 'utf8');
  const runtimeAccountsSource = readFileSync(new URL('../src/features/app/screens/AccountsScreen.jsx', import.meta.url), 'utf8');

  assert.match(legacyDashboardSource, /getCreditStatementReminderSummary/);
  assert.match(legacyDashboardSource, /dashboard-credit-statements/);
  assert.match(legacyDashboardSource, /salary-planner/);
  assert.match(runtimeDashboardSource, /getCreditStatementReminderSummary/);
  assert.match(runtimeDashboardSource, /dashboard-credit-statements/);
  assert.match(runtimeDashboardSource, /salary-planner/);
  assert.match(legacyAccountsSource, /getCreditCardStatementStatus/);
  assert.match(legacyAccountsSource, /account-credit-statement-/);
  assert.match(runtimeAccountsSource, /getCreditCardStatementStatus/);
  assert.match(runtimeAccountsSource, /account-credit-statement-/);
});

test('entry intent helpers: explicit one-shot intents are normalized deterministically', () => {
  assert.deepEqual(
    normalizeNewEntryIntent({ scanUploadKind: 'receipt' }),
    { entryMode: 'scan', scanUploadKind: 'receipt' },
  );
  assert.deepEqual(
    resolveNewEntryIntent({
      storeIntent: { entryMode: 'manual' },
      legacyIntent: { entryMode: 'scan', scanUploadKind: 'receipt' },
    }),
    { entryMode: 'manual' },
  );
  assert.equal(
    resolveNewEntryIntent({
      isEditMode: true,
      storeIntent: { entryMode: 'scan', scanUploadKind: 'receipt' },
    }),
    null,
  );
});

test('split category helper: income parents never fall back to expense mixed', () => {
  assert.equal(
    deriveSplitParentCategoryId({
      type: 'income',
      childCategoryIds: ['salary', 'salary'],
      existingParentCategoryId: 'mixed',
    }),
    'salary',
  );
  assert.equal(
    deriveSplitParentCategoryId({
      type: 'income',
      childCategoryIds: ['salary', 'bonus'],
      existingParentCategoryId: 'mixed',
    }),
    'other_income',
  );
});

test('categories: duplicate income ids are canonicalized for Supabase storage', () => {
  assert.equal(canonicalizeCategoryId('expense', 'interest'), 'interest');
  assert.equal(canonicalizeCategoryId('income', 'interest'), 'interest_income');
  assert.equal(canonicalizeCategoryId('expense', 'adjust_balance'), 'adjust_balance');
  assert.equal(canonicalizeCategoryId('income', 'adjust_balance'), 'adjust_balance_income');
});

test('planner helpers: goal progress and next debt due date stay bounded', () => {
  assert.equal(
    getGoalProgressPercent({ target_amount_satang: 200000, current_amount_satang: 100000 }),
    50,
  );
  assert.equal(
    getGoalProgressPercent({ target_amount_satang: 100000, current_amount_satang: 180000 }),
    100,
  );
  assert.equal(
    getNextDebtDueDateISO({ due_day: 5 }, '2026-04-01'),
    '2026-04-05',
  );
  assert.equal(
    getNextDebtDueDateISO({ due_day: 5 }, '2026-04-20'),
    '2026-05-05',
  );
});

test('planner helpers: snapshot aggregates active debt and goal totals for the selected month', () => {
  const summary = buildPlannerSnapshot({
    monthValue: '2026-04',
    today: '2026-04-01',
    goals: [
      {
        id: 1,
        name: 'Emergency fund',
        target_amount_satang: 200000,
        current_amount_satang: 50000,
        status: 'active',
      },
      {
        id: 2,
        name: 'Paused goal',
        target_amount_satang: 100000,
        current_amount_satang: 25000,
        status: 'paused',
      },
    ],
    debts: [
      {
        id: 10,
        account_id: 1,
        current_balance_satang: 300000,
        target_payment_satang: 25000,
        due_day: 5,
        status: 'active',
      },
      {
        id: 11,
        account_id: 2,
        current_balance_satang: 150000,
        target_payment_satang: 10000,
        due_day: 25,
        status: 'paused',
      },
    ],
  });

  assert.equal(summary.activeGoalCount, 1);
  assert.equal(summary.activeDebtCount, 1);
  assert.equal(summary.totalGoalCurrentSatang, 50000);
  assert.equal(summary.totalDebtBalanceSatang, 300000);
  assert.equal(summary.monthlyPlannedPaymentSatang, 25000);
  assert.equal(summary.goalProgressPercent, 25);
});

test('planner helpers: reminders surface due debts and near-deadline goals', () => {
  const reminders = buildPlannerReminders({
    today: '2026-04-01',
    goals: [
      {
        id: 1,
        name: 'Vacation',
        target_amount_satang: 90000,
        current_amount_satang: 20000,
        target_date: '2026-04-04',
        status: 'active',
      },
    ],
    debts: [
      {
        id: 2,
        account_id: 88,
        current_balance_satang: 150000,
        target_payment_satang: 12000,
        due_day: 3,
        status: 'active',
      },
    ],
    accountsById: new Map([[88, { id: 88, name: 'Visa Platinum' }]]),
  });

  assert.equal(reminders.length, 2);
  assert.equal(reminders[0].type, 'debt');
  assert.equal(reminders[0].title, 'Visa Platinum');
  assert.equal(reminders[1].type, 'goal');
  assert.equal(reminders[1].title, 'Vacation');
});

test('budget planning helpers: config defaults stay on rolling average paydown', () => {
  const config = normalizePlanningConfig({});

  assert.equal(config.incomeMode, 'rolling_average');
  assert.equal(config.incomeLookbackMonths, 3);
  assert.equal(config.savingsMode, 'amount');
  assert.equal(config.savingsAmountSatang, 0);
  assert.equal(config.savingsPercentBps, 0);
  assert.equal(config.debtStrategyMode, 'paydown');
});

test('budget planning helpers: rolling income, category reduction, and debt priority are deterministic', () => {
  const categories = {
    expense: [
      { id: 'housing', kind: 'expense', name: 'Housing', parentId: '', isHidden: false },
      { id: 'food', kind: 'expense', name: 'Food', parentId: '', isHidden: false },
      { id: 'fun', kind: 'expense', name: 'Fun', parentId: '', isHidden: false },
    ],
    income: [],
  };

  const snapshot = buildBudgetPlanSnapshot({
    profile: {
      income_mode: 'rolling_average',
      income_lookback_months: 3,
      savings_mode: 'amount',
      savings_amount_satang: 10000,
      debt_strategy_mode: 'paydown',
    },
    categories,
    debtPlans: [
      { id: 1, account_id: 11, current_balance_satang: 50000, minimum_payment_satang: 3000, apr_bps: 2500, due_day: 20, status: 'active' },
      { id: 2, account_id: 12, current_balance_satang: 20000, minimum_payment_satang: 2000, apr_bps: 1800, due_day: 5, status: 'active' },
    ],
    budgetRows: [],
    transactions: [
      { kind: 'income', category_id: '', amount_satang: 100000, date: '2026-01-10' },
      { kind: 'income', category_id: '', amount_satang: 100000, date: '2026-02-10' },
      { kind: 'income', category_id: '', amount_satang: 100000, date: '2026-03-10' },
      { kind: 'expense', category_id: 'housing', amount_satang: 50000, date: '2026-01-05' },
      { kind: 'expense', category_id: 'food', amount_satang: 30000, date: '2026-01-06' },
      { kind: 'expense', category_id: 'fun', amount_satang: 40000, date: '2026-01-07' },
      { kind: 'expense', category_id: 'housing', amount_satang: 50000, date: '2026-02-05' },
      { kind: 'expense', category_id: 'food', amount_satang: 30000, date: '2026-02-06' },
      { kind: 'expense', category_id: 'fun', amount_satang: 40000, date: '2026-02-07' },
      { kind: 'expense', category_id: 'housing', amount_satang: 50000, date: '2026-03-05' },
      { kind: 'expense', category_id: 'food', amount_satang: 30000, date: '2026-03-06' },
      { kind: 'expense', category_id: 'fun', amount_satang: 40000, date: '2026-03-07' },
    ],
    monthValue: '2026-04',
    today: '2026-04-01',
  });

  const byId = new Map(snapshot.categoryPlans.map((plan) => [plan.categoryId, plan]));

  assert.equal(snapshot.selectedIncomeSatang, 100000);
  assert.equal(snapshot.availableExpenseSatang, 85000);
  assert.equal(byId.get('housing')?.suggestedLimitSatang, 50000);
  assert.equal(byId.get('food')?.suggestedLimitSatang, 30000);
  assert.equal(byId.get('fun')?.suggestedLimitSatang, 5000);
  assert.equal(snapshot.suggestedShortfallSatang, 0);
  assert.equal(snapshot.debtTarget?.id, 1);
});

test('budget planning helpers: daily budget uses remaining monthly budget for the current month', () => {
  const snapshot = buildBudgetPlanSnapshot({
    profile: { income_mode: 'fixed', fixed_income_satang: 50000, debt_strategy_mode: 'survival' },
    categories: {
      expense: [{ id: 'food', kind: 'expense', name: 'Food', parentId: '', isHidden: false }],
      income: [],
    },
    debtPlans: [],
    budgetRows: [{ month_key: '2026-04', category_id: 'food', limit_satang: 9000, alert_pct: 90, source: 'manual', manual_override: true }],
    transactions: [
      { kind: 'expense', category_id: 'food', amount_satang: 1000, date: '2026-04-01' },
      { kind: 'expense', category_id: 'food', amount_satang: 2000, date: '2026-04-10' },
    ],
    monthValue: '2026-04',
    today: '2026-04-11',
  });

  assert.equal(snapshot.activeExpenseBudgetSatang, 9000);
  assert.equal(snapshot.spentToDateSatang, 3000);
  assert.equal(snapshot.daysRemaining, 20);
  assert.equal(snapshot.dailyBudgetSatang, 300);
});

test('budget planning helpers: add-transaction hint prefers child override over parent budget', () => {
  const hint = buildBudgetHint({
    draft: {
      kind: 'expense',
      categoryId: 'coffee',
      amountSatang: 3000,
      date: '2026-04-12',
    },
    budgetRows: [
      { month_key: '2026-04', category_id: 'food', limit_satang: 30000, alert_pct: 90, source: 'manual', manual_override: true },
      { month_key: '2026-04', category_id: 'coffee', limit_satang: 10000, alert_pct: 90, source: 'manual', manual_override: true },
    ],
    categories: {
      expense: [
        { id: 'food', kind: 'expense', name: 'Food', parentId: '', isHidden: false },
        { id: 'coffee', kind: 'expense', name: 'Coffee', parentId: 'food', isHidden: false },
        { id: 'groceries', kind: 'expense', name: 'Groceries', parentId: 'food', isHidden: false },
      ],
      income: [],
    },
    transactions: [
      { kind: 'expense', category_id: 'coffee', amount_satang: 8000, date: '2026-04-04' },
      { kind: 'expense', category_id: 'groceries', amount_satang: 15000, date: '2026-04-06' },
    ],
  });

  assert.equal(hint?.scope, 'child');
  assert.equal(hint?.plannedLimitSatang, 10000);
  assert.equal(hint?.spentSatang, 8000);
  assert.equal(hint?.overBySatang, 1000);
  assert.equal(hint?.status, 'over');
});

test('scan model helpers: normalize GPT-5.4 aliases and keep GPT-5.4 as the default', () => {
  assert.equal(OPENAI_SCAN_DEFAULT_MODEL, 'gpt-5.4');
  assert.equal(normalizeOpenAIModel(''), 'gpt-5.4');
  assert.equal(normalizeOpenAIModel('5.4'), 'gpt-5.4');
  assert.equal(normalizeOpenAIModel('chatgpt 5.4'), 'gpt-5.4');
  assert.equal(normalizeOpenAIModel('gpt-5.4'), 'gpt-5.4');
  assert.equal(normalizeOpenAIModel('5'), 'gpt-5-chat-latest');
  assert.equal(normalizeOpenAIModel('gpt-5.1'), 'gpt-5.1');
});

test('account balance helpers: normalize rows and build full balance maps', () => {
  const rows = normalizeAccountBalanceRows([
    { id: '1', balance_satang: '1200' },
    { id: 2, balance_satang: -5000 },
    { id: null, balance_satang: 100 },
  ]);

  assert.deepEqual(rows, [
    { id: 1, balance_satang: 1200 },
    { id: 2, balance_satang: -5000 },
  ]);

  const balanceMap = buildAccountBalanceMap(rows);
  assert.equal(balanceMap.get(1), 1200);
  assert.equal(balanceMap.get(2), -5000);
});

test('account balance helpers: summarize positive, negative, and noop adjustments', () => {
  assert.deepEqual(
    buildAccountAdjustmentSummary({ currentBalanceSatang: 10000, desiredBalanceSatang: 13500 }),
    {
      currentBalanceSatang: 10000,
      desiredBalanceSatang: 13500,
      deltaSatang: 3500,
      amountSatang: 3500,
      kind: 'income',
      noop: false,
    },
  );

  assert.deepEqual(
    buildAccountAdjustmentSummary({ currentBalanceSatang: 10000, desiredBalanceSatang: 8500 }),
    {
      currentBalanceSatang: 10000,
      desiredBalanceSatang: 8500,
      deltaSatang: -1500,
      amountSatang: 1500,
      kind: 'expense',
      noop: false,
    },
  );

  assert.deepEqual(
    buildAccountAdjustmentSummary({ currentBalanceSatang: -5000, desiredBalanceSatang: -5000 }),
    {
      currentBalanceSatang: -5000,
      desiredBalanceSatang: -5000,
      deltaSatang: 0,
      amountSatang: 0,
      kind: null,
      noop: true,
    },
  );
});

test('account balance helpers: liability account types normalize stored and editable signs', () => {
  assert.equal(isLiabilityAccountType('credit'), true);
  assert.equal(isLiabilityAccountType('loan'), true);
  assert.equal(isLiabilityAccountType('bank'), false);

  assert.equal(normalizeAccountBalanceForType('credit', 233675), -233675);
  assert.equal(normalizeAccountBalanceForType('credit', -233675), -233675);
  assert.equal(normalizeAccountBalanceForType('loan', 500000), -500000);
  assert.equal(normalizeAccountBalanceForType('bank', 125000), 125000);

  assert.equal(getEditableAccountBalanceSatang('credit', -233675), 233675);
  assert.equal(getEditableAccountBalanceSatang('credit', 233675), 233675);
  assert.equal(getEditableAccountBalanceSatang('bank', 125000), 125000);
});

test('system categories: generated rows stay globally unique', () => {
  const rows = getSystemCategoryRows();
  const ids = rows.map((row) => row.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);

  assert.deepEqual(duplicates, []);
  assert.ok(ids.includes('interest_income'));
  assert.ok(ids.includes('adjust_balance_income'));
});

test('runtime provider: month changes refresh data without rerunning bootstrap', () => {
  const providerSource = readFileSync(
    new URL('../src/features/app/AppProvider.jsx', import.meta.url),
    'utf8',
  );

  const bootstrapIndex = providerSource.indexOf('async function bootstrap()');
  assert.ok(bootstrapIndex > 0, 'provider should still declare a bootstrap effect');

  const depsIndex = providerSource.indexOf('}, [', bootstrapIndex);
  const bootstrapDeps = providerSource.slice(depsIndex, providerSource.indexOf(');', depsIndex) + 2);
  assert.equal(bootstrapDeps, '}, [session, supabase]);');

  assert.match(providerSource, /loadedMonthRef\.current === selectedMonth\) return;/);
  assert.match(providerSource, /loadedMonthRef\.current = selectedMonth;\s*refreshAllEvent\(\);/);
});

test('runtime provider: offline queue drain cannot retrigger itself in a loop', () => {
  const providerSource = readFileSync(
    new URL('../src/features/app/AppProvider.jsx', import.meta.url),
    'utf8',
  );

  assert.match(providerSource, /function applyOfflineQueueState\(nextQueue\)/);
  assert.match(providerSource, /isSameOfflineQueue\(current, nextQueue\) \? current : nextQueue/);
  assert.match(providerSource, /!isOnline \|\| offlineQueueRunningRef\.current\) return;/);
  assert.doesNotMatch(providerSource, /\n\s*setQueue\(readOfflineQueue\(\)\);/);
  assert.match(
    providerSource,
    /createManualTransaction\(item\.payload, \{ skipQueue: true, deferRefresh: true \}\)/,
  );
  assert.match(providerSource, /uploadScanFile\(file, \{ skipQueue: true, deferRefresh: true \}\)/);
});

test('runtime provider: session requests carry an abort deadline', () => {
  const providerSource = readFileSync(
    new URL('../src/features/app/AppProvider.jsx', import.meta.url),
    'utf8',
  );

  assert.match(providerSource, /const REQUEST_TIMEOUT_MS = \d+;/);
  assert.match(providerSource, /new AbortController\(\)/);
  assert.match(providerSource, /throw new Error\("request_timeout"\)/);
});

test('runtime shell: a crashing screen is contained by an error boundary', () => {
  const rootSource = readFileSync(new URL('../src/core/AppRoot.jsx', import.meta.url), 'utf8');
  const boundarySource = readFileSync(
    new URL('../src/features/app/ScreenErrorBoundary.jsx', import.meta.url),
    'utf8',
  );

  assert.match(rootSource, /<ScreenErrorBoundary resetKey=\{view\}>/);
  assert.match(rootSource, /window\.clearInterval\(refreshIntervalId\)/);
  assert.match(boundarySource, /static getDerivedStateFromError/);
  assert.match(boundarySource, /ChunkLoadError/);
});

test('runtime provider: transaction and scan writes use targeted refreshes', () => {
  const providerSource = readFileSync(
    new URL('../src/features/app/AppProvider.jsx', import.meta.url),
    'utf8',
  );

  const readBlock = (name) => {
    const start = providerSource.indexOf(`async function ${name}(`);
    assert.ok(start > 0, `provider should declare ${name}`);
    const end = providerSource.indexOf('\n  }\n', start);
    return providerSource.slice(start, end);
  };

  for (const name of ['createManualTransaction', 'updateTransaction', 'deleteTransaction']) {
    const block = readBlock(name);
    assert.match(block, /refreshTransactionDependentState\(/, name);
    assert.doesNotMatch(block, /await refreshAll\(\)/, name);
  }

  for (const name of ['rejectScanDocument', 'uploadScanFile', 'retryScanUpload']) {
    const block = readBlock(name);
    assert.match(block, /refreshScanDocuments\(\)/, name);
    assert.doesNotMatch(block, /await refreshAll\(\)/, name);
  }

  assert.match(readBlock('approveScanDocument'), /refreshTransactionDependentState\(\{ includeScans: true \}\)/);

  // Account and category writes still need the full fan-out.
  for (const name of ['saveAccount', 'deleteAccount', 'adjustAccountBalance', 'saveCategory']) {
    assert.match(readBlock(name), /await refreshAll\(\)/, name);
  }

  const targeted = readBlock('refreshTransactionDependentState');
  assert.doesNotMatch(targeted, /planner_monthly_plans/);
  assert.doesNotMatch(targeted, /from\("categories"\)/);
  assert.doesNotMatch(targeted, /from\("budgets"\)/);
  assert.match(targeted, /setPlanningTransactions\(/);
  assert.match(targeted, /dashboard_snapshot/);
  assert.match(targeted, /account_balance_snapshot/);
});

test('runtime shell: toasts render while signed out and while bootstrapping', () => {
  const rootSource = readFileSync(new URL('../src/core/AppRoot.jsx', import.meta.url), 'utf8');

  const signedOutBranch = rootSource.slice(
    rootSource.indexOf('if (!authReady)'),
    rootSource.indexOf('const ActiveScreen'),
  );
  const toastCount = (signedOutBranch.match(/<ToastBar/g) || []).length;

  assert.equal(toastCount, 3, 'auth, loading, and bootstrapping branches each need a ToastBar');
  assert.match(signedOutBranch, /<AuthScreen \/>/);
});

test('runtime provider: exposed actions surface failures as toasts', () => {
  const providerSource = readFileSync(
    new URL('../src/features/app/AppProvider.jsx', import.meta.url),
    'utf8',
  );

  assert.match(providerSource, /function decorateActionsWithErrorFeedback\(/);
  assert.match(providerSource, /decorateActionsWithErrorFeedback\(value, \(error, fallback\) =>/);
  assert.match(providerSource, /value=\{decoratedValue\}/);
  // The error must be rethrown so a failed save cannot clear the draft or close the sheet.
  assert.match(providerSource, /onError\(error, fallback\);\s*throw error;/);

  for (const action of [
    'saveAccount',
    'deleteAccount',
    'createManualTransaction',
    'updateTransaction',
    'deleteTransaction',
    'approveScanDocument',
    'saveBudgetRow',
    'saveRecurringRule',
  ]) {
    assert.match(providerSource, new RegExp(`\\n  ${action}: "`), action);
  }

  assert.match(providerSource, /export function toFriendlyActionError\(/);
  assert.doesNotMatch(providerSource, /String\(error\?\.message \|\| error \|\| "import_backup_failed"\)/);
});

test('transactions screen: typing in search is not overwritten by the stored filter', () => {
  const source = readFileSync(
    new URL('../src/features/app/screens/TransactionsScreen.jsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /syncedQueryRef/);
  assert.match(source, /\}, \[transactionsFilters\.query\]\);/);
  assert.doesNotMatch(source, /\}, \[searchInput, transactionsFilters\.query\]\);/);
});

test('runtime styles: classes used by the live shell are all defined', () => {
  const cssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

  for (const className of [
    'ui-toast--warning',
    'finance-recurring-card',
    'finance-recurring-main',
    'finance-recurring-actions',
    'finance-empty-icon',
    'finance-notification-card.is-read',
    'finance-subcategory-card.is-main',
  ]) {
    assert.ok(cssSource.includes(`.${className}`), `missing style for .${className}`);
  }
});

test('runtime shell: dialogs move focus in and hand it back', () => {
  const uiSource = readFileSync(new URL('../src/features/app/ui.jsx', import.meta.url), 'utf8');

  assert.match(uiSource, /function useDialogFocus\(/);
  assert.match(uiSource, /useDialogFocus\(open, dialogRef\)/);
  assert.match(uiSource, /previouslyFocused\.focus\(\{ preventScroll: true \}\)/);
  assert.match(uiSource, /event\.key !== "Tab"/);
  assert.match(uiSource, /toast\?\.id/);
});

test('runtime routing: every runtime view keeps a reachable route and its own title', () => {
  const configSource = readFileSync(new URL('../next.config.mjs', import.meta.url), 'utf8');
  const rootSource = readFileSync(new URL('../src/core/AppRoot.jsx', import.meta.url), 'utf8');

  // /recurring is a real screen linked from bills, dashboard and settings, so it
  // must not be redirected away.
  assert.doesNotMatch(configSource, /source:\s*"\/recurring"/);
  assert.match(configSource, /source:\s*"\/budgets"/);
  assert.match(configSource, /source:\s*"\/stats"/);

  const titles = rootSource.slice(
    rootSource.indexOf('const SCREEN_TITLES'),
    rootSource.indexOf('const SCREEN_HEADER_LABELS'),
  );
  const segments = [...titles.matchAll(/^\s+"?([a-z-]+)"?:/gm)].map((match) => match[1]);
  assert.ok(segments.length >= 16, 'expected every screen to declare a title');

  for (const segment of segments) {
    const pageSource = readFileSync(
      new URL(`../app/(runtime)/${segment}/page.js`, import.meta.url),
      'utf8',
    );
    assert.match(pageSource, /export const metadata = \{/, segment);
    assert.match(pageSource, /title: "/, segment);
  }
});

test('runtime provider: transaction writes also refresh the open history page', () => {
  const providerSource = readFileSync(
    new URL('../src/features/app/AppProvider.jsx', import.meta.url),
    'utf8',
  );

  const start = providerSource.indexOf('async function refreshTransactionDependentState(');
  const block = providerSource.slice(start, providerSource.indexOf('\n  }\n', start));

  assert.match(block, /transactionsPage\.items\.length > 0/);
  assert.match(block, /refreshTransactionsPage\(\{ silent: true, keepItems: true \}\)/);
});

test('runtime shell: stacked sheets only trap focus in the topmost dialog', () => {
  const uiSource = readFileSync(new URL('../src/features/app/ui.jsx', import.meta.url), 'utf8');

  assert.match(uiSource, /querySelectorAll\('\[role="dialog"\]'\)/);
  assert.match(uiSource, /dialogs\[dialogs\.length - 1\] !== node\) return;/);
  // requestAnimationFrame never fires in a hidden tab, so focus moves synchronously.
  assert.doesNotMatch(uiSource, /requestAnimationFrame\(focusFirst\)/);
});

test('scan access: paid AI endpoints never answer anonymous callers', () => {
  const accessSource = readFileSync(new URL('../lib/scan/access.js', import.meta.url), 'utf8');

  // Origin / shared-token gates stay first for server-to-server callers.
  assert.match(accessSource, /if \(originsConfigured\)/);
  assert.match(accessSource, /if \(tokenConfigured\)/);
  // Falling through used to "return true", leaving the endpoints wide open.
  assert.match(accessSource, /const auth = await getRequestUser\(req\);/);
  assert.match(accessSource, /code: "unauthorized"/);
  assert.doesNotMatch(accessSource, /^\s*return true;\s*\n\}/m);
  assert.match(accessSource, /export async function enforceAccess/);

  for (const handler of ['financial-plan', 'gemini-scan', 'scan']) {
    const source = readFileSync(
      new URL(`../server/legacy-api/${handler}.js`, import.meta.url),
      'utf8',
    );
    assert.match(source, /if \(!\(await enforceAccess(Module)?\(req, res\)\)\) return;/, handler);
  }
});

test('inbox review: scan decisions patch local state and single-account drafts prefill', () => {
  const providerSource = readFileSync(
    new URL('../src/features/app/AppProvider.jsx', import.meta.url),
    'utf8',
  );
  const inboxSource = readFileSync(
    new URL('../src/features/app/screens/InboxScreen.jsx', import.meta.url),
    'utf8',
  );

  assert.match(providerSource, /function markScanDocumentStatus\(scanId, patch\)/);
  assert.match(providerSource, /markScanDocumentStatus\(scan\.id, \{\s*status: "approved"/);
  assert.match(providerSource, /markScanDocumentStatus\(scanId, \{ status: "rejected"/);

  assert.match(inboxSource, /function withSingleAccountDefault\(draft, accounts\)/);
  assert.match(inboxSource, /list\.length !== 1\) return draft;/);
  assert.match(inboxSource, /withSingleAccountDefault\(scanToDraft\(selected\), accounts\)/);
});
