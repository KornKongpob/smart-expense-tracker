# Smart Expense Tracker

Smart Expense Tracker is a React + Vite personal finance app focused on fast daily entry, receipt/slip scanning, offline-friendly persistence, and finance-safe state handling.

## What the app includes

- Manual transaction entry for expense, income, transfer, and credit card payment flows
- Receipt / transfer slip scanning with queue review and Inbox approval flow
- Accounts, budgets, categories, recurring transactions, rules, merchant memory, stats, onboarding, and PIN lock
- Local-first persistence with backup import/export and attachment storage

## Tech stack

- React 19
- Vite 7
- ESLint 9
- Zod for import validation
- Recharts for charts
- Lucide React for icons
- Tesseract.js + server-side AI scan routes for OCR / extraction workflows

## Quick start

```bash
npm install
npm run dev
```

Available scripts:

- `npm run dev` - start the Vite app
- `npm run build` - production build
- `npm run preview` - preview the production build
- `npm run lint` - run ESLint
- `npm run test` - run the current Node test harness in `tests/utils.edge.test.js`
- `npm run test:coverage` - run tests with Node coverage output

## Project structure

```text
src/
  app/                App shell, routing, global alerts, modal coordination
  components/         Reusable UI building blocks
  constants/          Shared presets and constants
  schemas/            Zod schemas for import validation
  services/           Persistence, scan client, blob storage, app services
  store/              App store provider, reducer logic, selectors, actions
  utils/              Financial, OCR post-process, ids, formatting, matching helpers
  views/              Screen-level features
    add-transaction/  Add/edit transaction flow, scan queue, helper modules, hooks
api/
  scan.js             Main scan API route
  gemini-scan.js      Gemini scan API route
  health.js           Minimal health endpoint
shared/
  scanSchema.js       Shared scan response/request contract helpers
lib/scan/
  access.js           Scan route access/security helpers
  normalize.js        Shared normalization/error helpers
  providers/          Scan provider orchestration
  rateLimit.js        In-memory best-effort rate limiter
  requestParse.js     Shared scan request parsing and validation helpers
tests/
  utils.edge.test.js  Current regression harness for utility/helper behavior
```

## App architecture

### UI shell

- `src/main.jsx` bootstraps the app, initializes theme state, and applies zoom-prevention behavior.
- `src/app/App.jsx` is the application shell. It wires navigation, global confirmation dialogs, toast alerts, onboarding/PIN screens, and route-to-view selection.

### State and persistence

- `src/store/store.jsx` is the main app store provider and action surface.
- `src/services/storage.js` is the primary local persistence layer.
- App state is saved in a versioned localStorage record.
- Binary attachments are stored separately via blob storage so large files do not inflate the main state payload.

Important persistence notes:

- Money values are treated as **satang** as the canonical storage unit unless a payload explicitly says `moneyUnit: "baht"`.
- Backup import accepts both flat state and wrapped `{ v, exportedAt, data }` payloads.
- Storage save failures emit `STORAGE_SAVE_ERROR_EVENT`, which the app shell surfaces to the user as a toast so save failures are not silent.

### Scan pipeline

- Client scan entry lives in `src/services/scanOpenAI.js` and the add-transaction scan flow.
- The default client endpoint is `/api/scan`, overrideable via `VITE_SCAN_API_URL`.
- Server routes live in `api/scan.js` and `api/gemini-scan.js`.
- Shared request parsing, normalization, and rate-limit helpers live under `lib/scan/`.
- Shared scan contract validation lives in `shared/scanSchema.js`.

Typical scan flow:

1. User adds receipt/slip files in `AddTransactionView`
2. Client prepares data URLs and calls the scan endpoint
3. Server validates request size, MIME type, and access rules
4. Provider response is normalized into the shared scan contract
5. User reviews queue items, then saves directly or sends to Inbox

## Development workflow

### Recommended local loop

1. Start the frontend with `npm run dev`
2. Run `npm run lint`
3. Run `npm run test`
4. Run `npm run build` before finishing a larger refactor

### Working in the add-transaction flow

The biggest UI hotspot is `src/views/add-transaction/AddTransactionView.jsx`.

That feature already has some extracted helpers and hooks:

- `hooks/useScanQueue.js`
- `hooks/useTransactionDraft.js`
- `hooks/useTransferFlow.js`
- `helpers/inputHelpers.js`
- `helpers/queueTypeHelpers.js`

If you continue refactoring there, prefer extracting pure helper logic or narrow hooks first, then add regression tests in `tests/utils.edge.test.js`.

## Environment variables

### Client

- `VITE_SCAN_API_URL`
  - Optional
  - Defaults to `/api/scan`

### Scan / server routes

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_FALLBACK_MODEL`
- `OPENAI_ITEMS_MODEL`
- `OPENAI_TIMEOUT_MS`
- `SCAN_PROVIDER`
- `SCAN_MAX_JSON_BODY_BYTES`
- `SCAN_MAX_UPLOAD_BYTES`
- `SCAN_MAX_IMAGE_BYTES`
- `SCAN_RATE_LIMIT_PER_MINUTE`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_RECEIPT_PROMPT`
- `GEMINI_TIMEOUT_MS`
- `NODE_ENV`

If API keys are missing, AI scan routes will return errors rather than silently degrading.

## Backup and data safety

- Export/import is managed from `MoreView`
- Import warns when payload validation is incomplete instead of hard-crashing the app
- Missing `moneyUnit` on old backups is treated as `satang` to avoid x100 amount inflation
- Storage failures are surfaced in the UI so users can export backup and clean up large attachments

## Current high-risk files

These are the main maintenance hotspots when planning refactors:

- `src/views/add-transaction/AddTransactionView.jsx`
- `api/scan.js`
- `src/views/InboxView.jsx`
- `src/views/AccountsView.jsx`
- `src/store/store.jsx`

## Testing status

Current regression coverage is centered on `tests/utils.edge.test.js` and focuses on:

- money parsing and rounding
- transfer grouping
- receipt adjustments and categorization
- recurring logic
- duplicate detection helpers
- scan post-processing
- storage hardening
- scan request parsing
- add-transaction queue type helper behavior

When extracting pure logic, prefer extending this harness before changing UI-heavy code.
