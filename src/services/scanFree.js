// src/services/scanFree.js
// Client-only OCR (no server, no API key) using Tesseract.js + image preprocessing + multi-pass parsing
import { createWorker } from "tesseract.js";
import { normalizeScanResponse, SCAN_PARSE_ERROR_CODE } from "../../shared/scanSchema";

// -------------------- text helpers --------------------
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

function normalizeText(input = "") {
  let s = String(input);

  // Thai digits -> Arabic digits
  s = s.replace(/[๐-๙]/g, (d) => THAI_DIGITS[d] ?? d);

  // unify separators
  s = s.replace(/\u00A0/g, " "); // non-breaking space
  s = s.replace(/[•·]/g, " ");
  s = s.replace(/[，]/g, ",");
  s = s.replace(/[：]/g, ":");
  s = s.replace(/[|]/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

function toISODateFromParts(dd, mm, yyyy) {
  let y = Number(yyyy);
  const m = Number(mm);
  const d = Number(dd);

  // Buddhist Era -> AD
  if (y >= 2400) y = y - 543;

  if (!y || !m || !d) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;

  const pad = (n) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}`;
}

const TH_MONTHS = [
  { k: ["ม.ค", "มกราคม", "jan"], m: 1 },
  { k: ["ก.พ", "กุมภาพันธ์", "feb"], m: 2 },
  { k: ["มี.ค", "มีนาคม", "mar"], m: 3 },
  { k: ["เม.ย", "เมษายน", "apr"], m: 4 },
  { k: ["พ.ค", "พฤษภาคม", "may"], m: 5 },
  { k: ["มิ.ย", "มิถุนายน", "jun"], m: 6 },
  { k: ["ก.ค", "กรกฎาคม", "jul"], m: 7 },
  { k: ["ส.ค", "สิงหาคม", "aug"], m: 8 },
  { k: ["ก.ย", "กันยายน", "sep"], m: 9 },
  { k: ["ต.ค", "ตุลาคม", "oct"], m: 10 },
  { k: ["พ.ย", "พฤศจิกายน", "nov"], m: 11 },
  { k: ["ธ.ค", "ธันวาคม", "dec"], m: 12 },
];

function parseDate(text) {
  const t = normalizeText(text).toLowerCase();

  // yyyy-mm-dd
  const m0 = t.match(/(?:^|\s)(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s|$)/);
  if (m0) {
    const iso = toISODateFromParts(m0[3], m0[2], m0[1]);
    if (iso) return iso;
  }

  // dd/mm/yyyy or dd-mm-yyyy
  const m1 = t.match(/(?:^|\s)(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})(?:\s|$)/);
  if (m1) {
    const iso = toISODateFromParts(m1[1], m1[2], m1[3].length === 2 ? `20${m1[3]}` : m1[3]);
    if (iso) return iso;
  }

  // dd <thai month> yyyy  (e.g. 14 ธ.ค. 2568)
  const m2 = t.match(/(?:^|\s)(\d{1,2})\s*([ก-๙a-z.]{2,12})\s*(\d{2,4})(?:\s|$)/);
  if (m2) {
    const dd = m2[1];
    const monStr = m2[2].replace(/\./g, "");
    const yy = m2[3].length === 2 ? `20${m2[3]}` : m2[3];

    const found = TH_MONTHS.find((x) => x.k.some((k) => monStr.includes(k.replace(/\./g, ""))));
    if (found) {
      const iso = toISODateFromParts(dd, String(found.m), yy);
      if (iso) return iso;
    }
  }

  return null;
}

function parseAmount(lines) {
  const TOTAL_KEYS = [
    "ยอดรวม",
    "รวมทั้งสิ้น",
    "รวมสุทธิ",
    "ยอดสุทธิ",
    "สุทธิ",
    "รวมเงิน",
    "grand total",
    "total",
    "amount",
    "net",
    "balance",
    "รวม",
  ];
  const MONEY_KEYS = ["฿", "บาท", "thb", "baht"];
  const IGNORE_KEYS = ["vat", "tax", "change", "เงินทอน", "qty", "x", "*", "ชิ้น", "จำนวน"];

  const candidates = [];

  for (const raw of lines) {
    const line0 = normalizeText(raw);
    const line = line0.toLowerCase();
    if (!line) continue;

    const nums = line.match(/\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?/g);
    if (!nums) continue;

    const hasTotal = TOTAL_KEYS.some((k) => line.includes(k));
    const hasMoney = MONEY_KEYS.some((k) => line.includes(k));
    const hasIgnore = IGNORE_KEYS.some((k) => line.includes(k));

    for (const n of nums) {
      const v = Number(String(n).replace(/[,\s]/g, ""));
      if (!Number.isFinite(v) || v <= 0) continue;
      if (v > 100000000) continue; // กันเลขเพี้ยน

      // scoring
      let score = 0;
      if (hasTotal) score += 60;
      if (hasMoney) score += 20;
      if (hasIgnore) score -= 25;

      // ใบเสร็จส่วนใหญ่ยอดรวมจะใหญ่กว่า line-item
      score += Math.log10(v + 1) * 8;

      // ถ้ามีทศนิยม .00 มักเป็นยอดเงินจริง
      if (/\.\d{2}\b/.test(String(n))) score += 6;

      candidates.push({ v, score, line: line0 });
    }
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].v;
}

function parseMerchant(lines) {
  // merchant มักอยู่หัวใบเสร็จ (บรรทัดแรกๆ)
  const bad = [
    "tax",
    "vat",
    "receipt",
    "ใบเสร็จ",
    "ใบกำกับ",
    "เลขที่",
    "tel",
    "โทร",
    "วันที่",
    "time",
    "เวลา",
    "total",
    "ยอดรวม",
    "รวม",
    "cashier",
    "ref",
    "invoice",
  ];

  const head = lines.slice(0, 10);

  let best = "";
  let bestScore = -999;

  for (const raw of head) {
    const s = normalizeText(raw);
    if (!s) continue;

    const low = s.toLowerCase();
    if (bad.some((b) => low.includes(b))) continue;

    // ต้องมีตัวอักษรบ้าง
    if (!/[a-zก-๙]/i.test(s)) continue;

    // สั้นเกินไปไม่เอา
    if (s.length < 3) continue;

    // score: ยิ่งมีตัวอักษรมาก + เลขน้อย ยิ่งน่าจะเป็นชื่อร้าน
    const letters = (s.match(/[a-zก-๙]/gi) || []).length;
    const digits = (s.match(/[0-9]/g) || []).length;
    const score = letters * 2 - digits * 1.5 - Math.max(0, s.length - 40) * 0.2;

    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }

  return best || "";
}

function inferCategory(text) {
  const t = normalizeText(text).toLowerCase();
  const has = (arr) => arr.some((k) => t.includes(k));

  if (has(["7-eleven", "7 eleven", "เซเว่น", "อาหาร", "ข้าว", "กาแฟ", "ชานม", "ร้านอาหาร", "restaurant", "cafe", "kfc", "mk", "sizzler"])) return "food";
  if (has(["bts", "mrt", "grab", "bolt", "taxi", "รถ", "เดินทาง", "น้ำมัน", "ปั๊ม", "gas", "fuel", "shell", "ptt"])) return "transport";
  if (has(["shopee", "lazada", "shopping", "ช้อป", "mall", "store", "เสื้อ", "รองเท้า", "shop", "central", "lotus", "big c"])) return "shopping";
  if (has(["ค่าไฟ", "ค่าน้ำ", "internet", "เน็ตทรู", "ais", "dtac", "true", "bill", "utility", "บิล", "3bb"])) return "bills";
  if (has(["ยา", "โรงพยาบาล", "คลินิก", "pharmacy", "drug", "med", "health", "dent", "หมอ", "lab"])) return "health";
  if (has(["netflix", "spotify", "cinema", "movie", "steam", "เกม", "บันเทิง", "major", "sf cinema"])) return "entertainment";

  return "other";
}

// -------------------- image preprocessing (canvas) --------------------
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function computeOtsuThreshold(gray) {
  // gray: Uint8ClampedArray length = w*h
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;

  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let wF = 0;

  let varMax = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;

    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > varMax) {
      varMax = between;
      threshold = t;
    }
  }

  return threshold;
}

async function preprocessToCanvases(file, { maxDim = 2200, scaleUp = 2 } = {}) {
  let bmp = null;
  try {
    bmp = await createImageBitmap(file);

      // scale
      const w0 = bmp.width;
      const h0 = bmp.height;
      const scale = Math.min(maxDim / Math.max(w0, h0), 1) * scaleUp;
      const w = Math.max(1, Math.round(w0 * scale));
      const h = Math.max(1, Math.round(h0 * scale));

      const base = document.createElement("canvas");
      base.width = w;
      base.height = h;
      const ctx = base.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0, w, h);

      const img = ctx.getImageData(0, 0, w, h);
      const data = img.data;

      // grayscale + find min/max for auto contrast
      const gray = new Uint8ClampedArray(w * h);
      let gMin = 255;
      let gMax = 0;
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const v = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
        gray[p] = v;
        if (v < gMin) gMin = v;
        if (v > gMax) gMax = v;
      }

      // contrast stretch
      const contrast = document.createElement("canvas");
      contrast.width = w;
      contrast.height = h;
      const cctx = contrast.getContext("2d", { willReadFrequently: true });
      const out1 = cctx.createImageData(w, h);
      const o1 = out1.data;

      const span = Math.max(1, gMax - gMin);
      for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
        const v = clamp(Math.round(((gray[p] - gMin) / span) * 255), 0, 255);
        o1[i] = o1[i + 1] = o1[i + 2] = v;
        o1[i + 3] = 255;
      }
      cctx.putImageData(out1, 0, 0);

      // otsu binarize
      const thr = computeOtsuThreshold(gray);
      const bin = document.createElement("canvas");
      bin.width = w;
      bin.height = h;
      const bctx = bin.getContext("2d", { willReadFrequently: true });
      const out2 = bctx.createImageData(w, h);
      const o2 = out2.data;

      // decide invert by average
      let sum = 0;
      for (let p = 0; p < gray.length; p++) sum += gray[p];
      const avg = sum / gray.length;

      for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
        const v = gray[p] > thr ? 255 : 0;
        o2[i] = o2[i + 1] = o2[i + 2] = v;
        o2[i + 3] = 255;
      }
      bctx.putImageData(out2, 0, 0);

      // optionally invert if background looks dark (avg low) but text should be dark on light
      const inv = document.createElement("canvas");
      inv.width = w;
      inv.height = h;
      const ictx = inv.getContext("2d", { willReadFrequently: true });
      const out3 = ictx.createImageData(w, h);
      const o3 = out3.data;

      const invNeeded = avg < 115; // heuristic
      if (invNeeded) {
        for (let i = 0; i < o2.length; i += 4) {
          const v = 255 - o2[i];
          o3[i] = o3[i + 1] = o3[i + 2] = v;
          o3[i + 3] = 255;
        }
        ictx.putImageData(out3, 0, 0);
      } else {
        ictx.drawImage(bin, 0, 0);
      }

      // crops
      const crop = (canvas, y0, y1) => {
        const c = document.createElement("canvas");
        c.width = canvas.width;
        c.height = Math.max(1, Math.round(canvas.height * (y1 - y0)));
        const cctx2 = c.getContext("2d");
        cctx2.drawImage(
          canvas,
          0,
          Math.round(canvas.height * y0),
          canvas.width,
          Math.round(canvas.height * (y1 - y0)),
          0,
          0,
          c.width,
          c.height
        );
        return c;
      };

    return {
      full: { base, contrast, bin, inv },
      crops: {
        top: {
          base: crop(base, 0, 0.38),
          contrast: crop(contrast, 0, 0.38),
          bin: crop(bin, 0, 0.38),
          inv: crop(inv, 0, 0.38),
        },
        bottom: {
          base: crop(base, 0.55, 1),
          contrast: crop(contrast, 0.55, 1),
          bin: crop(bin, 0.55, 1),
          inv: crop(inv, 0.55, 1),
        },
      },
    };
  } finally {
    try {
      bmp?.close?.();
    } catch {
      // ignore
    }
  }
}

// -------------------- tesseract worker (singleton) --------------------
let workerPromise = null;

async function getWorker({ onLog } = {}) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker({
        logger: (m) => {
          if (m?.status === "recognizing text" && typeof m.progress === "number") {
            onLog?.(m);
          }
        },
      });

      // load + init language
      await worker.loadLanguage("tha+eng");
      await worker.initialize("tha+eng");

      // small quality tweaks
      await worker.setParameters({
        preserve_interword_spaces: "1",
      });

      return worker;
    })();
  }
  return workerPromise;
}

async function recognize(worker, image, { psm = 6, whitelist = "" } = {}) {
  const params = {
    tessedit_pageseg_mode: String(psm),
  };
  if (whitelist) params.tessedit_char_whitelist = whitelist;

  await worker.setParameters(params);
  const { data } = await worker.recognize(image);

  const text = normalizeText(data?.text ?? "");
  const lines = text.split("\n").map((l) => normalizeText(l)).filter(Boolean);

  // confidence heuristic
  const words = Array.isArray(data?.words) ? data.words : [];
  const conf = words.length
    ? words.reduce((s, w) => s + (typeof w.confidence === "number" ? w.confidence : 0), 0) / words.length
    : 0;

  return { text, lines, conf };
}

// -------------------- public API --------------------
/**
 * scanReceiptFree(file) -> { amount, date, merchant, category, rawText }
 * - No server
 * - No API key
 * - Works offline after first model download
 */
export async function scanReceiptFree(file, { onStatus } = {}) {
  onStatus?.("เตรียมรูปภาพ...");
  const { full, crops } = await preprocessToCanvases(file);

  const worker = await getWorker({
    onLog: (m) => {
      if (m?.status === "recognizing text") {
        onStatus?.(`กำลังอ่าน... ${Math.round((m.progress ?? 0) * 100)}%`);
      }
    },
  });

  // Multi-pass OCR: full + top + bottom, several variants
  // PSM note: 6 = block of text, 11 = sparse text :contentReference[oaicite:1]{index=1}
  const passes = [];
  const addPass = async (label, image, opts) => {
    onStatus?.(`OCR: ${label}...`);
    const r = await recognize(worker, image, opts);
    passes.push({ label, ...r });
  };

  // Full image (general)
  await addPass("full-contrast-psm6", full.contrast, { psm: 6 });
  await addPass("full-bin-psm6", full.bin, { psm: 6 });
  await addPass("full-inv-psm11", full.inv, { psm: 11 });

  // Top crop (merchant/date often)
  await addPass("top-contrast-psm6", crops.top.contrast, { psm: 6 });
  await addPass("top-bin-psm11", crops.top.bin, { psm: 11 });

  // Bottom crop (total often)
  // whitelist digits for better number accuracy on totals
  await addPass("bottom-bin-num", crops.bottom.bin, {
    psm: 6,
    whitelist: "0123456789.,/:-฿บาทTHBthb ",
  });
  await addPass("bottom-inv-num", crops.bottom.inv, {
    psm: 6,
    whitelist: "0123456789.,/:-฿บาทTHBthb ",
  });

  // Combine text for parsing
  const allText = passes.map((p) => p.text).join("\n");
  const allLines = passes.flatMap((p) => p.lines);

  // Choose merchant mostly from top/high confidence passes
  const topBest = passes
    .filter((p) => p.label.startsWith("top"))
    .sort((a, b) => b.conf - a.conf)[0];

  const merchant = parseMerchant(topBest?.lines?.length ? topBest.lines : allLines) || "";

  // Amount: prioritize bottom passes (totals)
  const bottomLines = passes
    .filter((p) => p.label.startsWith("bottom"))
    .sort((a, b) => b.conf - a.conf)
    .flatMap((p) => p.lines);

  const amount = parseAmount(bottomLines.length ? bottomLines : allLines);

  // Date: from combined
  const date = parseDate(allText);

  const category = inferCategory([merchant, allText].filter(Boolean).join(" "));

  onStatus?.("");

  const normalized = normalizeScanResponse({
    amount: amount ?? null,
    date: date ?? null,
    merchant,
    items: [],
    confidence: passes.length ? Math.max(0, Math.min(1, (passes.reduce((s, p) => s + (p.conf || 0), 0) / passes.length) / 100)) : null,
  }, { defaultErrorCode: SCAN_PARSE_ERROR_CODE });

  if (normalized.amount == null && !normalized.date && !normalized.merchant) {
    normalized.errors = [SCAN_PARSE_ERROR_CODE];
  }

  return {
    ...normalized,
    category,
    rawText: allText,
  };
}
