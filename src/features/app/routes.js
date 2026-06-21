export const VIEW_PATHS = Object.freeze({
  dashboard: "/dashboard",
  inbox: "/inbox",
  add: "/add",
  transactions: "/transactions",
  accounts: "/accounts",
  plan: "/plan",
  assistant: "/assistant",
  categories: "/categories",
  planner: "/planner",
  goals: "/goals",
  debts: "/debts",
  "credit-statements": "/credit-statements",
  bills: "/bills",
  recurring: "/recurring",
  settings: "/settings",
});

export const VIEW_IDS = Object.freeze(Object.keys(VIEW_PATHS));

export const LEGACY_PATH_ALIASES = Object.freeze({
  "/add-transaction": VIEW_PATHS.add,
  "/transactions-history": VIEW_PATHS.transactions,
  "/budgets": VIEW_PATHS.planner,
  "/debt-planner": VIEW_PATHS.debts,
  "/subscriptions": VIEW_PATHS.bills,
  "/bills-subscriptions": VIEW_PATHS.bills,
  "/recurring-rules": VIEW_PATHS.recurring,
  "/stats": VIEW_PATHS.planner,
});

export const LEGACY_HASH_PATHS = Object.freeze({
  dashboard: VIEW_PATHS.dashboard,
  inbox: VIEW_PATHS.inbox,
  add: VIEW_PATHS.add,
  "add-transaction": VIEW_PATHS.add,
  transactions: VIEW_PATHS.transactions,
  accounts: VIEW_PATHS.accounts,
  categories: VIEW_PATHS.categories,
  planner: VIEW_PATHS.planner,
  plan: VIEW_PATHS.plan,
  assistant: VIEW_PATHS.assistant,
  recurring: VIEW_PATHS.recurring,
  goals: VIEW_PATHS.goals,
  debts: VIEW_PATHS.debts,
  bills: VIEW_PATHS.bills,
  subscriptions: VIEW_PATHS.bills,
  "debt-planner": VIEW_PATHS.debts,
  "credit-statements": VIEW_PATHS["credit-statements"],
  budgets: VIEW_PATHS.planner,
  stats: VIEW_PATHS.planner,
  settings: VIEW_PATHS.settings,
});

const PATH_TO_VIEW = new Map(
  Object.entries(VIEW_PATHS).map(([view, path]) => [path, view]),
);

export function normalizeLegacyHash(hash) {
  const raw = String(hash || "").trim();
  if (!raw) return "";
  const withoutHash = raw.replace(/^#/, "").trim();
  if (!withoutHash) return "";
  const withoutQuery = withoutHash.split("?")[0].split("&")[0].trim();
  const withoutSlash = withoutQuery.replace(/^\/+/, "").replace(/\/+$/, "");
  return withoutSlash.toLowerCase();
}

export function normalizePathname(pathname) {
  const raw = String(pathname || "").trim();
  if (!raw) return "/";
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  if (withLeadingSlash === "/") return withLeadingSlash;
  return withLeadingSlash.replace(/\/+$/, "");
}

export function isKnownView(view) {
  return VIEW_IDS.includes(String(view || "").trim().toLowerCase());
}

export function getPathForView(view) {
  const key = String(view || "").trim().toLowerCase();
  return VIEW_PATHS[key] || VIEW_PATHS.dashboard;
}

export function getCanonicalPathForPathname(pathname) {
  const normalized = normalizePathname(pathname);
  return LEGACY_PATH_ALIASES[normalized] || normalized;
}

export function getViewForPathname(pathname) {
  const canonicalPath = getCanonicalPathForPathname(pathname);
  return PATH_TO_VIEW.get(canonicalPath) || "dashboard";
}

export function getPathForLegacyHash(hash) {
  const raw = normalizeLegacyHash(hash);
  if (!raw) return "";
  return LEGACY_HASH_PATHS[raw] || "";
}

export function getInitialHomePath({ pathname = "/", hash = "" } = {}) {
  const currentPath = getCanonicalPathForPathname(pathname);
  if (currentPath !== "/" && PATH_TO_VIEW.has(currentPath)) return currentPath;
  return getPathForLegacyHash(hash) || VIEW_PATHS.dashboard;
}
