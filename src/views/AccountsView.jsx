// src/views/AccountsView.jsx
import { useEffect, useMemo, useState } from "react";
import { parseDigitsList, choosePrimaryDigits, formatDigitsSummary } from "../utils/accountMatch";
import { useAppStore } from "../store/store";
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

const randomColor = () => {
  const palette = [
    "#111827",
    "#0F766E",
    "#1D4ED8",
    "#7C3AED",
    "#B45309",
    "#BE123C",
    "#0E7490",
    "#15803D",
  ];
  return palette[Math.floor(Math.random() * palette.length)];
};

const generateId = () => {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export default function AccountsView() {
  const accounts = useStore((s) => s.accounts);
  const addAccount = useStore((s) => s.addAccount);
  const updateAccount = useStore((s) => s.updateAccount);
  const deleteAccount = useStore((s) => s.deleteAccount);

  const [q, setQ] = useState("");

  // Alerts (small toast style)
  const [alertMsg, setAlertMsg] = useState("");
  const [alertType, setAlertType] = useState("ok"); // ok | warn
  const showAlert = (msg, type = "ok") => {
    setAlertMsg(msg);
    setAlertType(type);
    window.clearTimeout(showAlert._t);
    showAlert._t = window.setTimeout(() => setAlertMsg(""), 2400);
  };

  // Create modal
  const [openCreate, setOpenCreate] = useState(false);
  const [cName, setCName] = useState("");
  const [cType, setCType] = useState("bank");
  const [cCurrency, setCCurrency] = useState("THB");
  const [cAccountNumber, setCAccountNumber] = useState("");
  const [cIcon, setCIcon] = useState("💳");
  const [cColor, setCColor] = useState(randomColor());

  // credit-only fields
  const [cCreditLimit, setCCreditLimit] = useState("");
  const [cStatementDay, setCStatementDay] = useState(20);
  const [cDueDay, setCDueDay] = useState(5);

  const resetCreate = () => {
    setCName("");
    setCType("bank");
    setCCurrency("THB");
    setCAccountNumber("");
    setCIcon("💳");
    setCColor(randomColor());
    setCCreditLimit("");
    setCStatementDay(20);
    setCDueDay(5);
  };

  const create = () => {
    if (!cName.trim()) return showAlert?.("กรุณาใส่ชื่อบัญชี");

    const matchDigits = parseDigitsList(cAccountNumber);
    const primaryDigits = choosePrimaryDigits(matchDigits);

    addAccount({
      id: generateId(),
      name: cName.trim(),
      icon: (cIcon || "💳").trim() || "💳",
      color: cColor,
      type: cType,
      currency: cCurrency,
      accountNumber: primaryDigits ? String(primaryDigits).slice(-16) : "",
      matchDigits,

      // credit only
      creditLimit: cType === "credit" ? Number(cCreditLimit || 0) : undefined,
      statementDay: cType === "credit" ? Number(cStatementDay || 1) : undefined,
      dueDay: cType === "credit" ? Number(cDueDay || 1) : undefined,
    });

    resetCreate();
    setOpenCreate(false);
    showAlert?.("เพิ่มบัญชีแล้ว");
  };

  // Edit modal
  const [openEdit, setOpenEdit] = useState(false);
  const [eEditing, setEEditing] = useState(null);
  const [eName, setEName] = useState("");
  const [eType, setEType] = useState("bank");
  const [eCurrency, setECurrency] = useState("THB");
  const [eAccountNumber, setEAccountNumber] = useState("");
  const [eIcon, setEIcon] = useState("💳");
  const [eColor, setEColor] = useState("#111827");

  // credit-only edit fields
  const [eCreditLimit, setECreditLimit] = useState("");
  const [eStatementDay, setEStatementDay] = useState(20);
  const [eDueDay, setEDueDay] = useState(5);

  const openEditModal = (acc) => {
    setEEditing(acc?.id || null);
    setEName(acc?.name || "");
    setEType(acc?.type || "bank");
    setECurrency(acc?.currency || "THB");
    setEAccountNumber(Array.isArray(acc.matchDigits) && acc.matchDigits.length ? acc.matchDigits.join(", ") : String(acc.accountNumber || ""));
    setEIcon(acc?.icon || "💳");
    setEColor(acc?.color || "#111827");

    setECreditLimit(acc?.creditLimit != null ? String(acc.creditLimit) : "");
    setEStatementDay(acc?.statementDay != null ? Number(acc.statementDay) : 20);
    setEDueDay(acc?.dueDay != null ? Number(acc.dueDay) : 5);

    setOpenEdit(true);
  };

  const closeEditModal = () => {
    setOpenEdit(false);
    setEEditing(null);
    setEName("");
    setEType("bank");
    setECurrency("THB");
    setEAccountNumber("");
    setEIcon("💳");
    setEColor("#111827");
    setECreditLimit("");
    setEStatementDay(20);
    setEDueDay(5);
  };

  const saveEdit = () => {
    if (!eEditing) return;
    if (!eName.trim()) return showAlert?.("กรุณาใส่ชื่อบัญชี");

    const matchDigits = parseDigitsList(eAccountNumber);
    const primaryDigits = choosePrimaryDigits(matchDigits);

    updateAccount(eEditing, {
      name: eName.trim(),
      icon: (eIcon || "💳").trim() || "💳",
      color: eColor,
      type: eType,
      currency: eCurrency,
      accountNumber: primaryDigits ? String(primaryDigits).slice(-16) : "",
      matchDigits,

      // credit only
      creditLimit: eType === "credit" ? Number(eCreditLimit || 0) : undefined,
      statementDay: eType === "credit" ? Number(eStatementDay || 1) : undefined,
      dueDay: eType === "credit" ? Number(eDueDay || 1) : undefined,
    });

    closeEditModal();
    showAlert?.("บันทึกแล้ว");
  };

  const del = (id) => {
    if (!id) return;
    const ok = window.confirm("ลบบัญชีนี้? (รายการธุรกรรมจะยังอยู่)");
    if (!ok) return;
    deleteAccount(id);
    showAlert("ลบแล้ว", "warn");
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
    <div className="px-4 pb-28">
      {/* Header */}
      <div className="mt-4 glass-card rounded-3xl p-4 bg-white/25 border border-white/20 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xl font-black text-gray-900">Accounts</div>
            <div className="text-xs text-gray-800/60 font-bold mt-1 leading-relaxed">
              จัดการบัญชี/บัตรที่ใช้บันทึกรายการ (แนะนำใส่ <span className="font-black text-gray-900">เลขท้าย 4–6 หลัก</span> จากสลิป)
              และถ้ามีหลายแบบให้ใส่หลายชุด เช่น <span className="font-black text-gray-900">6345, 4373</span> เพื่อ map แม่นขึ้น
            </div>
          </div>

          <button
            onClick={() => {
              resetCreate();
              setOpenCreate(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-gray-900 text-white font-extrabold shadow-lg active:scale-[0.98]"
          >
            <Plus size={18} />
            เพิ่ม
          </button>
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

      {/* Accounts list */}
      <div className="mt-4 space-y-3">
        {filtered.length ? (
          filtered.map((acc) => (
            <div
              key={acc.id}
              className="glass-card rounded-3xl p-4 bg-white/25 border border-white/20 shadow-xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-lg border border-white/20"
                    style={{ background: acc.color || "#111827", color: "white" }}
                    title={acc.name}
                  >
                    <span className="drop-shadow">{acc.icon || "💳"}</span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-base font-black text-gray-900">
                        {acc.name || "-"}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-white/30 border border-white/20 text-gray-900 font-extrabold">
                        {typeIcon(acc.type)}
                        {typeLabel(acc.type)}
                      </div>
                      <div className="text-[11px] px-2 py-1 rounded-full bg-white/30 border border-white/20 text-gray-900 font-extrabold">
                        {currencyLabel(acc.currency)}
                      </div>
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

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(acc)}
                    className="p-2 rounded-2xl bg-white/30 border border-white/20 text-gray-900 active:scale-[0.98]"
                    title="แก้ไข"
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    onClick={() => del(acc.id)}
                    className="p-2 rounded-2xl bg-white/30 border border-white/20 text-gray-900 active:scale-[0.98]"
                    title="ลบ"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="glass-card rounded-3xl p-5 bg-white/25 border border-white/20 shadow-xl text-center">
            <div className="text-sm font-extrabold text-gray-900">
              ยังไม่มีบัญชี หรือไม่พบผลลัพธ์
            </div>
            <div className="text-xs text-gray-800/60 font-bold mt-1">
              กดปุ่ม “เพิ่ม” เพื่อสร้างบัญชีใหม่
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {openCreate ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/35 p-3">
          <div className="w-full max-w-lg glass-card rounded-3xl p-4 bg-white/25 border border-white/20 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-lg font-black text-gray-900">เพิ่มบัญชี</div>
                <div className="text-xs text-gray-800/60 font-bold mt-1 leading-relaxed">
                  ใส่เลขช่วยจำสำหรับ map ได้หลายชุด เช่น{" "}
                  <span className="font-black text-gray-900">6345, 4373</span>
                </div>
              </div>
              <button
                onClick={() => setOpenCreate(false)}
                className="p-2 rounded-2xl bg-white/30 border border-white/20 text-gray-900 active:scale-[0.98]"
                title="ปิด"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4">
              <label className="text-xs font-bold text-gray-800/70 mb-1 block">
                ชื่อบัญชี
              </label>
              <input
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                className="w-full glass-input rounded-2xl px-4 py-3 bg-white/30 outline-none focus:border-gray-900 font-extrabold text-gray-900"
                placeholder="เช่น KBank / เงินสด / Visa"
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-800/70 mb-1 block">
                  ประเภท
                </label>
                <select
                  value={cType}
                  onChange={(e) => setCType(e.target.value)}
                  className="w-full glass-input rounded-2xl px-4 py-3 bg-white/30 outline-none font-extrabold text-gray-900"
                >
                  <option value="bank">บัญชีธนาคาร</option>
                  <option value="cash">เงินสด</option>
                  <option value="credit">บัตรเครดิต</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-800/70 mb-1 block">
                  สกุลเงิน
                </label>
                <select
                  value={cCurrency}
                  onChange={(e) => setCCurrency(e.target.value)}
                  className="w-full glass-input rounded-2xl px-4 py-3 bg-white/30 outline-none font-extrabold text-gray-900"
                >
                  <option value="THB">THB (฿)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-800/70 mb-1 block">
                  ไอคอน (Emoji)
                </label>
                <input
                  value={cIcon}
                  onChange={(e) => setCIcon(e.target.value)}
                  className="w-full glass-input rounded-2xl px-4 py-3 bg-white/30 outline-none font-extrabold text-gray-900"
                  placeholder="💳"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-800/70 mb-1 block">
                  สี
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={cColor}
                    onChange={(e) => setCColor(e.target.value)}
                    className="w-12 h-12 rounded-2xl bg-transparent border border-white/20 overflow-hidden"
                    title="เลือกสี"
                  />
                  <button
                    onClick={() => setCColor(randomColor())}
                    className="flex-1 px-3 py-3 rounded-2xl bg-white/30 border border-white/20 text-gray-900 font-extrabold flex items-center justify-center gap-2 active:scale-[0.98]"
                    title="สุ่มสี"
                  >
                    <Sparkles size={18} />
                    สุ่ม
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4">
            <label className="text-xs font-bold text-gray-800/70 mb-1 block">
              เลขช่วยจำสำหรับ map (ใส่ได้หลายชุด)
            </label>
            <input
              value={cAccountNumber}
              onChange={(e) => setCAccountNumber(e.target.value)}
              className="w-full glass-input rounded-2xl px-4 py-3 bg-white/30 outline-none focus:border-gray-900 font-extrabold text-gray-900"
              placeholder="เช่น 6345, 4373 หรือ 1234567890"
              inputMode="numeric"
              autoComplete="off"
            />
            <p className="text-[11px] text-gray-800/55 mt-1 leading-relaxed">
              รองรับหลายชุด (คั่นด้วย <span className="font-bold">,</span> หรือเว้นวรรค) • แนะนำใส่เลขท้าย 4–6 หลักที่ปรากฏบนสลิป
              และถ้าสลิปแสดงเลขได้หลายแบบ ให้ใส่หลายชุด เช่น <span className="font-bold">6345, 4373</span> (เหมาะมากกับบัญชีบัตรเครดิต)
            </p>

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
                        d === primary ? "bg-gray-900/90 text-white border-white/20" : "bg-white/30 text-gray-900 border-white/20"
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

            {/* Credit-only */}
            {cType === "credit" ? (
              <div className="mt-4 glass-card rounded-3xl p-4 bg-white/20 border border-white/20">
                <div className="text-sm font-black text-gray-900 flex items-center gap-2">
                  <CreditCard size={18} />
                  ตั้งค่าบัตรเครดิต
                </div>

                <div className="mt-3">
                  <label className="text-xs font-bold text-gray-800/70 mb-1 block">
                    วงเงิน
                  </label>
                  <input
                    value={cCreditLimit}
                    onChange={(e) => setCCreditLimit(e.target.value)}
                    className="w-full glass-input rounded-2xl px-4 py-3 bg-white/30 outline-none font-extrabold text-gray-900"
                    placeholder="เช่น 50000"
                    inputMode="decimal"
                  />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-800/70 mb-1 block">
                      วันตัดรอบ
                    </label>
                    <input
                      value={cStatementDay}
                      onChange={(e) => setCStatementDay(Number(e.target.value || 1))}
                      className="w-full glass-input rounded-2xl px-4 py-3 bg-white/30 outline-none font-extrabold text-gray-900"
                      placeholder="20"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-800/70 mb-1 block">
                      วันครบกำหนด
                    </label>
                    <input
                      value={cDueDay}
                      onChange={(e) => setCDueDay(Number(e.target.value || 1))}
                      className="w-full glass-input rounded-2xl px-4 py-3 bg-white/30 outline-none font-extrabold text-gray-900"
                      placeholder="5"
                      inputMode="numeric"
                    />
                  </div>
                </div>

                <div className="text-[11px] text-gray-800/55 mt-2 leading-relaxed">
                  แนะนำใส่เลขช่วยจำสำหรับ map เป็น <span className="font-black text-gray-900">เลขท้ายบนสลิป</span> และ
                  <span className="font-black text-gray-900">เลขท้ายหน้าบัตร</span> ถ้ามีหลายแบบ เช่น{" "}
                  <span className="font-black text-gray-900">6345, 4373</span>
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setOpenCreate(false)}
                className="px-4 py-3 rounded-2xl bg-white/30 border border-white/20 text-gray-900 font-extrabold active:scale-[0.98]"
              >
                ยกเลิก
              </button>
              <button
                onClick={create}
                className="px-5 py-3 rounded-2xl bg-gray-900 text-white font-extrabold shadow-lg active:scale-[0.98]"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit Modal */}
      {openEdit ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/35 p-3">
          <div className="w-full max-w-lg glass-card rounded-3xl p-4 bg-white/25 border border-white/20 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-lg font-black text-gray-900">แก้ไขบัญชี</div>
                <div className="text-xs text-gray-800/60 font-bold mt-1">
                  รองรับเลขช่วยจำหลายชุด เช่น{" "}
                  <span className="font-black text-gray-900">6345, 4373</span>
                </div>
              </div>
              <button
                onClick={closeEditModal}
                className="p-2 rounded-2xl bg-white/30 border border-white/20 text-gray-900 active:scale-[0.98]"
                title="ปิด"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4">
              <label className="text-xs font-bold text-gray-800/70 mb-1 block">
                ชื่อบัญชี
              </label>
              <input
                value={eName}
                onChange={(e) => setEName(e.target.value)}
                className="w-full glass-input rounded-2xl px-4 py-3 bg-white/30 outline-none focus:border-gray-900 font-extrabold text-gray-900"
                placeholder="เช่น KBank / เงินสด / Visa"
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-800/70 mb-1 block">
                  ประเภท
                </label>
                <select
                  value={eType}
                  onChange={(e) => setEType(e.target.value)}
                  className="w-full glass-input rounded-2xl px-4 py-3 bg-white/30 outline-none font-extrabold text-gray-900"
                >
                  <option value="bank">บัญชีธนาคาร</option>
                  <option value="cash">เงินสด</option>
                  <option value="credit">บัตรเครดิต</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-800/70 mb-1 block">
                  สกุลเงิน
                </label>
                <select
                  value={eCurrency}
                  onChange={(e) => setECurrency(e.target.value)}
                  className="w-full glass-input rounded-2xl px-4 py-3 bg-white/30 outline-none font-extrabold text-gray-900"
                >
                  <option value="THB">THB (฿)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-800/70 mb-1 block">
                  ไอคอน (Emoji)
                </label>
                <input
                  value={eIcon}
                  onChange={(e) => setEIcon(e.target.value)}
                  className="w-full glass-input rounded-2xl px-4 py-3 bg-white/30 outline-none font-extrabold text-gray-900"
                  placeholder="💳"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-800/70 mb-1 block">
                  สี
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={eColor}
                    onChange={(e) => setEColor(e.target.value)}
                    className="w-12 h-12 rounded-2xl bg-transparent border border-white/20 overflow-hidden"
                    title="เลือกสี"
                  />
                  <button
                    onClick={() => setEColor(randomColor())}
                    className="flex-1 px-3 py-3 rounded-2xl bg-white/30 border border-white/20 text-gray-900 font-extrabold flex items-center justify-center gap-2 active:scale-[0.98]"
                    title="สุ่มสี"
                  >
                    <Sparkles size={18} />
                    สุ่ม
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4">
            <label className="text-xs font-bold text-gray-800/70 mb-1 block">
              เลขช่วยจำสำหรับ map (ใส่ได้หลายชุด)
            </label>
            <input
              value={eAccountNumber}
              onChange={(e) => setEAccountNumber(e.target.value)}
              className="w-full glass-input rounded-2xl px-4 py-3 bg-white/30 outline-none focus:border-gray-900 font-extrabold text-gray-900"
              placeholder="เช่น 6345, 4373 หรือ 1234567890"
              inputMode="numeric"
              autoComplete="off"
            />
            <p className="text-[11px] text-gray-800/55 mt-1 leading-relaxed">
              รองรับหลายชุด (คั่นด้วย <span className="font-bold">,</span> หรือเว้นวรรค) • ใส่เลขท้าย 4–6 หลักที่ปรากฏบนสลิปได้เลย
              — ถ้าเป็นบัตรเครดิต แนะนำใส่ทั้งเลขที่สลิปแสดงและเลขท้ายหน้าบัตร เช่น <span className="font-bold">6345, 4373</span>
            </p>

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
                        d === primary ? "bg-gray-900/90 text-white border-white/20" : "bg-white/30 text-gray-900 border-white/20"
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

            {/* Credit-only */}
            {eType === "credit" ? (
              <div className="mt-4 glass-card rounded-3xl p-4 bg-white/20 border border-white/20">
                <div className="text-sm font-black text-gray-900 flex items-center gap-2">
                  <CreditCard size={18} />
                  ตั้งค่าบัตรเครดิต
                </div>

                <div className="mt-3">
                  <label className="text-xs font-bold text-gray-800/70 mb-1 block">
                    วงเงิน
                  </label>
                  <input
                    value={eCreditLimit}
                    onChange={(e) => setECreditLimit(e.target.value)}
                    className="w-full glass-input rounded-2xl px-4 py-3 bg-white/30 outline-none font-extrabold text-gray-900"
                    placeholder="เช่น 50000"
                    inputMode="decimal"
                  />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-800/70 mb-1 block">
                      วันตัดรอบ
                    </label>
                    <input
                      value={eStatementDay}
                      onChange={(e) => setEStatementDay(Number(e.target.value || 1))}
                      className="w-full glass-input rounded-2xl px-4 py-3 bg-white/30 outline-none font-extrabold text-gray-900"
                      placeholder="20"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-800/70 mb-1 block">
                      วันครบกำหนด
                    </label>
                    <input
                      value={eDueDay}
                      onChange={(e) => setEDueDay(Number(e.target.value || 1))}
                      className="w-full glass-input rounded-2xl px-4 py-3 bg-white/30 outline-none font-extrabold text-gray-900"
                      placeholder="5"
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                onClick={() => {
                  if (!eEditing) return;
                  const ok = window.confirm("ลบบัญชีนี้? (รายการธุรกรรมจะยังอยู่)");
                  if (!ok) return;
                  deleteAccount(eEditing);
                  closeEditModal();
                  showAlert("ลบแล้ว", "warn");
                }}
                className="px-4 py-3 rounded-2xl bg-white/30 border border-white/20 text-gray-900 font-extrabold flex items-center gap-2 active:scale-[0.98]"
              >
                <Trash2 size={18} />
                ลบบัญชี
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={closeEditModal}
                  className="px-4 py-3 rounded-2xl bg-white/30 border border-white/20 text-gray-900 font-extrabold active:scale-[0.98]"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={saveEdit}
                  className="px-5 py-3 rounded-2xl bg-gray-900 text-white font-extrabold shadow-lg active:scale-[0.98]"
                >
                  บันทึก
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Bottom helper */}
      <div className="mt-6 glass-card rounded-3xl p-4 bg-white/20 border border-white/20 shadow-xl">
        <div className="text-sm font-black text-gray-900 flex items-center gap-2">
          <ImageIcon size={18} />
          Tips: เลขช่วยจำสำหรับ map
        </div>
        <div className="text-xs text-gray-800/60 font-bold mt-2 leading-relaxed">
          - ใส่ได้หลายชุด เช่น <span className="font-black text-gray-900">6345, 4373</span> เพื่อรองรับรูปแบบสลิปที่ต่างกัน
          <br />
          - ถ้ามีเลขบัญชีเต็ม (10+ หลัก) ใส่ได้เลย ระบบจะเก็บไว้เพื่อช่วยจับคู่จากเลขท้ายบนสลิป
          <br />
          - ถ้าเป็นบัตรเครดิต บางสลิปอาจแสดงเลขคนละส่วน/คนละตำแหน่ง ให้ใส่หลายชุดจะช่วยลดการ map ผิดบัญชี
        </div>
      </div>
    </div>
  );
}
