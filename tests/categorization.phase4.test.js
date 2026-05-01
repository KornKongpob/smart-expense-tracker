import test from "node:test";
import assert from "node:assert/strict";

import {
  categorizeReceiptItem,
  learnFromUserCorrection,
} from "../src/domain/categorization/index.js";

const categories = [
  { id: "food", name: "Food" },
  { id: "coffee", name: "Coffee" },
  { id: "groceries", name: "Groceries" },
  { id: "snacks", name: "Snacks" },
  { id: "personal_care", name: "Personal Care" },
  { id: "cleaning", name: "Cleaning" },
  { id: "home", name: "Home" },
  { id: "other", name: "Other" },
  { id: "fees", name: "Fees" },
  { id: "discount", name: "Discount" },
];

test("categorization phase 4: manual override always wins", () => {
  const result = categorizeReceiptItem(
    {
      rawName: "Starbucks latte",
      categoryId: "food",
      manualCategoryId: "coffee",
      userConfirmedCategory: true,
    },
    {
      categories,
      merchants: [{ canonical: "Starbucks", prefs: { expense: { categoryId: "food" } } }],
    },
  );

  assert.equal(result.categoryId, "coffee");
  assert.equal(result.categorySource, "manual_override");
  assert.equal(result.categoryConfidence, 100);
});

test("categorization phase 4: learned correction beats merchant dictionary", () => {
  const learning = learnFromUserCorrection(
    {},
    {
      merchant: "Starbucks",
      itemName: "Starbucks latte",
      categoryId: "coffee",
    },
  );
  const result = categorizeReceiptItem(
    { rawName: "Starbucks latte" },
    {
      categories,
      merchant: "Starbucks",
      learning,
      merchants: [{ canonical: "Starbucks", prefs: { expense: { categoryId: "food" } } }],
    },
  );

  assert.equal(result.categoryId, "coffee");
  assert.equal(result.categorySource, "learned_mapping");
});

test("categorization phase 4: rule beats generic keyword match", () => {
  const result = categorizeReceiptItem(
    { rawName: "coffee subscription" },
    {
      categories,
      rules: [
        {
          enabled: true,
          priority: 1,
          conditions: { keywordContains: "subscription" },
          actions: { setCategoryId: "food" },
        },
      ],
    },
  );

  assert.equal(result.categoryId, "food");
  assert.equal(result.categorySource, "rules_engine");
});

test("categorization phase 4: exact keyword beats fuzzy keyword", () => {
  const exact = categorizeReceiptItem({ rawName: "coffee" }, { categories });
  const fuzzy = categorizeReceiptItem({ rawName: "cofee" }, { categories });

  assert.equal(exact.categoryId, "coffee");
  assert.equal(exact.categorySource, "keyword_exact");
  assert.equal(fuzzy.categoryId, "coffee");
  assert.equal(fuzzy.categorySource, "keyword_fuzzy");
  assert.ok(exact.categoryConfidence > fuzzy.categoryConfidence);
});

test("categorization phase 4: AI suggestion is used only when stronger rules are absent", () => {
  const aiOnly = categorizeReceiptItem(
    { rawName: "mystery line", suggestedCategoryId: "food" },
    { categories },
  );
  const stronger = categorizeReceiptItem(
    { rawName: "coffee", suggestedCategoryId: "food" },
    { categories },
  );

  assert.equal(aiOnly.categoryId, "food");
  assert.equal(aiOnly.categorySource, "ai_suggestion");
  assert.equal(stronger.categoryId, "coffee");
  assert.equal(stronger.categorySource, "keyword_exact");
});

test("categorization phase 4: low confidence item is marked needsReview", () => {
  const result = categorizeReceiptItem(
    { rawName: "unknown thing" },
    { categories, parentCategoryId: "food" },
  );

  assert.equal(result.categoryId, "food");
  assert.equal(result.categorySource, "parent_fallback");
  assert.equal(result.needsReview, true);
});

test("categorization phase 4: Starbucks correction is reused for next item", () => {
  const learning = learnFromUserCorrection(
    {},
    {
      merchant: "Starbucks",
      itemName: "first receipt",
      fromCategoryId: "food",
      toCategoryId: "coffee",
    },
  );
  const result = categorizeReceiptItem(
    { rawName: "next drink" },
    { categories, merchant: "Starbucks", learning },
  );

  assert.equal(result.categoryId, "coffee");
  assert.equal(result.categoryReason, "Learned item correction");
  assert.ok(result.categoryConfidence > 90);
});

test("categorization phase 4: Thai receipt keywords map to sensible categories", () => {
  const rice = categorizeReceiptItem({ rawName: "\u0e02\u0e49\u0e32\u0e27" }, { categories });
  const milk = categorizeReceiptItem({ rawName: "\u0e19\u0e21" }, { categories });
  const toothpaste = categorizeReceiptItem({ rawName: "\u0e22\u0e32\u0e2a\u0e35\u0e1f\u0e31\u0e19" }, { categories });
  const dishSoap = categorizeReceiptItem(
    { rawName: "\u0e19\u0e49\u0e33\u0e22\u0e32\u0e25\u0e49\u0e32\u0e07\u0e08\u0e32\u0e19" },
    { categories },
  );

  assert.equal(rice.categoryId, "groceries");
  assert.equal(milk.categoryId, "groceries");
  assert.equal(toothpaste.categoryId, "personal_care");
  assert.equal(dishSoap.categoryId, "cleaning");
});

test("categorization phase 4: unknown item safely becomes uncategorized fallback", () => {
  const result = categorizeReceiptItem({ rawName: "opaque sku 999" }, { categories });

  assert.equal(result.categoryId, "other");
  assert.equal(result.categorySource, "uncategorized");
  assert.equal(result.needsReview, true);
});
