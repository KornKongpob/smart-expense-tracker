// src/services/scanOpenAI.js
export async function scanReceiptOpenAI(file, { onStatus } = {}) {
  onStatus?.("Uploading...");

  const form = new FormData();
  form.append("file", file);

  const res = await fetch("/api/scan-receipt", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`scan_failed_${res.status}:${txt}`);
  }

  onStatus?.("Parsing...");
  const data = await res.json();

  // expected: { amount, date, merchant, category }
  return data;
}
