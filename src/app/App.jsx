import React, { useState } from "react";

import DashboardView from "../views/DashboardView";
import AddTransactionView from "../views/AddTransactionView";
import StatsView from "../views/StatsView";
import AccountsView from "../views/AccountsView";
import CategoriesView from "../views/CategoriesView";
import MoreView from "../views/MoreView";
import BudgetsView from "../views/BudgetsView";
import RecurringView from "../views/RecurringView";

import Navbar from "../components/Navbar";
import ConfirmationModal from "../components/ConfirmationModal";
import { useAppStore } from "../store/store";

export default function App() {
  const { state } = useAppStore();

  const [modal, setModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    isDestructive: false,
    onConfirm: null,
  });

  const closeModal = () => setModal((m) => ({ ...m, isOpen: false }));

  const showAlert = (message) => {
    setModal({
      isOpen: true,
      title: "แจ้งเตือน",
      message,
      isDestructive: false,
      onConfirm: () => closeModal(),
    });
  };

  const showConfirm = (title, message, onConfirm, isDestructive = false) => {
    setModal({
      isOpen: true,
      title,
      message,
      isDestructive,
      onConfirm: async () => {
        try {
          await onConfirm?.();
        } finally {
          closeModal();
        }
      },
    });
  };

  const view = state.ui.view;

  return (
    <div className="min-h-dvh bg-gray-100">
      <div className="mx-auto max-w-[430px] min-h-dvh bg-gray-100 border-x border-gray-200 shadow-2xl relative overflow-hidden">
        {view === "dashboard" && <DashboardView />}
        {view === "add" && <AddTransactionView showAlert={showAlert} showConfirm={showConfirm} />}
        {view === "stats" && <StatsView />}
        {view === "accounts" && <AccountsView showAlert={showAlert} showConfirm={showConfirm} />}
        {view === "categories" && <CategoriesView showAlert={showAlert} showConfirm={showConfirm} />}
        {view === "budgets" && <BudgetsView showAlert={showAlert} showConfirm={showConfirm} />}
        {view === "recurring" && <RecurringView showAlert={showAlert} showConfirm={showConfirm} />}
        {view === "more" && <MoreView showAlert={showAlert} showConfirm={showConfirm} />}

        <ConfirmationModal
          isOpen={modal.isOpen}
          title={modal.title}
          message={modal.message}
          isDestructive={modal.isDestructive}
          onConfirm={() => modal.onConfirm?.()}
          onCancel={closeModal}
        />

        {view !== "add" && <Navbar />}
      </div>
    </div>
  );
}
