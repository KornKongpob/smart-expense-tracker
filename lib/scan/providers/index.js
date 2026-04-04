function normalizeProviderName(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "openai";
  if (raw === "openai") return "openai";
  if (raw === "gemini" || raw === "google") return "gemini";
  return raw;
}

async function postJsonWithTimeout({ url, payload, timeoutMs = 35_000 }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
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

export async function scanWithProvider({
  url,
  payload,
  timeoutMs = 35_000,
  provider,
  scanOpenAI,
  scanGemini,
} = {}) {
  if (url) {
    return postJsonWithTimeout({ url, payload, timeoutMs });
  }

  const normalizedProvider = normalizeProviderName(provider);
  if (normalizedProvider === "openai" && typeof scanOpenAI === "function") {
    return normalizeHandlerResult(await scanOpenAI(payload || {}));
  }
  if (normalizedProvider === "gemini" && typeof scanGemini === "function") {
    return normalizeHandlerResult(await scanGemini(payload || {}));
  }

  return {
    ok: false,
    status: 400,
    json: {
      ok: false,
      code: "invalid_scan_provider",
      message: `Unsupported scan provider: ${normalizedProvider}`,
    },
  };
}

export { normalizeProviderName };
