function toInt(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.trunc(number);
}

export function normalizeAccountBalanceRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      id: row?.id != null ? Number(row.id) : null,
      balance_satang: toInt(row?.balance_satang, 0),
    }))
    .filter((row) => Number.isFinite(row.id));
}

export function buildAccountBalanceMap(rows) {
  const next = new Map();
  for (const row of normalizeAccountBalanceRows(rows)) {
    next.set(Number(row.id), Number(row.balance_satang || 0));
  }
  return next;
}

export function buildAccountAdjustmentSummary({ currentBalanceSatang, desiredBalanceSatang }) {
  const current = toInt(currentBalanceSatang, 0);
  const desired = toInt(desiredBalanceSatang, 0);
  const delta = desired - current;

  if (!delta) {
    return {
      currentBalanceSatang: current,
      desiredBalanceSatang: desired,
      deltaSatang: 0,
      amountSatang: 0,
      kind: null,
      noop: true,
    };
  }

  return {
    currentBalanceSatang: current,
    desiredBalanceSatang: desired,
    deltaSatang: delta,
    amountSatang: Math.abs(delta),
    kind: delta > 0 ? "income" : "expense",
    noop: false,
  };
}
