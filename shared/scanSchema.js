import { z } from "zod";
import { normalizeTransactionTime } from "../src/utils/scanDateTime.js";
import { sanitizeCategoryKey } from "../src/utils/receiptCategorizer.js";

export const SCAN_PARSE_ERROR_CODE = "scan_parse_failed";

const requestSchema = z
  .object({
    image: z.string().min(1).optional(),
    imageDataUrl: z.string().min(1).optional(),
    base64: z.string().min(1).optional(),
    mimeType: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (!value.image && !value.imageDataUrl && !value.base64) {
      ctx.addIssue({ code: "custom", message: "missing_image_payload" });
    }
  });

const normalizedChildItemSchema = z.object({
  name: z.string().default(""),
  qty: z.number().nullable().optional(),
  unit_price: z.number().nullable().optional(),
  total: z.number().nullable().optional(),
  category_key: z.string().nullable().default(null),
});

const normalizedItemSchema = normalizedChildItemSchema.extend({
  children: z.array(normalizedChildItemSchema).nullable().default(null),
});

const normalizedAdjustmentSchema = z.object({
  name: z.string().default(""),
  amount: z.number().nullable().optional(),
  effect: z.enum(["subtract", "add"]).default("add"),
  type: z.string().nullable().default(null),
  category_key: z.string().nullable().default(null),
});

const normalizedConfidenceSchema = z.object({
  overall: z.number().min(0).max(1).nullable().default(null),
  amount: z.number().min(0).max(1).nullable().default(null),
  date: z.number().min(0).max(1).nullable().default(null),
  merchant: z.number().min(0).max(1).nullable().default(null),
  items: z.number().min(0).max(1).nullable().default(null),
});

const normalizedFlagsSchema = z.object({
  has_line_items: z.boolean().default(false),
  has_zero_price_lines: z.boolean().default(false),
  has_discount_lines: z.boolean().default(false),
  needs_human_review: z.boolean().default(false),
});

const satangInt = z.number().int().finite().default(0);
const nullableSatangInt = z.number().int().finite().nullable().default(null);
const optionalReceiptText = z.string().default("");
const nullableReceiptText = z.string().nullable().default(null);
const adjustmentEffectSchema = z.enum(["add", "subtract"]);
const adjustmentTypeSchema = z.enum([
  "discount",
  "service_charge",
  "tax",
  "rounding",
  "fee",
  "unknown",
]);

export const NormalizedReceiptAdjustmentSchema = z
  .object({
    id: z.string().default(""),
    type: adjustmentTypeSchema.default("unknown"),
    label: optionalReceiptText,
    amountSatang: satangInt,
    effect: adjustmentEffectSchema.default("add"),
  })
  .passthrough();

export const NormalizedReceiptItemSchema = z.lazy(() =>
  z
    .object({
      id: z.string().default(""),
      rawName: optionalReceiptText,
      normalizedName: optionalReceiptText,
      qty: z.number().finite().positive().default(1),
      unitPriceSatang: nullableSatangInt,
      totalSatang: satangInt,
      suggestedCategoryId: nullableReceiptText,
      categoryConfidence: z.number().finite().min(0).max(100).nullable().default(null),
      categoryReason: optionalReceiptText,
      userConfirmedCategory: z.boolean().default(false),
      source: z.string().default("scan"),
      children: z.array(NormalizedReceiptItemSchema).default([]),
    })
    .passthrough(),
);

export const NormalizedReceiptScanSchema = z
  .object({
    merchant: nullableReceiptText,
    date: nullableReceiptText,
    time: nullableReceiptText,
    transactionTime: optionalReceiptText,
    paidTotalSatang: satangInt,
    subtotalSatang: satangInt,
    discountSatang: satangInt,
    serviceChargeSatang: satangInt,
    taxSatang: satangInt,
    roundingSatang: satangInt,
    paymentMethod: nullableReceiptText,
    referenceId: nullableReceiptText,
    confidence: z.number().finite().min(0).max(100).nullable().default(null),
    items: z.array(NormalizedReceiptItemSchema).default([]),
    adjustments: z.array(NormalizedReceiptAdjustmentSchema).default([]),
    warnings: z.array(z.string()).default([]),
  })
  .passthrough();

const normalizedResponseSchema = z
  .object({
    merchant: z.string().nullable().default(null),
    amount: z.number().nullable().default(null),
    date: z.string().nullable().default(null),
    time: z.string().nullable().default(null),
    transactionTime: z.string().default(""),
    category_key: z.string().nullable().default(null),
    items: z.array(normalizedItemSchema).default([]),
    adjustments: z.array(normalizedAdjustmentSchema).default([]),
    confidence: normalizedConfidenceSchema.nullable().default(null),
    flags: normalizedFlagsSchema.default({
      has_line_items: false,
      has_zero_price_lines: false,
      has_discount_lines: false,
      needs_human_review: false,
    }),
    needs_human_review: z.boolean().default(false),
    errors: z.array(z.string()).default([]),
    receipt: NormalizedReceiptScanSchema.default({}),
    paidTotalSatang: satangInt,
    subtotalSatang: satangInt,
    discountSatang: satangInt,
    serviceChargeSatang: satangInt,
    taxSatang: satangInt,
    roundingSatang: satangInt,
    paymentMethod: z.string().nullable().default(null),
    referenceId: z.string().nullable().default(null),
    warnings: z.array(z.string()).default([]),
  })
  .passthrough();

const THAI_DIGITS = "\u0e50\u0e51\u0e52\u0e53\u0e54\u0e55\u0e56\u0e57\u0e58\u0e59";
const ADJUSTMENT_TYPES = new Set(["discount", "service_charge", "tax", "rounding", "fee", "unknown"]);

function normalizeThaiDigits(input) {
  return String(input ?? "").replace(/[\u0e50-\u0e59]/g, (ch) => String(THAI_DIGITS.indexOf(ch)));
}

function parseFlexibleNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null || value === "") return null;

  let text = normalizeThaiDigits(value).trim();
  if (!text) return null;
  const negative = /^\s*-/.test(text) || /\(([^)]+)\)/.test(text);
  text = text.replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!text) return null;

  const parts = text.split(".");
  const normalized = parts.length > 1 ? `${parts[0] || "0"}.${parts.slice(1).join("")}` : parts[0];
  const number = Number(normalized);
  if (!Number.isFinite(number)) return null;
  return negative ? -number : number;
}

function normalizeAmountUnit(value, fallback = "baht") {
  const unit = cleanText(value).toLowerCase();
  if (unit === "satang" || unit === "cents" || unit === "minor") return "satang";
  if (unit === "baht" || unit === "thb" || unit === "major") return "baht";
  return fallback;
}

function toNumber(value) {
  return parseFlexibleNumber(value);
}

function clamp01(value) {
  const number = toNumber(value);
  if (number == null) return null;
  return Math.max(0, Math.min(1, number));
}

function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function cleanNullableText(value) {
  const text = cleanText(value);
  return text || null;
}

function cleanCategoryKey(value, options = {}) {
  return cleanNullableText(sanitizeCategoryKey(value, options) || value);
}

function hasValue(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key) && obj?.[key] != null && obj?.[key] !== "";
}

function firstPresent(source, keys) {
  for (const key of keys) {
    if (hasValue(source, key)) return source[key];
  }
  return null;
}

function normalizeScanTime(source) {
  return normalizeTransactionTime(
    firstPresent(source, ["time", "transaction_time", "transactionTime", "transaction_at", "transactionAt"]),
  );
}

function toSatang(value, { unit = "baht", explicitSatang = false } = {}) {
  const number = parseFlexibleNumber(value);
  if (number == null) return null;
  if (explicitSatang || normalizeAmountUnit(unit) === "satang") return Math.trunc(number);
  return Math.round(number * 100);
}

function firstSatang(source, satangKeys, majorKeys, unit = "baht") {
  const satangValue = firstPresent(source, satangKeys);
  if (satangValue != null) return toSatang(satangValue, { explicitSatang: true });

  const majorValue = firstPresent(source, majorKeys);
  if (majorValue != null) return toSatang(majorValue, { unit });

  return null;
}

function normalizeName(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizeScorePercent(value) {
  const number = parseFlexibleNumber(value);
  if (number == null) return null;
  const percent = number <= 1 ? number * 100 : number;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function addWarning(warnings, code) {
  const text = cleanText(code);
  if (!text || warnings.includes(text)) return;
  warnings.push(text);
}

function normalizeAdjustmentType(value, label = "") {
  const raw = cleanText(value).toLowerCase().replace(/[\s-]+/g, "_");
  const haystack = `${raw} ${cleanText(label).toLowerCase()}`;

  if (haystack.includes("discount") || haystack.includes("coupon") || haystack.includes("ส่วนลด")) return "discount";
  if (haystack.includes("service_charge") || haystack.includes("service charge")) return "service_charge";
  if (haystack.includes("vat") || haystack.includes("tax")) return "tax";
  if (haystack.includes("rounding") || haystack.includes("round")) return "rounding";
  if (haystack.includes("fee") || haystack.includes("charge")) return "fee";
  return ADJUSTMENT_TYPES.has(raw) ? raw : "unknown";
}

function normalizeAdjustmentEffect(value, type, rawAmount) {
  const effect = cleanText(value).toLowerCase();
  if (effect === "subtract" || effect === "minus" || effect === "debit") return "subtract";
  if (effect === "add" || effect === "plus" || effect === "credit") return "add";

  const number = parseFlexibleNumber(rawAmount);
  if (number != null && number < 0) return "subtract";
  if (type === "discount") return "subtract";
  return "add";
}

function normalizeReceiptChildItems(children, options) {
  const out = [];
  const extraAdjustments = [];
  for (const [index, child] of (Array.isArray(children) ? children : []).entries()) {
    const normalized = normalizeReceiptItem(child, index, options);
    if (!normalized) continue;
    if (normalized.adjustment) extraAdjustments.push(normalized.adjustment);
    if (normalized.item) out.push(normalized.item);
  }
  return { children: out, adjustments: extraAdjustments };
}

function normalizeReceiptItem(raw, index, options) {
  if (!raw || typeof raw !== "object") return null;

  const { unit, warnings, sourceName = "scan" } = options || {};
  const rawName = cleanText(
    raw.rawName ??
      raw.normalizedName ??
      raw.name ??
      raw.title ??
      raw.desc ??
      raw.description ??
      raw.item ??
      raw.product,
  );
  const qtyRaw = firstPresent(raw, ["qty", "quantity", "count"]);
  const qtyNumber = parseFlexibleNumber(qtyRaw);
  const qty = qtyNumber != null && qtyNumber > 0 ? qtyNumber : 1;
  if (qtyRaw != null && !(qtyNumber > 0)) addWarning(warnings, "invalid_item_qty");

  const unitPriceSatang = firstSatang(
    raw,
    ["unitPriceSatang", "unit_price_satang"],
    ["unitPrice", "unit_price", "price"],
    unit,
  );
  let totalSatang = firstSatang(
    raw,
    ["totalSatang", "total_satang", "amountSatang", "amount_satang", "lineTotalSatang", "line_total_satang"],
    ["total", "line_total", "lineTotal", "amount"],
    unit,
  );

  if (totalSatang == null && unitPriceSatang != null) totalSatang = Math.round(unitPriceSatang * qty);
  if (totalSatang == null) {
    totalSatang = 0;
    if (rawName) addWarning(warnings, "invalid_item_total");
  }

  const type = normalizeAdjustmentType(raw.adjustmentType ?? raw.adjustment_type ?? raw.type, rawName);
  const lineType = cleanText(raw.receiptLineType ?? raw.receipt_line_type ?? raw.lineType).toLowerCase();
  const adjustmentLike = lineType === "adjustment" || type !== "unknown" || totalSatang < 0;

  if (adjustmentLike) {
    const effect = normalizeAdjustmentEffect(raw.adjustmentEffect ?? raw.adjustment_effect ?? raw.effect, type, totalSatang);
    return {
      adjustment: {
        id: cleanText(raw.id) || `adj_item_${index + 1}`,
        type,
        label: rawName || type,
        amountSatang: Math.abs(totalSatang),
        effect,
      },
    };
  }

  const childResult = normalizeReceiptChildItems(raw.children, options);
  return {
    item: {
      id: cleanText(raw.id) || `item_${index + 1}`,
      rawName,
      normalizedName: cleanText(raw.normalizedName) || normalizeName(rawName),
      qty,
      unitPriceSatang: unitPriceSatang == null ? null : Math.abs(unitPriceSatang),
      totalSatang: Math.max(0, totalSatang),
      suggestedCategoryId: cleanNullableText(
        raw.suggestedCategoryId ??
          raw.suggested_category_id ??
          raw.categoryId ??
          raw.category_id ??
          raw.category_key ??
          raw.categoryKey ??
          raw.category,
      ),
      categoryConfidence: normalizeScorePercent(
        raw.categoryConfidence ?? raw.category_confidence ?? raw.confidence ?? raw.confidenceScore,
      ),
      categoryReason: cleanText(raw.categoryReason ?? raw.category_reason ?? raw.reason),
      userConfirmedCategory: raw.userConfirmedCategory === true || raw.user_confirmed_category === true,
      source: cleanText(raw.source) || sourceName,
      children: childResult.children,
    },
    adjustments: childResult.adjustments,
  };
}

function normalizeReceiptAdjustment(raw, index, options = {}) {
  if (!raw || typeof raw !== "object") return null;
  const { unit = "baht" } = options;
  const label = cleanText(raw.label ?? raw.name ?? raw.title ?? raw.type) || "Adjustment";
  const type = normalizeAdjustmentType(raw.type ?? raw.adjustmentType ?? raw.adjustment_type, label);
  const rawAmount =
    firstPresent(raw, ["amountSatang", "amount_satang", "totalSatang", "total_satang"]) ??
    firstPresent(raw, ["amount", "value", "total", "line_total", "lineTotal", "amt"]);
  const explicitSatang =
    hasValue(raw, "amountSatang") ||
    hasValue(raw, "amount_satang") ||
    hasValue(raw, "totalSatang") ||
    hasValue(raw, "total_satang");
  const amount = toSatang(rawAmount, { unit, explicitSatang });
  if (amount == null) return null;

  return {
    id: cleanText(raw.id) || `adj_${index + 1}`,
    type,
    label,
    amountSatang: Math.abs(amount),
    effect: normalizeAdjustmentEffect(raw.effect ?? raw.adjustmentEffect ?? raw.adjustment_effect, type, rawAmount),
  };
}

function appendTopLevelAdjustment(adjustments, source, config) {
  const { type, label, satangKeys, majorKeys, unit, defaultEffect = "add" } = config;
  const amount = firstSatang(source, satangKeys, majorKeys, unit);
  if (amount == null || amount === 0) return;

  const effect = type === "rounding" && amount < 0 ? "subtract" : defaultEffect;
  adjustments.push({
    id: `adj_${type}`,
    type,
    label,
    amountSatang: Math.abs(amount),
    effect,
  });
}

function signedAdjustmentAmount(adjustment) {
  const amount = Math.abs(Number(adjustment?.amountSatang || 0));
  return adjustment?.effect === "subtract" ? -amount : amount;
}

function sumAdjustmentsByType(adjustments, type) {
  return adjustments
    .filter((adjustment) => adjustment?.type === type)
    .reduce((sum, adjustment) => sum + Math.abs(Number(adjustment?.amountSatang || 0)), 0);
}

function normalizeReceiptSource(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const nested =
    source.normalizedReceipt && typeof source.normalizedReceipt === "object"
      ? source.normalizedReceipt
      : source.normalized_receipt && typeof source.normalized_receipt === "object"
        ? source.normalized_receipt
        : source.receipt && typeof source.receipt === "object"
          ? source.receipt
          : null;

  return nested ? { ...source, ...nested } : source;
}

export function normalizeReceiptScanResult(payload) {
  const source = normalizeReceiptSource(payload);
  const warnings = Array.isArray(source.warnings)
    ? source.warnings.map((warning) => cleanText(warning)).filter(Boolean)
    : Array.isArray(source.errors)
      ? source.errors.map((error) => cleanText(error)).filter(Boolean)
      : [];
  const unit = normalizeAmountUnit(source.amount_unit ?? source.amountUnit ?? source.group_amount_unit, "baht");

  const items = [];
  const adjustments = [];
  for (const [index, raw] of (Array.isArray(source.items) ? source.items : []).entries()) {
    const normalized = normalizeReceiptItem(raw, index, { unit, warnings, sourceName: "scan" });
    if (!normalized) continue;
    if (normalized.item) items.push(normalized.item);
    if (normalized.adjustment) adjustments.push(normalized.adjustment);
    if (Array.isArray(normalized.adjustments)) adjustments.push(...normalized.adjustments);
  }

  const rawAdjustments = source.adjustments ?? source.adjustment_lines ?? source.adjustments_lines;
  for (const [index, raw] of (Array.isArray(rawAdjustments) ? rawAdjustments : []).entries()) {
    const adjustment = normalizeReceiptAdjustment(raw, index, { unit });
    if (adjustment) adjustments.push(adjustment);
  }

  appendTopLevelAdjustment(adjustments, source, {
    type: "discount",
    label: "Discount",
    satangKeys: ["discountSatang", "discount_satang"],
    majorKeys: ["discount", "discountTotal", "discount_total"],
    unit,
    defaultEffect: "subtract",
  });
  appendTopLevelAdjustment(adjustments, source, {
    type: "service_charge",
    label: "Service charge",
    satangKeys: ["serviceChargeSatang", "service_charge_satang"],
    majorKeys: ["serviceCharge", "service_charge"],
    unit,
    defaultEffect: "add",
  });
  appendTopLevelAdjustment(adjustments, source, {
    type: "tax",
    label: "Tax",
    satangKeys: ["taxSatang", "tax_satang", "vatSatang", "vat_satang"],
    majorKeys: ["tax", "vat"],
    unit,
    defaultEffect: "add",
  });
  appendTopLevelAdjustment(adjustments, source, {
    type: "rounding",
    label: "Rounding",
    satangKeys: ["roundingSatang", "rounding_satang"],
    majorKeys: ["rounding"],
    unit,
    defaultEffect: "add",
  });

  const computedSubtotal = items.reduce((sum, item) => sum + Math.max(0, Number(item.totalSatang || 0)), 0);
  const explicitSubtotal = firstSatang(
    source,
    ["subtotalSatang", "subtotal_satang", "itemsSubtotalSatang", "items_subtotal_satang"],
    ["subtotal", "itemsSubtotal", "items_subtotal"],
    unit,
  );
  const subtotalSatang = Math.max(0, explicitSubtotal ?? computedSubtotal);

  const discountSatang = sumAdjustmentsByType(adjustments, "discount");
  const serviceChargeSatang = sumAdjustmentsByType(adjustments, "service_charge");
  const taxSatang = sumAdjustmentsByType(adjustments, "tax");
  const roundingSatang = sumAdjustmentsByType(adjustments, "rounding");
  const netFromLines = computedSubtotal + adjustments.reduce((sum, adjustment) => sum + signedAdjustmentAmount(adjustment), 0);

  let paidTotalSatang = firstSatang(
    source,
    ["paidTotalSatang", "paid_total_satang", "amountSatang", "amount_satang", "totalSatang", "total_satang"],
    ["paidTotal", "paid_total", "amount", "total", "grandTotal", "grand_total"],
    unit,
  );

  if (paidTotalSatang == null) paidTotalSatang = Math.max(0, netFromLines);
  if (paidTotalSatang < 0) {
    addWarning(warnings, "invalid_paid_total");
    paidTotalSatang = Math.abs(paidTotalSatang);
  }

  if (paidTotalSatang > 0 && Math.abs(netFromLines - paidTotalSatang) > 1) {
    addWarning(warnings, "total_mismatch");
  }

  const parsed = NormalizedReceiptScanSchema.safeParse({
    merchant: cleanNullableText(source.merchant),
    date: source.date == null ? null : cleanText(source.date).slice(0, 10) || null,
    time: normalizeScanTime(source) || null,
    transactionTime: normalizeScanTime(source),
    paidTotalSatang,
    subtotalSatang,
    discountSatang,
    serviceChargeSatang,
    taxSatang,
    roundingSatang,
    paymentMethod: cleanNullableText(source.paymentMethod ?? source.payment_method),
    referenceId: cleanNullableText(source.referenceId ?? source.reference_id ?? source.ref),
    confidence: normalizeScorePercent(source.confidence?.overall ?? source.confidence?.score ?? source.confidence),
    items,
    adjustments,
    warnings,
  });

  if (parsed.success) return parsed.data;

  return {
    merchant: null,
    date: null,
    time: null,
    transactionTime: "",
    paidTotalSatang: 0,
    subtotalSatang: 0,
    discountSatang: 0,
    serviceChargeSatang: 0,
    taxSatang: 0,
    roundingSatang: 0,
    paymentMethod: null,
    referenceId: null,
    confidence: null,
    items: [],
    adjustments: [],
    warnings: ["receipt_normalize_failed"],
  };
}

function normalizeConfidence(confidence) {
  if (typeof confidence === "number") {
    return {
      overall: clamp01(confidence),
      amount: null,
      date: null,
      merchant: null,
      items: null,
    };
  }

  if (confidence && typeof confidence === "object") {
    return {
      overall: clamp01(confidence.overall ?? confidence.score ?? confidence.confidence),
      amount: clamp01(confidence.amount),
      date: clamp01(confidence.date),
      merchant: clamp01(confidence.merchant),
      items: clamp01(confidence.items),
    };
  }

  return null;
}

function normalizeFlags(flags, fallbackNeedsHumanReview = false) {
  const source = flags && typeof flags === "object" ? flags : {};
  return {
    has_line_items: Boolean(source.has_line_items),
    has_zero_price_lines: Boolean(source.has_zero_price_lines),
    has_discount_lines: Boolean(source.has_discount_lines),
    needs_human_review:
      typeof source.needs_human_review === "boolean"
        ? source.needs_human_review
        : Boolean(fallbackNeedsHumanReview),
  };
}

function normalizeChildItems(children) {
  return Array.isArray(children)
    ? children
        .map((child) => {
          if (!child || typeof child !== "object") return null;
          const name = cleanText(child.name ?? child.title ?? child.desc ?? child.description ?? child.item);
          const qty = toNumber(child.qty ?? child.quantity);
          const unit_price = toNumber(child.unit_price ?? child.unitPrice ?? child.price);
          const total = toNumber(child.total ?? child.line_total ?? child.lineTotal ?? child.amount ?? child.price);
          const category_key = cleanCategoryKey(child.category_key ?? child.categoryKey ?? child.category ?? child.key);
          if (!name && qty == null && unit_price == null && total == null && !category_key) return null;
          return { name, qty, unit_price, total, category_key };
        })
        .filter(Boolean)
    : [];
}

function normalizeItems(items) {
  return Array.isArray(items)
    ? items
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const name = cleanText(item.name ?? item.title ?? item.desc ?? item.description ?? item.item ?? item.product);
          const qty = toNumber(item.qty ?? item.quantity);
          const unit_price = toNumber(item.unit_price ?? item.unitPrice ?? item.price);
          const total = toNumber(item.total ?? item.line_total ?? item.lineTotal ?? item.amount ?? item.price);
          const category_key = cleanCategoryKey(item.category_key ?? item.categoryKey ?? item.category ?? item.key);
          const children = normalizeChildItems(item.children);
          if (!name && qty == null && unit_price == null && total == null && !category_key && !children.length) return null;
          return {
            name,
            qty,
            unit_price,
            total,
            category_key,
            children: children.length ? children : null,
          };
        })
        .filter(Boolean)
    : [];
}

function normalizeAdjustments(adjustments) {
  return Array.isArray(adjustments)
    ? adjustments
        .map((adjustment) => {
          if (!adjustment || typeof adjustment !== "object") return null;
          const name = cleanText(adjustment.name ?? adjustment.label ?? adjustment.title ?? adjustment.type);
          const amount = toNumber(
            adjustment.amount ??
              adjustment.value ??
              adjustment.total ??
              adjustment.line_total ??
              adjustment.lineTotal ??
              adjustment.amt,
          );
          const effect = cleanText(adjustment.effect).toLowerCase() === "subtract" ? "subtract" : "add";
          const type = cleanNullableText(adjustment.type ?? adjustment.adjustmentType ?? adjustment.adjustment_type);
          const category_key = cleanCategoryKey(
            adjustment.category_key ?? adjustment.categoryKey ?? adjustment.category,
            { allowAdjustmentCategories: true },
          );
          if (!name && amount == null && !type && !category_key) return null;
          return { name, amount, effect, type, category_key };
        })
        .filter(Boolean)
    : [];
}

export function parseScanRequestPayload(payload) {
  return requestSchema.safeParse(payload || {});
}

export function normalizeScanResponse(payload, { defaultErrorCode = SCAN_PARSE_ERROR_CODE } = {}) {
  const source = payload && typeof payload === "object" ? payload : {};
  const confidence = normalizeConfidence(source.confidence);
  const receipt = normalizeReceiptScanResult(source);
  const transactionTime = normalizeScanTime(source);
  const fallbackNeedsHumanReview =
    typeof source.needs_human_review === "boolean"
      ? source.needs_human_review
      : Boolean(source.flags?.needs_human_review) ||
        (confidence?.overall != null && confidence.overall < 0.6);

  const candidate = {
    merchant: cleanNullableText(source.merchant),
    amount: toNumber(source.amount),
    date: source.date == null ? null : cleanText(source.date).slice(0, 10) || null,
    time: transactionTime || null,
    transactionTime,
    category_key: cleanCategoryKey(source.category_key ?? source.category ?? source.categoryId, { allowMixed: true }),
    items: normalizeItems(source.items),
    adjustments: normalizeAdjustments(source.adjustments ?? source.adjustment_lines ?? source.adjustments_lines),
    confidence,
    flags: normalizeFlags(source.flags, fallbackNeedsHumanReview),
    needs_human_review: fallbackNeedsHumanReview,
    errors: Array.isArray(source.errors)
      ? source.errors.map((error) => cleanText(error)).filter(Boolean)
      : [],
    receipt,
    paidTotalSatang: receipt.paidTotalSatang,
    subtotalSatang: receipt.subtotalSatang,
    discountSatang: receipt.discountSatang,
    serviceChargeSatang: receipt.serviceChargeSatang,
    taxSatang: receipt.taxSatang,
    roundingSatang: receipt.roundingSatang,
    paymentMethod: receipt.paymentMethod,
    referenceId: receipt.referenceId,
    warnings: receipt.warnings,
  };

  const parsed = normalizedResponseSchema.safeParse(candidate);
  if (parsed.success) {
    return {
      ...parsed.data,
      needs_human_review:
        parsed.data.flags?.needs_human_review === true || parsed.data.needs_human_review === true,
    };
  }

  return {
    merchant: null,
    amount: null,
    date: null,
    time: null,
    transactionTime: "",
    category_key: null,
    items: [],
    adjustments: [],
    confidence: null,
    flags: {
      has_line_items: false,
      has_zero_price_lines: false,
      has_discount_lines: false,
      needs_human_review: true,
    },
    needs_human_review: true,
    errors: [defaultErrorCode],
    receipt: normalizeReceiptScanResult({ warnings: [defaultErrorCode] }),
    paidTotalSatang: 0,
    subtotalSatang: 0,
    discountSatang: 0,
    serviceChargeSatang: 0,
    taxSatang: 0,
    roundingSatang: 0,
    paymentMethod: null,
    referenceId: null,
    warnings: [defaultErrorCode],
  };
}
