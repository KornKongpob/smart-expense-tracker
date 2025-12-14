import { AppStoreProvider, useAppStore } from '../store/store.jsx'
import PhoneShell from '../components/PhoneShell'
import Navbar from '../components/Navbar'
import ConfirmationModal from '../components/ConfirmationModal'
import DashboardView from '../views/DashboardView'
import AddTransactionView from '../views/AddTransactionView'
import StatsView from '../views/StatsView'
import AccountsView from '../views/AccountsView'
import CategoriesView from '../views/CategoriesView'
import MoreView from '../views/MoreView'

import {
  NAV_SET_VIEW, UI_OPEN_CONFIRM, UI_CLOSE_CONFIRM,
  TX_UPSERT, TX_DELETE, TX_BULK_ADD,
  ACC_ADD, ACC_DELETE,
  CAT_ADD, CAT_DELETE,
  DATA_RESET,
} from '../store/actions'

import { exportJSON } from '../services/storage'

function AppInner() {
  const { state, dispatch } = useAppStore()

  const navigate = (view) => dispatch({ type: NAV_SET_VIEW, payload: { view } })

  const showAlert = (message) => {
    dispatch({
      type: UI_OPEN_CONFIRM,
      payload: { title: 'แจ้งเตือน', message, isDestructive: false, onConfirmAction: { type: UI_CLOSE_CONFIRM } },
    })
  }

  const showConfirm = (title, message, onConfirm, isDestructive = false) => {
    dispatch({
      type: UI_OPEN_CONFIRM,
      payload: {
        title,
        message,
        isDestructive,
        onConfirmAction: onConfirm,
      },
    })
  }

  const onConfirm = () => {
    const action = state.ui.confirm.onConfirmAction
    dispatch({ type: UI_CLOSE_CONFIRM })
    if (action) dispatch(action)
  }

  const onCancel = () => dispatch({ type: UI_CLOSE_CONFIRM })

  const editingTx = state.editingId ? state.transactions.find(t => t.id === state.editingId) : null

  const openEdit = (id) => dispatch({ type: NAV_SET_VIEW, payload: { view: 'add', editingId: id } })

  const exportData = () => exportJSON({
    transactions: state.transactions,
    accounts: state.accounts,
    categories: state.categories,
  })

  const resetAll = () =>
    showConfirm('ล้างข้อมูล', 'ข้อมูลทั้งหมดจะหายไป', { type: DATA_RESET }, true)

  return (
    <PhoneShell>
      {state.view === 'dashboard' && (
        <DashboardView state={state} onNavigate={navigate} onEdit={openEdit} />
      )}

      {state.view === 'add' && (
        <AddTransactionView
          state={state}
          editingTx={editingTx}
          onCancel={() => dispatch({ type: NAV_SET_VIEW, payload: { view: 'dashboard', editingId: null } })}
          onSaveTx={(tx) => dispatch({ type: TX_UPSERT, payload: tx })}
          onBulkAdd={(txs) => dispatch({ type: TX_BULK_ADD, payload: txs })}
          onDeleteTx={(id) => dispatch({ type: TX_DELETE, payload: { id } })}
          showAlert={showAlert}
          showConfirm={(title, message, fnAction, destructive) => showConfirm(title, message, fnAction, destructive)}
        />
      )}

      {state.view === 'stats' && <StatsView state={state} />}

      {state.view === 'accounts' && (
        <AccountsView
          state={state}
          onAdd={(acc) => dispatch({ type: ACC_ADD, payload: acc })}
          onDelete={(id) => dispatch({ type: ACC_DELETE, payload: { id } })}
          showAlert={showAlert}
          showConfirm={(title, message, fn, destructive) => showConfirm(title, message, fn, destructive)}
        />
      )}

      {state.view === 'more' && (
        <MoreView
          onNavigate={navigate}
          onExport={exportData}
          onReset={resetAll}
        />
      )}

      {state.view === 'categories' && (
        <CategoriesView
          state={state}
          onBack={() => navigate('more')}
          onAdd={(cat) => dispatch({ type: CAT_ADD, payload: cat })}
          onDelete={(payload) => dispatch({ type: CAT_DELETE, payload })}
          showAlert={showAlert}
          showConfirm={(title, message, fn, destructive) => showConfirm(title, message, fn, destructive)}
        />
      )}

      <ConfirmationModal
        isOpen={state.ui.confirm.isOpen}
        title={state.ui.confirm.title}
        message={state.ui.confirm.message}
        isDestructive={state.ui.confirm.isDestructive}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />

      {state.view !== 'add' && state.view !== 'categories' && (
        <Navbar currentView={state.view} onNavigate={navigate} />
      )}
    </PhoneShell>
  )
}

export default function App() {
  return (
    <AppStoreProvider>
      <AppInner />
    </AppStoreProvider>
  )
}
