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

export function coerceInstitutionPreset(presetLike, preferredType = "") {
  if (!presetLike) return null;
  if (typeof presetLike === "string") {
    return (
      getInstitutionPresetById(presetLike) ||
      findInstitutionPresetByLabel(presetLike, preferredType)
    );
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
    name: getInstitutionDefaultName(preset, nextType),
    color: preset.brandColor || draft?.color || "#0f766e",
    icon: getDefaultAccountIcon(nextType),
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
