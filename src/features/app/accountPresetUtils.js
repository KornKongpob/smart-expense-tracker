import {
  THAI_INSTITUTION_PRESETS,
  getInstitutionDefaultName,
  getInstitutionOptionsByType,
  getInstitutionPresetById,
  inferInstitutionAccountType,
} from "../../constants/institutions.js";

const DEFAULT_ICON_BY_TYPE = Object.freeze({
  cash: "💵",
  bank: "🏦",
  credit: "💳",
  ewallet: "📱",
  investment: "📈",
  other: "💼",
});

const DEFAULT_PRESET_ID_BY_TYPE = Object.freeze({
  cash: "cash_wallet",
  bank: "generic_bank",
  credit: "generic_credit",
  ewallet: "truemoney",
  investment: "generic_bank",
  other: "generic_bank",
});

const PRESET_UI_BY_ID = Object.freeze({
  cash_wallet: { label: "เงินสด", badge: "฿" },
  generic_bank: { label: "ธนาคารอื่น", badge: "อื่น" },
  generic_credit: { label: "บัตรอื่น", badge: "อื่น" },
  bbl: { label: "กรุงเทพ", badge: "BBL" },
  kbank: { label: "กสิกรไทย", badge: "KB" },
  ktb: { label: "กรุงไทย", badge: "KTB" },
  scb: { label: "ไทยพาณิชย์", badge: "SCB" },
  bay: { label: "กรุงศรี", badge: "BAY" },
  ttb: { label: "ttb", badge: "ttb" },
  uob: { label: "UOB", badge: "UOB" },
  cimb_thai: { label: "CIMB Thai", badge: "CIMB" },
  gsb: { label: "ออมสิน", badge: "GSB" },
  baac: { label: "ธ.ก.ส.", badge: "BAAC" },
  ghb: { label: "ธอส.", badge: "GHB" },
  kkp: { label: "KKP", badge: "KKP" },
  lh_bank: { label: "LH Bank", badge: "LH" },
  icbc_thai: { label: "ICBC Thai", badge: "ICBC" },
  truemoney: { label: "TrueMoney", badge: "TRUE" },
  line_bk: { label: "LINE BK", badge: "LINE" },
});

const PRESET_ORDER_BY_TYPE = Object.freeze({
  cash: ["cash_wallet", "truemoney"],
  bank: ["kbank", "scb", "bbl", "ktb", "bay", "ttb", "uob", "cimb_thai", "gsb", "baac", "ghb", "line_bk", "kkp", "lh_bank", "icbc_thai", "generic_bank"],
  credit: ["scb", "kbank", "bbl", "ktb", "bay", "ttb", "uob", "cimb_thai", "line_bk", "kkp", "generic_credit"],
});

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function listPresetTokens(preset) {
  return [
    preset?.id,
    preset?.displayName,
    preset?.shortName,
    preset?.defaultName,
    ...(Array.isArray(preset?.aliases) ? preset.aliases : []),
  ]
    .map(normalizeKey)
    .filter(Boolean);
}

function matchesPresetToken(preset, query) {
  const tokens = listPresetTokens(preset);
  if (!query || !tokens.length) return false;
  if (tokens.includes(query)) return true;
  return tokens.some((token) => token.includes(query) || query.includes(token));
}

function sortPresets(options, type) {
  const order = PRESET_ORDER_BY_TYPE[normalizeKey(type)] || [];
  const orderMap = new Map(order.map((id, index) => [id, index]));

  return [...options].sort((left, right) => {
    const leftRank = orderMap.has(left.id) ? orderMap.get(left.id) : 999;
    const rightRank = orderMap.has(right.id) ? orderMap.get(right.id) : 999;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return String(getPresetLabel(left)).localeCompare(String(getPresetLabel(right)), "th");
  });
}

export function getDefaultAccountIcon(type) {
  const key = normalizeKey(type);
  return DEFAULT_ICON_BY_TYPE[key] || DEFAULT_ICON_BY_TYPE.bank;
}

export function getDefaultPresetIdForAccountType(type) {
  const key = normalizeKey(type);
  return DEFAULT_PRESET_ID_BY_TYPE[key] || DEFAULT_PRESET_ID_BY_TYPE.bank;
}

export function getPresetOptionsForAccountType(type) {
  const options = getInstitutionOptionsByType(type);
  return options.length ? options : THAI_INSTITUTION_PRESETS;
}

export function getPresetOptionsForCreateFlow(type) {
  return sortPresets(getPresetOptionsForAccountType(type), type);
}

export function coerceInstitutionPreset(presetLike, preferredType = "") {
  if (!presetLike) return null;
  if (typeof presetLike === "string") {
    return getInstitutionPresetById(presetLike) || findInstitutionPresetByLabel(presetLike, preferredType);
  }
  return presetLike;
}

export function findInstitutionPresetByLabel(label, preferredType = "") {
  const query = normalizeKey(label);
  if (!query) return null;

  const preferred = getPresetOptionsForAccountType(preferredType);
  const exactMatch =
    preferred.find((preset) => listPresetTokens(preset).includes(query)) ||
    THAI_INSTITUTION_PRESETS.find((preset) => listPresetTokens(preset).includes(query));

  if (exactMatch) return exactMatch;

  return (
    preferred.find((preset) => matchesPresetToken(preset, query)) ||
    THAI_INSTITUTION_PRESETS.find((preset) => matchesPresetToken(preset, query)) ||
    null
  );
}

export function getPresetLabel(presetLike, preferredType = "") {
  const preset = coerceInstitutionPreset(presetLike, preferredType);
  if (!preset) return "";
  return PRESET_UI_BY_ID[preset.id]?.label || String(preset.displayName || preset.shortName || "").trim();
}

export function getPresetBadgeText(presetLike, preferredType = "") {
  const preset = coerceInstitutionPreset(presetLike, preferredType);
  if (!preset) return "AC";
  return PRESET_UI_BY_ID[preset.id]?.badge || String(preset.shortName || preset.displayName || "AC").trim().slice(0, 4);
}

export function getDefaultAccountNameFromPreset(presetLike, preferredType = "") {
  const preset = coerceInstitutionPreset(presetLike, preferredType);
  if (!preset) return "";
  const nextType = inferInstitutionAccountType(preset, preferredType);
  return getPresetLabel(preset, nextType) || getInstitutionDefaultName(preset, nextType);
}

export function resolvePresetForAccount(account) {
  if (!account || typeof account !== "object") return null;
  return findInstitutionPresetByLabel(
    account.institution_label || account.institutionLabel || account.name,
    account.type,
  );
}

export function applyPresetToAccountDraft(draft, presetLike, preferredType = "") {
  const preset = coerceInstitutionPreset(presetLike, preferredType || draft?.type);
  if (!preset) return draft;

  const nextType = inferInstitutionAccountType(preset, preferredType || draft?.type);
  const normalized = {
    ...draft,
    presetId: preset.id,
    type: nextType,
    institutionLabel: String(preset.displayName || preset.shortName || "").trim(),
    name: getDefaultAccountNameFromPreset(preset, nextType),
    color: preset.brandColor || draft?.color || "#0f766e",
    icon: draft?.icon || getDefaultAccountIcon(nextType),
  };

  if (nextType === "credit") {
    return {
      ...normalized,
      creditLimitSatang: draft?.creditLimitSatang || 0,
      statementDay: String(draft?.statementDay || "20"),
      dueDay: String(draft?.dueDay || "5"),
    };
  }

  return {
    ...normalized,
    creditLimitSatang: 0,
    statementDay: "",
    dueDay: "",
  };
}
