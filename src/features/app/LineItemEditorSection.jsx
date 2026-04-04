import { Plus, Trash2 } from "lucide-react";

import CategoryPresetChooser from "./CategoryPresetChooser.jsx";
import { lineItemsFromDraft, summarizeDraftLineItems, updateDraftLineItems } from "./lineItemDraftState.js";
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
  const lineItems = lineItemsFromDraft(draft);
  const summary = summarizeDraftLineItems(draft);
  const hasDifference = lineItems.length > 0 && summary.differenceSatang !== 0;

  const patchLineItems = (updater) => {
    onDraftChange((current) => (current ? updateDraftLineItems(current, updater) : current));
  };

  return (
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
                className="ui-btn ui-btn-secondary"
                onClick={() =>
                  patchLineItems((current) => [
                    ...current,
                    { name: "", amountSatang: 0, categoryId: draft?.categoryId || "" },
                  ])
                }
                data-testid={addTestId}
              >
                <Plus size={16} />
                เพิ่มบรรทัด
              </button>
            </div>

            {lineItems.length ? (
              lineItems.map((item, index) => (
                <div key={`line-item-${index}`} className="finance-line-item-card">
                  <div className="finance-line-item-card-head">
                    <div className="finance-line-item-kind">
                      {item.receiptLineType === "adjustment" ? "รายการปรับยอด" : `รายการ ${index + 1}`}
                    </div>
                    <button
                      type="button"
                      className="ui-btn ui-btn-secondary finance-line-item-remove"
                      onClick={() =>
                        patchLineItems((current) => current.filter((_row, rowIndex) => rowIndex !== index))
                      }
                      data-testid={removeTestIdPrefix ? `${removeTestIdPrefix}-${index}` : undefined}
                    >
                      <Trash2 size={14} />
                      ลบบรรทัด
                    </button>
                  </div>

                  <div className="finance-grid finance-grid-2">
                    <label className="finance-field">
                      <span className="ui-label">ชื่อรายการ</span>
                      <input
                        className="ui-input"
                        value={item.name || ""}
                        onChange={(event) =>
                          patchLineItems((current) =>
                            current.map((row, rowIndex) =>
                              rowIndex === index ? { ...row, name: event.target.value } : row,
                            ),
                          )
                        }
                      />
                    </label>

                    <label className="finance-field">
                      <span className="ui-label">จำนวนเงิน</span>
                      <input
                        className="ui-input"
                        inputMode="decimal"
                        value={toInputAmount(item.amountSatang)}
                        onChange={(event) =>
                          patchLineItems((current) =>
                            current.map((row, rowIndex) =>
                              rowIndex === index
                                ? { ...row, amountSatang: parseMoneyToSatang(event.target.value) }
                                : row,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>

                  <CategoryPresetChooser
                    categories={categories}
                    value={item.categoryId || ""}
                    label={item.receiptLineType === "adjustment" ? "หมวดของรายการปรับยอด" : "หมวดของรายการนี้"}
                    onChange={(categoryId) =>
                      patchLineItems((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, categoryId } : row,
                        ),
                      )
                    }
                  />
                </div>
              ))
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
  );
}
