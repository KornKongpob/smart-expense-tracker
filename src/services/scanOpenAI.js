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
    // Keep more pixels for Thai small fonts, but still cap payload size.
    maxDim = 2800,
    maxBytes = 3_500_000, // ~3.5MB binary (base64 will be larger)
    qualityStart = 0.96,
    qualityMin = 0.78,
    qualityStep = 0.05,

    // ✅ OCR enhancement (helps Thai small fonts on receipts)
    // - grayscale + contrast makes text edges clearer
    // - optional mild sharpen (best-effort; skips on slow devices)
    ocrEnhance = true,
    sharpen = true,
    contrast = 1.35,
    brightness = 1.06,

    // ✅ Even if the original image is already under maxBytes, we may still want
    // to re-render it with OCR-friendly filters.
    forceProcess = false,
  } = opts;

  const original = await fileToDataUrl(file);
  if (!original.startsWith("data:image/")) return original;

  if (typeof document === "undefined" || typeof Image === "undefined") return original;

  // If already small enough, keep as-is (unless caller forces OCR re-render).
  if (!forceProcess && approxDataUrlBytes(original) <= maxBytes) return original;

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
  // Improve OCR readability on downscaled images
  try {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  } catch {
    // ignore
  }

  // ---- draw + OCR enhancements (best effort) ----
  try {
    if (ocrEnhance && "filter" in ctx) {
      // Make text edges clearer (receipt-style black on white)
      ctx.filter = `grayscale(1) contrast(${contrast}) brightness(${brightness})`;
    }
  } catch {
    // ignore
  }

  ctx.drawImage(img, 0, 0, w, h);

  // Reset filter so subsequent draws are normal
  try {
    if ("filter" in ctx) ctx.filter = "none";
  } catch {
    // ignore
  }

  // Optional mild sharpening convolution (skip on very large images)
  const trySharpen = () => {
    if (!sharpen) return;
    const px = w * h;
    // keep this cheap on mobile
    if (px > 4_000_000) return;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const out = new Uint8ClampedArray(data.length);

    // 3x3 sharpen kernel: [0 -1 0; -1 5 -1; 0 -1 0]
    const idx = (x, y) => (y * w + x) * 4;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = idx(x, y);
        for (let c = 0; c < 3; c++) {
          const v =
            -data[idx(x, y - 1) + c] +
            -data[idx(x - 1, y) + c] +
            5 * data[i + c] +
            -data[idx(x + 1, y) + c] +
            -data[idx(x, y + 1) + c];
          out[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
        }
        out[i + 3] = data[i + 3];
      }
    }

    // Copy borders unchanged
    for (let x = 0; x < w; x++) {
      const t = idx(x, 0);
      const b = idx(x, h - 1);
      out[t] = data[t]; out[t + 1] = data[t + 1]; out[t + 2] = data[t + 2]; out[t + 3] = data[t + 3];
      out[b] = data[b]; out[b + 1] = data[b + 1]; out[b + 2] = data[b + 2]; out[b + 3] = data[b + 3];
    }
    for (let y = 0; y < h; y++) {
      const l = idx(0, y);
      const r = idx(w - 1, y);
      out[l] = data[l]; out[l + 1] = data[l + 1]; out[l + 2] = data[l + 2]; out[l + 3] = data[l + 3];
      out[r] = data[r]; out[r + 1] = data[r + 1]; out[r + 2] = data[r + 2]; out[r + 3] = data[r + 3];
    }

    imgData.data.set(out);
    ctx.putImageData(imgData, 0, 0);
  };

  try {
    trySharpen();
  } catch {
    // ignore
  }

  // Prefer JPEG for much smaller payloads.
  let q = qualityStart;
  let out = canvas.toDataURL("image/jpeg", q);

  // If too large, gradually reduce JPEG quality, then (if needed) reduce dimensions
  // This tends to preserve text edges better than forcing very low JPEG quality.
  let curW = w;
  let curH = h;
  while (approxDataUrlBytes(out) > maxBytes) {
    if (q > qualityMin) {
      q = Math.max(qualityMin, q - qualityStep);
      out = canvas.toDataURL("image/jpeg", q);
      continue;
    }

    // Quality already at minimum: reduce resolution a bit and retry.
    // Stop once the image becomes too small for OCR.
    if (curW <= 1600 || curH <= 1600) break;

    curW = Math.max(1, Math.round(curW * 0.9));
    curH = Math.max(1, Math.round(curH * 0.9));
    canvas.width = curW;
    canvas.height = curH;
    try {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    } catch {
      // ignore
    }
    ctx.drawImage(img, 0, 0, curW, curH);

    // reset to starting quality after resizing
    q = qualityStart;
    out = canvas.toDataURL("image/jpeg", q);
  }

  return out;
}

async function fileToBestDataUrl(file) {
  // ✅ Always apply a best-effort OCR-friendly re-render.
  // Even if the image is already under the body-size limit, the grayscale/contrast
  // pass significantly improves small Thai fonts on receipts.
  const original = await fileToDataUrl(file);
  if (!original || !original.startsWith("data:image/")) return original;

  return fileToOptimizedDataUrl(file, {
    // Keep more pixels for OCR while staying under common serverless limits.
    maxDim: 2800,
    maxBytes: 3_500_000,
    qualityStart: 0.94,
    qualityMin: 0.74,
    qualityStep: 0.05,
    ocrEnhance: true,
    sharpen: true,
    forceProcess: true,
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

      // one-level children (for add-ons/modifiers)
      let children = null;
      if (Array.isArray(it.children)) {
        const chOut = it.children
          .map((ch) => {
            if (!ch || typeof ch !== "object") return null;
            const chName = ch.name != null ? String(ch.name).trim() : "";
            if (!chName) return null;
            const chQty = safeParseAmount(ch.qty);
            const chUnitPrice = safeParseAmount(ch.unit_price ?? ch.unitPrice ?? ch.price);
            const chLineTotal = safeParseAmount(ch.line_total ?? ch.lineTotal ?? ch.total ?? ch.amount ?? ch.price);
            return {
              name: chName,
              qty: Number.isFinite(chQty) ? chQty : null,
              unit_price: Number.isFinite(chUnitPrice) ? chUnitPrice : null,
              total: Number.isFinite(chLineTotal) ? chLineTotal : null,
              price: Number.isFinite(chUnitPrice) ? chUnitPrice : (Number.isFinite(chLineTotal) ? chLineTotal : null),
              lineTotal: Number.isFinite(chLineTotal) ? chLineTotal : null,
            };
          })
          .filter(Boolean)
          .slice(0, 12);
        if (chOut.length) children = chOut;
      }

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
        children,
      };
    })
    .filter(Boolean)
    .slice(0, 30);
}

function normalizeAdjustments(adjustments) {
  if (!Array.isArray(adjustments)) return [];
  return adjustments
    .map((a) => {
      if (!a || typeof a !== "object") return null;
      const name = a.name != null ? String(a.name).trim() : a.type != null ? String(a.type).trim() : "";
      const amountRaw = safeParseAmount(a.amount ?? a.value ?? a.total ?? a.line_total ?? a.lineTotal ?? a.amt);

      let effect = String(a.effect ?? "").toLowerCase().trim();
      const looksDiscount = /ส่วนลด|discount|coupon|promo|คูปอง|แต้ม|points/i.test(String(name || "").toLowerCase());
      if (effect !== "subtract" && effect !== "add") {
        if (looksDiscount) effect = "subtract";
        else if (Number.isFinite(amountRaw) && amountRaw < 0) effect = "subtract";
        else effect = "add";
      }

      let type = String(a.type ?? a.kind ?? "").toLowerCase().trim();
      const allowed = new Set(["discount", "fee", "tax", "service_charge", "rounding", "other"]);
      if (!allowed.has(type)) {
        const low = String(name || "").toLowerCase();
        if (looksDiscount) type = "discount";
        else if (/vat|tax|ภาษี/.test(low)) type = "tax";
        else if (/service|ค่าบริการ/.test(low)) type = "service_charge";
        else if (/fee|ค่าธรรมเนียม/.test(low)) type = "fee";
        else if (/round|ปัดเศษ/.test(low)) type = "rounding";
        else type = "other";
      }

      const amount = Number.isFinite(amountRaw) ? Math.abs(amountRaw) : null;
      if (!name && amount == null) return null;

      return {
        name: name || type,
        amount,
        effect,
        type,
      };
    })
    .filter(Boolean)
    .slice(0, 20);
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
    ref: (d?.ref ?? d?.referenceId ?? d?.reference_id) ?? null,
    category: d?.category ?? null,
    category_key: d?.category_key ?? d?.category ?? null,
    payment_method: d?.payment_method ?? d?.paymentMethod ?? null,
    account_id: d?.account_id ?? d?.accountId ?? null,
    from_account: d?.from_account ?? null,
    to_account: d?.to_account ?? null,
    evidence: d?.evidence ?? rawText ?? "",
    items: normalizeItems(d?.items),
    adjustments: normalizeAdjustments(d?.adjustments ?? d?.adjustment_lines ?? d?.adjustments_lines ?? null),
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


async function dataUrlToBlob(dataUrl) {
  const s = String(dataUrl || "");
  if (!s.startsWith("data:")) return null;
  const res = await fetch(s);
  return await res.blob();
}

function isPdfFileLike(file) {
  if (!file) return false;
  const mt = String(file?.type || "").toLowerCase().trim();
  if (mt === "application/pdf") return true;
  const name = String(file?.name || "").toLowerCase().trim();
  return name.endsWith(".pdf");
}

async function postMultipart(
  url,
  { file, imageDataUrl, fileName, accounts },
  { timeoutMs = 45000 } = {}
) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const blob = file ? file : await dataUrlToBlob(imageDataUrl);
    if (!blob) {
      const e = new Error("missing_image_data");
      e.code = "missing_image_data";
      throw e;
    }

    const form = new FormData();
    form.append("file", blob, fileName || (isPdfFileLike(file) ? "receipt.pdf" : "receipt.jpg"));
    if (Array.isArray(accounts) && accounts.length) {
      form.append("accounts", JSON.stringify(accounts));
    }

    const headers = (() => {
      const h = {};
      const token = import.meta.env.VITE_SCAN_API_TOKEN || "";
      if (token) h.Authorization = `Bearer ${token}`;
      return h;
    })();

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: form,
      signal: controller.signal,
    });

    const json = await safeReadJson(res);
    return { res, json };
  } finally {
    clearTimeout(t);
  }
}

async function postJson(url, body, { timeoutMs = 45000 } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: (() => {
        const h = { "Content-Type": "application/json" };
        const token = import.meta.env.VITE_SCAN_API_TOKEN || "";
        if (token) h.Authorization = `Bearer ${token}`;
        return h;
      })(),
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
 * - "preparing_file" (PDF)
 * - "calling_api"
 * - "calling_api_fallback"
 * - "done"
 */
export async function scanReceiptOpenAI(file, { endpoint, onStatus, accounts = [] } = {}) {
  // ✅ Prefer the receipt-optimized endpoint by default.
  // (We still keep /api/scan working as an alias on the backend.)
  const defaultUrl = import.meta.env.VITE_SCAN_API_URL || "/api/scan";
  const url = (endpoint || defaultUrl || "/api/scan").trim();
  const explicitEndpoint = isExplicitEndpointProvided(endpoint);

  if (!file) {
    const e = new Error("missing_file");
    e.code = "missing_file";
    throw e;
  }

  const isPdf = isPdfFileLike(file);

  // For images: optimize for OCR and payload size.
  // For PDFs: send the raw file (avoid base64 conversion overhead).
  let imageDataUrl = "";
  if (!isPdf) {
    onStatus?.("encoding_image");
    // ✅ Keep quality high for OCR, but still prevent oversized payloads.
    // If image is already small enough, it will be kept as-is.
    imageDataUrl = await fileToOptimizedDataUrl(file, {
      // receipts are high-value OCR targets; always run the enhancement pass
      forceProcess: true,
      maxDim: 2800,
    });
  } else {
    onStatus?.("preparing_file");
  }

  const multipartPayload = {
    file: isPdf ? file : null,
    imageDataUrl: isPdf ? "" : imageDataUrl,
    fileName: file?.name,
    accounts,
  };

  // ---- 1) Try primary endpoint (/api/scan by default) ----
  onStatus?.("calling_api");
  let primary;
  try {
    primary = await postMultipart(url, multipartPayload);
  } catch (err) {
    const e = new Error("scan_network_error");
    e.code = "scan_network_error";
    e.cause = err;
    throw e;
  }

  // If primary endpoint missing and user didn't force endpoint: try fallback /api/scan-receipt
  if (primary?.res?.status === 404 && !explicitEndpoint) {
    // fallback uses multipart too
    if (!imageDataUrl && !isPdf) {
      const e = new Error("scan_api_not_found");
      e.code = "scan_api_not_found";
      throw e;
    }

    onStatus?.("calling_api_fallback");
    const fallbackUrl = "/api/scan-receipt";

    let fb;
    try {
      fb = await postMultipart(fallbackUrl, multipartPayload);
    } catch (err) {
      const e = new Error("scan_network_error");
      e.code = "scan_network_error";
      e.cause = err;
      throw e;
    }

    const res = fb.res;
    const json = fb.json;

    if (!res.ok) {
      const code = json?.code || json?.error || json?.error?.code || "scan_failed";
      const msg = json?.message || json?.error?.message || code;
      const e = new Error(msg);
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
    const code = json?.code || json?.error || json?.error?.code || "scan_failed";
    const msg = json?.message || json?.error?.message || code;
    const e = new Error(msg);
    e.code = code;
    e.details = { status: res.status, body: json };
    throw e;
  }

  if (!json?.ok) {
    const code = json?.code || json?.error || json?.error?.code || "scan_failed";
    const msg = json?.message || json?.error?.message || code;
    const e = new Error(msg);
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
