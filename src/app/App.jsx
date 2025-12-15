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

  const showAlert = (message) => {
    setModal({
      isOpen: true,
      title: 'แจ้งเตือน',
      message,
      isDestructive: false,
      onConfirm: () => setModal((m) => ({ ...m, isOpen: false })),
    });
  };

  const showConfirm = (title, message, onConfirm, isDestructive = false) => {
    setModal({ isOpen: true, title, message, onConfirm, isDestructive });
  };

  const closeModal = () => setModal((m) => ({ ...m, isOpen: false }));

  const view = state.ui.view;

  return (
    <div className="min-h-dvh bg-gray-100 font-sans text-gray-900">
      {/* ✅ FIX: ไม่ใช้ overflow-hidden (จะตัด/ทำ scroll เพี้ยนบนมือถือ)
          และใช้ min-h-dvh แทน min-h-screen */}
      <div className="max-w-md mx-auto min-h-dvh bg-gray-100 border-x border-gray-200 shadow-2xl relative overflow-x-hidden">
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
          onConfirm={() => modal.onConfirm?.()}
          onCancel={closeModal}
        />

        {view !== 'add' && <Navbar />}
      </div>
    </div>
  );
}
