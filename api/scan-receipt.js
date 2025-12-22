// api/scan-receipt.js
import Busboy from "busboy";

const OPENAI_URL = "https://api.openai.com/v1/responses";

// NOTE: harmless for Vercel Functions, required for Next API routes
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

  // try whole string first
  try {
    return JSON.parse(t);
  } catch {
    // try extracting object
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const candidate = t.slice(start, end + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
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

function safeString(v) {
  if (v == null) return "";
  return String(v).trim();
}

function safeNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const cleaned = s.replace(/[฿$, ]+/g, "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizeCategoryKey(v) {
  const s = safeString(v).toLowerCase();
  if (!s) return null;

  const allowed = new Set([
    "food",
    "transport",
    "shopping",
    "bills",
    "health",
    "entertainment",
    "salary",
    "bonus",
    "investment",
    "refund",
    "other",
    "transfer",
  ]);
  if (allowed.has(s)) return s;

  const alias = {
    utilities: "bills",
    bill: "bills",
    gas: "transport",
    fuel: "transport",
    petrol: "transport",
    diesel: "transport",
    groceries: "shopping",
    supermarket: "shopping",
    pharmacy: "health",
    medicine: "health",
    cinema: "entertainment",
    movie: "entertainment",
  };
  if (alias[s]) return alias[s];

  return null;
}

function inferCategoryFromText(text) {
  const t = safeString(text).toLowerCase();
  if (!t) return null;

  const has = (arr) => arr.some((k) => t.includes(k));

  if (
    has([
      "fuel",
      "gas",
      "petrol",
      "diesel",
      "oil",
      "shell",
      "ptt",
      "esso",
      "caltex",
      "bangchak",
      "parking",
      "toll",
      "grab",
      "bolt",
      "taxi",
      "bts",
      "mrt",
      "bus",
      "train",
      "น้ำมัน",
      "ปั๊ม",
      "เติมน้ำมัน",
      "ทางด่วน",
      "รถไฟ",
      "รถเมล์",
      "แท็กซี่",
      "ที่จอดรถ",
    ])
  )
    return "transport";

  if (
    has([
      "restaurant",
      "cafe",
      "coffee",
      "tea",
      "food",
      "noodle",
      "rice",
      "chicken",
      "dessert",
      "bakery",
      "kfc",
      "mcdonald",
      "starbucks",
      "grabfood",
      "line man",
      "lineman",
      "อาหาร",
      "ก๋วยเตี๋ยว",
      "ข้าว",
      "กาแฟ",
      "ชา",
      "ไก่",
      "หมู",
      "ร้านอาหาร",
      "ของกิน",
    ])
  )
    return "food";

  if (
    has([
      "electric",
      "electricity",
      "water bill",
      "internet",
      "phone",
      "mobile",
      "utility",
      "utilities",
      "ais",
      "dtac",
      "true",
      "invoice",
      "billing",
      "ค่าไฟ",
      "ค่าน้ำ",
      "โทรศัพท์",
      "อินเทอร์เน็ต",
      "บิล",
      "ชำระบิล",
    ])
  )
    return "bills";

  if (
    has([
      "hospital",
      "clinic",
      "pharmacy",
      "drug",
      "medicine",
      "vitamin",
      "health",
      "โรงพยาบาล",
      "คลินิก",
      "ร้านยา",
      "ยา",
    ])
  )
    return "health";

  if (
    has([
      "movie",
      "cinema",
      "netflix",
      "spotify",
      "youtube",
      "ticket",
      "concert",
      "game",
      "บันเทิง",
      "ภาพยนตร์",
      "ตั๋ว",
      "คอนเสิร์ต",
      "เกม",
    ])
  )
    return "entertainment";

  if (
    has([
      "shopping",
      "store",
      "mall",
      "lazada",
      "shopee",
      "amazon",
      "7-eleven",
      "seven eleven",
      "lotus",
      "big c",
      "makro",
      "supermarket",
      "market",
      "shop",
      "ซื้อของ",
      "ช้อป",
      "ร้านค้า",
      "ตลาด",
      "เซเว่น",
      "โลตัส",
      "บิ๊กซี",
      "แม็คโคร",
    ])
  )
    return "shopping";

  if (has(["salary", "payroll", "เงินเดือน"])) return "salary";
  if (has(["bonus", "โบนัส"])) return "bonus";
  if (has(["refund", "เงินคืน", "คืนเงิน"])) return "refund";
  if (has(["investment", "ลงทุน"])) return "investment";

  return null;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];

  for (const it of items) {
    if (!it || typeof it !== "object") continue;

    const name = safeString(it.name ?? it.title ?? it.desc ?? it.description ?? it.item ?? it.product);
    const qty = safeNumber(it.qty ?? it.quantity);
    const unit_price = safeNumber(it.unit_price ?? it.unitPrice ?? it.price);
    const total = safeNumber(it.total ?? it.amount ?? it.line_total ?? it.lineTotal);

    const cat = normalizeCategoryKey(it.category_key ?? it.category) || inferCategoryFromText(name) || null;

    let finalTotal = total;
    if (finalTotal == null && qty != null && unit_price != null) finalTotal = qty * unit_price;

    if (!name && finalTotal == null) continue;

    out.push({
      name: name || "",
      qty: qty != null ? qty : null,
      unit_price: unit_price != null ? unit_price : null,
      total: finalTotal != null ? finalTotal : null,
      category_key: cat,
    });

    if (out.length >= 40) break;
  }

  return out;
}

function pickDominantCategoryFromItems(items) {
  if (!Array.isArray(items) || !items.length) return null;

  const score = new Map();
  for (const it of items) {
    const k = normalizeCategoryKey(it?.category_key ?? it?.category);
    if (!k) continue;
    const w = safeNumber(it?.total) ?? safeNumber(it?.amount) ?? 1;
    score.set(k, (score.get(k) || 0) + (w || 1));
  }

  let best = null;
  let bestV = -1;
  for (const [k, v] of score.entries()) {
    if (v > bestV) {
      bestV = v;
      best = k;
    }
  }
  return best;
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
    `Return STRICT JSON ONLY (no markdown, no explanation).\n` +
    `Allowed category_key values:\n` +
    `- expense: food, transport, shopping, bills, health, entertainment, other\n` +
    `- income: salary, bonus, investment, refund, other\n` +
    `- transfer: transfer\n` +
    `Schema:\n` +
    `{\n` +
    `  "tx_type": "expense"|"income"|"transfer",\n` +
    `  "amount": number|null,\n` +
    `  "date": "YYYY-MM-DD"|null,\n` +
    `  "merchant": string|null,\n` +
    `  "note": string|null,\n` +
    `  "ref": string|null,\n` +
    `  "category_key": string|null,\n` +
    `  "items": [\n` +
    `    { "name": string, "qty": number|null, "unit_price": number|null, "total": number|null, "category_key": string|null }\n` +
    `  ]|[],\n` +
    `  "from_account": string|null,\n` +
    `  "to_account": string|null,\n` +
    `  "evidence": string|null\n` +
    `}\n` +
    `Rules:\n` +
    `- amount = grand total paid (not VAT line).\n` +
    `- If date is Buddhist Era (>=2400), convert to AD.\n` +
    `- If it's a bank transfer slip OR payment slip with ref/trx id -> tx_type must be "transfer".\n` +
    `- If receipt has multiple items, fill items[] with as many as you can (max 30), else [].\n` +
    `- For each item.category_key: best guess from item name.\n` +
    `- ref: extract transaction reference / TRX / Ref / เลขที่รายการ if present, else null.\n` +
    `- from_account / to_account: extract last 4-6 digits of account/card if present (digits only). else null.\n` +
    `- evidence: short string (<=220 chars) containing the key lines you used.\n`;

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

  const tx_type = String(parsed.tx_type || "").toLowerCase();
  const safeType = tx_type === "income" || tx_type === "transfer" ? tx_type : "expense";

  const amount =
    typeof parsed.amount === "number" ? parsed.amount : parsed.amount != null ? Number(parsed.amount) : null;

  const merchant = parsed?.merchant != null ? String(parsed.merchant) : null;
  const note = parsed?.note != null ? String(parsed.note) : merchant != null ? String(merchant) : null;

  const items = normalizeItems(parsed?.items ?? parsed?.line_items ?? parsed?.lines ?? null);

  let category =
    normalizeCategoryKey(parsed?.category_key) ||
    normalizeCategoryKey(parsed?.category) ||
    (safeType === "transfer" ? "transfer" : null);

  if (safeType !== "transfer") {
    const fromItems = pickDominantCategoryFromItems(items);
    const fromText = inferCategoryFromText(`${merchant || ""} ${note || ""} ${outputText || ""}`);

    if (!category) category = fromItems || fromText || "other";
    if (category === "other") category = fromItems || fromText || "other";
  } else {
    category = "transfer";
  }

  const normalized = {
    tx_type: safeType,
    amount: Number.isFinite(amount) ? amount : null,
    date: parsed.date ? String(parsed.date).slice(0, 10) : null,
    merchant,
    note,
    ref: parsed.ref ? String(parsed.ref).trim() : null,

    // ✅ main category key
    category,

    // ✅ multi-line items
    items,

    from_account: parsed.from_account ? normalizeDigits(parsed.from_account) : null,
    to_account: parsed.to_account ? normalizeDigits(parsed.to_account) : null,
    evidence: String(parsed.evidence ?? outputText ?? "").slice(0, 220),
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

    // 1) multipart/form-data
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

    // 2) JSON: accept { base64, mimeType } OR { imageDataUrl }
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
