# Codebase Review (Thai)

เอกสารนี้สรุปการอ่านโค้ดทั้งโปรเจกต์ `smart-expense-tracker` แบบภาพรวมเชิงสถาปัตยกรรมและจุดเสี่ยงในการดูแลต่อ

## 1) ภาพรวมโครงสร้าง

- Frontend: React + Vite (`src/`)
- API (serverless style): `api/`
- State management หลักอยู่ที่ `src/store/store.jsx`
- Business logic ถูกแยกเป็น utility จำนวนมากใน `src/utils/`

## 2) โมดูลหลัก

### 2.1 Entry + App shell
- `src/main.jsx` เป็นจุดเริ่มรันแอป, mount `<AppStoreProvider><App /></AppStoreProvider>` และมี logic ปิด browser zoom ตาม product requirement
- `src/app/App.jsx` เป็นตัว router/screen switch ระดับ top ของแอป
- `src/components/PhoneShell.jsx` และ `src/components/Navbar.jsx` ทำหน้าที่เป็น layout/navigation หลัก

### 2.2 Store / State
- `src/store/store.jsx` (ไฟล์ใหญ่ที่สุดฝั่ง state) มีทั้ง initial state, reducer, provider, hook `useAppStore`
- `src/store/reducer.js` และ `src/store/actions.js` มีโครงสร้าง action/reducer แบบแยกชั้นไว้ด้วย
- `src/store/selectors.js` รวม selector + helper เชิงคำนวณจำนวนมาก (totals, duplicates, date helpers)

### 2.3 Views (หน้าหลักของแอป)
- หน้าขนาดใหญ่และมี business flow หนัก:
  - `src/views/AddTransactionView.jsx`
  - `src/views/InboxView.jsx`
  - `src/views/AccountsView.jsx`
- หน้ารายงาน/ตั้งค่า/จัดการข้อมูล:
  - `DashboardView`, `StatsView`, `BudgetsView`, `CategoriesView`, `RulesView`, `RecurringView`, `MerchantLibraryView`, `MoreView`

### 2.4 Services
- `src/services/scanOpenAI.js` และ `src/services/scanFree.js` ดูแล OCR/AI parsing ฝั่ง client
- `src/services/gemini.js` เชื่อมบริการ slip parsing
- `src/services/storage.js` ดูแล persistence/backup/restore
- `src/services/blobStore.js` ดูแล blob attachment lifecycle

### 2.5 Utilities
- กลุ่มการเงิน/รูปแบบข้อมูล: `money.js`, `format.js`, `installments.js`
- กลุ่มกฎธุรกิจ: `rulesEngine.js`, `transferGrouping.js`, `receiptCategorizer.js`, `receiptAdjustments.js`
- กลุ่มบัญชี/merchant/location: `accountMatch.js`, `merchantDictionary.js`, `location.js`

### 2.6 API
- `api/scan.js` เป็น endpoint หลักที่มี logic หนาแน่น (auth/rate limit/body parsing/AI response handling)
- `api/gemini-scan.js` เป็น endpoint แยกสำหรับ Gemini scan
- `api/scan-receipt.js` เป็น alias ไปยัง `scan.js`
- `api/health.js` health check

## 3) สถิติขนาดไฟล์ (จุดที่ควรโฟกัส)

ไฟล์ที่มีขนาดใหญ่มากและมีแนวโน้มเป็น maintenance hotspot:

1. `src/views/AddTransactionView.jsx` ~5655 บรรทัด
2. `api/scan.js` ~2309 บรรทัด
3. `src/views/InboxView.jsx` ~2518 บรรทัด
4. `src/views/AccountsView.jsx` ~1882 บรรทัด
5. `src/store/store.jsx` ~1705 บรรทัด
6. `src/services/scanOpenAI.js` ~946 บรรทัด
7. `src/store/selectors.js` ~882 บรรทัด
8. `src/views/StatsView.jsx` ~832 บรรทัด

## 4) ข้อสังเกตทางสถาปัตยกรรม

1. **Single-file complexity สูงในหลายจุด**  
   โดยเฉพาะ View ใหญ่, API scan, และ store ทำให้ cognitive load สูงเวลา debug

2. **Business logic แยก utility ดีพอสมควร**  
   มีการดึง logic ไปไว้ใน `src/utils/*` จำนวนมาก ช่วยให้ reusable ได้

3. **Risk เรื่อง duplicate responsibility**  
   มีทั้ง `src/store/store.jsx` และ `src/store/reducer.js` ที่มี reducer/initial state จึงควรตรวจให้ชัดว่าบทบาทไม่ทับซ้อน

4. **AI scanning pipeline หลายชั้น**  
   มีทั้งฝั่ง client service (`scanOpenAI`, `scanFree`, `gemini`) และ API endpoint (`api/scan.js`, `api/gemini-scan.js`) ควรมี contract/schema กลางเพื่อกัน drift

## 5) ข้อเสนอแนะเชิงปรับปรุง (ไม่เปลี่ยนพฤติกรรม)

1. แยก `AddTransactionView.jsx` เป็น feature subcomponents + hooks ตามโดเมน (amount, category, receipt, transfer)
2. แยก `api/scan.js` เป็น module ย่อยตาม concern: auth/cors/rate-limit/validation/provider-adapter/response-normalizer
3. ย้ายกฎ validation schema ไปไว้ไฟล์กลาง (เช่น zod schema shared)
4. เพิ่ม unit tests ใน utils ที่กระทบยอดเงิน/transfer/receipt เพื่อป้องกัน regression
5. ทำ architecture map สั้น ๆ ใน README ให้ onboarding เร็วขึ้น

## 6) สรุปสั้น

โค้ดเบสนี้มีฟีเจอร์ธุรกิจหนาแน่นและครอบคลุม use case จริงเยอะ แต่มีไฟล์ขนาดใหญ่มากหลายจุด จึงควรทยอย refactor แบบ incremental โดยเริ่มจากไฟล์ที่เกิน 1,000 บรรทัดก่อน เพื่อให้ทดสอบ/แก้บั๊ก/เพิ่มฟีเจอร์ได้ปลอดภัยขึ้น
