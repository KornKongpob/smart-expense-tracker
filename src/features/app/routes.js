export const VIEW_PATHS = Object.freeze({
  dashboard: "/dashboard",
  inbox: "/inbox",
  add: "/add",
  accounts: "/accounts",
  categories: "/categories",
  planner: "/planner",
  settings: "/settings",
});

export const VIEW_IDS = Object.freeze(Object.keys(VIEW_PATHS));

export const LEGACY_PATH_ALIASES = Object.freeze({
  "/add-transaction": VIEW_PATHS.add,
  "/budgets": VIEW_PATHS.planner,
  "/recurring": VIEW_PATHS.planner,
  "/stats": VIEW_PATHS.planner,
});

export const LEGACY_HASH_PATHS = Object.freeze({
  dashboard: VIEW_PATHS.dashboard,
  inbox: VIEW_PATHS.inbox,
  add: VIEW_PATHS.add,
  "add-transaction": VIEW_PATHS.add,
  accounts: VIEW_PATHS.accounts,
  categories: VIEW_PATHS.categories,
  planner: VIEW_PATHS.planner,
  budgets: VIEW_PATHS.planner,
  recurring: VIEW_PATHS.planner,
  stats: VIEW_PATHS.planner,
  settings: VIEW_PATHS.settings,
});

const PATH_TO_VIEW = new Map(
  Object.entries(VIEW_PATHS).map(([view, path]) => [path, view]),
);

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
  const raw = String(hash || "").trim().replace(/^#/, "").toLowerCase();
  if (!raw) return "";
  return LEGACY_HASH_PATHS[raw] || "";
}
