// src/services/gemini.js

// ✅ ใส่ API Key ของคุณที่นี่ (หรือทำเป็น env ก็ได้)
const apiKey = ""; // <-- ใส่ key ของคุณ

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

export const callGeminiScan = async (base64Data, mimeType) => {
  if (!apiKey) throw new Error("API Key Missing");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  const prompt = `
Analyze receipt. Return JSON only:
{"amount": number, "date": "YYYY-MM-DD", "merchant": string, "category": string}.
Category options: food, transport, shopping, bills, health, entertainment, other.
If year is BE (e.g. 2567), convert to AD (2024).
`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64Data } },
        ],
      },
    ],
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) throw new Error("No text generated");

  // Gemini มักครอบด้วย ```json ... ``` เลย strip ออกก่อน
  const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();

  return JSON.parse(cleaned);
};
