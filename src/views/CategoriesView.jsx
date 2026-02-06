// src/views/CategoriesView.jsx
import { useMemo, useState } from "react";
import { ChevronRight, Plus, Trash2, Edit2, X, Check, Search, CornerDownRight } from "lucide-react";
import { PRESET_COLORS } from "../constants/presets.jsx";
import { useAppStore } from "../store/store";

const slugify = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);

const normKw = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "");

function uniqKeywords(list) {
  const out = [];
  const seen = new Set();
  for (const k of list || []) {
    const nk = normKw(k);
    if (!nk) continue;
    if (seen.has(nk)) continue;
    seen.add(nk);
    out.push(nk);
  }
  return out;
}

function ModalShell({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-md glass-card rounded-t-3xl sm:rounded-3xl p-5 max-h-[90dvh] overflow-y-auto">
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

function isActiveCat(c) {
  return !!c && !(c?.deletedAt || c?.isDeleted);
}

export default function CategoriesView({ showAlert, showConfirm }) {
  const { state, navigate, addCategory, deleteCategory } = useAppStore();

  const [tab, setTab] = useState("expense");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [q, setQ] = useState("");

  const catsAll = useMemo(() => state.categories?.[tab] ?? [], [state.categories, tab]);
  const catsActive = useMemo(() => (catsAll || []).filter(isActiveCat), [catsAll]);

  const byIdActive = useMemo(() => {
    const m = new Map();
    for (const c of catsActive) m.set(String(c.id), c);
    return m;
  }, [catsActive]);

  const activeMain = useMemo(() => catsActive.filter((c) => !String(c?.parentId || "").trim()), [catsActive]);
  const activeChildrenByParent = useMemo(() => {
    const mp = new Map();
    for (const c of catsActive) {
      const pid = String(c?.parentId || "").trim();
      if (!pid) continue;
      const arr = mp.get(pid) || [];
      arr.push(c);
      mp.set(pid, arr);
    }
    for (const [pid, arr] of mp.entries()) {
      arr.sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), "th"));
      mp.set(pid, arr);
    }
    return mp;
  }, [catsActive]);

  // --- form state ---
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏷️");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [parentId, setParentId] = useState(""); // "" = main
  const [kwInput, setKwInput] = useState("");
  const [keywords, setKeywords] = useState([]);

  const onBack = () => navigate("more");

  const resetForm = () => {
    setEditingId("");
    setName("");
    setIcon("🏷️");
    setColor(PRESET_COLORS[0]);
    setParentId("");
    setKwInput("");
    setKeywords([]);
  };

  const openNew = (prefillParentId = "") => {
    resetForm();
    setParentId(String(prefillParentId || "").trim());
    setOpen(true);
  };

  const openEdit = (cat) => {
    setEditingId(String(cat?.id || ""));
    setName(String(cat?.name || ""));
    setIcon(String(cat?.icon || "🏷️"));
    setColor(String(cat?.color || PRESET_COLORS[0]));
    setParentId(String(cat?.parentId || "").trim());
    setKwInput("");
    setKeywords(uniqKeywords(cat?.keywords || []));
    setOpen(true);
  };

  const parentOptions = useMemo(() => {
    // Only active MAIN categories can be parent.
    return (activeMain || [])
      .filter((c) => {
        const id = String(c?.id || "").trim();
        if (!id) return false;
        if (editingId && id === String(editingId)) return false; // can't parent self
        return true;
      })
      .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), "th"));
  }, [activeMain, editingId]);

  const editingHasChildren = useMemo(() => {
    if (!editingId) return false;
    const kids = activeChildrenByParent.get(String(editingId)) || [];
    return kids.length > 0;
  }, [editingId, activeChildrenByParent]);

  const addKeyword = () => {
    const raw = String(kwInput || "").trim();
    if (!raw) return;
    const parts = raw
      .split(/[,|\n]/g)
      .map((x) => x.trim())
      .filter(Boolean);
    setKeywords(uniqKeywords([...(keywords || []), ...parts]));
    setKwInput("");
  };

  const removeKeyword = (kw) => {
    const nk = normKw(kw);
    setKeywords((prev) => (prev || []).filter((x) => normKw(x) !== nk));
  };

  const upsertLocalCategory = ({ id, name, icon, color, keywords, parentId }) => {
    const listAll = state.categories?.[tab] ?? [];
    const existing = listAll.find((c) => String(c?.id) === String(id));

    const payload = {
      ...(existing || {}),
      id: String(id),
      name: String(name || "").trim(),
      icon: String(icon || "🏷️"),
      color: String(color || PRESET_COLORS[0]),
      parentId: String(parentId || "").trim(),
      keywords: uniqKeywords(keywords),
    };

    addCategory({ type: tab, category: payload }); // store.addCategory = UPSERT + sanitize hierarchy
  };

  const addOrSave = () => {
    if (!String(name || "").trim()) return showAlert?.("กรุณาใส่ชื่อหมวดหมู่");

    // prevent picking a deleted/missing parent in UI layer
    const pid = String(parentId || "").trim();
    const isPidOk = !pid || byIdActive.has(pid);
    const finalParentId = isPidOk ? pid : "";

    // if editing a parent-with-children -> force remain main
    const safeParentId = editingHasChildren ? "" : finalParentId;

    const kw = uniqKeywords(keywords);

    if (!editingId) {
      let base = slugify(name);
      if (!base) base = `cat_${Date.now()}`;
      let id = base;
      let i = 2;
      while ((catsAll || []).some((c) => String(c?.id) === String(id))) id = `${base}_${i++}`;
      upsertLocalCategory({ id, name: name.trim(), icon, color, keywords: kw, parentId: safeParentId });
      showAlert?.("สร้างหมวดหมู่แล้ว");
    } else {
      upsertLocalCategory({ id: editingId, name: name.trim(), icon, color, keywords: kw, parentId: safeParentId });
      showAlert?.("บันทึกหมวดหมู่แล้ว");
    }

    setOpen(false);
    resetForm();
  };

  const del = (id) => {
    const targetId = String(id || "").trim();
    if (!targetId) return;

    // figure out descendants count for message (1-level only, but store also cascades)
    const kids = activeChildrenByParent.get(targetId) || [];

    const activeCount = (catsActive || []).length;
    const removeCount = kids.length ? 1 + kids.length : 1;
    if (activeCount - removeCount < 1) {
      return showAlert?.("ต้องมีอย่างน้อย 1 หมวดหมู่ (ลบหมวดหลักนี้แล้วหมวดจะหมด)");
    }

    const msg = kids.length
      ? `ยืนยันลบหมวดนี้?\n\nระบบจะซ่อน “หมวดหลัก” และ “หมวดย่อย” ทั้งหมด (${kids.length} รายการ) จากการเลือกใหม่\nแต่รายงานย้อนหลัง/งบประมาณยังแสดงชื่อเดิมได้ (ไม่ทำให้ข้อมูลเก่าขึ้น “—”)`
      : `ยืนยันลบหมวดหมู่นี้?\n\nหมายเหตุ: หมวดจะถูกซ่อนจากการเลือกใหม่ แต่รายงานย้อนหลัง/งบประมาณยังแสดงชื่อเดิมได้ (ไม่ทำให้ข้อมูลเก่าขึ้น “—”)`;

    showConfirm?.("ลบหมวดหมู่", msg, () => deleteCategory({ id: targetId, type: tab }), true);
  };

  // --- filtered tree ---
  const renderTree = useMemo(() => {
    const needle = String(q || "").trim().toLowerCase();
    const hit = (c) => {
      if (!needle) return true;
      const hay = `${c?.name || ""} ${(c?.keywords || []).join(" ")}`.toLowerCase();
      return hay.includes(needle);
    };

    if (!needle) {
      return activeMain
        .slice()
        .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), "th"))
        .map((p) => ({ parent: p, children: activeChildrenByParent.get(String(p.id)) || [] }));
    }

    const matchedIds = new Set();
    for (const c of catsActive) {
      if (hit(c)) {
        matchedIds.add(String(c.id));
        const pid = String(c?.parentId || "").trim();
        if (pid) matchedIds.add(pid);
      }
    }

    const parents = activeMain
      .filter((p) => {
        if (matchedIds.has(String(p.id))) return true;
        const kids = activeChildrenByParent.get(String(p.id)) || [];
        return kids.some((k) => matchedIds.has(String(k.id)));
      })
      .slice()
      .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), "th"));

    return parents.map((p) => {
      const showAllKids = hit(p) || matchedIds.has(String(p.id));
      const kids = (activeChildrenByParent.get(String(p.id)) || []).filter((k) => showAllKids || matchedIds.has(String(k.id)));
      return { parent: p, children: kids };
    });
  }, [q, catsActive, activeMain, activeChildrenByParent]);

  return (
    <div className="pb-28 pt-6 px-4 min-h-dvh">
      <header className="mb-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full glass-icon-btn flex items-center justify-center text-gray-700"
          type="button"
        >
          <ChevronRight className="rotate-180" size={24} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-gray-900">จัดการหมวดหมู่</h1>
          <p className="text-gray-600 text-sm">สร้างหมวดหลัก/หมวดย่อย + ตั้ง Keywords เพื่อช่วยจัดหมวดจากการสแกน</p>
        </div>

        <button
          type="button"
          onClick={() => openNew("")}
          className="shrink-0 w-10 h-10 rounded-full bg-gray-900/90 text-white flex items-center justify-center active:scale-95"
          aria-label="add category"
          title="เพิ่มหมวด"
        >
          <Plus size={18} />
        </button>
      </header>

      <div className="glass-panel p-1 rounded-xl flex mb-4">
        <button
          onClick={() => setTab("expense")}
          className={`flex-1 py-2 rounded-lg text-sm font-extrabold ${
            tab === "expense" ? "bg-gray-900/90 text-white shadow-sm" : "text-gray-600"
          }`}
          type="button"
        >
          รายจ่าย
        </button>
        <button
          onClick={() => setTab("income")}
          className={`flex-1 py-2 rounded-lg text-sm font-extrabold ${
            tab === "income" ? "bg-gray-900/90 text-white shadow-sm" : "text-gray-600"
          }`}
          type="button"
        >
          รายรับ
        </button>
      </div>

      <div className="mb-4">
        <div className="glass-input rounded-2xl px-3 py-2 flex items-center gap-2">
          <Search size={16} className="text-gray-600" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาหมวด หรือ keyword"
            className="w-full outline-none text-sm bg-transparent text-gray-800 placeholder:text-gray-500"
          />
        </div>
      </div>

      <div className="space-y-3">
        {renderTree.length ? (
          renderTree.map(({ parent, children }) => {
            const kids = children || [];
            return (
              <div key={parent.id} className="glass-card rounded-2xl overflow-hidden border border-white/15">
                <div className="p-4 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
                      style={{ backgroundColor: `${parent.color}20` }}
                    >
                      {parent.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="font-extrabold text-gray-900 truncate">{parent.name}</div>
                      <div className="text-[11px] text-gray-700/70 mt-0.5">
                        {kids.length ? (
                          <span className="font-bold text-gray-900/70">มีหมวดย่อย {kids.length} รายการ</span>
                        ) : parent.keywords?.length ? (
                          <>
                            Keywords: <span className="font-bold text-gray-900/80">{parent.keywords.slice(0, 6).join(", ")}{parent.keywords.length > 6 ? " …" : ""}</span>
                          </>
                        ) : (
                          <span className="text-gray-500">ยังไม่ได้ตั้ง keyword</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openNew(parent.id)}
                      className="p-2 rounded-xl bg-white/20 border border-white/20 text-gray-900/80 active:scale-95"
                      title="เพิ่มหมวดย่อย"
                      aria-label="add sub category"
                    >
                      <Plus size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(parent)}
                      className="p-2 rounded-xl bg-white/20 border border-white/20 text-gray-900/80 active:scale-95"
                      title="Edit"
                      aria-label="edit"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => del(parent.id)}
                      className="p-2 rounded-xl bg-red-500/10 border border-red-500/15 text-red-700 active:scale-95"
                      title="Delete"
                      aria-label="delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {kids.length ? (
                  <div className="border-t border-white/15 px-4 py-3 space-y-2 bg-white/5">
                    {kids.map((c) => (
                      <div key={c.id} className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 min-w-0">
                          <div className="pt-1 text-gray-900/40">
                            <CornerDownRight size={14} />
                          </div>
                          <div className="flex items-start gap-2 min-w-0">
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0"
                              style={{ backgroundColor: `${c.color}20` }}
                            >
                              {c.icon}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-extrabold text-gray-900 truncate">{c.name}</div>
                              <div className="text-[11px] text-gray-700/70">
                                {c.keywords?.length ? (
                                  <>
                                    Keywords: <span className="font-bold text-gray-900/80">{c.keywords.slice(0, 5).join(", ")}{c.keywords.length > 5 ? " …" : ""}</span>
                                  </>
                                ) : (
                                  <span className="text-gray-500">ยังไม่ได้ตั้ง keyword</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
                            className="p-2 rounded-xl bg-white/20 border border-white/20 text-gray-900/80 active:scale-95"
                            title="Edit"
                            aria-label="edit sub"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => del(c.id)}
                            className="p-2 rounded-xl bg-red-500/10 border border-red-500/15 text-red-700 active:scale-95"
                            title="Delete"
                            aria-label="delete sub"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <div className="glass-card rounded-3xl border border-dashed glass-divider text-center py-16">
            <div className="w-16 h-16 glass-chip rounded-full flex items-center justify-center mx-auto mb-3 text-gray-600">
              <CornerDownRight size={28} />
            </div>
            <p className="text-gray-800 font-extrabold">ไม่พบหมวดหมู่</p>
            <button onClick={() => openNew("")} className="mt-3 text-emerald-700 text-sm font-extrabold" type="button">
              เพิ่มหมวดหมู่
            </button>
          </div>
        )}
      </div>

      {open ? (
        <ModalShell title={editingId ? "แก้ไขหมวดหมู่" : "เพิ่มหมวดหมู่"} onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <label className="text-xs font-bold text-gray-900/60 block">
              ชื่อหมวด
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
                placeholder="เช่น อาหาร, กาแฟ"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-bold text-gray-900/60">
                Icon (emoji)
                <input
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
                  placeholder="🏷️"
                />
              </label>
              <label className="text-xs font-bold text-gray-900/60">
                สี
                <select
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
                >
                  {PRESET_COLORS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <div className="text-xs font-extrabold text-gray-900/70 mb-1">โครงสร้าง (หมวดหลัก / หมวดย่อย)</div>
              {editingHasChildren ? (
                <div className="text-[11px] text-amber-900/70 mb-2">
                  หมวดนี้มีหมวดย่อยอยู่แล้ว จึงถูกล็อกให้เป็น “หมวดหลัก” (กันโครงสร้างซ้อน 3 ชั้น)
                </div>
              ) : null}
              <select
                value={editingHasChildren ? "" : parentId}
                onChange={(e) => setParentId(e.target.value)}
                disabled={editingHasChildren}
                className={`w-full px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold ${
                  editingHasChildren ? "opacity-70" : ""
                }`}
              >
                <option value="">(หมวดหลัก)</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.icon} {p.name}
                  </option>
                ))}
              </select>
              <div className="text-[11px] text-gray-900/55 mt-1">
                ถ้าเลือก “หมวดหลัก” ว่างไว้ = เป็นหมวดหลัก • ถ้าเลือกหมวดหลักด้านบน = เป็นหมวดย่อยของหมวดนั้น
              </div>
            </div>

            {/* Keywords */}
            <div>
              <div className="text-xs font-extrabold text-gray-900/70 mb-1">Keywords (ช่วยจัดหมวดจากการสแกน)</div>
              <div className="flex gap-2">
                <input
                  value={kwInput}
                  onChange={(e) => setKwInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-2xl bg-white/30 border border-white/20 outline-none font-extrabold"
                  placeholder="พิมพ์คำ แล้วกดเพิ่ม (คั่นด้วย , หรือขึ้นบรรทัดใหม่ได้)"
                />
                <button
                  type="button"
                  onClick={addKeyword}
                  className="px-4 py-2 rounded-2xl bg-gray-900/90 text-white text-xs font-extrabold active:scale-95"
                >
                  + เพิ่ม
                </button>
              </div>

              {keywords.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {keywords.map((kw) => (
                    <button
                      key={kw}
                      type="button"
                      onClick={() => removeKeyword(kw)}
                      className="px-3 py-1.5 rounded-full bg-white/20 border border-white/20 text-[11px] font-extrabold text-gray-900/80 active:scale-95"
                      title="ลบ keyword"
                    >
                      {kw} <span className="text-gray-900/50">×</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-[11px] text-gray-900/55">ยังไม่มี keyword</div>
              )}
            </div>

            <button
              type="button"
              onClick={addOrSave}
              className="w-full px-4 py-3 rounded-2xl bg-gray-900 text-white font-extrabold active:scale-95 inline-flex items-center justify-center gap-2"
            >
              <Check size={18} />
              {editingId ? "บันทึก" : "สร้างหมวด"}
            </button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
