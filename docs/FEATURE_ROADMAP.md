# Smart Expense – Feature Roadmap & Bug Fix Plan

แผนยกระดับ Smart Expense ให้เป็น app บันทึกรายรับรายจ่าย + วางแผนการเงินที่ใช้งานจริงได้ ด้วยการเพิ่มฟีเจอร์หลักและไล่แก้บั๊กค้างในชุด active shell (`src/features/app/*`) แบ่งเป็น 5 เฟส ทำทีละชั้นให้ verify ได้ตลอดทาง

เป้าหมายภาพรวม: ผู้ใช้บันทึกรายจ่ายประจำอัตโนมัติ, ค้น/แก้/ลบรายการย้อนหลังได้, เห็นกราฟเทียบเดือน + breakdown หมวด, ได้รับแจ้งเตือนงบ/หนี้ใกล้ครบกำหนดในที่เดียว, และบั๊ก UX ที่ค้างอยู่ถูกปิดให้เรียบร้อย

---

## สถานะปัจจุบัน

| Phase | หัวข้อ | สถานะ |
| ----- | ------ | ----- |
| 1 | Bug & cleanup pass (quick wins) | กำลังทำ (2/4 เสร็จ) |
| 2 | Transactions history screen | ยังไม่เริ่ม |
| 3 | Recurring transactions | ยังไม่เริ่ม |
| 4 | Analytics + Notification Center | ยังไม่เริ่ม |
| 5 | Polish, docs, regression | ยังไม่เริ่ม |

---

## Phase 1 — Bug & cleanup pass

จุดประสงค์: ปิดบั๊กที่เห็นชัดเจนก่อน เพื่อให้ phase ถัดไปทำงานบนฐานที่นิ่ง

- [x] **แก้ toast ภาษาไทยเพี้ยน (mojibake)**
  - `src/features/app/AppProvider.jsx` มี toast ใน planner 4 จุดเขียนเป็น UTF-8 ที่ตีความเป็น Latin-1 ผิด
  - แก้ให้เป็นข้อความไทยปกติ: `นำแผน … มาใช้แล้ว`, `รับคำแนะนำแล้ว`, `คงงบเดิมไว้แล้ว`, `ล็อกงบหมวดนี้แล้ว`

- [x] **ลบ dead code ใน DashboardScreen**
  - ลบ `_buildTransactionMeta`, `_categoryMap`, `allCategories` ที่เขียนแต่ไม่ถูกใช้
  - คง helper จริงที่ใช้งาน (`buildTransactionAccountLabel`, `buildTransactionDateTimeLabel`)

- [ ] **Validation ของ PlannerScreen**
  - `submitGoal` / `submitDebtPlan` ยอมให้ `targetAmount`/`targetPayment` เป็น 0 ได้
  - เพิ่ม guard บน UI + disable ปุ่มบันทึกจนกว่าจะครบ
  - กันซ้ำเมื่อผู้ใช้กดบันทึกเร็วสองครั้ง (reuse `saving`)

- [ ] **Accounts deeplink reliability**
  - ถ้า editor เปิดอยู่ deeplink ปัจจุบันจะ drop เงียบ
  - ปรับให้ปิด editor ปัจจุบันก่อนแล้วเปิด target account ใหม่

- [ ] **Verification**
  - `npm run lint` + `npm run build`
  - ทดสอบ manual: Planner apply plan → toast ภาษาไทยถูก

ไฟล์หลัก: `src/features/app/AppProvider.jsx`, `src/features/app/screens/DashboardScreen.jsx`, `src/features/app/screens/PlannerScreen.jsx`, `src/features/app/screens/AccountsScreen.jsx`

---

## Phase 2 — Transactions history screen

จุดประสงค์: ผู้ใช้ดู/ค้น/แก้/ลบรายการย้อนหลังได้จริง ไม่ติดเพดาน 12 รายการบน Dashboard

- เพิ่ม provider state: `transactionsPage`, `transactionsFilters`, `loadMoreTransactions`
- route ใหม่ `/transactions` พร้อม label `รายการย้อนหลัง`
- UI: เลือกเดือน, filter kind (ทั้งหมด/รายรับ/รายจ่าย/โอน), account picker, category picker, search box
- list แบบ group by date + infinite scroll / `โหลดเพิ่ม`
- edit/delete: reuse sheet จาก Dashboard ผ่าน shared component `TransactionEditSheet`
- ปุ่ม `ส่งออก CSV` ส่งออกตาม filter
- Dashboard: เพิ่ม `ดูทั้งหมด` ลิงก์ไปหน้านี้

ไฟล์หลัก: `src/features/app/screens/TransactionsScreen.jsx` (ใหม่), `src/features/app/TransactionEditSheet.jsx` (ใหม่), `src/features/app/AppProvider.jsx`, `src/features/app/routes.js`, `src/core/AppRoot.jsx`, `src/features/app/screens/DashboardScreen.jsx`, `src/features/app/ui.jsx`

---

## Phase 3 — Recurring transactions

จุดประสงค์: ตั้งกฎรายการประจำ (เงินเดือน/ค่าบ้าน/Netflix ฯลฯ) แล้ว app สร้างรายการจริงอัตโนมัติตามรอบ

- Supabase migration `supabase/migrations/20260417_recurring_rules.sql`
  - Table `public.recurring_rules` (id, user_id, kind, amount_satang, account ids, category, merchant, note, frequency daily|weekly|monthly|yearly, interval_count, anchor_day, start_date, end_date, last_generated_date, enabled)
  - RLS + policies ตามรูปแบบเดิม
  - `transactions.source_recurring_id` column ใหม่
- `AppProvider`: state `recurringRules`, `recurringDueToday` + methods `saveRecurringRule`, `deleteRecurringRule`, `toggleRecurringRule`, `runRecurringNow`
- หน้าใหม่ `RecurringScreen` ที่ `/recurring`
  - list แบ่งกลุ่ม: เปิดใช้ / ถึงรอบ / ปิดอยู่
  - Sheet เพิ่ม/แก้ไข rule (มี preview รอบถัดไป)
- Dashboard widget: บอกจำนวน rule ที่ถึงรอบ + ปุ่ม `Run ตอนนี้`
- Extend `src/utils/recurring.js` ให้รองรับ daily + yearly
- Tests: เพิ่ม regression ใน `tests/utils.edge.test.js`

ไฟล์หลัก: `supabase/migrations/20260417_recurring_rules.sql` (ใหม่), `src/features/app/screens/RecurringScreen.jsx` (ใหม่), `src/features/app/AppProvider.jsx`, `src/utils/recurring.js`, `tests/utils.edge.test.js`

---

## Phase 4 — Analytics + Notification Center

จุดประสงค์: Dashboard เล่าข้อมูลได้ลึกขึ้น และมีศูนย์แจ้งเตือนรวม

- **Dashboard analytics**
  - เทียบเดือนก่อน (MoM) รายรับ/รายจ่าย/สุทธิ + % เปลี่ยนแปลง
  - Category breakdown (donut หรือ stacked bar) จาก `top_categories`
  - Spend heatmap รายวันจาก `cashflowSeries`
  - reuse `recharts`

- **Notification Center**
  - Supabase migration `supabase/migrations/20260417_notifications.sql`
    - `notifications(id, user_id, kind, title, body, data, is_read, created_at, read_at)`
    - RLS + policies
  - Provider: โหลด + expose `notifications`, `markNotificationRead`, `dismissNotification`
  - Client-side generator: budget over, debt due, recurring due, scan pending (dedupe ด้วย kind + data key)
  - UI: Bell icon ใน header + badge unread + sheet list + ปุ่ม `อ่านทั้งหมด`

- **Budget alert inline**
  - AddScreen: เตือนเมื่อยอดจะทำให้งบหมวดเกิน 100%

ไฟล์หลัก: `supabase/migrations/20260417_notifications.sql` (ใหม่), `src/features/app/NotificationCenter.jsx` (ใหม่), `src/features/app/AppProvider.jsx`, `src/features/app/screens/DashboardScreen.jsx`, `src/features/app/screens/AddScreen.jsx`, `src/core/AppRoot.jsx`

---

## Phase 5 — Polish + Docs + Regression

- **Smart defaults ใน AddScreen**
  - merchant autocomplete จาก history (reuse `normalizeMerchantKey`)
  - จำ category/account ล่าสุดของแต่ละ kind

- **Docs**
  - อัปเดต `README.md` เพิ่มหัวข้อ Recurring, Transactions, Notifications
  - ระบุลำดับ migration ที่ต้อง apply

- **Regression**
  - `npm run lint`, `npm run test`, `npm run build`
  - `npm run test:e2e` ถ้า environment พร้อม
  - manual smoke: add manual → add recurring → run recurring → edit/search transactions → planner apply → notification center

---

## ลำดับการ commit (เป้าหมาย)

- `chore(app): fix mojibake toasts and dead dashboard helpers` (Phase 1 batch 1) — ✅ ทำแล้ว
- `feat(planner): validate goal/debt save and guard duplicate submits` (Phase 1 batch 2)
- `fix(accounts): ensure deeplink opens target account even when editor is busy` (Phase 1 batch 3)
- `feat(transactions): add dedicated history screen with filters and csv export` (Phase 2)
- `feat(recurring): add recurring rules schema, provider and screen` (Phase 3)
- `feat(dashboard): richer analytics with MoM, breakdown, heatmap` (Phase 4 batch 1)
- `feat(notifications): add notification center with unified alerts` (Phase 4 batch 2)
- `feat(add): merchant autocomplete and smart defaults` (Phase 5)
- `docs(readme): document new recurring/transactions/notifications features` (Phase 5)

---

## ข้อควรระวัง

- Migration ใหม่ต้อง apply บน Supabase ก่อนที่ client ใหม่จะใช้งานได้
- `AppProvider.jsx` >2600 บรรทัดแล้ว; การเพิ่ม recurring/notifications อาจต้องแตกเป็น sub-module/helper ใน phase 3-4
- Client-side notification generator ต้อง dedupe (`kind + data->>'key'`) เพื่อไม่ให้ซ้ำเวลาผู้ใช้ refresh หลายครั้ง
- Recurring run: คง safety cap 200 rules/run + UI แจ้งเมื่อถูก truncate

## สิ่งที่ยัง NOT รวมในรอบนี้

- Push notification ผ่าน service worker จริง (รอบนี้เป็น in-app bell)
- Multi-currency
- Bank API / Open Banking integration
- Shared account (multi-user)
- PDF report export (CSV พอสำหรับรอบนี้)
