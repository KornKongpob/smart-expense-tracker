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

function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (maxBytes && total > maxBytes) {
        const e = new Error("body_too_large");
        e.code = "body_too_large";
        reject(e);
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req, maxBytes) {
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

export async function parseScanRequest(req, { maxBytes }) {
  const body = await readJson(req, maxBytes);
  const imageDataUrl = String(body?.imageDataUrl || "").trim();
  const parsedDataUrl = imageDataUrl ? parseDataUrlMaybe(imageDataUrl) : null;
  const base64 = parsedDataUrl?.base64 || body?.base64 || body?.imageBase64 || "";
  const mimeType = parsedDataUrl?.mimeType || body?.mimeType || "image/jpeg";
  return {
    body,
    base64: typeof base64 === "string" ? base64.trim() : "",
    mimeType: String(mimeType || "image/jpeg"),
  };
}
