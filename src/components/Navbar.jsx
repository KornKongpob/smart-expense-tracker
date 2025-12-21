// src/components/Navbar.jsx
import React from "react";
import { Plus, Home, Activity, CreditCard, MoreHorizontal } from "lucide-react";
import { useAppStore } from "../store/store.jsx";

export default function Navbar() {
  const { state, actions } = useAppStore();
  const currentView = state.ui.view;

  return (
    <div
      className="
        fixed z-50
        left-1/2 -translate-x-1/2
        bottom-0
        w-full max-w-md
        bg-white border-t border-gray-200
        px-4 py-2 pb-safe
        flex justify-between items-center
        shadow-[0_-4px_10px_-1px_rgba(0,0,0,0.05)]
      "
    >
      <button
        onClick={() => actions.navigate("dashboard")}
        className={`flex flex-col items-center w-16 p-1 rounded-xl transition-all ${
          currentView === "dashboard" ? "text-indigo-600 bg-indigo-50" : "text-gray-400 hover:text-gray-600"
        }`}
        type="button"
      >
        <Home size={24} />
        <span className="text-[10px] mt-1 font-medium">หน้าแรก</span>
      </button>

      <button
        onClick={() => actions.navigate("stats")}
        className={`flex flex-col items-center w-16 p-1 rounded-xl transition-all ${
          currentView === "stats" ? "text-indigo-600 bg-indigo-50" : "text-gray-400 hover:text-gray-600"
        }`}
        type="button"
      >
        <Activity size={24} />
        <span className="text-[10px] mt-1 font-medium">สรุปผล</span>
      </button>

      <button
        onClick={() => actions.startNewTransaction()}
        className="bg-gradient-to-tr from-indigo-600 to-purple-600 text-white rounded-full p-3 -mt-8 shadow-lg shadow-indigo-200 border-4 border-gray-50 active:scale-95 transition-all"
        aria-label="Add"
        type="button"
      >
        <Plus size={32} />
      </button>

      <button
        onClick={() => actions.navigate("accounts")}
        className={`flex flex-col items-center w-16 p-1 rounded-xl transition-all ${
          currentView === "accounts" ? "text-indigo-600 bg-indigo-50" : "text-gray-400 hover:text-gray-600"
        }`}
        type="button"
      >
        <CreditCard size={24} />
        <span className="text-[10px] mt-1 font-medium">บัญชี</span>
      </button>

      <button
        onClick={() => actions.navigate("more")}
        className={`flex flex-col items-center w-16 p-1 rounded-xl transition-all ${
          currentView === "more" ? "text-indigo-600 bg-indigo-50" : "text-gray-400 hover:text-gray-600"
        }`}
        type="button"
      >
        <MoreHorizontal size={24} />
        <span className="text-[10px] mt-1 font-medium">อื่นๆ</span>
      </button>
    </div>
  );
}
