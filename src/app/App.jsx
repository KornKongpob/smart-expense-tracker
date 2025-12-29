// src/app/App.jsx
import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useAppStore } from "../store/store";

// ✅ Use single navbar source
import Navbar from "../components/Navbar.jsx";

import DashboardView from "../views/DashboardView.jsx";
import AddTransactionView from "../views/AddTransactionView.jsx";
import AccountsView from "../views/AccountsView.jsx";
import StatsView from "../views/StatsView.jsx";
import MoreView from "../views/MoreView.jsx";
import CategoriesView from "../views/CategoriesView.jsx";
import BudgetsView from "../views/BudgetsView.jsx";
import RecurringView from "../views/RecurringView.jsx";
import InboxView from "../views/InboxView.jsx";
import RulesView from "../views/RulesView.jsx";
import MerchantLibraryView from "../views/MerchantLibraryView.jsx";

/**
 * UI spacing for fixed bottom navbar
 * - Navbar is fixed + has "bottom-3" + padding + safe area
 * - If content has buttons at the bottom (especially forms), it may be covered.
 * - We add app-level padding to guarantee clickability.
 *
 * Note: Many views already use pb-28, but app-level padding makes it consistent
 * and prevents "some screens forgot pb-xx" bugs.
 */
const NAV_SAFE_PAD_CLASS = "pb-[calc(7rem+env(safe-area-inset-bottom))]"; // ~112px + safe-area

function AlertToast({ text, onClose, showNavbar }) {
  if (!text) return null;

  // If navbar is visible, keep toast above it a bit more
  const bottomClass = showNavbar ? "bottom-28" : "bottom-6";

  return (
    <div className={`fixed left-4 right-4 ${bottomClass} z-[95]`}>
      <div
        className="
          rounded-2xl px-4 py-3
          bg-white/20 backdrop-blur-xl
          border border-white/30
          shadow-[0_14px_30px_-18px_rgba(0,0,0,0.55)]
          flex items-center justify-between gap-3
        "
      >
        <div className="text-sm font-extrabold text-gray-900 min-w-0 truncate">{text}</div>
        <button
          type="button"
          onClick={onClose}
          className="
            px-3 py-1 rounded-xl
            bg-white/25 border border-white/30
            text-xs font-extrabold text-gray-900
            active:scale-95
          "
        >
          OK
        </button>
      </div>
    </div>
  );
}

function ConfirmModal({ open, title, message, danger, onCancel, onConfirm }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4">
      {/* overlay */}
      <button
        type="button"
        aria-label="close confirm overlay"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onCancel}
      />

      <div
        className="
          relative w-full sm:max-w-sm
          rounded-3xl p-5
          bg-white/22 backdrop-blur-2xl
          border border-white/30
          shadow-[0_22px_60px_-32px_rgba(0,0,0,0.65)]
        "
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={`text-lg font-extrabold ${danger ? "text-red-700" : "text-gray-900"}`}>
              {title || "ยืนยัน"}
            </div>
            <div className="text-sm text-gray-800/75 mt-2 whitespace-pre-wrap">{message || ""}</div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="
              w-10 h-10 rounded-full
              bg-white/25 border border-white/30
              text-gray-700 flex items-center justify-center
              active:scale-95
            "
            aria-label="close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="
              flex-1 py-3 rounded-2xl
              bg-white/20 border border-white/30
              font-extrabold text-gray-800
              active:scale-95
            "
          >
            ยกเลิก
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className={`
              flex-1 py-3 rounded-2xl font-extrabold text-white active:scale-95
              shadow-[0_18px_34px_-22px_rgba(0,0,0,0.7)]
              ${danger ? "bg-red-600/90" : "bg-gray-900/90"}
            `}
          >
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const store = useAppStore();
  const { state } = store;

  // ===== alert / confirm API for views =====
  const [alertText, setAlertText] = useState("");
  const [confirm, setConfirm] = useState({
    open: false,
    title: "",
    message: "",
    danger: false,
    onConfirm: null,
  });

  const showAlert = (text) => {
    setAlertText(String(text || ""));
    window.clearTimeout(showAlert._t);
    showAlert._t = window.setTimeout(() => setAlertText(""), 2500);
  };

  const showConfirm = (title, message, onConfirm, danger = false) => {
    setConfirm({
      open: true,
      title: String(title || "ยืนยัน"),
      message: String(message || ""),
      danger: !!danger,
      onConfirm: typeof onConfirm === "function" ? onConfirm : null,
    });
  };

  const closeConfirm = () => setConfirm((c) => ({ ...c, open: false }));

  const view = state?.ui?.view || "dashboard";

  const content = useMemo(() => {
    switch (view) {
      case "dashboard":
        return <DashboardView />;

      case "add":
        return <AddTransactionView showAlert={showAlert} showConfirm={showConfirm} />;

      case "accounts":
        return <AccountsView showAlert={showAlert} showConfirm={showConfirm} />;

      case "stats":
        return <StatsView />;

      case "more":
        return <MoreView showAlert={showAlert} showConfirm={showConfirm} />;

      case "categories":
        return <CategoriesView showAlert={showAlert} showConfirm={showConfirm} />;

      case "budgets":
        return <BudgetsView showAlert={showAlert} showConfirm={showConfirm} />;

      case "recurring":
        return <RecurringView showAlert={showAlert} showConfirm={showConfirm} />;

      case "inbox":
        return <InboxView showAlert={showAlert} showConfirm={showConfirm} />;

      case "rules":
        return <RulesView showAlert={showAlert} showConfirm={showConfirm} />;

      case "merchants":
        return <MerchantLibraryView showAlert={showAlert} showConfirm={showConfirm} />;

      default:
        return <DashboardView />;
    }
  }, [view]);

  /**
   * ✅ ซ่อน Navbar ในหน้าที่เสี่ยงชนปุ่ม/ฟอร์ม:
   * - add: หน้ากรอก/บันทึกรายการ
   * - categories/budgets/recurring: หน้าตั้งค่าลึก + มักมี modal/bottom actions
   */
  const showNavbar = !["categories", "budgets", "recurring", "rules", "merchants", "add"].includes(view);

  /**
   * ✅ Critical fix: Reserve space for fixed navbar so it won't block clicks.
   * Even if some views forget pb-xx, the App shell still protects UI.
   */
  const shellPadClass = showNavbar ? NAV_SAFE_PAD_CLASS : "pb-safe";

  return (
    <div className={`min-h-dvh ${shellPadClass}`}>
      {/* App background (glass feel)
          - body already has a glassy gradient; this layer adds soft blobs on top
          - pointer-events-none so it never blocks clicks */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/70 via-white/40 to-purple-50/70" />
        <div className="absolute -top-28 -right-28 w-80 h-80 rounded-full bg-indigo-300/18 blur-3xl" />
        <div className="absolute -bottom-28 -left-28 w-80 h-80 rounded-full bg-purple-300/16 blur-3xl" />
        <div className="absolute inset-0 bg-white/20" />
      </div>

      <div className="mx-auto max-w-[520px] min-h-dvh relative">
        {/* ✅ Content */}
        {content}

        {/* ✅ Single Navbar (avoid multiple nav layers / z-index conflicts) */}
        {showNavbar ? <Navbar /> : null}

        {/* Toast */}
        <AlertToast text={alertText} onClose={() => setAlertText("")} showNavbar={showNavbar} />

        {/* Confirm */}
        <ConfirmModal
          open={confirm.open}
          title={confirm.title}
          message={confirm.message}
          danger={confirm.danger}
          onCancel={closeConfirm}
          onConfirm={() => {
            try {
              confirm.onConfirm?.();
            } finally {
              closeConfirm();
            }
          }}
        />
      </div>
    </div>
  );
}
