function normalizeTxType(rawType) {
  const txType = String(rawType || "").toLowerCase().trim();
  if (txType === "income" || txType === "expense" || txType === "transfer" || txType === "credit_payment") {
    return txType;
  }
  return "expense";
}

export function toDuplicateComparable(item) {
  const base = item && typeof item === "object" ? item : {};
  const txType = normalizeTxType(base.txType || base.type);
  const ref = String(base.ref || base.referenceId || "").trim();

  return {
    ...base,
    type: txType,
    txType,
    isTransfer: base.isTransfer === true || txType === "transfer" || txType === "credit_payment",
    ref,
    referenceId: ref || String(base.referenceId || "").trim(),
  };
}

export function duplicateStateFromMatch(match) {
  const duplicate = !!match?.isDuplicate;
  if (!duplicate) {
    return { duplicate: false, duplicateInfo: null };
  }

  const reasons = Array.isArray(match?.reasons) ? match.reasons : [];
  let kind = "fuzzy";
  if (reasons.includes("ref exact match")) kind = "ref";
  else if (reasons.includes("file exact match")) kind = "file";

  return {
    duplicate: true,
    duplicateInfo: {
      kind,
      matchId: match?.matchId || null,
      score: match?.score || 0,
      reasons,
    },
  };
}
