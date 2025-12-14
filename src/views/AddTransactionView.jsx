import { useMemo, useState } from 'react'
import { ArrowLeftRight, Calendar, Check, ChevronRight, Edit2, FileText, Plus, Trash2, X } from 'lucide-react'
import { toISODate } from '../utils/format'
import { generateTransferId } from '../utils/id'

export default function AddTransactionView({ state, editingTx, onCancel, onSaveTx, onDeleteTx, onBulkAdd, showAlert, showConfirm }) {
  const isEdit = !!editingTx

  const [mode, setMode] = useState(isEdit ? editingTx.type : 'expense') // expense | income | transfer
  const [amount, setAmount] = useState(isEdit ? String(editingTx.amount) : '')
  const [category, setCategory] = useState(isEdit ? (editingTx.category || '') : '')
  const [accountId, setAccountId] = useState(isEdit ? editingTx.accountId : (state.accounts[0]?.id || ''))
  const [date, setDate] = useState(isEdit ? String(editingTx.date).slice(0, 10) : toISODate())
  const [note, setNote] = useState(isEdit ? (editingTx.note || '') : '')

  // Transfer fields
  const [fromAcc, setFromAcc] = useState(state.accounts[0]?.id || '')
  const [toAcc, setToAcc] = useState(state.accounts[1]?.id || state.accounts[0]?.id || '')

  const cats = state.categories[mode === 'income' ? 'income' : 'expense'] || []

  const canSave = () => {
    if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) return false
    if (mode === 'transfer') return fromAcc && toAcc && fromAcc !== toAcc
    return !!category && !!accountId
  }

  const submit = () => {
    if (!canSave()) {
      if (mode === 'transfer') return showAlert('กรุณาเลือกบัญชีต้นทางและปลายทางให้ถูกต้อง')
      return showAlert('กรุณากรอกข้อมูลให้ครบ (จำนวนเงิน, หมวดหมู่, บัญชี)')
    }

    if (mode === 'transfer') {
      const transferId = generateTransferId()
      const amt = Number(amount)
      const when = date

      const fromName = state.accounts.find(a => a.id === fromAcc)?.name || 'ต้นทาง'
      const toName = state.accounts.find(a => a.id === toAcc)?.name || 'ปลายทาง'

      onBulkAdd([
        {
          type: 'expense',
          amount: amt,
          category: 'other',
          accountId: fromAcc,
          date: when,
          note: note || `โอนให้ ${toName}`,
          isTransfer: true,
          transferId,
        },
        {
          type: 'income',
          amount: amt,
          category: 'refund',
          accountId: toAcc,
          date: when,
          note: note || `รับโอนจาก ${fromName}`,
          isTransfer: true,
          transferId,
        },
      ])
      return
    }

    onSaveTx({
      id: editingTx?.id,
      type: mode,
      amount: Number(amount),
      category,
      accountId,
      date,
      note,
      isTransfer: false,
    })
  }

  const deleteMe = () => {
    if (!editingTx?.id) return
    showConfirm('ลบรายการ', 'ต้องการลบรายการนี้ใช่ไหม?', () => onDeleteTx(editingTx.id), true)
  }

  return (
    <div className="pb-28 pt-6 px-4 bg-gray-50 min-h-dvh">
      <div className="flex justify-between items-center mb-6">
        <button onClick={onCancel} className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-500 shadow-sm">
          <X size={20} />
        </button>

        <h2 className="text-lg font-bold text-gray-800">{isEdit ? 'แก้ไขรายการ' : 'บันทึกรายการใหม่'}</h2>

        {isEdit ? (
          <button onClick={deleteMe} className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-500 shadow-sm">
            <Trash2 size={20} />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* Mode Toggle */}
      <div className="bg-white p-1.5 rounded-2xl flex mb-6 shadow-sm border border-gray-100">
        <button onClick={() => setMode('expense')}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${mode === 'expense' ? 'bg-red-50 text-red-500 shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}>
          รายจ่าย
        </button>
        <button onClick={() => setMode('income')}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${mode === 'income' ? 'bg-green-50 text-green-500 shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}>
          รายรับ
        </button>
        <button onClick={() => { setMode('transfer'); setCategory('') }}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${mode === 'transfer' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}>
          <span className="inline-flex items-center gap-1 justify-center"><ArrowLeftRight size={16}/> โอน</span>
        </button>
      </div>

      {/* Amount */}
      <div className="bg-white p-8 rounded-3xl shadow-sm mb-6 text-center border border-gray-100 relative overflow-hidden">
        <div className={`absolute top-0 left-0 w-full h-1 ${
          mode === 'expense' ? 'bg-red-500' : mode === 'income' ? 'bg-green-500' : 'bg-indigo-500'
        }`} />
        <label className="text-gray-400 text-xs font-bold mb-2 block uppercase tracking-wide">จำนวนเงิน</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className={`text-5xl font-bold w-full text-center outline-none bg-transparent placeholder-gray-200 ${
            mode === 'expense' ? 'text-red-500' : mode === 'income' ? 'text-green-500' : 'text-indigo-600'
          }`}
        />
      </div>

      {/* Transfer account pickers */}
      {mode === 'transfer' ? (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden mb-6">
          <div className="p-4 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-400 mb-2 uppercase">บัญชีต้นทาง</p>
            <select value={fromAcc} onChange={(e) => setFromAcc(e.target.value)}
              className="w-full border border-gray-200 rounded-xl p-3 font-semibold text-gray-700">
              {state.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="p-4">
            <p className="text-xs font-bold text-gray-400 mb-2 uppercase">บัญชีปลายทาง</p>
            <select value={toAcc} onChange={(e) => setToAcc(e.target.value)}
              className="w-full border border-gray-200 rounded-xl p-3 font-semibold text-gray-700">
              {state.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {fromAcc === toAcc ? (
              <p className="text-xs text-red-500 mt-2 font-bold">ต้นทางและปลายทางห้ามเหมือนกัน</p>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {/* Account Selection */}
          <div className="mb-6">
            <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase ml-1">บัญชีที่ใช้</h3>
            <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4">
              {state.accounts.map(acc => {
                const selected = accountId === acc.id
                return (
                  <button key={acc.id} onClick={() => setAccountId(acc.id)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all min-w-max ${
                      selected ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200' : 'bg-white text-gray-600 border-gray-100 shadow-sm'
                    }`}>
                    <span className="text-sm font-bold">{acc.name}</span>
                    {selected ? <Check size={14} /> : null}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Category Grid */}
          <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase ml-1">หมวดหมู่</h3>
          <div className="grid grid-cols-4 gap-3 mb-6">
            {cats.map((cat) => (
              <button key={cat.id} onClick={() => setCategory(cat.id)}
                className={`flex flex-col items-center p-3 rounded-2xl transition-all ${
                  category === cat.id ? 'bg-white shadow-md ring-2 ring-indigo-500 scale-[1.03]' : 'bg-white/60 hover:bg-white border border-transparent hover:border-gray-100'
                }`}>
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl mb-2"
                  style={{ backgroundColor: `${cat.color}20` }}>
                  {cat.icon}
                </div>
                <span className="text-[10px] font-bold text-gray-600 truncate w-full text-center">{cat.name}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Date & Note */}
      <div className="bg-white rounded-3xl shadow-sm overflow-hidden mb-24 border border-gray-100">
        <div className="flex items-center border-b border-gray-100 p-4">
          <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 mr-3">
            <Calendar size={20} />
          </div>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="flex-1 outline-none text-gray-700 bg-transparent font-medium" />
        </div>

        <div className="flex items-center p-4">
          <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 mr-3">
            <FileText size={20} />
          </div>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="บันทึกช่วยจำ (ถ้ามี)"
            className="flex-1 outline-none text-gray-700 bg-transparent font-medium" />
        </div>
      </div>

      <button
        onClick={submit}
        className="fixed bottom-6 left-4 right-4 bg-gray-900 text-white py-4 rounded-2xl font-bold shadow-xl shadow-gray-200 active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-black"
      >
        {isEdit ? <Edit2 size={18} /> : <Plus size={18} />}
        {isEdit ? 'บันทึกการแก้ไข' : mode === 'transfer' ? 'ยืนยันการโอน' : 'ยืนยันรายการ'}
      </button>
    </div>
  )
}
