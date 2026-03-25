// src/views/AccountsView.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { parseDigitsList, choosePrimaryDigits } from "../utils/accountMatch";
import { useAppStore } from "../store/store.jsx";
import { calcAccountBalance } from "../store/selectors.js";
import { formatCurrency, toISODate } from "../utils/format";
import { parseMoneyToSatang, sanitizeMoneyInput, formatMoneyInputFromSatang } from "../utils/money";
import { ACCOUNT_COLORS, ACCOUNT_ICONS, EMOJI_PRESETS } from "../constants/presets.jsx";
import {
  getInstitutionChipLabel,
  getInstitutionDefaultName,
  getInstitutionOptionsByType,
  getInstitutionPresetById,
  inferInstitutionAccountType,
  THAI_INSTITUTION_PRESETS,
} from "../constants/institutions";
import {
  Plus,
  Trash2,
  Pencil,
  CreditCard,
  Banknote,
  Wallet,
  Sparkles,
  Image as ImageIcon,
  Search,
  X,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

import AppHeader from "../components/AppHeader";
import AccountAvatar from "../components/AccountAvatar.jsx";
import InstitutionLogo from "../components/InstitutionLogo.jsx";
import { useLockBodyScroll } from "../utils/useLockBodyScroll";

// ===== Visual helpers =====
const isImageSrc = (v) => {
  const s = String(v || "").trim();
  return s.startsWith("data:image/") || s.startsWith("http://") || s.startsWith("https://");
};

const resolvePresetIcon = (iconId) => {
  const id = String(iconId || "").trim();
  if (!id) return null;
  const found = (ACCOUNT_ICONS || []).find((x) => String(x?.id || "") === id);
  return found?.icon || null;
};

const defaultEmojiForType = (t) => {
  if (t === "cash") return "💵";
  if (t === "bank") return "🏦";
  if (t === "credit") return "💳";
  return "💳";
};

const defaultIconIdForType = (t) => {
  if (t === "cash") return "cash";
  if (t === "bank") return "bank";
  if (t === "credit") return "card";
  return "wallet";
};

const defaultInstitutionIdForType = (t) => {
  if (t === "cash") return "cash_wallet";
  if (t === "credit") return "generic_credit";
  return "generic_bank";
};

const pickRandomColor = () => {
  const palette = Array.isArray(ACCOUNT_COLORS) && ACCOUNT_COLORS.length ? ACCOUNT_COLORS : ["#111827"];
  return palette[Math.floor(Math.random() * palette.length)];
};

const shadeHex = (hex, pct = -18) => {
  const h = String(hex || "#111827").trim();
  const m = h.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return h;
  const clamp = (n) => Math.min(255, Math.max(0, n));
  const r = clamp(parseInt(m[1], 16) + Math.round((pct / 100) * 255));
  const g = clamp(parseInt(m[2], 16) + Math.round((pct / 100) * 255));
  const b = clamp(parseInt(m[3], 16) + Math.round((pct / 100) * 255));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
};

function InstitutionPicker({ type, value, onSelect }) {
  const options = useMemo(() => {
    const list = getInstitutionOptionsByType(type);
    return list.length ? list : THAI_INSTITUTION_PRESETS;
  }, [type]);

  return (
    <div className="mt-4 ui-card p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-black text-gray-900">Preset สถาบันการเงิน</div>
          <div className="mt-1 text-xs font-bold text-gray-700/70">
            เลือกสถาบันก่อน ระบบจะตั้งชื่อ สี และชนิดบัญชีให้เหมาะอัตโนมัติ
          </div>
        </div>
        <div className="ui-chip bg-white/70 border-gray-900/10">
          {type === "credit" ? "โหมดบัตรเครดิต" : type === "cash" ? "โหมดเงินสด/วอลเล็ท" : "โหมดบัญชีธนาคาร"}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {options.map((preset) => {
          const selected = String(value || "") === String(preset.id || "");
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelect?.(preset)}
              data-testid={`institution-${preset.id}`}
              className={[
                "rounded-[1.35rem] border p-3 text-left transition-all active:scale-[0.985]",
                selected
                  ? "bg-slate-950 text-white border-slate-950 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.7)]"
                  : "bg-white/75 border-slate-900/10 text-slate-900 hover:bg-white",
              ].join(" ")}
            >
              <div className="flex items-start gap-3">
                <InstitutionLogo
                  institutionId={preset.id}
                  alt={preset.displayName}
                  className="w-11 h-11 rounded-2xl shrink-0"
                  imgClassName="h-full w-full object-contain"
                />
                <div className="min-w-0">
                  <div className="text-[13px] font-black truncate">{preset.displayName}</div>
                  <div className={selected ? "mt-1 text-[11px] font-bold text-white/72" : "mt-1 text-[11px] font-bold text-gray-700/60"}>
                    {(preset.accountTypes || []).join(" • ")}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AccountVisualPreview({ name, type, currency, color, mode, iconId, emoji, image, institutionId }) {
  const bg = String(color || "#111827");
  const bg2 = shadeHex(bg, -14);
  const institution = getInstitutionPresetById(institutionId);

  const iconNode = (() => {
    if (institutionId) {
      return (
        <InstitutionLogo
          institutionId={institutionId}
          alt={String(name || "").trim()}
          className="w-full h-full"
          imgClassName="w-full h-full object-contain"
        />
      );
    }
    if (mode === "image" && isImageSrc(image)) {
      return (
        <img
          src={String(image)}
          alt=""
          className="w-full h-full object-cover"
          draggable={false}
        />
      );
    }
    if (mode === "preset") {
      const preset = resolvePresetIcon(iconId);
      if (preset) return <span className="text-white">{preset}</span>;
    }
    const raw = String(emoji || "").trim() || defaultEmojiForType(type);
    return <span className="text-white text-[22px] leading-none drop-shadow">{raw}</span>;
  })();

  return (
    <div
      className="ui-card-strong p-4 overflow-hidden"
      style={{
        background:
          `radial-gradient(900px 300px at 15% 0%, rgba(255,255,255,0.22), transparent 60%), ` +
          `linear-gradient(135deg, ${bg}, ${bg2})`,
        borderColor: "rgba(255,255,255,0.18)",
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-14 h-14 rounded-3xl overflow-hidden flex items-center justify-center border border-white/15 shadow-lg shrink-0"
          style={{ background: "rgba(255,255,255,0.10)" }}
          aria-hidden="true"
        >
          {iconNode}
        </div>
        <div className="min-w-0">
          <div className="text-base font-black text-white truncate">{String(name || "").trim() || "บัญชีใหม่"}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className="ui-chip"
              style={{
                background: "rgba(255,255,255,0.14)",
                borderColor: "rgba(255,255,255,0.18)",
                color: "white",
              }}
            >
              {typeLabel(type)}
            </span>
            <span
              className="ui-chip"
              style={{
                background: "rgba(255,255,255,0.14)",
                borderColor: "rgba(255,255,255,0.18)",
                color: "white",
              }}
            >
              {currencyLabel(currency)}
            </span>
            {institution ? (
              <span
                className="ui-chip"
                style={{
                  background: "rgba(255,255,255,0.14)",
                  borderColor: "rgba(255,255,255,0.18)",
                  color: "white",
                }}
              >
                {getInstitutionChipLabel(institution)}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountSheetModal({ open, title, description, onClose, children }) {
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/35 p-3 overflow-x-hidden overscroll-none"
      onTouchMove={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <div
        className="w-full max-w-xl ui-card-strong shadow-2xl max-h-[92dvh] overflow-hidden flex flex-col"
        style={{ touchAction: "pan-y" }}
      >
        <div className="p-4 border-b border-slate-900/8 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg font-extrabold text-gray-900">{title}</div>
              {description ? (
                <div className="text-xs text-gray-800/65 font-semibold mt-1 leading-relaxed">
                  {description}
                </div>
              ) : null}
            </div>
            <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary px-3" title="ปิด">
              <X size={18} />
            </button>
          </div>
        </div>

        <div
          className="px-4 pb-4 flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {children}
          <div className="h-3 pb-safe" />
        </div>
      </div>
    </div>,
    document.body
  );
}

function AccountVisualPicker({
  type,
  mode,
  setMode,
  iconId,
  setIconId,
  emoji,
  setEmoji,
  image,
  setImage,
  color,
  setColor,
  onRandomColor,
}) {
  const [emojiSearch, setEmojiSearch] = useState("");

  const emojiList = useMemo(() => {
    const list = Array.isArray(EMOJI_PRESETS) ? EMOJI_PRESETS : [];
    const s = String(emojiSearch || "").trim();
    if (!s) return list;
    return list.filter((x) => String(x).includes(s));
  }, [emojiSearch]);

  return (
    <div className="mt-4 ui-card p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-black text-gray-900">รูปลักษณ์บัญชี</div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setMode("preset")}
            className={`ui-chip ${mode === "preset" ? "bg-white/90" : ""}`}
          >
            ชุดไอคอน
          </button>
          <button
            type="button"
            onClick={() => setMode("emoji")}
            className={`ui-chip ${mode === "emoji" ? "bg-white/90" : ""}`}
          >
            Emoji
          </button>
          <button
            type="button"
            onClick={() => setMode("image")}
            className={`ui-chip ${mode === "image" ? "bg-white/90" : ""}`}
          >
            รูป
          </button>
        </div>
      </div>

      {mode === "preset" ? (
        <div className="mt-3">
          <div className="text-xs font-extrabold text-gray-800/70">เลือกไอคอน</div>
          <div className="mt-2 grid grid-cols-4 sm:grid-cols-6 gap-2">
            {(ACCOUNT_ICONS || []).map((it) => {
              const selected = String(iconId || "") === String(it?.id || "");
              return (
                <button
                  type="button"
                  key={it.id}
                  onClick={() => setIconId(String(it.id))}
                  className={`relative min-h-[44px] rounded-2xl border text-gray-900 flex flex-col items-center justify-center gap-1 px-2 py-2 overflow-hidden ${
                    selected
                      ? "bg-white/95 border-gray-900/25 ring-4 ring-indigo-300/60"
                      : "bg-white/50 border-gray-900/10 hover:bg-white/70"
                  }`}
                  title={it.name}
                  aria-pressed={selected}
                >
                  {selected ? (
                    <span className="absolute top-1 right-1">
                      <CheckCircle2 size={18} className="text-indigo-700 drop-shadow" />
                    </span>
                  ) : null}
                  <span className="text-gray-900">{it.icon}</span>
                  <span className="text-[10px] font-extrabold text-gray-800/70 truncate max-w-full">{it.name}</span>
                </button>
              );
            })}
          </div>

          {(() => {
            const it = (ACCOUNT_ICONS || []).find((x) => String(x?.id || "") === String(iconId || ""));
            if (!it) return null;
            return (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="ui-chip bg-white/70 border-gray-900/10">
                  เลือกอยู่: <span className="ml-1 font-black text-gray-900">{it.name}</span>
                </span>
              </div>
            );
          })()}

          <div className="mt-2 ui-help">
            แนะนำ: {type === "bank" ? "ธนาคาร" : type === "cash" ? "เงินสด" : type === "credit" ? "บัตรเครดิต" : "กระเป๋า"}
          </div>
        </div>
      ) : null}

      {mode === "emoji" ? (
        <div className="mt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="ui-label">Emoji</label>
              <input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                className="ui-input"
                placeholder={defaultEmojiForType(type)}
              />
              <div className="ui-help mt-1">ใส่ 1 ตัว (หรือ 2 ตัว) เพื่อเป็นรูปบัญชี</div>
            </div>
            <div>
              <label className="ui-label">ค้นหา (ไม่บังคับ)</label>
              <input
                value={emojiSearch}
                onChange={(e) => setEmojiSearch(e.target.value)}
                className="ui-input"
                placeholder="วาง emoji เพื่อกรอง"
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-8 sm:grid-cols-10 gap-1.5">
            {emojiList.slice(0, 60).map((em) => {
              const selected = String(emoji || "").trim() === String(em);
              return (
                <button
                  type="button"
                  key={em}
                  onClick={() => setEmoji(String(em))}
                  className={`relative h-10 w-10 rounded-2xl flex items-center justify-center border ${
                    selected
                      ? "bg-white/95 border-gray-900/25 ring-4 ring-indigo-300/60"
                      : "bg-white/50 border-gray-900/10 hover:bg-white/70"
                  }`}
                  title={String(em)}
                  aria-pressed={selected}
                >
                  {selected ? (
                    <span className="absolute -top-1 -right-1">
                      <CheckCircle2 size={18} className="text-indigo-700 drop-shadow" />
                    </span>
                  ) : null}
                  <span className="text-[18px] leading-none">{em}</span>
                </button>
              );
            })}
          </div>

          {String(emoji || "").trim() ? (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="ui-chip bg-white/70 border-gray-900/10">
                เลือกอยู่: <span className="ml-1 font-black text-gray-900">{String(emoji || "").trim()}</span>
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "image" ? (
        <div className="mt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="ui-label">อัปโหลดรูป</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files && e.target.files[0];
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const src = String(reader.result || "");
                    setImage(src);
                  };
                  reader.readAsDataURL(f);
                }}
                className="ui-input"
              />
              <div className="ui-help mt-1">แนะนำรูปสี่เหลี่ยมจัตุรัส (จะครอปอัตโนมัติ)</div>
            </div>
            <div>
              <label className="ui-label">หรือใส่ลิงก์รูป</label>
              <input
                value={isImageSrc(image) ? image : ""}
                onChange={(e) => setImage(e.target.value)}
                className="ui-input"
                placeholder="https://... หรือ data:image/..."
              />
            </div>
          </div>

          {isImageSrc(image) ? (
            <div className="mt-3 flex items-center gap-3">
              <div className="w-14 h-14 rounded-3xl overflow-hidden border border-gray-900/10 bg-white/70 shadow-sm">
                <img src={String(image)} alt="" className="w-full h-full object-cover" draggable={false} />
              </div>
              <button type="button" className="ui-btn ui-btn-secondary" onClick={() => setImage("")}
              >
                ลบรูป
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs font-extrabold text-gray-800/70">สีบัญชี</div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={String(color || "#111827")}
              onChange={(e) => setColor(e.target.value)}
              className="w-12 h-11 rounded-2xl bg-transparent border border-gray-900/10 overflow-hidden"
              title="เลือกสี"
            />
            <button type="button" onClick={onRandomColor} className="ui-btn ui-btn-secondary">
              <Sparkles size={18} />
              สุ่มสี
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {(ACCOUNT_COLORS || []).slice(0, 16).map((c) => {
            const selected = String(c).toLowerCase() === String(color || "").toLowerCase();
            return (
              <button
                key={c}
                type="button"
                className={`w-10 h-10 rounded-2xl border shadow-sm ${selected ? "ring-4 ring-indigo-300" : ""}`}
                style={{ background: c, borderColor: "rgba(15, 23, 42, 0.12)" }}
                onClick={() => setColor(c)}
                title={c}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * AccountsView
 * - Manage accounts (cash/bank/credit)
 * - Supports matching digits for better auto-mapping from OCR/receipt parsing
 */

// digits parsing helpers are centralized in src/utils/accountMatch.js (parseDigitsList, choosePrimaryDigits)

function formatDigitsChip(d) {
  const s = String(d || "").trim();
  if (!s) return "";
  if (s.length <= 6) return s;
  return `•••• ${s.slice(-4)}`;
}

const currencyLabel = (c) => {
  if (c === "THB") return "THB (฿)";
  if (c === "USD") return "USD ($)";
  if (c === "EUR") return "EUR (€)";
  return c || "THB (฿)";
};

const typeLabel = (t) => {
  if (t === "cash") return "เงินสด";
  if (t === "bank") return "บัญชีธนาคาร";
  if (t === "credit") return "บัตรเครดิต";
  return t || "-";
};

const typeIcon = (t) => {
  if (t === "cash") return <Banknote size={18} />;
  if (t === "bank") return <Wallet size={18} />;
  if (t === "credit") return <CreditCard size={18} />;
  return <Wallet size={18} />;
};

const formatMoney = (n, currency = "THB") => {
  if (String(currency || "THB").toUpperCase() === "THB") return formatCurrency(Number(n || 0));
  const v = Number(n || 0);
  try {
    return new Intl.NumberFormat("th-TH", {
      style: "currency",
      currency: currency || "THB",
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency || "THB"}`;
  }
};

// keep legacy function name used throughout the view
const randomColor = () => pickRandomColor();

const generateId = () => {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export default function AccountsView({ showAlert: showAppAlert, showConfirm }) {
  const store = useAppStore();
  const accounts = useMemo(() => store.state.accounts || [], [store.state.accounts]);
  const { addAccount, updateAccount, deleteAccount, adjustAccountBalance } = store;

  const [q, setQ] = useState("");

  // Alerts
  // - Prefer global toast (App-level) for consistency across the app.
  // - Keep a local fallback (e.g., if the view is rendered standalone).
  const [alertMsg, setAlertMsg] = useState("");
  const [alertType, setAlertType] = useState("ok"); // ok | warn
  const alertTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
    };
  }, []);

  const showLocalAlert = (msg, type = "ok") => {
    const m = String(msg || "");
    setAlertMsg(m);
    setAlertType(type);
    if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
    if (m) {
      alertTimerRef.current = window.setTimeout(() => setAlertMsg(""), 2400);
    }
  };

  const notify = (msg, type = "ok") => {
    if (typeof showAppAlert === "function") return showAppAlert(String(msg || ""));
    return showLocalAlert(msg, type);
  };

  const forceSignNumberString = (val, sign = 1) => {
    const s = String(val || "").trim();
    const abs = s.replace(/^-/, "");
    if (!abs) return sign < 0 ? "-" : "";
    return sign < 0 ? `-${abs}` : abs;
  };

  // Create modal
  const [openCreate, setOpenCreate] = useState(false);
  const [cName, setCName] = useState("");
  const [cType, setCType] = useState("bank");
  const [cInstitutionId, setCInstitutionId] = useState(defaultInstitutionIdForType("bank"));
  const [cCurrency, setCCurrency] = useState("THB");
  const [cAccountNumber, setCAccountNumber] = useState("");
  // visual
  const [cIconMode, setCIconMode] = useState("preset"); // preset | emoji | image
  const [cIconId, setCIconId] = useState(defaultIconIdForType("bank"));
  const [cIcon, setCIcon] = useState(defaultEmojiForType("bank")); // legacy emoji fallback
  const [cImage, setCImage] = useState("");
  const [cColor, setCColor] = useState(randomColor());

  // ✅ Opening balance (create)
  const [cInitialBalance, setCInitialBalance] = useState("");
  const [openCreateAdjustConfirm, setOpenCreateAdjustConfirm] = useState(false);
  const [pendingCreateAccount, setPendingCreateAccount] = useState(null);
  const [pendingCreateAdjust, setPendingCreateAdjust] = useState(null);

  // credit-only fields
  const [cCreditLimit, setCCreditLimit] = useState("");
  const [cStatementDay, setCStatementDay] = useState(20);
  const [cDueDay, setCDueDay] = useState(5);

  const resetCreate = () => {
    setCName("");
    setCType("bank");
    setCInstitutionId(defaultInstitutionIdForType("bank"));
    setCCurrency("THB");
    setCAccountNumber("");
    setCInitialBalance("");
    setOpenCreateAdjustConfirm(false);
    setPendingCreateAccount(null);
    setPendingCreateAdjust(null);
    setCIconMode("preset");
    setCIconId(defaultIconIdForType("bank"));
    setCIcon(defaultEmojiForType("bank"));
    setCImage("");
    setCColor(randomColor());
    setCCreditLimit("");
    setCStatementDay(20);
    setCDueDay(5);
  };

  const applyCreateInstitution = (presetLike) => {
    const preset = typeof presetLike === "string" ? getInstitutionPresetById(presetLike) : presetLike;
    if (!preset) return;
    const nextType = inferInstitutionAccountType(preset, cType);
    setCInstitutionId(preset.id);
    setCType(nextType);
    setCColor(preset.brandColor || randomColor());
    setCName(getInstitutionDefaultName(preset, nextType));
    setCIconMode("preset");
    setCIconId(String(preset.iconId || defaultIconIdForType(nextType)));
    setCIcon(defaultEmojiForType(nextType));
    if ((preset.accountTypes || []).includes("cash")) setCCurrency("THB");
  };

  // auto-suggest icon when changing account type (create modal only)
  useEffect(() => {
    if (!openCreate) return;
    // keep emoji fallback aligned
    if (cIconMode !== "emoji") setCIcon(defaultEmojiForType(cType));
    // if using preset and icon is one of the default set, follow the type
    if (cIconMode === "preset") {
      const defaults = new Set(["cash", "bank", "card"]);
      if (!cIconId || defaults.has(String(cIconId))) {
        setCIconId(defaultIconIdForType(cType));
      }
    }
    // image mode does not auto-change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cType, openCreate, cIconMode]);

  useEffect(() => {
    if (!openCreate) return;
    const preset = getInstitutionPresetById(cInstitutionId);
    if (preset && (preset.accountTypes || []).includes(cType)) return;
    setCInstitutionId(defaultInstitutionIdForType(cType));
  }, [cInstitutionId, cType, openCreate]);

const create = () => {
  if (!cName.trim()) return notify("กรุณาใส่ชื่อบัญชี", "warn");

  const matchDigits = parseDigitsList(cAccountNumber);
  const primaryDigits = choosePrimaryDigits(matchDigits);

  const baseAccount = {
    id: generateId(),
    name: cName.trim(),
    institutionId: cInstitutionId,
    // keep emoji as fallback for legacy rendering
    icon: (String(cIcon || "").trim() || defaultEmojiForType(cType)).slice(0, 4),
    iconId: cIconMode === "preset" ? String(cIconId || defaultIconIdForType(cType)) : "",
    image: cIconMode === "image" && isImageSrc(cImage) ? String(cImage) : "",
    color: cColor,
    type: cType,
    currency: cCurrency,
    accountNumber: primaryDigits ? String(primaryDigits).slice(-16) : "",
    matchDigits,

    // credit only
    creditLimit: cType === "credit" ? parseMoneyToSatang(cCreditLimit) : undefined,
    statementDay: cType === "credit" ? Number(cStatementDay || 1) : undefined,
    dueDay: cType === "credit" ? Number(cDueDay || 1) : undefined,

    // default openingBalance will be set based on user's choice
    openingBalance: 0,
  };

  const initRaw = String(cInitialBalance || "").trim();
  if (initRaw && initRaw !== "-") {
    const desired = parseMoneyToSatang(initRaw);
    if (desired !== 0) {
      setPendingCreateAccount(baseAccount);
      setPendingCreateAdjust({
        accountId: baseAccount.id,
        currency: cCurrency || "THB",
        current: 0,
        desired,
        delta: desired,
      });
      setOpenCreateAdjustConfirm(true);
      return;
    }
  }

  addAccount(baseAccount);

  resetCreate();
  setOpenCreate(false);
  notify("เพิ่มบัญชีแล้ว");
};


  // Edit modal
  const [openEdit, setOpenEdit] = useState(false);
  const [eEditing, setEEditing] = useState(null);
  const [eName, setEName] = useState("");
  const [eType, setEType] = useState("bank");
  const [eInstitutionId, setEInstitutionId] = useState(defaultInstitutionIdForType("bank"));
  const [eCurrency, setECurrency] = useState("THB");
  const [eAccountNumber, setEAccountNumber] = useState("");
  // visual
  const [eIconMode, setEIconMode] = useState("preset"); // preset | emoji | image
  const [eIconId, setEIconId] = useState("");
  const [eIcon, setEIcon] = useState("💳"); // legacy emoji fallback
  const [eImage, setEImage] = useState("");
  const [eColor, setEColor] = useState("#111827");

  // credit-only edit fields
  const [eCreditLimit, setECreditLimit] = useState("");
  const [eStatementDay, setEStatementDay] = useState(20);
  const [eDueDay, setEDueDay] = useState(5);

  // ✅ Adjust balance UI
  const [eDesiredBalance, setEDesiredBalance] = useState("");
  const [openAdjustConfirm, setOpenAdjustConfirm] = useState(false);
  const [pendingEdit, setPendingEdit] = useState(null);
  const [pendingAdjust, setPendingAdjust] = useState(null);

  // Prevent background scroll when any sheet/modal is open.
  useLockBodyScroll(!!openCreate || !!openEdit || !!openCreateAdjustConfirm || !!openAdjustConfirm);

  const openEditModal = (acc) => {
    setEEditing(acc?.id || null);
    setEName(acc?.name || "");
    setEType(acc?.type || "bank");
    setEInstitutionId(acc?.institutionId || defaultInstitutionIdForType(acc?.type || "bank"));
    setECurrency(acc?.currency || "THB");
    setEAccountNumber(Array.isArray(acc.matchDigits) && acc.matchDigits.length ? acc.matchDigits.join(", ") : String(acc.accountNumber || ""));
    const hasImg = isImageSrc(acc?.image) || isImageSrc(acc?.icon);
    const hasPreset = String(acc?.iconId || "").trim();
    setEIconMode(hasImg ? "image" : hasPreset ? "preset" : "emoji");
    setEIconId(String(acc?.iconId || ""));
    setEIcon(acc?.icon || defaultEmojiForType(acc?.type));
    setEImage(String(acc?.image || (isImageSrc(acc?.icon) ? acc?.icon : "")));
    setEColor(acc?.color || "#111827");

    setECreditLimit(acc?.creditLimit != null ? formatMoneyInputFromSatang(acc.creditLimit, { emptyIfZero: true }) : "");
    setEStatementDay(acc?.statementDay != null ? Number(acc.statementDay) : 20);
    setEDueDay(acc?.dueDay != null ? Number(acc.dueDay) : 5);

    setEDesiredBalance("");
    setOpenAdjustConfirm(false);
    setPendingEdit(null);
    setPendingAdjust(null);

    setOpenEdit(true);
  };

  const closeEditModal = () => {
    setOpenEdit(false);
    setEEditing(null);
    setEName("");
    setEType("bank");
    setEInstitutionId(defaultInstitutionIdForType("bank"));
    setECurrency("THB");
    setEAccountNumber("");
    setEIconMode("preset");
    setEIconId("");
    setEIcon("💳");
    setEImage("");
    setEColor("#111827");
    setECreditLimit("");
    setEStatementDay(20);
    setEDueDay(5);
  };

  const applyEditInstitution = (presetLike) => {
    const preset = typeof presetLike === "string" ? getInstitutionPresetById(presetLike) : presetLike;
    if (!preset) return;
    const nextType = inferInstitutionAccountType(preset, eType);
    setEInstitutionId(preset.id);
    setEType(nextType);
    setEColor(preset.brandColor || "#111827");
    setEName(getInstitutionDefaultName(preset, nextType));
    setEIconMode("preset");
    setEIconId(String(preset.iconId || defaultIconIdForType(nextType)));
    setEIcon(defaultEmojiForType(nextType));
    if ((preset.accountTypes || []).includes("cash")) setECurrency("THB");
  };

  useEffect(() => {
    if (!openEdit) return;
    const preset = getInstitutionPresetById(eInstitutionId);
    if (preset && (preset.accountTypes || []).includes(eType)) return;
    setEInstitutionId(defaultInstitutionIdForType(eType));
  }, [eInstitutionId, eType, openEdit]);

  const saveEdit = () => {
    if (!eEditing) return;
    if (!eName.trim()) return notify("กรุณาใส่ชื่อบัญชี", "warn");

    const matchDigits = parseDigitsList(eAccountNumber);
    const primaryDigits = choosePrimaryDigits(matchDigits);

    const partial = {
      id: eEditing,
      name: eName.trim(),
      institutionId: eInstitutionId,
      // keep emoji as fallback for legacy rendering
      icon: (String(eIcon || "").trim() || defaultEmojiForType(eType)).slice(0, 4),
      iconId: eIconMode === "preset" ? String(eIconId || defaultIconIdForType(eType)) : "",
      image: eIconMode === "image" && isImageSrc(eImage) ? String(eImage) : "",
      color: eColor,
      type: eType,
      currency: eCurrency,
      accountNumber: primaryDigits ? String(primaryDigits).slice(-16) : "",
      matchDigits,

      // credit only
      creditLimit: eType === "credit" ? parseMoneyToSatang(eCreditLimit) : undefined,
      statementDay: eType === "credit" ? Number(eStatementDay || 1) : undefined,
      dueDay: eType === "credit" ? Number(eDueDay || 1) : undefined,
    };

    const desiredRaw = String(eDesiredBalance || "").trim();
    if (!desiredRaw || desiredRaw === "-") {
      updateAccount(partial);
      closeEditModal();
      notify("บันทึกแล้ว");
      return;
    }

    const desired = parseMoneyToSatang(desiredRaw);

    const current = calcAccountBalance(store.state.accounts, store.state.transactions, eEditing);
    const delta = desired - current;

    if (delta === 0) {
      updateAccount(partial);
      closeEditModal();
      notify("บันทึกแล้ว");
      return;
    }

    setPendingEdit(partial);
    setPendingAdjust({
      accountId: eEditing,
      currency: eCurrency || "THB",
      current,
      desired,
      delta,
    });
    setOpenAdjustConfirm(true);
  };

  const del = (id) => {
    if (!id) return;

    const message =
      "ลบบัญชีนี้?\n\nระบบจะลบรายการธุรกรรมทั้งหมดของบัญชีนี้ด้วย (รวมถึงรายการโอนที่เกี่ยวข้อง)";

    const doDelete = () => {
      deleteAccount(id);
      notify("ลบบัญชีแล้ว", "warn");
    };

    if (typeof showConfirm === "function") {
      showConfirm("ลบบัญชี", message, doDelete, true, { confirmText: "ลบ" });
      return;
    }

    if (window.confirm(message)) doDelete();
  };

  const filtered = useMemo(() => {
    const list = Array.isArray(accounts) ? accounts : [];
    const s = q.trim().toLowerCase();
    if (!s) return list;

    return list.filter((a) => {
      const name = String(a?.name || "").toLowerCase();
      const type = String(a?.type || "").toLowerCase();
      const cur = String(a?.currency || "").toLowerCase();
      const accNo = String(a?.accountNumber || "").toLowerCase();
      const md = Array.isArray(a?.matchDigits) ? a.matchDigits.join(",").toLowerCase() : "";
      return (
        name.includes(s) ||
        type.includes(s) ||
        cur.includes(s) ||
        accNo.includes(s) ||
        md.includes(s)
      );
    });
  }, [accounts, q]);

  // Small keyboard helpers
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (openCreate) setOpenCreate(false);
        if (openEdit) closeEditModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCreate, openEdit]);

  return (
    <div className="min-h-dvh">
      <AppHeader
        title="บัญชี"
        subtitle="จัดการบัญชี บัตร และเลขช่วยจำสำหรับสลิป"
        right={
          <button
            type="button"
            onClick={() => {
              resetCreate();
              setOpenCreate(true);
            }}
            data-testid="accounts-add"
            className="ui-btn ui-btn-primary active:scale-[0.99]"
          >
            <Plus size={18} />
            เพิ่ม
          </button>
        }
      />

      <main className="ui-page pt-4 pb-6">
        {/* Header Card */}
      <div className="mt-4 ui-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-black text-gray-900">คำแนะนำ</div>
            <div className="text-xs text-gray-800/60 font-bold mt-1 leading-relaxed">
              แนะนำใส่ <span className="font-black text-gray-900">เลขท้าย 4–6 หลัก</span> จากสลิป
              และถ้ามีหลายแบบให้ใส่หลายชุด เช่น <span className="font-black text-gray-900">6345, 4373</span>
            </div>
          </div>

          <div className="hidden sm:block" aria-hidden="true" />
        </div>

        {/* Search */}
        <div className="mt-4 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-2xl px-3 py-2 bg-white/30 border border-white/20">
            <Search size={18} className="text-gray-900/70" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาชื่อ/ประเภท/สกุลเงิน/เลขช่วยจำ..."
              className="w-full bg-transparent outline-none text-sm font-extrabold text-gray-900 placeholder:text-gray-800/40"
            />
          </div>
          {q ? (
            <button
              onClick={() => setQ("")}
              className="p-2 rounded-2xl bg-white/30 border border-white/20 text-gray-900 active:scale-[0.98]"
              title="ล้าง"
            >
              <X size={18} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Alert */}
      {alertMsg ? (
        <div
          className={`mt-3 glass-card rounded-2xl p-3 border border-white/20 shadow-xl flex items-center gap-2 ${
            alertType === "ok" ? "bg-white/35" : "bg-amber-200/30"
          }`}
        >
          {alertType === "ok" ? (
            <CheckCircle2 size={18} className="text-green-700" />
          ) : (
            <AlertTriangle size={18} className="text-amber-700" />
          )}
          <div className="text-sm font-extrabold text-gray-900">{alertMsg}</div>
        </div>
      ) : null}

{/* Accounts balance + grouped list */}
<div className="mt-4 space-y-4">
  {(() => {
    const accs = Array.isArray(filtered) ? filtered : [];
    const txs = store.state.transactions || [];
    const allAccs = store.state.accounts || [];

    const withBalance = accs.map((a) => ({
      ...a,
      balance: calcAccountBalance(allAccs, txs, a.id),
    }));

    const normalizeType = (t) => {
      const s = String(t || "").toLowerCase().trim();
      if (s === "cash") return "cash";
      if (s === "bank") return "bank";
      if (s === "credit") return "credit";
      return "other";
    };

    const order = ["cash", "bank", "credit", "other"];
    const groups = { cash: [], bank: [], credit: [], other: [] };
    for (const a of withBalance) groups[normalizeType(a.type)].push(a);

    const formatByCurrency = (totalsByCur) => {
      const entries = Object.entries(totalsByCur || {});
      if (!entries.length) return "—";
      return entries
        .map(([cur, val]) => {
          if (String(cur).toUpperCase() === "THB") return formatCurrency(val);
          return `${Number(val || 0).toLocaleString()} ${String(cur).toUpperCase()}`;
        })
        .join(" • ");
    };

    const sumByCurrency = (items) => {
      const out = {};
      for (const a of items) {
        const cur = String(a.currency || "THB").toUpperCase();
        out[cur] = (out[cur] || 0) + Number(a.balance || 0);
      }
      return out;
    };

    const groupLabel = (t) => {
      if (t === "cash") return "เงินสด";
      if (t === "bank") return "บัญชีธนาคาร";
      if (t === "credit") return "บัตรเครดิต";
      return "อื่นๆ";
    };

    const groupIcon = (t) => {
      if (t === "cash") return <Banknote size={18} />;
      if (t === "bank") return <Wallet size={18} />;
      if (t === "credit") return <CreditCard size={18} />;
      return <Wallet size={18} />;
    };

    const hasAny = order.some((t) => groups[t].length);
    if (!hasAny) {
      return (
        <div className="glass-card rounded-3xl p-5 bg-white/25 border border-white/20 shadow-xl text-center">
          <div className="text-sm font-extrabold text-gray-900">
            ยังไม่มีบัญชี หรือไม่พบผลลัพธ์
          </div>
          <div className="text-xs text-gray-800/60 font-bold mt-1">
            กดปุ่ม “เพิ่ม” เพื่อสร้างบัญชีใหม่
          </div>
        </div>
      );
    }

    return (
      <>
        {order.map((t) => {
          const items = groups[t];
          if (!items.length) return null;
          const totals = sumByCurrency(items);

          return (
            <div key={t} className="glass-card rounded-3xl p-4 bg-white/25 border border-white/20 shadow-xl overflow-hidden">
              <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center justify-end flex-wrap gap-2">
                  <div className="w-10 h-10 rounded-2xl bg-white/30 border border-white/20 flex items-center justify-center text-gray-900">
                    {groupIcon(t)}
                  </div>
                  <div>
                    <div className="text-base font-black text-gray-900">{groupLabel(t)}</div>
                    <div className="text-[11px] text-gray-800/55 font-bold">
                      รวม {items.length} บัญชี • {formatByCurrency(totals)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {items.map((acc) => (
                  <div
                    key={acc.id}
                    className="glass-panel rounded-3xl p-4 bg-white/20 border border-white/20"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <AccountAvatar
                          account={acc}
                          name={acc.name}
                          type={acc.type}
                          color={acc.color || "#111827"}
                          className="shrink-0 w-12 h-12 rounded-2xl"
                          contentClassName="h-full w-full"
                          textClassName="text-[22px]"
                        />

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <div className="text-base font-black text-gray-900 truncate">{acc.name || "-"}</div>
                            <div className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-white/30 border border-white/20 text-gray-900 font-extrabold">
                              {typeIcon(acc.type)}
                              {typeLabel(acc.type)}
                            </div>
                            <div className="text-[11px] px-2 py-1 rounded-full bg-white/30 border border-white/20 text-gray-900 font-extrabold">
                              {currencyLabel(acc.currency)}
                            </div>
                            {acc.institutionId ? (
                              <div className="text-[11px] px-2 py-1 rounded-full bg-white/30 border border-white/20 text-gray-900 font-extrabold">
                                {getInstitutionChipLabel(getInstitutionPresetById(acc.institutionId))}
                              </div>
                            ) : null}
                          </div>

                          {(() => {
                            const list =
                              Array.isArray(acc.matchDigits) && acc.matchDigits.length
                                ? acc.matchDigits
                                : acc.accountNumber
                                ? [String(acc.accountNumber)]
                                : [];

                            if (!list.length) return null;

                            const primary = choosePrimaryDigits(list);
                            const shortList = list.slice(0, 4).map((d) => formatDigitsChip(d));
                            const more = list.length > 4 ? ` +${list.length - 4}` : "";

                            return (
                              <div className="text-[11px] text-gray-800/55 mt-1">
                                <span className="font-bold">เลขช่วยจำ (map):</span>{" "}
                                <span className="font-extrabold text-gray-900">{formatDigitsChip(primary)}</span>
                                {list.length > 1 ? (
                                  <span className="ml-2 text-gray-800/50">
                                    ({shortList.join(", ")}
                                    {more})
                                  </span>
                                ) : null}
                              </div>
                            );
                          })()}

                          {acc.type === "credit" ? (
                            <div className="text-[11px] text-gray-800/55 mt-2 leading-relaxed">
                              <span className="font-bold">วงเงิน:</span>{" "}
                              <span className="font-extrabold text-gray-900">
                                {formatMoney(acc.creditLimit || 0, acc.currency)}
                              </span>
                              <span className="mx-2">•</span>
                              <span className="font-bold">ตัดรอบ:</span>{" "}
                              <span className="font-extrabold text-gray-900">
                                ทุกวันที่ {acc.statementDay || 20}
                              </span>
                              <span className="mx-2">•</span>
                              <span className="font-bold">ชำระภายใน:</span>{" "}
                              <span className="font-extrabold text-gray-900">
                                วันที่ {acc.dueDay || 5}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="text-sm font-black text-gray-900">
                          {String(acc.currency || "THB").toUpperCase() === "THB"
                            ? formatCurrency(acc.balance || 0)
                            : `${Number(acc.balance || 0).toLocaleString()} ${String(acc.currency || "").toUpperCase()}`}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEditModal(acc)}
                            data-testid={`account-edit-${acc.id}`}
                            className="p-2 rounded-2xl bg-white/30 border border-white/20 text-gray-900 active:scale-[0.98]"
                            title="แก้ไข"
                          >
                            <Pencil size={18} />
                          </button>
                          <button
                            onClick={() => del(acc.id)}
                            data-testid={`account-delete-${acc.id}`}
                            className="p-2 rounded-2xl bg-white/30 border border-white/20 text-gray-900 active:scale-[0.98]"
                            title="ลบ"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </>
    );
  })()}
</div>

  {/* Create Modal */}

      {openCreate ? (
        <AccountSheetModal
          open={openCreate}
          title="เพิ่มบัญชี"
          description="กรอกข้อมูลหลักก่อน แล้วค่อยเพิ่มเลขช่วยจำถ้าจำเป็น"
          onClose={() => setOpenCreate(false)}
        >
          <div className="mt-4">
              <AccountVisualPreview
                name={cName}
                type={cType}
                currency={cCurrency}
                color={cColor}
                mode={cIconMode}
                iconId={cIconId}
                emoji={cIcon}
                image={cImage}
                institutionId={cInstitutionId}
              />
            </div>

            <div className="mt-4 ui-card p-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="ui-label">ชื่อบัญชี</label>
                  <input
                    value={cName}
                    onChange={(e) => setCName(e.target.value)}
                    className="ui-input"
                    placeholder="เช่น KBank / เงินสด / Visa"
                    autoComplete="off"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="ui-label">ประเภท</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => applyCreateInstitution("generic_bank")}
                        className={`min-h-[44px] rounded-2xl border px-3 py-2 font-extrabold flex items-center justify-center gap-2 ${
                          cType === "bank" ? "bg-white/90 border-gray-900/20" : "bg-white/50 border-gray-900/10"
                        }`}
                      >
                        <Wallet size={18} /> ธนาคาร
                      </button>
                      <button
                        type="button"
                        onClick={() => applyCreateInstitution("cash_wallet")}
                        className={`min-h-[44px] rounded-2xl border px-3 py-2 font-extrabold flex items-center justify-center gap-2 ${
                          cType === "cash" ? "bg-white/90 border-gray-900/20" : "bg-white/50 border-gray-900/10"
                        }`}
                      >
                        <Banknote size={18} /> เงินสด
                      </button>
                      <button
                        type="button"
                        onClick={() => applyCreateInstitution("generic_credit")}
                        className={`min-h-[44px] rounded-2xl border px-3 py-2 font-extrabold flex items-center justify-center gap-2 ${
                          cType === "credit" ? "bg-white/90 border-gray-900/20" : "bg-white/50 border-gray-900/10"
                        }`}
                      >
                        <CreditCard size={18} /> บัตร
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="ui-label">สกุลเงิน</label>
                    <select value={cCurrency} onChange={(e) => setCCurrency(e.target.value)} className="ui-select">
                      <option value="THB">THB (฿)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <InstitutionPicker
              type={cType}
              value={cInstitutionId}
              onSelect={applyCreateInstitution}
            />

            <AccountVisualPicker
              type={cType}
              mode={cIconMode}
              setMode={setCIconMode}
              iconId={cIconId}
              setIconId={setCIconId}
              emoji={cIcon}
              setEmoji={(v) => {
                setCIconMode("emoji");
                setCIcon(v);
              }}
              image={cImage}
              setImage={(v) => {
                setCIconMode("image");
                setCImage(v);
              }}
              color={cColor}
              setColor={setCColor}
              onRandomColor={() => setCColor(randomColor())}
            />

            <div className="mt-4 ui-card p-4">
              <div className="text-sm font-black text-gray-900">รายละเอียดเพิ่มเติม</div>

              <div className="mt-3">
                <label className="ui-label">เลขช่วยจำสำหรับ map (ใส่ได้หลายชุด)</label>
                <input
                  value={cAccountNumber}
                  onChange={(e) => setCAccountNumber(e.target.value)}
                  className="ui-input"
                  placeholder="เช่น 6345, 4373 หรือ 1234567890"
                  inputMode="numeric"
                  autoComplete="off"
                />
                <div className="ui-help mt-1">
                  คั่นด้วย <span className="font-bold">,</span> หรือเว้นวรรค • แนะนำใส่เลขท้าย 4–6 หลัก
                </div>

                {(() => {
                  const list = parseDigitsList(cAccountNumber);
                  const primary = choosePrimaryDigits(list);
                  if (!list.length) return null;
                  return (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {list.map((d) => (
                        <span
                          key={d}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border ${
                            d === primary ? "bg-gray-900/90 text-white border-white/20" : "bg-white/70 text-gray-900 border-gray-900/10"
                          }`}
                          title={d.length > 6 ? `เก็บทั้งชุด (${d.length} หลัก)` : "เลขช่วยจำ"}
                        >
                          {formatDigitsChip(d)}
                          {d === primary ? <span className="ml-1 opacity-90">• หลัก</span> : null}
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div className="mt-4">
                <label className="ui-label">ยอดตั้งต้นในบัญชี (ไม่บังคับ)</label>

                {cType === "credit" ? (
                  <div className="mt-2 ui-card-strong p-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-xs font-extrabold text-gray-800/70">เครื่องหมาย</div>
                      <div className="flex items-center rounded-2xl overflow-hidden border border-gray-900/10 bg-white/50">
                        <button
                          type="button"
                          onClick={() => setCInitialBalance(forceSignNumberString(cInitialBalance, +1))}
                          className={`min-h-[40px] px-3 text-xs font-extrabold ${
                            !String(cInitialBalance || "").trim().startsWith("-")
                              ? "bg-gray-900 text-white"
                              : "text-gray-900/80 hover:bg-white/60"
                          }`}
                        >
                          บวก
                        </button>
                        <button
                          type="button"
                          onClick={() => setCInitialBalance(forceSignNumberString(cInitialBalance, -1))}
                          className={`min-h-[40px] px-3 text-xs font-extrabold ${
                            String(cInitialBalance || "").trim().startsWith("-")
                              ? "bg-gray-900 text-white"
                              : "text-gray-900/80 hover:bg-white/60"
                          }`}
                        >
                          ติดลบ
                        </button>
                      </div>
                    </div>

                    <div className="mt-3">
                      <input
                        value={String(cInitialBalance || "").replace(/^-/, "")}
                        onChange={(e) => {
                          const cleaned = sanitizeMoneyInput(e.target.value, { maxDecimals: 2 });
                          const abs = cleaned.replace(/^-/, "");
                          const hasNeg = String(cInitialBalance || "").trim().startsWith("-");
                          const wantsNeg = cleaned.startsWith("-") ? true : hasNeg;
                          const next = abs ? (wantsNeg ? `-${abs}` : abs) : wantsNeg ? "-" : "";
                          setCInitialBalance(next);
                        }}
                        className="ui-input text-lg font-extrabold tabular-nums"
                        placeholder="เช่น 5000.00"
                        inputMode="decimal"
                        autoComplete="off"
                      />
                      <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                        <div className="ui-help">ใช้ “ติดลบ” สำหรับหนี้บัตรเครดิต/ยอดค้าง</div>
                        <div className="text-xs font-black tabular-nums text-gray-900">
                          {(() => {
                            const v = String(cInitialBalance || "").trim();
                            if (!v || v === "-") return "—";
                            return formatCurrency(parseMoneyToSatang(v));
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <input
                    value={cInitialBalance}
                    onChange={(e) => setCInitialBalance(sanitizeMoneyInput(e.target.value, { maxDecimals: 2 }))}
                    className="ui-input tabular-nums"
                    placeholder="เช่น 500.00"
                    inputMode="decimal"
                    autoComplete="off"
                  />
                )}

                <div className="ui-help mt-1">
                  ถ้ากรอก ระบบจะถามว่าจะบันทึกเป็นรายการ <span className="font-black text-gray-900">ปรับยอดบัญชี</span> หรือไม่
                </div>
              </div>
            </div>

            {cType === "credit" ? (
              <div className="mt-4 ui-card p-4">
                <div className="text-sm font-black text-gray-900 flex items-center gap-2">
                  <CreditCard size={18} /> ตั้งค่าบัตรเครดิต
                </div>

                <div className="mt-3">
                  <label className="ui-label">วงเงิน</label>
                  <input
                    value={cCreditLimit}
                    onChange={(e) => setCCreditLimit(sanitizeMoneyInput(e.target.value, { maxDecimals: 2 }))}
                    className="ui-input"
                    placeholder="เช่น 50000.00"
                    inputMode="decimal"
                  />
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="ui-label">วันตัดรอบ</label>
                    <input
                      value={cStatementDay}
                      onChange={(e) => setCStatementDay(Number(e.target.value || 1))}
                      className="ui-input"
                      placeholder="20"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <label className="ui-label">วันครบกำหนด</label>
                    <input
                      value={cDueDay}
                      onChange={(e) => setCDueDay(Number(e.target.value || 1))}
                      className="ui-input"
                      placeholder="5"
                      inputMode="numeric"
                    />
                  </div>
                </div>

                <div className="ui-help mt-2">
                  ใส่เลขท้ายบนสลิปหรือหน้าบัตร ถ้ามีหลายแบบให้ใส่หลายชุด
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setOpenCreate(false)} className="ui-btn ui-btn-secondary">
                ยกเลิก
              </button>
              <button onClick={create} data-testid="account-create-save" className="ui-btn ui-btn-primary">
                บันทึก
              </button>
            </div>
        </AccountSheetModal>
      ) : null}

      
{/* ✅ Opening balance confirmation (create) */}
{openCreateAdjustConfirm && pendingCreateAdjust && pendingCreateAccount ? createPortal(
  <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/35 p-3 overflow-x-hidden">
    <div className="w-full max-w-sm glass-card rounded-3xl p-5 bg-white/25 border border-white/20 shadow-2xl overflow-x-hidden">
      <div className="text-lg font-black text-gray-900">ยอดตั้งต้นในบัญชี</div>
      <div className="text-xs text-gray-800/70 font-bold mt-2 leading-relaxed">
        ยอดตั้งต้น{" "}
        <span className="font-black text-gray-900">
          {pendingCreateAdjust.currency === "THB"
            ? formatCurrency(pendingCreateAdjust.desired)
            : `${Number(pendingCreateAdjust.desired || 0).toLocaleString()} ${pendingCreateAdjust.currency}`}
        </span>{" "}
        ({pendingCreateAdjust.desired < 0 ? "ติดลบ/หนี้" : "บวก"})
        <br />
        ต้องการให้บันทึกเป็นรายการ <span className="font-black text-gray-900">ปรับยอดบัญชี</span> (Income/Expense) หรือไม่?
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2">
        <button
          type="button"
          onClick={() => {
            // 1) create account with openingBalance=0
            addAccount({ ...pendingCreateAccount, openingBalance: 0 });
            // 2) record adjust tx
            const desired = Number(pendingCreateAdjust.desired || 0); // satang
            const isIncome = desired > 0;
            store.upsertTransaction({
              id: generateId(),
              type: isIncome ? "income" : "expense",
              amount: Math.abs(desired),
              category: "adjust_balance",
              accountId: pendingCreateAccount.id,
              date: toISODate(new Date()),
              note: "ยอดตั้งต้น",
              isTransfer: false,
              meta: { kind: "opening_balance" },
            });

            setOpenCreateAdjustConfirm(false);
            setPendingCreateAccount(null);
            setPendingCreateAdjust(null);
            setOpenCreate(false);
            resetCreate();
            notify("เพิ่มบัญชีแล้ว (มีรายการยอดตั้งต้น)");
          }}
          className="w-full px-4 py-3 rounded-2xl bg-gray-900 text-white font-extrabold shadow-lg active:scale-[0.98]"
        >
          บันทึกยอดตั้งต้นเป็นรายการ (Income/Expense)
        </button>

        <button
          type="button"
          onClick={() => {
            // create account with openingBalance = desired (silent)
            addAccount({ ...pendingCreateAccount, openingBalance: Number(pendingCreateAdjust.desired || 0) });

            setOpenCreateAdjustConfirm(false);
            setPendingCreateAccount(null);
            setPendingCreateAdjust(null);
            setOpenCreate(false);
            resetCreate();
            notify("เพิ่มบัญชีแล้ว");
          }}
          className="w-full px-4 py-3 rounded-2xl bg-white/30 border border-white/20 text-gray-900 font-extrabold active:scale-[0.98]"
        >
          ไม่บันทึกเป็นรายการ (ปรับยอดเงียบๆ)
        </button>

        <button
          type="button"
          onClick={() => {
            setOpenCreateAdjustConfirm(false);
          }}
          className="w-full px-4 py-3 rounded-2xl bg-white/15 border border-white/20 text-gray-900 font-extrabold active:scale-[0.98]"
        >
          ยกเลิก
        </button>
      </div>

      {/* Safe-area spacer (iOS home indicator) */}
      <div className="h-3 pb-safe" />
    </div>
  </div>,
  document.body
) : null}

{/* Edit Modal */}
      {openEdit ? (
        <AccountSheetModal
          open={openEdit}
          title="แก้ไขบัญชี"
          description={<>รองรับเลขช่วยจำหลายชุด เช่น <span className="font-black text-gray-900">6345, 4373</span></>}
          onClose={closeEditModal}
        >
          <div className="mt-4">
              <AccountVisualPreview
                name={eName}
                type={eType}
                currency={eCurrency}
                color={eColor}
                mode={eIconMode}
                iconId={eIconId}
                emoji={eIcon}
                image={eImage}
                institutionId={eInstitutionId}
              />
            </div>

            <div className="mt-4 ui-card p-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="ui-label">ชื่อบัญชี</label>
                  <input value={eName} onChange={(e) => setEName(e.target.value)} className="ui-input" placeholder="เช่น KBank / เงินสด / Visa" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="ui-label">ประเภท</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => applyEditInstitution("generic_bank")}
                        className={`min-h-[44px] rounded-2xl border px-3 py-2 font-extrabold flex items-center justify-center gap-2 ${
                          eType === "bank" ? "bg-white/90 border-gray-900/20" : "bg-white/50 border-gray-900/10"
                        }`}
                      >
                        <Wallet size={18} /> ธนาคาร
                      </button>
                      <button
                        type="button"
                        onClick={() => applyEditInstitution("cash_wallet")}
                        className={`min-h-[44px] rounded-2xl border px-3 py-2 font-extrabold flex items-center justify-center gap-2 ${
                          eType === "cash" ? "bg-white/90 border-gray-900/20" : "bg-white/50 border-gray-900/10"
                        }`}
                      >
                        <Banknote size={18} /> เงินสด
                      </button>
                      <button
                        type="button"
                        onClick={() => applyEditInstitution("generic_credit")}
                        className={`min-h-[44px] rounded-2xl border px-3 py-2 font-extrabold flex items-center justify-center gap-2 ${
                          eType === "credit" ? "bg-white/90 border-gray-900/20" : "bg-white/50 border-gray-900/10"
                        }`}
                      >
                        <CreditCard size={18} /> บัตร
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="ui-label">สกุลเงิน</label>
                    <select value={eCurrency} onChange={(e) => setECurrency(e.target.value)} className="ui-select">
                      <option value="THB">THB (฿)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <InstitutionPicker
              type={eType}
              value={eInstitutionId}
              onSelect={applyEditInstitution}
            />

            <AccountVisualPicker
              type={eType}
              mode={eIconMode}
              setMode={setEIconMode}
              iconId={eIconId}
              setIconId={(v) => {
                setEIconMode("preset");
                setEIconId(v);
              }}
              emoji={eIcon}
              setEmoji={(v) => {
                setEIconMode("emoji");
                setEIcon(v);
              }}
              image={eImage}
              setImage={(v) => {
                setEIconMode("image");
                setEImage(v);
              }}
              color={eColor}
              setColor={setEColor}
              onRandomColor={() => setEColor(randomColor())}
            />

            <div className="mt-4 ui-card p-4">
              <div className="text-sm font-black text-gray-900">การจับคู่บัญชี + ปรับยอด</div>

              <div className="mt-3">
                <label className="ui-label">เลขช่วยจำสำหรับ map (ใส่ได้หลายชุด)</label>
                <input
                  value={eAccountNumber}
                  onChange={(e) => setEAccountNumber(e.target.value)}
                  className="ui-input"
                  placeholder="เช่น 6345, 4373 หรือ 1234567890"
                  inputMode="numeric"
                  autoComplete="off"
                />
                <div className="ui-help mt-1">
                  แนะนำใส่เลขท้าย 4–6 หลัก • บัตรเครดิตใส่ได้มากกว่า 1 ชุด
                </div>

                {(() => {
                  const list = parseDigitsList(eAccountNumber);
                  const primary = choosePrimaryDigits(list);
                  if (!list.length) return null;
                  return (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {list.map((d) => (
                        <span
                          key={d}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border ${
                            d === primary ? "bg-gray-900/90 text-white border-white/20" : "bg-white/70 text-gray-900 border-gray-900/10"
                          }`}
                          title={d.length > 6 ? `เก็บทั้งชุด (${d.length} หลัก)` : "เลขช่วยจำ"}
                        >
                          {formatDigitsChip(d)}
                          {d === primary ? <span className="ml-1 opacity-90">• หลัก</span> : null}
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="ui-label">ยอดปัจจุบัน (คำนวณ)</label>
                  <div className="ui-input bg-white/40" aria-disabled="true">
                    {(() => {
                      const n = calcAccountBalance(store.state.accounts, store.state.transactions, eEditing);
                      return (eCurrency || "THB") === "THB"
                        ? formatCurrency(n)
                        : `${Number(n || 0).toLocaleString()} ${(eCurrency || "").toUpperCase()}`;
                    })()}
                  </div>
                </div>

                <div>
                  <label className="ui-label">ตั้งยอดบัญชีใหม่ (ไม่บังคับ)</label>

                  {eType === "credit" ? (
                    <div className="mt-2 ui-card-strong p-4">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-xs font-extrabold text-gray-800/70">เครื่องหมาย</div>
                        <div className="flex items-center rounded-2xl overflow-hidden border border-gray-900/10 bg-white/50">
                          <button
                            type="button"
                            onClick={() => setEDesiredBalance(forceSignNumberString(eDesiredBalance, +1))}
                            className={`min-h-[40px] px-3 text-xs font-extrabold ${
                              !String(eDesiredBalance || "").trim().startsWith("-")
                                ? "bg-gray-900 text-white"
                                : "text-gray-900/80 hover:bg-white/60"
                            }`}
                          >
                            บวก
                          </button>
                          <button
                            type="button"
                            onClick={() => setEDesiredBalance(forceSignNumberString(eDesiredBalance, -1))}
                            className={`min-h-[40px] px-3 text-xs font-extrabold ${
                              String(eDesiredBalance || "").trim().startsWith("-")
                                ? "bg-gray-900 text-white"
                                : "text-gray-900/80 hover:bg-white/60"
                            }`}
                          >
                            ติดลบ
                          </button>
                        </div>
                      </div>

                      <div className="mt-3">
                        <input
                          value={String(eDesiredBalance || "").replace(/^-/, "")}
                          onChange={(e) => {
                            const cleaned = sanitizeMoneyInput(e.target.value, { maxDecimals: 2 });
                            const abs = cleaned.replace(/^-/, "");
                            const hasNeg = String(eDesiredBalance || "").trim().startsWith("-");
                            const wantsNeg = cleaned.startsWith("-") ? true : hasNeg;
                            const next = abs ? (wantsNeg ? `-${abs}` : abs) : wantsNeg ? "-" : "";
                            setEDesiredBalance(next);
                          }}
                          className="ui-input text-lg font-extrabold tabular-nums"
                          placeholder="เช่น 5000.00"
                          inputMode="decimal"
                          autoComplete="off"
                        />

                        <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                          <div className="ui-help">ตั้งยอดติดลบเพื่อสะท้อนยอดหนี้บัตรเครดิต</div>
                          <div className="text-xs font-black tabular-nums text-gray-900">
                            {(() => {
                              const v = String(eDesiredBalance || "").trim();
                              if (!v || v === "-") return "—";
                              return formatCurrency(parseMoneyToSatang(v));
                            })()}
                          </div>
                        </div>

                        {(() => {
                          const v = String(eDesiredBalance || "").trim();
                          if (!v || v === "-") return null;
                          const desired = parseMoneyToSatang(v);
                          const current = calcAccountBalance(store.state.accounts, store.state.transactions, eEditing);
                          const delta = desired - current;
                          if (delta === 0) return <div className="mt-3 ui-help">ยอดใหม่เท่ากับยอดเดิม</div>;
                          return (
                            <div className="mt-3 ui-card p-3">
                              <div className="text-xs font-extrabold text-gray-800/70">ส่วนต่างที่จะบันทึก</div>
                              <div className="mt-1 text-sm font-black text-gray-900 tabular-nums">
                                {formatCurrency(Math.abs(delta))} ({delta > 0 ? "เพิ่ม" : "ลด"})
                              </div>
                              <div className="mt-1 text-[11px] text-gray-800/60 font-bold leading-relaxed">
                                กดบันทึกแล้วค่อยเลือกว่าจะเก็บเป็นรายการ <span className="font-black text-gray-900">ปรับยอดบัญชี</span> หรือปรับเงียบๆ
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    <input
                      value={eDesiredBalance}
                      onChange={(e) => setEDesiredBalance(sanitizeMoneyInput(e.target.value, { maxDecimals: 2 }))}
                      className="ui-input tabular-nums"
                      placeholder="เช่น 505.00"
                      inputMode="decimal"
                      autoComplete="off"
                    />
                  )}

                  <div className="ui-help mt-1">
                    ถ้ากรอก ระบบจะถามว่าจะบันทึกส่วนต่างเป็นรายการ <span className="font-black text-gray-900">ปรับยอดบัญชี</span> หรือไม่
                  </div>
                </div>
              </div>
            </div>

            {eType === "credit" ? (
              <div className="mt-4 ui-card p-4">
                <div className="text-sm font-black text-gray-900 flex items-center gap-2">
                  <CreditCard size={18} /> ตั้งค่าบัตรเครดิต
                </div>

                <div className="mt-3">
                  <label className="ui-label">วงเงิน</label>
                  <input
                    value={eCreditLimit}
                    onChange={(e) => setECreditLimit(sanitizeMoneyInput(e.target.value, { maxDecimals: 2 }))}
                    className="ui-input"
                    placeholder="เช่น 50000.00"
                    inputMode="decimal"
                  />
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="ui-label">วันตัดรอบ</label>
                    <input
                      value={eStatementDay}
                      onChange={(e) => setEStatementDay(Number(e.target.value || 1))}
                      className="ui-input"
                      placeholder="20"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <label className="ui-label">วันครบกำหนด</label>
                    <input
                      value={eDueDay}
                      onChange={(e) => setEDueDay(Number(e.target.value || 1))}
                      className="ui-input"
                      placeholder="5"
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
              <button
                onClick={() => {
                  if (!eEditing) return;
                  const message =
                    "ลบบัญชีนี้?\n\nระบบจะลบรายการธุรกรรมทั้งหมดของบัญชีนี้ด้วย (รวมถึงรายการโอนที่เกี่ยวข้อง)";

                  const doDelete = () => {
                    deleteAccount(eEditing);
                    closeEditModal();
                    notify("ลบบัญชีแล้ว", "warn");
                  };

                  if (typeof showConfirm === "function") {
                    showConfirm("ลบบัญชี", message, doDelete, true, { confirmText: "ลบ" });
                    return;
                  }

                  if (window.confirm(message)) doDelete();
                }}
                className="ui-btn ui-btn-secondary border-red-200 bg-red-50/70 text-red-700"
              >
                <Trash2 size={18} />
                ลบบัญชี
              </button>

              <div className="flex items-center gap-2">
                <button onClick={closeEditModal} className="ui-btn ui-btn-secondary">
                  ยกเลิก
                </button>
                <button onClick={saveEdit} data-testid="account-edit-save" className="ui-btn ui-btn-primary">
                  บันทึก
                </button>
              </div>
            </div>
        </AccountSheetModal>
      ) : null}

      {/* ✅ Adjust balance confirmation */}
      {openAdjustConfirm && pendingAdjust ? createPortal(
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/35 p-3">
          <div className="w-full max-w-sm glass-card rounded-3xl p-5 bg-white/25 border border-white/20 shadow-2xl">
            <div className="text-lg font-black text-gray-900">ปรับยอดบัญชี</div>
            <div className="text-xs text-gray-800/70 font-bold mt-2 leading-relaxed">
              ยอดจะเปลี่ยนจาก{" "}
              <span className="font-black text-gray-900">
                {pendingAdjust.currency === "THB" ? formatCurrency(pendingAdjust.current) : `${Number(pendingAdjust.current || 0).toLocaleString()} ${pendingAdjust.currency}`}
              </span>{" "}
              เป็น{" "}
              <span className="font-black text-gray-900">
                {pendingAdjust.currency === "THB" ? formatCurrency(pendingAdjust.desired) : `${Number(pendingAdjust.desired || 0).toLocaleString()} ${pendingAdjust.currency}`}
              </span>
              <br />
              ส่วนต่าง{" "}
              <span className="font-black text-gray-900">
                {pendingAdjust.currency === "THB" ? formatCurrency(Math.abs(pendingAdjust.delta)) : `${Number(Math.abs(pendingAdjust.delta) || 0).toLocaleString()} ${pendingAdjust.currency}`}
              </span>{" "}
              ({pendingAdjust.delta > 0 ? "เพิ่ม" : "ลด"})
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => {
                  // commit: update account fields first
                  if (pendingEdit) updateAccount(pendingEdit);
                  adjustAccountBalance({
                    accountId: pendingAdjust.accountId,
                    desiredBalance: pendingAdjust.desired,
                    recordAsTransaction: true,
                  });
                  setOpenAdjustConfirm(false);
                  closeEditModal();
                  notify("บันทึกแล้ว (มีรายการปรับยอด)");
                }}
                className="w-full px-4 py-3 rounded-2xl bg-gray-900 text-white font-extrabold shadow-lg active:scale-[0.98]"
              >
                บันทึกส่วนต่างเป็นรายการ (Income/Expense)
              </button>

              <button
                type="button"
                onClick={() => {
                  if (pendingEdit) updateAccount(pendingEdit);
                  adjustAccountBalance({
                    accountId: pendingAdjust.accountId,
                    desiredBalance: pendingAdjust.desired,
                    recordAsTransaction: false,
                  });
                  setOpenAdjustConfirm(false);
                  closeEditModal();
                  notify("บันทึกแล้ว");
                }}
                className="w-full px-4 py-3 rounded-2xl bg-white/30 border border-white/20 text-gray-900 font-extrabold active:scale-[0.98]"
              >
                ไม่บันทึกเป็นรายการ (ปรับยอดเงียบๆ)
              </button>

              <button
                type="button"
                onClick={() => {
                  setOpenAdjustConfirm(false);
                }}
                className="w-full px-4 py-3 rounded-2xl bg-white/15 border border-white/20 text-gray-900 font-extrabold active:scale-[0.98]"
              >
                ยกเลิก
              </button>
            </div>

            {/* Safe-area spacer (iOS home indicator) */}
            <div className="h-3 pb-safe" />
          </div>
        </div>,
        document.body
      ) : null}

      {/* Bottom helper */}
      <div className="mt-6 glass-card rounded-3xl p-4 bg-white/20 border border-white/20 shadow-xl">
        <div className="text-sm font-black text-gray-900 flex items-center gap-2">
          <ImageIcon size={18} />
          เลขช่วยจำสำหรับ map
        </div>
        <div className="text-xs text-gray-800/60 font-bold mt-2 leading-relaxed">
          - ใส่ได้หลายชุด เช่น <span className="font-black text-gray-900">6345, 4373</span>
          <br />
          - ถ้ามีเลขบัญชีเต็ม (10+ หลัก) ใส่ได้เลยเพื่อช่วยจับคู่จากเลขท้าย
          <br />
          - บัตรเครดิตที่ขึ้นเลขไม่เหมือนกันในแต่ละสลิป สามารถใส่หลายชุดได้
        </div>
      </div>
      </main>
    </div>
  );
}
