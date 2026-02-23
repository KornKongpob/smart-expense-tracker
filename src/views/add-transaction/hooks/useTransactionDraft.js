import { useMemo, useState } from "react";

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
  const [note, setNote] = useState(initialData?.note || "");
  const [ref, setRef] = useState(initialData?.ref || "");
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
    note,
    setNote,
    ref,
    setRef,
    slipMeta,
    _setSlipMeta,
    currentLocation,
    setCurrentLocation,
    nearbySuggestion,
    setNearbySuggestion,
  };
}
