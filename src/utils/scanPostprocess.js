const THAI_DIGITS = {
  "๐": "0",
  "๑": "1",
  "๒": "2",
  "๓": "3",
  "๔": "4",
  "๕": "5",
  "๖": "6",
  "๗": "7",
  "๘": "8",
  "๙": "9",
};

function toArabicDigits(input) {
  return String(input || "").replace(/[๐-๙]/g, (d) => THAI_DIGITS[d] ?? d);
}

function splitLines(text) {
  return normalizeScanText(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseAmountToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num <= 0 || num > 100000000) return null;
  return num;
}

function hasAny(text, keys) {
  const t = String(text || "").toLowerCase();
  return keys.some((key) => t.includes(String(key || "").toLowerCase()));
}

function isAmountNoiseLine(line, { hasAmountKey = false } = {}) {
  if (!line) return true;
  if (hasAmountKey) return false;

  return (
    /(?:โทร|tel|phone|all member|member|service center|call center|facebook|line official|www\.|http)/i.test(line) ||
    /(?:บัญชี|account|เลขบัญชี|a\/c|acc|card|เลขบัตร|promptpay id|merchant id|biller id|receiver|sender|จาก|ไปยัง)/i.test(line) ||
    /(?:ref|reference|transaction|trx|tid#|r#|เลขที่รายการ|รหัสอ้างอิง|receipt no)/i.test(line)
  );
}

function isLikelyNoiseLine(line) {
  return (
    !line ||
    /^(?:ref|reference|tid#|r#|receipt no|receipt number|เลขที่ใบเสร็จ|เลขที่ใบกำกับ|หมายเลขอ้างอิง|รหัสอ้างอิง)\b/i.test(line) ||
    /(?:โทร|tel|phone|ศูนย์บริการสมาชิก|service center)/i.test(line)
  );
}

function cleanMerchantCandidate(input) {
  let value = normalizeScanText(input)
    .replace(/^(?:ไปยัง|ผู้รับ(?:เงิน)?|ชื่อผู้รับ|บัญชีรับ(?:ชำระ)?|ปลายทาง|to|receiver|merchant)\s*[:：-]?\s*/i, "")
    .replace(/(?:เลขที่เครื่องชำระเงิน|merchant id|รหัสร้านค้า|promptpay id|biller id|ref(?:erence)?|receipt no).*/i, "")
    .replace(/\b\d{6,}\b.*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  value = value.replace(/^[^\p{L}\p{N}ก-๙]+/u, "").trim();

  if (!value) return "";
  if (!/[A-Za-zก-๙]/.test(value)) return "";
  if (/(?:จำนวนเงิน|amount|ยอดรวม|ยอดสุทธิ|รวมสุทธิ|total|receipt|invoice|วันที่|time|เวลา)/i.test(value)) return "";
  return value;
}

function extractSlipMerchant(lines) {
  const labelLine = /^(?:ไปยัง|ผู้รับ(?:เงิน)?|ชื่อผู้รับ|บัญชีรับ(?:ชำระ)?|ปลายทาง|to|receiver|merchant)\s*[:：-]?\s*(.*)$/i;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(labelLine);
    if (!match) continue;

    const tail = cleanMerchantCandidate(match[1] || "");
    if (tail) return tail;

    for (let j = i + 1; j < Math.min(lines.length, i + 4); j += 1) {
      const next = cleanMerchantCandidate(lines[j]);
      if (next && !/^\d[\d\s-]*$/.test(next)) return next;
    }
  }
  return "";
}

function extractReceiptMerchant(lines) {
  const head = lines.slice(0, 12);
  const preferred = head.find(
    (line) =>
      !isLikelyNoiseLine(line) &&
      !/รายการสั่งซื้อ|order list|order detail/i.test(line) &&
      /(7\s*-?\s*eleven|7delivery|all member|สาขา|lotus|big c|makro|starbucks|cafe|restaurant|ร้านอาหาร)/i.test(line),
  );
  if (preferred) return cleanMerchantCandidate(preferred);

  let best = "";
  let bestScore = -Infinity;

  for (const line of head) {
    if (isLikelyNoiseLine(line)) continue;
    const candidate = cleanMerchantCandidate(line);
    if (!candidate) continue;

    const letters = (candidate.match(/[A-Za-zก-๙]/g) || []).length;
    const digits = (candidate.match(/\d/g) || []).length;
    let score = letters * 2 - digits * 2 - Math.max(0, candidate.length - 48) * 0.3;
    if (/รายการสั่งซื้อ|order list|order detail/i.test(candidate)) score -= 20;
    if (/สาขา|branch/i.test(candidate)) score += 10;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

export function normalizeScanText(input) {
  return toArabicDigits(input)
    .replace(/\u00A0/g, " ")
    .replace(/[•·]/g, " ")
    .replace(/[，]/g, ",")
    .replace(/[：]/g, ":")
    .replace(/[|]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function detectScanTextDocType(text) {
  const normalized = normalizeScanText(text).toLowerCase();
  if (!normalized) return null;

  const lines = splitLines(normalized);

  const hasReceipt =
    hasAny(normalized, [
      "รายการสินค้า",
      "รายการสั่งซื้อ",
      "ใบเสร็จ",
      "ใบกำกับ",
      "ยอดสุทธิ",
      "รวมสุทธิ",
      "all member",
      "receipt no",
      "tid#",
      "r#",
      "7-eleven",
      "7delivery",
    ]) || lines.some((line) => /^ยอดสุทธิ\b/i.test(line));

  const hasSlip =
    hasAny(normalized, [
      "จ่ายเงินสำเร็จ",
      "โอนเงินสำเร็จ",
      "รายการโอน",
      "พร้อมเพย์",
      "promptpay",
      "reference",
      "ref",
      "transaction id",
      "จำนวนเงิน",
      "จาก",
      "ไปยัง",
      "receiver",
      "from account",
      "to account",
      "visa",
      "mastercard",
      "scb",
      "kbank",
      "krungthai",
      "ttb",
    ]) || (lines.includes("จาก") && lines.includes("ไปยัง"));

  const hasBillPayment =
    hasSlip &&
    hasAny(normalized, [
      "ชำระบิล",
      "bill payment",
      "invoice",
      "ค่าน้ำ",
      "ค่าไฟ",
      "ค่าโทร",
      "mobile",
      "internet",
    ]);

  if (hasBillPayment && !hasReceipt) return "bill_payment";
  if (hasReceipt && !hasSlip) return "receipt";
  if (hasSlip && !hasReceipt) return "transfer_slip";
  if (hasReceipt) return "receipt";
  if (hasSlip) return "transfer_slip";
  return null;
}

export function extractLikelyAmountFromScanText(text, { docType = null } = {}) {
  const normalized = normalizeScanText(text);
  if (!normalized) return null;

  const directPatterns = [
    /(?:จำนวนเงิน|amount|ยอด(?:รวม|สุทธิ)?|รวม(?:สุทธิ|ทั้งสิ้น)?|grand total|net total|total paid|total|paid)\s*[:：]?\s*(?:฿|บาท|thb|baht)?\s*([0-9][0-9,\s]*(?:\.\d{1,2})?)/i,
    /(?:จำนวนเงิน|amount|ยอด(?:รวม|สุทธิ)?|รวม(?:สุทธิ|ทั้งสิ้น)?|grand total|net total|total paid|total|paid)[^\d\n]{0,24}\n\s*(?:฿|บาท|thb|baht)?\s*([0-9][0-9,\s]*(?:\.\d{1,2})?)/i,
    /([0-9][0-9,\s]*(?:\.\d{2})?)\s*(?:บาท|฿|thb)\b/i,
  ];

  for (const pattern of directPatterns) {
    const match = normalized.match(pattern);
    const value = parseAmountToken(match?.[1]);
    if (value != null) return value;
  }

  const amountKeys =
    docType === "transfer_slip" || docType === "bill_payment"
      ? ["จำนวนเงิน", "amount", "paid", "ยอดชำระ", "ยอดเงิน", "โอน"]
      : ["ยอดรวม", "รวมทั้งสิ้น", "รวมสุทธิ", "ยอดสุทธิ", "สุทธิ", "grand total", "net total", "total", "amount"];

  const moneyKeys = ["฿", "บาท", "thb", "baht"];
  const ignoreKeys = ["vat", "tax", "change", "เงินทอน", "qty", "ชิ้น", "จำนวน", "tid#", "r#", "ref", "reference"];
  const lines = splitLines(normalized);
  const decimalCandidateCount = (normalized.match(/\b\d[\d,\s]*\.\d{1,2}\b/g) || []).length;
  const candidates = [];

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    const low = line.toLowerCase();
    const nums = line.match(/\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?/g);
    if (!nums) continue;

    const hasAmountKey = amountKeys.some((key) => low.includes(String(key).toLowerCase()));
    const hasMoney = moneyKeys.some((key) => low.includes(key));
    const hasIgnore = ignoreKeys.some((key) => low.includes(String(key).toLowerCase()));
    const isDateLike = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(line) || /\b\d{1,2}:\d{2}\b/.test(line);
    const looksLikeNoise = isAmountNoiseLine(line, { hasAmountKey });

    if (hasAmountKey) {
      const nearby = [line, lines[idx + 1] || "", lines[idx + 2] || ""].join(" ");
      const nearbyNums = nearby.match(/\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?/g) || [];
      const nearbyBest = nearbyNums
        .map((token) => parseAmountToken(token))
        .filter((value) => value != null)
        .sort((a, b) => b - a)[0];
      if (nearbyBest != null) return nearbyBest;
    }

    for (const token of nums) {
      const value = parseAmountToken(token);
      if (value == null) continue;

      const plain = String(token).replace(/[,\s]/g, "");
      const hasDecimal = /\.\d{1,2}\b/.test(plain);
      if (looksLikeNoise && !hasAmountKey && !hasMoney) continue;
      if (!hasAmountKey && !hasMoney && /^\d{6,}$/.test(plain)) continue;
      if (!hasAmountKey && !hasMoney && !hasDecimal && plain.length >= 4) continue;
      if (!hasAmountKey && !hasMoney && /^(?:0\d{8,10}|\d{9,11})$/.test(plain)) continue;
      if (isDateLike && !hasAmountKey) continue;

      let score = 0;
      if (hasAmountKey) score += 80;
      if (hasMoney) score += 22;
      if (hasIgnore && !hasAmountKey) score -= 32;
      if (hasDecimal) score += 12;
      if (/[A-Za-zก-๙]/.test(line) && /\d/.test(line)) score += 4;
      if (/^\s*(?:จำนวนเงิน|ยอด(?:รวม|สุทธิ)?|รวม(?:สุทธิ|ทั้งสิ้น)?|total|amount)/i.test(line)) score += 10;
      if (looksLikeNoise) score -= 28;
      if ((docType === "transfer_slip" || docType === "bill_payment") && hasAmountKey) score += 14;
      if (docType === "receipt" && idx >= Math.floor(lines.length * 0.5)) score += 6;
      if (decimalCandidateCount > 0 && decimalCandidateCount <= 3 && hasDecimal) score += 10;
      if (!hasAmountKey && !hasMoney && !hasDecimal) score -= 6;
      if (!hasAmountKey && !hasMoney && value > 5000) score -= 10;
      score += Math.log10(value + 1) * 7;

      candidates.push({ value, score });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.value ?? null;
}

export function extractMerchantFromScanText(text, { docType = null } = {}) {
  const normalized = normalizeScanText(text);
  if (!normalized) return "";

  const lines = splitLines(normalized);
  const inferredDocType = docType || detectScanTextDocType(normalized);

  if (inferredDocType === "transfer_slip" || inferredDocType === "bill_payment") {
    return extractSlipMerchant(lines);
  }

  return extractReceiptMerchant(lines);
}
