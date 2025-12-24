// api/scan.js
// Vercel Serverless Function: POST /api/scan
// Required env: OPENAI_API_KEY
// Optional env: OPENAI_MODEL (default: gpt-4.1-mini)

const OPENAI_URL = "https://api.openai.com/v1/responses";

function safeJsonParseMaybe(text) {
  const t0 = String(text || "").trim();
  if (!t0) return null;

  const t = t0.replace(/```json/gi, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(t);
  } catch {
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
  const direct = resp?.output_text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const out = resp?.output;
  if (Array.isArray(out)) {
    const lines = [];
    for (const item of out) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          const txt = c?.text;
          if (typeof txt === "string" && txt.trim()) lines.push(txt.trim());
        }
      }
      if (typeof item?.text === "string" && item.text.trim()) lines.push(item.text.trim());
    }
    if (lines.length) return lines.join("\n");
  }

  const fallback =
    resp?.output?.[0]?.content
      ?.map((c) => c?.text)
      .filter(Boolean)
      .join("\n") || "";

  return String(fallback || "").trim();
}

function toArabicDigits(s) {
  const th = "๐๑๒๓๔๕๖๗๘๙";
  return String(s || "").replace(/[๐-๙]/g, (ch) => {
    const idx = th.indexOf(ch);
    return idx >= 0 ? String(idx) : ch;
  });
}

function normalizeDigits(s) {
  return toArabicDigits(String(s || "")).replace(/[^\d]/g, "");
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
  const cleaned = toArabicDigits(s).replace(/[฿$, ]+/g, "").replace(/,/g, "");
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
    commute: "transport",
    groceries: "shopping",
    supermarket: "shopping",
    medicine: "health",
    pharmacy: "health",
    movie: "entertainment",
    cinema: "entertainment",
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
      "transit",
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
      "noodles",
      "rice",
      "chicken",
      "pork",
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
      "ปลา",
      "ส้มตำ",
      "บะหมี่",
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
      "billing",
      "invoice",
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
      "med",
      "vitamin",
      "health",
      "โรงพยาบาล",
      "คลินิก",
      "ร้านยา",
      "ยา",
      "เวชภัณฑ์",
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
      "entertain",
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
      "7 eleven",
      "seven eleven",
      "lotus",
      "tesco",
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

function normalizeScanResult(parsed, rawText) {
  const tx_type = String(parsed?.tx_type || "").toLowerCase();
  const safeType = tx_type === "income" || tx_type === "transfer" ? tx_type : "expense";

  const amount = typeof parsed?.amount === "number" ? parsed.amount : parsed?.amount != null ? Number(parsed.amount) : null;

  const merchant = parsed?.merchant != null ? String(parsed.merchant) : null;
  const note = parsed?.note != null ? String(parsed.note) : merchant != null ? String(merchant) : null;

  const items = normalizeItems(parsed?.items ?? parsed?.line_items ?? parsed?.lines ?? null);

  let category =
    normalizeCategoryKey(parsed?.category_key) ||
    normalizeCategoryKey(parsed?.category) ||
    (safeType === "transfer" ? "transfer" : null);

  if (safeType !== "transfer") {
    const fromItems = pickDominantCategoryFromItems(items);
    const fromText = inferCategoryFromText(`${merchant || ""} ${note || ""} ${rawText || ""}`);

    if (!category) category = fromItems || fromText || "other";
    if (category === "other") category = fromItems || fromText || "other";
  } else {
    category = "transfer";
  }

  return {
    tx_type: safeType,
    amount: Number.isFinite(amount) ? amount : null,
    date: parsed?.date ? String(parsed.date).slice(0, 10) : null,
    merchant,
    note,
    ref: parsed?.ref != null && String(parsed.ref).trim() ? String(parsed.ref).trim() : null,

    category,
    items,

    from_account: parsed?.from_account != null && String(parsed.from_account).trim() ? normalizeDigits(parsed.from_account) : null,
    to_account: parsed?.to_account != null && String(parsed.to_account).trim() ? normalizeDigits(parsed.to_account) : null,

    evidence:
      parsed?.evidence != null
        ? String(parsed.evidence).slice(0, 220)
        : rawText
        ? String(rawText).slice(0, 220)
        : null,
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
      "You are an OCR+parser for Thai receipts and bank/payment slips used in a personal expense tracker.\n" +
      "Return STRICT JSON ONLY. No markdown. No extra text.\n" +
      "Allowed category_key values:\n" +
      "- expense: food, transport, shopping, bills, health, entertainment, other\n" +
      "- income: salary, bonus, investment, refund, other\n" +
      "- transfer: transfer\n" +
      "Schema:\n" +
      "{\n" +
      '  "tx_type": "expense"|"income"|"transfer",\n' +
      '  "amount": number|null,\n' +
      '  "date": "YYYY-MM-DD"|null,\n' +
      '  "merchant": string|null,\n' +
      '  "note": string|null,\n' +
      '  "ref": string|null,\n' +
      '  "category_key": string|null,\n' +
      '  "items": [\n' +
      '    { "name": string, "qty": number|null, "unit_price": number|null, "total": number|null, "category_key": string|null }\n' +
      "  ]|[],\n" +
      '  "from_account": string|null,\n' +
      '  "to_account": string|null,\n' +
      '  "evidence": string|null\n' +
      "}\n" +
      "Rules:\n" +
      "- If unsure, use null.\n" +
      "- tx_type: use 'transfer' only if clearly a transfer between accounts.\n" +
      "- amount: grand total paid.\n" +
      "- If receipt has multiple line items, fill items[] with as many as you can (max 30). If none, use [].\n" +
      "- For each item.category_key: best guess from item name.\n" +
      "- from_account / to_account: extract last 4-6 digits of account/card if present (digits only; Thai digits ok).\n" +
      "- evidence: short key lines used (<= 220 chars).\n";

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

    const text = extractResponsesOutputText(data);
    const parsed = safeJsonParseMaybe(text);

    if (!parsed || typeof parsed !== "object") {
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
