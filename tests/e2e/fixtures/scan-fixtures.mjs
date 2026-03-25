export const RECEIPT_SCAN_FIXTURE = {
  doc_type: "receipt",
  tx_type: "expense",
  amount: 265,
  date: "2026-03-25",
  merchant: "Cafe Bloom",
  note: "Cafe Bloom",
  ref: "RCPT-265",
  category_key: "coffee",
  payment_method: "card",
  account_id: "acc_scb_everyday",
  evidence: "Cafe Bloom receipt 25/03/2026 Iced Latte 145.00 Butter Croissant 120.00 Total 265.00",
  items: [
    { name: "Iced Latte", qty: 1, total: 145 },
    { name: "Butter Croissant", qty: 1, total: 120 },
  ],
  adjustments: [],
  confidence: { overall: 0.95 },
  flags: {
    needs_human_review: false,
    has_line_items: true,
    has_zero_price_lines: false,
    has_discount_lines: false,
  },
};

export const SLIP_SCAN_FIXTURE = {
  doc_type: "transfer_slip",
  tx_type: "credit_payment",
  amount: 1200,
  date: "2026-03-25",
  merchant: "Krungsri Platinum",
  note: "Krungsri Platinum payment",
  ref: "TRX1234",
  category_key: "transfer",
  payment_method: "promptpay",
  from_account: "2345",
  to_account: "9988",
  is_credit_card_payment: true,
  evidence: "Payment transfer 25/03/2026 From 2345 To 9988 Krungsri Platinum 1200.00",
  items: [],
  adjustments: [],
  confidence: { overall: 0.92 },
  flags: {
    needs_human_review: false,
    has_line_items: false,
    has_zero_price_lines: false,
    has_discount_lines: false,
  },
};

export function buildScanApiResponse(data) {
  return {
    ok: true,
    data,
    rawText: String(data?.evidence || ""),
    model: "fixture-scan",
  };
}
