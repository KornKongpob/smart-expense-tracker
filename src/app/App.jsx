// src/app/App.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { useAppStore } from "../store/store";
import { STORAGE_SAVE_ERROR_EVENT } from "../services/storage";

// ✅ Single navbar source
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

// 🔒 Privacy PIN Lock
import PinLockScreen from "../components/PinLockScreen.jsx";

/**
 * UI spacing for fixed bottom navbar
 * - Navbar is fixed + has safe-area padding
 * - Some screens have bottom actions; this prevents the navbar from blocking clicks.
 */
const NAV_SAFE_PAD_CLASS = "pb-[calc(7rem+env(safe-area-inset-bottom))]"; // ~112px + safe-area

const PIN_STORAGE_KEY = "privacy_pin";

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
            className={
              `flex-1 py-3 rounded-2xl font-extrabold text-white active:scale-95 ` +
              `shadow-[0_18px_34px_-22px_rgba(0,0,0,0.7)] ` +
              (danger ? "bg-red-600/90" : "bg-gray-900/90")
            }
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

  // Keep latest navigate in a ref so global event listeners don't need re-binding.
  const navigateRef = useRef(null);
  useEffect(() => {
    navigateRef.current = store?.navigate || null;
  }, [store?.navigate]);

  // ===== Privacy PIN Lock =====
  const [savedPin, setSavedPin] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const read = () => {
      try {
        setSavedPin(String(window.localStorage.getItem(PIN_STORAGE_KEY) || ""));
      } catch {
        setSavedPin("");
      }
    };

    read();
    const onStorage = (e) => {
      if (!e || e.key === PIN_STORAGE_KEY) read();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const needsLock = /^[0-9]{6}$/.test(String(savedPin || ""));
  useEffect(() => {
    // If no PIN is configured, app is always accessible.
    if (!needsLock) setIsUnlocked(true);
  }, [needsLock]);

  // ===== alert / confirm API for views =====
  const [alertText, setAlertText] = useState("");
  const [confirm, setConfirm] = useState({
    open: false,
    title: "",
    message: "",
    danger: false,
    onConfirm: null,
  });

  const alertTimerRef = useRef(null);
  useEffect(() => {
    return () => {
      if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
    };
  }, []);

  const showAlert = useCallback((text) => {
    if (typeof window === "undefined") return;
    setAlertText(String(text || ""));
    if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
    alertTimerRef.current = window.setTimeout(() => setAlertText(""), 2500);
  }, []);

  const showConfirm = useCallback((title, message, onConfirm, danger = false) => {
    setConfirm({
      open: true,
      title: String(title || "ยืนยัน"),
      message: String(message || ""),
      danger: !!danger,
      onConfirm: typeof onConfirm === "function" ? onConfirm : null,
    });
  }, []);

  const closeConfirm = useCallback(() => setConfirm((c) => ({ ...c, open: false })), []);

  // ✅ Warn user when LocalStorage saving fails (usually quota exceeded)
  const storageErrorShownAtRef = useRef(0);
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onStorageSaveError = (ev) => {
      const now = Date.now();
      if (now - storageErrorShownAtRef.current < 30000) return; // throttle
      storageErrorShownAtRef.current = now;

      const bytes = Number(ev?.detail?.approxBytes || 0) || 0;
      const mb = bytes ? (bytes / 1024 / 1024).toFixed(2) : "";
      const sizeHint = mb ? `\n\nขนาด payload ล่าสุด ~${mb}MB` : "";

      showConfirm(
        "พื้นที่จัดเก็บเต็ม: บันทึกข้อมูลไม่สำเร็จ",
        `ระบบไม่สามารถบันทึกข้อมูลลงเครื่องได้ (LocalStorage อาจเกินโควต้า ~5MB)${sizeHint}\n\nแนะนำ:\n1) ไปที่ More → Export Backup ทันที\n2) ลบรายการ/รูปที่ไม่จำเป็น (รูปภาพกินพื้นที่มาก)\n3) หากยังไม่หาย ลองเปิดด้วย Browser อื่น หรือเคลียร์พื้นที่เก็บข้อมูล`,
        () => {
          try {
            navigateRef.current?.("more");
          } catch {
            // ignore
          }
        },
        true
      );
    };

    window.addEventListener(STORAGE_SAVE_ERROR_EVENT, onStorageSaveError);
    return () => window.removeEventListener(STORAGE_SAVE_ERROR_EVENT, onStorageSaveError);
  }, [showConfirm]);

  const view = state?.ui?.view || "dashboard";

  // 🔒 Lock gate (all hooks executed above)
  if (needsLock && !isUnlocked) {
    return <PinLockScreen savedPin={savedPin} title="Privacy Lock" onUnlocked={() => setIsUnlocked(true)} />;
  }

  const showNavbar = !["categories", "budgets", "recurring", "rules", "merchants", "add"].includes(view);
  const shellPadClass = showNavbar ? NAV_SAFE_PAD_CLASS : "pb-safe";

  const content = (() => {
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
  })();

  return (
    <div className={`min-h-dvh ${shellPadClass}`}>
      {/* App background layer (pointer-events-none so it never blocks clicks) */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/70 via-white/40 to-purple-50/70" />
        <div className="absolute -top-28 -right-28 w-80 h-80 rounded-full bg-indigo-300/18 blur-3xl" />
        <div className="absolute -bottom-28 -left-28 w-80 h-80 rounded-full bg-purple-300/16 blur-3xl" />
        <div className="absolute inset-0 bg-white/20" />
      </div>

      <div className="mx-auto max-w-[520px] min-h-dvh relative">
        {content}

        {showNavbar ? <Navbar /> : null}

        <AlertToast text={alertText} onClose={() => setAlertText("")} showNavbar={showNavbar} />

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
