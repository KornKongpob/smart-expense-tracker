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
