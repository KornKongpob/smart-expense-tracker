// src/views/AccountsView.jsx
import { useMemo, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Check, X, CreditCard, Banknote, Wallet, Image as ImageIcon } from "lucide-react";
import { useAppStore } from "../store/store";
import { ACCOUNT_COLORS } from "../constants/presets.jsx";
import { calcAccountBalance } from "../store/selectors";
import { formatCurrency } from "../utils/format";

/**
 * ✅ Icon groups (emoji)
 */
const ACCOUNT_ICON_GROUPS = [
  { id: "cash", title: "เงินสด", emojis: ["💵", "💴", "💶", "💷", "🪙", "💰", "💸", "🧧", "👛"] },
  { id: "bank", title: "ธนาคาร•บัญชี", emojis: ["🏦", "💳", "🏧", "📒", "📘", "🧾", "📄", "🗂️", "🔐", "🔑"] },
  { id: "credit", title: "บัตรเครดิต", emojis: ["💳", "🪪", "📇", "🧾", "💎", "⭐", "🛡️"] },
  { id: "savings", title: "ออมเงิน", emojis: ["🐷", "🏺", "📦", "🔒", "🧱", "🧮", "🎯"] },
  { id: "digital", title: "ดิจิทัล•วอลเล็ต", emojis: ["📱", "📲", "💻", "⌚", "🌐", "🔔"] },
  { id: "invest", title: "ลงทุน", emojis: ["📈", "📉", "🏛️", "🪙", "💹", "💼"] },
  { id: "gold", title: "ของมีค่า", emojis: ["🥇", "🏅", "💎", "🪙", "⭐", "✨"] },
  { id: "business", title: "ธุรกิจ", emojis: ["💼", "🏢", "🏪", "🏭", "📦", "🚚", "🧾"] },
  { id: "misc", title: "อื่นๆ", emojis: ["🏷️", "🧩", "📌", "🗃️", "📬", "🔧"] },
];

const digitsOnly = (s) => String(s || "").replace(/[^\d]/g, "");

function ModalShell({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-sm glass-card rounded-t-3xl sm:rounded-3xl p-5 max-h-[90dvh] overflow-y-auto">
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
    { id: "credit", label: "เครดิต", icon: <CreditCard size={16} /> },
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

function IconPicker({ value, onChange }) {
  const [groupId, setGroupId] = useState("bank");

  const group = useMemo(() => ACCOUNT_ICON_GROUPS.find((g) => g.id === groupId) || ACCOUNT_ICON_GROUPS[0], [groupId]);
  const selected = (value || "💳").trim() || "💳";

  return (
    <div className="glass-panel border border-white/20 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-xs font-extrabold text-gray-800/70">เลือกไอคอน (Emoji)</div>
          <div className="text-[11px] text-gray-800/55 mt-1">แตะเพื่อเลือก • จัดให้อยู่กึ่งกลาง</div>
        </div>

        <div className="shrink-0">
          <div className="text-[11px] text-gray-800/55 text-right">ที่เลือก</div>
          <div className="mt-1 w-12 h-12 rounded-2xl bg-white/20 border border-white/20 flex items-center justify-center">
            <span className="text-[26px] leading-none overflow-hidden select-none">{selected}</span>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <div className="grid grid-cols-3 gap-2">
          {ACCOUNT_ICON_GROUPS.map((g) => {
            const active = groupId === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setGroupId(g.id)}
                className={`h-9 rounded-full border transition-all active:scale-95 px-2 flex items-center justify-center ${
                  active
                    ? "bg-gray-900/90 text-white border-white/20"
                    : "bg-white/18 text-gray-800/70 border-white/20 hover:bg-white/22"
                }`}
                title={g.title}
              >
                <span className="text-[11px] font-extrabold whitespace-nowrap leading-none truncate max-w-full">
                  {g.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-h-56 overflow-y-auto no-scrollbar">
        <div className="grid grid-cols-6 sm:grid-cols-8 gap-2.5 place-items-stretch">
          {group.emojis.map((e, idx) => {
            const isActive = selected === e;
            return (
              <button
                key={`${group.id}_${idx}`}
                type="button"
                onClick={() => onChange?.(e)}
                className={`aspect-square rounded-2xl border transition-all active:scale-95 flex items-center justify-center overflow-hidden ${
                  isActive ? "bg-white/25 border-gray-900/40" : "bg-white/10 border-white/15 hover:bg-white/15"
                }`}
                aria-label={`icon ${e}`}
                title={e}
              >
                <span className="text-[26px] leading-none select-none">{e}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 text-[11px] text-gray-800/55">* ยังสามารถพิมพ์ Emoji เองได้ในช่อง “ไอคอน (พิมพ์เองได้)”</div>
    </div>
  );
}

function AccountImagePicker({ value, onChange, showAlert }) {
  const inputRef = useRef(null);

  const pick = () => inputRef.current?.click();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    // กันไฟล์ใหญ่เกินไป (base64 จะอืดใน localStorage)
    const max = 2.5 * 1024 * 1024; // 2.5MB
    if (file.size > max) {
      showAlert?.("ไฟล์รูปใหญ่เกินไป (แนะนำ < 2.5MB)");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => onChange?.(String(reader.result || ""));
    reader.onerror = () => showAlert?.("อ่านไฟล์รูปไม่สำเร็จ");
    reader.readAsDataURL(file);
  };

  return (
    <div className="glass-panel border border-white/20 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-extrabold text-gray-800/70 flex items-center gap-2">
            <ImageIcon size={14} /> รูปบัญชี (Optional)
          </div>
          <div className="text-[11px] text-gray-800/55 mt-1">ถ้าใส่รูป ระบบจะโชว์รูปแทน emoji</div>
        </div>

        <div className="shrink-0">
          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-white/15 border border-white/15 flex items-center justify-center">
            {value ? <img src={value} alt="account" className="w-full h-full object-cover" /> : <ImageIcon size={20} className="text-gray-700/60" />}
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={pick}
          className="flex-1 py-2.5 rounded-2xl bg-gray-900/90 text-white font-extrabold text-sm active:scale-95"
        >
          เลือกรูป
        </button>
        <button
          type="button"
          onClick={() => onChange?.("")}
          className="px-4 py-2.5 rounded-2xl glass-chip font-extrabold text-gray-800 active:scale-95"
          disabled={!value}
        >
          ลบรูป
        </button>
      </div>

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
    </div>
  );
}

export default function AccountsView({ showAlert, showConfirm }) {
  const { state, addAccount, updateAccount, deleteAccount, adjustAccountBalance } = useAppStore();

  const accounts = state.accounts || [];
  const transactions = state.transactions || [];

  // ✅ Net balance (assets only: cash + bank; exclude credit)
  const netAssets = useMemo(() => {
    let sum = 0;
    for (const a of accounts) {
      if (a.type === "credit") continue;
      sum += calcAccountBalance(accounts, transactions, a.id);
    }
    return sum;
  }, [accounts, transactions]);

  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // create form
  const [cName, setCName] = useState("");
  const [cIcon, setCIcon] = useState("💳");
  const [cImage, setCImage] = useState("");
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
  const [eImage, setEImage] = useState("");
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
    setEImage(acc.image || "");
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
      image: cImage || "",
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
    setCImage("");
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
      image: eImage || "",
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

  return (
    <div className="pb-28 pt-6 px-4 min-h-dvh">
      <header className="mb-4 flex justify-between items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-gray-900">บัญชีของฉัน</h1>
          <p className="text-gray-700/70 text-sm">รองรับรูปบัญชี + emoji • รวมทรัพย์สินไม่รวมเครดิต</p>
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

      {/* ✅ Net Balance */}
      <div className="glass-card rounded-3xl p-5 mb-5">
        <div className="text-xs text-gray-900/60 font-bold">Net Balance (ไม่รวมบัญชีเครดิต)</div>
        <div className="text-3xl font-extrabold text-gray-900 mt-1">{formatCurrency(netAssets)}</div>
        <div className="text-[11px] text-gray-900/55 mt-1">รวมเฉพาะประเภท เงินสด + ธนาคาร</div>
      </div>

      <div className="space-y-3">
        {accounts.map((acc) => {
          const bal = calcAccountBalance(accounts, transactions, acc.id);
          const isCredit = acc.type === "credit";
          const debt = isCredit ? Math.max(0, -bal) : 0;
          const available = isCredit ? Math.max(0, (Number(acc.creditLimit || 0) || 0) - debt) : 0;

          return (
            <div key={acc.id} className="glass-card rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden border border-white/10"
                    style={{ backgroundColor: `${acc.color}22` }}
                  >
                    {acc.image ? (
                      <img src={acc.image} alt="acc" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl">{acc.icon || "💳"}</span>
                    )}
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
                              วงเงินคงเหลือ: <span className="font-extrabold text-gray-900">{formatCurrency(available)}</span>
                            </>
                          ) : null}
                        </>
                      ) : (
                        <>
                          ยอดคงเหลือ:{" "}
                          <span className={`font-extrabold ${bal < 0 ? "text-red-600" : "text-gray-900"}`}>{formatCurrency(bal)}</span>
                        </>
                      )}
                    </div>

                    {acc.accountNumber ? (
                      <div className="text-[11px] text-gray-800/55 mt-1">
                        เลขบัญชี/เลขท้ายบัตร: <span className="font-bold">{acc.accountNumber}</span>
                      </div>
                    ) : null}

                    {acc.type === "credit" && (Number(acc.statementDay || 0) || Number(acc.dueDay || 0)) ? (
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

          <div className="mt-4">
            <AccountImagePicker value={cImage} onChange={setCImage} showAlert={showAlert} />
          </div>

          <div className="mt-4">
            <IconPicker value={cIcon} onChange={setCIcon} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-800/70 mb-1 block">ไอคอน (พิมพ์เองได้)</label>
              <input
                value={cIcon}
                onChange={(e) => setCIcon(e.target.value)}
                className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 text-2xl"
                placeholder="💳"
              />
              <p className="text-[11px] text-gray-800/55 mt-1">ใช้คีย์บอร์ด Emoji บนมือถือได้เลย</p>
            </div>

            <div>
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
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={create}
              className="flex-1 py-3 rounded-2xl bg-gray-900/90 text-white font-extrabold flex items-center justify-center gap-2 active:scale-95"
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

          <div className="mt-4">
            <AccountImagePicker value={eImage} onChange={setEImage} showAlert={showAlert} />
          </div>

          <div className="mt-4">
            <IconPicker value={eIcon} onChange={setEIcon} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-800/70 mb-1 block">ไอคอน (พิมพ์เองได้)</label>
              <input
                value={eIcon}
                onChange={(e) => setEIcon(e.target.value)}
                className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 text-2xl"
              />
            </div>

            <div>
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
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={saveEdit}
              className="flex-1 py-3 rounded-2xl bg-gray-900/90 text-white font-extrabold flex items-center justify-center gap-2 active:scale-95"
            >
              <Check size={18} /> บันทึก
            </button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
