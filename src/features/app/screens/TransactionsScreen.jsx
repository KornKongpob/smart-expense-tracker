import { useDeferredValue, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { useExpenseNavigation } from "../navigation.js";
import TransactionEditSheet, {
  TransactionKindIcon,
  buildTransactionAccountLabel,
  buildTransactionDateTimeLabel,
  buildTransactionTitle,
  getTransactionAmountTone,
} from "../TransactionEditSheet.jsx";
import { useExpenseApp } from "../AppProvider.jsx";
import { AmountText, EmptyPanel, ScreenShell, StatusPill } from "../ui.jsx";
import { formatDateLong } from "../../../utils/format.js";

function toId(value) {
  return String(value || "").trim();
}

function buildCategoryOptions(categories, kind) {
  const expense = Array.isArray(categories?.expense) ? categories.expense.filter((category) => category?.isHidden !== true) : [];
  const income = Array.isArray(categories?.income) ? categories.income.filter((category) => category?.isHidden !== true) : [];

  if (kind === "expense") return expense;
  if (kind === "income") return income;
  if (kind === "transfer") return [];

  return [...expense, ...income].sort((left, right) =>
    String(left?.name || "").localeCompare(String(right?.name || ""), "th"),
  );
}

export default function TransactionsScreen() {
  const { navigateToView } = useExpenseNavigation();
  const {
    accounts,
    categories,
    transactionsPage,
    transactionsFilters,
    setTransactionsFilters,
    refreshTransactionsPage,
    loadMoreTransactions,
    exportTransactionsCsv,
    updateTransaction,
    deleteTransaction,
    saving,
  } = useExpenseApp();
  const [activeTransaction, setActiveTransaction] = useState(null);
  const [searchInput, setSearchInput] = useState(transactionsFilters.query || "");
  const deferredSearchInput = useDeferredValue(searchInput);
  const syncedQueryRef = useRef(transactionsFilters.query || "");

  const accountMap = useMemo(
    () => new Map((Array.isArray(accounts) ? accounts : []).map((account) => [toId(account?.id), account])),
    [accounts],
  );
  const categoryOptions = useMemo(
    () => buildCategoryOptions(categories, transactionsFilters.kind),
    [categories, transactionsFilters.kind],
  );
  const historyGroups = useMemo(() => {
    const groups = [];

    for (const transaction of Array.isArray(transactionsPage.items) ? transactionsPage.items : []) {
      const dateKey = String(transaction?.date || "").slice(0, 10) || "unknown";
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.dateKey !== dateKey) {
        groups.push({
          dateKey,
          label: dateKey && dateKey !== "unknown" ? formatDateLong(dateKey) : "ไม่ทราบวันที่",
          items: [transaction],
        });
        continue;
      }
      lastGroup.items.push(transaction);
    }

    return groups;
  }, [transactionsPage.items]);

  const hasActiveFilters =
    transactionsFilters.kind !== "all" ||
    Boolean(transactionsFilters.accountId) ||
    Boolean(transactionsFilters.categoryId) ||
    Boolean(transactionsFilters.query);

  const syncSearchQuery = useEffectEvent((nextQuery) => {
    syncedQueryRef.current = nextQuery;
    setTransactionsFilters((current) =>
      current.query === nextQuery ? current : { ...current, query: nextQuery },
    );
  });

  const refreshHistory = useEffectEvent(() => {
    void refreshTransactionsPage({ silent: true });
  });

  // Only mirror the stored query when it changes from outside this screen (for
  // example the clear-filters button). Comparing against searchInput instead
  // wiped each keystroke before the deferred value had a chance to sync.
  useEffect(() => {
    const nextQuery = transactionsFilters.query || "";
    if (syncedQueryRef.current === nextQuery) return;
    syncedQueryRef.current = nextQuery;
    setSearchInput(nextQuery);
  }, [transactionsFilters.query]);

  useEffect(() => {
    syncSearchQuery(deferredSearchInput);
  }, [deferredSearchInput]);

  useEffect(() => {
    if (transactionsFilters.kind !== "transfer" || !transactionsFilters.categoryId) return;
    setTransactionsFilters((current) => ({ ...current, categoryId: "" }));
  }, [setTransactionsFilters, transactionsFilters.categoryId, transactionsFilters.kind]);

  useEffect(() => {
    refreshHistory();
  }, [
    transactionsFilters.accountId,
    transactionsFilters.categoryId,
    transactionsFilters.kind,
    transactionsFilters.monthKey,
    transactionsFilters.query,
  ]);

  return (
    <ScreenShell
      title="รายการย้อนหลัง"
      subtitle="ค้นหา กรอง แก้ไข ลบ และส่งออก CSV ตามตัวกรองได้"
      headerMode="visible"
      actions={
        <button
          type="button"
          className="ui-btn ui-btn-secondary"
          disabled={saving || transactionsPage.loading}
          onClick={() => void exportTransactionsCsv()}
        >
          ส่งออก CSV
        </button>
      }
    >
      <article className="ui-card finance-panel">
        <div className="finance-panel-head">
          <div>
            <div className="finance-panel-title">ตัวกรอง</div>
            <div className="finance-panel-copy">เลือกเดือน ประเภท บัญชี หมวดหมู่ หรือค้นหาจากชื่อร้านและโน้ต</div>
          </div>
          {hasActiveFilters ? (
            <button
              type="button"
              className="ui-btn ui-btn-secondary"
              onClick={() => {
                syncedQueryRef.current = "";
                setSearchInput("");
                setTransactionsFilters((current) => ({
                  ...current,
                  kind: "all",
                  accountId: "",
                  categoryId: "",
                  query: "",
                }));
              }}
            >
              ล้างตัวกรอง
            </button>
          ) : null}
        </div>

        <div className="finance-form">
          <div className="finance-grid finance-grid-2">
            <label className="finance-field">
              <span className="ui-label">เดือน</span>
              <input
                className="ui-input"
                type="month"
                value={transactionsFilters.monthKey}
                onChange={(event) =>
                  setTransactionsFilters((current) => ({ ...current, monthKey: event.target.value }))
                }
              />
            </label>

            <label className="finance-field">
              <span className="ui-label">ประเภท</span>
              <select
                className="ui-select"
                value={transactionsFilters.kind}
                onChange={(event) =>
                  setTransactionsFilters((current) => ({
                    ...current,
                    kind: event.target.value,
                    categoryId: event.target.value === "transfer" ? "" : current.categoryId,
                  }))
                }
              >
                <option value="all">ทั้งหมด</option>
                <option value="income">รายรับ</option>
                <option value="expense">รายจ่าย</option>
                <option value="transfer">โอน</option>
              </select>
            </label>
          </div>

          <div className="finance-grid finance-grid-2">
            <label className="finance-field">
              <span className="ui-label">บัญชี</span>
              <select
                className="ui-select"
                value={transactionsFilters.accountId}
                onChange={(event) =>
                  setTransactionsFilters((current) => ({ ...current, accountId: event.target.value }))
                }
              >
                <option value="">ทุกบัญชี</option>
                {(Array.isArray(accounts) ? accounts : []).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="finance-field">
              <span className="ui-label">หมวดหมู่</span>
              <select
                className="ui-select"
                value={transactionsFilters.categoryId}
                onChange={(event) =>
                  setTransactionsFilters((current) => ({ ...current, categoryId: event.target.value }))
                }
                disabled={transactionsFilters.kind === "transfer"}
              >
                <option value="">{transactionsFilters.kind === "transfer" ? "ไม่มีหมวดหมู่" : "ทุกหมวดหมู่"}</option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="finance-field">
            <span className="ui-label">ค้นหา</span>
            <input
              className="ui-input"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="พิมพ์ชื่อร้าน โน้ต หรือเลขอ้างอิง"
            />
          </label>
        </div>
      </article>

      <article className="ui-card finance-panel" data-testid="transactions-history">
        <div className="finance-panel-head">
          <div>
            <div className="finance-panel-title">ประวัติรายการ</div>
            <div className="finance-panel-copy">แตะรายการเพื่อเปิดแก้ไข หรือลบจากประวัติย้อนหลัง</div>
          </div>
          {transactionsPage.loading ? <StatusPill tone="default">กำลังโหลด</StatusPill> : null}
        </div>

        {transactionsPage.error ? (
          <div className="finance-panel-copy">{transactionsPage.error}</div>
        ) : null}

        {historyGroups.length ? (
          <div className="finance-form">
            {historyGroups.map((group) => (
              <section key={group.dateKey} className="finance-form-section finance-form-section-compact">
                <div className="finance-section-label">{group.label}</div>
                <div className="finance-list">
                  {group.items.map((transaction) => {
                    const kindKey = String(transaction?.kind || "expense").trim().toLowerCase();
                    const accountLabel = buildTransactionAccountLabel(transaction, accountMap);
                    const dateTimeLabel = buildTransactionDateTimeLabel(transaction);

                    return (
                      <button
                        key={transaction.id}
                        type="button"
                        className="finance-list-button finance-history-button"
                        onClick={() => setActiveTransaction(transaction)}
                        data-testid={`transactions-row-${transaction.id}`}
                      >
                        <div className="finance-row finance-history-row">
                          <div className="finance-row-main">
                            <span
                              className={[
                                "finance-category-icon",
                                "finance-history-icon",
                                `finance-history-icon-${kindKey}`,
                              ].join(" ")}
                            >
                              <TransactionKindIcon kind={transaction.kind} />
                            </span>
                            <div className="finance-account-copy finance-history-copy">
                              <div className="finance-row-title">{buildTransactionTitle(transaction)}</div>
                              {accountLabel ? (
                                <div className="finance-row-meta finance-history-account">{accountLabel}</div>
                              ) : null}
                            </div>
                          </div>

                          <div className="finance-row-side finance-history-side">
                            <AmountText
                              value={transaction.amount_satang}
                              tone={getTransactionAmountTone(transaction.kind)}
                            />
                            {dateTimeLabel ? (
                              <div className="finance-row-meta finance-history-time">{dateTimeLabel}</div>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}

            {transactionsPage.hasMore ? (
              <div className="finance-dashboard-actions">
                <button
                  type="button"
                  className="ui-btn ui-btn-secondary"
                  disabled={transactionsPage.loadingMore}
                  onClick={() => void loadMoreTransactions()}
                >
                  {transactionsPage.loadingMore ? "กำลังโหลด..." : "โหลดเพิ่ม"}
                </button>
              </div>
            ) : null}
          </div>
        ) : transactionsPage.loading ? (
          <div className="finance-panel-copy">กำลังโหลดรายการย้อนหลัง...</div>
        ) : (
          <EmptyPanel
            title="ไม่พบรายการย้อนหลัง"
            copy="ลองเปลี่ยนตัวกรอง หรือเพิ่มรายการใหม่แล้วกลับมาดูที่หน้านี้"
            action={
              <button type="button" className="ui-btn ui-btn-primary" onClick={() => navigateToView("add")}>
                เพิ่มรายการ
              </button>
            }
          />
        )}
      </article>

      <TransactionEditSheet
        transaction={activeTransaction}
        open={Boolean(activeTransaction)}
        onClose={() => setActiveTransaction(null)}
        accounts={accounts}
        categories={categories}
        saving={saving}
        updateTransaction={updateTransaction}
        deleteTransaction={deleteTransaction}
      />
    </ScreenShell>
  );
}
