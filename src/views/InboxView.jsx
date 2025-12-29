import { useEffect, useMemo, useState } from "react";
import {
  Inbox,
  Search,
  Trash2,
  Check,
  AlertTriangle,
  ArrowRightLeft,
  CreditCard,
  X,
  Edit2,
  Layers,
} from "lucide-react";

import { useAppStore } from "../store/store";
import { findFuzzyDuplicate } from "../store/selectors";
import { generateId, generateTransferId } from "../utils/id";
import { formatCurrency, toISODate } from "../utils/format";
import { useBlobUrl } from "../utils/useBlobUrl";
import {
  resolveMerchantCanonical,
  deriveMerchantAutofillPatch,
} from "../utils/merchantDictionary";

function appendEvidenceToNote(note, evidence) {
  if (!evidence) return note || "";

  const list = [];
  if (typeof evidence === "string" && evidence.trim()) list.push(evidence.trim());
  if (Array.isArray(evidence)) {
    for (const ev of evidence) {
      if (typeof ev === "string" && ev.trim()) list.push(ev.trim());
    }
  }
  if (!list.length) return note || "";

  const pretty = list.map((e) => `- ${e}`).join("\n");
  const base = (note || "").trim();
  return base ? `${base}\n\nEvidence:\n${pretty}` : `Evidence:\n${pretty}`;
}

function isPositiveNumber(n) {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function normalizeTxType(t) {
  const x = String(t || "").toLowerCase();
  if (x === "income" || x === "expense" || x === "transfer" || x === "credit_payment") return x;
  return "expense";
}

function buildTransactionsFromInboxItem(item) {
  const txType = normalizeTxType(item?.type || item?.txType);
  const date = item?.date ? String(item.date).slice(0, 10) : toISODate(new Date());
  const merchant = item?.merchant || "";
  const note = appendEvidenceToNote(item?.note || "", item?.evidence);
  const ref = item?.referenceId || item?.ref || "";

  // Split by category (legacy scan payload support)
  if (item?.splitByCategory && Array.isArray(item?.groups) && item.groups.length) {
    const accountId = item?.accountId || "";
    if (!accountId) throw new Error("ยังไม่ได้เลือก Account สำหรับรายการแบบ Split");

    const txs = [];
    for (let i = 0; i < item.groups.length; i++) {
      const g = item.groups[i];
      const amount = Number(g?.amount);
      if (!isPositiveNumber(amount)) throw new Error("ยอดเงินในกลุ่ม Split ต้องมากกว่า 0");
      const categoryId = g?.categoryId || item?.categoryId || "";
      if (!categoryId) throw new Error("ยังไม่ได้เลือก Category สำหรับกลุ่ม Split");

      txs.push({
        id: generateId(),
        type: txType,
        amount,
        date,
        merchant,
        note: g?.note ? `${note ? note + "\n\n" : ""}${g.note}` : note,
        ref: i === 0 ? ref : "",
        category: categoryId,
        accountId,
        isTransfer: false,
        transferId: null,
        attachmentId: item?.attachmentId || null,
        source: "inbox",
      });
    }
    return txs;
  }

  // Transfer / Credit Payment
  if (txType === "transfer" || txType === "credit_payment") {
    const fromAccountId = item?.fromAccountId || "";
    const toAccountId = item?.toAccountId || "";
    const amount = Number(item?.amount);

    if (!fromAccountId || !toAccountId) throw new Error("Transfer ต้องมีทั้ง From และ To account");
    if (fromAccountId === toAccountId) throw new Error("Transfer ต้องเลือก From และ To คนละบัญชี");
    if (!isPositiveNumber(amount)) throw new Error("Transfer amount ต้องมากกว่า 0");

    const transferId = generateTransferId();
    const transferKind = txType === "credit_payment" ? "credit_payment" : "transfer";

    return [
      {
        id: generateId(),
        type: "expense",
        isTransfer: true,
        transferId,
        amount,
        date,
        note,
        merchant,
        ref,
        category: "transfer",
        accountId: fromAccountId,
        attachmentId: item?.attachmentId || null,
        source: "inbox",
        transferKind,
      },
      {
        id: generateId(),
        type: "income",
        isTransfer: true,
        transferId,
        amount,
        date,
        note,
        merchant,
        ref: "",
        category: "transfer",
        accountId: toAccountId,
        attachmentId: item?.attachmentId || null,
        source: "inbox",
        transferKind,
      },
    ];
  }

  // Normal income/expense
  const accountId = item?.accountId || "";
  const amount = Number(item?.amount);
  const categoryId = item?.categoryId || item?.category || "";

  if (!accountId) throw new Error("ยังไม่ได้เลือก Account");
  if (!categoryId) throw new Error("ยังไม่ได้เลือก Category");
  if (!isPositiveNumber(amount)) throw new Error("ยอดเงินต้องมากกว่า 0");

  return [
    {
      id: generateId(),
      type: txType,
      amount,
      date,
      merchant,
      note,
      ref,
      category: categoryId,
      accountId,
      isTransfer: false,
      transferId: null,
      attachmentId: item?.attachmentId || null,
      source: "inbox",
    },
  ];
}

function typeBadge(type) {
  const txType = normalizeTxType(type);
  if (txType === "transfer") return { label: "Transfer", icon: ArrowRightLeft };
  if (txType === "credit_payment") return { label: "Credit Payment", icon: CreditCard };
  if (txType === "income") return { label: "Income", icon: Check };
  return { label: "Expense", icon: Check };
}

function PillTab({ active, onClick, label, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-2xl text-sm font-extrabold border active:scale-95 transition-all inline-flex items-center gap-2 ${
        active
          ? "bg-gray-900/90 text-white border-white/10 shadow-lg"
          : "bg-white/30 text-gray-900/70 border-white/20"
      }`}
    >
      {label}
      {typeof count === "number" ? (
        <span
          className={`min-w-[26px] px-2 py-0.5 rounded-full text-xs font-black ${
            active ? "bg-white/15 text-white" : "bg-gray-900/10 text-gray-900/70"
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function AttachmentThumb({ attachmentId }) {
  const url = useBlobUrl(attachmentId);
  const id = String(attachmentId || "").trim();
  if (!id) return null;

  return (
    <div className="mt-2 w-full max-w-[220px]">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="block rounded-2xl overflow-hidden border border-white/20 bg-white/10"
        >
          <img src={url} alt="attachment" className="w-full h-28 object-cover" />
        </a>
      ) : (
        <div className="text-xs text-gray-900/55">Loading attachment…</div>
      )}
    </div>
  );
}

function EditorModal({ open, item, accounts, categories, onClose, onSave, showAlert }) {
  const [draft, setDraft] = useState(null);

  const attachmentUrl = useBlobUrl(draft?.attachmentId);

  useEffect(() => {
    if (!open) return;
    if (!item) return;

    const txType = normalizeTxType(item?.type || item?.txType);
    setDraft({
      ...item,
      type: txType,
      amount: Number(item?.amount) || 0,
      date: item?.date ? String(item.date).slice(0, 10) : toISODate(new Date()),
      merchant: String(item?.merchant || ""),
      categoryId: String(item?.categoryId || item?.category || (txType === "transfer" || txType === "credit_payment" ? "transfer" : "")),
      accountId: String(item?.accountId || ""),
      fromAccountId: String(item?.fromAccountId || ""),
      toAccountId: String(item?.toAccountId || ""),
      note: String(item?.note || ""),
      referenceId: String(item?.referenceId || item?.ref || ""),
    });
  }, [open, item]);

  if (!open || !draft) return null;

  const txType = normalizeTxType(draft.type);
  const expenseCats = categories?.expense || [];
  const incomeCats = categories?.income || [];
  const catList = txType === "income" ? incomeCats : expenseCats;

  const commit = () => {
    const amount = Number(draft.amount);
    if (!isPositiveNumber(amount)) {
      showAlert?.("กรุณากรอกยอดเงินให้มากกว่า 0");
      return;
    }

    if (txType === "transfer" || txType === "credit_payment") {
      if (!draft.fromAccountId || !draft.toAccountId) {
        showAlert?.("กรุณาเลือก From/To account");
        return;
      }
      if (draft.fromAccountId === draft.toAccountId) {
        showAlert?.("Transfer ต้องเลือก From และ To คนละบัญชี");
        return;
      }
    } else {
      if (!draft.accountId) {
        showAlert?.("กรุณาเลือก Account");
        return;
      }
      if (!draft.categoryId) {
        showAlert?.("กรุณาเลือก Category");
        return;
      }
    }

    const patch = {
      type: txType,
      amount,
      date: String(draft.date || toISODate(new Date())).slice(0, 10),
      merchant: String(draft.merchant || "").trim(),
      note: String(draft.note || ""),
      referenceId: String(draft.referenceId || ""),
      categoryId: txType === "transfer" || txType === "credit_payment" ? "transfer" : String(draft.categoryId || ""),
      accountId: txType === "transfer" || txType === "credit_payment" ? "" : String(draft.accountId || ""),
      fromAccountId: txType === "transfer" || txType === "credit_payment" ? String(draft.fromAccountId || "") : "",
      toAccountId: txType === "transfer" || txType === "credit_payment" ? String(draft.toAccountId || "") : "",
    };

    onSave?.(draft.id, patch);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-md glass-card rounded-3xl p-5 border border-white/20 max-h-[90vh] overflow-y-auto overscroll-contain">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold text-gray-900">Edit Inbox item</h3>
            <p className="mt-1 text-sm text-gray-900/70">แก้ไขข้อมูลก่อนอนุมัติ</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/30 border border-white/20 text-gray-900/70 active:scale-95"
            aria-label="close"
          >
            <X size={18} />
          </button>
        </div>

        {draft?.attachmentId ? (
          <div className="mt-4 glass-panel border border-white/20 rounded-2xl p-3">
            <div className="text-xs font-extrabold text-gray-900/60 uppercase mb-2">Attachment</div>
            {attachmentUrl ? (
              <a
                href={attachmentUrl}
                target="_blank"
                rel="noreferrer"
                className="block rounded-2xl overflow-hidden border border-white/20 bg-white/10"
              >
                <img src={attachmentUrl} alt="attachment" className="w-full max-h-72 object-cover" />
              </a>
            ) : (
              <div className="text-sm text-gray-900/60">Loading image…</div>
            )}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-gray-900/60">
              Type
              <select
                value={draft.type}
                onChange={(e) => {
                  const next = normalizeTxType(e.target.value);
                  setDraft((d) => ({
                    ...d,
                    type: next,
                    categoryId:
                      next === "transfer" || next === "credit_payment" ? "transfer" : String(d?.categoryId || ""),
                  }));
                }}
                className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
                <option value="credit_payment">Credit Payment</option>
              </select>
            </label>

            <label className="text-xs font-bold text-gray-900/60">
              Amount
              <input
                type="number"
                inputMode="decimal"
                value={draft.amount}
                onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
              />
            </label>
          </div>

          <label className="text-xs font-bold text-gray-900/60">
            Date
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
            />
          </label>

          <label className="text-xs font-bold text-gray-900/60">
            Merchant
            <input
              type="text"
              value={draft.merchant}
              onChange={(e) => setDraft((d) => ({ ...d, merchant: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
              placeholder="ชื่อร้าน (เช่น 7-11, Starbucks)"
            />
          </label>

          {txType === "transfer" || txType === "credit_payment" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-bold text-gray-900/60">
                From
                <select
                  value={draft.fromAccountId}
                  onChange={(e) => setDraft((d) => ({ ...d, fromAccountId: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
                >
                  <option value="">เลือกบัญชี</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-bold text-gray-900/60">
                To
                <select
                  value={draft.toAccountId}
                  onChange={(e) => setDraft((d) => ({ ...d, toAccountId: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
                >
                  <option value="">เลือกบัญชี</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <>
              <label className="text-xs font-bold text-gray-900/60">
                Account
                <select
                  value={draft.accountId}
                  onChange={(e) => setDraft((d) => ({ ...d, accountId: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
                >
                  <option value="">เลือกบัญชี</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-bold text-gray-900/60">
                Category
                <select
                  value={draft.categoryId}
                  onChange={(e) => setDraft((d) => ({ ...d, categoryId: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
                >
                  <option value="">เลือกหมวดหมู่</option>
                  {catList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label className="text-xs font-bold text-gray-900/60">
            Note
            <input
              type="text"
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
              placeholder="รายละเอียด/ชื่อร้าน"
            />
          </label>

          <label className="text-xs font-bold text-gray-900/60">
            Reference ID
            <input
              type="text"
              value={draft.referenceId}
              onChange={(e) => setDraft((d) => ({ ...d, referenceId: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
              placeholder="เลขที่รายการ/Ref"
            />
          </label>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="py-3 rounded-2xl bg-white/30 border border-white/20 text-gray-900 font-extrabold active:scale-95"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commit}
              className="py-3 rounded-2xl bg-indigo-600 text-white font-extrabold shadow-indigo-200 active:scale-95"
            >
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InboxView({ showAlert, showConfirm }) {
  const {
    state,
    navigate,
    startNewTransaction,
    bulkUpsertTransactions,
    addInboxItems,
    updateInboxItem,
    removeInboxItems,
    clearApprovedInbox,
    learnMerchant,
  } = useAppStore();

  const inbox = state.inbox || [];
  const [tab, setTab] = useState("pending");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [editingId, setEditingId] = useState(null);

  const accountsById = useMemo(() => {
    const map = new Map();
    for (const a of state.accounts || []) map.set(a.id, a);
    return map;
  }, [state.accounts]);

  const categoriesById = useMemo(() => {
    const map = new Map();
    const exp = state?.categories?.expense || [];
    const inc = state?.categories?.income || [];
    for (const c of [...exp, ...inc]) map.set(c.id, c);
    return map;
  }, [state.categories]);

  const pending = useMemo(() => {
    return (inbox || []).filter((it) => String(it?.status || "pending").toLowerCase() !== "approved");
  }, [inbox]);

  const approved = useMemo(() => {
    return (inbox || []).filter((it) => String(it?.status || "").toLowerCase() === "approved");
  }, [inbox]);

  const pendingCount = pending.length;

  const activeListBase = tab === "pending" ? pending : approved;

  // ✅ Ensure Inbox warning can show even for older items (compute fuzzy duplicate for display)
  const activeList = useMemo(() => {
    const txs = state.transactions || [];
    return (activeListBase || []).map((it) => {
      if (!it) return it;
      if (it.duplicate) return it;
      const f = findFuzzyDuplicate(txs, it);
      if (f?.isDuplicate) {
        return {
          ...it,
          duplicate: true,
          duplicateInfo: {
            kind: "fuzzy",
            matchId: f.matchId || null,
            score: f.score || 0,
            reasons: f.reasons || [],
          },
        };
      }
      return it;
    });
  }, [activeListBase, state.transactions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = activeList
      .slice()
      .sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0));

    if (!q) return sorted;
    return sorted.filter((it) => {
      const hay = [it.merchant, it.note, it.referenceId, it.ref, it.fileName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [activeList, query]);

  const selectedCount = selectedIds.size;

  useEffect(() => {
    // reset selection when switching tab
    setSelectedIds(new Set());
  }, [tab]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filtered.map((x) => x.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const deleteIds = (ids) => {
    const list = Array.isArray(ids) ? ids : [];
    if (!list.length) return;

    showConfirm?.(
      "Delete selected?",
      `ต้องการลบ ${list.length} รายการใช่ไหม?`,
      () => {
        removeInboxItems(list);
        showAlert?.("ลบรายการแล้ว");
      },
      true
    );
  };

  const approveIds = (ids) => {
    const list = Array.isArray(ids) ? ids : [];
    if (!list.length) return;

    const items = pending.filter((x) => list.includes(x.id));
    if (!items.length) return;

    const dupCount = items.filter((x) => !!x?.duplicate).length;

    const doApprove = () => {
      try {
        const allTxs = [];
        const normalizedItems = [];
        for (const it of items) {
          const canon = resolveMerchantCanonical(it?.merchant || it?.note, state?.merchants || []);
          const nextIt = canon ? { ...it, merchant: canon } : it;
          normalizedItems.push(nextIt);
          const txs = buildTransactionsFromInboxItem(nextIt);
          allTxs.push(...txs);
        }

        bulkUpsertTransactions(allTxs, { navigateToDashboard: false });

        // ✅ Learn merchant mapping from approved transactions
        try {
          for (const tx of allTxs) {
            const t = String(tx?.type || "").toLowerCase();
            if (t !== "expense" && t !== "income") continue;
            const m = String(tx?.merchant || "").trim();
            if (!m) continue;
            learnMerchant?.({ merchant: m, txType: t, categoryId: String(tx?.category || ""), accountId: String(tx?.accountId || "") });
          }
        } catch {
          // ignore
        }

        const approvedAt = Date.now();
        addInboxItems(
          normalizedItems.map((it) => ({
            ...it,
            status: "approved",
            approvedAt,
          }))
        );

        setSelectedIds(new Set());
        showAlert?.(`Approve แล้ว (${items.length} รายการ / สร้าง ${allTxs.length} transactions)`);
      } catch (e) {
        showAlert?.(e?.message || "ไม่สามารถ approve ได้");
      }
    };

    if (dupCount > 0) {
      showConfirm?.(
        "Possible duplicate",
        `มี ${dupCount} รายการที่อาจซ้ำ ต้องการ Approve ต่อเลยไหม?`,
        doApprove
      );
      return;
    }

    doApprove();
  };

  const onClearApproved = () => {
    if (!approved.length) return;
    showConfirm?.(
      "Clear Approved?",
      `ต้องการล้างประวัติ Approved ทั้งหมด ${approved.length} รายการ (ลบใน Inbox เท่านั้น) ใช่ไหม?`,
      () => {
        clearApprovedInbox();
        showAlert?.("ล้าง Approved แล้ว");
      },
      true
    );
  };

  const editingItem = useMemo(() => {
    if (!editingId) return null;
    return (inbox || []).find((x) => x.id === editingId) || null;
  }, [editingId, inbox]);

  const statusLine = tab === "pending" ? `${pendingCount} pending` : `${approved.length} approved`;

  return (
    <div className="p-4 pb-28">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-gray-900/10 flex items-center justify-center">
              <Inbox size={20} />
            </div>
            <div>
              <div className="text-lg font-extrabold text-gray-900">Inbox</div>
              <div className="text-xs text-gray-900/60">{statusLine}</div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <PillTab active={tab === "pending"} onClick={() => setTab("pending")} label="Pending" count={pendingCount} />
            <PillTab active={tab === "approved"} onClick={() => setTab("approved")} label="Approved" count={approved.length} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => startNewTransaction?.() ?? navigate("add")}
            className="px-3 py-2 rounded-xl bg-white/30 border border-white/20 text-gray-900/70 font-bold active:scale-95"
          >
            <span className="inline-flex items-center gap-2">
              <Check size={16} />
              Scan
            </span>
          </button>

          {tab === "approved" ? (
            <button
              type="button"
              onClick={onClearApproved}
              disabled={!approved.length}
              className={`px-3 py-2 rounded-xl font-bold active:scale-95 inline-flex items-center gap-2 ${
                approved.length
                  ? "bg-red-600 text-white shadow-red-200"
                  : "bg-white/20 text-gray-700/50 border border-white/20"
              }`}
            >
              <Trash2 size={16} />
              Clear Approved
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-900/50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาใน Inbox (merchant / note / ref)"
            className="w-full pl-10 pr-10 py-3 rounded-2xl bg-white/30 border border-white/20 outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-white/30 border border-white/20 text-gray-900/60 active:scale-95"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Bulk actions */}
      {tab === "pending" ? (
        <div className="mt-3 glass-card rounded-3xl p-3 border border-white/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-extrabold text-gray-900/70 inline-flex items-center gap-2">
              <Layers size={16} />
              Selected: {selectedCount}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="px-3 py-2 rounded-2xl bg-white/30 border border-white/20 text-gray-900/80 font-extrabold active:scale-95"
                disabled={!filtered.length}
              >
                Select all
              </button>
              <button
                type="button"
                onClick={deselectAll}
                className="px-3 py-2 rounded-2xl bg-white/30 border border-white/20 text-gray-900/80 font-extrabold active:scale-95"
                disabled={!selectedCount}
              >
                Deselect all
              </button>
              <button
                type="button"
                onClick={() => approveIds(Array.from(selectedIds))}
                className={`px-3 py-2 rounded-2xl font-extrabold active:scale-95 inline-flex items-center gap-2 ${
                  selectedCount
                    ? "bg-indigo-600 text-white shadow-indigo-200"
                    : "bg-white/20 text-gray-700/50 border border-white/20"
                }`}
                disabled={!selectedCount}
              >
                <Check size={16} />
                Approve selected
              </button>
              <button
                type="button"
                onClick={() => deleteIds(Array.from(selectedIds))}
                className={`px-3 py-2 rounded-2xl font-extrabold active:scale-95 inline-flex items-center gap-2 ${
                  selectedCount
                    ? "bg-red-600 text-white shadow-red-200"
                    : "bg-white/20 text-gray-700/50 border border-white/20"
                }`}
                disabled={!selectedCount}
              >
                <Trash2 size={16} />
                Delete selected
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="mt-8 glass-card rounded-3xl p-6 text-center border border-white/20">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-gray-900/10 flex items-center justify-center">
            <Inbox size={22} />
          </div>
          <div className="mt-3 text-lg font-extrabold text-gray-900">ไม่มีรายการ</div>
          <div className="mt-1 text-sm text-gray-900/60">
            {tab === "pending" ? "ลองสแกนใบเสร็จ แล้วเลือก “Send to Inbox”" : "ยังไม่มีรายการที่ approve แล้ว"}
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {filtered.map((it) => {
            const txType = normalizeTxType(it?.type || it?.txType);
            const { label, icon: Icon } = typeBadge(txType);

            const accountLabel = it?.accountId ? accountsById.get(it.accountId)?.name : "";
            const fromLabel = it?.fromAccountId ? accountsById.get(it.fromAccountId)?.name : "";
            const toLabel = it?.toAccountId ? accountsById.get(it.toAccountId)?.name : "";
            const catLabel = it?.categoryId ? categoriesById.get(it.categoryId)?.name : "";
            const ref = it?.referenceId || it?.ref || "";

            const isSelected = selectedIds.has(it.id);

            return (
              <div key={it.id} className="glass-card rounded-3xl p-4 border border-white/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {tab === "pending" ? (
                        <button
                          type="button"
                          onClick={() => toggleSelect(it.id)}
                          className={`w-6 h-6 rounded-lg border flex items-center justify-center active:scale-95 ${
                            isSelected ? "bg-gray-900/90 border-white/10" : "bg-white/30 border-white/20"
                          }`}
                          aria-label="select"
                        >
                          {isSelected ? <Check size={14} className="text-white" /> : null}
                        </button>
                      ) : null}

                      <div className="px-3 py-1.5 rounded-2xl bg-white/30 border border-white/20 text-xs font-extrabold inline-flex items-center gap-2">
                        <Icon size={14} />
                        {label}
                      </div>

                      {it?.duplicate ? (
                        <div className="px-2.5 py-1.5 rounded-2xl bg-amber-100/80 border border-amber-200 text-xs font-extrabold text-amber-800 inline-flex items-center gap-2">
                          <AlertTriangle size={14} />
                          Possible duplicate
                        </div>
                      ) : null}

                      {tab === "approved" ? (
                        <div className="px-2.5 py-1.5 rounded-2xl bg-emerald-100/70 border border-emerald-200 text-xs font-extrabold text-emerald-800">
                          Approved
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-2 text-2xl font-black text-gray-900">
                      {isPositiveNumber(Number(it?.amount)) ? formatCurrency(Number(it.amount)) : "—"}
                    </div>

                    <div className="mt-1 text-sm text-gray-900/70 truncate">
                      {it?.date || "(no date)"}
                      {it?.merchant ? ` • ${it.merchant}` : ""}
                    </div>

                    <AttachmentThumb attachmentId={it?.attachmentId} />

                    <div className="mt-2 text-xs text-gray-900/60 space-y-1">
                      {txType === "transfer" || txType === "credit_payment" ? (
                        <div className="truncate">
                          {fromLabel || "(from?)"} → {toLabel || "(to?)"}
                        </div>
                      ) : (
                        <div className="truncate">
                          {accountLabel || "(account?)"}
                          {catLabel ? ` • ${catLabel}` : ""}
                        </div>
                      )}
                      {ref ? <div className="truncate">ref: {ref}</div> : null}
                      {it?.note ? <div className="truncate">{it.note}</div> : null}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 shrink-0">
                    {tab === "pending" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditingId(it.id)}
                          className="px-4 py-2 rounded-2xl bg-white/30 border border-white/20 text-gray-900/80 font-extrabold active:scale-95 inline-flex items-center justify-center gap-2"
                        >
                          <Edit2 size={16} />
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => approveIds([it.id])}
                          className="px-4 py-2 rounded-2xl bg-indigo-600 text-white font-extrabold shadow-indigo-200 active:scale-95 inline-flex items-center justify-center gap-2"
                        >
                          <Check size={16} />
                          Approve
                        </button>
                      </>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => deleteIds([it.id])}
                      className="px-4 py-2 rounded-2xl bg-white/30 border border-white/20 text-gray-900/70 font-bold active:scale-95 inline-flex items-center justify-center gap-2"
                    >
                      <Trash2 size={16} />
                      {tab === "pending" ? "Delete" : "Remove"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EditorModal
        open={!!editingId}
        item={editingItem}
        accounts={state.accounts || []}
        categories={state.categories || { expense: [], income: [] }}
        showAlert={showAlert}
        onClose={() => setEditingId(null)}
        onSave={(id, patch) => {
          const base = editingItem || (inbox || []).find((x) => x.id === id) || {};
          let nextItem = { ...base, ...patch, id };

          // ✅ Smart Merchant Dictionary: normalize + optional autofill
          try {
            const canon = resolveMerchantCanonical(nextItem.merchant || nextItem.note, state?.merchants || []);
            if (canon) {
              patch = { ...patch, merchant: canon };
              nextItem = { ...nextItem, merchant: canon };
            }

            const mdPatch = deriveMerchantAutofillPatch(
              {
                merchant: nextItem.merchant,
                txType: nextItem.type || nextItem.txType,
                categoryId: nextItem.categoryId,
                accountId: nextItem.accountId,
              },
              state?.merchants || []
            );

            // Only apply autofill when it fills missing/generic fields
            if (mdPatch && Object.keys(mdPatch).length) {
              patch = { ...patch, ...mdPatch };
              nextItem = { ...nextItem, ...mdPatch };
            }
          } catch {
            // ignore
          }

          // ✅ Re-evaluate possible duplicate after editing (amount/date/merchant/ref/digits changes)
          try {
            const f = findFuzzyDuplicate(state.transactions || [], nextItem);
            const dup = !!f?.isDuplicate;
            patch = {
              ...patch,
              duplicate: dup,
              duplicateInfo: dup
                ? { kind: "fuzzy", matchId: f.matchId || null, score: f.score || 0, reasons: f.reasons || [] }
                : null,
            };
            nextItem = { ...nextItem, duplicate: dup, duplicateInfo: patch.duplicateInfo };
          } catch {
            // ignore
          }

          updateInboxItem(id, patch);

          // ✅ Learn mapping after user edits in Inbox (before approval)
          try {
            const t = String(nextItem?.type || nextItem?.txType || "").toLowerCase();
            if ((t === "expense" || t === "income") && String(nextItem?.merchant || "").trim()) {
              learnMerchant?.({
                merchant: String(nextItem.merchant || "").trim(),
                txType: t,
                categoryId: String(nextItem?.categoryId || ""),
                accountId: String(nextItem?.accountId || ""),
              });
            }
          } catch {
            // ignore
          }

          setEditingId(null);
          showAlert?.("บันทึกการแก้ไขแล้ว");
        }}
      />
    </div>
  );
}
