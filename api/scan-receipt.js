// api/scan-receipt.js
import Busboy from "busboy";

const OPENAI_URL = "https://api.openai.com/v1/responses";

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
      limits: { fileSize: maxBytes },
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
  const t = String(text || "").trim();
  if (!t) return null;
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const candidate = t.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // ignore
    }
  }
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function normalizeAccountNo(s) {
  return String(s || "")
    .replace(/\s+/g, "")
    .replace(/[^0-9]/g, "")
    .slice(-16); // เก็บท้ายไว้พอ match
}

async function callOpenAI({ base64, mimeType }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { status: 400, body: { error: "missing_openai_api_key" } };
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const dataUrl = `data:${mimeType || "image/jpeg"};base64,${base64}`;

  const prompt = `
You are a receipt / bank transfer slip parser for an expense tracker.
Return STRICT JSON ONLY (no markdown, no extra text).

Schema:
{
  "kind": "receipt" | "transfer" | "income",
  "amount": number | null,
  "date": "YYYY-MM-DD" | null,
  "merchant": string,
  "category": string,         // either existing id-like (food/transport/...) OR a human category name
  "note": string,
  "ref": string | null,       // transaction reference / slip ref / authorization code
  "payment_method": "cash" | "bank" | "credit_card" | "unknown",
  "from_account_no": string | null,
  "to_account_no": string | null,
  "card_last4": string | null
}

Rules:
- amount = grand total / net paid.
- If date is Buddhist Era (>=2400), convert to AD.
- If bank transfer slip: kind="transfer"
- If salary/receive money slip: kind="income"
- ref: best reference number if present.
- from_account_no / to_account_no: digits only if found; otherwise null.
- card_last4: last 4 digits if present; otherwise null.
- category:
  - If receipt: choose best among (food, transport, shopping, bills, health, entertainment, other) OR return a specific category name from the slip.
  - If transfer: "transfer"
  - If income: "income"
Return JSON only.
`.trim();

  const payload = {
    model,
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
    return { status: 200, body: { error: "parse_failed", rawText: outputText } };
  }

  const amount =
    typeof parsed.amount === "number"
      ? parsed.amount
      : parsed.amount != null
      ? Number(parsed.amount)
      : null;

  const body = {
    kind: String(parsed.kind || "receipt"),
    amount: Number.isFinite(amount) ? amount : null,
    date: parsed.date ?? null,
    merchant: String(parsed.merchant ?? ""),
    category: String(parsed.category ?? "other"),
    note: String(parsed.note ?? ""),
    ref: parsed.ref != null ? String(parsed.ref) : null,
    payment_method: String(parsed.payment_method ?? "unknown"),
    from_account_no: parsed.from_account_no ? normalizeAccountNo(parsed.from_account_no) : null,
    to_account_no: parsed.to_account_no ? normalizeAccountNo(parsed.to_account_no) : null,
    card_last4: parsed.card_last4 ? String(parsed.card_last4).replace(/\D/g, "").slice(-4) : null,
    rawText: outputText,
  };

  return { status: 200, body };
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
