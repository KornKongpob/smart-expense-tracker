// src/views/AccountsView.jsx
import { useEffect, useMemo, useState } from "react";
import { parseDigitsList, choosePrimaryDigits, formatDigitsSummary } from "../utils/accountMatch";
import { useAppStore } from "../store/store";
import { calcAccountBalance } from "../store/selectors";
import { formatCurrency } from "../utils/format";
import { parseMoneyToSatang, sanitizeMoneyInput, formatMoneyInputFromSatang } from "../utils/money";
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
  const store = useAppStore();
  const accounts = store.state.accounts || [];
  const { addAccount, updateAccount, deleteAccount, adjustAccountBalance } = store;

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

  const toggleSignedNumberString = (val) => {
    const s = String(val || "").trim();
    if (!s) return "-";
    if (s === "-") return "";
    return s.startsWith("-") ? s.slice(1) : `-${s}`;
  };

  // Create modal
  const [openCreate, setOpenCreate] = useState(false);
  const [cName, setCName] = useState("");
  const [cType, setCType] = useState("bank");
  const [cCurrency, setCCurrency] = useState("THB");
  const [cAccountNumber, setCAccountNumber] = useState("");
  const [cIcon, setCIcon] = useState("💳");
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
    setCCurrency("THB");
    setCAccountNumber("");
    setCInitialBalance("");
    setOpenCreateAdjustConfirm(false);
    setPendingCreateAccount(null);
    setPendingCreateAdjust(null);
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

  const baseAccount = {
    id: generateId(),
    name: cName.trim(),
    icon: (cIcon || "💳").trim() || "💳",
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
  if (initRaw) {
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

  // ✅ Adjust balance UI
  const [eDesiredBalance, setEDesiredBalance] = useState("");
  const [openAdjustConfirm, setOpenAdjustConfirm] = useState(false);
  const [pendingEdit, setPendingEdit] = useState(null);
  const [pendingAdjust, setPendingAdjust] = useState(null);

  const openEditModal = (acc) => {
    setEEditing(acc?.id || null);
    setEName(acc?.name || "");
    setEType(acc?.type || "bank");
    setECurrency(acc?.currency || "THB");
    setEAccountNumber(Array.isArray(acc.matchDigits) && acc.matchDigits.length ? acc.matchDigits.join(", ") : String(acc.accountNumber || ""));
    setEIcon(acc?.icon || "💳");
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

    const partial = {
      id: eEditing,
      name: eName.trim(),
      icon: (eIcon || "💳").trim() || "💳",
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
    if (!desiredRaw) {
      updateAccount(partial);
      closeEditModal();
      showAlert?.("บันทึกแล้ว");
      return;
    }

    const desired = parseMoneyToSatang(desiredRaw);

    const current = calcAccountBalance(store.state.accounts, store.state.transactions, eEditing);
    const delta = desired - current;

    if (delta === 0) {
      updateAccount(partial);
      closeEditModal();
      showAlert?.("บันทึกแล้ว");
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
    const ok = window.confirm(
      "ลบบัญชีนี้?\n\nระบบจะลบรายการธุรกรรมทั้งหมดของบัญชีนี้ด้วย (รวมถึงรายการโอนที่เกี่ยวข้อง)"
    );
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
    <div className="min-h-dvh">
      <AppHeader
        title="บัญชี"
        subtitle="จัดการบัญชี/บัตร และเลขท้ายเพื่อช่วยสแกนแม่นขึ้น"
        right={
          <button
            type="button"
            onClick={() => {
              resetCreate();
              setOpenCreate(true);
            }}
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
              จัดการบัญชี/บัตรที่ใช้บันทึกรายการ (แนะนำใส่ <span className="font-black text-gray-900">เลขท้าย 4–6 หลัก</span> จากสลิป)
              และถ้ามีหลายแบบให้ใส่หลายชุด เช่น <span className="font-black text-gray-900">6345, 4373</span> เพื่อ map แม่นขึ้น
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
                <div className="flex items-center gap-2">
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

              <div className="mt-4 space-y-3">
                {items.map((acc) => (
                  <div
                    key={acc.id}
                    className="glass-panel rounded-3xl p-4 bg-white/20 border border-white/20"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg border border-white/20"
                          style={{ background: acc.color || "#111827", color: "white" }}
                          title={acc.name}
                        >
                          <span className="drop-shadow text-[22px] leading-none">{acc.icon || "💳"}</span>
                        </div>

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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/35 p-3 overflow-x-hidden">
          <div className="w-full max-w-lg glass-card rounded-3xl p-4 bg-white/25 border border-white/20 shadow-2xl max-h-[92dvh] overflow-y-auto overflow-x-hidden">
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

            <div className="mt-4">
  <label className="text-xs font-bold text-gray-800/70 mb-1 block">
    ยอดตั้งต้นในบัญชี (ไม่บังคับ)
  </label>
  <div className="flex items-center gap-2 min-w-0">
    <input
      value={cInitialBalance}
      onChange={(e) => setCInitialBalance(sanitizeMoneyInput(e.target.value, { maxDecimals: 2 }))}
      className="flex-1 min-w-0 glass-input rounded-2xl px-4 py-3 bg-white/30 outline-none font-extrabold text-gray-900"
      placeholder={cType === "credit" ? "เช่น -5000.00" : "เช่น 500.00"}
      inputMode="decimal"
    />
    {cType === "credit" ? (
      <button
        type="button"
        onClick={() => setCInitialBalance(toggleSignedNumberString(cInitialBalance))}
        className="shrink-0 w-12 h-12 rounded-2xl bg-white/30 border border-white/20 text-gray-900 font-extrabold active:scale-[0.98]"
        title="สลับเครื่องหมายบวก/ลบ"
      >
        ±
      </button>
    ) : null}
  </div>
  <p className="text-[11px] text-gray-800/55 mt-1 leading-relaxed">
    ถ้ากรอก ระบบจะถามว่าจะบันทึกยอดตั้งต้นเป็นรายการ{" "}
    <span className="font-black text-gray-900">ปรับยอดบัญชี</span> (Income/Expense) หรือไม่
  </p>
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
                    onChange={(e) => setCCreditLimit(sanitizeMoneyInput(e.target.value, { maxDecimals: 2 }))}
                    className="w-full glass-input rounded-2xl px-4 py-3 bg-white/30 outline-none font-extrabold text-gray-900"
                    placeholder="เช่น 50000.00"
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

      
{/* ✅ Opening balance confirmation (create) */}
{openCreateAdjustConfirm && pendingCreateAdjust && pendingCreateAccount ? (
  <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/35 p-3 overflow-x-hidden">
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
              date: new Date().toISOString().slice(0, 10),
              note: "ยอดตั้งต้น",
              isTransfer: false,
              meta: { kind: "opening_balance" },
            });

            setOpenCreateAdjustConfirm(false);
            setPendingCreateAccount(null);
            setPendingCreateAdjust(null);
            setOpenCreate(false);
            resetCreate();
            showAlert?.("เพิ่มบัญชีแล้ว (มีรายการยอดตั้งต้น)");
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
            showAlert?.("เพิ่มบัญชีแล้ว");
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
    </div>
  </div>
) : null}

{/* Edit Modal */}
      {openEdit ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/35 p-3 overflow-x-hidden">
          <div className="w-full max-w-lg glass-card rounded-3xl p-4 bg-white/25 border border-white/20 shadow-2xl max-h-[92dvh] overflow-y-auto overflow-x-hidden">
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

                        <div className="mt-4 min-w-0">
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
                            รองรับหลายชุด (คั่นด้วย <span className="font-bold">,</span> หรือเว้นวรรค) • ใส่เลขท้าย 4–6 หลักที่ปรากฏบนสลิปได้เลย — ถ้าเป็นบัตรเครดิต แนะนำใส่ทั้งเลขที่สลิปแสดงและเลขท้ายหน้าบัตร เช่น{" "}
                            <span className="font-bold">6345, 4373</span>
                          </p>

                          {/* ✅ Adjust balance */}
                          <div className="mt-4 grid grid-cols-2 gap-3 min-w-0">
                            <div className="col-span-2 sm:col-span-1 min-w-0">
                              <label className="text-xs font-bold text-gray-800/70 mb-1 block">
                                ยอดปัจจุบัน (คำนวณ)
                              </label>
                              <div className="w-full rounded-2xl px-4 py-3 bg-white/20 border border-white/20 font-extrabold text-gray-900">
                                {(() => {
                                  const n = calcAccountBalance(store.state.accounts, store.state.transactions, eEditing);
                                  return (eCurrency || "THB") === "THB"
                                    ? formatCurrency(n)
                                    : `${Number(n || 0).toLocaleString()} ${(eCurrency || "").toUpperCase()}`;
                                })()}
                              </div>
                            </div>

                            <div className="col-span-2 sm:col-span-1 min-w-0">
                              <label className="text-xs font-bold text-gray-800/70 mb-1 block">
                                ตั้งยอดบัญชีใหม่ (ไม่บังคับ)
                              </label>

                              <div className="flex items-center gap-2 min-w-0">
                                <input
                                  value={eDesiredBalance}
                                  onChange={(e) => setEDesiredBalance(sanitizeMoneyInput(e.target.value, { maxDecimals: 2 }))}
                                  className="flex-1 min-w-0 glass-input rounded-2xl px-4 py-3 bg-white/30 outline-none font-extrabold text-gray-900"
                                  placeholder={eType === "credit" ? "เช่น -5000" : "เช่น 505"}
                                  inputMode="decimal"
                                />
                                {eType === "credit" ? (
                                  <button
                                    type="button"
                                    onClick={() => setEDesiredBalance(toggleSignedNumberString(eDesiredBalance))}
                                    className="shrink-0 w-12 h-12 rounded-2xl bg-white/30 border border-white/20 text-gray-900 font-extrabold active:scale-[0.98]"
                                    title="สลับเครื่องหมายบวก/ลบ"
                                  >
                                    ±
                                  </button>
                                ) : null}
                              </div>

                              <p className="text-[11px] text-gray-800/55 mt-1 leading-relaxed">
                                ถ้ากรอก ระบบจะถามว่าจะบันทึกส่วนต่างเป็นรายการ{" "}
                                <span className="font-black text-gray-900">ปรับยอดบัญชี</span> (นับเป็น Income/Expense) หรือไม่
                              </p>
                            </div>
                          </div>

                          {(() => {
                            const list = parseDigitsList(eAccountNumber);
                            const primary = choosePrimaryDigits(list);
                            if (!list.length) return null;
                            return (
                              <div className="mt-3 flex flex-wrap gap-2">
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
                    onChange={(e) => setECreditLimit(sanitizeMoneyInput(e.target.value, { maxDecimals: 2 }))}
                    className="w-full glass-input rounded-2xl px-4 py-3 bg-white/30 outline-none font-extrabold text-gray-900"
                    placeholder="เช่น 50000.00"
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
                  const ok = window.confirm(
                    "ลบบัญชีนี้?\n\nระบบจะลบรายการธุรกรรมทั้งหมดของบัญชีนี้ด้วย (รวมถึงรายการโอนที่เกี่ยวข้อง)"
                  );
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

      {/* ✅ Adjust balance confirmation */}
      {openAdjustConfirm && pendingAdjust ? (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/35 p-3">
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
                  showAlert?.("บันทึกแล้ว (มีรายการปรับยอด)");
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
                  showAlert?.("บันทึกแล้ว");
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
      </main>
    </div>
  );
}
