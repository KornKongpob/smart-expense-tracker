// src/utils/useBlobInfo.js
import { useEffect, useState } from "react";
import { getBlobInfo } from "../services/blobStore";

/**
 * React hook: returns blob metadata for a persisted attachmentId (IndexedDB).
 *
 * - url: object URL usable in <img>, <a>, etc.
 * - mimeType: Blob MIME type (e.g., image/jpeg, application/pdf)
 */
export function useBlobInfo(attachmentId) {
  const [info, setInfo] = useState({
    url: null,
    mimeType: "",
    size: 0,
    loading: false,
    resolved: false,
    missing: false,
  });

  useEffect(() => {
    let cancelled = false;
    setInfo({ url: null, mimeType: "", size: 0, loading: false, resolved: false, missing: false });

    const id = String(attachmentId || "").trim();
    if (!id) return;

    setInfo({ url: null, mimeType: "", size: 0, loading: true, resolved: false, missing: false });

    (async () => {
      try {
        const next = await getBlobInfo(id);
        const found = !!next?.url;
        if (!cancelled) {
          setInfo({
            ...(next || { url: null, mimeType: "", size: 0 }),
            loading: false,
            resolved: true,
            missing: !found,
          });
        }
      } catch {
        if (!cancelled) {
          setInfo({ url: null, mimeType: "", size: 0, loading: false, resolved: true, missing: true });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attachmentId]);

  return info;
}
