// src/app/App.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/store.jsx";
import { useUndo } from "../utils/useUndo";
import { parseHash, replaceHash } from "../utils/hashRouter";
import { checkBudgetAndNotify } from "../utils/budgetNotifications";
import { formatCurrency } from "../utils/format";
import { getBudget, toMonthKey } from "../store/selectors.js";
import { sumExpenseForMonth } from "../utils/transaction";
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
import OnboardingScreen from "../components/OnboardingScreen.jsx";
import QuickAddSheet from "../components/QuickAddSheet.jsx";
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
  const initialHash = typeof window === "undefined" ? "" : window.location.hash;
  const initialHashRef = useRef(initialHash);
  const skipInitialHashSyncRef = useRef(!!initialHash);

  // ---- Keyboard (mobile) guard ----
  // Hide bottom navbar while the on-screen keyboard is open (prevents overlap with inputs),
  // and expose the keyboard inset as a CSS variable for fixed buttons.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  useEffect(() => {
    // Default
    try {
      document.documentElement.style.setProperty("--keyboard-inset", "0px");
    } catch {
      // ignore
    }

    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const inset = Math.max(0, (window.innerHeight || 0) - (vv.height || 0));
      try {
        document.documentElement.style.setProperty("--keyboard-inset", `${inset}px`);
      } catch {
        // ignore
      }
      // threshold: keyboard usually takes > 200px on phones, but keep it conservative
      setKeyboardOpen(inset > 120);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);


  // ---- Hash router: sync URL ↔ view ----
  useEffect(() => {
    const initialHash = initialHashRef.current;
    if (initialHash) {
      const { view: hashView } = parseHash(initialHash);
      if (hashView !== view) {
        store.navigate(hashView);
        return;
      }
    }
    replaceHash(view);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onHashChange = () => {
      const { view: hashView } = parseHash(window.location.hash);
      if (hashView !== (state?.ui?.view || "dashboard")) {
        store.navigate(hashView);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [state?.ui?.view, store]);

  // Keep hash in sync when view changes programmatically
  useEffect(() => {
    if (skipInitialHashSyncRef.current) {
      skipInitialHashSyncRef.current = false;
      const { view: hashView } = parseHash(initialHashRef.current);
      if (hashView !== view) return;
    }
    replaceHash(view);
  }, [view]);

  // ---- Global alert / confirm (UI only) ----
  const [alert, setAlert] = useState("");
  const [confirm, setConfirm] = useState(null);

  // ---- Undo system ----
  const handleUndoRestore = useCallback((items) => {
    if (!items?.length) return;
    store.bulkUpsertTransactions(items, { navigateToDashboard: false });
  }, [store]);

  const { undoItem, performUndo, clearUndo } = useUndo({ onRestore: handleUndoRestore });

  // ---- Budget notifications (check after transactions change) ----
  useEffect(() => {
    try {
      const monthKey = toMonthKey(new Date());
      const monthSpent = sumExpenseForMonth(state.transactions || [], monthKey);
      const budget = getBudget(state.budgets || [], monthKey, "__TOTAL__");
      const limit = Number(budget?.limit || 0);
      const alertPct = Number(budget?.alertPct || 90);
      if (limit > 0) {
        checkBudgetAndNotify({ monthSpent, monthlyLimit: limit, alertPct, monthKey, formatCurrency });
      }
    } catch {
      // ignore
    }
  }, [state.transactions, state.budgets]);

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

  // ---- Onboarding (must declare hooks before any conditional return) ----
  const ONBOARDING_KEY = "onboarding_done_v1";
  const [onboardingDone, setOnboardingDone] = useState(() => {
    try {
      return !!localStorage.getItem(ONBOARDING_KEY);
    } catch {
      return false;
    }
  });

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

  // ---- Onboarding: show for first-time users ----
  const hasTx = (state.transactions || []).length > 0;

  if (!onboardingDone && !hasTx) {
    return (
      <OnboardingScreen
        onComplete={({ monthlyBudget }) => {
          try {
            localStorage.setItem(ONBOARDING_KEY, "1");
          } catch {
            // ignore
          }
          setOnboardingDone(true);

          // If user set a budget, save it
          if (monthlyBudget > 0 && store.upsertBudget) {
            const now = new Date();
            const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
            store.upsertBudget({ month, categoryId: "__TOTAL__", limit: monthlyBudget, alertPct: 90 });
          }
        }}
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

  const reserveNavSpace = view !== "add";
  const showNavbar = reserveNavSpace && !keyboardOpen; // hide while keyboard is open

  return (
    <div className={reserveNavSpace ? "pb-nav" : "pb-safe"}>
      <AlertToast message={alert} onClose={() => setAlert("")} />
      <ConfirmModal confirm={confirm} setConfirm={setConfirm} />

      {/* Undo toast */}
      {undoItem && (
        <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[90] left-1/2 -translate-x-1/2 w-[min(92vw,420px)] animate-fade-in-up">
          <div className="ui-toast flex items-center justify-between gap-3">
            <span className="text-sm font-extrabold text-gray-900 truncate">{undoItem.label}</span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={performUndo}
                className="px-3 py-1.5 rounded-xl text-xs font-black text-indigo-700 bg-indigo-600/15 border border-indigo-600/20 active:scale-95 transition-transform"
              >
                เลิกทำ
              </button>
              <button
                type="button"
                onClick={clearUndo}
                className="p-1.5 rounded-full text-gray-500 hover:text-gray-700"
                aria-label="dismiss"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      <div key={view} className="animate-view-enter">
        {renderView()}
      </div>

      {showNavbar ? <Navbar onFabPress={() => setQuickAddOpen(true)} /> : null}

      <QuickAddSheet isOpen={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    </div>
  );
}
