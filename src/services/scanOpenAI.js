// src/services/scanOpenAI.js
// Client-side helper to call receipt scan API
// Optional env: VITE_SCAN_API_URL (default: /api/scan)
// รองรับได้ทั้ง:
// - /api/scan  (รับ { imageDataUrl } และตอบ { ok, data, rawText, model })
// - /api/scan-receipt (รับ { base64, mimeType } และตอบ { ok, data, rawText, model })

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => {
        const e = new Error("file_read_failed");
        e.code = "file_read_failed";
        reject(e);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      const e = new Error("file_read_failed");
      e.code = "file_read_failed";
      e.cause = err;
      reject(e);
    }
  });
}

function approxDataUrlBytes(dataUrl) {
  const str = String(dataUrl || "");
  const idx = str.indexOf("base64,");
  if (idx === -1) return str.length;
  const b64 = str.slice(idx + "base64,".length);
  // base64 length -> bytes (rough)
  return Math.floor((b64.length * 3) / 4);
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image_decode_failed"));
      img.src = dataUrl;
    } catch (err) {
      const e = new Error("image_decode_failed");
      e.cause = err;
      reject(e);
    }
  });
}

// Resize/compress before sending to /api to avoid payload limits & reduce cost.
// Defaults aim to stay well under common serverless body limits.
async function fileToOptimizedDataUrl(file, opts = {}) {
  const {
    // ✅ More conservative (higher quality) defaults for better OCR accuracy.
    // If the image is still too large, we gradually reduce quality to stay under maxBytes.
    maxDim = 2400,
    maxBytes = 3_500_000, // ~3.5MB binary
    qualityStart = 0.92,
    qualityMin = 0.72,
    qualityStep = 0.05,
  } = opts;

  const original = await fileToDataUrl(file);
  if (!original.startsWith("data:image/")) return original;

  if (typeof document === "undefined" || typeof Image === "undefined") return original;

  // If already small enough, keep as-is.
  if (approxDataUrlBytes(original) <= maxBytes) return original;

  const img = await loadImageFromDataUrl(original);

  // Scale down.
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  if (!w0 || !h0) return original;

  const scale = Math.min(1, maxDim / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return original;
  ctx.drawImage(img, 0, 0, w, h);

  // Prefer JPEG for much smaller payloads.
  let q = qualityStart;
  let out = canvas.toDataURL("image/jpeg", q);

  while (approxDataUrlBytes(out) > maxBytes && q > qualityMin) {
    q = Math.max(qualityMin, q - qualityStep);
    out = canvas.toDataURL("image/jpeg", q);
  }

  return out;
}

async function fileToBestDataUrl(file) {
  // Keep original if already small; otherwise optimize with high-quality settings.
  // This reduces request failures (payload too large) while preserving OCR readability.
  const original = await fileToDataUrl(file);
  if (!original || !original.startsWith("data:image/")) return original;
  if (approxDataUrlBytes(original) <= 3_500_000) return original;
  return fileToOptimizedDataUrl(file, { maxDim: 2400, maxBytes: 3_500_000, qualityStart: 0.92, qualityMin: 0.72, qualityStep: 0.05 });
}

function dataUrlToBase64(dataUrl) {
  const s = String(dataUrl || "");
  const m = s.match(/^data:([^;]+);base64,(.*)$/i);
  if (!m) return { mimeType: "image/jpeg", base64: "" };
  return { mimeType: m[1] || "image/jpeg", base64: m[2] || "" };
}

function safeParseAmount(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  const s0 = String(v).trim();
  if (!s0) return null;

  // remove common noise (currency symbols, spaces, commas, trailing letters like "N")
  let s = s0.replace(/[฿\s,]/g, "");
  // keep digits, '.', and '-' only
  s = s.replace(/[^0-9.\-]/g, "");
  // if multiple dots, keep the first
  const parts = s.split(".");
  if (parts.length > 2) s = parts[0] + "." + parts.slice(1).join("");
  // if multiple dashes, keep only a leading dash
  const neg = s.startsWith("-");
  s = s.replace(/\-/g, "");
  if (neg) s = "-" + s;

  const num = Number(s);
  return Number.isFinite(num) ? num : null;
}

function safeISODate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, 10);
}

function normalizeTxType(t) {
  const s = String(t || "").toLowerCase().trim();
  if (s === "income" || s === "transfer") return s;
  return "expense";
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => {
      if (!it || typeof it !== "object") return null;
      const name = it.name != null ? String(it.name).trim() : "";
      if (!name) return null;

      const qty = safeParseAmount(it.qty);
      const unitPrice = safeParseAmount(it.unit_price ?? it.unitPrice ?? it.price);
      const lineTotal = safeParseAmount(it.line_total ?? it.lineTotal ?? it.total ?? it.amount ?? it.price);

      const category_key = (it.category_key ?? it.category ?? null) != null ? String(it.category_key ?? it.category).trim() : null;

      return {
        name,
        qty: Number.isFinite(qty) ? qty : null,
        unit_price: Number.isFinite(unitPrice) ? unitPrice : null,
        total: Number.isFinite(lineTotal) ? lineTotal : null,
        // Back-compat fields expected by older helpers
        price: Number.isFinite(unitPrice) ? unitPrice : (Number.isFinite(lineTotal) ? lineTotal : null),
        lineTotal: Number.isFinite(lineTotal) ? lineTotal : null,
        category_key,
        category: category_key,
      };
    })
    .filter(Boolean)
    .slice(0, 30);
}

function normalizeKeywords(kws) {
  if (!Array.isArray(kws)) return [];
  const out = [];
  const seen = new Set();
  for (const k of kws) {
    const s = String(k || "").trim().toLowerCase();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out.slice(0, 15);
}

function normalizeScanResult({ data, rawText, model, endpointUsed }) {
  const d = data && typeof data === "object" ? data : null;

  const normalized = {
    doc_type: d?.doc_type ?? d?.docType ?? null,
    currency: d?.currency ?? null,
    tx_type: normalizeTxType(d?.tx_type),
    amount: safeParseAmount(d?.amount),
    date: safeISODate(d?.date),
    merchant: d?.merchant ?? null,
    note: d?.note ?? d?.merchant ?? null,
    ref: d?.ref ?? null,
    category: d?.category ?? null,
    category_key: d?.category_key ?? d?.category ?? null,
    from_account: d?.from_account ?? null,
    to_account: d?.to_account ?? null,
    evidence: d?.evidence ?? rawText ?? "",
    items: normalizeItems(d?.items),
    keywords: normalizeKeywords(d?.keywords),

    // ✅ new fields (safe additions)
    tx_subtype: d?.tx_subtype ?? null,
    is_credit_card_payment: !!d?.is_credit_card_payment,
    from_account_variants: d?.from_account_variants ?? null,
    to_account_variants: d?.to_account_variants ?? null,
    account_candidates: Array.isArray(d?.account_candidates) ? d.account_candidates : null,

    confidence: d?.confidence && typeof d.confidence === 'object' ? d.confidence : null,
    flags: d?.flags && typeof d.flags === 'object' ? d.flags : null,

    _rawText: rawText ?? "",
    _model: model ?? "",
    _endpointUsed: endpointUsed ?? "",
  };

  return normalized;
}

async function safeReadJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function postJson(url, body, { timeoutMs = 45000 } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    });
    const json = await safeReadJson(res);
    return { res, json };
  } finally {
    clearTimeout(t);
  }
}

function isExplicitEndpointProvided(endpoint) {
  return typeof endpoint === "string" && endpoint.trim().length > 0;
}

/**
 * scanReceiptOpenAI(file, { endpoint, onStatus })
 *
 * onStatus steps:
 * - "encoding_image"
 * - "calling_api"
 * - "calling_api_fallback"
 * - "done"
 */
export async function scanReceiptOpenAI(file, { endpoint, onStatus } = {}) {
  const defaultUrl = import.meta.env.VITE_SCAN_API_URL || "/api/scan";
  const url = (endpoint || defaultUrl || "/api/scan").trim();
  const explicitEndpoint = isExplicitEndpointProvided(endpoint);

  if (!file) {
    const e = new Error("missing_file");
    e.code = "missing_file";
    throw e;
  }

  onStatus?.("encoding_image");
  // ✅ Keep quality high for OCR, but still prevent oversized payloads.
  // If image is already small enough, it will be kept as-is.
  const imageDataUrl = await fileToOptimizedDataUrl(file);

  // ---- 1) Try primary endpoint (/api/scan by default) ----
  onStatus?.("calling_api");
  let primary;
  try {
    primary = await postJson(url, { imageDataUrl });
  } catch (err) {
    const e = new Error("scan_network_error");
    e.code = "scan_network_error";
    e.cause = err;
    throw e;
  }

  // If primary endpoint missing and user didn't force endpoint: try fallback /api/scan-receipt
  if (primary?.res?.status === 404 && !explicitEndpoint) {
    const { base64, mimeType } = dataUrlToBase64(imageDataUrl);

    if (!base64) {
      const e = new Error("scan_api_not_found");
      e.code = "scan_api_not_found";
      throw e;
    }

    onStatus?.("calling_api_fallback");
    const fallbackUrl = "/api/scan-receipt";

    let fb;
    try {
      fb = await postJson(fallbackUrl, { base64, mimeType });
    } catch (err) {
      const e = new Error("scan_network_error");
      e.code = "scan_network_error";
      e.cause = err;
      throw e;
    }

    const res = fb.res;
    const json = fb.json;

    if (!res.ok) {
      const code = json?.error || "scan_failed";
      const e = new Error(code);
      e.code = code;
      e.details = { status: res.status, body: json };
      throw e;
    }

    if (json?.error) {
      const e = new Error(json.error);
      e.code = json.error;
      e.details = json;
      throw e;
    }

    onStatus?.("done");

    return normalizeScanResult({
      data: json?.data ?? json, // support both {data:...} and plain object
      rawText: json?.rawText ?? "",
      model: json?.model ?? "",
      endpointUsed: fallbackUrl,
    });
  }

  // ---- Handle primary response (/api/scan) ----
  const res = primary.res;
  const json = primary.json || {};

  if (res.status === 404) {
    const e = new Error("scan_api_not_found");
    e.code = "scan_api_not_found";
    throw e;
  }

  if (!res.ok) {
    const code = json?.code || json?.error || "scan_failed";
    const e = new Error(code);
    e.code = code;
    e.details = { status: res.status, body: json };
    throw e;
  }

  if (!json?.ok) {
    const code = json?.code || json?.error || "scan_failed";
    const e = new Error(code);
    e.code = code;
    e.details = json;
    throw e;
  }

  const d = json?.data && typeof json.data === "object" ? json.data : null;

  onStatus?.("done");

  return normalizeScanResult({
    data: d || {},
    rawText: json?.rawText || "",
    model: json?.model || "",
    endpointUsed: url,
  });
}
