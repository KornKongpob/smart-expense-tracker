// src/services/scanOpenAI.js

export async function scanReceiptOpenAI(file, { onStatus } = {}) {
  onStatus?.("Uploading...");

  const form = new FormData();
  form.append("file", file);

  const res = await fetch("/api/scan-receipt", {
    method: "POST",
    body: form,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const detail = data ? JSON.stringify(data) : "";
    throw new Error(`scan_failed_${res.status}:${detail}`);
  }

  onStatus?.("Parsing...");
  return data;
}

export async function scanManyReceiptsOpenAI(files = [], { onProgress } = {}) {
  const out = [];
  for (let i = 0; i < files.length; i++) {
    onProgress?.({ index: i, total: files.length, status: "Scanning..." });
    const r = await scanReceiptOpenAI(files[i], {
      onStatus: (s) => onProgress?.({ index: i, total: files.length, status: s }),
    });
    out.push(r);
  }
  onProgress?.({ index: files.length, total: files.length, status: "" });
  return out;
}
