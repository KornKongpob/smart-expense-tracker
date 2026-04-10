import { useEffect, useMemo, useState } from "react";
import { getCurrentLocalTimeHHmm } from "../../../utils/format.js";

export function useTransactionDraft({ initialData, isEditMode, transferKindForEdit, transferPair, accounts, toISODate, normalizeLatLng }) {
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
    try {
      const forced = String(sessionStorage.getItem("add.entryMode.force") || "").trim();
      if (forced) {
        setEntryMode(forced);
        sessionStorage.removeItem("add.entryMode.force");
      }

      const forcedScanKind = String(sessionStorage.getItem("add.scanUploadKind.force") || "").trim();
      if (forcedScanKind === "receipt" || forcedScanKind === "slip") {
        setEntryMode("scan");
        setScanUploadKind(forcedScanKind);
        sessionStorage.removeItem("add.scanUploadKind.force");
      }

      const forcedType = String(sessionStorage.getItem("add.txType.force") || "").trim();
      if (forcedType === "expense" || forcedType === "income" || forcedType === "transfer" || forcedType === "credit_payment") {
        setEntryMode("manual");
        setType(forcedType);
        if (forcedType === "transfer" || forcedType === "credit_payment") setCategoryId("transfer");
        sessionStorage.removeItem("add.txType.force");
      }
    } catch {
      // ignore
    }
  }, [isEditMode]);

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
