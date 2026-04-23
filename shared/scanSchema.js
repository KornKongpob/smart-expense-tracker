import { z } from "zod";

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

const normalizedResponseSchema = z
  .object({
    merchant: z.string().nullable().default(null),
    amount: z.number().nullable().default(null),
    date: z.string().nullable().default(null),
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
  })
  .passthrough();

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
          const category_key = cleanNullableText(child.category_key ?? child.categoryKey ?? child.category ?? child.key);
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
          const category_key = cleanNullableText(item.category_key ?? item.categoryKey ?? item.category ?? item.key);
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
          const category_key = cleanNullableText(
            adjustment.category_key ?? adjustment.categoryKey ?? adjustment.category,
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
  const fallbackNeedsHumanReview =
    typeof source.needs_human_review === "boolean"
      ? source.needs_human_review
      : Boolean(source.flags?.needs_human_review) ||
        (confidence?.overall != null && confidence.overall < 0.6);

  const candidate = {
    merchant: cleanNullableText(source.merchant),
    amount: toNumber(source.amount),
    date: source.date == null ? null : cleanText(source.date).slice(0, 10) || null,
    category_key: cleanNullableText(source.category_key ?? source.category ?? source.categoryId),
    items: normalizeItems(source.items),
    adjustments: normalizeAdjustments(source.adjustments ?? source.adjustment_lines ?? source.adjustments_lines),
    confidence,
    flags: normalizeFlags(source.flags, fallbackNeedsHumanReview),
    needs_human_review: fallbackNeedsHumanReview,
    errors: Array.isArray(source.errors)
      ? source.errors.map((error) => cleanText(error)).filter(Boolean)
      : [],
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
  };
}
