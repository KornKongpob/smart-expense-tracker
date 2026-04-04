import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  sanitizeMoneyInput,
  parseMoneyToSatang,
  satangToBahtNumber,
  ensureSatangInt,
} from '../src/utils/money.js';
import { getTransferPair } from '../src/utils/transferGrouping.js';
import {
  reconcileReceiptGroups,
  computeReceiptSumsSatang,
  signedReceiptGroupSatang,
} from '../src/utils/receiptAdjustments.js';
import { splitReceiptItemsToLines } from '../src/utils/receiptCategorizer.js';
import { getNextRecurringDueISO, advanceRecurringDate } from '../src/utils/recurring.js';
import { duplicateStateFromMatch, toDuplicateComparable } from '../src/utils/duplicateDetection.js';
import {
  detectScanTextDocType,
  extractLikelyAmountFromScanText,
  extractMerchantFromScanText,
} from '../src/utils/scanPostprocess.js';
import { loadAll, saveAll, STORAGE_SAVE_ERROR_EVENT } from '../src/services/storage.js';
import { normalizeProviderScanResult } from '../api/scan.js';
import { parseScanRequest, assertAllowedInputMime, assertBase64UnderLimit } from '../lib/scan/requestParse.js';
import { normalizeOpenAIModel, OPENAI_SCAN_DEFAULT_MODEL } from '../lib/scan/openaiModel.js';
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
  buildTransactionSavePlan,
  getScanDisplayAmountSatang,
  scanToDraft,
} from '../src/features/app/transactionDrafts.js';
import {
  buildDraftLineItemSummaries,
  replaceDraftLineItems,
  summarizeDraftLineItems,
} from '../src/features/app/lineItemDraftState.js';
import { buildCategoryPresetState } from '../src/features/app/categoryPresetState.js';
import {
  createScanUploadEntry,
  getScanUploadMeta,
  patchScanUploadEntry,
} from '../src/features/app/scanUploadState.js';
import { getSystemCategoryRows } from '../lib/supabase/systemCategories.js';
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
  assert.equal(draft.amountSatang, 25500);
  assert.equal(draft.splitByCategory, true);
  assert.equal(draft.receiptGroups.length, 3);
  assert.equal(draft.receiptGroups[0].amountSatang, 14500);
  assert.equal(draft.receiptGroups[2].receiptLineType, 'adjustment');
  assert.equal(draft.receiptGroups[2].adjustmentEffect, 'subtract');
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
