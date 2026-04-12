import { useMemo, useState } from "react";
import { ChevronLeft, Edit3, EyeOff, FolderPlus, Plus, RotateCcw } from "lucide-react";

import { PRESET_COLORS } from "../../../constants/presets.jsx";
import { buildCategoryHierarchy } from "../../../utils/categoryHierarchy.js";
import { useExpenseApp } from "../AppProvider.jsx";
import { useExpenseNavigation } from "../navigation.js";
import { EmptyPanel, ScreenShell, Sheet } from "../ui.jsx";

const KIND_OPTIONS = [
  { id: "expense", label: "รายจ่าย" },
  { id: "income", label: "รายรับ" },
];

const DEFAULT_ICON = "🏷️";
const DEFAULT_COLOR = PRESET_COLORS[0] || "#0b84ff";

function createDraft(kind = "expense", category = null, parentId = "") {
  const nextParentId = String(category?.parentId || parentId || "").trim();

  return {
    id: String(category?.id || "").trim(),
    kind: String(category?.kind || kind || "expense").trim().toLowerCase() === "income" ? "income" : "expense",
    isSystem: category?.isSystem === true,
    name: String(category?.name || "").trim(),
    icon: String(category?.icon || DEFAULT_ICON).trim() || DEFAULT_ICON,
    color: String(category?.color || DEFAULT_COLOR).trim() || DEFAULT_COLOR,
    level: nextParentId ? "sub" : "main",
    parentId: nextParentId,
  };
}

function CategoryTree({
  hierarchy,
  onEdit,
  onCreateSubcategory,
  onHide,
  onRestore,
  hidden = false,
}) {
  return (
    <div className="category-tree">
      {hierarchy.main.map((category) => {
        const children = hierarchy.childrenByParent.get(category.id) || [];

        return (
          <article
            key={category.id}
            className="ui-card category-card"
            data-testid={`category-row-${category.id}`}
          >
            <div className="category-row">
              <div className="category-row-main">
                <span
                  className="category-icon"
                  style={{ backgroundColor: `${category.color}18`, color: category.color }}
                >
                  {category.icon || DEFAULT_ICON}
                </span>
                <div className="category-copy">
                  <div className="category-title-line">
                    <span className="category-title">{category.name}</span>
                    {category.isSystem ? <span className="category-badge">ระบบ</span> : null}
                  </div>
                  <div className="category-meta">
                    {children.length ? `${children.length} หมวดย่อย` : category.isSystem ? "ค่าเริ่มต้น" : "กำหนดเอง"}
                  </div>
                </div>
              </div>

              <div className="category-actions">
                {!hidden ? (
                  <button
                    type="button"
                    className="category-action-button"
                    onClick={() => onCreateSubcategory?.(category.id)}
                    data-testid={`category-add-sub-${category.id}`}
                    aria-label="เพิ่มหมวดย่อย"
                    title="เพิ่มหมวดย่อย"
                  >
                    <FolderPlus size={16} />
                  </button>
                ) : null}

                <button
                  type="button"
                  className="category-action-button"
                  onClick={() => onEdit?.(category)}
                  data-testid={`category-edit-${category.id}`}
                  aria-label="แก้ไขหมวดหมู่"
                  title="แก้ไขหมวดหมู่"
                >
                  <Edit3 size={16} />
                </button>

                {hidden ? (
                  category.isHiddenSelf ? (
                    <button
                      type="button"
                      className="category-action-button category-action-button-primary"
                      onClick={() => onRestore?.(category.id)}
                      data-testid={`category-restore-${category.id}`}
                      aria-label="กู้คืนหมวดหมู่"
                      title="กู้คืนหมวดหมู่"
                    >
                      <RotateCcw size={16} />
                    </button>
                  ) : null
                ) : !category.isSystem ? (
                  <button
                    type="button"
                    className="category-action-button category-action-button-danger"
                    onClick={() => onHide?.(category.id)}
                    data-testid={`category-hide-${category.id}`}
                    aria-label="ซ่อนหมวดหมู่"
                    title="ซ่อนหมวดหมู่"
                  >
                    <EyeOff size={16} />
                  </button>
                ) : null}
              </div>
            </div>

            {children.length ? (
              <div className="category-children">
                {children.map((child) => (
                  <div
                    key={child.id}
                    className="category-subrow"
                    data-testid={`subcategory-row-${child.id}`}
                  >
                    <div className="category-row-main">
                      <span
                        className="category-icon category-icon-sub"
                        style={{ backgroundColor: `${child.color}16`, color: child.color }}
                      >
                        {child.icon || DEFAULT_ICON}
                      </span>
                      <div className="category-copy">
                        <div className="category-title-line">
                          <span className="category-title">{child.name}</span>
                          {child.isSystem ? <span className="category-badge">ระบบ</span> : null}
                        </div>
                        <div className="category-meta">
                          {hidden && !child.isHiddenSelf ? "ซ่อนตามหมวดหลัก" : child.isSystem ? "ค่าเริ่มต้น" : "หมวดย่อย"}
                        </div>
                      </div>
                    </div>

                    <div className="category-actions">
                      <button
                        type="button"
                        className="category-action-button"
                        onClick={() => onEdit?.(child)}
                        data-testid={`subcategory-edit-${child.id}`}
                        aria-label="แก้ไขหมวดย่อย"
                        title="แก้ไขหมวดย่อย"
                      >
                        <Edit3 size={16} />
                      </button>

                      {hidden ? (
                        child.isHiddenSelf ? (
                          <button
                            type="button"
                            className="category-action-button category-action-button-primary"
                            onClick={() => onRestore?.(child.id)}
                            data-testid={`subcategory-restore-${child.id}`}
                            aria-label="กู้คืนหมวดย่อย"
                            title="กู้คืนหมวดย่อย"
                          >
                            <RotateCcw size={16} />
                          </button>
                        ) : null
                      ) : !child.isSystem ? (
                        <button
                          type="button"
                          className="category-action-button category-action-button-danger"
                          onClick={() => onHide?.(child.id)}
                          data-testid={`subcategory-hide-${child.id}`}
                          aria-label="ซ่อนหมวดย่อย"
                          title="ซ่อนหมวดย่อย"
                        >
                          <EyeOff size={16} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export default function CategoriesScreen() {
  const { navigateToView } = useExpenseNavigation();
  const { categories, saveCategory, setCategoryHidden, saving } = useExpenseApp();
  const [kind, setKind] = useState("expense");
  const [draft, setDraft] = useState(createDraft("expense"));
  const [editorOpen, setEditorOpen] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const categoryRows = useMemo(
    () => (kind === "income" ? categories.income : categories.expense),
    [categories.expense, categories.income, kind],
  );

  const visibleRows = useMemo(
    () => categoryRows.filter((category) => category?.isHidden !== true),
    [categoryRows],
  );
  const hiddenRows = useMemo(
    () => categoryRows.filter((category) => category?.isHidden === true),
    [categoryRows],
  );

  const visibleHierarchy = useMemo(() => buildCategoryHierarchy(visibleRows), [visibleRows]);
  const hiddenHierarchy = useMemo(() => buildCategoryHierarchy(hiddenRows), [hiddenRows]);

  const editingHasChildren = useMemo(() => {
    const draftId = String(draft.id || "").trim();
    if (!draftId) return false;
    return categoryRows.some((category) => String(category?.parentId || "").trim() === draftId);
  }, [categoryRows, draft.id]);

  const parentOptions = useMemo(
    () =>
      visibleHierarchy.main.filter((category) => {
        const candidateId = String(category?.id || "").trim();
        if (!candidateId) return false;
        if (candidateId === String(draft.id || "").trim()) return false;
        return true;
      }),
    [draft.id, visibleHierarchy.main],
  );

  const openCreate = (parentId = "") => {
    setDraft(createDraft(kind, null, parentId));
    setEditorOpen(true);
  };

  const openEdit = (category) => {
    setDraft(createDraft(kind, category));
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setDraft(createDraft(kind));
    setEditorOpen(false);
  };

  const submit = async () => {
    await saveCategory({
      ...draft,
      kind,
      parentId: draft.isSystem || editingHasChildren || draft.level === "main" ? "" : draft.parentId,
      level: draft.isSystem || editingHasChildren ? "main" : draft.level,
    });
    closeEditor();
  };

  const handleRestore = async (categoryId) => {
    await setCategoryHidden(categoryId, false);
  };

  const handleHide = async (categoryId) => {
    await setCategoryHidden(categoryId, true);
  };

  return (
    <ScreenShell
      title="หมวดหมู่"
      actions={
        <div className="finance-inline-actions">
          <button
            type="button"
            className="ui-btn ui-btn-secondary"
            onClick={() => navigateToView("settings")}
            data-testid="categories-back"
          >
            <ChevronLeft size={16} />
            กลับ
          </button>

          <button
            type="button"
            className="ui-btn ui-btn-primary"
            onClick={() => openCreate()}
            data-testid="new-category"
          >
            <Plus size={16} />
            เพิ่มหมวด
          </button>
        </div>
      }
    >
      <div className="view-segmented finance-segmented-wide">
        {KIND_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={["view-segmented-btn", kind === option.id ? "is-active" : ""].join(" ")}
            onClick={() => {
              setKind(option.id);
              setDraft(createDraft(option.id));
              setEditorOpen(false);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {visibleHierarchy.main.length ? (
        <CategoryTree
          hierarchy={visibleHierarchy}
          onEdit={openEdit}
          onCreateSubcategory={openCreate}
          onHide={handleHide}
        />
      ) : (
        <article className="ui-card finance-panel">
          <EmptyPanel title="ยังไม่มีหมวดกำหนดเอง" copy="เพิ่มหมวดหรือหมวดย่อยได้จากปุ่มด้านบน" />
        </article>
      )}

      {hiddenHierarchy.main.length ? (
        <details className="finance-details category-hidden-block" open={showHidden}>
          <summary
            className="finance-details-summary"
            onClick={(event) => {
              event.preventDefault();
              setShowHidden((current) => !current);
            }}
            data-testid="categories-hidden-toggle"
          >
            <span>หมวดที่ซ่อน ({hiddenRows.length})</span>
            <span className="finance-details-caret">{showHidden ? "ซ่อน" : "แสดง"}</span>
          </summary>

          {showHidden ? (
            <div className="finance-details-body">
              <CategoryTree
                hierarchy={hiddenHierarchy}
                onEdit={openEdit}
                onRestore={handleRestore}
                hidden
              />
            </div>
          ) : null}
        </details>
      ) : null}

      <Sheet
        open={editorOpen}
        onClose={closeEditor}
        title={draft.id ? "แก้ไขหมวดหมู่" : "หมวดใหม่"}
        footer={
          <div className="finance-sheet-actions finance-sheet-actions-sticky">
            <button type="button" className="ui-btn ui-btn-secondary" onClick={closeEditor}>
              ยกเลิก
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-primary"
              disabled={saving || !String(draft.name || "").trim()}
              onClick={submit}
              data-testid="save-category"
            >
              บันทึก
            </button>
          </div>
        }
      >
        <div className="finance-form category-form">
          <label className="finance-field">
            <span className="ui-label">ชื่อ</span>
            <input
              className="ui-input"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="เช่น อาหาร หรือ เดินทาง"
              data-testid="category-name-input"
            />
          </label>

          <div className="finance-grid finance-grid-2">
            <label className="finance-field">
              <span className="ui-label">ไอคอน</span>
              <input
                className="ui-input"
                value={draft.icon}
                onChange={(event) => setDraft((current) => ({ ...current, icon: event.target.value }))}
                placeholder={DEFAULT_ICON}
              />
            </label>

            <div className="finance-field">
              <span className="ui-label">สี</span>
              <div className="category-color-grid">
                {PRESET_COLORS.slice(0, 10).map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={["category-color-button", draft.color === color ? "is-active" : ""].join(" ")}
                    style={{ "--category-color": color }}
                    onClick={() => setDraft((current) => ({ ...current, color }))}
                    aria-label={`เลือกสี ${color}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {!draft.isSystem ? (
            <section className="finance-form-section finance-form-section-compact">
              <div className="finance-section-label">โครงสร้าง</div>
              <div className="view-segmented">
                <button
                  type="button"
                  className={["view-segmented-btn", draft.level === "main" || editingHasChildren ? "is-active" : ""].join(" ")}
                  onClick={() => setDraft((current) => ({ ...current, level: "main", parentId: "" }))}
                >
                  หมวดหลัก
                </button>
                <button
                  type="button"
                  className={["view-segmented-btn", !editingHasChildren && draft.level === "sub" ? "is-active" : ""].join(" ")}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      level: "sub",
                      parentId: current.parentId || String(parentOptions[0]?.id || ""),
                    }))
                  }
                  disabled={editingHasChildren}
                >
                  หมวดย่อย
                </button>
              </div>

              {draft.level === "sub" && !editingHasChildren ? (
                <label className="finance-field">
                  <span className="ui-label">หมวดหลัก</span>
                  <select
                    className="ui-select"
                    value={draft.parentId}
                    onChange={(event) => setDraft((current) => ({ ...current, parentId: event.target.value }))}
                  >
                    <option value="">เลือกหมวดหลัก</option>
                    {parentOptions.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {editingHasChildren ? (
                <div className="category-form-note">หมวดนี้มีหมวดย่อยอยู่แล้ว จึงคงเป็นหมวดหลักต่อไป</div>
              ) : null}
            </section>
          ) : null}
        </div>
      </Sheet>
    </ScreenShell>
  );
}
