import { normalizeErrorResponse } from "../normalize.js";

function normalizeProviderName(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "openai";
  if (raw === "openai") return "openai";
  if (raw === "gemini" || raw === "google") return "gemini";
  return raw;
}

function normalizeProviderError({ status = 500, code = "scan_failed", message = "Scan failed", extra = {} } = {}) {
  const err = normalizeErrorResponse({ status, code, message, extra });
  return { ok: false, status: err.status, json: err.body };
}

async function postJsonWithTimeout({ url, payload, timeoutMs = 35_000, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== "function") {
    return normalizeProviderError({
      status: 500,
      code: "fetch_unavailable",
      message: "fetch is not available",
    });
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const json = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, json };
  } finally {
    clearTimeout(t);
  }
}

function normalizeHandlerResult(result) {
  const status = Math.max(100, Number(result?.status) || 500);
  const json =
    result?.json && typeof result.json === "object"
      ? result.json
      : result?.body && typeof result.body === "object"
        ? result.body
        : null;
  return {
    ok: status >= 200 && status < 300 && !(json && json.ok === false),
    status,
    json,
  };
}

/**
 * Unified scan provider adapter.
 *
 * Contract:
 * - Input is a provider-specific `payload` and either:
 *   1. `url` for legacy HTTP JSON POST proxy mode (used by Gemini route), or
 *   2. `provider` plus a matching local handler (`scanOpenAI` / `scanGemini`, or `handlers.openai` / `handlers.gemini`).
 * - Local handlers receive the payload as their only argument and may return either
 *   `{ status, body }` or `{ status, json }`.
 * - Output is always `{ ok, status, json }`.
 */
export async function scanWithProvider({
  url,
  payload,
  timeoutMs = 35_000,
  provider,
  scanOpenAI,
  scanGemini,
  handlers,
  fetchImpl,
} = {}) {
  if (url) {
    return postJsonWithTimeout({ url, payload, timeoutMs, fetchImpl });
  }

  const normalizedProvider = normalizeProviderName(provider);
  const openAIHandler = typeof scanOpenAI === "function" ? scanOpenAI : handlers?.openai;
  const geminiHandler = typeof scanGemini === "function" ? scanGemini : handlers?.gemini;

  if (normalizedProvider === "openai" && typeof openAIHandler === "function") {
    return normalizeHandlerResult(await openAIHandler(payload || {}));
  }
  if (normalizedProvider === "gemini" && typeof geminiHandler === "function") {
    return normalizeHandlerResult(await geminiHandler(payload || {}));
  }

  return normalizeProviderError({
    status: 400,
    code: "invalid_scan_provider",
    message: `Unsupported scan provider: ${normalizedProvider}`,
  });
}

export { normalizeProviderName };
