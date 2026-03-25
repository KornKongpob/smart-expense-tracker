const PRESETS = [
  {
    id: "cash_wallet",
    displayName: "Cash Wallet",
    shortName: "Cash",
    accountTypes: ["cash"],
    brandColor: "#0f8f64",
    logoSrc: "/institutions/cash-wallet.svg",
    aliases: ["cash", "wallet", "เงินสด", "กระเป๋าเงิน"],
    iconId: "cash",
    defaultVisual: "institution",
    defaultName: "เงินสด",
  },
  {
    id: "generic_bank",
    displayName: "Bank Account",
    shortName: "Bank",
    accountTypes: ["bank"],
    brandColor: "#1d4ed8",
    logoSrc: "/institutions/generic-bank.svg",
    aliases: ["bank", "บัญชีธนาคาร"],
    iconId: "bank",
    defaultVisual: "institution",
    defaultName: "บัญชีธนาคาร",
  },
  {
    id: "generic_credit",
    displayName: "Credit Card",
    shortName: "Card",
    accountTypes: ["credit"],
    brandColor: "#0f172a",
    logoSrc: "/institutions/generic-credit.svg",
    aliases: ["credit", "card", "บัตรเครดิต"],
    iconId: "card",
    defaultVisual: "institution",
    defaultName: "บัตรเครดิต",
  },
  {
    id: "bbl",
    displayName: "Bangkok Bank",
    shortName: "BBL",
    accountTypes: ["bank", "credit"],
    brandColor: "#1a4f9f",
    logoSrc: "/institutions/bbl.svg",
    aliases: ["bangkok bank", "bbl", "ธนาคารกรุงเทพ", "กรุงเทพ"],
    iconId: "bank",
    defaultVisual: "institution",
    defaultName: "Bangkok Bank",
  },
  {
    id: "kbank",
    displayName: "Kasikornbank",
    shortName: "KBank",
    accountTypes: ["bank", "credit"],
    brandColor: "#10a05d",
    logoSrc: "/institutions/kbank.svg",
    aliases: ["kasikornbank", "kbank", "kasikorn", "ธนาคารกสิกรไทย", "กสิกร", "กสิกรไทย"],
    iconId: "bank",
    defaultVisual: "institution",
    defaultName: "Kasikornbank",
  },
  {
    id: "ktb",
    displayName: "Krungthai",
    shortName: "KTB",
    accountTypes: ["bank", "credit"],
    brandColor: "#11a6e8",
    logoSrc: "/institutions/ktb.svg",
    aliases: ["krungthai", "ktb", "ธนาคารกรุงไทย", "กรุงไทย"],
    iconId: "bank",
    defaultVisual: "institution",
    defaultName: "Krungthai",
  },
  {
    id: "scb",
    displayName: "SCB",
    shortName: "SCB",
    accountTypes: ["bank", "credit"],
    brandColor: "#5b2e91",
    logoSrc: "/institutions/scb.svg",
    aliases: ["scb", "siam commercial bank", "ธนาคารไทยพาณิชย์", "ไทยพาณิชย์"],
    iconId: "bank",
    defaultVisual: "institution",
    defaultName: "SCB",
  },
  {
    id: "bay",
    displayName: "Krungsri",
    shortName: "BAY",
    accountTypes: ["bank", "credit"],
    brandColor: "#f2c300",
    logoSrc: "/institutions/bay.svg",
    aliases: ["krungsri", "bay", "bank of ayudhya", "กรุงศรี", "ธนาคารกรุงศรีอยุธยา"],
    iconId: "bank",
    defaultVisual: "institution",
    defaultName: "Krungsri",
  },
  {
    id: "ttb",
    displayName: "ttb",
    shortName: "ttb",
    accountTypes: ["bank", "credit"],
    brandColor: "#f06a2b",
    logoSrc: "/institutions/ttb.svg",
    aliases: ["ttb", "tmb thanachart", "ธนาคารทหารไทยธนชาต", "ทีทีบี"],
    iconId: "bank",
    defaultVisual: "institution",
    defaultName: "ttb",
  },
  {
    id: "uob",
    displayName: "UOB",
    shortName: "UOB",
    accountTypes: ["bank", "credit"],
    brandColor: "#0f4c9c",
    logoSrc: "/institutions/uob.svg",
    aliases: ["uob", "uob thai", "ยูโอบี"],
    iconId: "bank",
    defaultVisual: "institution",
    defaultName: "UOB",
  },
  {
    id: "cimb_thai",
    displayName: "CIMB Thai",
    shortName: "CIMB",
    accountTypes: ["bank", "credit"],
    brandColor: "#c81e35",
    logoSrc: "/institutions/cimb-thai.svg",
    aliases: ["cimb", "cimb thai", "ซีไอเอ็มบี ไทย", "ธนาคารซีไอเอ็มบีไทย"],
    iconId: "bank",
    defaultVisual: "institution",
    defaultName: "CIMB Thai",
  },
  {
    id: "gsb",
    displayName: "Government Savings Bank",
    shortName: "GSB",
    accountTypes: ["bank"],
    brandColor: "#ea6fa5",
    logoSrc: "/institutions/gsb.svg",
    aliases: ["gsb", "government savings bank", "ออมสิน", "ธนาคารออมสิน"],
    iconId: "bank",
    defaultVisual: "institution",
    defaultName: "ออมสิน",
  },
  {
    id: "baac",
    displayName: "BAAC",
    shortName: "BAAC",
    accountTypes: ["bank"],
    brandColor: "#0d8a4b",
    logoSrc: "/institutions/baac.svg",
    aliases: ["baac", "ธ.ก.ส.", "ธนาคารเพื่อการเกษตร", "ธกส"],
    iconId: "bank",
    defaultVisual: "institution",
    defaultName: "BAAC",
  },
  {
    id: "ghb",
    displayName: "Government Housing Bank",
    shortName: "GHB",
    accountTypes: ["bank"],
    brandColor: "#f08a24",
    logoSrc: "/institutions/ghb.svg",
    aliases: ["ghb", "government housing bank", "ธอส", "ธนาคารอาคารสงเคราะห์"],
    iconId: "bank",
    defaultVisual: "institution",
    defaultName: "GHB",
  },
  {
    id: "kkp",
    displayName: "KKP",
    shortName: "KKP",
    accountTypes: ["bank", "credit"],
    brandColor: "#6b3f24",
    logoSrc: "/institutions/kkp.svg",
    aliases: ["kkp", "kiatnakin phatra", "เกียรตินาคินภัทร"],
    iconId: "bank",
    defaultVisual: "institution",
    defaultName: "KKP",
  },
  {
    id: "lh_bank",
    displayName: "LH Bank",
    shortName: "LH",
    accountTypes: ["bank"],
    brandColor: "#6b8f3a",
    logoSrc: "/institutions/lh-bank.svg",
    aliases: ["lh bank", "แลนด์ แอนด์ เฮ้าส์", "แลนด์แอนด์เฮ้าส์", "lhb"],
    iconId: "bank",
    defaultVisual: "institution",
    defaultName: "LH Bank",
  },
  {
    id: "icbc_thai",
    displayName: "ICBC Thai",
    shortName: "ICBC",
    accountTypes: ["bank"],
    brandColor: "#cb2027",
    logoSrc: "/institutions/icbc-thai.svg",
    aliases: ["icbc", "icbc thai", "ไอซีบีซี", "ไอซีบีซี ไทย"],
    iconId: "bank",
    defaultVisual: "institution",
    defaultName: "ICBC Thai",
  },
  {
    id: "truemoney",
    displayName: "TrueMoney Wallet",
    shortName: "TrueMoney",
    accountTypes: ["cash", "bank"],
    brandColor: "#f97316",
    logoSrc: "/institutions/truemoney.svg",
    aliases: ["truemoney", "true money", "true wallet", "ทรูมันนี่", "ทรูวอลเล็ท"],
    iconId: "digital",
    defaultVisual: "institution",
    defaultName: "TrueMoney Wallet",
  },
  {
    id: "line_bk",
    displayName: "LINE BK",
    shortName: "LINE BK",
    accountTypes: ["bank", "credit"],
    brandColor: "#00b900",
    logoSrc: "/institutions/line-bk.svg",
    aliases: ["line bk", "linebk", "ไลน์ บีเค", "ไลน์บีเค"],
    iconId: "digital",
    defaultVisual: "institution",
    defaultName: "LINE BK",
  },
];

export const THAI_INSTITUTION_PRESETS = PRESETS;

export const THAI_INSTITUTION_PRESET_MAP = Object.freeze(
  Object.fromEntries(PRESETS.map((preset) => [preset.id, preset]))
);

export function getInstitutionPresetById(id) {
  const key = String(id || "").trim();
  return key ? THAI_INSTITUTION_PRESET_MAP[key] || null : null;
}

export function getInstitutionOptionsByType(type) {
  const key = String(type || "").trim();
  if (!key) return THAI_INSTITUTION_PRESETS;
  return THAI_INSTITUTION_PRESETS.filter((preset) => (preset.accountTypes || []).includes(key));
}

export function inferInstitutionAccountType(preset, preferredType) {
  const preferred = String(preferredType || "").trim();
  if (preferred && (preset?.accountTypes || []).includes(preferred)) return preferred;
  return String(preset?.accountTypes?.[0] || preferred || "bank");
}

export function getInstitutionChipLabel(preset) {
  if (!preset) return "";
  return String(preset.shortName || preset.displayName || "").trim();
}

export function getInstitutionDefaultName(preset, type) {
  if (!preset) return "";
  const accountType = inferInstitutionAccountType(preset, type);
  if (preset.id === "generic_credit") return "บัตรเครดิต";
  if (preset.id === "generic_bank") return "บัญชีธนาคาร";
  if (preset.id === "cash_wallet") return "เงินสด";
  if (accountType === "credit") return `${preset.shortName || preset.displayName} Card`;
  return String(preset.defaultName || preset.displayName || "").trim();
}
