// src/app/App.jsx

import React, { useState } from 'react';

import DashboardView from '../views/DashboardView';
import AddTransactionView from '../views/AddTransactionView';
import StatsView from '../views/StatsView';
import AccountsView from '../views/AccountsView';
import CategoriesView from '../views/CategoriesView';
import MoreView from '../views/MoreView';

import Navbar from '../components/Navbar';
import ConfirmationModal from '../components/ConfirmationModal';

import { useAppStore } from '../store/store';

export default function App() {
  const { state } = useAppStore();

  const [modal, setModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    isDestructive: false,
    onConfirm: null,
  });

  const closeModal = () => {
    setModal((m) => ({
      ...m,
      isOpen: false,
      onConfirm: null,
    }));
  };

  const showAlert = (message) => {
    setModal({
      isOpen: true,
      title: 'แจ้งเตือน',
      message,
      isDestructive: false,
      onConfirm: async () => {
        closeModal();
      },
    });
  };

  // ✅ FIX: ปิด popup ทุกครั้งหลังยืนยัน (รองรับ async)
  const showConfirm = (title, message, onConfirm, isDestructive = false) => {
    setModal({
      isOpen: true,
      title,
      message,
      isDestructive,
      onConfirm: async () => {
        try {
          await Promise.resolve(onConfirm?.());
        } finally {
          closeModal(); // ✅ สำคัญ: ปิด popup เสมอ
        }
      },
    });
  };

  const view = state.ui.view;

  return (
    <div className="bg-gray-100 min-h-screen font-sans text-gray-900 max-w-md mx-auto shadow-2xl overflow-hidden relative border-x border-gray-200">
      {view === 'dashboard' && <DashboardView />}
      {view === 'add' && <AddTransactionView showAlert={showAlert} showConfirm={showConfirm} />}
      {view === 'stats' && <StatsView />}
      {view === 'accounts' && <AccountsView showAlert={showAlert} showConfirm={showConfirm} />}
      {view === 'categories' && <CategoriesView showAlert={showAlert} showConfirm={showConfirm} />}
      {view === 'more' && <MoreView showAlert={showAlert} showConfirm={showConfirm} />}

      <ConfirmationModal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        isDestructive={modal.isDestructive}
        onConfirm={modal.onConfirm}
        onCancel={closeModal}
      />

      {view !== 'add' && <Navbar />}
    </div>
  );
}
