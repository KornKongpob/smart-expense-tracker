export const LARGE_ATTACHMENT_BACKUP_BYTES = 25 * 1024 * 1024;

export function formatAttachmentBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "0 MB";
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function collectAttachmentIds(value, out = new Set()) {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    for (const item of value) collectAttachmentIds(item, out);
    return out;
  }

  for (const [key, item] of Object.entries(value)) {
    if (key === "attachmentId" || key === "attachment_id") {
      const id = String(item || "").trim();
      if (id) out.add(id);
      continue;
    }
    if (item && typeof item === "object") collectAttachmentIds(item, out);
  }

  return out;
}

export function getBackupData(payload) {
  return payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
    ? payload.data
    : payload;
}

export function normalizeAttachmentBackupMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([id, item]) => {
        const source = item && typeof item === "object" ? item : {};
        const dataUrl = String(source.dataUrl || source.data_url || "");
        if (!String(id || "").trim() || !dataUrl.startsWith("data:")) return null;
        return [
          String(id).trim(),
          {
            dataUrl,
            mimeType: String(source.mimeType || source.mime_type || ""),
            size: Number(source.size || 0) || 0,
          },
        ];
      })
      .filter(Boolean)
  );
}

export function sumAttachmentBackupSize(attachmentMap) {
  return Object.values(attachmentMap || {}).reduce(
    (sum, item) => sum + Math.max(0, Number(item?.size || 0)),
    0
  );
}
