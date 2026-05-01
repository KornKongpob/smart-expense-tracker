import { ensureSatangInt } from "../../utils/money.js";

const ADJUSTMENT_CATEGORY_BY_TYPE = Object.freeze({
  discount: "discount",
  service_charge: "fees",
  tax: "tax",
  rounding: "rounding",
  fee: "fees",
  unknown: "fees",
});

function clean(value) {
  return String(value ?? "").trim();
}

function positiveSatang(value) {
  return Math.max(0, Math.abs(ensureSatangInt(value, 0)));
}

function normalizeEffect(value, fallback = "add") {
  return clean(value).toLowerCase() === "subtract" ? "subtract" : fallback === "subtract" ? "subtract" : "add";
}

function normalizeAdjustmentType(value) {
  const type = clean(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (type === "discount" || type === "service_charge" || type === "tax" || type === "rounding" || type === "fee") {
    return type;
  }
  if (type === "fees" || type === "surcharge") return "fee";
  if (type === "taxes" || type === "vat") return "tax";
  if (type === "service" || type === "servicecharge") return "service_charge";
  return "unknown";
}

function categoryForAdjustment(type, fallback = "fees") {
  return ADJUSTMENT_CATEGORY_BY_TYPE[type] || fallback;
}

function adjustmentTypeFromCategory(value) {
  const category = clean(value).toLowerCase();
  if (category === "discount") return "discount";
  if (category === "tax" || category === "taxes" || category === "vat") return "tax";
  if (category === "rounding") return "rounding";
  if (category === "service_charge" || category === "servicecharge") return "service_charge";
  if (category === "fee" || category === "fees" || category === "surcharge") return "fee";
  return "unknown";
}

function rawAmountNumber(source) {
  const value =
    source?.amountSatang ??
    source?.amount_satang ??
    source?.amount ??
    source?.totalSatang ??
    source?.total_satang ??
    source?.total;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeChildren(children) {
  return (Array.isArray(children) ? children : [])
    .map((child, index) => {
      const name = clean(child?.name ?? child?.rawName ?? child?.normalizedName ?? child?.note) || `Item ${index + 1}`;
      const amountSatang = positiveSatang(child?.amountSatang ?? child?.amount ?? child?.totalSatang ?? child?.total);
      const categoryId = clean(child?.categoryId ?? child?.category ?? child?.suggestedCategoryId);
      return {
        ...child,
        id: clean(child?.id) || `child_${index + 1}`,
        name,
        amount: amountSatang,
        amountSatang,
        categoryId: categoryId || null,
      };
    })
    .filter((child) => child.name || child.amountSatang > 0);
}

export function signedReceiptLineSatang(line) {
  const amount = positiveSatang(line?.amountSatang ?? line?.amount ?? line?.totalSatang);
  return normalizeEffect(line?.adjustmentEffect ?? line?.adjustment_effect ?? line?.effect) === "subtract" ? -amount : amount;
}

export function isReceiptAdjustmentLine(line) {
  const lineType = clean(line?.receiptLineType ?? line?.receipt_line_type ?? line?.lineType).toLowerCase();
  if (lineType === "adjustment") return true;
  if (clean(line?.adjustmentType ?? line?.adjustment_type)) return true;
  if (adjustmentTypeFromCategory(line?.categoryId ?? line?.category_id ?? line?.category) !== "unknown") return true;
  if (rawAmountNumber(line) < 0) return true;
  return normalizeEffect(line?.adjustmentEffect ?? line?.effect) === "subtract";
}

export function normalizeReceiptLine(raw, index = 0, options = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const isAdjustment = isReceiptAdjustmentLine(source);
  const categoryAdjustmentType = adjustmentTypeFromCategory(source.categoryId ?? source.category_id ?? source.category);
  const adjustmentType = isAdjustment
    ? normalizeAdjustmentType(source.adjustmentType ?? source.adjustment_type ?? source.type ?? categoryAdjustmentType)
    : null;
  const rawAmount = rawAmountNumber(source);
  const amountSatang = positiveSatang(
    source.amountSatang ??
      source.amount_satang ??
      source.amount ??
      source.totalSatang ??
      source.total_satang ??
      source.total,
  );
  const name =
    clean(source.name ?? source.rawName ?? source.normalizedName ?? source.note ?? source.label) ||
    (isAdjustment ? adjustmentType || "Adjustment" : `Item ${index + 1}`);
  const categoryId = clean(
    source.categoryId ??
      source.category_id ??
      source.category ??
      source.suggestedCategoryId ??
      source.suggested_category_id ??
      source.category_key,
  );

  return {
    ...source,
    id: clean(source.id) || `${isAdjustment ? "adjustment" : "item"}_${index + 1}`,
    name,
    rawName: clean(source.rawName) || name,
    normalizedName: clean(source.normalizedName) || name.toLowerCase(),
    amountSatang,
    categoryId:
      categoryId ||
      (isAdjustment ? categoryForAdjustment(adjustmentType, options.defaultAdjustmentCategoryId) : clean(options.defaultCategoryId)),
    qty: Number(source.qty ?? source.quantity ?? 1) > 0 ? Number(source.qty ?? source.quantity ?? 1) : 1,
    unitPriceSatang:
      source.unitPriceSatang != null || source.unit_price_satang != null
        ? positiveSatang(source.unitPriceSatang ?? source.unit_price_satang)
        : null,
    receiptLineType: isAdjustment ? "adjustment" : "item",
    adjustmentEffect: isAdjustment
      ? normalizeEffect(
          source.adjustmentEffect ?? source.adjustment_effect ?? source.effect,
          adjustmentType === "discount" || rawAmount < 0 ? "subtract" : "add",
        )
      : "add",
    adjustmentType,
    splitIndex: Math.max(1, ensureSatangInt(source.splitIndex ?? source.split_index, index + 1)),
    children: normalizeChildren(source.children),
    childrenIncludedInParent: source.childrenIncludedInParent === true,
  };
}

export function receiptLinesFromReceipt(receipt, options = {}) {
  const source = receipt && typeof receipt === "object" ? receipt : {};
  const itemLines = (Array.isArray(source.items) ? source.items : []).map((item, index) =>
    normalizeReceiptLine(
      {
        ...item,
        amountSatang: item?.amountSatang ?? item?.totalSatang,
        categoryId: item?.categoryId ?? item?.suggestedCategoryId,
      },
      index,
      options,
    ),
  );

  const adjustmentLines = (Array.isArray(source.adjustments) ? source.adjustments : []).map((adjustment, index) =>
    normalizeReceiptLine(
      {
        ...adjustment,
        name: adjustment?.label,
        amountSatang: adjustment?.amountSatang,
        receiptLineType: "adjustment",
        adjustmentType: adjustment?.type,
        adjustmentEffect: adjustment?.effect,
        categoryId: categoryForAdjustment(normalizeAdjustmentType(adjustment?.type), options.defaultAdjustmentCategoryId),
      },
      itemLines.length + index,
      options,
    ),
  );

  return [...itemLines, ...adjustmentLines].filter((line) => line.amountSatang > 0 || line.name);
}

export function receiptLineToStoredLine(line) {
  const normalized = normalizeReceiptLine(line);
  return {
    id: normalized.id,
    name: normalized.name,
    rawName: normalized.rawName,
    normalizedName: normalized.normalizedName,
    categoryId: normalized.categoryId || "",
    amount: normalized.amountSatang,
    amountSatang: normalized.amountSatang,
    qty: normalized.qty,
    unitPriceSatang: normalized.unitPriceSatang,
    receiptLineType: normalized.receiptLineType,
    adjustmentEffect: normalized.adjustmentEffect,
    adjustmentType: normalized.adjustmentType,
    splitIndex: normalized.splitIndex,
    children: normalized.children,
    childrenIncludedInParent: normalized.childrenIncludedInParent,
  };
}

export default {
  isReceiptAdjustmentLine,
  normalizeReceiptLine,
  receiptLinesFromReceipt,
  receiptLineToStoredLine,
  signedReceiptLineSatang,
};
