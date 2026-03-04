export async function scanWithProvider({ url, payload, timeoutMs = 35_000 }) {
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
