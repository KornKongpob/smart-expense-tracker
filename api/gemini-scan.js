// api/gemini-scan.js
// Server-side Gemini receipt scanner (keeps API key off the client).

import { parseScanRequestPayload, normalizeScanResponse, SCAN_PARSE_ERROR_CODE } from "../shared/scanSchema.js";
import { enforceAccess as enforceAccessModule, setSecurityHeaders as setSecurityHeadersModule } from "../lib/scan/access.js";
import { createRateLimiter } from "../lib/scan/rateLimit.js";
import { parseScanRequest } from "../lib/scan/requestParse.js";
import { scanWithProvider } from "../lib/scan/providers/index.js";
import { normalizeErrorResponse } from "../lib/scan/normalize.js";

const IS_PROD = String(process.env.NODE_ENV || "").toLowerCase() === "production";
const MAX_JSON_BODY_BYTES = Number(process.env.SCAN_MAX_JSON_BODY_BYTES || 2 * 1024 * 1024); // 2MB
const MAX_IMAGE_BYTES = Number(process.env.SCAN_MAX_IMAGE_BYTES || 8 * 1024 * 1024); // 8MB
const RATE_LIMIT_PER_MINUTE = Number(process.env.SCAN_RATE_LIMIT_PER_MINUTE || 30);
const RATE_WINDOW_MS = 60_000;
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 35_000);

const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const _rate = new Map();
const enforceGeminiRateLimit = createRateLimiter({ keyPrefix: "gemini", limit: RATE_LIMIT_PER_MINUTE, windowMs: RATE_WINDOW_MS });

function _setSecurityHeaders(res) {
  try {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    res.setHeader("Referrer-Policy", "no-referrer");
  } catch {
    // ignore
  }
}

function parseEnvList(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getClientIp(req) {
  const xf = String(req.headers?.["x-forwarded-for"] || "").trim();
  if (xf) return xf.split(",")[0].trim();
  const xr = String(req.headers?.["x-real-ip"] || "").trim();
  if (xr) return xr;
  return String(req.socket?.remoteAddress || "").trim() || "unknown";
}

function constantTimeEqual(a, b) {
  const s1 = String(a || "");
  const s2 = String(b || "");
  if (s1.length !== s2.length) return false;
  let out = 0;
  for (let i = 0; i < s1.length; i++) out |= s1.charCodeAt(i) ^ s2.charCodeAt(i);
  return out === 0;
}

function getBearerToken(req) {
  const auth = String(req.headers?.authorization || "").trim();
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

function hasValidScanToken(req) {
  const expected = String(process.env.SCAN_API_TOKEN || "").trim();
  if (!expected) return false;
  const got = getBearerToken(req) || String(req.headers?.["x-scan-token"] || "").trim();
  if (!got) return false;
  return constantTimeEqual(got, expected);
}

function isAllowedOrigin(req) {
  const allowed = parseEnvList(process.env.SCAN_ALLOWED_ORIGINS);
  if (!allowed.length) return { ok: false, origin: "" };
  const origin = String(req.headers?.origin || "").trim();
  if (!origin) return { ok: false, origin: "" };
  return { ok: allowed.includes(origin), origin };
}

function applyCorsIfAllowed(res, originOk, origin) {
  if (!originOk || !origin) return;
  try {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Scan-Token");
  } catch {
    // ignore
  }
}

function _enforceAccess(req, res) {
  const tokenConfigured = String(process.env.SCAN_API_TOKEN || "").trim().length > 0;
  const allowedOrigins = parseEnvList(process.env.SCAN_ALLOWED_ORIGINS);
  const originsConfigured = allowedOrigins.length > 0;

  const { ok: originOk, origin } = isAllowedOrigin(req);
  const tokenOk = hasValidScanToken(req);
  applyCorsIfAllowed(res, originOk, origin);

  if (req.method === "OPTIONS") {
    if (originOk) {
      res.status(204).end();
      return false;
    }
    res.status(403).end();
    return false;
  }

  if (originsConfigured) {
    if (originOk || tokenOk) return true;
    res.status(403).json({ ok: false, code: "forbidden", message: "Origin not allowed" });
    return false;
  }

  if (tokenConfigured) {
    if (tokenOk) return true;
    res.status(401).json({ ok: false, code: "unauthorized", message: "Missing/invalid token" });
    return false;
  }

  return true;
}

function _enforceRateLimit(req, res) {
  const limit = Number.isFinite(RATE_LIMIT_PER_MINUTE) && RATE_LIMIT_PER_MINUTE > 0 ? RATE_LIMIT_PER_MINUTE : 0;
  if (!limit) return true;

  const ip = getClientIp(req);
  const key = `gemini:${ip}`;
  const now = Date.now();

  const rec = _rate.get(key);
  if (!rec || now >= rec.resetAt) {
    _rate.set(key, { resetAt: now + RATE_WINDOW_MS, count: 1 });
    return true;
  }

  rec.count += 1;
  if (rec.count <= limit) return true;

  const retryAfterSec = Math.max(1, Math.ceil((rec.resetAt - now) / 1000));
  res.setHeader("Retry-After", String(retryAfterSec));
  res.status(429).json({ ok: false, code: "rate_limited", message: "Too many requests" });
  return false;
}

function normalizeImageMime(mimeType) {
  const m = String(mimeType || "").trim().toLowerCase();
  if (!m) return "";
  if (m === "image/jpg") return "image/jpeg";
  return m;
}

function assertAllowedImageMime(mimeType) {
  const mt = normalizeImageMime(mimeType);
  if (!mt || !ALLOWED_IMAGE_MIME.has(mt)) return "";
  return mt;
}

function approxBase64Bytes(b64) {
  const s = String(b64 || "").trim();
  if (!s) return 0;
  let len = s.length;
  if (s.endsWith("==")) len -= 2;
  else if (s.endsWith("=")) len -= 1;
  return Math.floor((len * 3) / 4);
}

function assertBase64UnderLimit(b64, maxBytes) {
  const bytes = approxBase64Bytes(b64);
  if (!bytes) return { ok: false, bytes: 0 };
  if (bytes > maxBytes) return { ok: false, bytes };
  return { ok: true, bytes };
}

function _parseDataUrlMaybe(dataUrl) {
  const s = String(dataUrl || "").trim();
  if (!s.startsWith("data:")) return null;

  const comma = s.indexOf(",");
  if (comma < 0) return null;

  const meta = s.slice(5, comma);
  const body = s.slice(comma + 1);

  const parts = meta.split(";");
  const mimeType = parts[0] || "image/jpeg";
  const isBase64 = parts.includes("base64");
  if (!isBase64) return null;

  return { mimeType, base64: body };
}

function readRawBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err, val) => {
      if (done) return;
      done = true;
      if (err) reject(err);
      else resolve(val);
    };

    const chunks = [];
    let total = 0;

    req.on("data", (c) => {
      try {
        total += c.length;
        if (maxBytes && total > maxBytes) {
          const e = new Error("body_too_large");
          e.code = "body_too_large";
          try {
            req.destroy(e);
          } catch {
            // ignore
          }
          return finish(e);
        }
        chunks.push(c);
      } catch (e) {
        finish(e);
      }
    });

    req.on("end", () => {
      try {
        finish(null, Buffer.concat(chunks));
      } catch (e) {
        finish(e);
      }
    });

    req.on("error", (e) => finish(e));
  });
}

async function _readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const buf = await readRawBody(req);
  const txt = buf.toString("utf-8").trim();
  if (!txt) return {};
  try {
    return JSON.parse(txt);
  } catch {
    return {};
  }
}

async function _fetchWithTimeout(url, options, timeoutMs = GEMINI_TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...(options || {}), signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

function safeJsonParseMaybe(text) {
  const t0 = String(text || "").trim();
  if (!t0) return null;

  const t = t0.replace(/```json/gi, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const candidate = t.slice(start, end + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export default async function handler(req, res) {
  try {
    setSecurityHeadersModule(res);
    if (!enforceAccessModule(req, res)) return;
    if (!enforceGeminiRateLimit(req, res)) return;

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).json({ ok: false, code: "method_not_allowed", message: "Use POST" });
      return;
    }

    const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) {
      res.status(500).json({ ok: false, code: "missing_gemini_api_key", message: "GEMINI_API_KEY is not set" });
      return;
    }

    const parsedReq = await parseScanRequest(req, { maxBytes: MAX_JSON_BODY_BYTES });
    const b64 = parsedReq.base64;
    const mimeType = parsedReq.mimeType;
    const reqCheck = parseScanRequestPayload({ base64: b64, mimeType: mimeType || "image/jpeg", type: "image" });
    if (!reqCheck.success) {
      res.status(400).json({ ok: false, code: "invalid_scan_request", message: "Provide { base64, mimeType } or { imageDataUrl }" });
      return;
    }

    const mt = assertAllowedImageMime(mimeType || "image/jpeg");
    if (!mt) {
      res.status(415).json({ ok: false, code: "unsupported_media_type", message: "Only jpeg/png/webp are allowed" });
      return;
    }

    const sizeCheck = assertBase64UnderLimit(b64, MAX_IMAGE_BYTES);
    if (!sizeCheck.ok) {
      res.status(413).json({ ok: false, code: "image_too_large", message: "Image payload too large" });
      return;
    }

    const model = String(process.env.GEMINI_MODEL || "gemini-2.5-flash-preview-09-2025").trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const prompt = String(process.env.GEMINI_RECEIPT_PROMPT || `Analyze receipt. Return JSON only:\n{"amount": number, "date": "YYYY-MM-DD", "merchant": string, "category": string}.\nCategory options: food, transport, shopping, bills, health, entertainment, other.\nIf year is BE (e.g. 2567), convert to AD (2024).`);

    const payload = {
      contents: [
        {
          parts: [{ text: prompt }, { inlineData: { mimeType: mt, data: b64 } }],
        },
      ],
    };

    const provider = await scanWithProvider({ url, payload, timeoutMs: GEMINI_TIMEOUT_MS });
    const json = provider.json;
    if (!provider.ok) {
      const msg = json?.error?.message || "Gemini request failed";
      res.status(provider.status).json({ ok: false, code: "gemini_error", message: msg });
      return;
    }

    const text = json?.candidates?.[0]?.content?.parts?.map((p) => p?.text).filter(Boolean).join("\n") || "";
    const parsed = safeJsonParseMaybe(text);

    if (!parsed) {
      res.status(200).json({ ok: false, code: SCAN_PARSE_ERROR_CODE, message: "Model output is not valid JSON", rawText: text, model });
      return;
    }

    const normalized = normalizeScanResponse(parsed, { defaultErrorCode: SCAN_PARSE_ERROR_CODE });
    if (normalized.errors.length) {
      res.status(200).json({ ok: false, code: SCAN_PARSE_ERROR_CODE, message: "Model output does not match scan schema", rawText: text, model });
      return;
    }

    res.status(200).json({ ok: true, data: { ...parsed, ...normalized }, rawText: text, model });
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg === "body_too_large") {
      res.status(413).json({ ok: false, code: "body_too_large", message: "Request body too large" });
      return;
    }
    const err = normalizeErrorResponse({ status: 500, code: "server_error", message: IS_PROD ? "Internal server error" : msg });
    res.status(err.status).json(err.body);
  }
}
