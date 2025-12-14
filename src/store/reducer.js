import {
  NAV_SET_VIEW, UI_OPEN_CONFIRM, UI_CLOSE_CONFIRM,
  TX_UPSERT, TX_DELETE, TX_BULK_ADD,
  ACC_ADD, ACC_DELETE,
  CAT_ADD, CAT_DELETE,
  DATA_IMPORT, DATA_RESET,
} from './actions'
import { DEFAULT_CATEGORIES } from '../constants/categories'
import { generateId } from '../utils/id'
import { toISODate } from '../utils/format'

export const initialState = {
  view: 'dashboard',
  editingId: null,
  transactions: [],
  accounts: [{ id: 'acc_default', name: 'เงินสด', type: 'cash', color: '#1DD1A1' }],
  categories: DEFAULT_CATEGORIES,
  ui: {
    confirm: { isOpen: false, title: '', message: '', isDestructive: false, onConfirmAction: null },
  },
}

export const hydrateState = (persisted) => {
  if (!persisted) {
    // เริ่มแบบมีตัวอย่างนิดหน่อย (คุณจะล้างได้ใน More > Reset)
    const today = new Date().toISOString()
    return {
      ...initialState,
      transactions: [
        { id: 't1', type: 'income', amount: 25000, category: 'salary', date: today, note: 'เงินเดือน', accountId: 'acc_default', isTransfer: false },
        { id: 't2', type: 'expense', amount: 120, category: 'food', date: today, note: 'ข้าวกลางวัน', accountId: 'acc_default', isTransfer: false },
      ],
    }
  }

  // กันข้อมูลเสีย
  return {
    ...initialState,
    ...persisted,
    categories: persisted.categories || DEFAULT_CATEGORIES,
    accounts: persisted.accounts?.length ? persisted.accounts : initialState.accounts,
    transactions: Array.isArray(persisted.transactions) ? persisted.transactions : [],
  }
}

export const appReducer = (state, action) => {
  switch (action.type) {
    case NAV_SET_VIEW:
      return { ...state, view: action.payload.view, editingId: action.payload.editingId ?? state.editingId }

    case UI_OPEN_CONFIRM:
      return { ...state, ui: { ...state.ui, confirm: { ...action.payload, isOpen: true } } }

    case UI_CLOSE_CONFIRM:
      return { ...state, ui: { ...state.ui, confirm: { ...state.ui.confirm, isOpen: false } } }

    case TX_UPSERT: {
      const tx = action.payload
      const normalized = {
        ...tx,
        id: tx.id || generateId(),
        date: tx.date || toISODate(),
        isTransfer: !!tx.isTransfer,
      }

      const exists = state.transactions.some(t => t.id === normalized.id)
      const next = exists
        ? state.transactions.map(t => (t.id === normalized.id ? normalized : t))
        : [...state.transactions, normalized]

      return { ...state, transactions: next, editingId: null, view: 'dashboard' }
    }

    case TX_BULK_ADD: {
      const txs = action.payload.map(tx => ({
        ...tx,
        id: tx.id || generateId(),
        date: tx.date || toISODate(),
        isTransfer: !!tx.isTransfer,
      }))
      return { ...state, transactions: [...state.transactions, ...txs], view: 'dashboard' }
    }

    case TX_DELETE:
      return { ...state, transactions: state.transactions.filter(t => t.id !== action.payload.id) }

    case ACC_ADD:
      return { ...state, accounts: [...state.accounts, { ...action.payload, id: generateId() }] }

    case ACC_DELETE: {
      const id = action.payload.id
      const nextAccounts = state.accounts.filter(a => a.id !== id)
      const nextTx = state.transactions.filter(t => t.accountId !== id)
      return { ...state, accounts: nextAccounts.length ? nextAccounts : state.accounts, transactions: nextTx }
    }

    case CAT_ADD: {
      const { type, ...cat } = action.payload
      return { ...state, categories: { ...state.categories, [type]: [...state.categories[type], { ...cat, id: generateId() }] } }
    }

    case CAT_DELETE: {
      const { id, type } = action.payload
      if (state.categories[type].length <= 1) return state
      return { ...state, categories: { ...state.categories, [type]: state.categories[type].filter(c => c.id !== id) } }
    }

    case DATA_IMPORT:
      return hydrateState(action.payload)

    case DATA_RESET:
      localStorage.clear()
      return hydrateState(null)

    default:
      return state
  }
}
