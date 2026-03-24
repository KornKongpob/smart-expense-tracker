const ALLOWED_CATEGORY_KEYS = new Set([
  "food",
  "drinks",
  "groceries",
  "transport",
  "fuel",
  "bills",
  "rent",
  "shopping",
  "coffee",
  "dining",
  "entertainment",
  "travel",
  "health",
  "fitness",
  "beauty",
  "pets",
  "kids",
  "home",
  "education",
  "work",
  "phone_internet",
  "subscriptions",
  "fees",
  "insurance",
  "donation",
  "gift",
  "other",
  "mixed",
  "salary",
  "bonus",
  "freelance",
  "business",
  "investment",
  "interest",
  "dividend",
  "refund",
  "gift_income",
  "other_income",
  "transfer",
]);

const CATEGORY_ALIASES = {
  utilities: "bills",
  utility: "bills",
  bill: "bills",
  gas: "fuel",
  petrol: "fuel",
  diesel: "fuel",
  supermarket: "groceries",
  grocery: "groceries",
  pharmacy: "health",
  medicine: "health",
  cinema: "entertainment",
  movie: "entertainment",
  internet: "phone_internet",
  phone: "phone_internet",
  telecom: "phone_internet",
  diningout: "dining",
  restaurant: "dining",
  café: "coffee",
  cafe: "coffee",
};

const THAI_MONTHS = {
  "ม.ค": 1,
  "มกราคม": 1,
  "ก.พ": 2,
  "กุมภาพันธ์": 2,
  "มี.ค": 3,
  "มีนาคม": 3,
  "เม.ย": 4,
  "เมษายน": 4,
  "พ.ค": 5,
  "พฤษภาคม": 5,
  "มิ.ย": 6,
  "มิถุนายน": 6,
  "ก.ค": 7,
  "กรกฎาคม": 7,
  "ส.ค": 8,
  "สิงหาคม": 8,
  "ก.ย": 9,
  "กันยายน": 9,
  "ต.ค": 10,
  "ตุลาคม": 10,
  "พ.ย": 11,
  "พฤศจิกายน": 11,
  "ธ.ค": 12,
  "ธันวาคม": 12,
};

const ENGLISH_MONTHS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export function toArabicDigits(value) {
  const thaiDigits = "๐๑๒๓๔๕๖๗๘๙";
  return String(value || "").replace(/[๐-๙]/g, (char) => {
    const idx = thaiDigits.indexOf(char);
    return idx >= 0 ? String(idx) : char;
  });
}

export function normalizeDigits(value) {
  return toArabicDigits(String(value || "")).replace(/[^\d]/g, "");
}

export function normalizeScannedDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const text = raw.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  const pad2 = (n) => String(n).padStart(2, "0");
  const toISO = (yy, mm, dd) => {
    let year = Number(yy);
    const month = Number(mm);
    const day = Number(dd);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    if (year < 100) year = year >= 70 ? 1900 + year : 2000 + year;
    if (year >= 2400) year -= 543;
    if (year < 1900 || year > 2100) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    return `${year}-${pad2(month)}-${pad2(day)}`;
  };

  const head = text.split(/\s+/)[0];

  let match = head.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (match) return toISO(match[1], match[2], match[3]);

  match = head.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (match) return toISO(match[3], match[2], match[1]);

  const tokenMatch = text.match(/(\d{1,2})\s*([A-Za-z]{3,9}|[\u0E00-\u0E7F.]{2,12})\s*(\d{2,4})/);
  if (tokenMatch) {
    const day = tokenMatch[1];
    const token0 = String(tokenMatch[2] || "").trim();
    const token = token0.replace(/\.+$/g, "");
    const keyTh = token0.replace(/\s+/g, "");
    const month = THAI_MONTHS[keyTh] || THAI_MONTHS[token] || ENGLISH_MONTHS[token.toLowerCase()] || null;
    if (month) return toISO(tokenMatch[3], month, day);
  }

  return null;
}

export function extractResponsesOutputText(resp) {
  const direct = resp?.output_text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const out = resp?.output;
  if (Array.isArray(out)) {
    const lines = [];
    for (const item of out) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const part of content) {
          const text = part?.text;
          if (typeof text === "string" && text.trim()) lines.push(text.trim());
        }
      }
      if (typeof item?.text === "string" && item.text.trim()) lines.push(item.text.trim());
    }
    if (lines.length) return lines.join("\n");
  }

  const maybe =
    resp?.output?.[0]?.content
      ?.map((part) => part?.text)
      .filter(Boolean)
      .join("\n") || "";

  return String(maybe || "").trim();
}

export function findFirstParsedObject(resp) {
  try {
    const out = resp?.output;
    if (Array.isArray(out)) {
      for (const item of out) {
        const content = item?.content;
        if (Array.isArray(content)) {
          for (const part of content) {
            if (part && typeof part === "object" && part.parsed && typeof part.parsed === "object") return part.parsed;
            if (part && typeof part === "object" && part.json && typeof part.json === "object") return part.json;
          }
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function safeNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const cleaned = toArabicDigits(text).replace(/[฿$, ]+/g, "").replace(/,/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function clamp01(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function normalizeCategoryKey(value) {
  const text = String(value == null ? "" : value).trim().toLowerCase();
  if (!text) return null;
  if (ALLOWED_CATEGORY_KEYS.has(text)) return text;
  if (CATEGORY_ALIASES[text]) return CATEGORY_ALIASES[text];
  return null;
}
