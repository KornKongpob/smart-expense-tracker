// src/services/scanOpenAI.js
// Client-side helper to call receipt scan API
// Optional env: VITE_SCAN_API_URL (default: /api/scan)
// รองรับได้ทั้ง:
// - /api/scan  (รับ { imageDataUrl } และตอบ { ok, data, rawText, model })
// - /api/scan-receipt (รับ { base64, mimeType } และตอบ { tx_type, amount, ... } หรือ { error, ... })

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

  // รองรับ "1,234.50" / "1234" / "1 234"
  const cleaned = s.replace(/[, ]+/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function safeISODate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  // ตัดให้เหลือ YYYY-MM-DD ถ้ามาเป็น ISO datetime
  return s.slice(0, 10);
}

function normalizeTxType(t) {
  const s = String(t || "").toLowerCase().trim();
  if (s === "income" || s === "transfer") return s;
  return "expense";
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
    // fetch abort / network
    const e = new Error("scan_network_error");
    e.code = "scan_network_error";
    e.cause = err;
    throw e;
  }

  // If primary endpoint missing and user didn't force endpoint: try fallback /api/scan-receipt
  if (primary?.res?.status === 404 && !explicitEndpoint) {
    // fallback path expects base64 + mimeType
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

    // scan-receipt error shape: { error: "..." }
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

    // scan-receipt returns the payload directly, no ok/data wrapper
    return normalizeScanResult({
      data: json,
      rawText: "",
      model: "",
      endpointUsed: fallbackUrl,
    });
  }

  // ---- Handle primary response (/api/scan) ----
  const res = primary.res;
  const json = primary.json || {};

  // If 404 here and endpoint is explicit -> keep old behavior
  if (res.status === 404) {
    const e = new Error("scan_api_not_found");
    e.code = "scan_api_not_found";
    throw e;
  }

  // /api/scan expects { ok: true, data, rawText, model }
  // If server returned non-JSON or unexpected, guard
  if (!res.ok) {
    const code = json?.code || json?.error || "scan_failed";
    const e = new Error(code);
    e.code = code;
    e.details = { status: res.status, body: json };
    throw e;
  }

  if (!json?.ok) {
    // Some deployments may return { error: ... } even with 200
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
