// src/utils/useBlobUrl.js
import { useEffect, useState } from "react";
import { getBlobUrl } from "../services/blobStore";

/**
 * React hook: returns an object URL for a persisted attachmentId (IndexedDB).
 *
 * Note: URLs are cached in blobStore; this hook just resolves async and
 * triggers rerenders when ready.
 */
export function useBlobUrl(attachmentId) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);

    const id = String(attachmentId || "").trim();
    if (!id) return;

    (async () => {
      try {
        const u = await getBlobUrl(id);
        if (!cancelled) setUrl(u || null);
      } catch {
        if (!cancelled) setUrl(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attachmentId]);

  return url;
}
