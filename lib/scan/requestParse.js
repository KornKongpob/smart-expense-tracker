function parseDataUrlMaybe(dataUrl) {
  const s = String(dataUrl || "").trim();
  if (!s.startsWith("data:")) return null;
  const comma = s.indexOf(",");
  if (comma < 0) return null;
  const meta = s.slice(5, comma);
  const body = s.slice(comma + 1);
  const parts = meta.split(";");
  const mimeType = normalizeInputMime(parts[0] || "image/jpeg") || "image/jpeg";
  const isBase64 = parts.includes("base64");
  if (!isBase64) return null;
  return { mimeType, base64: body };
}

const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_FILE_MIME = new Set(["application/pdf"]);

function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err, value) => {
      if (done) return;
      done = true;
      if (err) reject(err);
      else resolve(value);
    };
    const chunks = [];
    let total = 0;
    req.on("data", (c) => {
      try {
        total += c.length;
        if (maxBytes && total > maxBytes) {
          const e = new Error("body_too_large");
          e.code = "body_too_large";
          if (typeof req.destroy === "function") {
            req.destroy(e);
          }
          finish(e);
          return;
        }
        chunks.push(c);
      } catch (err) {
        finish(err);
      }
    });
    req.on("end", () => {
      try {
        finish(null, Buffer.concat(chunks));
      } catch (err) {
        finish(err);
      }
    });
    req.on("error", (err) => finish(err));
  });
}

export async function parseJsonBody(req, maxBytes) {
  if (req.body && typeof req.body === "object") return req.body;
  const buf = await readRawBody(req, maxBytes);
  const txt = buf.toString("utf-8").trim();
  if (!txt) return {};
  try {
    return JSON.parse(txt);
  } catch {
    return {};
  }
}

export { parseDataUrlMaybe };

export function normalizeInputMime(mimeType) {
  const m = String(mimeType || "").trim().toLowerCase();
  if (!m) return "";
  if (m === "image/jpg") return "image/jpeg";
  if (m === "application/x-pdf") return "application/pdf";
  return m;
}

export function assertAllowedInputMime(mimeType, { allowPdf = true } = {}) {
  const mt = normalizeInputMime(mimeType);
  if (!mt) return "";
  if (ALLOWED_IMAGE_MIME.has(mt)) return mt;
  if (allowPdf && ALLOWED_FILE_MIME.has(mt)) return mt;
  return "";
}

export function approxBase64Bytes(b64) {
  const s = String(b64 || "").trim();
  if (!s) return 0;
  let len = s.length;
  if (s.endsWith("==")) len -= 2;
  else if (s.endsWith("=")) len -= 1;
  return Math.floor((len * 3) / 4);
}

export function assertBase64UnderLimit(b64, maxBytes) {
  const bytes = approxBase64Bytes(b64);
  if (!bytes) return { ok: false, bytes: 0 };
  if (bytes > maxBytes) return { ok: false, bytes };
  return { ok: true, bytes };
}

export async function parseScanRequest(req, { maxBytes }) {
  const body = await parseJsonBody(req, maxBytes);
  const imageDataUrl = String(body?.imageDataUrl || "").trim();
  const parsedDataUrl = imageDataUrl ? parseDataUrlMaybe(imageDataUrl) : null;
  const base64 = parsedDataUrl?.base64 || body?.base64 || body?.imageBase64 || "";
  const mimeType = normalizeInputMime(parsedDataUrl?.mimeType || body?.mimeType || "image/jpeg") || "image/jpeg";
  const filename = String(body?.filename || body?.fileName || body?.name || "").trim();
  return {
    body,
    base64: typeof base64 === "string" ? base64.trim() : "",
    mimeType: String(mimeType || "image/jpeg"),
    filename,
  };
}
