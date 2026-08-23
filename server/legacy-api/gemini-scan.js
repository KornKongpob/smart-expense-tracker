// api/gemini-scan.js
// Server-side Gemini receipt scanner (keeps API key off the client).

import { parseScanRequestPayload, normalizeScanResponse, SCAN_PARSE_ERROR_CODE } from "../../shared/scanSchema.js";
import { enforceAccess as enforceAccessModule, setSecurityHeaders as setSecurityHeadersModule } from "../../lib/scan/access.js";
import { createRateLimiter } from "../../lib/scan/rateLimit.js";
import { parseScanRequest, assertAllowedInputMime, assertBase64UnderLimit } from "../../lib/scan/requestParse.js";
import { scanWithProvider } from "../../lib/scan/providers/index.js";
import { normalizeErrorResponse, safeJsonParseMaybe } from "../../lib/scan/normalize.js";

const IS_PROD = String(process.env.NODE_ENV || "").toLowerCase() === "production";
const MAX_JSON_BODY_BYTES = Number(process.env.SCAN_MAX_JSON_BODY_BYTES || 2 * 1024 * 1024); // 2MB
const MAX_IMAGE_BYTES = Number(process.env.SCAN_MAX_IMAGE_BYTES || 8 * 1024 * 1024); // 8MB
const RATE_LIMIT_PER_MINUTE = Number(process.env.SCAN_RATE_LIMIT_PER_MINUTE || 30);
const RATE_WINDOW_MS = 60_000;
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 35_000);

const enforceGeminiRateLimit = createRateLimiter({ keyPrefix: "gemini", limit: RATE_LIMIT_PER_MINUTE, windowMs: RATE_WINDOW_MS });

export default async function handler(req, res) {
  try {
    setSecurityHeadersModule(res);
    if (!(await enforceAccessModule(req, res))) return;
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

    const mt = assertAllowedInputMime(mimeType || "image/jpeg", { allowPdf: false });
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
      const err = normalizeErrorResponse({ status: provider.status, code: "gemini_error", message: msg });
      res.status(err.status).json(err.body);
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
