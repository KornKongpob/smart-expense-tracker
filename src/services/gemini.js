// src/services/gemini.js
// ✅ SAFE: calls a server-side endpoint (/api/gemini-scan) so the API key never ships to the browser.
// Optional env: VITE_GEMINI_SCAN_API_URL (default: /api/gemini-scan)

export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = () => {
      const result = String(reader.result || "");
      const parts = result.split(",");
      const base64String = parts[1] || "";
      resolve({
        base64: base64String,
        mimeType: file?.type || "image/jpeg",
        preview: result,
      });
    };

    reader.onerror = (error) => reject(error);
  });
};

async function safeReadJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * callGeminiScan(base64Data, mimeType)
 * -> calls /api/gemini-scan and returns parsed JSON
 */
export const callGeminiScan = async (base64Data, mimeType) => {
  const url = (import.meta.env.VITE_GEMINI_SCAN_API_URL || "/api/gemini-scan").trim();

  const payload = {
    base64: String(base64Data || ""),
    mimeType: String(mimeType || "image/jpeg"),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: (() => {
      const h = { "Content-Type": "application/json" };
      const token = import.meta.env.VITE_SCAN_API_TOKEN || "";
      if (token) h.Authorization = `Bearer ${token}`;
      return h;
    })(),
    body: JSON.stringify(payload),
  });

  const json = await safeReadJson(res);
  if (!res.ok) {
    const msg = json?.message || `API Error: ${res.status}`;
    const e = new Error(msg);
    e.code = json?.code || "gemini_api_error";
    throw e;
  }

  if (!json?.ok) {
    const msg = json?.message || "Gemini scan failed";
    const e = new Error(msg);
    e.code = json?.code || "gemini_scan_failed";
    e.data = json;
    throw e;
  }

  return json.data;
};
