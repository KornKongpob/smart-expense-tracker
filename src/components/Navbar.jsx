// src/components/Navbar.jsx
import React, { useLayoutEffect, useRef } from "react";
import { Plus, Home, Activity, CreditCard, MoreHorizontal } from "lucide-react";
import { useAppStore } from "../store/store.jsx";

function NavItem({ active, icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      type="button"
      aria-current={active ? "page" : undefined}
      className={[
        "flex w-[4.5rem] flex-col items-center justify-center gap-1 rounded-[1.4rem] px-2 py-2.5 transition-all duration-150 active:scale-[0.985]",
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300/30",
        active
          ? "text-slate-950 bg-white/90 border border-white/90 shadow-[0_18px_36px_-24px_rgba(37,99,235,0.72)]"
          : "text-slate-500 border border-transparent hover:text-slate-900 hover:bg-white/55",
      ].join(" ")}
    >
      <div
        className={[
          "flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150",
          active ? "bg-gradient-to-br from-blue-500/14 via-indigo-500/12 to-violet-500/16" : "bg-transparent",
        ].join(" ")}
      >
        {icon}
      </div>
      <span className={active ? "text-[11px] font-black tracking-[-0.01em]" : "text-[11px] font-extrabold tracking-[-0.01em]"}>{label}</span>
    </button>
  );
}

export default function Navbar({ onFabPress }) {
  const { state, actions } = useAppStore();
  const currentView = state?.ui?.view || "dashboard";
  const navRef = useRef(null);

  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;

    const updateHeight = () => {
      const h = Math.ceil(el.getBoundingClientRect().height || 0);
      if (h > 0) document.documentElement.style.setProperty("--app-nav-h", `${h + 8}px`);
    };

    updateHeight();

    let ro;
    try {
      ro = new ResizeObserver(() => updateHeight());
      ro.observe(el);
    } catch {
      // ignore
    }

    window.addEventListener("resize", updateHeight);
    return () => {
      window.removeEventListener("resize", updateHeight);
      ro?.disconnect?.();
    };
  }, []);

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
    <div className="app-navbar fixed inset-x-0 bottom-0 z-[40] px-4 pb-safe pointer-events-none">
      {/*
        ✅ Bottom scrim: ช่วย “ปิด” คอนเทนต์ด้านหลังที่โผล่ทะลุผ่าน glass navbar
        - ทำให้มองแล้วไม่แปลกตาเวลามี list/การ์ดอยู่ด้านล่าง
        - ยังเก็บฟีล glass + blur ไว้ที่ตัวแถบจริง
      */}
      <div
        className="absolute inset-x-0 bottom-0 h-40 pointer-events-none"
        style={{
          background: "linear-gradient(to top, color-mix(in srgb, var(--bg) 96%, transparent), color-mix(in srgb, var(--bg) 78%, transparent) 44%, transparent)",
        }}
      />

      {/* ✅ Only actual bar is clickable */}
      <nav ref={navRef} className="mx-auto w-full max-w-[40rem] pb-3 pointer-events-auto" aria-label="Bottom navigation">
        <div
          className="
            relative
            rounded-[2rem]
            overflow-hidden
            border border-white/45
            shadow-[0_-12px_40px_-18px_rgba(15,23,42,0.42)]
          "
          style={{
            background: "var(--surface-strong)",
            backdropFilter: "blur(26px)",
            WebkitBackdropFilter: "blur(26px)",
          }}
        >
          {/* Underlay: ลดความโปร่งใส เพื่อไม่ให้เห็นของด้านหลังชัดเกินไป */}
          <div className="absolute inset-0 backdrop-blur-2xl" style={{ background: "var(--surface)" }} />
          <div className="absolute inset-0 bg-gradient-to-b from-white/75 via-white/30 to-transparent dark:from-white/10 dark:via-transparent dark:to-transparent" />

          <div className="relative px-3 py-3 flex items-end justify-between gap-1">
            <NavItem
              active={currentView === "dashboard"}
              onClick={() => actions.navigate("dashboard")}
              icon={<Home size={22} />}
              label="หน้าแรก"
            />

            <NavItem
              active={currentView === "stats"}
              onClick={() => actions.navigate("stats")}
              icon={<Activity size={22} />}
              label="สรุปผล"
            />

            {/* Center FAB */}
            <div className="w-[4.5rem] flex items-center justify-center">
              <button
                onClick={() => onFabPress ? onFabPress() : actions.startNewTransaction()}
                aria-label="Add transaction"
                type="button"
                className="
                  -mt-12
                  w-16 h-16
                  rounded-full
                  flex items-center justify-center
                  bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600
                  text-white
                  shadow-[0_22px_42px_-18px_rgba(37,99,235,0.88)]
                  border border-white/35
                  ring-[6px] ring-white/55
                  backdrop-blur-xl
                  active:scale-95 transition-all
                  focus:outline-none
                  focus-visible:ring-4 focus-visible:ring-indigo-300/35
                "
              >
                <Plus size={30} />
              </button>
            </div>

            <NavItem
              active={currentView === "accounts"}
              onClick={() => actions.navigate("accounts")}
              icon={<CreditCard size={22} />}
              label="บัญชี"
            />

            <NavItem
              active={currentView === "more"}
              onClick={() => actions.navigate("more")}
              icon={<MoreHorizontal size={22} />}
              label="อื่นๆ"
            />
          </div>
        </div>
      </nav>
    </div>
  );
}
