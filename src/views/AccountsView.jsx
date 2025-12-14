import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { ACCOUNT_COLORS, ACCOUNT_ICONS } from '../constants/presets.jsx'
import { calcAccountBalance } from '../store/selectors'
import { formatCurrency } from '../utils/format'

export default function AccountsView({ state, onAdd, onDelete, showAlert, showConfirm }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('cash')
  const [color, setColor] = useState(ACCOUNT_COLORS[0])

  const create = () => {
    if (!name.trim()) return showAlert('ใส่ชื่อบัญชี')
    onAdd({ name: name.trim(), type, color })
    setName('')
    setOpen(false)
  }

  const del = (id) => {
    if (state.accounts.length <= 1) return showAlert('ต้องมีอย่างน้อย 1 บัญชี')
    showConfirm('ลบบัญชี', 'ยืนยันลบบัญชี? รายการที่เกี่ยวข้องจะหายไป', () => onDelete(id), true)
  }

  return (
    <div className="pb-28 pt-6 px-4 min-h-dvh">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">บัญชีของฉัน</h1>
          <p className="text-gray-500 text-sm">จัดการบัญชีการเงิน</p>
        </div>
        <button onClick={() => setOpen(true)} className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-lg">
          <Plus size={20} />
        </button>
      </header>

      <div className="space-y-4">
        {state.accounts.map(acc => {
          const bal = calcAccountBalance(state.transactions, acc.id)
          const iconObj = ACCOUNT_ICONS.find(i => i.id === acc.type) || ACCOUNT_ICONS[0]
          return (
            <div key={acc.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full" style={{ backgroundColor: acc.color }} />
              <div className="flex justify-between items-center pl-3">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-white shrink-0" style={{ backgroundColor: acc.color }}>
                    {iconObj.icon}
                  </div>
                  <div className="truncate">
                    <h3 className="font-bold text-gray-800 text-lg truncate">{acc.name}</h3>
                    <p className="text-gray-400 text-xs">{iconObj.name}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-gray-400 mb-1">ยอดคงเหลือ</p>
                    <p className={`text-lg font-bold ${bal >= 0 ? 'text-gray-800' : 'text-red-500'}`}>{formatCurrency(bal)}</p>
                  </div>

                  {state.accounts.length > 1 && (
                    <button onClick={() => del(acc.id)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full ml-1">
                      <Trash2 size={20} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {open ? (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm animate-fade-in-up max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">เพิ่มบัญชีใหม่</h3>

            <label className="text-xs font-bold text-gray-500 mb-1 block">ชื่อบัญชี</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg p-3 outline-indigo-500 mb-4"
              placeholder="เช่น เงินเก็บ, กระเป๋าหลัก" />

            <label className="text-xs font-bold text-gray-500 mb-2 block">เลือกไอคอน</label>
            <div className="grid grid-cols-5 gap-2 mb-4">
              {ACCOUNT_ICONS.map(t => (
                <button key={t.id} onClick={() => setType(t.id)}
                  className={`aspect-square rounded-lg border flex items-center justify-center transition-all ${
                    type === t.id ? 'border-indigo-600 bg-indigo-50 text-indigo-600 ring-1 ring-indigo-600' : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                  }`}
                  title={t.name}>
                  {t.icon}
                </button>
              ))}
            </div>

            <label className="text-xs font-bold text-gray-500 mb-2 block">สี</label>
            <div className="flex gap-2 justify-center flex-wrap mb-6">
              {ACCOUNT_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 ${color === c ? 'border-gray-400 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setOpen(false)} className="flex-1 py-3 text-gray-500 font-bold bg-gray-100 rounded-xl">ยกเลิก</button>
              <button onClick={create} className="flex-1 py-3 text-white font-bold bg-indigo-600 rounded-xl shadow-lg shadow-indigo-200">สร้างบัญชี</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
