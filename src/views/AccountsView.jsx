import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
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

export default function AccountsView({ showAlert, showConfirm }) {
  const { state, actions } = useAppStore();
  const accounts = state.accounts;
  const transactions = state.transactions;

  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // create
  const [cName, setCName] = useState("");
  const [cIcon, setCIcon] = useState("💳");
  const [cColor, setCColor] = useState(ACCOUNT_COLORS[0]);
  const [cBalance, setCBalance] = useState("0");
  const [cType, setCType] = useState("cash");
  const [cAccNo, setCAccNo] = useState("");
  const [cLast4, setCLast4] = useState("");
  const [cLimit, setCLimit] = useState("0");
  const [cStmt, setCStmt] = useState("25");
  const [cDue, setCDue] = useState("5");

  const editing = useMemo(() => accounts.find((a) => a.id === editingId) || null, [accounts, editingId]);

  const computedBalance = useMemo(() => {
    if (!editing) return 0;
    return calcAccountBalance(accounts, transactions, editing.id);
  }, [editing, accounts, transactions]);

  // edit
  const [eName, setEName] = useState("");
  const [eIcon, setEIcon] = useState("💳");
  const [eColor, setEColor] = useState(ACCOUNT_COLORS[0]);
  const [eBalance, setEBalance] = useState("");
  const [recordAsTx, setRecordAsTx] = useState(false);

  const [eType, setEType] = useState("cash");
  const [eAccNo, setEAccNo] = useState("");
  const [eLast4, setELast4] = useState("");
  const [eLimit, setELimit] = useState("0");
  const [eStmt, setEStmt] = useState("25");
  const [eDue, setEDue] = useState("5");

  const openEditModal = (acc) => {
    setEditingId(acc.id);
    setEName(acc.name || "");
    setEIcon(acc.icon || "💳");
    setEColor(acc.color || ACCOUNT_COLORS[0]);
    setEBalance(String(calcAccountBalance(accounts, transactions, acc.id)));

    setEType(acc.type || "cash");
    setEAccNo(acc.accountNumber || "");
    setELast4(acc.cardLast4 || "");
    setELimit(String(acc.creditLimit || 0));
    setEStmt(String(acc.statementDay || 25));
    setEDue(String(acc.dueDay || 5));

    setRecordAsTx(false);
    setOpenEdit(true);
  };

  const create = () => {
    if (!cName.trim()) return showAlert?.("ใส่ชื่อบัญชี");
    const openingBalance = Number(cBalance || 0);
    if (!Number.isFinite(openingBalance)) return showAlert?.("ยอดเงินไม่ถูกต้อง");

    actions.addAccount({
      name: cName.trim(),
      icon: (cIcon || "💳").trim(),
      color: cColor,
      openingBalance,
      type: cType,
      accountNumber: cAccNo,
      cardLast4: cLast4,
      creditLimit: cLimit,
      statementDay: cStmt,
      dueDay: cDue,
    });

    setOpenCreate(false);
  };

  const saveEdit = () => {
    if (!editing) return;
    if (!eName.trim()) return showAlert?.("ใส่ชื่อบัญชี");

    actions.updateAccount({
      id: editing.id,
      name: eName.trim(),
      icon: (eIcon || "💳").trim(),
      color: eColor,
      type: eType,
      accountNumber: eAccNo,
      cardLast4: eLast4,
      creditLimit: Number(eLimit || 0),
      statementDay: Number(eStmt || 25),
      dueDay: Number(eDue || 5),
    });

    const desired = Number(eBalance);
    if (!Number.isFinite(desired)) return showAlert?.("ยอดเงินไม่ถูกต้อง");

    actions.adjustAccountBalance({
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
      () => actions.deleteAccount(accId),
      true
    );
  };

  return (
    <div className="pb-28 pt-6 px-4 min-h-dvh bg-gray-50">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">บัญชีของฉัน</h1>
          <p className="text-gray-500 text-sm">เพิ่มเลขบัญชี/last4 เพื่อให้ AI เลือกบัญชีถูก</p>
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
          return (
            <div key={acc.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0" style={{ backgroundColor: `${acc.color}22` }}>
                    {acc.icon || "💳"}
                  </div>

                  <div className="min-w-0">
                    <div className="font-bold text-gray-900 truncate">
                      {acc.name}
                      <span className="ml-2 text-[11px] text-gray-400 font-bold uppercase">
                        {acc.type === "credit" ? "CREDIT" : acc.type === "bank" ? "BANK" : "CASH"}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      ยอดคงเหลือ:{" "}
                      <span className={`font-bold ${bal < 0 ? "text-red-500" : "text-gray-900"}`}>
                        {formatCurrency(bal)}
                      </span>
                    </div>
                    {(acc.accountNumber || acc.cardLast4) ? (
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        {acc.accountNumber ? `Acc: ****${String(acc.accountNumber).replace(/\D/g,"").slice(-4)}` : ""}
                        {acc.cardLast4 ? ` • Card: ****${String(acc.cardLast4).replace(/\D/g,"").slice(-4)}` : ""}
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

      {openCreate ? (
        <ModalShell title="เพิ่มบัญชีใหม่" onClose={() => setOpenCreate(false)}>
          <label className="text-xs font-bold text-gray-500 mb-1 block">ชื่อบัญชี</label>
          <input value={cName} onChange={(e) => setCName(e.target.value)} className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900" placeholder="เช่น เงินเก็บ, กสิกร" />

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">ไอคอน (Emoji)</label>
              <input value={cIcon} onChange={(e) => setCIcon(e.target.value)} className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900 text-2xl" placeholder="💳" />
              <p className="text-[11px] text-gray-400 mt-1">ใช้คีย์บอร์ด Emoji บนมือถือได้เลย</p>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">ยอดตั้งต้น</label>
              <input value={cBalance} onChange={(e) => setCBalance(e.target.value)} type="number" className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900" placeholder="0" />
            </div>
          </div>

          <div className="mt-4">
            <label className="text-xs font-bold text-gray-500 mb-2 block">ประเภทบัญชี</label>
            <select value={cType} onChange={(e) => setCType(e.target.value)} className="w-full border border-gray-200 rounded-2xl px-4 py-3">
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
              <option value="credit">Credit Card</option>
            </select>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">เลขบัญชี (ถ้ามี)</label>
              <input value={cAccNo} onChange={(e) => setCAccNo(e.target.value)} className="w-full border border-gray-200 rounded-2xl px-4 py-3" placeholder="เช่น 123-4-56789-0" />
              <p className="text-[11px] text-gray-400 mt-1">ช่วยให้ AI เลือกบัญชีจากสลิปได้แม่นขึ้น</p>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">บัตร last4 (ถ้ามี)</label>
              <input value={cLast4} onChange={(e) => setCLast4(e.target.value)} className="w-full border border-gray-200 rounded-2xl px-4 py-3" placeholder="เช่น 1234" />
            </div>
          </div>

          {cType === "credit" ? (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">Limit</label>
                <input value={cLimit} onChange={(e) => setCLimit(e.target.value)} type="number" className="w-full border border-gray-200 rounded-2xl px-4 py-3" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">Statement day</label>
                <input value={cStmt} onChange={(e) => setCStmt(e.target.value)} type="number" className="w-full border border-gray-200 rounded-2xl px-4 py-3" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">Due day</label>
                <input value={cDue} onChange={(e) => setCDue(e.target.value)} type="number" className="w-full border border-gray-200 rounded-2xl px-4 py-3" />
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <label className="text-xs font-bold text-gray-500 mb-2 block">สี</label>
            <ColorDots value={cColor} onChange={setCColor} />
          </div>

          <div className="flex gap-3 mt-6">
            <button type="button" onClick={() => setOpenCreate(false)} className="flex-1 py-3 rounded-2xl bg-gray-100 font-bold text-gray-700">
              ยกเลิก
            </button>
            <button type="button" onClick={create} className="flex-1 py-3 rounded-2xl bg-gray-900 text-white font-bold flex items-center justify-center gap-2 active:scale-95">
              <Check size={18} /> สร้าง
            </button>
          </div>
        </ModalShell>
      ) : null}

      {openEdit && editing ? (
        <ModalShell title="แก้ไขบัญชี" onClose={() => setOpenEdit(false)}>
          <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 mb-4">
            <div className="text-xs text-gray-500">ยอดคงเหลือปัจจุบัน</div>
            <div className="text-2xl font-extrabold text-gray-900 mt-1">{formatCurrency(computedBalance)}</div>
          </div>

          <label className="text-xs font-bold text-gray-500 mb-1 block">ชื่อบัญชี</label>
          <input value={eName} onChange={(e) => setEName(e.target.value)} className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900" />

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">ไอคอน (Emoji)</label>
              <input value={eIcon} onChange={(e) => setEIcon(e.target.value)} className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900 text-2xl" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">ตั้งยอดใหม่</label>
              <input value={eBalance} onChange={(e) => setEBalance(e.target.value)} type="number" className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900" />
            </div>
          </div>

          <div className="mt-4">
            <label className="text-xs font-bold text-gray-500 mb-2 block">ประเภทบัญชี</label>
            <select value={eType} onChange={(e) => setEType(e.target.value)} className="w-full border border-gray-200 rounded-2xl px-4 py-3">
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
              <option value="credit">Credit Card</option>
            </select>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">เลขบัญชี</label>
              <input value={eAccNo} onChange={(e) => setEAccNo(e.target.value)} className="w-full border border-gray-200 rounded-2xl px-4 py-3" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">บัตร last4</label>
              <input value={eLast4} onChange={(e) => setELast4(e.target.value)} className="w-full border border-gray-200 rounded-2xl px-4 py-3" />
            </div>
          </div>

          {eType === "credit" ? (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">Limit</label>
                <input value={eLimit} onChange={(e) => setELimit(e.target.value)} type="number" className="w-full border border-gray-200 rounded-2xl px-4 py-3" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">Statement day</label>
                <input value={eStmt} onChange={(e) => setEStmt(e.target.value)} type="number" className="w-full border border-gray-200 rounded-2xl px-4 py-3" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">Due day</label>
                <input value={eDue} onChange={(e) => setEDue(e.target.value)} type="number" className="w-full border border-gray-200 rounded-2xl px-4 py-3" />
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between bg-white border border-gray-200 rounded-2xl px-4 py-3">
            <div>
              <div className="text-sm font-bold text-gray-900">บันทึกเป็นรายการ (Transaction)</div>
              <div className="text-[12px] text-gray-500">เปิด = จะไปอยู่ในสรุปผล/สถิติด้วย</div>
            </div>
            <button
              type="button"
              onClick={() => setRecordAsTx((v) => !v)}
              className={`w-14 h-8 rounded-full transition-all relative ${recordAsTx ? "bg-gray-900" : "bg-gray-200"}`}
            >
              <span className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${recordAsTx ? "left-7" : "left-1"}`} />
            </button>
          </div>

          <div className="mt-4">
            <label className="text-xs font-bold text-gray-500 mb-2 block">สี</label>
            <ColorDots value={eColor} onChange={setEColor} />
          </div>

          <div className="flex gap-3 mt-6">
            <button type="button" onClick={() => setOpenEdit(false)} className="flex-1 py-3 rounded-2xl bg-gray-100 font-bold text-gray-700">
              ยกเลิก
            </button>
            <button type="button" onClick={saveEdit} className="flex-1 py-3 rounded-2xl bg-gray-900 text-white font-bold flex items-center justify-center gap-2 active:scale-95">
              <Check size={18} /> บันทึก
            </button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
