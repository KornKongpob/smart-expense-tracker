// src/utils/id.js

/**
 * ✅ ID utilities
 * เป้าหมาย:
 * 1) สร้าง id ที่ “ไม่ชนกันง่าย” สำหรับ transactions / accounts / budgets / recurring ฯลฯ
 * 2) ใช้ได้ทั้ง client-side และ server-side
 * 3) มี prefix ชัดเจนเพื่อ debug ง่าย (tx_, acc_, cat_, bud_, rec_, tr_)
 * 4) รองรับการสร้าง “transferId” สำหรับโอนเงิน (ผูก tx 2 รายการเข้าด้วยกัน)
 *
 * หมายเหตุ:
 * - เดิมใช้ Date.now() + Math.random() ก็พอใช้ได้ แต่มีโอกาสชนกันได้ถ้าสร้างเร็วมาก ๆ
 * - โค้ดนี้เพิ่มความปลอดภัยด้วย:
 *   - timestamp base36
 *   - counter ภายใน (กันชนกันใน tick เดียวกัน)
 *   - random segment
 */

// counter ใน runtime นี้ (กันชนกันเวลา generate ติด ๆ กัน)
let __ctr = 0;

// สร้าง random base36 ความยาวคงที่
function rand(len = 8) {
  // Math.random().toString(36) => "0.xxxxx"
  return Math.random().toString(36).slice(2, 2 + len).padEnd(len, "0");
}

function nowBase36() {
  return Date.now().toString(36); // สั้นลง + อ่านง่าย
}

function nextCounter() {
  __ctr = (__ctr + 1) % 1_000_000; // วนได้เยอะพอ
  return __ctr.toString(36).padStart(4, "0");
}

/**
 * ✅ makeId(prefix)
 * - prefix: string เช่น "tx", "acc", "id"
 * - return: `${prefix}_${time}_${ctr}_${rand}`
 */
export function makeId(prefix = "id") {
  const p = String(prefix || "id").trim() || "id";
  return `${p}_${nowBase36()}_${nextCounter()}_${rand(8)}`;
}

/**
 * ✅ generateId
 * - fallback เดิมของโปรเจกต์ (id_...)
 * - ใช้ทั่วไปได้ แต่ถ้าต้องการแยกชนิดให้ใช้ makeId("tx") เป็นต้น
 */
export const generateId = () => makeId("id");

/**
 * ✅ generateTransferId
 * - สำหรับ transfer group id (tr_...)
 * - ใช้ผูก tx ฝั่งโอนออก/โอนเข้า ให้เป็นชุดเดียวกัน
 */
export const generateTransferId = () => makeId("tr");

/**
 * ✅ generateSplitGroupId
 * - สำหรับ split transaction group id (sg_...)
 * - ใช้ผูก tx หลายรายการเข้าด้วยกันเพื่อแสดงเป็น 1 กลุ่มใน UI
 */
export const generateSplitGroupId = () => makeId("sg");

/**
 * (Optional helpers) ถ้าต้องการให้โค้ดส่วนอื่นเรียกได้สะดวกขึ้น
 * ไม่บังคับใช้ แต่ปลอดภัยที่จะมีไว้
 */
export const generateTxId = () => makeId("tx");
export const generateAccountId = () => makeId("acc");
export const generateCategoryId = () => makeId("cat");
export const generateBudgetId = () => makeId("bud");
export const generateRecurringId = () => makeId("rec");
