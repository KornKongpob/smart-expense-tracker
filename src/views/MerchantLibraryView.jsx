import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import CategorySelect from "../components/CategorySelect";
import AccountPicker from "../components/AccountPicker";
import { ArrowLeft, Plus, Search, Trash2, GitMerge, Edit2, Check, X } from "lucide-react";

import { useAppStore } from "../store/store.jsx";
import AppHeader from "../components/AppHeader";
import EmptyState from "../components/EmptyState";
import { generateId } from "../utils/id";
import { useLockBodyScroll } from "../utils/useLockBodyScroll";

function Modal({ open, children, onClose }) {
  useLockBodyScroll(open);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-md glass-card rounded-3xl p-5 border border-white/20 max-h-[90dvh] overflow-y-auto overflow-x-hidden overscroll-contain">
        {children}
        <div className="h-3 pb-safe" />
      </div>
    </div>,
    document.body
  );
}

function pickNameById(list, id) {
  const x = (list || []).find((c) => String(c?.id) === String(id));
  return x?.name || "";
}

export default function MerchantLibraryView({ showAlert, showConfirm }) {
  const {
    state,
    navigate,
    upsertMerchant,
    updateMerchant,
    deleteMerchant,
    mergeMerchants,
  } = useAppStore();

  const merchants = useMemo(() => state.merchants || [], [state.merchants]);
  const accounts = useMemo(() => state.accounts || [], [state.accounts]);
  const expenseCats = useMemo(() => state?.categories?.expense || [], [state.categories]);
  const incomeCats = useMemo(() => state?.categories?.income || [], [state.categories]);

  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [mergeSource, setMergeSource] = useState(null);
  const [mergeTargetId, setMergeTargetId] = useState("");

  const filtered = useMemo(() => {
    const query = String(q || "").trim().toLowerCase();
    const base = (merchants || []).slice().sort((a, b) => String(a?.canonical || "").localeCompare(String(b?.canonical || "")));
    if (!query) return base;
    return base.filter((m) => {
      const canon = String(m?.canonical || "").toLowerCase();
      const aliases = (m?.aliases || []).map((x) => String(x || "").toLowerCase()).join(" ");
      return (canon + " " + aliases).includes(query);
    });
  }, [merchants, q]);

  const openAdd = () => {
    setEditing({
      id: generateId(),
      canonical: "",
      enabled: true,
      aliases: [],
      aliasesText: "",
      prefs: { expense: { categoryId: "", accountId: "" }, income: { categoryId: "", accountId: "" } },
    });
  };

  const openEdit = (m) => {
    setEditing({
      id: String(m?.id || generateId()),
      canonical: String(m?.canonical || ""),
      enabled: m?.enabled !== false,
      aliases: Array.isArray(m?.aliases) ? m.aliases.slice(0) : [],
      aliasesText: (Array.isArray(m?.aliases) ? m.aliases : []).join("\n"),
      prefs: {
        expense: {
          categoryId: String(m?.prefs?.expense?.categoryId || ""),
          accountId: String(m?.prefs?.expense?.accountId || ""),
        },
        income: {
          categoryId: String(m?.prefs?.income?.categoryId || ""),
          accountId: String(m?.prefs?.income?.accountId || ""),
        },
      },
    });
  };

  const commitEdit = () => {
    const canon = String(editing?.canonical || "").trim();
    if (!canon) return showAlert?.("กรุณากรอกชื่อร้าน (canonical)");

    const aliases = String(editing?.aliasesText || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const entry = {
      id: String(editing.id),
      canonical: canon,
      enabled: editing.enabled !== false,
      aliases,
      prefs: {
        expense: {
          categoryId: String(editing?.prefs?.expense?.categoryId || ""),
          accountId: String(editing?.prefs?.expense?.accountId || ""),
        },
        income: {
          categoryId: String(editing?.prefs?.income?.categoryId || ""),
          accountId: String(editing?.prefs?.income?.accountId || ""),
        },
      },
    };

    // If exists -> update, else -> upsert
    const exists = (merchants || []).some((m) => String(m?.id) === String(entry.id));
    if (exists) updateMerchant(entry.id, entry);
    else upsertMerchant(entry);

    setEditing(null);
    showAlert?.("บันทึก Merchant แล้ว");
  };

  const confirmDelete = (m) => {
    showConfirm?.(
      "Delete merchant?",
      `ต้องการลบ “${String(m?.canonical || "").trim()}” ใช่ไหม? (จะลบเฉพาะใน Merchant Library)`,
      () => {
        deleteMerchant(String(m?.id));
        showAlert?.("ลบแล้ว");
      },
      true
    );
  };

  const openMerge = (m) => {
    setMergeSource(m);
    setMergeTargetId("");
  };

  const commitMerge = () => {
    const sId = String(mergeSource?.id || "");
    const tId = String(mergeTargetId || "");
    if (!sId || !tId || sId === tId) return;

    showConfirm?.(
      "Merge merchants?",
      `รวม “${mergeSource?.canonical}” เข้า “${(merchants || []).find((x) => String(x?.id) === tId)?.canonical || ""}” ?\n\nระบบจะย้าย aliases + สถิติ และจะ rewrite merchant ใน transactions/inbox ที่ match ให้เป็นชื่อปลายทาง`,
      () => {
        mergeMerchants(sId, tId);
        setMergeSource(null);
        setMergeTargetId("");
        showAlert?.("Merge สำเร็จ");
      },
      true
    );
  };

  return (
    <div className="min-h-dvh">
      <AppHeader
        title="Merchant Library"
        subtitle="จำร้าน → หมวด/บัญชี อัตโนมัติ (หลัง Save scan หรือ Approve ใน Inbox)"
        onBack={() => navigate("more")}
        right={
          <button type="button" onClick={openAdd} className="ui-btn ui-btn-primary active:scale-[0.99]">
            <Plus size={18} />
            เพิ่ม
          </button>
        }
      />

      <main className="ui-page pt-4 pb-6">

      <div className="mt-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-900/50" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search merchant (canonical / alias)"
            className="ui-input pl-10 pr-10"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-white/30 border border-white/20 text-gray-900/60 active:scale-95"
              aria-label="Clear"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6">
        <EmptyState
          title="ยังไม่มี merchant"
          description="ลองสแกน/แก้ไขใน Inbox แล้วระบบจะเรียนรู้เอง หรือกด Add"
        />
      </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {filtered.map((m) => {
            const expCat = pickNameById(expenseCats, m?.prefs?.expense?.categoryId);
            const incCat = pickNameById(incomeCats, m?.prefs?.income?.categoryId);
            const expAcc = pickNameById(accounts, m?.prefs?.expense?.accountId);
            const incAcc = pickNameById(accounts, m?.prefs?.income?.accountId);
            return (
              <div key={m.id} className="ui-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-lg font-black text-gray-900 truncate">{m.canonical}</div>
                      {m?.enabled === false ? (
                        <div className="px-2.5 py-1 rounded-2xl bg-gray-900/10 border border-white/20 text-xs font-extrabold text-gray-900/70">
                          Disabled
                        </div>
                      ) : null}
                    </div>

                    {Array.isArray(m?.aliases) && m.aliases.length ? (
                      <div className="mt-1 text-xs text-gray-900/60 truncate">aliases: {m.aliases.join(", ")}</div>
                    ) : (
                      <div className="mt-1 text-xs text-gray-900/50">(no aliases)</div>
                    )}

                    <div className="mt-2 text-xs text-gray-900/70 space-y-1">
                      <div className="truncate">
                        <span className="font-extrabold">Expense</span>: {expCat || "(category?)"}
                        {expAcc ? ` • ${expAcc}` : ""}
                      </div>
                      <div className="truncate">
                        <span className="font-extrabold">Income</span>: {incCat || "(category?)"}
                        {incAcc ? ` • ${incAcc}` : ""}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(m)}
                      className="ui-btn ui-btn-secondary"
                    >
                      <Edit2 size={16} />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => openMerge(m)}
                      className="ui-btn ui-btn-secondary"
                    >
                      <GitMerge size={16} />
                      Merge
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmDelete(m)}
                      className="px-4 py-2 rounded-2xl bg-red-600 text-white font-extrabold active:scale-95 inline-flex items-center justify-center gap-2"
                    >
                      <Trash2 size={16} />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold text-gray-900">{(merchants || []).some((m) => String(m?.id) === String(editing?.id)) ? "Edit" : "Add"} Merchant</h3>
            <p className="mt-1 text-sm text-gray-900/60">ตั้งชื่อหลัก + aliases + preference</p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="p-2 rounded-xl bg-white/30 border border-white/20 text-gray-900/70 active:scale-95"
            aria-label="close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="text-xs font-bold text-gray-900/60">
            Canonical name
            <input
              value={editing?.canonical || ""}
              onChange={(e) => setEditing((d) => ({ ...d, canonical: e.target.value }))}
              placeholder="เช่น 7-ELEVEN"
              className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
            />
          </label>

          <label className="inline-flex items-center gap-2 text-sm font-extrabold text-gray-900/70">
            <input
              type="checkbox"
              checked={editing?.enabled !== false}
              onChange={(e) => setEditing((d) => ({ ...d, enabled: !!e.target.checked }))}
            />
            Enabled
          </label>

          <label className="text-xs font-bold text-gray-900/60">
            Aliases (one per line)
            <textarea
              value={editing?.aliasesText ?? (Array.isArray(editing?.aliases) ? editing.aliases.join("\n") : "")}
              onChange={(e) => setEditing((d) => ({ ...d, aliasesText: e.target.value }))}
              rows={4}
              className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
              placeholder="7-11\nSeven Eleven\n7eleven"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-bold text-gray-900/60">
              Expense category
              <CategorySelect
                categories={expenseCats}
                value={editing?.prefs?.expense?.categoryId || ""}
                onChange={(e) =>
                  setEditing((d) => ({
                    ...d,
                    prefs: { ...d.prefs, expense: { ...d.prefs.expense, categoryId: e.target.value } },
                  }))
                }
                allowEmpty
                emptyLabel="(not set)"
                className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
              />
            </label>

            <div className="min-w-0">
              <div className="text-xs font-bold text-gray-900/60">Expense account</div>
              <div className="mt-1">
                <AccountPicker
                  accounts={accounts}
                  value={editing?.prefs?.expense?.accountId || ""}
                  onChange={(v) => setEditing((d) => ({ ...d, prefs: { ...d.prefs, expense: { ...d.prefs.expense, accountId: v } } }))}
                  title="เลือกบัญชี (Expense)"
                  placeholder="(not set)"
                  allowEmpty
                  emptyLabel="(not set)"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-bold text-gray-900/60">
              Income category
              <CategorySelect
                categories={incomeCats}
                value={editing?.prefs?.income?.categoryId || ""}
                onChange={(e) =>
                  setEditing((d) => ({
                    ...d,
                    prefs: { ...d.prefs, income: { ...d.prefs.income, categoryId: e.target.value } },
                  }))
                }
                allowEmpty
                emptyLabel="(not set)"
                className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
              />
            </label>

            <div className="min-w-0">
              <div className="text-xs font-bold text-gray-900/60">Income account</div>
              <div className="mt-1">
                <AccountPicker
                  accounts={accounts}
                  value={editing?.prefs?.income?.accountId || ""}
                  onChange={(v) => setEditing((d) => ({ ...d, prefs: { ...d.prefs, income: { ...d.prefs.income, accountId: v } } }))}
                  title="เลือกบัญชี (Income)"
                  placeholder="(not set)"
                  allowEmpty
                  emptyLabel="(not set)"
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={commitEdit}
            className="mt-1 px-4 py-3 rounded-2xl bg-gray-900 text-white font-extrabold active:scale-95 inline-flex items-center justify-center gap-2"
          >
            <Check size={18} />
            Save
          </button>
        </div>
      </Modal>

      <Modal open={!!mergeSource} onClose={() => setMergeSource(null)}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold text-gray-900">Merge merchant</h3>
            <p className="mt-1 text-sm text-gray-900/60">รวมร้านให้เป็นชื่อเดียว เพื่อ search และ auto-fill ที่แม่นขึ้น</p>
          </div>
          <button
            type="button"
            onClick={() => setMergeSource(null)}
            className="p-2 rounded-xl bg-white/30 border border-white/20 text-gray-900/70 active:scale-95"
            aria-label="close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <div className="text-sm font-extrabold text-gray-900/70">
            Source: <span className="text-gray-900">{mergeSource?.canonical}</span>
          </div>

          <label className="text-xs font-bold text-gray-900/60">
            Merge into
            <select
              value={mergeTargetId}
              onChange={(e) => setMergeTargetId(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
            >
              <option value="">เลือกปลายทาง</option>
              {merchants
                .filter((x) => String(x?.id) !== String(mergeSource?.id))
                .sort((a, b) => String(a?.canonical || "").localeCompare(String(b?.canonical || "")))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.canonical}
                  </option>
                ))}
            </select>
          </label>

          <button
            type="button"
            onClick={commitMerge}
            disabled={!mergeTargetId}
            className={`px-4 py-3 rounded-2xl font-extrabold active:scale-95 inline-flex items-center justify-center gap-2 ${
              mergeTargetId ? "bg-indigo-600 text-white" : "bg-white/20 text-gray-700/50 border border-white/20"
            }`}
          >
            <GitMerge size={18} />
            Merge
          </button>
        </div>
      </Modal>
      </main>
    </div>
  );
}