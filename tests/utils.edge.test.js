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
  splitReceiptItemsToLines,
} from '../src/utils/receiptCategorizer.js';
import { getNextRecurringDueISO, advanceRecurringDate } from '../src/utils/recurring.js';
import { duplicateStateFromMatch, toDuplicateComparable } from '../src/utils/duplicateDetection.js';
import {
  detectScanTextDocType,
  extractLikelyAmountFromScanText,
  extractMerchantFromScanText,
} from '../src/utils/scanPostprocess.js';
import { loadAll, saveAll, STORAGE_SAVE_ERROR_EVENT } from '../src/services/storage.js';
import { normalizeBackupCore } from '../src/utils/backupPayload.js';
import { normalizeProviderScanResult } from '../server/legacy-api/scan.js';
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
import { createInitialState } from '../src/store/boot.js';
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
  getCanonicalPathForPathname,
  getInitialHomePath,
  getPathForLegacyHash,
  getViewForPathname,
} from '../src/features/app/routes.js';
import { validateBackupImport } from '../src/schemas/index.js';
import { normalizeScanResponse } from '../shared/scanSchema.js';
import {
  normalizeNewEntryIntent,
  resolveNewEntryIntent,
} from '../src/views/add-transaction/helpers/entryIntent.js';
import { deriveSplitParentCategoryId } from '../src/views/add-transaction/helpers/splitCategory.js';
import { getSystemCategoryRows } from '../lib/supabase/systemCategories.js';
import { importLegacySnapshot } from '../lib/import/local.js';
import { createSeedState, createStorageRecord } from './e2e/fixtures/seed-state.mjs';

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
      { name: 'Sandwich', key: 'food', amount: 110 },
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
    'food',
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
  assert.ok(Array.isArray(normalized.inbox));
  assert.ok(Array.isArray(normalized.scanInbox));
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

  assert.equal(normalized.category_key, 'food');
  assert.equal(normalized.items[0].children[0].category_key, 'coffee');
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
  assert.equal(draft.categoryId, 'food');
  assert.equal(draft.splitByCategory, true);
  assert.deepEqual(
    draft.receiptGroups.map((group) => ({ name: group.name, categoryId: group.categoryId, amountSatang: group.amountSatang })),
    [
      { name: 'Coffee', categoryId: 'coffee', amountSatang: 4000 },
      { name: 'Sandwich', categoryId: 'food', amountSatang: 11000 },
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

  assert.equal(suggestion.category_key, 'food');
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
  assert.match(addSource, /dock=\{manualDock\}/);
  assert.match(addSource, /testId="manual-account-select"/);
  assert.match(addSource, /testId="manual-from-account-picker"/);
  assert.match(addSource, /testId="manual-to-account-picker"/);
  assert.match(addSource, /applySingleAccountSelection/);
  assert.match(addSource, /applyTransferFromAccountSelection/);
  assert.match(addSource, /applyTransferToAccountSelection/);
  assert.match(addSource, /await createManualTransaction\(draft\);[\s\S]*resetDraft\(\);[\s\S]*setMode\("scan"\);/s);
  assert.doesNotMatch(addSource, /<label className="finance-field">\s*<span className="ui-label">[^<]*<\/span>\s*<AccountSheetPicker/s);
  assert.doesNotMatch(addSource, /finance-page-actions/);

  assert.match(inboxSource, /import AccountSheetPicker/);
  assert.match(inboxSource, /testId="review-account-picker"/);
  assert.match(inboxSource, /testId="review-from-account-picker"/);
  assert.match(inboxSource, /testId="review-to-account-picker"/);
  assert.doesNotMatch(inboxSource, /<label className="finance-field">\s*<span className="ui-label">[^<]*<\/span>\s*<AccountSheetPicker/s);

  assert.match(dashboardSource, /import AccountSheetPicker/);
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
  assert.equal(getViewForPathname('/accounts'), 'accounts');
  assert.equal(getViewForPathname('/stats'), 'planner');
  assert.equal(getPathForLegacyHash('#dashboard'), '/dashboard');
  assert.equal(getPathForLegacyHash('#add-transaction'), '/add');
  assert.equal(getPathForLegacyHash('#stats'), '/planner');
  assert.equal(getPathForLegacyHash('#/stats'), '/planner');
  assert.equal(getPathForLegacyHash('#/recurring'), '/recurring');
  assert.equal(getInitialHomePath({ pathname: '/', hash: '#/stats' }), '/planner');
  assert.equal(getInitialHomePath({ pathname: '/accounts', hash: '#/stats' }), '/accounts');
  assert.equal(getInitialHomePath({ pathname: '/', hash: '' }), '/dashboard');
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
