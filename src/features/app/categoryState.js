import { sanitizeCategoryHierarchy } from "../../utils/categoryHierarchy.js";
import { buildCustomCategoryId } from "../../utils/categoryCustomId.js";

const DEFAULT_CATEGORY_COLOR = "#0b84ff";
const DEFAULT_CATEGORY_ICON = "🏷️";

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeKind(value) {
  return String(value || "").trim().toLowerCase() === "income" ? "income" : "expense";
}

function toInt(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.trunc(number);
}

function slugifyCategorySeed(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 36);
}

function compareCategoryRows(left, right) {
  const sortDelta = toInt(left?.sortOrder, 0) - toInt(right?.sortOrder, 0);
  if (sortDelta !== 0) return sortDelta;
  return String(left?.name || "").localeCompare(String(right?.name || ""), "th");
}

export function flattenCategoryGroups(groups) {
  const expense = Array.isArray(groups?.expense) ? groups.expense : [];
  const income = Array.isArray(groups?.income) ? groups.income : [];
  return [...expense, ...income];
}

export function normalizeCategoryPreferences(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      userId: cleanText(row?.user_id || row?.userId),
      categoryId: cleanText(row?.category_id || row?.categoryId),
      name: cleanText(row?.name),
      icon: cleanText(row?.icon),
      color: cleanText(row?.color),
      hidden: row?.hidden === true,
      updatedAt: row?.updated_at || row?.updatedAt || null,
    }))
    .filter((row) => row.categoryId);
}

export function mergeCategoryState(categoryRows, preferenceRows) {
  const preferenceMap = new Map(
    normalizeCategoryPreferences(preferenceRows).map((row) => [row.categoryId, row]),
  );

  const sanitizedRows = sanitizeCategoryHierarchy(
    (Array.isArray(categoryRows) ? categoryRows : [])
      .map((row) => ({
        id: cleanText(row?.id),
        userId: row?.user_id || row?.userId || null,
        isSystem: row?.is_system === true || row?.isSystem === true,
        kind: normalizeKind(row?.kind),
        name: cleanText(row?.name, "Untitled"),
        icon: cleanText(row?.icon, DEFAULT_CATEGORY_ICON),
        color: cleanText(row?.color, DEFAULT_CATEGORY_COLOR),
        parentId: cleanText(row?.parent_id || row?.parentId),
        sortOrder: toInt(row?.sort_order ?? row?.sortOrder, 0),
        createdAt: row?.created_at || row?.createdAt || null,
        updatedAt: row?.updated_at || row?.updatedAt || null,
      }))
      .filter((row) => row.id),
  );

  const rowMap = new Map(sanitizedRows.map((row) => [row.id, row]));
  const hiddenMemo = new Map();

  const computeHidden = (categoryId) => {
    const id = cleanText(categoryId);
    if (!id) return false;
    if (hiddenMemo.has(id)) return hiddenMemo.get(id);

    const row = rowMap.get(id);
    if (!row || row.isSystem) {
      hiddenMemo.set(id, false);
      return false;
    }

    const ownHidden = preferenceMap.get(id)?.hidden === true;
    const parentHidden = row.parentId ? computeHidden(row.parentId) : false;
    const nextHidden = ownHidden || parentHidden;
    hiddenMemo.set(id, nextHidden);
    return nextHidden;
  };

  const mergedRows = sanitizedRows.map((row) => {
    const preference = preferenceMap.get(row.id);

    return {
      ...row,
      baseName: row.name,
      baseIcon: row.icon,
      baseColor: row.color,
      name: cleanText(preference?.name, row.name),
      icon: cleanText(preference?.icon, row.icon),
      color: cleanText(preference?.color, row.color),
      isHiddenSelf: !row.isSystem && preference?.hidden === true,
      isHidden: computeHidden(row.id),
    };
  });

  const groups = { expense: [], income: [] };
  for (const row of mergedRows.sort(compareCategoryRows)) {
    groups[row.kind].push(row);
  }

  return groups;
}

export function applyCategoryPresentationToSnapshot(snapshot, groupedCategories) {
  if (!snapshot || !Array.isArray(snapshot?.top_categories)) return snapshot;

  const categoryMap = new Map(flattenCategoryGroups(groupedCategories).map((row) => [row.id, row]));

  return {
    ...snapshot,
    top_categories: snapshot.top_categories.map((row) => {
      const category = categoryMap.get(cleanText(row?.id));
      if (!category) return row;

      return {
        ...row,
        name: category.name,
        icon: category.icon,
        color: category.color,
      };
    }),
  };
}

export function buildNextCustomCategoryId({ userId, kind, name, existingIds }) {
  const knownIds = new Set((Array.isArray(existingIds) ? existingIds : []).map((value) => cleanText(value)));
  const seed = slugifyCategorySeed(name) || `${normalizeKind(kind)}_${Date.now()}`;

  let index = 1;
  while (index < 1000) {
    const suffix = index === 1 ? seed : `${seed}_${index}`;
    const candidate = buildCustomCategoryId(userId, `${normalizeKind(kind)}:${suffix}`);
    if (!knownIds.has(candidate)) return candidate;
    index += 1;
  }

  return buildCustomCategoryId(userId, `${normalizeKind(kind)}:${seed}:${Date.now()}`);
}

export function getNextCategorySortOrder(groupedCategories, kind) {
  const rows = normalizeKind(kind) === "income" ? groupedCategories?.income : groupedCategories?.expense;
  return (Array.isArray(rows) ? rows : []).reduce(
    (maxSortOrder, row) => Math.max(maxSortOrder, toInt(row?.sortOrder, 0)),
    -1,
  ) + 1;
}

export function isCategoryPreferencesMissingError(error) {
  const code = String(error?.code || "").trim().toUpperCase();
  const message = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();

  if (code === "42P01") return true;
  return message.includes("category_preferences") && (
    message.includes("does not exist") ||
    message.includes("could not find") ||
    message.includes("relation")
  );
}
