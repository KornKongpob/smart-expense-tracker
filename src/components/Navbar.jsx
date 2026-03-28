import React, { useLayoutEffect, useRef } from "react";
import { Camera, CreditCard, Home, Inbox, MoreHorizontal } from "lucide-react";
import { useAppStore } from "../store/store.jsx";

function NavItem({ active, icon, label, onClick, testId, primary = false }) {
  return (
    <button
      onClick={onClick}
      type="button"
      aria-current={active ? "page" : undefined}
      data-testid={testId}
      className={[
        "app-nav-item rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/35 focus-visible:ring-offset-1",
        active ? "app-nav-item--active" : "",
        primary ? "app-nav-item--primary" : "",
      ].join(" ")}
    >
      <span className="app-nav-icon">{icon}</span>
      <span className="truncate text-[11px] font-semibold leading-none">{label}</span>
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
      className="app-navbar fixed inset-x-0 bottom-0 z-[35] px-3 sm:px-5"
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom) + 0.9rem)",
      }}
      aria-label="Bottom navigation"
    >
      <div className="app-nav-surface mx-auto max-w-[430px] p-2">
        <div className="grid grid-cols-5 items-stretch gap-1">
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
            primary
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
      </div>
    </nav>
  );
}
