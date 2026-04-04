# Smart Expense Tracker

Smart Expense Tracker is a mobile-first React + Vite expense app built for iPhone Safari and Add to Home Screen usage. The current production runtime lives in `src/main.jsx -> src/core/AppRoot.jsx -> src/features/app/*`.

## What is in the app

- Accounts with balance correction flows for cash, bank, credit card, and loan accounts
- Manual transaction entry for expense, income, and transfer flows
- Receipt and transfer-slip scanning with Inbox review before approval
- Split receipt persistence using one parent transaction plus linked child transactions
- Supabase-backed runtime data plus offline queueing for manual entries and scans
- PWA shell tuned for iPhone standalone mode

## Local development

```bash
npm install
npm run dev
```

Useful scripts:

- `npm run build`
- `npm run test`
- `npm run test:e2e`
- `npm run lint`

## Runtime architecture

### App shell

- `src/core/AppRoot.jsx` owns the signed-in runtime shell, lazy-loads large screens, and keeps the fixed top header outside the scroll container.
- `src/features/app/ui.jsx` contains the shared runtime `Sheet`, `ScreenShell`, nav, and toast components.
- `src/index.css` contains the active runtime finance shell styles used by the current deployed app.

### State and data

- `src/features/app/AppProvider.jsx` is the runtime data layer and action surface.
- The provider loads Supabase-backed resources, manages the offline queue, and exposes scan/manual/account actions to the runtime screens.
- `src/features/app/transactionDrafts.js` now owns runtime transaction draft normalization, receipt grouping, baht-to-satang conversion, and split save-plan generation.

### Scanning

- Client scan uploads go through `src/services/scanOpenAI.js`.
- The default public endpoint is `VITE_SCAN_API_URL` and points to `/api/scan`.
- Server-side request parsing, provider orchestration, and normalization live in `api/scan.js` and `lib/scan/*`.
- Receipt line validation lives in `lib/scan/receiptValidation.js`.

Current scan behavior:

1. Upload one or more receipt/slip files from the Add screen.
2. Track per-file stages in the runtime UI: queued, preparing, uploading, scanning, validating, done, error.
3. Save receipt scans into `scan_documents` for Inbox review.
4. For expense receipts with 2+ purchased items, approve as one split parent transaction plus linked child rows.
5. Keep transfer-slip approvals on the single-transaction transfer path.

## Split transactions

Runtime split receipt persistence uses nullable linkage fields on `public.transactions`:

- `is_split_parent`
- `is_split_child`
- `split_group_id`
- `split_parent_id`
- `split_index`
- `split_count`
- `split_label`
- `receipt_line_type`
- `adjustment_effect`
- `adjustment_type`

The migration for this pass is:

- `supabase/migrations/20260403_split_transactions_runtime.sql`

It also updates dashboard/account balance SQL helpers so split parents are excluded from aggregates and receipt adjustments are signed correctly.

## Environment variables

### Public client variables

These are safe to expose in the browser bundle:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SCAN_API_URL`
- `VITE_GEMINI_SCAN_API_URL`
- `VITE_APP_BUILD_ID` (optional, recommended for cache/update versioning)

### Server-only variables

Keep these in Vercel Project Settings > Environment Variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ACCOUNT_DIGITS_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_FALLBACK_MODEL`
- `OPENAI_ITEMS_MODEL`
- `OPENAI_TIMEOUT_MS`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_RECEIPT_PROMPT`
- `GEMINI_TIMEOUT_MS`
- `SCAN_API_TOKEN`
- `SCAN_ALLOWED_ORIGINS`
- `SCAN_RATE_LIMIT_PER_MINUTE`
- `SCAN_MAX_JSON_BODY_BYTES`
- `SCAN_MAX_IMAGE_BYTES`
- `SCAN_MAX_UPLOAD_BYTES`
- `SCAN_PROVIDER`

Important deployment note:

- Vite variables that start with `VITE_` are public by design.
- Provider keys must never live in `VITE_*`.
- Updating Vercel environment variables does not change old deployments. Redeploy after env changes so the new values reach the deployed build and functions.

## PWA / iPhone notes

- `index.html`, `public/manifest.json`, and `public/sw.js` now assume iPhone Safari + Add to Home Screen as a primary platform.
- The service worker uses versioned runtime caches, network-first navigation, and update detection instead of a single static cache bucket.
- The app header stays visible while the signed-in runtime content scrolls inside one dedicated scroll container.

## Testing

`tests/utils.edge.test.js` is the main regression harness for runtime-safe logic. It covers:

- money parsing and satang normalization
- receipt grouping and adjustment balancing
- scan request parsing and provider normalization helpers
- planner/account helper logic
- runtime transaction draft normalization and split save plans

Run before shipping:

```bash
npm run test
npm run build
```

## Notes for contributors

- Prefer touching `src/features/app/*` for runtime UX work.
- Keep transfer-slip handling on the transfer path.
- Preserve store and Supabase payload shapes unless a migration is truly required.
- Avoid committing real secrets or environment dumps. Use `.env.example` only as a template.
