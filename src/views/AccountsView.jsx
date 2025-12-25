// src/views/AccountsView.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  CreditCard,
  Banknote,
  Wallet,
  Sparkles,
  Image as ImageIcon,
  RotateCcw,
} from "lucide-react";
import { useAppStore } from "../store/store";
import { ACCOUNT_COLORS } from "../constants/presets.jsx";
import { calcAccountBalance } from "../store/selectors";
import { formatCurrency } from "../utils/format";

/**
 * ✅ Expanded, nicer emoji sets for account icons
 * - Keep as string (emoji/url/data) so it can be stored safely in localStorage JSON
 * - Grouped for better UX
 */
const ACCOUNT_ICON_GROUPS = [
  {
    id: "cash",
    title: "เงินสด",
    emojis: ["💵", "💴", "💶", "💷", "🪙", "💰", "💸", "🧧", "👛"],
  },
  {
    id: "bank",
    title: "ธนาคาร/บัญชี",
    emojis: ["🏦", "💳", "🏧", "📒", "📘", "🧾", "📄", "🗂️", "🔐", "🔑"],
  },
  {
    id: "credit",
    title: "บัตร/เครดิต",
    emojis: ["💳", "🪪", "📇", "🧾", "💎", "⭐", "🧠", "🛡️"],
  },
  {
    id: "savings",
    title: "ออมเงิน",
    emojis: ["🐷", "🐽", "🏺", "📦", "🔒", "🧱", "🧮", "🎯"],
  },
  {
    id: "digital",
    title: "ดิจิทัล/วอลเล็ต",
    emojis: ["📱", "📲", "💻", "⌚", "🧾", "🔔", "📩", "🌐"],
  },
  {
    id: "invest",
    title: "ลงทุน",
    emojis: ["📈", "📉", "🏛️", "🪙", "🧾", "💹", "💼", "🧠"],
  },
  {
    id: "gold",
    title: "ทอง/ของมีค่า",
    emojis: ["🥇", "🏅", "💎", "🪙", "⭐", "✨"],
  },
  {
    id: "business",
    title: "ธุรกิจ",
    emojis: ["💼", "🏢", "🏪", "🏭", "📦", "🚚", "🧾", "🧑‍💻"],
  },
  {
    id: "misc",
    title: "อื่นๆ",
    emojis: ["🏷️", "🧩", "📌", "🗃️", "📬", "🧾", "🧿", "🔧"],
  },
];

const digitsOnly = (s) => String(s || "").replace(/[^\d]/g, "");

// ===== image helpers =====
function isImageIcon(v) {
  const s = String(v || "").trim();
  return s.startsWith("data:image/") || s.startsWith("http://") || s.startsWith("https://");
}

// Resize image to keep localStorage light
async function fileToDataUrlResized(file, { maxSize = 480, quality = 0.82 } = {}) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });

  if (!String(dataUrl).startsWith("data:image/")) throw new Error("not_image");

  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("image_load_failed"));
    i.src = dataUrl;
  });

  const w = img.width || 0;
  const h = img.height || 0;
  if (!w || !h) return dataUrl;

  const scale = Math.min(1, maxSize / Math.max(w, h));
  const nw = Math.max(1, Math.round(w * scale));
  const nh = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = nw;
  canvas.height = nh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  ctx.drawImage(img, 0, 0, nw, nh);

  const isPng = String(file.type || "").toLowerCase().includes("png");
  const mime = isPng ? "image/png" : "image/jpeg";

  try {
    const out = canvas.toDataURL(mime, mime === "image/jpeg" ? quality : undefined);
    return out || dataUrl;
  } catch {
    return dataUrl;
  }
}

const TYPE_META = {
  bank: { label: "บัญชีธนาคาร", icon: <Banknote size={16} />, order: 1 },
  cash: { label: "เงินสด", icon: <Wallet size={16} />, order: 2 },
  credit: { label: "บัตรเครดิต", icon: <CreditCard size={16} />, order: 3 },
  other: { label: "อื่นๆ", icon: <Sparkles size={16} />, order: 99 },
};

function normalizeType(t) {
  const s = String(t || "").toLowerCase().trim();
  if (s === "bank" || s === "cash" || s === "credit") return s;
  return "other";
}

function AccountIcon({ value }) {
  const v = String(value || "💳").trim();
  if (isImageIcon(v)) {
    return <img src={v} alt="icon" className="w-8 h-8 object-cover rounded-xl" />;
  }
  return <span className="text-2xl leading-none">{v || "💳"}</span>;
}

function ColorDots({ value, onChange }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {ACCOUNT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-8 h-8 rounded-full border transition-transform active:scale-95 ${
            value === c ? "border-gray-800/30 ring-2 ring-white/40" : "border-white/10"
          }`}
          style={{ backgroundColor: c }}
          aria-label={`color ${c}`}
          title={c}
        />
      ))}
    </div>
  );
}

function TypePills({ value, onChange }) {
  const items = [
    { id: "cash", label: "เงินสด", icon: <Wallet size={16} /> },
    { id: "bank", label: "ธนาคาร", icon: <Banknote size={16} /> },
    { id: "credit", label: "บัตรเครดิต", icon: <CreditCard size={16} /> },
  ];
  return (
    <div className="glass-panel border border-white/20 rounded-2xl p-1 flex">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onChange(it.id)}
          className={`flex-1 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all ${
            value === it.id ? "bg-gray-900/90 text-white shadow-sm" : "text-gray-700 hover:bg-white/10"
          }`}
        >
          {it.icon} {it.label}
        </button>
      ))}
    </div>
  );
}

/**
 * ✅ ModalShell update:
 * - lock horizontal pan (touchAction: pan-y)
 * - overflow-x-hidden on overlay + panel
 * - overscrollBehavior contain (ลดการเด้ง/ลากเฉียงบนมือถือ)
 */
function ModalShell({ title, children, onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center overflow-hidden"
      style={{ touchAction: "pan-y", overscrollBehavior: "contain" }}
    >
      <div
        className="w-full sm:max-w-sm glass-card rounded-t-3xl sm:rounded-3xl p-5 max-h-[90dvh] overflow-y-auto overflow-x-hidden"
        style={{ touchAction: "pan-y", overscrollBehavior: "contain" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full glass-icon-btn text-gray-700 flex items-center justify-center"
            aria-label="close"
          >
            <X size={18} />
          </button>
        </div>
        {children}
        <div className="h-3 pb-safe" />
      </div>
    </div>
  );
}

function IconPicker({ value, onChange }) {
  const [groupId, setGroupId] = useState("bank");

  const group = useMemo(() => {
    return ACCOUNT_ICON_GROUPS.find((g) => g.id === groupId) || ACCOUNT_ICON_GROUPS[0];
  }, [groupId]);

  return (
    <div className="glass-panel border border-white/20 rounded-2xl p-3 overflow-x-hidden" style={{ touchAction: "pan-y" }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-xs font-extrabold text-gray-800/70 flex items-center gap-2">
          <Sparkles size={14} className="text-indigo-700" />
          เลือกไอคอน (แนะนำ)
        </div>
        <div className="text-[11px] text-gray-800/55">
          ไอคอนที่เลือก: <span className="font-extrabold text-gray-900">{value || "💳"}</span>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-3">
        {ACCOUNT_ICON_GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setGroupId(g.id)}
            className={`text-[11px] font-extrabold px-3 py-1.5 rounded-full border transition-all active:scale-95 ${
              groupId === g.id
                ? "bg-gray-900/90 text-white border-white/20"
                : "bg-white/18 text-gray-800/70 border-white/20 hover:bg-white/22"
            }`}
          >
            {g.title}
          </button>
        ))}
      </div>

      <div className="max-h-44 overflow-y-auto overflow-x-hidden no-scrollbar" style={{ touchAction: "pan-y" }}>
        <div className="grid grid-cols-7 sm:grid-cols-8 gap-2">
          {group.emojis.map((e, idx) => (
            <button
              key={`${group.id}_${idx}`}
              type="button"
              onClick={() => onChange?.(e)}
              className={`text-xl p-2 rounded-xl border transition-all hover:bg-white/10 active:scale-95 ${
                value === e ? "bg-white/20 border-gray-900/40" : "border-white/15"
              }`}
              aria-label={`icon ${e}`}
              title={e}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 text-[11px] text-gray-800/55">* ยังสามารถพิมพ์ Emoji เองได้ในช่อง “ไอคอน” ด้านล่าง</div>
    </div>
  );
}

function GroupHeader({ type, count, subtitleRight }) {
  const meta = TYPE_META[normalizeType(type)] || TYPE_META.other;
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-9 h-9 rounded-2xl glass-chip flex items-center justify-center text-gray-700 shrink-0">
          {meta.icon}
        </span>
        <div className="min-w-0">
          <div className="font-extrabold text-gray-900 truncate">{meta.label}</div>
          <div className="text-[12px] text-gray-800/55">{count} บัญชี</div>
        </div>
      </div>
      {subtitleRight ? <div className="text-[12px] text-gray-900/70 font-extrabold text-right">{subtitleRight}</div> : null}
    </div>
  );
}

/**
 * ✅ IMPORTANT FIX:
 * - Component นี้ "ไม่สร้าง input file เอง" (กัน ref หลุด / input ซ้ำ)
 * - ให้ parent เป็นคนสร้าง input file เพียงตัวเดียว แล้วใช้ ref.click()
 */
function ImagePickerInline({ value, onPickClick, onClear, disabled }) {
  const isImg = isImageIcon(value);

  return (
    <div className="glass-panel border border-white/20 rounded-2xl p-3 overflow-x-hidden" style={{ touchAction: "pan-y" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-extrabold text-gray-800/70 flex items-center gap-2">
            <ImageIcon size={14} className="text-indigo-700" />
            รูปภาพไอคอน (optional)
          </div>
          <div className="text-[11px] text-gray-800/55 mt-1">
            เลือกรูปเพื่อใช้แทน Emoji • ระบบจะย่อรูปอัตโนมัติให้เหมาะกับ localStorage
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onPickClick}
            className="px-3 py-2 rounded-xl bg-gray-900/90 text-white text-xs font-extrabold active:scale-95 disabled:opacity-60"
            disabled={disabled}
          >
            เลือกรูป
          </button>

          <button
            type="button"
            onClick={onClear}
            className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-95 border disabled:opacity-60 ${
              isImg ? "bg-white/20 border-white/20 text-gray-900" : "bg-white/10 border-white/15 text-gray-400"
            }`}
            title="ล้างรูป"
            disabled={!isImg || disabled}
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {isImg ? (
        <div className="mt-3 flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl overflow-hidden border border-white/15 bg-white/20">
            <img src={value} alt="preview" className="w-full h-full object-cover" />
          </div>
          <div className="text-[11px] text-gray-800/60 min-w-0">
            ใช้รูปเป็นไอคอนอยู่ตอนนี้ (ถ้าจะกลับเป็น Emoji กดปุ่มล้างรูป)
          </div>
        </div>
      ) : (
        <div className="mt-3 text-[11px] text-gray-800/55">ยังไม่ได้เลือกรูป (ตอนนี้ใช้ Emoji แทน)</div>
      )}
    </div>
  );
}

/**
 * ✅ Scroll lock for modal open:
 * - prevent background/page from sliding sideways (especially iOS)
 */
function useLockDocScroll(locked) {
  useEffect(() => {
    if (!locked) return;

    const el = document?.documentElement;
    const body = document?.body;
    if (!el || !body) return;

    const prevHtmlOverflow = el.style.overflow;
    const prevHtmlOverflowX = el.style.overflowX;
    const prevHtmlTouch = el.style.touchAction;

    const prevBodyOverflow = body.style.overflow;
    const prevBodyOverflowX = body.style.overflowX;
    const prevBodyTouch = body.style.touchAction;

    // lock
    el.style.overflow = "hidden";
    el.style.overflowX = "hidden";
    el.style.touchAction = "pan-y";

    body.style.overflow = "hidden";
    body.style.overflowX = "hidden";
    body.style.touchAction = "pan-y";

    return () => {
      el.style.overflow = prevHtmlOverflow;
      el.style.overflowX = prevHtmlOverflowX;
      el.style.touchAction = prevHtmlTouch;

      body.style.overflow = prevBodyOverflow;
      body.style.overflowX = prevBodyOverflowX;
      body.style.touchAction = prevBodyTouch;
    };
  }, [locked]);
}

export default function AccountsView({ showAlert, showConfirm }) {
  const { state, addAccount, updateAccount, deleteAccount, adjustAccountBalance } = useAppStore();

  const accounts = state.accounts || [];
  const transactions = state.transactions || [];

  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // ✅ single input per modal
  const createImgRef = useRef(null);
  const editImgRef = useRef(null);

  const [imgBusy, setImgBusy] = useState(false);

  // ✅ lock scroll when any modal opens
  useLockDocScroll(openCreate || openEdit);

  // create form
  const [cName, setCName] = useState("");
  const [cIcon, setCIcon] = useState("💳");
  const [cColor, setCColor] = useState(ACCOUNT_COLORS[0]);
  const [cType, setCType] = useState("bank");
  const [cBalance, setCBalance] = useState("0");
  const [cAccountNumber, setCAccountNumber] = useState("");
  const [cCreditLimit, setCCreditLimit] = useState("0");
  const [cStatementDay, setCStatementDay] = useState("1");
  const [cDueDay, setCDueDay] = useState("25");

  // edit form
  const editing = useMemo(() => accounts.find((a) => a.id === editingId) || null, [accounts, editingId]);

  const computedBalance = useMemo(() => {
    if (!editing) return 0;
    return calcAccountBalance(accounts, transactions, editing.id);
  }, [editing, accounts, transactions]);

  const [eName, setEName] = useState("");
  const [eIcon, setEIcon] = useState("💳");
  const [eColor, setEColor] = useState(ACCOUNT_COLORS[0]);
  const [eType, setEType] = useState("bank");
  const [eBalance, setEBalance] = useState("");
  const [recordAsTx, setRecordAsTx] = useState(false);
  const [eAccountNumber, setEAccountNumber] = useState("");
  const [eCreditLimit, setECreditLimit] = useState("0");
  const [eStatementDay, setEStatementDay] = useState("1");
  const [eDueDay, setEDueDay] = useState("25");

  const openEditModal = (acc) => {
    setEditingId(acc.id);
    setEName(acc.name || "");
    setEIcon(acc.icon || "💳");
    setEColor(acc.color || ACCOUNT_COLORS[0]);
    setEType(acc.type || "bank");
    setEAccountNumber(String(acc.accountNumber || ""));
    setECreditLimit(String(acc.creditLimit || 0));
    setEStatementDay(String(acc.statementDay || 1));
    setEDueDay(String(acc.dueDay || 25));
    setEBalance(String(calcAccountBalance(accounts, transactions, acc.id)));
    setRecordAsTx(false);
    setOpenEdit(true);
  };

  const pickCreateImageClick = () => createImgRef.current?.click();
  const pickEditImageClick = () => editImgRef.current?.click();

  const onCreateImageSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!String(file.type || "").startsWith("image/")) return showAlert?.("ไฟล์ไม่ใช่รูปภาพ");
    if (file.size > 1.5 * 1024 * 1024) showAlert?.("รูปค่อนข้างใหญ่ ระบบจะย่อให้อัตโนมัติ");

    setImgBusy(true);
    try {
      const dataUrl = await fileToDataUrlResized(file, { maxSize: 480, quality: 0.82 });
      setCIcon(dataUrl);
    } catch (err) {
      showAlert?.(`อัปโหลดรูปไม่สำเร็จ: ${String(err?.message || err)}`);
    } finally {
      setImgBusy(false);
    }
  };

  const onEditImageSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!String(file.type || "").startsWith("image/")) return showAlert?.("ไฟล์ไม่ใช่รูปภาพ");
    if (file.size > 1.5 * 1024 * 1024) showAlert?.("รูปค่อนข้างใหญ่ ระบบจะย่อให้อัตโนมัติ");

    setImgBusy(true);
    try {
      const dataUrl = await fileToDataUrlResized(file, { maxSize: 480, quality: 0.82 });
      setEIcon(dataUrl);
    } catch (err) {
      showAlert?.(`อัปโหลดรูปไม่สำเร็จ: ${String(err?.message || err)}`);
    } finally {
      setImgBusy(false);
    }
  };

  const clearCreateImage = () => {
    if (!isImageIcon(cIcon)) return;
    setCIcon("💳");
  };

  const clearEditImage = () => {
    if (!isImageIcon(eIcon)) return;
    setEIcon("💳");
  };

  const create = () => {
    if (!cName.trim()) return showAlert?.("ใส่ชื่อบัญชี");

    const openingBalance = Number(cBalance || 0);
    if (!Number.isFinite(openingBalance)) return showAlert?.("ยอดเงินไม่ถูกต้อง");

    const creditLimit = Number(cCreditLimit || 0) || 0;
    const statementDay = Math.min(31, Math.max(1, Number(cStatementDay || 1) || 1));
    const dueDay = Math.min(31, Math.max(1, Number(cDueDay || 25) || 25));

    addAccount({
      name: cName.trim(),
      icon: (cIcon || "💳").trim(),
      color: cColor,
      type: cType,
      openingBalance,
      accountNumber: digitsOnly(cAccountNumber),
      creditLimit,
      statementDay,
      dueDay,
    });

    setCName("");
    setCIcon("💳");
    setCColor(ACCOUNT_COLORS[0]);
    setCType("bank");
    setCBalance("0");
    setCAccountNumber("");
    setCCreditLimit("0");
    setCStatementDay("1");
    setCDueDay("25");
    setOpenCreate(false);
  };

  const saveEdit = () => {
    if (!editing) return;
    if (!eName.trim()) return showAlert?.("ใส่ชื่อบัญชี");

    const creditLimit = Number(eCreditLimit || 0) || 0;
    const statementDay = Math.min(31, Math.max(1, Number(eStatementDay || 1) || 1));
    const dueDay = Math.min(31, Math.max(1, Number(eDueDay || 25) || 25));

    updateAccount({
      id: editing.id,
      name: eName.trim(),
      icon: (eIcon || "💳").trim(),
      color: eColor,
      type: eType,
      accountNumber: digitsOnly(eAccountNumber),
      creditLimit,
      statementDay,
      dueDay,
    });

    const desired = Number(eBalance);
    if (!Number.isFinite(desired)) return showAlert?.("ยอดเงินไม่ถูกต้อง");

    adjustAccountBalance({
      accountId: editing.id,
      desiredBalance: desired,
      recordAsTransaction: recordAsTx,
    });

    setOpenEdit(false);
  };

  const del = (accId) => {
    if (accounts.length <= 1) return showAlert?.("ต้องมีอย่างน้อย 1 บัญชี");
    showConfirm?.("ลบบัญชี", "ยืนยันลบบัญชี? รายการที่เกี่ยวข้องกับบัญชีนี้จะถูกลบด้วย", () => deleteAccount(accId), true);
  };

  // ===== Grouping =====
  const accountBalances = useMemo(() => {
    const map = new Map();
    for (const acc of accounts) map.set(acc.id, calcAccountBalance(accounts, transactions, acc.id));
    return map;
  }, [accounts, transactions]);

  const groups = useMemo(() => {
    const by = new Map();
    for (const acc of accounts) {
      const t = normalizeType(acc.type);
      if (!by.has(t)) by.set(t, []);
      by.get(t).push(acc);
    }

    const out = [...by.entries()]
      .map(([type, items]) => {
        const sorted = items.slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        const meta = TYPE_META[type] || TYPE_META.other;

        if (type === "credit") {
          let totalDebt = 0;
          let totalLimit = 0;
          for (const a of sorted) {
            const bal = accountBalances.get(a.id) || 0;
            totalDebt += Math.max(0, -bal);
            totalLimit += Number(a.creditLimit || 0) || 0;
          }
          const available = Math.max(0, totalLimit - totalDebt);
          return {
            type,
            order: meta.order ?? 99,
            items: sorted,
            right: `ค้างชำระ ${formatCurrency(totalDebt)} • วงเงินคงเหลือ ${formatCurrency(available)}`,
          };
        }

        let total = 0;
        for (const a of sorted) total += accountBalances.get(a.id) || 0;
        return {
          type,
          order: meta.order ?? 99,
          items: sorted,
          right: `รวม ${formatCurrency(total)}`,
        };
      })
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

    return out;
  }, [accounts, accountBalances]);

  const netBalance = useMemo(() => {
    let sum = 0;
    for (const a of accounts) {
      const t = normalizeType(a.type);
      if (t === "credit") continue;
      sum += accountBalances.get(a.id) || 0;
    }
    return sum;
  }, [accounts, accountBalances]);

  return (
    <div
      className="pb-28 pt-6 px-4 min-h-dvh overflow-x-hidden"
      style={{ overflowX: "hidden", touchAction: "pan-y" }}
    >
      <header className="mb-5 flex justify-between items-start gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-gray-900">บัญชีของฉัน</h1>
          <p className="text-gray-700/70 text-sm">รองรับเลขบัญชี/เลขท้ายบัตร เพื่อ Auto-detect จากสลิป</p>
        </div>

        <button
          onClick={() => setOpenCreate(true)}
          className="w-11 h-11 bg-gray-900/90 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 shrink-0"
          type="button"
          aria-label="add account"
        >
          <Plus size={18} />
        </button>
      </header>

      <div className="glass-card rounded-3xl p-5 mb-5 overflow-x-hidden">
        <div className="text-xs font-extrabold text-gray-800/65">Net Balance (ไม่รวมบัตรเครดิต)</div>
        <div className={`text-3xl font-extrabold mt-1 ${netBalance < 0 ? "text-red-600" : "text-gray-900"}`}>
          {formatCurrency(netBalance)}
        </div>
        <div className="text-[11px] text-gray-800/55 mt-1">รวมเฉพาะ เงินสด + ธนาคาร (และประเภทอื่นๆที่ไม่ใช่ Credit)</div>
      </div>

      <div className="space-y-6 overflow-x-hidden">
        {groups.map((g) => (
          <section key={g.type} className="space-y-3 overflow-x-hidden">
            <GroupHeader type={g.type} count={g.items.length} subtitleRight={g.right} />

            <div className="space-y-3">
              {g.items.map((acc) => {
                const bal = accountBalances.get(acc.id) || 0;
                const isCredit = normalizeType(acc.type) === "credit";
                const debt = isCredit ? Math.max(0, -bal) : 0;
                const available = isCredit ? Math.max(0, (Number(acc.creditLimit || 0) || 0) - debt) : 0;

                return (
                  <div key={acc.id} className="glass-card rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden"
                          style={{ backgroundColor: `${acc.color}22` }}
                        >
                          <AccountIcon value={acc.icon || "💳"} />
                        </div>

                        <div className="min-w-0">
                          <div className="font-extrabold text-gray-900 truncate">{acc.name}</div>

                          <div className="text-xs text-gray-800/70 mt-0.5">
                            {isCredit ? (
                              <>
                                ค้างชำระ: <span className="font-extrabold text-red-600">{formatCurrency(debt)}</span>
                                {Number(acc.creditLimit || 0) ? (
                                  <>
                                    <span className="mx-2">•</span>
                                    วงเงินคงเหลือ:{" "}
                                    <span className="font-extrabold text-gray-900">{formatCurrency(available)}</span>
                                  </>
                                ) : null}
                              </>
                            ) : (
                              <>
                                ยอดคงเหลือ:{" "}
                                <span className={`font-extrabold ${bal < 0 ? "text-red-600" : "text-gray-900"}`}>
                                  {formatCurrency(bal)}
                                </span>
                              </>
                            )}
                          </div>

                          {acc.accountNumber ? (
                            <div className="text-[11px] text-gray-800/55 mt-1">
                              เลขบัญชี/เลขท้ายบัตร: <span className="font-bold">{acc.accountNumber}</span>
                            </div>
                          ) : null}

                          {isCredit && (Number(acc.statementDay || 0) || Number(acc.dueDay || 0)) ? (
                            <div className="text-[11px] text-gray-800/55 mt-1">
                              ตัดรอบ: <span className="font-bold">{acc.statementDay || 1}</span> • ครบกำหนด:{" "}
                              <span className="font-bold">{acc.dueDay || 25}</span>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditModal(acc)}
                          className="w-10 h-10 rounded-full glass-icon-btn text-gray-800 flex items-center justify-center active:scale-95"
                          aria-label="edit"
                          title="แก้ไข"
                        >
                          <Pencil size={18} />
                        </button>

                        {accounts.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => del(acc.id)}
                            className="w-10 h-10 rounded-full bg-red-500/10 text-red-700 flex items-center justify-center active:scale-95 border border-red-500/15"
                            aria-label="delete"
                            title="ลบ"
                          >
                            <Trash2 size={18} />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="h-1" style={{ backgroundColor: acc.color }} />
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Create */}
      {openCreate ? (
        <ModalShell title="เพิ่มบัญชีใหม่" onClose={() => setOpenCreate(false)}>
          <label className="text-xs font-bold text-gray-800/70 mb-1 block">ประเภทบัญชี</label>
          <TypePills value={cType} onChange={setCType} />

          <label className="text-xs font-bold text-gray-800/70 mb-1 block mt-4">ชื่อบัญชี</label>
          <input
            value={cName}
            onChange={(e) => setCName(e.target.value)}
            className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-extrabold text-gray-900"
            placeholder="เช่น KBank, Wallet, Credit Card"
          />

          {/* ✅ single input for Create */}
          <input ref={createImgRef} type="file" accept="image/*" className="hidden" onChange={onCreateImageSelected} />
          <div className="mt-4">
            <ImagePickerInline value={cIcon} onPickClick={pickCreateImageClick} onClear={clearCreateImage} disabled={imgBusy} />
          </div>

          <div className="mt-4">
            <IconPicker value={cIcon} onChange={setCIcon} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="text-xs font-bold text-gray-800/70 mb-1 block">ไอคอน (พิมพ์เองได้)</label>
              <input
                value={cIcon}
                onChange={(e) => setCIcon(e.target.value)}
                className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 text-2xl"
                placeholder="💳"
              />
              <p className="text-[11px] text-gray-800/55 mt-1">ใช้คีย์บอร์ด Emoji บนมือถือได้เลย (หรือใส่ URL รูปก็ได้)</p>
            </div>

            <div className="min-w-0">
              <label className="text-xs font-bold text-gray-800/70 mb-1 block">ยอดตั้งต้น</label>
              <input
                value={cBalance}
                onChange={(e) => setCBalance(e.target.value)}
                type="number"
                className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-extrabold text-gray-900"
                placeholder="0"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="text-xs font-bold text-gray-800/70 mb-1 block">เลขบัญชี / เลขท้ายบัตร (แนะนำ)</label>
            <input
              value={cAccountNumber}
              onChange={(e) => setCAccountNumber(e.target.value)}
              className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-extrabold text-gray-900"
              placeholder="ใส่เฉพาะเลข เช่น 1234567890 หรือ 1234"
            />
            <p className="text-[11px] text-gray-800/55 mt-1">เพื่อให้ระบบสแกนสลิปแล้ว Auto-select บัญชีได้แม่นยำขึ้น</p>
          </div>

          {cType === "credit" ? (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="col-span-3">
                <label className="text-xs font-bold text-gray-800/70 mb-1 block">วงเงิน (Credit Limit)</label>
                <input
                  value={cCreditLimit}
                  onChange={(e) => setCCreditLimit(e.target.value)}
                  type="number"
                  className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-extrabold text-gray-900"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-800/70 mb-1 block">วันตัดรอบ</label>
                <input
                  value={cStatementDay}
                  onChange={(e) => setCStatementDay(e.target.value)}
                  type="number"
                  className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-extrabold text-gray-900"
                  min="1"
                  max="31"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-800/70 mb-1 block">วันครบกำหนด</label>
                <input
                  value={cDueDay}
                  onChange={(e) => setCDueDay(e.target.value)}
                  type="number"
                  className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-extrabold text-gray-900"
                  min="1"
                  max="31"
                />
              </div>
              <div className="flex items-end text-[11px] text-gray-800/55">ใช้เพื่อแสดงข้อมูลบัตร</div>
            </div>
          ) : null}

          <div className="mt-4">
            <label className="text-xs font-bold text-gray-800/70 mb-2 block">สี</label>
            <ColorDots value={cColor} onChange={setCColor} />
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={() => setOpenCreate(false)}
              className="flex-1 py-3 rounded-2xl glass-chip font-extrabold text-gray-800 active:scale-95"
              disabled={imgBusy}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={create}
              className="flex-1 py-3 rounded-2xl bg-gray-900/90 text-white font-extrabold flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60"
              disabled={imgBusy}
            >
              <Check size={18} /> สร้าง
            </button>
          </div>
        </ModalShell>
      ) : null}

      {/* Edit */}
      {openEdit && editing ? (
        <ModalShell title="แก้ไขบัญชี" onClose={() => setOpenEdit(false)}>
          <div className="glass-panel border border-white/20 rounded-2xl p-4 mb-4">
            <div className="text-xs text-gray-800/70">ยอดคงเหลือปัจจุบัน</div>
            <div className="text-2xl font-extrabold text-gray-900 mt-1">{formatCurrency(computedBalance)}</div>
          </div>

          <label className="text-xs font-bold text-gray-800/70 mb-1 block">ประเภทบัญชี</label>
          <TypePills value={eType} onChange={setEType} />

          <label className="text-xs font-bold text-gray-800/70 mb-1 block mt-4">ชื่อบัญชี</label>
          <input
            value={eName}
            onChange={(e) => setEName(e.target.value)}
            className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-extrabold text-gray-900"
          />

          {/* ✅ single input for Edit (THIS FIXES YOUR ISSUE) */}
          <input ref={editImgRef} type="file" accept="image/*" className="hidden" onChange={onEditImageSelected} />
          <div className="mt-4">
            <ImagePickerInline value={eIcon} onPickClick={pickEditImageClick} onClear={clearEditImage} disabled={imgBusy} />
          </div>

          <div className="mt-4">
            <IconPicker value={eIcon} onChange={setEIcon} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="text-xs font-bold text-gray-800/70 mb-1 block">ไอคอน (พิมพ์เองได้)</label>
              <input
                value={eIcon}
                onChange={(e) => setEIcon(e.target.value)}
                className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 text-2xl"
              />
            </div>

            <div className="min-w-0">
              <label className="text-xs font-bold text-gray-800/70 mb-1 block">ตั้งยอดใหม่</label>
              <input
                value={eBalance}
                onChange={(e) => setEBalance(e.target.value)}
                type="number"
                className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-extrabold text-gray-900"
                placeholder="เช่น 1200"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="text-xs font-bold text-gray-800/70 mb-1 block">เลขบัญชี/เลขท้ายบัตร</label>
            <input
              value={eAccountNumber}
              onChange={(e) => setEAccountNumber(e.target.value)}
              className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-extrabold text-gray-900"
              placeholder="ตัวเลขเท่านั้น"
            />
          </div>

          {eType === "credit" ? (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="col-span-3">
                <label className="text-xs font-bold text-gray-800/70 mb-1 block">วงเงิน (Credit Limit)</label>
                <input
                  value={eCreditLimit}
                  onChange={(e) => setECreditLimit(e.target.value)}
                  type="number"
                  className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-extrabold text-gray-900"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-800/70 mb-1 block">วันตัดรอบ</label>
                <input
                  value={eStatementDay}
                  onChange={(e) => setEStatementDay(e.target.value)}
                  type="number"
                  className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-extrabold text-gray-900"
                  min="1"
                  max="31"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-800/70 mb-1 block">วันครบกำหนด</label>
                <input
                  value={eDueDay}
                  onChange={(e) => setEDueDay(e.target.value)}
                  type="number"
                  className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-extrabold text-gray-900"
                  min="1"
                  max="31"
                />
              </div>
              <div className="flex items-end text-[11px] text-gray-800/55">ข้อมูลบัตร</div>
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between glass-panel border border-white/20 rounded-2xl px-4 py-3">
            <div>
              <div className="text-sm font-extrabold text-gray-900">บันทึกเป็นรายการ (Transaction)</div>
              <div className="text-[12px] text-gray-800/60">เปิด = จะไปอยู่ในสรุปผล/สถิติด้วย</div>
            </div>

            <button
              type="button"
              onClick={() => setRecordAsTx((v) => !v)}
              className={`w-14 h-8 rounded-full transition-all relative border ${
                recordAsTx ? "bg-gray-900/90 border-white/20" : "bg-white/20 border-white/20"
              }`}
              aria-label="toggle record as transaction"
            >
              <span className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${recordAsTx ? "left-7" : "left-1"}`} />
            </button>
          </div>

          <div className="mt-4">
            <label className="text-xs font-bold text-gray-800/70 mb-2 block">สี</label>
            <ColorDots value={eColor} onChange={setEColor} />
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={() => setOpenEdit(false)}
              className="flex-1 py-3 rounded-2xl glass-chip font-extrabold text-gray-800 active:scale-95"
              disabled={imgBusy}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={saveEdit}
              className="flex-1 py-3 rounded-2xl bg-gray-900/90 text-white font-extrabold flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60"
              disabled={imgBusy}
            >
              <Check size={18} /> บันทึก
            </button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
