// src/views/CategoriesView.jsx
import { useMemo, useState } from "react";
import { ChevronRight, Plus, Trash2, X, Check, Sparkles, Search } from "lucide-react";
import { EMOJI_PRESETS, PRESET_COLORS } from "../constants/presets.jsx";
import { useAppStore } from "../store/store";

/**
 * Goals for this view
 * - Mobile-first modal (bottom sheet style) with safe-area padding
 * - Better UX: search, preview, duplicate prevention, and optional edit-friendly behaviors
 * - Keep compatibility with store actions: addCategory({type, category}) + deleteCategory({id, type})
 */

const slugify = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);

function ModalShell({ title, subtitle, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-sm glass-card rounded-t-3xl sm:rounded-3xl p-5 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold text-gray-900 truncate">{title}</h3>
            {subtitle ? <div className="text-[12px] text-gray-800/55 mt-0.5">{subtitle}</div> : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full glass-icon-btn text-gray-700 flex items-center justify-center"
            aria-label="close"
            title="ปิด"
          >
            <X size={18} />
          </button>
        </div>

        {children}

        {/* safe bottom for iOS */}
        <div className="h-3 pb-safe" />
      </div>
    </div>
  );
}

function ColorDots({ value, onChange }) {
  const colors = PRESET_COLORS.slice(0, 12);
  return (
    <div className="flex gap-2 flex-wrap">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange?.(c)}
          className={`w-8 h-8 rounded-full border transition-transform active:scale-95 ${
            value === c ? "border-gray-800/30 ring-2 ring-white/40" : "border-white/10"
          }`}
          style={{ backgroundColor: c }}
          aria-label={`color ${c}`}
          title={c}
        />
      ))}
    </div>
  );
}

function EmojiGrid({ value, onChange, query }) {
  const q = String(query || "").trim().toLowerCase();

  // Simple search behavior: filter by "includes" for emoji text (not super meaningful),
  // but still useful because users will mostly scroll; query helps reduce list with common tags.
  // We also include a small "tag map" for popular categories in TH.
  const tagMap = useMemo(() => {
    return [
      { k: "อาหาร", e: ["🍜", "🍕", "🍔", "🥤", "🍰", "☕", "🍣", "🥗"] },
      { k: "เดินทาง", e: ["🚗", "🚕", "🚌", "🚆", "✈️", "🚲", "⛽", "🛣️"] },
      { k: "ช้อปปิ้ง", e: ["🛍️", "🧾", "🎁", "👕", "👟", "💄", "🧴", "📦"] },
      { k: "บ้าน", e: ["🏠", "🧾", "💡", "🚰", "🧹", "🛠️", "🪑", "🧺"] },
      { k: "สุขภาพ", e: ["💊", "🩺", "🏥", "🧘", "🏃", "🥦", "😷", "🧴"] },
      { k: "บันเทิง", e: ["🎬", "🎮", "🎵", "🎟️", "🍿", "🎧", "🎤", "🎲"] },
      { k: "เงิน", e: ["💰", "💵", "💳", "🪙", "📈", "🏦", "🧾", "💹"] },
    ];
  }, []);

  const filtered = useMemo(() => {
    const base = Array.isArray(EMOJI_PRESETS) ? EMOJI_PRESETS : [];
    if (!q) return base;

    // If query matches a tag, prioritize that tag emojis first.
    const tag = tagMap.find((x) => x.k.toLowerCase().includes(q));
    if (tag) {
      const rest = base.filter((x) => !tag.e.includes(x));
      return [...tag.e, ...rest];
    }

    // Fallback: basic includes (rarely helpful but harmless)
    return base.filter((e) => String(e).includes(q));
  }, [q, tagMap]);

  return (
    <div className="glass-panel border border-white/20 rounded-2xl p-3">
      <div className="text-xs font-extrabold text-gray-800/70 mb-2">เลือกไอคอน</div>

      <div className="max-h-52 overflow-y-auto no-scrollbar">
        <div className="grid grid-cols-8 gap-2">
          {filtered.map((e, idx) => (
            <button
              key={`${e}_${idx}`}
              type="button"
              onClick={() => onChange?.(e)}
              className={`text-xl p-2 rounded-xl border transition-all hover:bg-white/10 active:scale-95 ${
                value === e ? "bg-white/20 border-gray-900/40" : "border-white/15"
              }`}
              aria-label={`emoji ${e}`}
              title={e}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 text-[11px] text-gray-800/55">
        * ถ้าหาไม่เจอ ลองพิมพ์คำไทยสั้น ๆ เช่น “อาหาร”, “เงิน”, “เดินทาง”
      </div>
    </div>
  );
}

export default function CategoriesView({ showAlert, showConfirm }) {
  const { state, navigate, addCategory, deleteCategory } = useAppStore();

  const [tab, setTab] = useState("expense"); // expense | income
  const [open, setOpen] = useState(false);

  // list + search
  const [listQuery, setListQuery] = useState("");

  // create form
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏷️");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  // emoji picker search
  const [emojiQuery, setEmojiQuery] = useState("");

  const cats = state.categories?.[tab] ?? [];

  const onBack = () => navigate("more");

  const filteredCats = useMemo(() => {
    const q = String(listQuery || "").trim().toLowerCase();
    if (!q) return cats;
    return cats.filter((c) => {
      const n = String(c?.name || "").toLowerCase();
      const id = String(c?.id || "").toLowerCase();
      return n.includes(q) || id.includes(q);
    });
  }, [cats, listQuery]);

  const existingNameSet = useMemo(() => {
    const s = new Set();
    for (const c of cats) s.add(String(c?.name || "").trim().toLowerCase());
    return s;
  }, [cats]);

  const resetForm = () => {
    setName("");
    setIcon("🏷️");
    setColor(PRESET_COLORS[0]);
    setEmojiQuery("");
  };

  const add = () => {
    const n = String(name || "").trim();
    if (!n) return showAlert?.("กรุณาใส่ชื่อหมวดหมู่");

    // prevent duplicates by name (case-insensitive)
    if (existingNameSet.has(n.toLowerCase())) return showAlert?.("ชื่อหมวดหมู่นี้มีอยู่แล้ว");

    let base = slugify(n);
    if (!base) base = `cat_${Date.now()}`;

    let id = base;
    let i = 2;
    while (cats.some((c) => c.id === id)) id = `${base}_${i++}`;

    addCategory({
      type: tab,
      category: { id, name: n, icon: String(icon || "🏷️"), color: String(color || PRESET_COLORS[0]) },
    });

    resetForm();
    setOpen(false);
  };

  const del = (id) => {
    if ((state.categories?.[tab] ?? []).length <= 1) return showAlert?.("ต้องมีอย่างน้อย 1 หมวดหมู่");
    showConfirm?.("ลบหมวดหมู่", "ยืนยันลบหมวดหมู่นี้?", () => deleteCategory({ id, type: tab }), true);
  };

  return (
    <div className="pb-28 pt-6 px-4 min-h-dvh">
      <header className="mb-6 flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full glass-icon-btn flex items-center justify-center text-gray-700"
          type="button"
          aria-label="back"
          title="ย้อนกลับ"
        >
          <ChevronRight className="rotate-180" size={24} />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-gray-900">จัดการหมวดหมู่</h1>
          <p className="text-gray-600 text-sm truncate">เพิ่ม/ลบหมวดหมู่ (รายจ่าย/รายรับ)</p>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-11 h-11 bg-gray-900/90 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 shrink-0"
          aria-label="add category"
          title="เพิ่มหมวดหมู่"
        >
          <Plus size={18} />
        </button>
      </header>

      {/* Tabs */}
      <div className="glass-panel border border-white/20 p-1.5 rounded-2xl flex mb-4">
        <button
          onClick={() => setTab("expense")}
          className={`flex-1 py-3 rounded-xl text-sm font-extrabold transition-all ${
            tab === "expense" ? "bg-gray-900/90 text-white shadow-sm" : "text-gray-800/60 hover:bg-white/10"
          }`}
          type="button"
        >
          รายจ่าย
        </button>
        <button
          onClick={() => setTab("income")}
          className={`flex-1 py-3 rounded-xl text-sm font-extrabold transition-all ${
            tab === "income" ? "bg-gray-900/90 text-white shadow-sm" : "text-gray-800/60 hover:bg-white/10"
          }`}
          type="button"
        >
          รายรับ
        </button>
      </div>

      {/* Search */}
      <div className="glass-card rounded-3xl p-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-gray-900/60">
            <Search size={18} />
          </div>
          <input
            value={listQuery}
            onChange={(e) => setListQuery(e.target.value)}
            className="flex-1 glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-extrabold text-gray-900"
            placeholder="ค้นหาหมวดหมู่ (ชื่อ/ID)"
          />
        </div>
        <div className="mt-2 text-[11px] text-gray-800/55">
          แสดง {filteredCats.length} / {cats.length} หมวดหมู่
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filteredCats.map((cat) => (
          <div key={cat.id} className="glass-card p-4 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0"
                style={{ backgroundColor: `${cat.color}20` }}
              >
                {cat.icon}
              </div>

              <div className="min-w-0">
                <div className="font-extrabold text-gray-900 truncate">{cat.name}</div>
                <div className="text-[11px] text-gray-800/55 mt-0.5 truncate">
                  ID: <span className="font-bold">{cat.id}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => del(cat.id)}
              className="w-10 h-10 rounded-full bg-red-500/10 text-red-700 flex items-center justify-center active:scale-95 border border-red-500/15"
              type="button"
              title="ลบ"
              aria-label="delete category"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ))}

        {!cats.length ? (
          <div className="text-center py-12 glass-card rounded-3xl border border-white/15">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-500">
              <Sparkles size={32} />
            </div>
            <p className="text-gray-900 font-extrabold">ยังไม่มีหมวดหมู่</p>
            <p className="text-gray-900/60 text-sm mt-1">กดปุ่ม + เพื่อเพิ่มหมวดหมู่ใหม่</p>
          </div>
        ) : null}

        <button
          onClick={() => setOpen(true)}
          className="w-full py-4 border-2 border-dashed glass-divider rounded-2xl text-gray-800 font-extrabold flex items-center justify-center gap-2 hover:bg-white/10 active:scale-[0.99]"
          type="button"
        >
          <Plus size={20} /> เพิ่มหมวดหมู่ใหม่
        </button>
      </div>

      {/* Create Modal */}
      {open ? (
        <ModalShell
          title="สร้างหมวดหมู่ใหม่"
          subtitle={tab === "expense" ? "สำหรับรายจ่าย" : "สำหรับรายรับ"}
          onClose={() => {
            setOpen(false);
            resetForm();
          }}
        >
          {/* Preview */}
          <div className="glass-panel border border-white/20 rounded-2xl p-4 mb-4 flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
              style={{ backgroundColor: `${color}20` }}
            >
              {icon}
            </div>
            <div className="min-w-0">
              <div className="text-xs text-gray-800/60">ตัวอย่าง</div>
              <div className="text-sm font-extrabold text-gray-900 truncate">{name?.trim() || "ชื่อหมวดหมู่"}</div>
              <div className="text-[11px] text-gray-800/55 mt-0.5 truncate">
                ID จะถูกสร้างอัตโนมัติจากชื่อ (กันซ้ำให้เอง)
              </div>
            </div>
          </div>

          {/* Name */}
          <label className="text-xs font-bold text-gray-700 mb-1 block">ชื่อหมวดหมู่</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 mb-3 font-extrabold text-gray-900"
            placeholder="เช่น กาแฟ, ค่าเช่า, ของใช้"
          />

          {/* Color */}
          <div className="mb-4">
            <label className="text-xs font-bold text-gray-700 mb-2 block">สี</label>
            <ColorDots value={color} onChange={setColor} />
          </div>

          {/* Icon quick input */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="glass-panel border border-white/20 rounded-2xl p-3">
              <div className="text-xs font-bold text-gray-900/70 mb-1">ไอคอน (พิมพ์เองได้)</div>
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 text-2xl text-center"
                placeholder="🏷️"
              />
              <div className="text-[11px] text-gray-800/55 mt-1">ใช้คีย์บอร์ด Emoji บนมือถือได้เลย</div>
            </div>

            <div className="glass-panel border border-white/20 rounded-2xl p-3">
              <div className="text-xs font-bold text-gray-900/70 mb-1">ค้นหาไอคอน</div>
              <div className="flex items-center gap-2">
                <Search size={16} className="text-gray-900/50" />
                <input
                  value={emojiQuery}
                  onChange={(e) => setEmojiQuery(e.target.value)}
                  className="w-full outline-none bg-transparent text-sm font-extrabold text-gray-900"
                  placeholder="เช่น อาหาร, เงิน, เดินทาง"
                />
              </div>
              <div className="text-[11px] text-gray-800/55 mt-2 truncate">
                เลือก: <span className="font-extrabold text-gray-900">{icon || "🏷️"}</span>
              </div>
            </div>
          </div>

          {/* Emoji Grid */}
          <div className="mb-4">
            <EmojiGrid value={icon} onChange={setIcon} query={emojiQuery} />
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-2">
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
              onClick={add}
              className="flex-1 py-3 text-white font-extrabold bg-gray-900/90 rounded-2xl shadow-lg active:scale-95 flex items-center justify-center gap-2"
              type="button"
            >
              <Check size={18} /> สร้าง
            </button>
          </div>

          {/* Small helper note */}
          <div className="mt-3 text-[11px] text-gray-800/55">
            Tip: ตั้งชื่อให้ชัด เช่น “กาแฟ”, “ค่าเดินทาง”, “ค่าสมัครสมาชิก” จะช่วยให้รายงานและงบประมาณใช้งานง่ายขึ้น
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
