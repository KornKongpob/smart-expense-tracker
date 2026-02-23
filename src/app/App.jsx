// src/app/App.jsx
import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/store.jsx";
import Navbar from "../components/Navbar";
import DashboardView from "../views/DashboardView";
import AddTransactionView from "../views/AddTransactionView";
import AccountsView from "../views/AccountsView";
import StatsView from "../views/StatsView";
import BudgetsView from "../views/BudgetsView";
import CategoriesView from "../views/CategoriesView";
import RecurringView from "../views/RecurringView";
import RulesView from "../views/RulesView";
import InboxView from "../views/InboxView";
import MerchantLibraryView from "../views/MerchantLibraryView";
import MoreView from "../views/MoreView";
import ConfirmationModal from "../components/ConfirmationModal";
import PinLockScreen from "../components/PinLockScreen.jsx";
import { X, CheckCircle2, AlertTriangle } from "lucide-react";

function AlertToast({ message, onClose }) {
  if (!message) return null;

  // very light heuristic: show success icon if contains success-ish words
  const msg = String(message || "");
  const lower = msg.toLowerCase();
  const isError = /error|ผิดพลาด|ไม่สำเร็จ|fail/.test(lower);
  const isSuccess = /สำเร็จ|เรียบร้อย|done|success/.test(lower);

  const toneClass = isError ? "ui-toast--error" : isSuccess ? "ui-toast--success" : "ui-toast--info";
  const Icon = isError ? AlertTriangle : CheckCircle2;

  return (
    <div className="fixed top-[calc(0.75rem+env(safe-area-inset-top))] z-[100] left-1/2 -translate-x-1/2 w-[min(92vw,420px)]">
      <div className={["ui-toast", toneClass, "flex items-start gap-3"].join(" ")}> 
        <div className="mt-0.5 shrink-0">
          <Icon size={18} className={isError ? "text-red-700" : isSuccess ? "text-emerald-700" : "text-indigo-700"} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-extrabold text-gray-900 break-words whitespace-pre-wrap">{msg}</div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="ui-icon-btn shrink-0"
          aria-label="close toast"
          title="ปิด"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

function ConfirmModal({ confirm, setConfirm }) {
  if (!confirm) return null;

  return (
    <ConfirmationModal
      isOpen={!!confirm}
      title={confirm.title}
      message={confirm.message}
      onConfirm={() => {
        confirm.onConfirm?.();
        setConfirm(null);
      }}
      onCancel={() => {
        setConfirm(null);
        confirm.onCancel?.();
      }}
      isDestructive={confirm.isDestructive}
      confirmText={confirm.confirmText || "ยืนยัน"}
      cancelText={confirm.cancelText || "ยกเลิก"}
    />
  );
}

export default function App() {
  const store = useAppStore();
  const { state } = store;

  const view = state?.ui?.view || "dashboard";

  // ---- Global alert / confirm (UI only) ----
  const [alert, setAlert] = useState("");
  const [confirm, setConfirm] = useState(null);

  const showAlert = (msg) => {
    const m = String(msg || "");
    setAlert(m);
    if (m) {
      window.clearTimeout(window.__toastTimer);
      window.__toastTimer = window.setTimeout(() => setAlert(""), 2400);
    }
  };

  const showConfirm = (title, message, onConfirm, isDestructive = false, opts = {}) => {
    setConfirm({
      title,
      message,
      onConfirm,
      isDestructive,
      confirmText: opts?.confirmText,
      cancelText: opts?.cancelText,
      onCancel: opts?.onCancel,
    });
  };

  // ---- PIN Lock: If PIN saved, show lock screen before app ----
  const PIN_KEY = "privacy_pin_6";
  const savedPin = useMemo(() => {
    try {
      return localStorage.getItem(PIN_KEY) || "";
    } catch {
      return "";
    }
  }, []);

  const [isUnlocked, setIsUnlocked] = useState(() => !savedPin);

  // If PIN is removed in another tab, unlock.
  useEffect(() => {
    const onStorage = () => {
      try {
        const v = localStorage.getItem(PIN_KEY) || "";
        if (!v) setIsUnlocked(true);
      } catch {
        // ignore
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (!isUnlocked && savedPin) {
    return (
      <PinLockScreen
        savedPin={savedPin}
        title="ปลดล็อก (PIN)"
        onUnlocked={() => setIsUnlocked(true)}
      />
    );
  }

  // ---- Views map ----
  const renderView = () => {
    switch (view) {
      case "dashboard":
        return <DashboardView showAlert={showAlert} showConfirm={showConfirm} />;
      case "add":
        return <AddTransactionView showAlert={showAlert} showConfirm={showConfirm} />;
      case "accounts":
        return <AccountsView showAlert={showAlert} showConfirm={showConfirm} />;
      case "stats":
        return <StatsView showAlert={showAlert} showConfirm={showConfirm} />;
      case "budgets":
        return <BudgetsView showAlert={showAlert} showConfirm={showConfirm} />;
      case "categories":
        return <CategoriesView showAlert={showAlert} showConfirm={showConfirm} />;
      case "recurring":
        return <RecurringView showAlert={showAlert} showConfirm={showConfirm} />;
      case "rules":
        return <RulesView showAlert={showAlert} showConfirm={showConfirm} />;
      case "inbox":
        return <InboxView showAlert={showAlert} showConfirm={showConfirm} />;
      case "merchants":
        return <MerchantLibraryView showAlert={showAlert} showConfirm={showConfirm} />;
      case "more":
        return <MoreView showAlert={showAlert} showConfirm={showConfirm} />;
      default:
        return <DashboardView showAlert={showAlert} showConfirm={showConfirm} />;
    }
  };

  const showNavbar = view !== "add"; // FAB view uses custom header

  return (
    <div className={showNavbar ? "pb-nav" : "pb-safe"}>
      <AlertToast message={alert} onClose={() => setAlert("")} />
      <ConfirmModal confirm={confirm} setConfirm={setConfirm} />

      {renderView()}

      {showNavbar ? <Navbar /> : null}
    </div>
  );
}
