import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Plus, Trash2 } from "lucide-react";

import CategoryPresetChooser from "./CategoryPresetChooser.jsx";
import {
  buildDraftLineItemSummaries,
  lineItemsFromDraft,
  summarizeDraftLineItems,
  updateDraftLineItems,
} from "./lineItemDraftState.js";
import { Sheet } from "./ui.jsx";
import { formatCurrency } from "../../utils/format.js";
import { parseMoneyToSatang } from "../../utils/money.js";

function toInputAmount(satang, allowEmpty = true) {
  const amount = Number(satang || 0) / 100;
  if (!Number.isFinite(amount)) return allowEmpty ? "" : "0.00";
  if (!amount && allowEmpty) return "";
  return amount.toFixed(2);
}

export default function LineItemEditorSection({
  draft,
  categories,
  open,
  onToggle,
  onDraftChange,
  addTestId,
  removeTestIdPrefix,
}) {
  const [activeLineIndex, setActiveLineIndex] = useState(null);
  const lineItems = lineItemsFromDraft(draft);
  const summary = summarizeDraftLineItems(draft);
  const lineItemSummaries = useMemo(() => buildDraftLineItemSummaries(draft, categories), [categories, draft]);
  const hasDifference = lineItems.length > 0 && summary.differenceSatang !== 0;
  const activeLineItem =
    activeLineIndex != null && activeLineIndex >= 0 && activeLineIndex < lineItems.length ? lineItems[activeLineIndex] : null;
  const activeLineSummary =
    activeLineIndex != null && activeLineIndex >= 0 && activeLineIndex < lineItemSummaries.length
      ? lineItemSummaries[activeLineIndex]
      : null;

  useEffect(() => {
    if (!open) setActiveLineIndex(null);
  }, [open]);

  useEffect(() => {
    if (activeLineIndex == null) return;
    if (!lineItems.length) {
      setActiveLineIndex(null);
      return;
    }
    if (activeLineIndex >= lineItems.length) {
      setActiveLineIndex(lineItems.length - 1);
    }
  }, [activeLineIndex, lineItems.length]);

  const patchLineItems = (updater) => {
    onDraftChange((current) => (current ? updateDraftLineItems(current, updater) : current));
  };

  const patchSingleLineItem = (index, updater) => {
    patchLineItems((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? updater(row) : row)),
    );
  };

  const handleAddLineItem = () => {
    const nextIndex = lineItems.length;
    patchLineItems((current) => [
      ...current,
      { name: "", amountSatang: 0, categoryId: draft?.categoryId || "" },
    ]);
    setActiveLineIndex(nextIndex);
  };

  const handleRemoveLineItem = (index) => {
    patchLineItems((current) => current.filter((_row, rowIndex) => rowIndex !== index));
    setActiveLineIndex(null);
  };

  return (
    <>
      <details className="finance-details" open={open}>
        <summary
          className="finance-details-summary bento-summary"
          onClick={(event) => {
            event.preventDefault();
            onToggle?.();
          }}
        >
          <span>แยกรายการ</span>
          <span className="finance-details-caret">{open ? "ซ่อน" : "แสดง"}</span>
        </summary>

        {open ? (
          <div className="finance-details-body">
            <div className="finance-line-items">
              <div className="finance-line-items-head">
                <button
                  type="button"
                  className="ui-btn ui-btn-secondary finance-line-item-add"
                  onClick={handleAddLineItem}
                  data-testid={addTestId}
                >
                  <Plus size={16} />
                  เพิ่มบรรทัด
                </button>
              </div>

              {lineItemSummaries.length ? (
                <div className="finance-line-item-summary-list">
                  {lineItemSummaries.map((item) => (
                    <button
                      key={`line-item-${item.index}`}
                      type="button"
                      className={[
                        "finance-line-item-summary-row",
                        item.isAdjustment ? "is-adjustment" : "",
                      ].filter(Boolean).join(" ")}
                      onClick={() => setActiveLineIndex(item.index)}
                    >
                      <span className="finance-line-item-summary-copy">
                        <span className="finance-line-item-summary-kicker">
                          {item.isAdjustment ? "รายการปรับยอด" : `รายการ ${item.index + 1}`}
                        </span>
                        <span className="finance-line-item-summary-head">
                          <span className="finance-line-item-summary-title">{item.name}</span>
                          {item.isAdjustment ? (
                            <span className="finance-line-item-summary-badge">{item.adjustmentLabel}</span>
                          ) : null}
                        </span>
                        <span className="finance-line-item-summary-meta">{item.metaLabel}</span>
                      </span>
                      <span className="finance-line-item-summary-side">
                        <span className="finance-line-item-summary-amount">
                          {item.amountPrefix}
                          {formatCurrency(item.amountSatang)}
                        </span>
                        <ChevronRight size={16} aria-hidden="true" />
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="finance-line-items-empty">ยังไม่มีบรรทัด</div>
              )}

              {lineItems.length ? (
                <div className="finance-review-summary">
                  <div>
                    <span className="ui-label">ยอดหลัก</span>
                    <div className="finance-row-title">{formatCurrency(draft?.amountSatang || 0)}</div>
                  </div>
                  <div>
                    <span className="ui-label">{summary.hasAdjustments ? "รวมสุทธิ" : "รวมบรรทัด"}</span>
                    <div className="finance-row-title">
                      {formatCurrency(summary.hasAdjustments ? summary.netTotalSatang : summary.grossTotalSatang)}
                    </div>
                  </div>
                  {hasDifference ? (
                    <div className="finance-review-delta">
                      <span className="ui-label">ส่วนต่าง</span>
                      <div
                        className={[
                          "finance-row-title",
                          summary.differenceSatang > 0
                            ? "finance-review-delta-positive"
                            : "finance-review-delta-negative",
                        ].join(" ")}
                      >
                        {formatCurrency(summary.differenceSatang)}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </details>

      <Sheet
        open={open && !!activeLineItem}
        onClose={() => setActiveLineIndex(null)}
        title={activeLineSummary?.name || "แก้ไขบรรทัด"}
        subtitle={activeLineSummary?.isAdjustment ? "ตรวจหมวดและผลกระทบของรายการปรับยอด" : "แก้ไขข้อมูลของรายการย่อยนี้"}
      >
        {activeLineItem ? (
          <div className="finance-form finance-line-item-editor-sheet">
            <section className="finance-form-section">
              <div className="finance-line-item-editor-head">
                <div>
                  <div className="finance-line-item-summary-kicker">
                    {activeLineSummary?.isAdjustment ? "รายการปรับยอด" : `รายการ ${Number(activeLineIndex) + 1}`}
                  </div>
                  <div className="finance-panel-copy">ข้อมูลที่แก้จะอัปเดตกลับไปยังรายการแยกทันที</div>
                </div>
              </div>

              <div className="finance-grid finance-grid-2">
                <label className="finance-field">
                  <span className="ui-label">ชื่อรายการ</span>
                  <input
                    className="ui-input"
                    value={activeLineItem.name || ""}
                    onChange={(event) =>
                      patchSingleLineItem(activeLineIndex, (row) => ({ ...row, name: event.target.value }))
                    }
                  />
                </label>

                <label className="finance-field">
                  <span className="ui-label">จำนวนเงิน</span>
                  <input
                    className="ui-input"
                    inputMode="decimal"
                    value={toInputAmount(activeLineItem.amountSatang)}
                    onChange={(event) =>
                      patchSingleLineItem(activeLineIndex, (row) => ({
                        ...row,
                        amountSatang: parseMoneyToSatang(event.target.value),
                      }))
                    }
                  />
                </label>
              </div>

              <CategoryPresetChooser
                categories={categories}
                value={activeLineItem.categoryId || ""}
                label={activeLineSummary?.isAdjustment ? "หมวดของรายการปรับยอด" : "หมวดของรายการนี้"}
                onChange={(categoryId) =>
                  patchSingleLineItem(activeLineIndex, (row) => ({
                    ...row,
                    categoryId,
                  }))
                }
              />

              <div className="finance-line-item-editor-actions">
                <button
                  type="button"
                  className="ui-btn ui-btn-danger-outline ui-btn-compact finance-line-item-remove"
                  onClick={() => handleRemoveLineItem(activeLineIndex)}
                  data-testid={removeTestIdPrefix ? `${removeTestIdPrefix}-${activeLineIndex}` : undefined}
                >
                  <Trash2 size={14} />
                  ลบบรรทัด
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
