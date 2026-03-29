import crypto from "node:crypto";
import path from "node:path";

export const DOCUMENTS_BUCKET = "expense-documents";

function extFromMime(mimeType = "") {
  const mime = String(mimeType || "").trim().toLowerCase();
  if (mime === "application/pdf") return ".pdf";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/heic") return ".heic";
  if (mime === "image/heif") return ".heif";
  return ".jpg";
}

function sanitizeSegment(value, fallback = "document") {
  const cleaned = String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96);

  return cleaned || fallback;
}

export function hashBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) return "";
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function uploadUserDocument({
  admin,
  userId,
  buffer,
  mimeType,
  filename,
  prefix = "uploads",
}) {
  if (!admin) throw new Error("supabase_admin_required");
  if (!userId) throw new Error("user_id_required");
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error("buffer_required");

  const ext = path.extname(String(filename || "").trim()) || extFromMime(mimeType);
  const baseName = path.basename(String(filename || "").trim(), path.extname(String(filename || "").trim()));
  const safeName = `${sanitizeSegment(baseName || "document")}${ext}`;
  const fileHash = hashBuffer(buffer);
  const stamp = new Date().toISOString().slice(0, 10);
  const filePath = `${userId}/${sanitizeSegment(prefix, "uploads")}/${stamp}/${Date.now()}-${fileHash.slice(0, 12)}-${safeName}`;

  const { error } = await admin.storage.from(DOCUMENTS_BUCKET).upload(filePath, buffer, {
    contentType: String(mimeType || "application/octet-stream").trim() || "application/octet-stream",
    upsert: false,
  });

  if (error) {
    throw new Error(error.message || "storage_upload_failed");
  }

  return {
    bucket: DOCUMENTS_BUCKET,
    filePath,
    fileName: safeName,
    mimeType: String(mimeType || "application/octet-stream").trim() || "application/octet-stream",
    fileHash,
    size: buffer.length,
  };
}
