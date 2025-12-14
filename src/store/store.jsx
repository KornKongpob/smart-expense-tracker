import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react'
import { appReducer, hydrateState } from './reducer'
import { loadState, saveState } from '../services/storage'

const AppStoreContext = createContext(null)

export const AppStoreProvider = ({ children }) => {
  const persisted = loadState()
  const [state, dispatch] = useReducer(appReducer, hydrateState(persisted))

  // persist (เฉพาะ data ที่จำเป็น)
  useEffect(() => {
    saveState({
      view: state.view,
      editingId: state.editingId,
      transactions: state.transactions,
      accounts: state.accounts,
      categories: state.categories,
    })
  }, [state.view, state.editingId, state.transactions, state.accounts, state.categories])

  const value = useMemo(() => ({ state, dispatch }), [state])
  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
}

export const useAppStore = () => {
  const ctx = useContext(AppStoreContext)
  if (!ctx) throw new Error('useAppStore must be used within AppStoreProvider')
  return ctx
}
