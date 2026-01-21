// src/views/CategoriesView.jsx
import { useMemo, useState } from "react";
import { ChevronRight, Plus, Trash2, Edit2, X, Check, Search } from "lucide-react";
import { EMOJI_PRESETS, PRESET_COLORS } from "../constants/presets.jsx";
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
    .replace(/[^\p{L}\p{N}\s]/gu, ""); // keep letters/numbers/space (unicode)

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
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function CategoriesView({ showAlert, showConfirm }) {
  const { state, navigate, addCategory, deleteCategory } = useAppStore();

  const [tab, setTab] = useState("expense");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(""); // "" = create new
  const [q, setQ] = useState("");

  // ✅ Tombstone strategy: deleteCategory will "hide" a category (mark deletedAt)
  // so historical reports can still resolve the old name/icon.
  const catsAll = useMemo(() => state.categories?.[tab] ?? [], [state.categories, tab]);
  const cats = useMemo(() => (catsAll || []).filter((c) => !c?.deletedAt && !c?.isDeleted), [catsAll]);

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏷️");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [kwInput, setKwInput] = useState("");
  const [keywords, setKeywords] = useState([]);

  const onBack = () => navigate("more");

  const resetForm = () => {
    setEditingId("");
    setName("");
    setIcon("🏷️");
    setColor(PRESET_COLORS[0]);
    setKwInput("");
    setKeywords([]);
  };

  const openNew = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (cat) => {
    setEditingId(cat.id);
    setName(cat.name || "");
    setIcon(cat.icon || "🏷️");
    setColor(cat.color || PRESET_COLORS[0]);
    setKwInput("");
    setKeywords(uniqKeywords(cat.keywords || []));
    setOpen(true);
  };

  const upsertLocalCategory = ({ id, name, icon, color, keywords }) => {
    const listAll = state.categories?.[tab] ?? [];
    const existing = listAll.find((c) => c.id === id);

    const payload = {
      ...(existing || {}),
      id,
      name: String(name || "").trim(),
      icon,
      color,
      keywords: uniqKeywords(keywords),
    };

    // store.addCategory is an UPSERT now
    addCategory({ type: tab, category: payload });
  };

  const addOrSave = () => {
    if (!name.trim()) return showAlert?.("กรุณาใส่ชื่อหมวดหมู่");

    const kw = uniqKeywords(keywords);

    if (!editingId) {
      let base = slugify(name);
      if (!base) base = `cat_${Date.now()}`;
      let id = base;
      let i = 2;
      // Ensure unique across ALL categories (including deleted/tombstoned)
      while (catsAll.some((c) => c.id === id)) id = `${base}_${i++}`;

      upsertLocalCategory({ id, name: name.trim(), icon, color, keywords: kw });
    } else {
      upsertLocalCategory({ id: editingId, name: name.trim(), icon, color, keywords: kw });
    }

    setOpen(false);
    resetForm();
    showAlert?.(editingId ? "บันทึกหมวดหมู่แล้ว" : "สร้างหมวดหมู่แล้ว");
  };

  const del = (id) => {
    if ((cats || []).length <= 1) return showAlert?.("ต้องมีอย่างน้อย 1 หมวดหมู่");
    showConfirm?.(
      "ลบหมวดหมู่",
      "ยืนยันลบหมวดหมู่นี้?\n\nหมายเหตุ: หมวดจะถูกซ่อนจากการเลือกใหม่ แต่รายงานย้อนหลัง/งบประมาณยังแสดงชื่อเดิมได้ (ไม่ทำให้ข้อมูลเก่าขึ้น \"—\")",
      () => deleteCategory({ id, type: tab }),
      true
    );
  };

  const addKeyword = () => {
    const raw = String(kwInput || "").trim();
    if (!raw) return;

    // allow multiple keywords separated by comma/newline
    const parts = raw
      .split(/[,|\n]/g)
      .map((x) => x.trim())
      .filter(Boolean);

    const merged = uniqKeywords([...(keywords || []), ...parts]);
    setKeywords(merged);
    setKwInput("");
  };

  const removeKeyword = (kw) => {
    const nk = normKw(kw);
    setKeywords((prev) => (prev || []).filter((x) => normKw(x) !== nk));
  };

  const filteredCats = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return cats;

    return cats.filter((c) => {
      const hay = `${c.name || ""} ${(c.keywords || []).join(" ")}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [cats, q]);

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
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-gray-900">จัดการหมวดหมู่</h1>
          <p className="text-gray-600 text-sm">เพิ่ม/ลบ/แก้ไข + ตั้ง Keywords เพื่อช่วยจัดหมวดจากการสแกน</p>
        </div>
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

      {/* Search */}
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
        {filteredCats.map((cat) => (
          <div key={cat.id} className="glass-card p-4 rounded-2xl flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
                style={{ backgroundColor: `${cat.color}20` }}
              >
                {cat.icon}
              </div>

              <div className="min-w-0">
                <div className="font-extrabold text-gray-900 truncate">{cat.name}</div>
                <div className="text-[11px] text-gray-700/70 mt-0.5">
                  {cat.keywords?.length ? (
                    <>
                      Keywords:{" "}
                      <span className="font-bold text-gray-900/80">
                        {cat.keywords.slice(0, 6).join(", ")}
                        {cat.keywords.length > 6 ? " …" : ""}
                      </span>
                    </>
                  ) : (
                    <span className="text-gray-500">ยังไม่ได้ตั้ง keyword</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => openEdit(cat)}
                className="w-10 h-10 rounded-full glass-icon-btn text-gray-800 flex items-center justify-center active:scale-95"
                type="button"
                title="แก้ไข"
              >
                <Edit2 size={18} />
              </button>

              <button
                onClick={() => del(cat.id)}
                className="w-10 h-10 rounded-full bg-red-500/10 text-red-700 flex items-center justify-center active:scale-95 border border-red-500/15"
                type="button"
                title="ลบ"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}

        <button
          onClick={openNew}
          className="w-full py-4 border-2 border-dashed glass-divider rounded-2xl text-gray-800 font-extrabold flex items-center justify-center gap-2 hover:bg-white/10"
          type="button"
        >
          <Plus size={20} /> เพิ่มหมวดหมู่ใหม่
        </button>
      </div>

      {open ? (
        <ModalShell
          title={editingId ? "แก้ไขหมวดหมู่ + Keywords" : "สร้างหมวดหมู่ใหม่ + Keywords"}
          onClose={() => {
            setOpen(false);
            resetForm();
          }}
        >
          <label className="text-xs font-bold text-gray-700 mb-1 block">ชื่อหมวดหมู่</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 mb-4 font-extrabold text-gray-900"
            placeholder="เช่น อาหาร, ค่าเช่า"
          />

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="glass-panel border border-white/20 rounded-2xl p-3">
              <div className="text-xs font-bold text-gray-700 mb-2">ไอคอน</div>
              <div className="w-full rounded-2xl bg-white/15 border border-white/15 h-[56px] flex items-center justify-center text-2xl">
                {icon}
              </div>
            </div>

            <div className="glass-panel border border-white/20 rounded-2xl p-3">
              <div className="text-xs font-bold text-gray-700 mb-2">สี</div>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.slice(0, 12).map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full border border-white/30 active:scale-95 ${
                      color === c ? "ring-2 ring-offset-1 ring-gray-700" : ""
                    }`}
                    style={{ backgroundColor: c }}
                    type="button"
                    aria-label="choose-color"
                  />
                ))}
              </div>
            </div>
          </div>

          <label className="text-xs font-bold text-gray-700 mb-1 block">เลือกไอคอน</label>
          <div className="glass-panel border border-white/20 rounded-2xl p-2 mb-4 max-h-[220px] overflow-y-auto">
            <div className="grid grid-cols-6 gap-2">
              {EMOJI_PRESETS.map((e, idx) => (
                <button
                  key={idx}
                  onClick={() => setIcon(e)}
                  className={`h-11 w-full flex items-center justify-center text-xl rounded-xl transition-all active:scale-95 ${
                    icon === e ? "bg-white/25 ring-1 ring-gray-900" : "hover:bg-white/10"
                  }`}
                  type="button"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Keywords */}
          <div className="glass-panel border border-white/20 rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-sm font-extrabold text-gray-900">Keywords ของหมวดนี้</div>
              <div className="text-[11px] text-gray-700/70">{keywords.length} คำ</div>
            </div>

            <div className="flex gap-2">
              <input
                value={kwInput}
                onChange={(e) => setKwInput(e.target.value)}
                className="flex-1 glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-extrabold text-gray-900"
                placeholder="เช่น ก๋วยเตี๋ยว, ข้าวมันไก่ (ใส่หลายคำคั่นด้วย , ได้)"
              />
              <button
                type="button"
                onClick={addKeyword}
                className="px-4 py-3 rounded-2xl bg-gray-900/90 text-white font-extrabold active:scale-95"
              >
                เพิ่ม
              </button>
            </div>

            {keywords.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {keywords.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => removeKeyword(k)}
                    className="px-3 py-1.5 rounded-full glass-chip text-xs font-extrabold text-gray-900/80 active:scale-95"
                    title="กดเพื่อลบ"
                  >
                    {k} <span className="text-gray-500">×</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-[12px] text-gray-700/70">
                ยังไม่มี keyword • แนะนำใส่ชื่อเมนู/สินค้า/คำที่เจอบ่อยในบิล เพื่อให้ระบบจัดหมวดหลังสแกนแม่นขึ้น
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
              className="flex-1 py-3 text-gray-800 font-extrabold glass-chip rounded-2xl active:scale-95"
              type="button"
            >
              ยกเลิก
            </button>
            <button
              onClick={addOrSave}
              className="flex-1 py-3 text-white font-extrabold bg-gray-900/90 rounded-2xl shadow-lg active:scale-95 inline-flex items-center justify-center gap-2"
              type="button"
            >
              <Check size={18} /> {editingId ? "บันทึก" : "สร้าง"}
            </button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
