// api/scan-receipt.js

function extractTextFromResponsesAPI(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const out = Array.isArray(data?.output) ? data.output : [];
  for (const item of out) {
    // responses api มักมี content เป็น array
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (typeof c?.text === "string" && c.text.trim()) return c.text.trim();
      if (typeof c === "string" && c.trim()) return c.trim();
    }
    if (typeof item?.text === "string" && item.text.trim()) return item.text.trim();
  }
  return null;
}

function stripToJsonObject(text) {
  if (!text) return null;

  // remove code fences
  let s = String(text).replace(/```json/gi, "```").replace(/```/g, "").trim();

  // try find first {...}
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) s = s.slice(first, last + 1).trim();

  return s;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "missing_openai_api_key" });

    const { base64, mimeType } = req.body || {};
    if (!base64) return res.status(400).json({ error: "missing_base64" });

    const safeMime = mimeType || "image/jpeg";
    const imageUrl = `data:${safeMime};base64,${base64}`;

    const prompt = `
You will be given an image of a Thai receipt or bank transfer slip.
Extract information and return STRICT JSON only (no markdown, no extra text) with this schema:

{
  "amount": number|null,
  "date": "YYYY-MM-DD"|null,
  "merchant": string,
  "category": "food"|"transport"|"shopping"|"bills"|"health"|"entertainment"|"other",
  "isTransferSlip": boolean
}

Rules:
- If date is Buddhist Era (e.g., 2568), convert to AD (2025).
- amount must be the final total (ยอดรวม/รวมสุทธิ/total) or transfer amount.
- merchant: best guess of store/bank/recipient label, else "".
- isTransferSlip: true if it is a bank transfer/QR transfer slip.
- If uncertain, use null for amount/date.
    `.trim();

    const payload = {
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: imageUrl, detail: "high" },
          ],
        },
      ],
      temperature: 0,
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({
        error: "openai_error",
        status: r.status,
        detail: data,
      });
    }

    const text = extractTextFromResponsesAPI(data);
    const jsonStr = stripToJsonObject(text);
    if (!jsonStr) return res.status(500).json({ error: "no_text_returned", raw: data });

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      return res.status(500).json({ error: "json_parse_failed", text, jsonStr });
    }

    // Normalize output a bit
    const result = {
      amount: typeof parsed.amount === "number" ? parsed.amount : (parsed.amount ? Number(parsed.amount) : null),
      date: typeof parsed.date === "string" ? parsed.date : null,
      merchant: typeof parsed.merchant === "string" ? parsed.merchant : "",
      category: typeof parsed.category === "string" ? parsed.category : "other",
      isTransferSlip: !!parsed.isTransferSlip,
    };

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: "server_exception", message: String(err?.message || err) });
  }
}
