const KEYS = {
  transactions: "transactions",
  accounts: "accounts",
  categories: "categories",
  budgets: "budgets",
  recurring: "recurring",
};

export function loadAll({
  defaultAccounts = [],
  defaultCategories = { expense: [], income: [] },
  defaultBudgets = {},
  defaultRecurring = [],
} = {}) {
  const read = (k) => localStorage.getItem(k);

  let transactions = [];
  let accounts = defaultAccounts;
  let categories = defaultCategories;
  let budgets = defaultBudgets;
  let recurring = defaultRecurring;

  try { transactions = read(KEYS.transactions) ? JSON.parse(read(KEYS.transactions)) : []; } catch {}
  try { accounts = read(KEYS.accounts) ? JSON.parse(read(KEYS.accounts)) : defaultAccounts; } catch {}
  try { categories = read(KEYS.categories) ? JSON.parse(read(KEYS.categories)) : defaultCategories; } catch {}
  try { budgets = read(KEYS.budgets) ? JSON.parse(read(KEYS.budgets)) : defaultBudgets; } catch {}
  try { recurring = read(KEYS.recurring) ? JSON.parse(read(KEYS.recurring)) : defaultRecurring; } catch {}

  // basic sanitize
  if (!Array.isArray(transactions)) transactions = [];
  if (!Array.isArray(accounts)) accounts = defaultAccounts;
  if (!categories || typeof categories !== "object") categories = defaultCategories;
  if (!budgets || typeof budgets !== "object") budgets = defaultBudgets;
  if (!Array.isArray(recurring)) recurring = defaultRecurring;

  return { transactions, accounts, categories, budgets, recurring };
}

export function saveAll({ transactions, accounts, categories, budgets, recurring }) {
  localStorage.setItem(KEYS.transactions, JSON.stringify(transactions ?? []));
  localStorage.setItem(KEYS.accounts, JSON.stringify(accounts ?? []));
  localStorage.setItem(KEYS.categories, JSON.stringify(categories ?? { expense: [], income: [] }));
  localStorage.setItem(KEYS.budgets, JSON.stringify(budgets ?? {}));
  localStorage.setItem(KEYS.recurring, JSON.stringify(recurring ?? []));
}

export function clearAll() {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
}

export function exportBackup(state) {
  return {
    transactions: state.transactions ?? [],
    accounts: state.accounts ?? [],
    categories: state.categories ?? { expense: [], income: [] },
    budgets: state.budgets ?? {},
    recurring: state.recurring ?? [],
  };
}

export function downloadBackupJSON(data, filename = "backup.json") {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
  const el = document.createElement("a");
  el.setAttribute("href", dataStr);
  el.setAttribute("download", filename);
  el.click();
}
