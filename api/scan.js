// api/scan.js
// Vercel Serverless Function: POST /api/scan
// Required env: OPENAI_API_KEY
// Optional env: OPENAI_MODEL (default: gpt-4.1-mini)

const OPENAI_URL = "https://api.openai.com/v1/responses";

function safeJsonParseMaybe(text) {
  const t0 = String(text || "").trim();
  if (!t0) return null;

  // strip ```json fences if model accidentally returns them
  const t = t0.replace(/```json/gi, "").replace(/```/g, "").trim();

  // try whole string first
  try {
    return JSON.parse(t);
  } catch {
    // try extracting the first {...} block
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function extractResponsesOutputText(resp) {
  // 1) Most common
  const direct = resp?.output_text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  // 2) Iterate output array
  const out = resp?.output;
  if (Array.isArray(out)) {
    const lines = [];
    for (const item of out) {
      // Many responses come as { type: "message", content: [{ type: "...", text: "..." }] }
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          const txt = c?.text;
          if (typeof txt === "string" && txt.trim()) lines.push(txt.trim());
        }
      }

      // Some variants
      if (typeof item?.text === "string" && item.text.trim()) lines.push(item.text.trim());
    }
    if (lines.length) return lines.join("\n");
  }

  // 3) Fallback
  const fallback =
    resp?.output?.[0]?.content
      ?.map((c) => c?.text)
      .filter(Boolean)
      .join("\n") || "";

  return String(fallback || "").trim();
}

function normalizeDigits(s) {
  return String(s || "").replace(/[^\d]/g, "");
}

function normalizeScanResult(parsed, rawText) {
  // Ensure minimal crash-proof shape for the client
  const tx_type = String(parsed?.tx_type || "").toLowerCase();
  const safeType = tx_type === "income" || tx_type === "transfer" ? tx_type : "expense";

  const amount =
    typeof parsed?.amount === "number"
      ? parsed.amount
      : parsed?.amount != null
      ? Number(parsed.amount)
      : null;

  return {
    tx_type: safeType,
    amount: Number.isFinite(amount) ? amount : null,
    date: parsed?.date ? String(parsed.date).slice(0, 10) : null,
    merchant: parsed?.merchant != null ? String(parsed.merchant) : null,
    note: parsed?.note != null ? String(parsed.note) : parsed?.merchant != null ? String(parsed.merchant) : null,
    ref: parsed?.ref != null && String(parsed.ref).trim() ? String(parsed.ref).trim() : null,
    category: parsed?.category != null && String(parsed.category).trim() ? String(parsed.category).trim() : null,
    from_account:
      parsed?.from_account != null && String(parsed.from_account).trim()
        ? normalizeDigits(parsed.from_account)
        : null,
    to_account:
      parsed?.to_account != null && String(parsed.to_account).trim() ? normalizeDigits(parsed.to_account) : null,
    evidence: parsed?.evidence != null ? String(parsed.evidence).slice(0, 180) : rawText ? String(rawText).slice(0, 180) : null,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, code: "method_not_allowed", message: "Use POST" });
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

    // More explicit prompt = ลดโอกาสโมเดลพ่นข้อความเกินมา
    const prompt =
      "You are an OCR+parser for receipts and bank slips used in a personal expense tracker.\n" +
      "Return STRICT JSON ONLY. No markdown. No extra text.\n" +
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
      "- tx_type: use 'transfer' only if clearly a transfer between accounts.\n" +
      "- amount: grand total paid.\n" +
      "- evidence: short key lines used (<= 180 chars).\n";

    const r = await fetch(OPENAI_URL, {
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

    const data = await r.json().catch(() => null);

    if (!r.ok) {
      return res.status(r.status).json({
        ok: false,
        code: "openai_error",
        message: data?.error?.message || "OpenAI request failed",
        raw: data || null,
      });
    }

    // Extract text output robustly
    const text = extractResponsesOutputText(data);

    const parsed = safeJsonParseMaybe(text);
    if (!parsed || typeof parsed !== "object") {
      // Important: still return rawText for debug
      return res.status(200).json({
        ok: false,
        code: "parse_failed",
        message: "Model output is not valid JSON",
        rawText: text,
        model,
      });
    }

    const normalized = normalizeScanResult(parsed, text);

    return res.status(200).json({
      ok: true,
      data: normalized,
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
