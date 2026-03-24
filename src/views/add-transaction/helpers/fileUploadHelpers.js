export function isPdfFile(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  return type === "application/pdf" || name.endsWith(".pdf");
}

export function isImageFile(file) {
  return String(file?.type || "").toLowerCase().startsWith("image/");
}

export function filterAllowedUploads(files) {
  const list = Array.isArray(files) ? files : Array.from(files || []);
  return list.filter((file) => file && (isImageFile(file) || isPdfFile(file)));
}

export function coerceClipboardFile(blob, idx = 0) {
  if (!blob) return null;
  if (typeof File !== "undefined" && blob instanceof File) return blob;

  try {
    const type = String(blob.type || "").toLowerCase();
    const ext = type === "application/pdf" ? "pdf" : type.startsWith("image/") ? (type.split("/")[1] || "png") : "bin";
    const name = `clipboard-${Date.now()}-${idx}.${ext}`;
    return new File([blob], name, { type: blob.type || "application/octet-stream" });
  } catch {
    return null;
  }
}
