// src/utils/receiptAdjustments.js
//
// ✅ Receipt reconciliation helpers
//
// We store all amounts as positive SATANG integers. To represent discounts and
// still make totals reconcile, we encode an "adjustment" line with:
//   adjustmentEffect: 'subtract'
//
// This means:
// - For receipt paid-total math: that line should SUBTRACT from the sum.
// - For account balance math: it should ADD back (reducing the expense).

import { ensureSatangInt } from "./money";

function sat(v, fallback = 0) {
  const n = typeof v === "number" ? v : v != null ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return ensureSatangInt(n, fallback);
}

export function isAdjustmentLike(obj) {
  const t = obj && typeof obj === "object" ? obj : {};
  const lt = String(t.receiptLineType || t.lineType || t.kind || "").toLowerCase().trim();
  if (lt === "adjustment") return true;

  // ✅ Discount category should behave as an adjustment even if other flags are missing
  const cat = String(t.categoryId || t.category || "").toLowerCase().trim();
  if (cat === "discount") return true;

  // ✅ Explicit adjustment type (fee/discount/etc.)
  const at = String(t.adjustmentType || "").toLowerCase().trim();
  if (at) return true;

  // ✅ IMPORTANT BUGFIX
  // Many flows set adjustmentEffect="add" for normal receipt items.
  // We must NOT treat "add" as an adjustment by itself, otherwise *all* receipt lines
  // look like fees/adjustments and Split mode never detects real items.
  const ae = String(t.adjustmentEffect || t.effect || "").toLowerCase().trim();
  return ae === "subtract";
}

export function effectFactor(effect) {
  return String(effect || "").toLowerCase().trim() === "subtract" ? -1 : 1;
}

/**
 * Signed contribution to receipt paid-total math.
 * - normal item lines => +amount
 * - discount lines (adjustmentEffect='subtract') => -amount
 */
export function signedReceiptGroupSatang(group) {
  const g = group && typeof group === "object" ? group : {};
  const amt = sat(g.amount, 0);
  return effectFactor(g.adjustmentEffect || g.effect) * amt;
}

/**
 * Same as signedReceiptGroupSatang but for stored transaction children.
 */
export function signedReceiptTxSatang(tx) {
  const t = tx && typeof tx === "object" ? tx : {};
  const amt = sat(t.amount, 0);
  return effectFactor(t.adjustmentEffect || t.effect) * amt;
}

/**
 * Net effect on account balance.
 * - income => +amount
 * - expense => -amount
 * - expense + adjustmentEffect='subtract' => +amount (discount reduces expense)
 */
export function accountNetSatang(tx) {
  const t = tx && typeof tx === "object" ? tx : {};
  const amt = sat(t.amount, 0);
  const type = String(t.type || "").toLowerCase().trim();
  if (type === "income") return amt;
  if (type === "expense") {
    const ae = String(t.adjustmentEffect || "").toLowerCase().trim();
    return ae === "subtract" ? amt : -amt;
  }
  return 0;
}

/**
 * Ensure receipt groups sum to targetTotalSatang by adding an adjustment line.
 *
 * Returns:
 * - groups: updated array (with splitIndex filled if missing)
 * - meta: { targetTotalSatang, deltaSatang, adjustmentEffect?, adjustmentSatang? }
 */
export function reconcileReceiptGroups(groups, targetTotalSatang, { ensureCategoryId, baseLineCountMin = 2 } = {}) {
  const list = Array.isArray(groups) ? groups.map((g) => ({ ...(g && typeof g === "object" ? g : {}) })) : [];
  const target = sat(targetTotalSatang, 0);
  const nonAdjCount = list.filter((g) => !isAdjustmentLike(g)).length;

  if (!target || nonAdjCount < baseLineCountMin) {
    return { groups: list, meta: { targetTotalSatang: target, deltaSatang: 0 } };
  }

  const sum = list.reduce((s, g) => s + signedReceiptGroupSatang(g), 0);
  const delta = target - sum;

  // tolerate tiny rounding (<= 1 satang)
  if (Math.abs(delta) <= 1) {
    return { groups: list, meta: { targetTotalSatang: target, deltaSatang: 0 } };
  }

  const adjEffect = delta < 0 ? "subtract" : "add";
  const adjSatang = Math.abs(delta);
  const isDiscount = adjEffect === "subtract";
  const key = isDiscount ? "discount" : "fees";
  const categoryId = typeof ensureCategoryId === "function" ? ensureCategoryId(key) : key;
  const note = isDiscount ? "ส่วนลด" : "ค่าธรรมเนียม/ปรับยอด";
  const adjType = isDiscount ? "discount" : "fee";

  // If there is already a compatible adjustment line, merge into it.
  const mergeIdx = list.findIndex((g) => {
    if (!isAdjustmentLike(g)) return false;
    const e = String(g.adjustmentEffect || g.effect || "").toLowerCase().trim();
    if (e !== adjEffect) return false;
    const n = String(g.note || "").trim();
    if (!n) return false;
    return isDiscount ? n.includes("ส่วนลด") : n.includes("ค่าธรรมเนียม") || n.includes("ปรับยอด");
  });

  if (mergeIdx >= 0) {
    const prev = list[mergeIdx] || {};
    const prevAmt = sat(prev.amount, 0);
    list[mergeIdx] = {
      ...prev,
      receiptLineType: "adjustment",
      adjustmentType: prev.adjustmentType || adjType,
      adjustmentEffect: adjEffect,
      key: String(prev.key || "").trim() || key,
      categoryId: String(prev.categoryId || "").trim() || categoryId,
      note: String(prev.note || "").trim() || note,
      amount: prevAmt + adjSatang,
    };
  } else {
    list.push({
      key,
      categoryId,
      amount: adjSatang,
      note,
      receiptLineType: "adjustment",
      adjustmentType: adjType,
      adjustmentEffect: adjEffect,
    });
  }

  const withIndex = list.map((g, i) => ({
    ...g,
    splitIndex: Number(g.splitIndex || 0) || i + 1,
  }));

  return {
    groups: withIndex,
    meta: {
      targetTotalSatang: target,
      deltaSatang: delta,
      adjustmentEffect: adjEffect,
      adjustmentSatang: adjSatang,
    },
  };
}
