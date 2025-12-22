// src/store/actions.js
/**
 * Action type constants for App Store (Reducer)
 * เป้าหมาย:
 * - รวม action ทั้งหมดไว้จุดเดียว ป้องกันพิมพ์ผิด/ชื่อไม่ตรงกัน
 * - ทำให้ state transitions ของแอพ “สอดคล้องกัน” และ debug ง่าย
 *
 * NOTE:
 * - ไฟล์นี้ไม่มีเรื่อง UX/UI โดยตรง แต่เป็นแกนสำคัญให้ app ทำงานถูกต้อง
 * - โครงสร้างนี้รองรับการขยายในอนาคต (เช่น UPDATE_CATEGORY, SET_UI ฯลฯ) ได้ง่าย
 */

export const ACTIONS = Object.freeze({
  // boot / navigation
  INIT: "INIT",
  NAVIGATE: "NAVIGATE",

  // transactions
  START_NEW_TRANSACTION: "START_NEW_TRANSACTION",
  START_EDIT_TRANSACTION: "START_EDIT_TRANSACTION",
  UPSERT_TRANSACTION: "UPSERT_TRANSACTION",
  BULK_UPSERT_TRANSACTIONS: "BULK_UPSERT_TRANSACTIONS",
  DELETE_TRANSACTION: "DELETE_TRANSACTION",

  // accounts
  ADD_ACCOUNT: "ADD_ACCOUNT",
  UPDATE_ACCOUNT: "UPDATE_ACCOUNT",
  DELETE_ACCOUNT: "DELETE_ACCOUNT",

  // categories
  ADD_CATEGORY: "ADD_CATEGORY",
  DELETE_CATEGORY: "DELETE_CATEGORY",

  // budgets
  UPSERT_BUDGET: "UPSERT_BUDGET",
  DELETE_BUDGET: "DELETE_BUDGET",

  // recurring
  UPSERT_RECURRING: "UPSERT_RECURRING",
  DELETE_RECURRING: "DELETE_RECURRING",
  APPLY_RECURRING_GENERATION: "APPLY_RECURRING_GENERATION",

  // reset/import
  RESET_ALL: "RESET_ALL",
  IMPORT_BACKUP: "IMPORT_BACKUP",
});
