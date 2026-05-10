import { parseDateSafe } from "./format.js";

const THAI_DIGITS = "\u0e50\u0e51\u0e52\u0e53\u0e54\u0e55\u0e56\u0e57\u0e58\u0e59";
const TIME_CAPTURE = "([01]?\\d|2[0-3])\\s*[:.]\\s*([0-5]\\d)(?:\\s*[:.]\\s*([0-5]\\d))?";
const TIME_BOUNDARY_PREFIX = "(^|[^\\d,])";
const TIME_BOUNDARY_SUFFIX = "(?!\\s*[:.,]\\d)(?=$|[^\\d])";
const LABELED_TIME_RE = new RegExp(
  `(?:\\btime\\b|\\u0e40\\u0e27\\u0e25\\u0e32)\\s*[:-]?\\s*${TIME_CAPTURE}`,
  "i",
);
const TIME_RE = new RegExp(`${TIME_BOUNDARY_PREFIX}${TIME_CAPTURE}${TIME_BOUNDARY_SUFFIX}`, "i");

function toArabicDigits(value) {
  return String(value ?? "").replace(/[\u0e50-\u0e59]/g, (ch) => String(THAI_DIGITS.indexOf(ch)));
}

function cleanText(value) {
  return toArabicDigits(value).replace(/\u00a0/g, " ").trim();
}

function formatTimeMatch(match, offset = 1) {
  const hh = Number(match?.[offset]);
  const mm = Number(match?.[offset + 1]);
  const ssRaw = match?.[offset + 2];
  const ss = ssRaw == null || ssRaw === "" ? null : Number(ssRaw);

  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return "";
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return "";
  if (ss != null && (!Number.isFinite(ss) || ss < 0 || ss > 59)) return "";

  const base = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  return ss == null ? base : `${base}:${String(ss).padStart(2, "0")}`;
}

export function normalizeTransactionTime(raw) {
  const text = cleanText(raw);
  if (!text) return "";

  const labeled = text.match(LABELED_TIME_RE);
  if (labeled) return formatTimeMatch(labeled, 1);

  const direct = text.match(new RegExp(`^\\s*${TIME_CAPTURE}\\s*$`, "i"));
  if (direct) return formatTimeMatch(direct, 1);

  const embedded = text.match(TIME_RE);
  if (embedded) return formatTimeMatch(embedded, 2);

  return "";
}

export function parseTransactionTimeFromText(text) {
  const source = cleanText(text);
  if (!source) return "";

  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const labeled = line.match(LABELED_TIME_RE);
    if (labeled) return formatTimeMatch(labeled, 1);
  }

  for (const line of lines.length ? lines : [source]) {
    const normalized = normalizeTransactionTime(line);
    if (normalized) return normalized;
  }

  return "";
}

export function combineTransactionDateTimeForSort(date, time) {
  const normalizedTime = normalizeTransactionTime(time);
  if (!normalizedTime) return 0;

  const parsedDate = parseDateSafe(date);
  if (!Number.isFinite(parsedDate.getTime())) return 0;

  const [hours = 0, minutes = 0, seconds = 0] = normalizedTime.split(":").map((part) => Number(part));
  const combined = new Date(
    parsedDate.getFullYear(),
    parsedDate.getMonth(),
    parsedDate.getDate(),
    hours,
    minutes,
    seconds,
    0,
  );

  return Number.isFinite(combined.getTime()) ? combined.getTime() : 0;
}
