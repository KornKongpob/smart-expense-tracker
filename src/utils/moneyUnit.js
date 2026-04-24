export const MONEY_UNITS = Object.freeze({
  BAHT: "baht",
  SATANG: "satang",
});

export function resolveMoneyUnit(value, fallback = MONEY_UNITS.SATANG) {
  const unit = String(value || "").trim().toLowerCase();
  if (unit === MONEY_UNITS.BAHT || unit === "thb") return MONEY_UNITS.BAHT;
  if (unit === MONEY_UNITS.SATANG) return MONEY_UNITS.SATANG;
  return fallback === MONEY_UNITS.BAHT ? MONEY_UNITS.BAHT : MONEY_UNITS.SATANG;
}

export function readMoneyUnit(value, fallback = MONEY_UNITS.SATANG) {
  const source = value && typeof value === "object" ? value : {};
  return resolveMoneyUnit(source.moneyUnit ?? source.amountUnit, fallback);
}

export function hasExplicitMoneyUnit(value) {
  const source = value && typeof value === "object" ? value : {};
  return Boolean(String(source.moneyUnit ?? source.amountUnit ?? "").trim());
}
