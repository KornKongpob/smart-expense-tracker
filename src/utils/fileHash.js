// src/utils/fileHash.js

/**
 * Compute SHA-256 hex digest for a File/Blob.
 * Used for exact-duplicate detection (same bytes re-uploaded).
 *
 * NOTE: Best-effort only. If WebCrypto is unavailable, returns an empty string.
 */
export async function computeFileSha256Hex(fileOrBlob) {
  try {
    if (!fileOrBlob) return "";
    if (typeof window === "undefined") return "";
    if (!window.crypto?.subtle) return "";

    const buf = await fileOrBlob.arrayBuffer();
    const hash = await window.crypto.subtle.digest("SHA-256", buf);
    const bytes = new Uint8Array(hash);
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
      out += bytes[i].toString(16).padStart(2, "0");
    }
    return out;
  } catch {
    return "";
  }
}
