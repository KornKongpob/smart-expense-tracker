import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Scan Queue state + small utilities.
 *
 * Goal:
 * - Keep AddTransactionView lean by centralizing queue lifecycle bits.
 * - Handle objectURL cleanup to prevent memory leaks.
 *
 * NOTE: Domain-specific normalization (duplicate detection, category inference, etc.)
 * still lives in AddTransactionView for now. This hook focuses on queue mechanics.
 */
export function useScanQueue() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [queue, setQueue] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [dropActive, setDropActive] = useState(false);
  const [dupDecisionOpen, setDupDecisionOpen] = useState(false);

  const queueRef = useRef(queue);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const cleanupQueuePreviews = useCallback((items) => {
    const list = Array.isArray(items) ? items : [];
    for (const it of list) {
      const url = it?.previewUrl;
      const isTemp = String(it?.previewUrlSource || "").toLowerCase() === "temp" || !!it?.previewIsTemp;
      if (!url || !isTemp) continue;
      // Only revoke objectURLs we created during this session.
      // Persisted blobStore URLs must NOT be revoked here.
      if (!String(url).startsWith("blob:")) continue;
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
  }, []);

  const clearQueue = useCallback(() => {
    cleanupQueuePreviews(queueRef.current);
    setQueue([]);
    setExpandedId(null);
    setScanStatus("");
    setDupDecisionOpen(false);
  }, [cleanupQueuePreviews]);

  const removeQueueItem = useCallback(
    (id) => {
      const targetId = String(id || "");
      if (!targetId) return;
      setQueue((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const hit = list.find((x) => String(x?.id || "") === targetId);
        if (hit) cleanupQueuePreviews([hit]);
        return list.filter((x) => String(x?.id || "") !== targetId);
      });
      setExpandedId((cur) => (String(cur || "") === targetId ? null : cur));
    },
    [cleanupQueuePreviews]
  );

  const removeQueueItems = useCallback(
    (ids) => {
      const listIds = Array.isArray(ids) ? ids : [];
      const setIds = new Set(listIds.map((x) => String(x || "")).filter(Boolean));
      if (!setIds.size) return;

      setQueue((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const removed = list.filter((x) => setIds.has(String(x?.id || "")));
        if (removed.length) cleanupQueuePreviews(removed);
        return list.filter((x) => !setIds.has(String(x?.id || "")));
      });

      setExpandedId((cur) => (setIds.has(String(cur || "")) ? null : cur));
    },
    [cleanupQueuePreviews]
  );

  // Cleanup object URLs on unmount (safety net)
  useEffect(() => {
    return () => {
      try {
        cleanupQueuePreviews(queueRef.current);
      } catch {
        // ignore
      }
    };
  }, [cleanupQueuePreviews]);

  return {
    isScanning,
    setIsScanning,
    scanStatus,
    setScanStatus,
    queue,
    setQueue,
    expandedId,
    setExpandedId,
    dropActive,
    setDropActive,
    dupDecisionOpen,
    setDupDecisionOpen,
    cleanupQueuePreviews,
    clearQueue,
    removeQueueItem,
    removeQueueItems,
  };
}
