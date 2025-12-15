// src/services/scanOpenAI.js

export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = () => {
      const base64String = String(reader.result).split(",")[1];
      resolve({
        base64: base64String,
        mimeType: file.type,
        preview: reader.result,
      });
    };

    reader.onerror = (error) => reject(error);
  });
};

export async function callOpenAIScan(base64, mimeType) {
  // ถ้าอยากทดสอบจากเครื่องตอน dev โดยไม่ใช้ vercel dev:
  // ตั้ง VITE_SCAN_API_BASE เป็น URL โปรดักชันของคุณ เช่น https://xxx.vercel.app
  const base = import.meta.env.VITE_SCAN_API_BASE || "";
  const url = `${base}/api/scan-receipt`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64, mimeType }),
  });

  if (!resp.ok) {
    throw new Error(`Scan API error: ${resp.status}`);
  }
  return resp.json();
}
