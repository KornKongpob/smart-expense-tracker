// src/utils/useUndo.js
// Lightweight undo hook for transaction deletes.
// Holds the last deleted transaction(s) in memory for a configurable duration.
// If user taps "เลิกทำ", the transaction is re-inserted via upsert.

import { useCallback, useRef, useState } from "react";

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * useUndo({ onRestore })
 *
 * Returns:
 *  - undoItem: { label, items } | null  — current undo-able deletion
 *  - pushUndo(label, items)             — register a new undo-able action
 *  - performUndo()                      — restore the items
 *  - clearUndo()                        — dismiss without restoring
 */
export function useUndo({ onRestore, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const [undoItem, setUndoItem] = useState(null);
  const timerRef = useRef(null);

  const clearUndo = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setUndoItem(null);
  }, []);

  const pushUndo = useCallback(
    (label, items) => {
      // Clear any previous undo
      if (timerRef.current) clearTimeout(timerRef.current);

      const entry = {
        label: String(label || "ลบแล้ว"),
        items: Array.isArray(items) ? items : [items],
        ts: Date.now(),
      };
      setUndoItem(entry);

      // Auto-dismiss after timeout
      timerRef.current = setTimeout(() => {
        setUndoItem(null);
        timerRef.current = null;
      }, timeoutMs);
    },
    [timeoutMs]
  );

  const performUndo = useCallback(() => {
    if (!undoItem?.items?.length) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Call the restore callback with the saved items
    try {
      onRestore?.(undoItem.items);
    } catch {
      // ignore restore errors
    }

    setUndoItem(null);
  }, [undoItem, onRestore]);

  return { undoItem, pushUndo, performUndo, clearUndo };
}
