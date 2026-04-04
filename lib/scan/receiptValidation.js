function safeNumber(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeName(value) {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNameKey(value) {
  return normalizeName(value).toLowerCase();
}

function isSummaryLikeName(value) {
  const text = normalizeNameKey(value);
  if (!text) return false;
  return /(subtotal|grand total|total|ยอดรวม|ยอดสุทธิ|รวมสุทธิ|รวมทั้งหมด|vat|change|เงินทอน|ชำระเงิน|payment|member|คะแนน|coupon|promotion|ส่วนลด|receipt|ใบเสร็จ|branch|cashier|tax invoice|tax)/i.test(
    text
  );
}

function itemScore(item) {
  let score = 0;
  if (normalizeName(item?.name)) score += 3;
  if (safeNumber(item?.qty) != null) score += 1;
  if (safeNumber(item?.unit_price) != null) score += 1;
  if (Array.isArray(item?.children) && item.children.length) score += 2;
  return score;
}

export function validateReceiptLineExtraction({ items, adjustments = [], amount = null, tolerance = 1.25 } = {}) {
  const sourceItems = Array.isArray(items) ? items : [];
  const grandTotal = safeNumber(amount);
  const positiveItems = sourceItems
    .map((item) => {
      const total = safeNumber(item?.total);
      const qty = safeNumber(item?.qty);
      const unitPrice = safeNumber(item?.unit_price);
      return {
        ...item,
        name: normalizeName(item?.name),
        total,
        qty,
        unit_price: unitPrice,
      };
    })
    .filter((item) => item.name || item.total != null);

  const stats = {
    removedSummaryLines: 0,
    removedDuplicateLines: 0,
    removedGrandTotalEcho: 0,
    inferredUnitPrices: 0,
    needsReview: false,
  };

  const filtered = positiveItems.filter((item) => {
    const total = safeNumber(item?.total);
    if (!(total > 0)) return false;
    if (!isSummaryLikeName(item?.name)) return true;
    stats.removedSummaryLines += 1;
    return false;
  });

  const bestByKey = new Map();
  for (const item of filtered) {
    const total = safeNumber(item?.total);
    const key = `${normalizeNameKey(item?.name)}|${total != null ? total.toFixed(2) : "?"}`;
    if (!normalizeNameKey(item?.name) && total == null) continue;
    const prev = bestByKey.get(key);
    if (!prev || itemScore(item) > itemScore(prev)) {
      if (prev) stats.removedDuplicateLines += 1;
      bestByKey.set(key, item);
    } else {
      stats.removedDuplicateLines += 1;
    }
  }

  let cleanedItems = [...bestByKey.values()];

  if (grandTotal != null && cleanedItems.length >= 3) {
    const totalEchoIdx = cleanedItems.findIndex((item) => {
      const total = safeNumber(item?.total);
      return total != null && Math.abs(total - grandTotal) <= tolerance;
    });

    if (totalEchoIdx >= 0) {
      const others = cleanedItems.filter((_, idx) => idx !== totalEchoIdx);
      const othersSum = others.reduce((sum, item) => sum + (safeNumber(item?.total) || 0), 0);
      if (Math.abs(othersSum - grandTotal) <= tolerance) {
        cleanedItems = others;
        stats.removedGrandTotalEcho += 1;
      }
    }
  }

  cleanedItems = cleanedItems.map((item) => {
    const qty = safeNumber(item?.qty);
    const total = safeNumber(item?.total);
    const unitPrice = safeNumber(item?.unit_price);
    if (unitPrice == null && qty != null && qty > 0 && total != null) {
      stats.inferredUnitPrices += 1;
      return {
        ...item,
        unit_price: Number((total / qty).toFixed(2)),
      };
    }
    return item;
  });

  const signedAdjustments = (Array.isArray(adjustments) ? adjustments : []).reduce((sum, adj) => {
    const value = safeNumber(adj?.amount) || 0;
    const effect = String(adj?.effect || "").toLowerCase().trim();
    return effect === "subtract" ? sum - value : sum + value;
  }, 0);

  const itemsTotal = cleanedItems.reduce((sum, item) => sum + (safeNumber(item?.total) || 0), 0);
  const derivedTotal = itemsTotal + signedAdjustments;
  if (grandTotal != null && cleanedItems.length >= 2 && Math.abs(derivedTotal - grandTotal) > Math.max(tolerance, grandTotal * 0.08)) {
    stats.needsReview = true;
  }

  return {
    items: cleanedItems.slice(0, 40),
    adjustments: Array.isArray(adjustments) ? adjustments : [],
    stats,
    totals: {
      itemsTotal,
      derivedTotal,
      grandTotal,
      delta: grandTotal != null ? Number((derivedTotal - grandTotal).toFixed(2)) : null,
    },
  };
}
