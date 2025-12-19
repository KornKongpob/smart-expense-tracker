// src/views/AddTransactionView.jsx
import React, { useMemo, useState } from "react";
import {
  X,
  Trash2,
  Calendar,
  FileText,
  Camera,
  Loader,
  Eye,
  Edit2,
  Plus,
  Check,
  ArrowLeftRight,
} from "lucide-react";

import { useAppStore } from "../store/store";
import AmountField from "../components/AmountField";
import { scanReceiptOpenAI } from "../services/scanOpenAI";
import { toISODate } from "../utils/format";

function pickCatIdForResult(categories, type, resultCategory) {
  const list = categories?.[type] || [];
  const raw = String(resultCategory || "").toLowerCase();
  const found = list.find((c) => c.id === raw || raw.includes(String(c.id).toLowerCase()));
  return found?.id || (type === "income" ? "salary" : "other");
}

// --- auto match account from slip info ---
function normalizeBank(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/bank/g, "");
}

function extractDigits(s) {
  return String(s || "").replace(/[^\d]/g, "");
}

function matchAccountId(accounts, sideInfo, fallbackId) {
  if (!accounts?.length) return fallbackId || "";

  const bank = normalizeBank(sideInfo?.bank);
  const last4 = extractDigits(sideInfo?.accountLast4).slice(-4) || "";

  // 1) match by last4 in account name (user can name: "KBank 1234")
  if (last4) {
    const hit = accounts.find((a) => extractDigits(a.name).includes(last4));
    if (hit) return hit.id;
  }

  // 2) match by bank keyword in account name
  if (bank) {
    const hit = accounts.find((a) => normalizeBank(a.name).includes(bank));
    if (hit) return hit.id;
  }

  // 3) fallback
  return fallbackId || accounts[0]?.id || "";
}

export default function AddTransactionView({ showAlert, showConfirm }) {
  const {
    state,
    navigate,
    upsertTransaction,
    deleteTransaction,
    getEditingTransaction,
    createTransfer,
    updateTransfer,
  } = useAppStore();

  const initialData = getEditingTransaction();
  const isEditMode = !!initialData;
  const isEditingTransfer = !!(initialData?.isTransfer && initialData?.transferId);

  const accounts = state.accounts;
  const categories = state.categories;

  const [mode, setMode] = useState(isEditingTransfer ? "transfer" : initialData?.type || "expense");

  const [amountDigits, setAmountDigits] = useState(
    initialData?.amount != null ? String(Math.round(Number(initialData.amount))) : ""
  );

  const [date, setDate] = useState(initialData?.date ? String(initialData.date).slice(0, 10) : toISODate(new Date()));
  const [note, setNote] = useState(initialData?.note || "");

  // expense/income
  const [category, setCategory] = useState(initialData?.category || "");
  const [accountId, setAccountId] = useState(initialData?.accountId || accounts?.[0]?.id || "");

  // transfer
  const [fromAccountId, setFromAccountId] = useState(accounts?.[0]?.id || "");
  const [toAccountId, setToAccountId] = useState(accounts?.[1]?.id || accounts?.[0]?.id || "");

  // map both sides when editing transfer
  useMemo(() => {
    if (!isEditingTransfer) return null;
    const tid = initialData.transferId;
    const outTx = state.transactions.find((t) => t.transferId === tid && t.type === "expense");
    const inTx = state.transactions.find((t) => t.transferId === tid && t.type === "income");
    if (outTx?.accountId) setFromAccountId(outTx.accountId);
    if (inTx?.accountId) setToAccountId(inTx.accountId);
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // scan UI
  const [isScanning, setIsScanning] = useState(false);
  const [scanPreview, setScanPreview] = useState(null);
  const [ocrStatus, setOcrStatus] = useState("");

  const amountNumber = useMemo(() => {
    const n = Number(String(amountDigits || "").replace(/[^\d]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }, [amountDigits]);

  const handleDelete = () => {
    if (!initialData?.id) return;
    showConfirm?.("ลบรายการ", "ต้องการลบรายการนี้ใช่ไหม?", () => deleteTransaction(initialData.id), true);
  };

  const handleSave = () => {
    if (mode === "transfer") {
      if (accounts.length < 2) return showAlert?.("ต้องมีอย่างน้อย 2 บัญชีเพื่อทำ Transfer");
      if (!fromAccountId || !toAccountId) return showAlert?.("กรุณาเลือกบัญชีต้นทาง/ปลายทาง");
      if (fromAccountId === toAccountId) return showAlert?.("บัญชีต้นทางและปลายทางต้องไม่ใช่อันเดียวกัน");
      if (!amountNumber || amountNumber <= 0) return showAlert?.("กรุณาระบุจำนวนเงินที่ถูกต้อง");

      if (isEditingTransfer) {
        updateTransfer({
          transferId: initialData.transferId,
          fromAccountId,
          toAccountId,
          amount: amountNumber,
          date,
          note: note || "Transfer",
        });
      } else {
        createTransfer({
          fromAccountId,
          toAccountId,
          amount: amountNumber,
          date,
          note: note || "Transfer",
        });
      }
      return;
    }

    if (!amountNumber || amountNumber <= 0) return showAlert?.("กรุณาระบุจำนวนเงินที่ถูกต้อง");
    if (!category) return showAlert?.("กรุณาเลือกหมวดหมู่");
    if (!accountId) return showAlert?.("กรุณาเลือกบัญชี");

    upsertTransaction({
      id: initialData?.id,
      amount: amountNumber,
      type: mode,
      category,
      accountId,
      date,
      note,
      isTransfer: false,
      transferId: null,
    });
  };

  // --- single file scan (keeps preview) ---
  const scanSingle = async (file) => {
    setIsScanning(true);
    setOcrStatus("กำลังอัปโหลด...");
    const previewUrl = URL.createObjectURL(file);
    setScanPreview(previewUrl);

    try {
      const result = await scanReceiptOpenAI(file, { onStatus: (s) => setOcrStatus(s || "กำลังอ่าน...") });

      // if transfer slip => auto switch to transfer + auto select accounts
      if (result?.isTransfer || String(result?.category || "").toLowerCase() === "transfer") {
        setMode("transfer");
        if (result?.amount) setAmountDigits(String(Math.round(Number(result.amount))));
        if (result?.date) setDate(result.date);
        setNote(result?.note || result?.merchant || "Transfer");

        const fromId = matchAccountId(accounts, result?.transfer?.from, accounts?.[0]?.id);
        const toId = matchAccountId(accounts, result?.transfer?.to, accounts?.[1]?.id || accounts?.[0]?.id);

        setFromAccountId(fromId);
        setToAccountId(toId);
        return;
      }

      // receipt => fill expense by default
      setMode("expense");
      if (result?.amount) setAmountDigits(String(Math.round(Number(result.amount))));
      if (result?.date) setDate(result.date);
      if (result?.merchant) setNote(result.merchant);

      const catId = pickCatIdForResult(categories, "expense", result?.category);
      setCategory(catId);

      // auto pick account (best-effort): keep current selection
    } catch (err) {
      console.error(err);
      showAlert?.("ไม่สามารถอ่านรูปภาพได้ (ลองรูปชัดขึ้น/ไม่มีเงา/ไม่เอียง)");
      URL.revokeObjectURL(previewUrl);
      setScanPreview(null);
    } finally {
      setIsScanning(false);
      setOcrStatus("");
    }
  };

  // --- multi files scan: create 1 slip => 1 transaction immediately ---
  const scanBatchAndCreate = async (files) => {
    setIsScanning(true);
    setOcrStatus(`เตรียมสแกน ${files.length} รูป...`);
    setScanPreview(null);

    let created = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setOcrStatus(`สแกนรูป ${i + 1}/${files.length}...`);

        const result = await scanReceiptOpenAI(file, {
          onStatus: (s) => setOcrStatus(`รูป ${i + 1}/${files.length}: ${s || "กำลังอ่าน..."}`),
        });

        const amt = Number(result?.amount);
        const iso = result?.date || toISODate(new Date());

        // transfer slip
        if (result?.isTransfer || String(result?.category || "").toLowerCase() === "transfer") {
          const fromId = matchAccountId(accounts, result?.transfer?.from, accounts?.[0]?.id);
          const toId = matchAccountId(accounts, result?.transfer?.to, accounts?.[1]?.id || accounts?.[0]?.id);

          if (fromId && toId && fromId !== toId && Number.isFinite(amt) && amt > 0) {
            createTransfer({
              fromAccountId: fromId,
              toAccountId: toId,
              amount: Math.round(amt),
              date: iso,
              note: result?.note || result?.merchant || "Transfer",
            });
            created += 1;
            continue;
          }

          // if cannot auto create, create as normal expense fallback (still 1 record)
          upsertTransaction({
            amount: Number.isFinite(amt) && amt > 0 ? Math.round(amt) : 0,
            type: "expense",
            category: "other",
            accountId: accounts?.[0]?.id || "",
            date: iso,
            note: result?.note || result?.merchant || "Transfer (ตรวจสอบมือ)",
            isTransfer: false,
            transferId: null,
          });
          created += 1;
          continue;
        }

        // receipt => create expense
        const catId = pickCatIdForResult(categories, "expense", result?.category);

        upsertTransaction({
          amount: Number.isFinite(amt) && amt > 0 ? Math.round(amt) : 0,
          type: "expense",
          category: catId,
          accountId: accounts?.[0]?.id || "",
          date: iso,
          note: result?.merchant || result?.note || "",
          isTransfer: false,
          transferId: null,
        });
        created += 1;
      }

      showAlert?.(`สร้างรายการจากสลิปสำเร็จ ${created} รายการ`);
      navigate("dashboard");
    } catch (err) {
      console.error(err);
      showAlert?.("สแกนหลายรูปไม่สำเร็จ (บางรูปอาจอ่านไม่ได้) ลองใหม่อีกครั้ง");
    } finally {
      setIsScanning(false);
      setOcrStatus("");
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;

    // multi => create immediately
    if (files.length > 1) {
      await scanBatchAndCreate(files);
      return;
    }

    // single => fill form (preview)
    await scanSingle(files[0]);
  };

  return (
    <div className="pb-28 pt-6 px-4 bg-gray-50 min-h-dvh">
      <div className="flex justify-between items-center mb-5">
        <button
          onClick={() => navigate("dashboard")}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-500 shadow-sm"
          type="button"
          aria-label="back"
        >
          <X size={20} />
        </button>

        <h2 className="text-lg font-extrabold text-gray-900">
          {isEditMode ? (isEditingTransfer ? "แก้ไข Transfer" : "แก้ไขรายการ") : "บันทึกรายการใหม่"}
        </h2>

        {isEditMode ? (
          <button
            onClick={handleDelete}
            className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-500 shadow-sm"
            type="button"
            aria-label="delete"
          >
            <Trash2 size={20} />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* mode tabs */}
      <div className="bg-white p-1.5 rounded-2xl flex mb-5 shadow-sm border border-gray-100">
        {[
          { key: "expense", label: "รายจ่าย" },
          { key: "income", label: "รายรับ" },
          { key: "transfer", label: "Transfer" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setMode(t.key)}
            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
              mode === t.key ? "bg-gray-900 text-white shadow-sm" : "text-gray-400 hover:bg-gray-50"
            }`}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* preview (single scan only) */}
      {scanPreview && mode !== "transfer" ? (
        <div className="mb-5 relative group rounded-2xl overflow-hidden shadow-sm border border-gray-200">
          <img src={scanPreview} alt="Slip" className="w-full h-40 object-cover opacity-90" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/35">
            <span className="text-white text-xs font-bold flex items-center gap-2">
              <Eye size={16} /> ตรวจสอบข้อมูล
            </span>
          </div>
        </div>
      ) : null}

      <AmountField
        value={amountDigits}
        onChange={setAmountDigits}
        variant={mode === "transfer" ? "transfer" : mode}
        label={mode === "transfer" ? "จำนวนเงินโอน" : "จำนวนเงิน"}
      />

      {/* ✅ multi upload supported */}
      {!isEditMode ? (
        <div className="mb-6">
          <label
            className={`block w-full bg-white border-2 border-dashed ${
              isScanning ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-400 hover:bg-gray-50"
            } rounded-2xl p-4 transition-all cursor-pointer`}
          >
            <div className="flex flex-col items-center justify-center gap-2 py-2">
              {isScanning ? (
                <Loader className="animate-spin text-gray-900" size={24} />
              ) : (
                <Camera className="text-gray-700" size={24} />
              )}
              <span className="text-gray-900 font-extrabold text-sm">
                {isScanning ? ocrStatus || "กำลังอ่าน..." : "สแกนใบเสร็จ/สลิป (เลือกได้หลายรูป)"}
              </span>
              <span className="text-[11px] text-gray-400">
                เลือกหลายรูปได้ ระบบจะสร้าง 1 รูป = 1 รายการอัตโนมัติ
              </span>
            </div>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileUpload}
              disabled={isScanning}
            />
          </label>
        </div>
      ) : null}

      {/* transfer accounts */}
      {mode === "transfer" ? (
        <div className="mb-6 bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
          <label className="text-xs font-extrabold text-gray-500">จากบัญชี</label>
          <select
            value={fromAccountId}
            onChange={(e) => setFromAccountId(e.target.value)}
            className="w-full mt-2 border border-gray-200 rounded-2xl px-4 py-3 font-bold text-gray-800 bg-white"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon} {a.name}
              </option>
            ))}
          </select>

          <div className="my-3 flex justify-center">
            <div className="w-12 h-12 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-700">
              <ArrowLeftRight size={20} />
            </div>
          </div>

          <label className="text-xs font-extrabold text-gray-500">ไปบัญชี</label>
          <select
            value={toAccountId}
            onChange={(e) => setToAccountId(e.target.value)}
            className="w-full mt-2 border border-gray-200 rounded-2xl px-4 py-3 font-bold text-gray-800 bg-white"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon} {a.name}
              </option>
            ))}
          </select>

          <div className="mt-2 text-[11px] text-gray-400">
            ถ้าสลิปมีชื่อธนาคาร/เลขท้ายบัญชี ระบบจะ auto เลือกให้อัตโนมัติ
          </div>
        </div>
      ) : (
        <>
          {/* accounts select for expense/income */}
          <div className="mb-6">
            <h3 className="text-xs font-extrabold text-gray-400 mb-3 uppercase ml-1">บัญชีที่ใช้</h3>
            <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4">
              {accounts.map((acc) => {
                const isSelected = accountId === acc.id;
                return (
                  <button
                    key={acc.id}
                    onClick={() => setAccountId(acc.id)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all min-w-max ${
                      isSelected
                        ? "bg-gray-900 text-white border-gray-900 shadow-lg"
                        : "bg-white text-gray-700 border-gray-100 shadow-sm"
                    }`}
                    type="button"
                  >
                    <span className="text-xl">{acc.icon || "💳"}</span>
                    <span className="text-sm font-extrabold">{acc.name}</span>
                    {isSelected && <Check size={14} className="ml-1" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* categories */}
          <h3 className="text-xs font-extrabold text-gray-400 mb-3 uppercase ml-1">หมวดหมู่</h3>
          <div className="grid grid-cols-4 gap-3 mb-6">
            {(categories[mode] || []).map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`flex flex-col items-center p-3 rounded-2xl transition-all ${
                  category === cat.id
                    ? "bg-white shadow-md ring-2 ring-gray-900 scale-[1.02]"
                    : "bg-white/60 hover:bg-white border border-transparent hover:border-gray-100"
                }`}
                type="button"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-xl mb-2"
                  style={{ backgroundColor: `${cat.color}20` }}
                >
                  {cat.icon}
                </div>
                <span className="text-[10px] font-extrabold text-gray-600 truncate w-full text-center">{cat.name}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* date & note */}
      <div className="bg-white rounded-3xl shadow-sm overflow-hidden mb-24 border border-gray-100">
        <div className="flex items-center border-b border-gray-100 p-4">
          <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 mr-3">
            <Calendar size={20} />
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 outline-none text-gray-700 bg-transparent font-bold"
          />
        </div>
        <div className="flex items-center p-4">
          <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 mr-3">
            <FileText size={20} />
          </div>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={mode === "transfer" ? "โน้ต Transfer (ถ้ามี)" : "บันทึกช่วยจำ (ถ้ามี)"}
            className="flex-1 outline-none text-gray-700 bg-transparent font-bold"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        className="fixed bottom-6 left-4 right-4 bg-gray-900 text-white py-4 rounded-2xl font-extrabold shadow-xl shadow-gray-200 active:scale-95 transition-all flex items-center justify-center gap-2"
        type="button"
        disabled={isScanning}
      >
        {isEditMode ? <Edit2 size={18} /> : <Plus size={18} />}
        {isEditMode ? "บันทึกการแก้ไข" : "ยืนยันรายการ"}
      </button>
    </div>
  );
}
