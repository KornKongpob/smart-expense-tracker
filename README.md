# Smart Expense Tracker

Smart Expense Tracker is a mobile-first Next.js App Router expense app built for iPhone Safari and Add to Home Screen usage. The current production runtime lives in `app/* -> src/core/AppRoot.jsx -> src/features/app/*`.

## What is in the app

- Accounts with balance correction flows for cash, bank, credit card, and loan accounts
- Manual transaction entry for expense, income, and transfer flows
- Transactions history with month/kind/account/category filters, edit/delete, and CSV export
- Receipt and transfer-slip scanning with Inbox review before approval
- Split receipt persistence using one parent transaction plus linked child transactions
- Deterministic money coach cards on Dashboard, generated locally from budgets, transactions, accounts, categories, and recurring rules
- Planner flows for budgets, savings goals, debt payoff, and monthly recommendation snapshots
- Recurring transaction rules for daily, weekly, monthly, and yearly automation
- Dashboard analytics plus an in-app notification center for budget/debt/recurring/inbox alerts
- Merchant autocomplete and per-kind account/category defaults on the Add screen
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

- `app/(runtime)/*` defines the canonical routes for the signed-in app.
- `src/core/AppRoot.jsx` owns the signed-in runtime shell, resolves the active pathname, lazy-loads large screens, and keeps the fixed top header outside the scroll container.
- `src/features/app/ui.jsx` contains the shared runtime `Sheet`, `ScreenShell`, nav, and toast components.
- `src/index.css` contains the active runtime finance shell styles used by the current deployed app.

### State and data

- `src/features/app/AppProvider.jsx` is the runtime data layer and action surface.
- The provider loads Supabase-backed resources, manages the offline queue, and exposes scan/manual/account actions to the runtime screens.
- `src/features/app/transactionDrafts.js` now owns runtime transaction draft normalization, receipt grouping, baht-to-satang conversion, and split save-plan generation.
- Recurring rule normalization lives in `src/features/app/recurringState.js`.
- Runtime notification synthesis and dedupe helpers live in `src/features/app/notificationState.js`.
- The history, recurring, and notification-center screens are all wired through the same provider surface.
- Transactions keep `date` as `YYYY-MM-DD` for monthly/daily totals. Scanned receipts and slips may also set optional `transactionTime` as `HH:mm` or `HH:mm:ss`; old rows without this field are still valid.
- Category rows can set `assignable: false` for parent/group/system categories. Historical transactions using old broad category IDs remain displayable, but new transaction and receipt-line assignment should prefer assignable leaf IDs.

### Scanning

- Client scan uploads go through `src/services/scanOpenAI.js`.
- The default public endpoint is `NEXT_PUBLIC_SCAN_API_URL` and points to `/api/scan`.
- Server-side request parsing, provider orchestration, and normalization live in `api/scan.js`, `app/api/*`, and `lib/scan/*`.
- Receipt line validation lives in `lib/scan/receiptValidation.js`.
- Shared scan date/time parsing lives in `src/utils/scanDateTime.js`.
- Account-aware scan transaction classification lives in `src/utils/scanTransactionType.js`.

Current scan behavior:

1. Upload one or more receipt/slip files from the Add screen.
2. Track per-file stages in the runtime UI: queued, preparing, uploading, scanning, validating, done, error.
3. Save receipt scans into `scan_documents` for Inbox review.
4. Normalize scan dates and optional transaction times before saving drafts or transactions.
5. For expense receipts with 2+ purchased items, approve as one split parent transaction plus linked child rows.
6. Keep transfer-slip approvals on the single-transaction transfer path.
7. Classify transfer slips on the client with account ownership: own source only becomes an expense, own destination only becomes income, own source plus own destination becomes transfer, and own bank to own credit card becomes `credit_payment`.

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

Split receipt parents are UI grouping rows: they hold the paid total and shared receipt metadata, but are excluded from reports, budgets, and balances. Split child rows are the reportable lines and carry the item/adjustment amount, leaf category, split index/group fields, merchant/reference, attachment id, file hash, date, and optional `transactionTime`.

The migration for this pass is:

- `supabase/migrations/20260403_split_transactions_runtime.sql`

It also updates dashboard/account balance SQL helpers so split parents are excluded from aggregates and receipt adjustments are signed correctly.

## Attachments

- Scanned receipt/slip files are stored through `src/services/blobStore.js` using the existing IndexedDB blob store.
- Transactions store only attachment identifiers and metadata such as `attachmentId` and `fileHash`.
- Detail views resolve previews with `src/utils/useBlobInfo.js` / `src/utils/useBlobUrl.js`; do not introduce a second attachment storage path.
- Parent and child split transactions should share the same `attachmentId` so the original scan remains accessible from the grouped detail view.

## Money coach

- `src/utils/moneyCoach.js` exports `generateMoneyCoachInsights(...)`.
- The coach is deterministic and offline: it does not call OpenAI, Gemini, or any external service.
- Inputs are transactions, accounts, categories, budgets, recurring rules, and `todayISO`.
- Outputs are capped coaching cards with `id`, `severity`, `title`, `message`, `metric`, `actionLabel`, and optional action/category/account targets.
- Calculations exclude split parents and transfers from spending/income totals, and ignore `transactionTime` for monthly totals.

## Recurring and Notifications

- `/transactions` is the dedicated history screen with filters, edit/delete, pagination, and CSV export.
- `/recurring` is the recurring-rules screen with create/edit/pause/delete actions and a manual `Run now` trigger.
- The dashboard now includes month-over-month cards, category breakdown, a spend heatmap, and a recurring summary card.
- The header bell opens a unified notification center for budget alerts, debt reminders, recurring due items, and pending inbox scans.

## Database migrations

Apply migrations in filename order. The current runtime expects at least:

- `supabase/migrations/20260328_initial_redesign.sql`
- `supabase/migrations/20260329_category_preferences.sql`
- `supabase/migrations/20260401_finance_planner.sql`
- `supabase/migrations/20260402_account_balance_snapshot.sql`
- `supabase/migrations/20260403_split_transactions_runtime.sql`
- `supabase/migrations/20260413_income_budget_planner.sql`
- `supabase/migrations/20260415_planner_monthly_plans.sql`
- `supabase/migrations/20260417_recurring_rules.sql`
- `supabase/migrations/20260417_notifications.sql`

## Environment variables

### Public client variables

These are safe to expose in the browser bundle:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SCAN_API_URL`
- `NEXT_PUBLIC_GEMINI_SCAN_API_URL`
- `NEXT_PUBLIC_APP_BUILD_ID` (optional, recommended for cache/update versioning)

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

- Next.js variables that start with `NEXT_PUBLIC_` are public by design.
- Provider keys must never live in `NEXT_PUBLIC_*`.
- Updating Vercel environment variables does not change old deployments. Redeploy after env changes so the new values reach the deployed build and functions.

## PWA / iPhone notes

- `app/layout.js`, `public/manifest.json`, and `public/sw.js` assume iPhone Safari + Add to Home Screen as a primary platform.
- The service worker uses versioned runtime caches, network-first navigation, and update detection instead of a single static cache bucket.
- The app header stays visible while the signed-in runtime content scrolls inside one dedicated scroll container.

## Testing

`tests/utils.edge.test.js` is the main regression harness for runtime-safe logic. It covers:

- money parsing and satang normalization
- receipt grouping and adjustment balancing
- recurring schedule helpers
- scan request parsing and provider normalization helpers
- planner/account helper logic
- runtime transaction draft normalization and split save plans

Run before shipping:

```bash
npm run lint
npm run test
npm run build
```

## Notes for contributors

- Prefer touching `src/features/app/*` for runtime UX work.
- Keep transfer-slip handling on the transfer path.
- Preserve store and Supabase payload shapes unless a migration is truly required.
- Avoid committing real secrets or environment dumps. Use `.env.example` only as a template.
