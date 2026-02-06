// src/utils/useBlobInfo.js
import { useEffect, useState } from "react";
import { getBlobInfo } from "../services/blobStore";

/**
 * React hook: returns { url, mimeType, size } for a persisted attachmentId (IndexedDB).
 *
 * - url: object URL usable in <img>, <a>, etc.
 * - mimeType: Blob MIME type (e.g., image/jpeg, application/pdf)
 */
export function useBlobInfo(attachmentId) {
  const [info, setInfo] = useState({ url: null, mimeType: "", size: 0 });

  useEffect(() => {
    let cancelled = false;
    setInfo({ url: null, mimeType: "", size: 0 });

    const id = String(attachmentId || "").trim();
    if (!id) return;

    (async () => {
      try {
        const next = await getBlobInfo(id);
        if (!cancelled) setInfo(next || { url: null, mimeType: "", size: 0 });
      } catch {
        if (!cancelled) setInfo({ url: null, mimeType: "", size: 0 });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attachmentId]);

  return info;
}
