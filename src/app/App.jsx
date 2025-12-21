// src/app/App.jsx
import React, { useMemo, useState } from "react";
import { Home, PlusCircle, Wallet, BarChart3, MoreHorizontal } from "lucide-react";
import { useAppStore } from "../store/store";

import DashboardView from "../views/DashboardView.jsx";
import AddTransactionView from "../views/AddTransactionView.jsx";
import AccountsView from "../views/AccountsView.jsx";
import StatsView from "../views/StatsView.jsx";
import MoreView from "../views/MoreView.jsx";
import CategoriesView from "../views/CategoriesView.jsx";
import BudgetsView from "../views/BudgetsView.jsx";
import RecurringView from "../views/RecurringView.jsx";

function AlertToast({ text, onClose }) {
  if (!text) return null;
  return (
    <div className="fixed left-4 right-4 bottom-24 z-[80]">
      <div className="bg-gray-900 text-white rounded-2xl px-4 py-3 shadow-xl flex items-center justify-between gap-3">
        <div className="text-sm font-bold min-w-0 truncate">{text}</div>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 rounded-xl bg-white/10 text-xs font-extrabold active:scale-95"
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
    <div className="fixed inset-0 bg-black/50 z-[90] flex items-end sm:items-center justify-center p-4">
      <div className="w-full sm:max-w-sm bg-white rounded-3xl p-5 shadow-xl">
        <div className="text-lg font-extrabold text-gray-900">{title || "ยืนยัน"}</div>
        <div className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{message || ""}</div>

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 rounded-2xl bg-gray-100 font-extrabold text-gray-700"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-3 rounded-2xl font-extrabold text-white active:scale-95 ${
              danger ? "bg-red-600" : "bg-gray-900"
            }`}
          >
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  );
}

function BottomNav({ current, onGo, onAdd }) {
  const items = [
    { id: "dashboard", label: "Home", icon: <Home size={18} /> },
    { id: "accounts", label: "Accounts", icon: <Wallet size={18} /> },
    { id: "add", label: "Add", icon: <PlusCircle size={20} />, isAdd: true },
    { id: "stats", label: "Stats", icon: <BarChart3 size={18} /> },
    { id: "more", label: "More", icon: <MoreHorizontal size={18} /> },
  ];

  return (
    <div className="fixed left-0 right-0 bottom-0 z-[70] pb-safe">
      <div className="mx-auto max-w-[520px] px-4 pb-3">
        <div className="bg-white border border-gray-200 shadow-xl rounded-3xl p-2 flex items-center justify-between">
          {items.map((it) => {
            const active = current === it.id || (it.id !== "add" && current === it.id);
            if (it.isAdd) {
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={onAdd}
                  className="w-14 h-14 rounded-2xl bg-gray-900 text-white flex items-center justify-center shadow-lg active:scale-95 -mt-6"
                  aria-label="add"
                >
                  {it.icon}
                </button>
              );
            }

            return (
              <button
                key={it.id}
                type="button"
                onClick={() => onGo(it.id)}
                className={`flex-1 py-2 rounded-2xl flex flex-col items-center justify-center gap-1 active:scale-95 ${
                  active ? "text-gray-900" : "text-gray-400"
                }`}
              >
                {it.icon}
                <div className={`text-[10px] font-extrabold ${active ? "text-gray-900" : "text-gray-400"}`}>
                  {it.label}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const store = useAppStore();
  const { state, navigate, startNewTransaction } = store;

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
    // auto clear after a bit
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

      default:
        // fallback safe
        return <DashboardView />;
    }
  }, [view]);

  const showBottomNav = !["categories", "budgets", "recurring"].includes(view);

  return (
    <div className="mx-auto max-w-[520px] min-h-dvh bg-gray-50">
      {content}

      {showBottomNav ? (
        <BottomNav
          current={view}
          onGo={(v) => navigate(v)}
          onAdd={() => startNewTransaction()}
        />
      ) : null}

      <AlertToast text={alertText} onClose={() => setAlertText("")} />

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
  );
}
