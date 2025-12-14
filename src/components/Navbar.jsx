import { Home, Activity, Plus, CreditCard, MoreHorizontal } from 'lucide-react'

export default function Navbar({ currentView, onNavigate }) {
  return (
    <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 pb-safe px-4 py-2 flex justify-between items-center z-50 shadow-[0_-4px_10px_-1px_rgba(0,0,0,0.05)]">
      <NavBtn active={currentView === 'dashboard'} onClick={() => onNavigate('dashboard')} icon={<Home size={24} />} label="หน้าแรก" />
      <NavBtn active={currentView === 'stats'} onClick={() => onNavigate('stats')} icon={<Activity size={24} />} label="สรุปผล" />

      <button
        onClick={() => onNavigate('add')}
        className="bg-gradient-to-tr from-indigo-600 to-purple-600 text-white rounded-full p-3 -mt-8 shadow-lg shadow-indigo-200 border-4 border-gray-50 active:scale-95 transition-all hover:shadow-xl hover:-translate-y-1"
      >
        <Plus size={32} />
      </button>

      <NavBtn active={currentView === 'accounts'} onClick={() => onNavigate('accounts')} icon={<CreditCard size={24} />} label="บัญชี" />
      <NavBtn active={currentView === 'more'} onClick={() => onNavigate('more')} icon={<MoreHorizontal size={24} />} label="อื่นๆ" />
    </div>
  )
}

function NavBtn({ active, icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center w-16 p-1 rounded-xl transition-all ${
        active ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:text-gray-600'
      }`}
    >
      {icon}
      <span className="text-[10px] mt-1 font-medium">{label}</span>
    </button>
  )
}
