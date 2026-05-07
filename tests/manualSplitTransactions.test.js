import test from "node:test";
import assert from "node:assert/strict";

import {
  buildManualSplitTransactions,
  normalizeManualSplitLines,
} from "../src/views/add-transaction/helpers/manualSplitTransactions.js";

function idFactory(ids) {
  let index = 0;
  return () => ids[index++] || `generated-${index}`;
}

test("manual split transactions: normalizes split line money as satang", () => {
  const lines = normalizeManualSplitLines([
    { txId: " child-1 ", categoryId: " food ", amountDigits: "120.50", lineNote: " Lunch " },
    { txId: "", categoryId: "", amountDigits: "", lineNote: "" },
    { categoryId: "shopping", amountDigits: "0", lineNote: "needs amount" },
  ]);

  assert.deepEqual(lines, [
    { txId: "child-1", categoryId: "food", amount: 12050, lineNote: "Lunch" },
    { txId: "", categoryId: "shopping", amount: 0, lineNote: "needs amount" },
  ]);
});

test("manual split transactions: builds parent, children, and removed ids for edit flow", () => {
  const plan = buildManualSplitTransactions({
    cleanedLines: [
      { txId: "child-keep", categoryId: "food", amount: 12000, lineNote: "Lunch" },
      { txId: "", categoryId: "shopping", amount: 8000, lineNote: "" },
    ],
    type: "expense",
    accountId: "cash",
    date: "2026-05-07",
    time: "09:30",
    noteText: "Mall receipt",
    refText: "REF-1",
    splitLabel: "Mall receipt",
    initialData: { splitGroupId: "group-1" },
    splitGroupTransactions: [
      { id: "parent-1", isSplitParent: true, category: "mixed" },
      { id: "child-keep", isSplitParent: false },
      { id: "child-delete", isSplitParent: false },
    ],
    initialAttachmentId: "blob-1",
    merchantPatch: { merchant: "Mall" },
    locationPatch: { location: { lat: 13.75, lng: 100.5 } },
    metaPatch: { meta: { slip: { receiverName: "Mall" } } },
    makeId: idFactory(["child-new"]),
    makeSplitGroupId: () => "new-group",
  });

  assert.equal(plan.parentTx.id, "parent-1");
  assert.equal(plan.parentTx.amount, 20000);
  assert.equal(plan.parentTx.category, "mixed");
  assert.equal(plan.parentTx.splitGroupId, "group-1");
  assert.equal(plan.parentTx.merchant, "Mall");
  assert.equal(plan.childTxs.length, 2);
  assert.equal(plan.childTxs[0].id, "child-keep");
  assert.equal(plan.childTxs[0].itemName, "Lunch");
  assert.equal(plan.childTxs[1].id, "child-new");
  assert.equal(plan.childTxs[1].note, "Mall receipt");
  assert.equal(plan.childTxs[1].splitParentId, "parent-1");
  assert.deepEqual(plan.removedIds, ["child-delete"]);
  assert.equal(plan.transactions.length, 3);
});

test("manual split transactions: creates income parent with other_income fallback", () => {
  const plan = buildManualSplitTransactions({
    cleanedLines: [
      { txId: "", categoryId: "salary", amount: 100000, lineNote: "" },
      { txId: "", categoryId: "bonus", amount: 50000, lineNote: "" },
    ],
    type: "income",
    accountId: "bank",
    date: "2026-05-07",
    makeId: idFactory(["parent-id", "child-1", "child-2"]),
    makeSplitGroupId: () => "income-group",
  });

  assert.equal(plan.parentTx.id, "parent-id");
  assert.equal(plan.parentTx.type, "income");
  assert.equal(plan.parentTx.category, "other_income");
  assert.equal(plan.parentTx.note, "Split");
  assert.equal(plan.childTxs[0].type, "income");
});
