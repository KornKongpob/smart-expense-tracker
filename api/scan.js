// api/scan.js
// Vercel Serverless Function: POST /api/scan
// Required env: OPENAI_API_KEY
// Optional env: OPENAI_MODEL (default: gpt-4.1-mini)

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, code: "method_not_allowed" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        code: "missing_openai_api_key",
        message: "OPENAI_API_KEY is not set on server",
      });
    }

    // Guard: body may be string or object depending on runtime
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    body = body || {};

    // Accept: { imageDataUrl } OR { imageBase64, mimeType } OR { imageUrl }
    const imageUrl = String(body.imageUrl || "").trim();
    let imageDataUrl = String(body.imageDataUrl || "").trim();

    const imageBase64 = String(body.imageBase64 || "").trim();
    const mimeType = String(body.mimeType || "image/jpeg").trim();

    if (!imageDataUrl && imageBase64) {
      imageDataUrl = `data:${mimeType};base64,${imageBase64}`;
    }

    const finalImage = imageUrl || imageDataUrl;
    if (!finalImage) {
      return res.status(400).json({
        ok: false,
        code: "missing_image",
        message: "Provide imageDataUrl or imageBase64 or imageUrl",
      });
    }

    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

    const prompt =
      "Extract receipt/slip info from the image. Return ONLY a JSON object (no markdown, no extra text).\n" +
      "Schema:\n" +
      "{\n" +
      '  "tx_type": "expense"|"income"|"transfer",\n' +
      '  "amount": number|null,\n' +
      '  "date": "YYYY-MM-DD"|null,\n' +
      '  "merchant": string|null,\n' +
      '  "note": string|null,\n' +
      '  "ref": string|null,\n' +
      '  "category": string|null,\n' +
      '  "from_account": string|null,\n' +
      '  "to_account": string|null,\n' +
      '  "evidence": string|null\n' +
      "}\n" +
      "Rules:\n" +
      "- If unsure, use null.\n" +
      "- tx_type: transfer only if clearly indicates transfer between accounts.\n" +
      "- evidence: short reason/fields used (<= 180 chars).";

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: finalImage },
            ],
          },
        ],
      }),
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({
        ok: false,
        code: "openai_error",
        message: data?.error?.message || "OpenAI request failed",
        raw: data,
      });
    }

    // Extract text output
    let text = data.output_text;
    if (!text) {
      const msg = (data.output || []).find((o) => o && o.type === "message");
      if (msg?.content?.length) {
        text = msg.content
          .map((p) => (p?.type === "output_text" ? p.text : p?.text))
          .filter(Boolean)
          .join("");
      }
    }

    text = String(text || "").trim();

    // Parse JSON safely
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          parsed = JSON.parse(text.slice(start, end + 1));
        } catch {
          parsed = null;
        }
      }
    }

    return res.status(200).json({
      ok: true,
      data: parsed,
      rawText: text,
      model,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      code: "server_error",
      message: String(err?.message || err),
    });
  }
}
