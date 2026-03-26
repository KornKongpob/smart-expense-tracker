// src/components/Navbar.jsx
import React, { useLayoutEffect, useRef } from "react";
import { Camera, CreditCard, Home, Inbox, MoreHorizontal } from "lucide-react";
import { useAppStore } from "../store/store.jsx";

function NavItem({ active, icon, label, onClick, testId }) {
  return (
    <button
      onClick={onClick}
      type="button"
      aria-current={active ? "page" : undefined}
      data-testid={testId}
      className={[
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-1.5 transition-colors duration-100",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40 focus-visible:ring-offset-1 rounded-lg",
        active ? "text-teal-600" : "text-slate-400 hover:text-slate-600",
      ].join(" ")}
    >
      {icon}
      <span className="text-[11px] font-medium leading-none">
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
      if (height > 0) document.documentElement.style.setProperty("--app-nav-h", `${height}px`);
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
    <nav
      ref={navRef}
      className="app-navbar fixed inset-x-0 bottom-0 z-[35] border-t bg-white"
      style={{
        borderColor: "var(--border)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      aria-label="Bottom navigation"
    >
      <div className="mx-auto flex max-w-lg items-stretch">
        <NavItem
          active={currentView === "dashboard"}
          onClick={() => actions.navigate("dashboard")}
          icon={<Home size={20} />}
          label="หน้าหลัก"
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
          label="สแกน"
          testId="nav-scan"
        />
        <NavItem
          active={currentView === "accounts"}
          onClick={() => actions.navigate("accounts")}
          icon={<CreditCard size={20} />}
          label="บัญชี"
          testId="nav-accounts"
        />
        <NavItem
          active={isHubView}
          onClick={() => actions.navigate("more")}
          icon={<MoreHorizontal size={20} />}
          label="อื่นๆ"
          testId="nav-hub"
        />
      </div>
    </nav>
  );
}
