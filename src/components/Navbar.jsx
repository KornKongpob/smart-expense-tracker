// src/components/Navbar.jsx
import React, { useLayoutEffect, useRef } from "react";
import { Camera, CreditCard, Home, Inbox, MoreHorizontal } from "lucide-react";
import { useAppStore } from "../store/store.jsx";

function NavItem({ active, icon, label, onClick, emphasized = false, testId }) {
  return (
    <button
      onClick={onClick}
      type="button"
      aria-current={active ? "page" : undefined}
      data-testid={testId}
      className={[
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[1.45rem] px-2 py-2.5 transition-all duration-150 active:scale-[0.985]",
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300/30",
        active
          ? emphasized
            ? "bg-slate-950 text-white border border-slate-950 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.88)]"
            : "bg-white text-slate-950 border border-white shadow-[0_16px_34px_-26px_rgba(15,23,42,0.5)]"
          : "text-slate-500 border border-transparent hover:text-slate-900 hover:bg-white/55",
      ].join(" ")}
    >
      <div
        className={[
          "flex h-9 w-9 items-center justify-center rounded-full transition-all duration-150",
          active && emphasized
            ? "bg-white/14"
            : active
            ? "bg-emerald-500/12"
            : "bg-transparent",
        ].join(" ")}
      >
        {icon}
      </div>
      <span className={active ? "text-[11px] font-black tracking-[-0.01em]" : "text-[11px] font-extrabold tracking-[-0.01em]"}>
        {label}
      </span>
    </button>
  );
}

export default function Navbar() {
  const { state, actions } = useAppStore();
  const currentView = state?.ui?.view || "dashboard";
  const navRef = useRef(null);

  const isHubView = ["more", "stats", "budgets", "categories", "recurring", "rules", "merchants"].includes(currentView);

  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;

    const updateHeight = () => {
      const height = Math.ceil(el.getBoundingClientRect().height || 0);
      if (height > 0) document.documentElement.style.setProperty("--app-nav-h", `${height + 8}px`);
    };

    updateHeight();

    let observer;
    try {
      observer = new ResizeObserver(() => updateHeight());
      observer.observe(el);
    } catch {
      // ignore
    }

    window.addEventListener("resize", updateHeight);
    return () => {
      window.removeEventListener("resize", updateHeight);
      observer?.disconnect?.();
    };
  }, []);

  return (
    <div className="app-navbar fixed inset-x-0 bottom-0 z-[40] px-4 pb-safe pointer-events-none">
      <div
        className="absolute inset-x-0 bottom-0 h-44 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, color-mix(in srgb, var(--bg) 97%, transparent), color-mix(in srgb, var(--bg) 80%, transparent) 42%, transparent)",
        }}
      />

      <nav ref={navRef} className="mx-auto w-full max-w-[40rem] pb-3 pointer-events-auto" aria-label="Bottom navigation">
        <div
          className="relative overflow-hidden rounded-[2rem] border border-white/55 px-2.5 py-2.5 shadow-[0_-16px_44px_-28px_rgba(15,23,42,0.42)]"
          style={{
            background: "var(--surface-strong)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-white/20 to-transparent" />
          <div className="relative flex items-end gap-1">
            <NavItem
              active={currentView === "dashboard"}
              onClick={() => actions.navigate("dashboard")}
              icon={<Home size={20} />}
              label="Today"
              testId="nav-today"
            />
            <NavItem
              active={currentView === "inbox"}
              onClick={() => actions.navigate("inbox")}
              icon={<Inbox size={20} />}
              label="Inbox"
              testId="nav-inbox"
            />
            <NavItem
              active={currentView === "add"}
              onClick={() => actions.startNewTransaction()}
              icon={<Camera size={22} />}
              label="Scan"
              emphasized
              testId="nav-scan"
            />
            <NavItem
              active={currentView === "accounts"}
              onClick={() => actions.navigate("accounts")}
              icon={<CreditCard size={20} />}
              label="Accounts"
              testId="nav-accounts"
            />
            <NavItem
              active={isHubView}
              onClick={() => actions.navigate("more")}
              icon={<MoreHorizontal size={20} />}
              label="Hub"
              testId="nav-hub"
            />
          </div>
        </div>
      </nav>
    </div>
  );
}
