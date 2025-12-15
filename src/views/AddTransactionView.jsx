// src/views/AddTransactionView.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Trash2,
  Camera,
  Loader2,
  Calendar,
  FileText,
  Check,
  ArrowLeftRight,
  RefreshCcw,
} from "lucide-react";

import { useAppStore } from "../store/store";
import { formatCurrency, toISODate } from "../utils/format";
import { generateId, generateTransferId } from "../utils/id";
import { ACCOUNT_ICONS } from "../constants/presets";

// ✅ ใช้ Serverless OpenAI Scan (ไม่มี API key ในฝั่ง client)
import { fileToBase64, callOpenAIScan } from "../services/scanOpenAI";

export default function AddTransactionView({ showAlert, showConfirm }) {
  const store = useAppStore();

  // รองรับทั้งแบบ store.actions.* และแบบยกฟังก์ชันออกมาเป็น root
  const state = store?.state;
  const actions = store?.actions || {};

  const navigate =
    actions.navigate || store.navigate || ((view) => store.dispatch?.({ type: "NAVIGATE", payload: view }));

  const upsertTransaction =
    actions.upsertTransaction || store.upsertTransaction || ((tx) => store.dispatch?.({ type: "UPSERT_TRANSACTION", payload: tx }));

  const deleteTransaction =
    actions.deleteTransaction || store.deleteTransaction || ((id) => store.dispatch?.({ type: "DELETE_TRANSACTION", payload: id }));

  const startNewTransaction =
    actions.startNewTransaction || store.startNewTransaction || store.startNew || (() => navigate("add"));

  const ui = state?.ui || { view: "add", editingId: null };
  const accounts = state?.accounts || [];
  const categories = state?.categories || { expense: [], income: [] };
  const transactions = state?.transactions || [];

  // ---- Find editing tx (supports transfer pair) ----
  const editingTx = useMemo(() => {
    if (!ui?.editingId) return null;
    return transactions.find((t) => t.id === ui.editingId) || null;
  }, [ui?.editingId, transactions]);

  const editingTransferPair = useMemo(() => {
    if (!editingTx?.isTransfer || !editingTx?.transferId) return null;
    const pair = transactions.find(
      (t) => t.transferId === editingTx.transferId && t.id !== editingTx.id
    );
    if (!pair) return null;

    const fromTx = editingTx.type === "expense" ? editingTx : pair;
    const toTx = editingTx.type === "income" ? editingTx : pair;

    if (!fromTx || !toTx) return null;
    return { fromTx, toTx };
  }, [editingTx, transactions]);

  const isEditMode = !!editingTx;

  // ---- Form mode ----
  const initialMode = useMemo(() => {
    if (!editingTx) return "expense";
    if (editingTx.isTransfer) return "transfer";
    return editingTx.type === "income" ? "income" : "expense";
  }, [editingTx]);

  const [mode, setMode] = useState(initialMode); // expense | income | transfer

  // ---- Form states ----
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [accountId, setAccountId] = useState(accounts?.[0]?.id || "");
  const [toAccountId, setToAccountId] = useState(""); // transfer only
  const [date, setDate] = useState(toISODate(new Date()));
  const [note, setNote] = useState("");

  // ---- Scan states ----
  const [isScanning, setIsScanning] = useState(false);
  const [scanPreview, setScanPreview] = useState(null);
  const [scanStatus, setScanStatus] = useState("");

  const fileInputRef = useRef(null);

  // ✅ reset form when entering add view / switching edit target
  useEffect(() => {
    // NEW
    if (!editingTx) {
      setMode("expense");
      setAmount("");
      setCategory("");
      setAccountId(accounts?.[0]?.id || "");
      setToAccountId("");
      setDate(toISODate(new Date()));
      setNote("");
      setScanPreview(null);
      setIsScanning(false);
      setScanStatus("");
      return;
    }

    // EDIT TRANSFER
    if (editingTx.isTransfer && editingTransferPair) {
      const { fromTx, toTx } = editingTransferPair;
      setMode("transfer");
      setAmount(String(fromTx.amount ?? ""));
      setAccountId(fromTx.accountId || accounts?.[0]?.id || "");
      setToAccountId(toTx.accountId || "");
      setDate((fromTx.date || toISODate(new Date())).slice(0, 10));
      setNote(fromTx.note || "Transfer");
      setCategory(""); // hidden
      setScanPreview(null);
      setIsScanning(false);
      setScanStatus("");
      return;
    }

    // EDIT NORMAL
    setMode(editingTx.type === "income" ? "income" : "expense");
    setAmount(String(editingTx.amount ?? ""));
    setCategory(editingTx.category || "");
    setAccountId(editingTx.accountId || accounts?.[0]?.id || "");
    setToAccountId("");
    setDate((editingTx.date || toISODate(new Date())).slice(0, 10));
    setNote(editingTx.note || "");
    setScanPreview(null);
    setIsScanning(false);
    setScanStatus("");
  }, [ui?.editingId, accounts, editingTx, editingTransferPair]);

  const selectedAccountName = useMemo(
    () => accounts.find((a) => a.id === accountId)?.name || "",
    [accounts, accountId]
  );

  const selectedToAccountName = useMemo(
    () => accounts.find((a) => a.id === toAccountId)?.name || "",
    [accounts, toAccountId]
  );

  const amountNumber = useMemo(() => {
    const v = Number(String(amount).replace(/,/g, ""));
    return Number.isFinite(v) ? v : NaN;
  }, [amount]);

  const amountFormatted = useMemo(() => {
    if (!amount || Number.isNaN(amountNumber)) return "";
    return formatCurrency(amountNumber);
  }, [amount, amountNumber]);

  const isDirty = useMemo(() => {
    if (!editingTx) {
      return (
        String(amount || "").trim() !== "" ||
        String(note || "").trim() !== "" ||
        String(category || "").trim() !== "" ||
        String(accountId || "").trim() !== (accounts?.[0]?.id || "") ||
        String(toAccountId || "").trim() !== "" ||
        String(date || "").trim() !== toISODate(new Date()) ||
        !!scanPreview
      );
    }

    if (mode === "transfer" && editingTransferPair) {
      const { fromTx, toTx } = editingTransferPair;
      return (
        String(amount || "") !== String(fromTx.amount ?? "") ||
        String(accountId || "") !== String(fromTx.accountId || "") ||
        String(toAccountId || "") !== String(toTx.accountId || "") ||
        String(date || "") !== String((fromTx.date || "").slice(0, 10)) ||
        String(note || "") !== String(fromTx.note || "Transfer")
      );
    }

    return (
      String(amount || "") !== String(editingTx.amount ?? "") ||
      String(category || "") !== String(editingTx.category || "") ||
      String(accountId || "") !== String(editingTx.accountId || "") ||
      String(date || "") !== String((editingTx.date || "").slice(0, 10)) ||
      String(note || "") !== String(editingTx.note || "")
    );
  }, [editingTx, editingTransferPair, mode, amount, category, accountId, toAccountId, date, note, scanPreview, accounts]);

  const onClose = () => {
    const go = () => {
      setScanPreview(null);
      setScanStatus("");
      setIsScanning(false);
      navigate("dashboard");
    };

    if (isDirty) {
      showConfirm?.("ยกเลิกการกรอก", "ต้องการออกจากหน้านี้โดยไม่บันทึกใช่ไหม?", () => go(), true);
    } else {
      go();
    }
  };

  const validate = () => {
    if (!amount || Number.isNaN(amountNumber) || amountNumber <= 0) {
      showAlert?.("กรุณาระบุจำนวนเงินให้ถูกต้อง");
      return false;
    }

    if (mode !== "transfer") {
      if (!category) {
        showAlert?.("กรุณาเลือกหมวดหมู่");
        return false;
      }
      if (!accountId) {
        showAlert?.("กรุณาเลือกบัญชี");
        return false;
      }
      return true;
    }

    // transfer
    if (!accountId || !toAccountId) {
      showAlert?.("กรุณาเลือกบัญชีต้นทางและปลายทาง");
      return false;
    }
    if (accountId === toAccountId) {
      showAlert?.("บัญชีต้นทางและปลายทางต้องไม่ใช่บัญชีเดียวกัน");
      return false;
    }
    return true;
  };

  const handleSave = () => {
    if (!validate()) return;

    // ✅ Transfer = สร้าง 2 รายการ (expense จากบัญชีต้นทาง + income เข้าบัญชีปลายทาง) และ flag isTransfer
    if (mode === "transfer") {
      const amountV = amountNumber;
      const d = date;

      // EDIT transfer
      if (editingTransferPair) {
        const { fromTx, toTx } = editingTransferPair;

        const updatedFrom = {
          ...fromTx,
          amount: amountV,
          type: "expense",
          accountId,
          date: d,
          note: note?.trim() || "Transfer",
          isTransfer: true,
          transferId: fromTx.transferId || toTx.transferId || generateTransferId(),
        };

        const updatedTo = {
          ...toTx,
          amount: amountV,
          type: "income",
          accountId: toAccountId,
          date: d,
          note: note?.trim() || "Transfer",
          isTransfer: true,
          transferId: updatedFrom.transferId,
        };

        upsertTransaction(updatedFrom);
        upsertTransaction(updatedTo);

        navigate("dashboard");
        return;
      }

      // NEW transfer
      const transferId = generateTransferId();
      const fromId = generateId();
      const toId = generateId();

      const fromTx = {
        id: fromId,
        amount: amountV,
        type: "expense",
        category: "other", // หมวดหมู่ไม่ใช้ในการ transfer
        accountId,
        date: d,
        note: note?.trim() || "Transfer",
        isTransfer: true,
        transferId,
      };

      const toTx = {
        id: toId,
        amount: amountV,
        type: "income",
        category: "other",
        accountId: toAccountId,
        date: d,
        note: note?.trim() || "Transfer",
        isTransfer: true,
        transferId,
      };

      upsertTransaction(fromTx);
      upsertTransaction(toTx);

      navigate("dashboard");
      return;
    }

    // ✅ Normal expense/income
    const tx = {
      id: editingTx?.id || generateId(),
      amount: amountNumber,
      type: mode === "income" ? "income" : "expense",
      category,
      accountId,
      date,
      note: note?.trim() || "",
      isTransfer: false,
      transferId: null,
    };

    upsertTransaction(tx);
    navigate("dashboard");
  };

  const handleDelete = () => {
    if (!editingTx?.id) return;

    // ถ้าเป็น transfer: ลบคู่
    if (editingTx.isTransfer && editingTransferPair) {
      showConfirm?.("ลบรายการโอน", "ต้องการลบรายการโอนเงินนี้ใช่ไหม?", () => {
        deleteTransaction(editingTransferPair.fromTx.id);
        deleteTransaction(editingTransferPair.toTx.id);
        navigate("dashboard");
      }, true);
      return;
    }

    showConfirm?.("ลบรายการ", "ต้องการลบรายการนี้ใช่ไหม?", () => {
      deleteTransaction(editingTx.id);
      navigate("dashboard");
    }, true);
  };

  // ---- Scan receipt via Serverless OpenAI endpoint ----
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setScanStatus("กำลังอ่านรูป...");

    try {
      const { base64, mimeType, preview } = await fileToBase64(file);
      setScanPreview(preview);
      setScanStatus("กำลังวิเคราะห์ใบเสร็จ...");

      const result = await callOpenAIScan(base64, mimeType);

      // receipt ส่วนใหญ่คือ expense
      setMode("expense");

      if (typeof result?.amount === "number") setAmount(String(result.amount));
      if (typeof result?.date === "string") setDate(result.date);
      if (typeof result?.merchant === "string" && result.merchant) setNote(result.merchant);

      if (typeof result?.category === "string" && result.category) {
        const catId = result.category.toLowerCase();
        const found = categories.expense?.find((c) => c.id === catId) || null;
        if (found) setCategory(found.id);
      }
    } catch (err) {
      console.error(err);
      showAlert?.("สแกนไม่สำเร็จ ลองถ่ายใหม่ให้ชัดขึ้น");
      setScanPreview(null);
    } finally {
      setIsScanning(false);
      setScanStatus("");
      // reset file input เพื่อให้เลือกไฟล์เดิมซ้ำได้
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const clearScan = () => {
    setScanPreview(null);
    setScanStatus("");
    setIsScanning(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ---- UI helpers ----
  const currentCategories = mode === "income" ? categories.income : categories.expense;

  const topTitle =
    mode === "transfer"
      ? isEditMode
        ? "แก้ไขการโอนเงิน"
        : "โอนเงิน"
      : isEditMode
      ? "แก้ไขรายการ"
      : "บันทึกรายการ";

  const showScanBlock = !isEditMode && mode !== "transfer" && !scanPreview;

  return (
    <div className="min-h-dvh bg-gray-50 pb-28">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-gray-50/90 backdrop-blur border-b border-gray-100">
        <div className="px-4 pt-4 pb-3 flex items-center justify-between">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white border border-gray-100 shadow-sm flex items-center justify-center text-gray-600 active:scale-95"
            type="button"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          <div className="text-center">
            <div className="text-sm font-bold text-gray-900">{topTitle}</div>
            <div className="text-[11px] text-gray-400">
              {mode === "transfer"
                ? `${selectedAccountName || "ต้นทาง"} → ${selectedToAccountName || "ปลายทาง"}`
                : selectedAccountName || ""}
            </div>
          </div>

          {isEditMode ? (
            <button
              onClick={handleDelete}
              className="w-10 h-10 rounded-full bg-red-50 border border-red-100 shadow-sm flex items-center justify-center text-red-600 active:scale-95"
              type="button"
              aria-label="Delete"
            >
              <Trash2 size={18} />
            </button>
          ) : (
            <div className="w-10" />
          )}
        </div>

        {/* Mode tabs */}
        <div className="px-4 pb-4">
          <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-1 flex gap-1">
            <button
              type="button"
              onClick={() => {
                setMode("expense");
                setCategory((prev) => prev || "");
                setToAccountId("");
              }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                mode === "expense" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              รายจ่าย
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("income");
                setCategory((prev) => prev || "");
                setToAccountId("");
              }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                mode === "income" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              รายรับ
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("transfer");
                setCategory("");
                // default to different account if possible
                const first = accounts?.[0]?.id || "";
                const second = accounts?.[1]?.id || first;
                setAccountId((v) => v || first);
                setToAccountId((v) => v || (second !== first ? second : first));
              }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                mode === "transfer" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              <ArrowLeftRight size={16} />
              โอนเงิน
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Scan preview */}
        {scanPreview ? (
          <div className="bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-sm">
            <div className="relative">
              <img src={scanPreview} alt="Receipt preview" className="w-full h-44 object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                <div className="text-white text-xs font-bold">
                  {isScanning ? scanStatus || "กำลังสแกน..." : "ภาพใบเสร็จ"}
                </div>
                <button
                  type="button"
                  onClick={clearScan}
                  className="bg-white/90 text-gray-800 rounded-full px-3 py-1.5 text-xs font-bold flex items-center gap-2 active:scale-95"
                >
                  <RefreshCcw size={14} />
                  ลบรูป
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Amount card (minimal, mobile-first) */}
        <div className="bg-white border border-gray-100 rounded-3xl shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-gray-500">จำนวนเงิน</div>
            {amountFormatted ? (
              <div className="text-xs font-bold text-gray-400">{amountFormatted}</div>
            ) : (
              <div className="text-xs text-gray-300">THB</div>
            )}
          </div>

          <div className="mt-2 flex items-end gap-2">
            <div className="text-2xl font-black text-gray-900">฿</div>
            <input
              value={amount}
              onChange={(e) => {
                // กันพิมพ์อะไรแปลกๆ (ยังอนุญาต .)
                const v = e.target.value.replace(/[^\d.]/g, "");
                // กันจุดหลายตัว
                const parts = v.split(".");
                const safe = parts.length <= 2 ? v : `${parts[0]}.${parts.slice(1).join("")}`;
                setAmount(safe);
              }}
              inputMode="decimal"
              pattern="[0-9]*"
              placeholder="0"
              className="flex-1 text-4xl font-black outline-none bg-transparent placeholder:text-gray-200 tracking-tight"
              autoFocus={!isEditMode}
            />
          </div>

          <div className="mt-3 text-[11px] text-gray-400">
            {mode === "transfer"
              ? "โอนเงินจะสร้าง 2 รายการ (ออก/เข้า) แต่ไม่กระทบยอดสุทธิ"
              : "สแกนใบเสร็จช่วยกรอกจำนวนเงิน/วันที่/ร้านค้า"}
          </div>
        </div>

        {/* Accounts */}
        <div className="bg-white border border-gray-100 rounded-3xl shadow-sm p-4">
          <div className="text-xs font-bold text-gray-500 mb-3">
            {mode === "transfer" ? "บัญชี" : "เลือกบัญชี"}
          </div>

          {mode !== "transfer" ? (
            <div className="flex gap-2 overflow-x-auto no-scrollbar - -mx-1 px-1 pb-1">
              {accounts.map((acc) => {
                const iconObj = ACCOUNT_ICONS.find((i) => i.id === acc.type) || ACCOUNT_ICONS[0];
                const isSelected = accountId === acc.id;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setAccountId(acc.id)}
                    className={`min-w-max px-4 py-3 rounded-2xl border text-sm font-bold flex items-center gap-2 transition-all active:scale-[0.98] ${
                      isSelected
                        ? "bg-gray-900 text-white border-gray-900 shadow-lg shadow-gray-200"
                        : "bg-white text-gray-700 border-gray-100 hover:bg-gray-50"
                    }`}
                  >
                    {React.cloneElement(iconObj.icon, { size: 18 })}
                    <span className="truncate max-w-[140px]">{acc.name}</span>
                    {isSelected ? <Check size={14} className="opacity-90" /> : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-bold text-gray-500 min-w-[72px]">ต้นทาง</div>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold text-gray-900 outline-none"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-bold text-gray-500 min-w-[72px]">ปลายทาง</div>
                <select
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold text-gray-900 outline-none"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              {accountId && toAccountId && accountId === toAccountId ? (
                <div className="text-xs text-red-500 font-bold">
                  ต้นทางและปลายทางต้องไม่ใช่บัญชีเดียวกัน
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Scan button */}
        {showScanBlock ? (
          <div className="bg-white border border-dashed border-gray-200 rounded-3xl shadow-sm p-4">
            <label className="block cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-gray-900 text-white flex items-center justify-center">
                    {isScanning ? <Loader2 className="animate-spin" size={18} /> : <Camera size={18} />}
                  </div>
                  <div>
                    <div className="text-sm font-black text-gray-900">
                      {isScanning ? scanStatus || "กำลังสแกน..." : "สแกนใบเสร็จ"}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      ถ่าย/อัปโหลดรูป แล้วระบบจะเติมข้อมูลให้
                    </div>
                  </div>
                </div>

                <div className="text-xs font-bold text-gray-500">ฟรีหน้าจอ • ใช้ API</div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isScanning}
              />
            </label>
          </div>
        ) : null}

        {/* Categories (hidden for transfer) */}
        {mode !== "transfer" ? (
          <div className="bg-white border border-gray-100 rounded-3xl shadow-sm p-4">
            <div className="text-xs font-bold text-gray-500 mb-3">หมวดหมู่</div>

            <div className="grid grid-cols-4 gap-2">
              {(currentCategories || []).map((cat) => {
                const isSelected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`p-3 rounded-2xl border transition-all active:scale-[0.98] ${
                      isSelected
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-100 bg-gray-50 text-gray-700 hover:bg-white"
                    }`}
                    title={cat.name}
                  >
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl mx-auto ${
                        isSelected ? "bg-white/10" : ""
                      }`}
                      style={!isSelected ? { backgroundColor: `${cat.color}20` } : undefined}
                    >
                      {cat.icon}
                    </div>
                    <div className={`mt-2 text-[10px] font-bold truncate ${isSelected ? "text-white" : "text-gray-700"}`}>
                      {cat.name}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Date & note */}
        <div className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
            <div className="w-10 h-10 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500">
              <Calendar size={18} />
            </div>
            <div className="flex-1">
              <div className="text-[11px] font-bold text-gray-400 mb-1">วันที่</div>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-transparent outline-none text-sm font-bold text-gray-900"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 px-4 py-4">
            <div className="w-10 h-10 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500">
              <FileText size={18} />
            </div>
            <div className="flex-1">
              <div className="text-[11px] font-bold text-gray-400 mb-1">บันทึก</div>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={mode === "transfer" ? "เช่น โอนเงินเข้าออม" : "เช่น กาแฟ, ค่าเดินทาง"}
                className="w-full bg-transparent outline-none text-sm font-bold text-gray-900 placeholder:text-gray-300"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom action */}
      <div className="fixed left-0 right-0 bottom-0 pb-safe z-50">
        <div className="max-w-md mx-auto px-4 pb-5">
          <button
            type="button"
            onClick={handleSave}
            disabled={isScanning}
            className={`w-full rounded-2xl py-4 font-black shadow-xl active:scale-[0.99] transition-all ${
              isScanning
                ? "bg-gray-300 text-white"
                : "bg-gray-900 text-white hover:bg-black shadow-gray-200"
            }`}
          >
            {isEditMode ? "บันทึกการแก้ไข" : mode === "transfer" ? "ยืนยันการโอนเงิน" : "บันทึกรายการ"}
          </button>

          {/* Quick secondary */}
          {!isEditMode ? (
            <button
              type="button"
              onClick={() => {
                // เริ่มใหม่จริงๆ (เคลียร์ editingId + state ใน store ถ้ารองรับ)
                startNewTransaction?.();
                // เคลียร์ form local
                setMode("expense");
                setAmount("");
                setCategory("");
                setAccountId(accounts?.[0]?.id || "");
                setToAccountId("");
                setDate(toISODate(new Date()));
                setNote("");
                clearScan();
              }}
              className="w-full mt-2 py-3 rounded-2xl text-xs font-bold text-gray-500 bg-white border border-gray-100 shadow-sm active:scale-[0.99]"
            >
              ล้างฟอร์ม
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
