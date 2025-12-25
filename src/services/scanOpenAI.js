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

function dataUrlToBase64(dataUrl) {
  const s = String(dataUrl || "");
  const m = s.match(/^data:([^;]+);base64,(.*)$/i);
  if (!m) return { mimeType: "image/jpeg", base64: "" };
  return { mimeType: m[1] || "image/jpeg", base64: m[2] || "" };
}

function safeParseAmount(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const cleaned = s.replace(/[, ]+/g, "");
  const num = Number(cleaned);
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
      const price = safeParseAmount(it.price);
      if (!name) return null;
      return { name, price: Number.isFinite(price) ? price : null };
    })
    .filter(Boolean)
    .slice(0, 15);
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
    tx_type: normalizeTxType(d?.tx_type),
    amount: safeParseAmount(d?.amount),
    date: safeISODate(d?.date),
    merchant: d?.merchant ?? null,
    note: d?.note ?? d?.merchant ?? null,
    ref: d?.ref ?? null,
    category: d?.category ?? null,
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
  const imageDataUrl = await fileToDataUrl(file);

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
