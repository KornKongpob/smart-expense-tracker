import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Trash2, Calendar, FileText, Camera, Loader, Eye, Edit2, Plus, Check, Repeat2, AlertTriangle } from "lucide-react";

import { useAppStore } from "../store/store";
import { formatCurrency } from "../utils/format";
import { scanManyReceiptsOpenAI } from "../services/scanOpenAI";

function toISO(d = new Date()) {
  return new Date(d).toISOString().slice(0, 10);
}

function PreviewImage({ url }) {
  if (!url) return null;
  return (
    <div className="mb-4 rounded-2xl overflow-hidden shadow-sm border border-gray-200">
      <img src={url} alt="preview" className="w-full h-44 object-cover" />
    </div>
  );
}

export default function AddTransactionView({ showAlert, showConfirm }) {
  const { state, actions, getEditingTransaction } = useAppStore();

  const initialData = getEditingTransaction();
  const isEditMode = !!initialData;

  const accounts = state.accounts || [];
  const categories = state.categories || { expense: [], income: [] };

  // ----- single/manual fields -----
  const [mode, setMode] = useState(isEditMode ? "manual" : "manual"); // manual | queue
  const [type, setType] = useState(initialData?.isTransfer ? "transfer" : (initialData?.type || "expense"));
  const [amount, setAmount] = useState(initialData?.amount?.toString() || "");
  const [category, setCategory] = useState(initialData?.category || "");
  const [accountId, setAccountId] = useState(initialData?.accountId || accounts?.[0]?.id || "");
  const [date, setDate] = useState(initialData?.date ? String(initialData.date).split("T")[0] : toISO());
  const [note, setNote] = useState(initialData?.note || "");
  const [refNo, setRefNo] = useState(initialData?.meta?.ref || "");

  // transfer fields
  const [fromAccountId, setFromAccountId] = useState(initialData?.meta?.transferSide === "out" ? initialData.accountId : accounts?.[0]?.id || "");
  const [toAccountId, setToAccountId] = useState(initialData?.meta?.toAccountId || (accounts?.[1]?.id || accounts?.[0]?.id || ""));

  // ----- scanning queue -----
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [queue, setQueue] = useState([]); // items
  const urlsRef = useRef([]);

  useEffect(() => {
    return () => {
      // cleanup object urls
      for (const u of urlsRef.current) URL.revokeObjectURL(u);
      urlsRef.current = [];
    };
  }, []);

  const allExpenseCats = categories.expense || [];
  const allIncomeCats = categories.income || [];

  const handleDelete = () => {
    if (!initialData?.id) return;
    showConfirm?.("ลบรายการ", "ต้องการลบรายการนี้ใช่ไหม?", () => actions.deleteTransaction(initialData.id), true);
  };

  const handleSaveManual = () => {
    // transfer
    if (type === "transfer") {
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) return showAlert?.("กรุณาระบุจำนวนเงินที่ถูกต้อง");
      if (!fromAccountId || !toAccountId) return showAlert?.("กรุณาเลือกบัญชีต้นทาง/ปลายทาง");
      if (fromAccountId === toAccountId) return showAlert?.("บัญชีต้นทาง/ปลายทางต้องไม่ใช่บัญชีเดียวกัน");
      actions.transferFunds({ fromAccountId, toAccountId, amount: amt, date, note, ref: refNo || null });
      return;
    }

    // normal
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return showAlert?.("กรุณาระบุจำนวนเงินที่ถูกต้อง");
    if (!category) return showAlert?.("กรุณาเลือกหมวดหมู่");
    if (!accountId) return showAlert?.("กรุณาเลือกบัญชี");

    actions.upsertTransaction({
      id: initialData?.id,
      amount: amt,
      type,
      category,
      accountId,
      date,
      note,
      isTransfer: false,
      meta: { ...(initialData?.meta || {}), ref: refNo || null },
    });
  };

  const startScanQueue = async (files) => {
    if (!files?.length) return;

    setMode("queue");
    setQueue([]);
    setIsScanning(true);
    setScanStatus("Preparing...");

    // create previews
    const previews = Array.from(files).map((f) => {
      const u = URL.createObjectURL(f);
      urlsRef.current.push(u);
      return u;
    });

    try {
      const results = await scanManyReceiptsOpenAI(Array.from(files), {
        onProgress: ({ index, total, status }) => {
          setScanStatus(`${status || "Scanning..."} (${index + 1}/${total})`);
        },
      });

      const items = results.map((r, idx) => {
        // decide kind
        const kind = String(r.kind || "receipt");

        // choose base type
        let t = "expense";
        if (kind === "income") t = "income";
        if (kind === "transfer") t = "transfer";

        // auto account
        const guessedAccountId = actions.guessAccountIdFromScan(r) || "";

        // auto category (create if missing)
        let catId = "";
        if (t === "expense") catId = actions.ensureCategory({ type: "expense", value: r.category || "other" });
        if (t === "income") catId = actions.ensureCategory({ type: "income", value: r.category || "income" });
        if (t === "transfer") catId = "transfer";

        // duplicate check
        const dup = r.ref ? actions.isDuplicateRef(r.ref) : false;

        return {
          id: `q_${Date.now()}_${idx}`,
          fileName: files[idx]?.name || `image_${idx + 1}`,
          previewUrl: previews[idx],
          raw: r,
          kind: t,
          amount: r.amount ?? "",
          date: r.date || toISO(),
          note: r.merchant ? String(r.merchant) : (r.note || ""),
          ref: r.ref || "",
          payment_method: r.payment_method || "unknown",
          card_last4: r.card_last4 || "",
          from_account_no: r.from_account_no || "",
          to_account_no: r.to_account_no || "",
          // for receipt/income
          accountId: guessedAccountId || (accounts[0]?.id || ""),
          categoryId: catId || "other",
          // for transfer
          fromAccountId: guessedAccountId || (accounts[0]?.id || ""),
          toAccountId: accounts[1]?.id || accounts[0]?.id || "",
          markSkip: dup, // default: skip duplicates
          isDuplicate: dup,
        };
      });

      setQueue(items);
      setScanStatus("");
    } catch (err) {
      console.error(err);
      showAlert?.("สแกนไม่สำเร็จ (เช็ค API KEY / รูป / network)");
      setMode("manual");
    } finally {
      setIsScanning(false);
      setScanStatus("");
    }
  };

  const onPickFiles = async (e) => {
    const files = e.target.files;
    e.target.value = ""; // allow reselect
    await startScanQueue(files);
  };

  const createFromQueue = () => {
    const toCreate = [];

    for (const it of queue) {
      if (it.markSkip) continue;

      const amt = Number(it.amount);
      if (!Number.isFinite(amt) || amt <= 0) continue;

      const when = it.date || toISO();
      const ref = it.ref || null;

      if (it.kind === "transfer") {
        if (!it.fromAccountId || !it.toAccountId || it.fromAccountId === it.toAccountId) continue;

        const transferId = `tr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const fromName = accounts.find((a) => a.id === it.fromAccountId)?.name || "";
        const toName = accounts.find((a) => a.id === it.toAccountId)?.name || "";

        // only show OUT in dashboard (IN will be hidden by dashboard filter)
        toCreate.push({
          id: `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          type: "expense",
          amount: amt,
          category: "transfer",
          accountId: it.fromAccountId,
          date: when,
          note: it.note || `โอนไป ${toName}`,
          isTransfer: true,
          transferId,
          meta: { transferSide: "out", toAccountId: it.toAccountId, toAccountName: toName, ref },
        });

        toCreate.push({
          id: `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          type: "income",
          amount: amt,
          category: "income",
          accountId: it.toAccountId,
          date: when,
          note: it.note || `รับโอนจาก ${fromName}`,
          isTransfer: true,
          transferId,
          meta: { transferSide: "in", fromAccountId: it.fromAccountId, fromAccountName: fromName, ref },
        });

        continue;
      }

      // normal expense/income
      toCreate.push({
        id: `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        type: it.kind,
        amount: amt,
        category: it.categoryId || (it.kind === "income" ? "income" : "other"),
        accountId: it.accountId,
        date: when,
        note: it.note || "",
        isTransfer: false,
        meta: {
          ref,
          payment_method: it.payment_method,
          card_last4: it.card_last4,
          from_account_no: it.from_account_no,
          to_account_no: it.to_account_no,
        },
      });
    }

    if (!toCreate.length) return showAlert?.("ไม่มีรายการให้สร้าง (อาจถูก mark เป็น duplicate ทั้งหมด)");
    actions.addManyTransactions(toCreate);
    actions.navigate("dashboard");
  };

  // ------- UI helpers -------
  const selectedAccountName = useMemo(() => accounts.find((a) => a.id === accountId)?.name || "", [accounts, accountId]);

  // ====== QUEUE MODE ======
  if (mode === "queue") {
    return (
      <div className="pb-24 pt-6 px-4 bg-gray-50 min-h-dvh">
        <div className="flex justify-between items-center mb-5">
          <button
            onClick={() => {
              setMode("manual");
              setQueue([]);
            }}
            className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-500 shadow-sm"
            type="button"
          >
            <X size={20} />
          </button>

          <h2 className="text-lg font-bold text-gray-800">Review Queue</h2>

          <div className="w-10" />
        </div>

        {isScanning ? (
          <div className="bg-white rounded-3xl border border-gray-100 p-6 text-center shadow-sm">
            <Loader className="animate-spin mx-auto mb-3" />
            <div className="font-bold text-gray-900">{scanStatus || "Scanning..."}</div>
            <div className="text-xs text-gray-500 mt-2">กำลังอ่านรูปทีละใบเพื่อความเสถียร</div>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="block w-full bg-white border-2 border-dashed border-gray-200 hover:border-gray-400 hover:bg-gray-50 rounded-2xl p-4 transition-all cursor-pointer">
                <div className="flex flex-col items-center justify-center gap-2 py-2">
                  <Camera className="text-gray-700" size={24} />
                  <span className="text-gray-900 font-bold text-sm">เพิ่มรูปอีก (เลือกหลายรูปได้)</span>
                </div>
                <input type="file" accept="image/*" multiple className="hidden" onChange={onPickFiles} />
              </label>
            </div>

            <div className="space-y-3">
              {queue.map((it) => {
                const isDup = it.isDuplicate;
                return (
                  <div key={it.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-extrabold text-gray-900 truncate">
                          {it.fileName}
                          <span className="ml-2 text-[11px] font-bold text-gray-400 uppercase">
                            {it.kind}
                          </span>
                        </div>

                        {isDup ? (
                          <div className="mt-1 text-xs text-red-600 font-bold flex items-center gap-1">
                            <AlertTriangle size={14} /> Duplicate (ref ซ้ำ) — ระบบจะติ๊กข้ามให้อัตโนมัติ
                          </div>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={() => setQueue((q) => q.map((x) => (x.id === it.id ? { ...x, markSkip: !x.markSkip } : x)))}
                        className={`px-3 py-2 rounded-2xl text-xs font-bold ${
                          it.markSkip ? "bg-gray-100 text-gray-500" : "bg-gray-900 text-white"
                        }`}
                      >
                        {it.markSkip ? "Skip" : "Include"}
                      </button>
                    </div>

                    <div className="px-4 pb-4">
                      <PreviewImage url={it.previewUrl} />

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-bold text-gray-500 mb-1 block">Amount</label>
                          <input
                            value={it.amount}
                            onChange={(e) => setQueue((q) => q.map((x) => (x.id === it.id ? { ...x, amount: e.target.value } : x)))}
                            type="number"
                            className="w-full border border-gray-200 rounded-2xl px-3 py-2"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 mb-1 block">Date</label>
                          <input
                            value={it.date}
                            onChange={(e) => setQueue((q) => q.map((x) => (x.id === it.id ? { ...x, date: e.target.value } : x)))}
                            type="date"
                            className="w-full border border-gray-200 rounded-2xl px-3 py-2"
                          />
                        </div>
                      </div>

                      <div className="mt-3">
                        <label className="text-xs font-bold text-gray-500 mb-1 block">Note</label>
                        <input
                          value={it.note}
                          onChange={(e) => setQueue((q) => q.map((x) => (x.id === it.id ? { ...x, note: e.target.value } : x)))}
                          className="w-full border border-gray-200 rounded-2xl px-3 py-2"
                          placeholder="merchant / note"
                        />
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-bold text-gray-500 mb-1 block">Ref</label>
                          <input
                            value={it.ref}
                            onChange={(e) => {
                              const v = e.target.value;
                              setQueue((q) =>
                                q.map((x) =>
                                  x.id === it.id
                                    ? { ...x, ref: v, isDuplicate: v ? actions.isDuplicateRef(v) : false, markSkip: v ? actions.isDuplicateRef(v) : x.markSkip }
                                    : x
                                )
                              );
                            }}
                            className="w-full border border-gray-200 rounded-2xl px-3 py-2"
                            placeholder="เลขอ้างอิง"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 mb-1 block">Kind</label>
                          <select
                            value={it.kind}
                            onChange={(e) => {
                              const nextKind = e.target.value;
                              setQueue((q) =>
                                q.map((x) => {
                                  if (x.id !== it.id) return x;
                                  let catId = x.categoryId;
                                  if (nextKind === "transfer") catId = "transfer";
                                  if (nextKind === "expense") catId = actions.ensureCategory({ type: "expense", value: x.raw?.category || "other" });
                                  if (nextKind === "income") catId = actions.ensureCategory({ type: "income", value: x.raw?.category || "income" });
                                  return { ...x, kind: nextKind, categoryId: catId };
                                })
                              );
                            }}
                            className="w-full border border-gray-200 rounded-2xl px-3 py-2"
                          >
                            <option value="expense">expense</option>
                            <option value="income">income</option>
                            <option value="transfer">transfer</option>
                          </select>
                        </div>
                      </div>

                      {it.kind !== "transfer" ? (
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">Account</label>
                            <select
                              value={it.accountId}
                              onChange={(e) => setQueue((q) => q.map((x) => (x.id === it.id ? { ...x, accountId: e.target.value } : x)))}
                              className="w-full border border-gray-200 rounded-2xl px-3 py-2"
                            >
                              {accounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.icon} {a.name}
                                </option>
                              ))}
                            </select>
                            <div className="text-[11px] text-gray-400 mt-1">
                              Auto เลือกจากเลขบัญชี/last4 ถ้าคุณกรอกไว้ใน Accounts
                            </div>
                          </div>

                          <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">Category</label>
                            <select
                              value={it.categoryId}
                              onChange={(e) => setQueue((q) => q.map((x) => (x.id === it.id ? { ...x, categoryId: e.target.value } : x)))}
                              className="w-full border border-gray-200 rounded-2xl px-3 py-2"
                            >
                              {(it.kind === "income" ? allIncomeCats : allExpenseCats).map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.icon} {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">From</label>
                            <select
                              value={it.fromAccountId}
                              onChange={(e) => setQueue((q) => q.map((x) => (x.id === it.id ? { ...x, fromAccountId: e.target.value } : x)))}
                              className="w-full border border-gray-200 rounded-2xl px-3 py-2"
                            >
                              {accounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.icon} {a.name}
                                </option>
                              ))}
                            </select>
                            {it.from_account_no ? (
                              <div className="text-[11px] text-gray-400 mt-1">
                                Slip from: ****{String(it.from_account_no).replace(/\D/g,"").slice(-4)}
                              </div>
                            ) : null}
                          </div>
                          <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">To</label>
                            <select
                              value={it.toAccountId}
                              onChange={(e) => setQueue((q) => q.map((x) => (x.id === it.id ? { ...x, toAccountId: e.target.value } : x)))}
                              className="w-full border border-gray-200 rounded-2xl px-3 py-2"
                            >
                              {accounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.icon} {a.name}
                                </option>
                              ))}
                            </select>
                            {it.to_account_no ? (
                              <div className="text-[11px] text-gray-400 mt-1">
                                Slip to: ****{String(it.to_account_no).replace(/\D/g,"").slice(-4)}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={createFromQueue}
              className="fixed bottom-6 left-4 right-4 bg-gray-900 text-white py-4 rounded-2xl font-bold shadow-xl shadow-gray-200 active:scale-95 transition-all flex items-center justify-center gap-2"
              type="button"
            >
              <Check size={18} /> สร้างรายการ ({queue.filter((x) => !x.markSkip).length})
            </button>
          </>
        )}
      </div>
    );
  }

  // ====== MANUAL MODE ======
  return (
    <div className="pb-24 pt-6 px-4 bg-gray-50 min-h-dvh">
      <div className="flex justify-between items-center mb-6">
        <button
          onClick={() => actions.navigate("dashboard")}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-500 shadow-sm"
          type="button"
        >
          <X size={20} />
        </button>

        <h2 className="text-lg font-bold text-gray-800">{isEditMode ? "แก้ไขรายการ" : "บันทึกรายการใหม่"}</h2>

        {isEditMode ? (
          <button
            onClick={handleDelete}
            className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-500 shadow-sm"
            type="button"
          >
            <Trash2 size={20} />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* type tabs */}
      <div className="bg-white p-1.5 rounded-2xl flex mb-4 shadow-sm border border-gray-100">
        {[
          { k: "expense", label: "รายจ่าย" },
          { k: "income", label: "รายรับ" },
          { k: "transfer", label: "โอนเงิน" },
        ].map((x) => (
          <button
            key={x.k}
            onClick={() => {
              setType(x.k);
              if (x.k !== "transfer") {
                if (!category) setCategory(x.k === "income" ? "income" : "other");
              } else {
                setCategory("transfer");
              }
            }}
            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
              type === x.k ? "bg-gray-900 text-white shadow-sm" : "text-gray-400 hover:bg-gray-50"
            }`}
            type="button"
          >
            {x.label}
          </button>
        ))}
      </div>

      {/* scan (new only) */}
      {!isEditMode ? (
        <div className="mb-4">
          <label
            className={`block w-full bg-white border-2 border-dashed ${
              isScanning ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-400 hover:bg-gray-50"
            } rounded-2xl p-4 transition-all cursor-pointer`}
          >
            <div className="flex flex-col items-center justify-center gap-2 py-2">
              {isScanning ? <Loader className="animate-spin text-gray-900" size={24} /> : <Camera className="text-gray-700" size={24} />}
              <span className="text-gray-900 font-bold text-sm">{isScanning ? scanStatus : "สแกนใบเสร็จ/สลิป (เลือกหลายรูปได้)"}</span>
              <span className="text-[11px] text-gray-400">จะเข้า Review Queue ก่อนสร้างรายการ</span>
            </div>
            <input type="file" accept="image/*" multiple className="hidden" onChange={onPickFiles} disabled={isScanning} />
          </label>
        </div>
      ) : null}

      {/* amount */}
      <div className="bg-white p-6 rounded-3xl shadow-sm mb-4 border border-gray-100">
        <div className="text-xs font-extrabold text-gray-400 uppercase">จำนวนเงิน</div>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="mt-2 text-5xl font-extrabold w-full outline-none bg-transparent placeholder-gray-200 text-gray-900"
          autoFocus={!isEditMode}
        />
        {amount && !isNaN(parseFloat(amount)) ? (
          <div className="mt-2 text-xs text-gray-400">
            แสดงผล: <span className="font-bold text-gray-700">{formatCurrency(amount)}</span>
          </div>
        ) : null}
      </div>

      {/* transfer accounts */}
      {type === "transfer" ? (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 mb-4">
          <div className="flex items-center gap-2 text-xs font-extrabold text-gray-400 uppercase mb-3">
            <Repeat2 size={14} /> Transfer
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">จากบัญชี</label>
              <select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)} className="w-full border border-gray-200 rounded-2xl px-3 py-2">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">ไปบัญชี</label>
              <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} className="w-full border border-gray-200 rounded-2xl px-3 py-2">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3">
            <label className="text-xs font-bold text-gray-500 mb-1 block">Ref (ถ้ามี)</label>
            <input value={refNo} onChange={(e) => setRefNo(e.target.value)} className="w-full border border-gray-200 rounded-2xl px-3 py-2" placeholder="เลขอ้างอิง" />
          </div>
        </div>
      ) : (
        <>
          {/* account selector */}
          <div className="mb-4">
            <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase ml-1">บัญชีที่ใช้</h3>
            <div className="flex gap-3 overflow-x-auto pb-3 no-scrollbar -mx-4 px-4">
              {accounts.map((acc) => {
                const isSelected = accountId === acc.id;
                return (
                  <button
                    key={acc.id}
                    onClick={() => setAccountId(acc.id)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all min-w-max ${
                      isSelected ? "bg-gray-900 text-white border-gray-900 shadow-lg" : "bg-white text-gray-700 border-gray-100 shadow-sm"
                    }`}
                    type="button"
                  >
                    <span className="text-xl">{acc.icon || "💳"}</span>
                    <span className="text-sm font-bold">{acc.name}</span>
                    {isSelected && <Check size={14} className="ml-1" />}
                  </button>
                );
              })}
            </div>
            {selectedAccountName ? (
              <div className="text-[11px] text-gray-400 ml-1">เลือกอยู่: {selectedAccountName}</div>
            ) : null}
          </div>

          {/* categories */}
          <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase ml-1">หมวดหมู่</h3>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {(type === "income" ? allIncomeCats : allExpenseCats).map((cat) => (
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
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl mb-2" style={{ backgroundColor: `${cat.color}20` }}>
                  {cat.icon}
                </div>
                <span className="text-[10px] font-bold text-gray-600 truncate w-full text-center">{cat.name}</span>
              </button>
            ))}
          </div>

          <div className="bg-white rounded-3xl shadow-sm overflow-hidden mb-4 border border-gray-100">
            <div className="flex items-center border-b border-gray-100 p-4">
              <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 mr-3">
                <Calendar size={20} />
              </div>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1 outline-none text-gray-700 bg-transparent font-medium" />
            </div>
            <div className="flex items-center p-4">
              <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 mr-3">
                <FileText size={20} />
              </div>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="บันทึกช่วยจำ (ถ้ามี)"
                className="flex-1 outline-none text-gray-700 bg-transparent font-medium"
              />
            </div>
            <div className="flex items-center p-4 border-t border-gray-100">
              <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 mr-3">
                <Eye size={20} />
              </div>
              <input
                type="text"
                value={refNo}
                onChange={(e) => setRefNo(e.target.value)}
                placeholder="Ref / เลขอ้างอิง (ถ้ามี)"
                className="flex-1 outline-none text-gray-700 bg-transparent font-medium"
              />
            </div>
          </div>
        </>
      )}

      <button
        onClick={handleSaveManual}
        className="fixed bottom-6 left-4 right-4 bg-gray-900 text-white py-4 rounded-2xl font-bold shadow-xl shadow-gray-200 active:scale-95 transition-all flex items-center justify-center gap-2"
        type="button"
      >
        {isEditMode ? <Edit2 size={18} /> : <Plus size={18} />}
        {isEditMode ? "บันทึกการแก้ไข" : "ยืนยันรายการ"}
      </button>
    </div>
  );
}
