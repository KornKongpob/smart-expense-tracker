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
  .superRefine((v, ctx) => {
    if (!v.image && !v.imageDataUrl && !v.base64) {
      ctx.addIssue({ code: "custom", message: "missing_image_payload" });
    }
  });

const normalizedItemSchema = z.object({
  name: z.string().default(""),
  qty: z.number().nullable().optional(),
  unit_price: z.number().nullable().optional(),
  total: z.number().nullable().optional(),
});

const normalizedResponseSchema = z.object({
  merchant: z.string().nullable().default(null),
  amount: z.number().nullable().default(null),
  date: z.string().nullable().default(null),
  items: z.array(normalizedItemSchema).default([]),
  confidence: z.number().min(0).max(1).nullable().default(null),
  errors: z.array(z.string()).default([]),
});

function toNumber(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toConfidence(conf) {
  if (typeof conf === "number") return Math.max(0, Math.min(1, conf));
  if (conf && typeof conf === "object") {
    const n = toNumber(conf.overall);
    if (n == null) return null;
    return Math.max(0, Math.min(1, n));
  }
  return null;
}

export function parseScanRequestPayload(payload) {
  return requestSchema.safeParse(payload || {});
}

export function normalizeScanResponse(payload, { defaultErrorCode = SCAN_PARSE_ERROR_CODE } = {}) {
  const src = payload && typeof payload === "object" ? payload : {};
  const items = Array.isArray(src.items)
    ? src.items
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const name = String(item.name ?? item.title ?? item.desc ?? "").trim();
          const qty = toNumber(item.qty ?? item.quantity);
          const unit_price = toNumber(item.unit_price ?? item.unitPrice ?? item.price);
          const total = toNumber(item.total ?? item.line_total ?? item.lineTotal ?? item.amount);
          if (!name && qty == null && unit_price == null && total == null) return null;
          return { name, qty, unit_price, total };
        })
        .filter(Boolean)
    : [];

  const errors = Array.isArray(src.errors)
    ? src.errors.map((e) => String(e || "").trim()).filter(Boolean)
    : [];

  const candidate = {
    merchant: src.merchant == null ? null : String(src.merchant).trim() || null,
    amount: toNumber(src.amount),
    date: src.date == null ? null : String(src.date).slice(0, 10) || null,
    items,
    confidence: toConfidence(src.confidence),
    errors,
  };

  const parsed = normalizedResponseSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;

  return {
    merchant: null,
    amount: null,
    date: null,
    items: [],
    confidence: null,
    errors: [defaultErrorCode],
  };
}
