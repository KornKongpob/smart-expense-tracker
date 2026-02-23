import Busboy from "busboy";

const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_FILE_MIME = new Set(["application/pdf"]);

export function getContentType(req) {
  return String(req.headers?.["content-type"] || "").toLowerCase();
}

function normalizeInputMime(mimeType) {
  const m = String(mimeType || "").trim().toLowerCase();
  if (!m) return "";
  if (m === "image/jpg") return "image/jpeg";
  if (m === "application/x-pdf") return "application/pdf";
  return m;
}

export function assertAllowedInputMime(mimeType) {
  const mt = normalizeInputMime(mimeType);
  if (!mt) return "";
  if (ALLOWED_IMAGE_MIME.has(mt)) return mt;
  if (ALLOWED_FILE_MIME.has(mt)) return mt;
  return "";
}

function approxBase64Bytes(b64) {
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

function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err, val) => {
      if (done) return;
      done = true;
      if (err) reject(err);
      else resolve(val);
    };

    const chunks = [];
    let total = 0;

    req.on("data", (c) => {
      total += c.length;
      if (maxBytes && total > maxBytes) {
        const e = new Error("body_too_large");
        e.code = "body_too_large";
        try {
          req.destroy(e);
        } catch {
          // ignore
        }
        return finish(e);
      }
      chunks.push(c);
    });

    req.on("end", () => finish(null, Buffer.concat(chunks)));
    req.on("error", (e) => finish(e));
  });
}

export async function readJson(req, { maxBytes }) {
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

export function parseDataUrlMaybe(dataUrl) {
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

export function parseMultipart(req, { maxBytes = 10 * 1024 * 1024, maxFiles = 3 } = {}) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err, val) => {
      if (done) return;
      done = true;
      if (err) reject(err);
      else resolve(val);
    };

    const bb = Busboy({ headers: req.headers, limits: { fileSize: maxBytes, files: maxFiles } });
    const files = [];
    let totalBytes = 0;
    const fields = {};

    bb.on("field", (name, val) => {
      if (!name) return;
      fields[String(name)] = String(val ?? "");
    });

    bb.on("file", (_fieldname, file, info) => {
      const chunks = [];
      const filename = info?.filename || "";
      const mimeType = info?.mimeType || info?.mimetype || "";

      file.on("data", (d) => {
        totalBytes += d.length;
        if (totalBytes > maxBytes) {
          finish(new Error("file_too_large"));
          try { file.resume(); } catch { /* ignore */ }
          return;
        }
        chunks.push(d);
      });
      file.on("limit", () => finish(new Error("file_too_large")));
      file.on("end", () => {
        const buffer = Buffer.concat(chunks);
        if (buffer?.length) files.push({ fileBuffer: buffer, mimeType, filename });
      });
      file.on("error", (e) => finish(e));
    });

    bb.on("error", (e) => finish(e));
    bb.on("finish", () => finish(null, { files, fields }));

    try { req.pipe(bb); } catch (e) { finish(e); }
  });
}

/**
 * Parsed payload contract:
 * { variant: 'single'|'images', images?, base64?, mimeType?, filename?, accounts }
 */
export async function parseScanRequest(req, { maxUploadBytes, maxJsonBodyBytes, safeJsonParseMaybe }) {
  const ct = getContentType(req);

  if (ct.includes("multipart/form-data")) {
    const { files, fields } = await parseMultipart(req, { maxBytes: maxUploadBytes, maxFiles: 3 });
    const raw = fields?.accounts ?? fields?.accountsContext ?? "";
    const parsed = safeJsonParseMaybe(raw);
    const accounts = Array.isArray(parsed) ? parsed : [];

    if (!Array.isArray(files) || files.length === 0) {
      return { ok: false, status: 400, body: { ok: false, code: "missing_file", message: "No file uploaded" } };
    }

    const normalized = files
      .map((f) => {
        const mt = assertAllowedInputMime(f?.mimeType || "");
        if (!mt) return null;
        const buf = f?.fileBuffer;
        if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) return null;
        return {
          base64: buf.toString("base64"),
          mimeType: mt,
          filename: String(f?.filename || "").trim() || (mt === "application/pdf" ? "receipt.pdf" : "receipt.jpg"),
        };
      })
      .filter(Boolean)
      .slice(0, 3);

    if (!normalized.length) {
      return { ok: false, status: 415, body: { ok: false, code: "unsupported_media_type", message: "Only images (jpeg/png/webp) and PDF are allowed" } };
    }

    return { ok: true, payload: { variant: "images", images: normalized, accounts } };
  }

  const body = await readJson(req, { maxBytes: maxJsonBodyBytes });
  const accounts = Array.isArray(body?.accounts) ? body.accounts : Array.isArray(body?.accountsContext) ? body.accountsContext : [];

  const imagesList = Array.isArray(body?.images) ? body.images : Array.isArray(body?.imageDataUrls) ? body.imageDataUrls : null;
  if (Array.isArray(imagesList) && imagesList.length) {
    const normalized = imagesList
      .map((u) => parseDataUrlMaybe(String(u || "").trim()))
      .filter(Boolean)
      .map((p, idx) => {
        const mt = assertAllowedInputMime(p?.mimeType || "");
        if (!mt) return null;
        const b64 = String(p?.base64 || "").trim();
        if (!b64) return null;
        return { base64: b64, mimeType: mt, filename: `receipt-${idx + 1}.${mt === "image/png" ? "png" : mt === "image/webp" ? "webp" : "jpg"}` };
      })
      .filter(Boolean)
      .slice(0, 3);

    if (normalized.length) return { ok: true, payload: { variant: "images", images: normalized, accounts } };
  }

  const imageDataUrl = String(body?.imageDataUrl || "").trim();
  const parsedDataUrl = imageDataUrl ? parseDataUrlMaybe(imageDataUrl) : null;

  const base64 = parsedDataUrl?.base64 || body?.base64 || body?.imageBase64 || null;
  const mimeType = parsedDataUrl?.mimeType || body?.mimeType || "image/jpeg";
  const filename = String(body?.filename || body?.fileName || body?.name || "").trim();

  const mt = assertAllowedInputMime(mimeType || "image/jpeg");
  if (!mt) return { ok: false, status: 415, body: { ok: false, code: "unsupported_media_type", message: "Only images (jpeg/png/webp) and PDF are allowed" } };

  const b64 = typeof base64 === "string" ? base64.trim() : "";
  const sizeCheck = assertBase64UnderLimit(b64, maxUploadBytes);
  if (!sizeCheck.ok) return { ok: false, status: 413, body: { ok: false, code: "payload_too_large", message: "Upload payload too large" } };

  if (!b64) {
    return {
      ok: false,
      status: 400,
      body: { ok: false, code: "missing_base64", message: "Provide multipart file, or JSON { base64, mimeType }, or { imageDataUrl }" },
    };
  }

  return { ok: true, payload: { variant: "single", base64: b64, mimeType: mt, filename, accounts } };
}
