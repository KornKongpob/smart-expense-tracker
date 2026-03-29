import { DEFAULT_CATEGORIES } from "../../src/constants/categories.js";
import { canonicalizeCategoryId } from "../../src/utils/categoryIds.js";

const SYSTEM_CATEGORY_ROWS = Array.from(
  new Map(
    ["expense", "income"].flatMap((kind) =>
      (DEFAULT_CATEGORIES[kind] || []).map((category, index) => {
        const id = canonicalizeCategoryId(kind, category?.id);
        return [
          id,
          {
            id,
            user_id: null,
            is_system: true,
            kind,
            name: String(category?.name || "").trim() || "Untitled",
            icon: String(category?.icon || "").trim(),
            color: String(category?.color || "#0f766e").trim(),
            parent_id: canonicalizeCategoryId(kind, category?.parentId) || null,
            sort_order: index,
          },
        ];
      }),
    ),
  ).values(),
).filter((row) => row.id);

export function getSystemCategoryRows() {
  return SYSTEM_CATEGORY_ROWS.map((row) => ({ ...row }));
}

export async function ensureSystemCategories(client) {
  if (!client) throw new Error("supabase_client_required");
  const rows = getSystemCategoryRows();
  if (!rows.length) return [];

  const { data, error } = await client
    .from("categories")
    .upsert(rows, { onConflict: "id" })
    .select("id");

  if (error) {
    throw new Error(error.message || "system_category_seed_failed");
  }

  return Array.isArray(data) ? data : [];
}
