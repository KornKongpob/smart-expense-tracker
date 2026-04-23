import { useEffect, useMemo, useState } from "react";
import { getCurrentLocalTimeHHmm } from "../../../utils/format.js";
import {
  LEGACY_ENTRY_INTENT_KEYS,
  readLegacyNewEntryIntent,
  resolveNewEntryIntent,
} from "../helpers/entryIntent.js";

function clearLegacyEntryIntent(storageLike) {
  if (!storageLike || typeof storageLike.removeItem !== "function") return;
  for (const key of LEGACY_ENTRY_INTENT_KEYS) {
    try {
      storageLike.removeItem(key);
    } catch {
      // ignore legacy cleanup failures
    }
  }
}

export function useTransactionDraft({
  initialData,
  isEditMode,
  transferKindForEdit,
  transferPair,
  accounts,
  toISODate,
  normalizeLatLng,
  entryIntent = null,
  consumeEntryIntent = null,
}) {
  const [entryMode, setEntryMode] = useState(isEditMode ? "manual" : "scan");
  const [scanUploadKind, setScanUploadKind] = useState("receipt");

  const initialType = useMemo(() => {
    if (initialData?.isTransfer) return transferKindForEdit === "credit_payment" ? "credit_payment" : "transfer";
    return initialData?.type || "expense";
  }, [initialData?.isTransfer, initialData?.type, transferKindForEdit]);

  const [type, setType] = useState(initialType);
  const [categoryId, setCategoryId] = useState(() => (initialData?.isTransfer ? "transfer" : initialData?.category || ""));
  const [accountId, setAccountId] = useState(initialData?.accountId || accounts?.[0]?.id || "");
  const [fromAccountId, setFromAccountId] = useState(transferPair?.outTx?.accountId || accounts?.[0]?.id || "");
  const [toAccountId, setToAccountId] = useState(transferPair?.inTx?.accountId || accounts?.[0]?.id || "");
  const [date, setDate] = useState(initialData?.date ? String(initialData.date).slice(0, 10) : toISODate(new Date()));
  const [time, setTime] = useState(() => {
    const existingTime = String(initialData?.time || "").trim();
    if (existingTime) return existingTime;
    return isEditMode ? "" : getCurrentLocalTimeHHmm();
  });
  const [note, setNote] = useState(initialData?.note || "");
  const [ref, setRef] = useState(initialData?.ref || "");
  const [tags, setTags] = useState(() => Array.isArray(initialData?.tags) ? initialData.tags : []);
  const [slipMeta, _setSlipMeta] = useState(() => {
    const prev = initialData && typeof initialData === "object" ? initialData : {};
    const m = prev?.meta && typeof prev.meta === "object" ? prev.meta.slip : null;
    return m && typeof m === "object" ? m : null;
  });
  const [currentLocation, setCurrentLocation] = useState(() => {
    const prev = initialData?.location;
    const norm = normalizeLatLng(prev);
    return norm ? { ...norm } : null;
  });
  const [nearbySuggestion, setNearbySuggestion] = useState(null);

  // One-shot entry mode override (e.g., from Inbox/Quick Add)
  useEffect(() => {
    if (isEditMode) return;
    let legacyIntent = null;
    try {
      if (typeof sessionStorage !== "undefined") {
        legacyIntent = readLegacyNewEntryIntent(sessionStorage);
      }
    } catch {
      // ignore
    }

    const resolvedIntent = resolveNewEntryIntent({
      isEditMode,
      storeIntent: entryIntent,
      legacyIntent,
    });
    if (!resolvedIntent) return;

    if (resolvedIntent.entryMode === "manual") setEntryMode("manual");
    if (resolvedIntent.entryMode === "scan") setEntryMode("scan");

    if (resolvedIntent.scanUploadKind) {
      setEntryMode("scan");
      setScanUploadKind(resolvedIntent.scanUploadKind);
    }

    if (resolvedIntent.txType) {
      setEntryMode("manual");
      setType(resolvedIntent.txType);
      if (resolvedIntent.txType === "transfer" || resolvedIntent.txType === "credit_payment") {
        setCategoryId("transfer");
      }
    }

    if (entryIntent && typeof consumeEntryIntent === "function") {
      consumeEntryIntent();
    }

    try {
      if (legacyIntent && typeof sessionStorage !== "undefined") {
        clearLegacyEntryIntent(sessionStorage);
      }
    } catch {
      // ignore
    }
  }, [consumeEntryIntent, entryIntent, isEditMode]);

  return {
    entryMode,
    setEntryMode,
    scanUploadKind,
    setScanUploadKind,
    initialType,
    type,
    setType,
    categoryId,
    setCategoryId,
    accountId,
    setAccountId,
    fromAccountId,
    setFromAccountId,
    toAccountId,
    setToAccountId,
    date,
    setDate,
    time,
    setTime,
    note,
    setNote,
    ref,
    setRef,
    tags,
    setTags,
    slipMeta,
    _setSlipMeta,
    currentLocation,
    setCurrentLocation,
    nearbySuggestion,
    setNearbySuggestion,
  };
}
