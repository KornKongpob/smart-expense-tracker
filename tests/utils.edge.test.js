import test from 'node:test';
import assert from 'node:assert/strict';

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
import { parseScanRequest, assertAllowedInputMime, assertBase64UnderLimit } from '../lib/scan/requestParse.js';
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
  assert.equal(normalized.fromAccountId, 'bank-1');
  assert.equal(normalized.toAccountId, 'card-1');
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
