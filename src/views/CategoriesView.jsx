// src/views/CategoriesView.jsx
import { useState } from "react";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { EMOJI_PRESETS, PRESET_COLORS } from "../constants/presets.jsx";
import { useAppStore } from "../store/store";

const slugify = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);

export default function CategoriesView({ showAlert, showConfirm }) {
  const { state, navigate, addCategory, deleteCategory } = useAppStore();

  const [tab, setTab] = useState("expense");
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏷️");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const cats = state.categories?.[tab] ?? [];

  const onBack = () => navigate("more");

  const add = () => {
    if (!name.trim()) return showAlert?.("กรุณาใส่ชื่อหมวดหมู่");

    let base = slugify(name);
    if (!base) base = `cat_${Date.now()}`;

    let id = base;
    let i = 2;
    while (cats.some((c) => c.id === id)) id = `${base}_${i++}`;

    addCategory({
      type: tab,
      category: { id, name: name.trim(), icon, color },
    });

    setName("");
    setIcon("🏷️");
    setColor(PRESET_COLORS[0]);
    setOpen(false);
  };

  const del = (id) => {
    if ((state.categories?.[tab] ?? []).length <= 1) return showAlert?.("ต้องมีอย่างน้อย 1 หมวดหมู่");
    showConfirm?.("ลบหมวดหมู่", "ยืนยันลบหมวดหมู่นี้?", () => deleteCategory({ id, type: tab }), true);
  };

  return (
    <div className="pb-28 pt-6 px-4 min-h-dvh bg-gray-50">
      <header className="mb-6 flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-gray-600"
          type="button"
        >
          <ChevronRight className="rotate-180" size={24} />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">จัดการหมวดหมู่</h1>
          <p className="text-gray-500 text-sm">เพิ่ม/ลบหมวดหมู่</p>
        </div>
      </header>

      <div className="bg-white p-1 rounded-xl flex mb-6 shadow-sm border border-gray-100">
        <button
          onClick={() => setTab("expense")}
          className={`flex-1 py-2 rounded-lg text-sm font-extrabold ${
            tab === "expense" ? "bg-gray-900 text-white shadow-sm" : "text-gray-400"
          }`}
          type="button"
        >
          รายจ่าย
        </button>
        <button
          onClick={() => setTab("income")}
          className={`flex-1 py-2 rounded-lg text-sm font-extrabold ${
            tab === "income" ? "bg-gray-900 text-white shadow-sm" : "text-gray-400"
          }`}
          type="button"
        >
          รายรับ
        </button>
      </div>

      <div className="space-y-3">
        {cats.map((cat) => (
          <div
            key={cat.id}
            className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                style={{ backgroundColor: `${cat.color}20` }}
              >
                {cat.icon}
              </div>
              <span className="font-extrabold text-gray-800">{cat.name}</span>
            </div>

            <button
              onClick={() => del(cat.id)}
              className="text-gray-300 hover:text-red-500 p-2 rounded-full hover:bg-red-50"
              type="button"
            >
              <Trash2 size={20} />
            </button>
          </div>
        ))}

        <button
          onClick={() => setOpen(true)}
          className="w-full py-4 border-2 border-dashed border-gray-300 rounded-2xl text-gray-500 font-extrabold flex items-center justify-center gap-2 hover:bg-gray-50 hover:border-gray-400"
          type="button"
        >
          <Plus size={20} /> เพิ่มหมวดหมู่ใหม่
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm animate-fade-in-up flex flex-col max-h-[90vh]">
            <h3 className="text-xl font-extrabold mb-4">สร้างหมวดหมู่ใหม่</h3>

            <label className="text-xs font-bold text-gray-500 mb-1 block">ชื่อหมวดหมู่</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-xl p-3 outline-none focus:border-gray-900 mb-4 font-bold"
              placeholder="เช่น กาแฟ, ค่าเช่า"
            />

            <div className="flex gap-4 mb-4">
              <div className="flex-1">
                <label className="text-xs font-bold text-gray-500 mb-1 block">ไอคอน</label>
                <div className="w-full border border-gray-200 rounded-xl p-3 bg-gray-50 text-center text-2xl h-[52px]">
                  {icon}
                </div>
              </div>

              <div className="flex-1">
                <label className="text-xs font-bold text-gray-500 mb-1 block">สี</label>
                <div className="flex gap-1 flex-wrap">
                  {PRESET_COLORS.slice(0, 8).map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`w-6 h-6 rounded-full ${color === c ? "ring-2 ring-offset-1 ring-gray-400" : ""}`}
                      style={{ backgroundColor: c }}
                      type="button"
                    />
                  ))}
                </div>
              </div>
            </div>

            <label className="text-xs font-bold text-gray-500 mb-1 block">เลือกไอคอน</label>
            <div className="flex-1 overflow-y-auto border border-gray-100 rounded-xl p-2 mb-4 bg-gray-50">
              <div className="grid grid-cols-6 gap-2">
                {EMOJI_PRESETS.map((e, idx) => (
                  <button
                    key={idx}
                    onClick={() => setIcon(e)}
                    className={`text-xl p-2 rounded-lg hover:bg-white hover:shadow-sm transition-all ${
                      icon === e ? "bg-white shadow-sm ring-1 ring-gray-900" : ""
                    }`}
                    type="button"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 mt-auto">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-3 text-gray-600 font-extrabold bg-gray-100 rounded-xl"
                type="button"
              >
                ยกเลิก
              </button>
              <button
                onClick={add}
                className="flex-1 py-3 text-white font-extrabold bg-gray-900 rounded-xl shadow-lg active:scale-95"
                type="button"
              >
                สร้าง
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
