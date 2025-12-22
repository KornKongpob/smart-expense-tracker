// src/components/Navbar.jsx
import React from "react";
import { Plus, Home, Activity, CreditCard, MoreHorizontal } from "lucide-react";
import { useAppStore } from "../store/store.jsx";

export default function Navbar() {
  const { state, actions } = useAppStore();
  const currentView = state?.ui?.view || "dashboard";

  const Item = ({ active, icon, label, onClick }) => (
    <button
      onClick={onClick}
      type="button"
      aria-current={active ? "page" : undefined}
      className={[
        "flex flex-col items-center w-16 py-2 rounded-2xl transition-all active:scale-95",
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300/40",
        active
          ? "text-indigo-700 bg-white/35 border border-white/30 shadow-sm"
          : "text-gray-700/55 hover:text-gray-900/70 hover:bg-white/25",
      ].join(" ")}
    >
      {icon}
      <span className="text-[10px] mt-1 font-extrabold">{label}</span>
    </button>
  );

  return (
    /**
     * ✅ กัน Navbar “บัง” การกดของหน้าจออื่น
     * - pointer-events-none ที่ wrapper: พื้นที่โปร่งใสรอบๆ/ขอบๆ จะไม่รับคลิก
     * - pointer-events-auto เฉพาะตัวแถบจริง: มีแค่ปุ่มที่กดได้เท่านั้น
     *
     * ✅ z-index ตั้งให้ต่ำกว่า modal
     * - modal หลายหน้าของคุณใช้ z-[60] / z-[100] / z-[110] แล้ว
     * - Navbar อยู่ z-[40] เพื่อไม่ชน modal
     */
    <div className="fixed inset-x-0 bottom-0 z-[40] px-4 pb-safe pointer-events-none">
      {/* ✅ Only actual bar is clickable */}
      <nav
        className="mx-auto w-full max-w-md pb-3 pointer-events-auto"
        aria-label="Bottom navigation"
      >
        <div
          className="
            rounded-3xl
            bg-white/22
            backdrop-blur-2xl
            border border-white/30
            shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.35)]
            px-3 py-2
            flex items-end justify-between
          "
        >
          <Item
            active={currentView === "dashboard"}
            onClick={() => actions.navigate("dashboard")}
            icon={<Home size={22} />}
            label="หน้าแรก"
          />

          <Item
            active={currentView === "stats"}
            onClick={() => actions.navigate("stats")}
            icon={<Activity size={22} />}
            label="สรุปผล"
          />

          {/* Center FAB */}
          <div className="w-16 flex items-center justify-center">
            <button
              onClick={() => actions.startNewTransaction()}
              aria-label="Add transaction"
              type="button"
              className="
                -mt-10
                w-14 h-14
                rounded-full
                flex items-center justify-center
                bg-gradient-to-tr from-indigo-600/95 to-purple-600/95
                text-white
                shadow-[0_14px_35px_-14px_rgba(99,102,241,0.9)]
                border border-white/30
                ring-4 ring-white/40
                backdrop-blur-xl
                active:scale-95 transition-all
                focus:outline-none
                focus-visible:ring-4 focus-visible:ring-indigo-300/40
              "
            >
              <Plus size={28} />
            </button>
          </div>

          <Item
            active={currentView === "accounts"}
            onClick={() => actions.navigate("accounts")}
            icon={<CreditCard size={22} />}
            label="บัญชี"
          />

          <Item
            active={currentView === "more"}
            onClick={() => actions.navigate("more")}
            icon={<MoreHorizontal size={22} />}
            label="อื่นๆ"
          />
        </div>
      </nav>
    </div>
  );
}
