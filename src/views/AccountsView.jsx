// src/views/AccountsView.jsx
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Check, X, CreditCard, Banknote, Wallet } from "lucide-react";
import { useAppStore } from "../store/store";
import { ACCOUNT_COLORS } from "../constants/presets.jsx";
import { calcAccountBalance } from "../store/selectors";
import { formatCurrency } from "../utils/format";

function ColorDots({ value, onChange }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {ACCOUNT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-8 h-8 rounded-full border-2 transition-transform ${
            value === c ? "border-gray-400 scale-110" : "border-transparent"
          }`}
          style={{ backgroundColor: c }}
          aria-label={`color ${c}`}
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
    <div className="bg-gray-50 border border-gray-100 rounded-2xl p-1 flex">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onChange(it.id)}
          className={`flex-1 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 ${
            value === it.id ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-white"
          }`}
        >
          {it.icon} {it.label}
        </button>
      ))}
    </div>
  );
}

function ModalShell({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-xl max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center"
            aria-label="close"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const digitsOnly = (s) => String(s || "").replace(/[^\d]/g, "");

export default function AccountsView({ showAlert, showConfirm }) {
  const { state, addAccount, updateAccount, deleteAccount, adjustAccountBalance } = useAppStore();

  const accounts = state.accounts || [];
  const transactions = state.transactions || [];

  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [editingId, setEditingId] = useState(null);

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

  const create = () => {
    if (!cName.trim()) return showAlert?.("ใส่ชื่อบัญชี");
    const openingBalance = Number(cBalance || 0);
    if (!Number.isFinite(openingBalance)) return showAlert?.("ยอดเงินไม่ถูกต้อง");

    addAccount({
      name: cName.trim(),
      icon: (cIcon || "💳").trim(),
      color: cColor,
      type: cType,
      openingBalance,
      accountNumber: digitsOnly(cAccountNumber),
      creditLimit: Number(cCreditLimit || 0) || 0,
      statementDay: Number(cStatementDay || 1) || 1,
      dueDay: Number(cDueDay || 25) || 25,
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

    updateAccount({
      id: editing.id,
      name: eName.trim(),
      icon: (eIcon || "💳").trim(),
      color: eColor,
      type: eType,
      accountNumber: digitsOnly(eAccountNumber),
      creditLimit: Number(eCreditLimit || 0) || 0,
      statementDay: Number(eStatementDay || 1) || 1,
      dueDay: Number(eDueDay || 25) || 25,
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
    showConfirm?.(
      "ลบบัญชี",
      "ยืนยันลบบัญชี? รายการที่เกี่ยวข้องกับบัญชีนี้จะถูกลบด้วย",
      () => deleteAccount(accId),
      true
    );
  };

  return (
    <div className="pb-28 pt-6 px-4 min-h-dvh bg-gray-50">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">บัญชีของฉัน</h1>
          <p className="text-gray-500 text-sm">รองรับเลขบัญชี/เลขท้ายบัตร เพื่อ Auto-detect จากสลิป</p>
        </div>

        <button
          onClick={() => setOpenCreate(true)}
          className="w-11 h-11 bg-gray-900 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95"
          type="button"
          aria-label="add account"
        >
          <Plus size={18} />
        </button>
      </header>

      <div className="space-y-3">
        {accounts.map((acc) => {
          const bal = calcAccountBalance(accounts, transactions, acc.id);
          const isCredit = acc.type === "credit";
          const debt = isCredit ? Math.max(0, -bal) : 0;
          const available = isCredit ? Math.max(0, (Number(acc.creditLimit || 0) || 0) - debt) : 0;

          return (
            <div key={acc.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                    style={{ backgroundColor: `${acc.color}22` }}
                  >
                    {acc.icon || "💳"}
                  </div>

                  <div className="min-w-0">
                    <div className="font-extrabold text-gray-900 truncate">{acc.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
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
                          <span className={`font-extrabold ${bal < 0 ? "text-red-500" : "text-gray-900"}`}>
                            {formatCurrency(bal)}
                          </span>
                        </>
                      )}
                    </div>

                    {acc.accountNumber ? (
                      <div className="text-[11px] text-gray-400 mt-1">
                        เลขบัญชี/เลขท้ายบัตร: <span className="font-bold">{acc.accountNumber}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditModal(acc)}
                    className="w-10 h-10 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center active:scale-95"
                    aria-label="edit"
                  >
                    <Pencil size={18} />
                  </button>

                  {accounts.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => del(acc.id)}
                      className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center active:scale-95"
                      aria-label="delete"
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
          <label className="text-xs font-bold text-gray-500 mb-1 block">ประเภทบัญชี</label>
          <TypePills value={cType} onChange={setCType} />

          <label className="text-xs font-bold text-gray-500 mb-1 block mt-4">ชื่อบัญชี</label>
          <input
            value={cName}
            onChange={(e) => setCName(e.target.value)}
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900"
            placeholder="เช่น KBank, Wallet, Credit Card"
          />

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">ไอคอน (Emoji)</label>
              <input
                value={cIcon}
                onChange={(e) => setCIcon(e.target.value)}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900 text-2xl"
                placeholder="💳"
              />
              <p className="text-[11px] text-gray-400 mt-1">ใช้คีย์บอร์ด Emoji บนมือถือได้เลย</p>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">ยอดตั้งต้น</label>
              <input
                value={cBalance}
                onChange={(e) => setCBalance(e.target.value)}
                type="number"
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900"
                placeholder="0"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="text-xs font-bold text-gray-500 mb-1 block">เลขบัญชี / เลขท้ายบัตร (แนะนำ)</label>
            <input
              value={cAccountNumber}
              onChange={(e) => setCAccountNumber(e.target.value)}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900"
              placeholder="ใส่เฉพาะเลข เช่น 1234567890 หรือ 1234"
            />
            <p className="text-[11px] text-gray-400 mt-1">เพื่อให้ระบบสแกนสลิปแล้ว Auto-select บัญชีได้แม่นยำขึ้น</p>
          </div>

          {cType === "credit" ? (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="col-span-3">
                <label className="text-xs font-bold text-gray-500 mb-1 block">วงเงิน (Credit Limit)</label>
                <input
                  value={cCreditLimit}
                  onChange={(e) => setCCreditLimit(e.target.value)}
                  type="number"
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">วันตัดรอบ</label>
                <input
                  value={cStatementDay}
                  onChange={(e) => setCStatementDay(e.target.value)}
                  type="number"
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900"
                  min="1"
                  max="31"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">วันครบกำหนด</label>
                <input
                  value={cDueDay}
                  onChange={(e) => setCDueDay(e.target.value)}
                  type="number"
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900"
                  min="1"
                  max="31"
                />
              </div>
              <div className="flex items-end text-[11px] text-gray-400">ใช้เพื่อแสดงข้อมูลบัตร</div>
            </div>
          ) : null}

          <div className="mt-4">
            <label className="text-xs font-bold text-gray-500 mb-2 block">สี</label>
            <ColorDots value={cColor} onChange={setCColor} />
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={() => setOpenCreate(false)}
              className="flex-1 py-3 rounded-2xl bg-gray-100 font-extrabold text-gray-700"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={create}
              className="flex-1 py-3 rounded-2xl bg-gray-900 text-white font-extrabold flex items-center justify-center gap-2 active:scale-95"
            >
              <Check size={18} /> สร้าง
            </button>
          </div>
        </ModalShell>
      ) : null}

      {/* Edit */}
      {openEdit && editing ? (
        <ModalShell title="แก้ไขบัญชี" onClose={() => setOpenEdit(false)}>
          <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 mb-4">
            <div className="text-xs text-gray-500">ยอดคงเหลือปัจจุบัน</div>
            <div className="text-2xl font-extrabold text-gray-900 mt-1">{formatCurrency(computedBalance)}</div>
          </div>

          <label className="text-xs font-bold text-gray-500 mb-1 block">ประเภทบัญชี</label>
          <TypePills value={eType} onChange={setEType} />

          <label className="text-xs font-bold text-gray-500 mb-1 block mt-4">ชื่อบัญชี</label>
          <input
            value={eName}
            onChange={(e) => setEName(e.target.value)}
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900"
          />

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">ไอคอน (Emoji)</label>
              <input
                value={eIcon}
                onChange={(e) => setEIcon(e.target.value)}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900 text-2xl"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">ตั้งยอดใหม่</label>
              <input
                value={eBalance}
                onChange={(e) => setEBalance(e.target.value)}
                type="number"
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900"
                placeholder="เช่น 1200"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="text-xs font-bold text-gray-500 mb-1 block">เลขบัญชี/เลขท้ายบัตร</label>
            <input
              value={eAccountNumber}
              onChange={(e) => setEAccountNumber(e.target.value)}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900"
              placeholder="ตัวเลขเท่านั้น"
            />
          </div>

          {eType === "credit" ? (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="col-span-3">
                <label className="text-xs font-bold text-gray-500 mb-1 block">วงเงิน (Credit Limit)</label>
                <input
                  value={eCreditLimit}
                  onChange={(e) => setECreditLimit(e.target.value)}
                  type="number"
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">วันตัดรอบ</label>
                <input
                  value={eStatementDay}
                  onChange={(e) => setEStatementDay(e.target.value)}
                  type="number"
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900"
                  min="1"
                  max="31"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">วันครบกำหนด</label>
                <input
                  value={eDueDay}
                  onChange={(e) => setEDueDay(e.target.value)}
                  type="number"
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900"
                  min="1"
                  max="31"
                />
              </div>
              <div className="flex items-end text-[11px] text-gray-400">ข้อมูลบัตร</div>
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between bg-white border border-gray-200 rounded-2xl px-4 py-3">
            <div>
              <div className="text-sm font-extrabold text-gray-900">บันทึกเป็นรายการ (Transaction)</div>
              <div className="text-[12px] text-gray-500">เปิด = จะไปอยู่ในสรุปผล/สถิติด้วย</div>
            </div>
            <button
              type="button"
              onClick={() => setRecordAsTx((v) => !v)}
              className={`w-14 h-8 rounded-full transition-all relative ${recordAsTx ? "bg-gray-900" : "bg-gray-200"}`}
            >
              <span
                className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${
                  recordAsTx ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>

          <div className="mt-4">
            <label className="text-xs font-bold text-gray-500 mb-2 block">สี</label>
            <ColorDots value={eColor} onChange={setEColor} />
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={() => setOpenEdit(false)}
              className="flex-1 py-3 rounded-2xl bg-gray-100 font-extrabold text-gray-700"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={saveEdit}
              className="flex-1 py-3 rounded-2xl bg-gray-900 text-white font-extrabold flex items-center justify-center gap-2 active:scale-95"
            >
              <Check size={18} /> บันทึก
            </button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
