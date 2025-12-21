// api/scan-receipt.js
import Busboy from "busboy";

const OPENAI_URL = "https://api.openai.com/v1/responses";

// NOTE: harmless for Vercel Functions, required for Next API routes
export const config = { api: { bodyParser: false } };

function getContentType(req) {
  return String(req.headers["content-type"] || "").toLowerCase();
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
      file.on("limit", () => reject(new Error("file_too_large")));
      file.on("end", () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    bb.on("error", reject);
    bb.on("finish", () => resolve({ fileBuffer, mimeType, filename }));
    req.pipe(bb);
  });
}

function safeJsonParseMaybe(text) {
  const t0 = String(text || "").trim();
  if (!t0) return null;

  const t = t0
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const candidate = t.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // fallthrough
    }
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

async function callOpenAI({ base64, mimeType }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { status: 400, body: { error: "missing_openai_api_key" } };
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
    `  "merchant": string,\n` +
    `  "category": string,\n` +
    `  "note": string,\n` +
    `  "ref": string|null,\n` +
    `  "from_account": string|null,\n` +
    `  "to_account": string|null,\n` +
    `  "evidence": string\n` +
    `}\n` +
    `Rules:\n` +
    `- amount = grand total paid (not VAT line).\n` +
    `- If date is Buddhist Era (>=2400), convert to AD.\n` +
    `- If it's a bank transfer slip OR payment slip with ref/trx id -> tx_type must be "transfer".\n` +
    `- category: use best guess, examples: food, transport, shopping, bills, health, entertainment, salary, bonus, other, transfer.\n` +
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
      body: { error: "openai_error", detail: json || null },
    };
  }

  const outputText =
    json?.output_text ||
    json?.output?.[0]?.content?.map((c) => c?.text).filter(Boolean).join("\n") ||
    "";

  const parsed = safeJsonParseMaybe(outputText);
  if (!parsed) {
    return {
      status: 200,
      body: { error: "parse_failed", rawText: outputText },
    };
  }

  const amount =
    typeof parsed.amount === "number"
      ? parsed.amount
      : parsed.amount != null
      ? Number(parsed.amount)
      : null;

  const tx_type = String(parsed.tx_type || "").toLowerCase();
  const safeType = tx_type === "income" || tx_type === "transfer" ? tx_type : "expense";

  return {
    status: 200,
    body: {
      tx_type: safeType,
      amount: Number.isFinite(amount) ? amount : null,
      date: parsed.date ?? null,
      merchant: String(parsed.merchant ?? ""),
      category: String(parsed.category ?? "other"),
      note: String(parsed.note ?? ""),
      ref: parsed.ref ? String(parsed.ref) : null,
      from_account: parsed.from_account ? normalizeDigits(parsed.from_account) : null,
      to_account: parsed.to_account ? normalizeDigits(parsed.to_account) : null,
      evidence: String(parsed.evidence ?? "").slice(0, 200),
    },
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }

    const ct = getContentType(req);

    // 1) multipart/form-data
    if (ct.includes("multipart/form-data")) {
      const { fileBuffer, mimeType } = await parseMultipart(req);
      if (!fileBuffer || fileBuffer.length === 0) {
        res.status(400).json({ error: "missing_file" });
        return;
      }

      const base64 = fileBuffer.toString("base64");
      const out = await callOpenAI({ base64, mimeType: mimeType || "image/jpeg" });
      res.status(out.status).json(out.body);
      return;
    }

    // 2) JSON: { base64, mimeType }
    const body = await readJson(req);
    const base64 = body?.base64;
    const mimeType = body?.mimeType || "image/jpeg";

    if (!base64) {
      res.status(400).json({ error: "missing_base64" });
      return;
    }

    const out = await callOpenAI({ base64, mimeType });
    res.status(out.status).json(out.body);
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg === "file_too_large") {
      res.status(413).json({ error: "file_too_large" });
      return;
    }
    res.status(500).json({ error: "server_error", detail: msg });
  }
}
