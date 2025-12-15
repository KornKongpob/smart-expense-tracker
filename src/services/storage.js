// src/services/storage.js

const KEYS = {
  transactions: 'transactions',
  accounts: 'accounts',
  categories: 'categories',
};

export function loadAll({ defaultAccounts = [], defaultCategories = { expense: [], income: [] } } = {}) {
  const txRaw = localStorage.getItem(KEYS.transactions);
  const accRaw = localStorage.getItem(KEYS.accounts);
  const catRaw = localStorage.getItem(KEYS.categories);

  let transactions = [];
  let accounts = defaultAccounts;
  let categories = defaultCategories;

  try {
    if (txRaw) transactions = JSON.parse(txRaw);
  } catch (_) {
    transactions = [];
  }

  try {
    if (accRaw) accounts = JSON.parse(accRaw);
  } catch (_) {
    accounts = defaultAccounts;
  }

  try {
    if (catRaw) categories = JSON.parse(catRaw);
  } catch (_) {
    categories = defaultCategories;
  }

  return { transactions, accounts, categories };
}

/**
 * ✅ สำคัญ: ต้อง save เสมอ “แม้เป็น []”
 */
export function saveAll({ transactions, accounts, categories }) {
  localStorage.setItem(KEYS.transactions, JSON.stringify(transactions ?? []));
  localStorage.setItem(KEYS.accounts, JSON.stringify(accounts ?? []));
  localStorage.setItem(KEYS.categories, JSON.stringify(categories ?? { expense: [], income: [] }));
}

export function clearAll() {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
}

export function exportBackup({ transactions, accounts, categories }) {
  return { transactions: transactions ?? [], accounts: accounts ?? [], categories: categories ?? { expense: [], income: [] } };
}

export function downloadBackupJSON(data, filename = 'backup.json') {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data));
  const el = document.createElement('a');
  el.setAttribute('href', dataStr);
  el.setAttribute('download', filename);
  el.click();
}
