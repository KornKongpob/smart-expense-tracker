import { AlertCircle } from "lucide-react";

export default function ConfirmationModal({ isOpen, title, message, onConfirm, onCancel, isDestructive }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <div className="flex items-start gap-3 mb-2">
          {isDestructive && (
            <div className="bg-red-100 p-2 rounded-full text-red-600">
              <AlertCircle size={24} />
            </div>
          )}
          <h3 className={`text-xl font-bold mt-1 ${isDestructive ? "text-red-600" : "text-gray-800"}`}>
            {title}
          </h3>
        </div>

        <p className="text-gray-600 mb-6 ml-1">{message}</p>

        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 text-gray-600 font-bold bg-gray-100 rounded-xl hover:bg-gray-200">
            ยกเลิก
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-3 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-transform ${
              isDestructive ? "bg-red-500 shadow-red-200" : "bg-indigo-600 shadow-indigo-200"
            }`}
          >
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  );
}
