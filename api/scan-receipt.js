// api/scan-receipt.js
import Busboy from "busboy";

const OPENAI_URL = "https://api.openai.com/v1/responses";

export const config = { api: { bodyParser: false } };

function getContentType(req) {
  return String(req.headers?.["content-type"] || "").toLowerCase();
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;

  const buf = await readRawBody(req);
  const txt = buf.toString("utf-8").trim();
  if (!txt) return {};
  try {
    return JSON.parse(txt);
  } catch {
    return {};
  }
}

function parseMultipart(req, { maxBytes = 10 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err, val) => {
      if (done) return;
      done = true;
      if (err) reject(err);
      else resolve(val);
    };

    const bb = Busboy({
      headers: req.headers,
      limits: { fileSize: maxBytes, files: 1 },
    });

    let fileBuffer = null;
    let mimeType = "";
    let filename = "";

    bb.on("file", (fieldname, file, info) => {
      const chunks = [];
      filename = info?.filename || "";
      mimeType = info?.mimeType || info?.mimetype || "";

      file.on("data", (d) => chunks.push(d));
      file.on("limit", () => finish(new Error("file_too_large")));
      file.on("end", () => {
        try {
          fileBuffer = Buffer.concat(chunks);
        } catch (e) {
          finish(e);
        }
      });
      file.on("error", (e) => finish(e));
    });

    bb.on("error", (e) => finish(e));
    bb.on("finish", () => finish(null, { fileBuffer, mimeType, filename }));

    try {
      req.pipe(bb);
    } catch (e) {
      finish(e);
    }
  });
}

function safeJsonParseMaybe(text) {
  const t0 = String(text || "").trim();
  if (!t0) return null;

  const t = t0.replace(/```json/gi, "").replace(/```/g, "").trim();

  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const candidate = t.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function normalizeDigits(s) {
  return String(s || "").replace(/[^\d]/g, "");
}

function parseDataUrlMaybe(dataUrl) {
  const s = String(dataUrl || "").trim();
  if (!s.startsWith("data:")) return null;

  const comma = s.indexOf(",");
  if (comma < 0) return null;

  const meta = s.slice(5, comma);
  const body = s.slice(comma + 1);

  const parts = meta.split(";");
  const mimeType = parts[0] || "image/jpeg";
  const isBase64 = parts.includes("base64");
  if (!isBase64) return null;

  return { mimeType, base64: body };
}

function extractResponsesOutputText(resp) {
  const direct = resp?.output_text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const out = resp?.output;
  if (Array.isArray(out)) {
    const lines = [];
    for (const item of out) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          const t = c?.text;
          if (typeof t === "string" && t.trim()) lines.push(t.trim());
        }
      }
      if (typeof item?.text === "string" && item.text.trim()) lines.push(item.text.trim());
    }
    if (lines.length) return lines.join("\n");
  }

  const maybe =
    resp?.output?.[0]?.content
      ?.map((c) => c?.text)
      .filter(Boolean)
      .join("\n") || "";

  return String(maybe || "").trim();
}

async function callOpenAI({ base64, mimeType }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      status: 400,
      body: { ok: false, code: "missing_openai_api_key", message: "OPENAI_API_KEY is not set" },
    };
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const dataUrl = `data:${mimeType || "image/jpeg"};base64,${base64}`;

  const prompt =
    `You are a receipt/bank-slip parser for a personal expense tracker.\n` +
    `Return STRICT JSON ONLY (no markdown, no explanation) with this schema:\n` +
    `{\n` +
    `  "tx_type": "expense"|"income"|"transfer",\n` +
    `  "amount": number|null,\n` +
    `  "date": "YYYY-MM-DD"|null,\n` +
    `  "merchant": string|null,\n` +
    `  "category": string|null,\n` +
    `  "note": string|null,\n` +
    `  "ref": string|null,\n` +
    `  "from_account": string|null,\n` +
    `  "to_account": string|null,\n` +
    `  "items": [{"name": string, "price": number|null}]|[],\n` +
    `  "keywords": string[]|[],\n` +
    `  "evidence": string|null\n` +
    `}\n` +
    `Rules:\n` +
    `- amount = grand total paid (not VAT line).\n` +
    `- If date is Buddhist Era (>=2400), convert to AD.\n` +
    `- If it's a bank transfer slip OR payment slip with ref/trx id -> tx_type must be "transfer".\n` +
    `- category: choose best among {food, transport, shopping, bills, health, entertainment, salary, bonus, investment, refund, other, transfer}.\n` +
    `- items: extract up to 10-15 meaningful item/service lines (name + price if present).\n` +
    `- keywords: extract up to 8-12 short keywords from items/merchant/note (Thai/English).\n` +
    `- ref: extract transaction reference / TRX / Ref / เลขที่รายการ if present, else null.\n` +
    `- from_account / to_account: extract last 4-6 digits of account/card if present (digits only). else null.\n` +
    `- evidence: short string (<=200 chars) containing the key lines you used.\n` +
    `Return JSON only.\n`;

  const payload = {
    model,
    temperature: 0,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: dataUrl },
        ],
      },
    ],
  };

  const r = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = await r.json().catch(() => null);

  if (!r.ok) {
    return {
      status: r.status,
      body: {
        ok: false,
        code: "openai_error",
        message: "OpenAI request failed",
        raw: json || null,
        model,
      },
    };
  }

  const outputText = extractResponsesOutputText(json);
  const parsed = safeJsonParseMaybe(outputText);

  if (!parsed) {
    return {
      status: 200,
      body: {
        ok: false,
        code: "parse_failed",
        message: "Model output is not valid JSON",
        rawText: outputText,
        model,
      },
    };
  }

  const amount =
    typeof parsed.amount === "number"
      ? parsed.amount
      : parsed.amount != null
      ? Number(String(parsed.amount).replace(/[, ]+/g, ""))
      : null;

  const tx_type = String(parsed.tx_type || "").toLowerCase();
  const safeType = tx_type === "income" || tx_type === "transfer" ? tx_type : "expense";

  const items = Array.isArray(parsed?.items)
    ? parsed.items
        .map((it) => {
          if (!it || typeof it !== "object") return null;
          const name = it.name != null ? String(it.name).trim() : "";
          const price =
            typeof it.price === "number" ? it.price : it.price != null ? Number(String(it.price).replace(/[, ]+/g, "")) : null;
          if (!name) return null;
          return { name, price: Number.isFinite(price) ? price : null };
        })
        .filter(Boolean)
        .slice(0, 15)
    : [];

  const keywords = Array.isArray(parsed?.keywords)
    ? parsed.keywords
        .map((k) => String(k || "").trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 15)
    : [];

  const normalized = {
    tx_type: safeType,
    amount: Number.isFinite(amount) ? amount : null,
    date: parsed.date ?? null,
    merchant: parsed.merchant != null ? String(parsed.merchant) : null,
    category: parsed.category != null ? String(parsed.category) : "other",
    note: parsed.note != null ? String(parsed.note) : "",
    ref: parsed.ref ? String(parsed.ref) : null,
    from_account: parsed.from_account ? normalizeDigits(parsed.from_account) : null,
    to_account: parsed.to_account ? normalizeDigits(parsed.to_account) : null,
    evidence: String(parsed.evidence ?? "").slice(0, 200),
    items,
    keywords,
  };

  return {
    status: 200,
    body: { ok: true, data: normalized, rawText: outputText, model },
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).json({ ok: false, code: "method_not_allowed", message: "Use POST" });
      return;
    }

    const ct = getContentType(req);

    if (ct.includes("multipart/form-data")) {
      const { fileBuffer, mimeType } = await parseMultipart(req);
      if (!fileBuffer || fileBuffer.length === 0) {
        res.status(400).json({ ok: false, code: "missing_file", message: "No file uploaded" });
        return;
      }

      const base64 = fileBuffer.toString("base64");
      const out = await callOpenAI({ base64, mimeType: mimeType || "image/jpeg" });
      res.status(out.status).json(out.body);
      return;
    }

    const body = await readJson(req);

    const imageDataUrl = String(body?.imageDataUrl || "").trim();
    const parsedDataUrl = imageDataUrl ? parseDataUrlMaybe(imageDataUrl) : null;

    const base64 = parsedDataUrl?.base64 || body?.base64 || body?.imageBase64 || null;
    const mimeType = parsedDataUrl?.mimeType || body?.mimeType || "image/jpeg";

    if (!base64) {
      res.status(400).json({
        ok: false,
        code: "missing_base64",
        message: "Provide multipart file, or JSON { base64, mimeType }, or { imageDataUrl }",
      });
      return;
    }

    const out = await callOpenAI({ base64, mimeType });
    res.status(out.status).json(out.body);
  } catch (e) {
    const msg = String(e?.message || e);

    if (msg === "file_too_large") {
      res.status(413).json({ ok: false, code: "file_too_large", message: "File too large" });
      return;
    }

    res.status(500).json({ ok: false, code: "server_error", message: msg });
  }
}
