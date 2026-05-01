import test from "node:test";
import assert from "node:assert/strict";

import { normalizeScanResponse } from "../shared/scanSchema.js";
import { normalizeReceiptScan } from "../src/domain/receipt/normalizeReceiptScan.js";
import { ReceiptScanSchema } from "../src/schemas/index.js";

test("receipt phase 2: old scan results normalize safely into receipt satang model", () => {
  const normalized = normalizeReceiptScan({
    merchant: "Lotus",
    amount: 330,
    date: "2026-04-10T12:30:00Z",
    payment_method: "card",
    ref: "R-100",
    unknown_provider_field: { ignored: true },
    items: [
      { name: "ข้าวสาร", total: 250, category_key: "groceries" },
      { name: "น้ำยาล้างจาน", amount: "120.00", category: "household" },
    ],
    discount: 40,
  });

  assert.equal(normalized.merchant, "Lotus");
  assert.equal(normalized.date, "2026-04-10");
  assert.equal(normalized.paidTotalSatang, 33000);
  assert.equal(normalized.subtotalSatang, 37000);
  assert.equal(normalized.items.length, 2);
  assert.equal(normalized.items[0].qty, 1);
  assert.equal(normalized.items[0].totalSatang, 25000);
  assert.equal(normalized.items[1].totalSatang, 12000);
  assert.equal(normalized.items[1].suggestedCategoryId, "household");
  assert.equal(normalized.adjustments[0].type, "discount");
  assert.equal(normalized.adjustments[0].effect, "subtract");
  assert.equal(normalized.discountSatang, 4000);
  assert.equal(normalized.paymentMethod, "card");
  assert.equal(normalized.referenceId, "R-100");
  assert.equal(ReceiptScanSchema.safeParse(normalized).success, true);
});

test("receipt phase 2: service charge and tax become add adjustments", () => {
  const normalized = normalizeReceiptScan({
    merchant: "Cafe Bloom",
    paidTotal: 117,
    subtotal: 100,
    serviceCharge: 10,
    tax: 7,
    items: [{ name: "Lunch", total: 100 }],
  });

  assert.equal(normalized.paidTotalSatang, 11700);
  assert.equal(normalized.subtotalSatang, 10000);
  assert.equal(normalized.serviceChargeSatang, 1000);
  assert.equal(normalized.taxSatang, 700);
  assert.deepEqual(
    normalized.adjustments.map((adjustment) => ({
      type: adjustment.type,
      amountSatang: adjustment.amountSatang,
      effect: adjustment.effect,
    })),
    [
      { type: "service_charge", amountSatang: 1000, effect: "add" },
      { type: "tax", amountSatang: 700, effect: "add" },
    ],
  );
  assert.deepEqual(normalized.warnings, []);
});

test("receipt phase 2: invalid or mismatched totals produce warnings instead of throwing", () => {
  const normalized = normalizeReceiptScan({
    merchant: "Tiny Mart",
    amount: 990,
    items: [
      { name: "Item A", total: 500 },
      { name: "Item B", total: 488 },
      { name: "Unreadable item", total: "not-a-number" },
    ],
  });

  assert.equal(normalized.paidTotalSatang, 99000);
  assert.equal(normalized.subtotalSatang, 98800);
  assert.ok(normalized.warnings.includes("invalid_item_total"));
  assert.ok(normalized.warnings.includes("total_mismatch"));
});

test("receipt phase 2: shared scan response preserves legacy fields and exposes normalized receipt", () => {
  const normalized = normalizeScanResponse({
    merchant: "Cafe Bloom",
    amount: 150,
    items: [{ name: "Breakfast set", line_total: 150, category_key: "food" }],
    adjustments: [{ name: "Member discount", value: 10, effect: "subtract", type: "discount" }],
    confidence: { score: 0.82 },
  });

  assert.equal(normalized.amount, 150);
  assert.equal(normalized.items[0].total, 150);
  assert.equal(normalized.receipt.paidTotalSatang, 15000);
  assert.equal(normalized.receipt.items[0].totalSatang, 15000);
  assert.equal(normalized.receipt.items[0].categoryConfidence, null);
  assert.equal(normalized.receipt.confidence, 82);
  assert.equal(normalized.paidTotalSatang, 15000);
});
