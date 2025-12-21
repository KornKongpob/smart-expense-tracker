// src/services/scanOpenAI.js
// Client-side helper to call POST /api/scan
// Optional env: VITE_SCAN_API_URL (default: /api/scan)

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("file_read_failed"));
      reader.readAsDataURL(file);
    } catch (e) {
      reject(e);
    }
  });
}

export async function scanReceiptOpenAI(file, { endpoint, onStatus } = {}) {
  const url = endpoint || import.meta.env.VITE_SCAN_API_URL || "/api/scan";

  if (!file) {
    const e = new Error("missing_file");
    e.code = "missing_file";
    throw e;
  }

  onStatus?.("encoding_image");
  const imageDataUrl = await fileToDataUrl(file);

  onStatus?.("calling_api");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl }),
  });

  // Your UI expects scan_api_not_found (as seen in screenshot)
  if (res.status === 404) {
    const e = new Error("scan_api_not_found");
    e.code = "scan_api_not_found";
    throw e;
  }

  const json = await res.json().catch(() => ({}));

  if (!res.ok || !json?.ok) {
    const code = json?.code || "scan_failed";
    const e = new Error(code);
    e.code = code;
    e.details = json;
    throw e;
  }

  // Return in format AddTransactionView expects: result.tx_type, result.amount, ...
  // If parsing fails, data can be null; still return evidence/rawText for debug
  const d = json?.data || null;

  // Minimal fallback to prevent crashes
  const normalized = {
    tx_type: d?.tx_type || "expense",
    amount: typeof d?.amount === "number" ? d.amount : d?.amount != null ? Number(d.amount) : null,
    date: d?.date ? String(d.date).slice(0, 10) : null,
    merchant: d?.merchant || null,
    note: d?.note || d?.merchant || null,
    ref: d?.ref || null,
    category: d?.category || null,
    from_account: d?.from_account || null,
    to_account: d?.to_account || null,
    evidence: d?.evidence || json?.rawText || "",
    _rawText: json?.rawText || "",
    _model: json?.model || "",
  };

  return normalized;
}
