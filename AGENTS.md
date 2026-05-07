# AGENTS.md

Project-specific guidance for future Codex sessions working in this repository.

## Project Context

- This is a React personal finance app. Important: the current `package.json` scripts run Next.js commands, so verify the active runtime from package scripts before assuming Vite commands.
- Keep the app local-first by default. Do not require network services for core personal finance flows unless the user explicitly asks.
- Main application state lives in `src/store/store.jsx`, with normalization in `src/store/boot.js`.
- Persistent local state flows through `src/services/storage.js`.
- Existing state domains include `moneyUnit`, `transactions`, `accounts`, `categories`, `budgets`, `recurring`, `merchants`, `rules`, `inbox` / `scanInbox`, and `ui`.
- Money values are stored as integer satang, not baht. Never introduce floating-point money storage.

## Money Rules

- Use `src/utils/money.js` for parsing, sanitizing, and converting money input.
- Use integer satang for stored amounts, limits, balances, budgets, rules, recurring items, receipt lines, and inbox items.
- Display baht only at the UI formatting boundary, typically through existing format helpers.
- Avoid direct floating-point arithmetic for persisted money. If calculations need division or percentages, keep persisted results as integers and round intentionally.

## Important Utilities

Prefer existing helpers before creating new ones:

- `src/store/selectors.js`
- `src/store/selectors/index.js`
- `src/utils/money.js`
- `src/utils/format.js`
- `src/utils/transaction.js`
- `src/utils/debtTracker.js`
- `src/utils/aiInsights.js`
- `src/utils/installments.js`
- `src/utils/transferGrouping.js`
- `src/utils/receiptAdjustments.js`

## Implementation Guidelines

- Do not rewrite large files unnecessarily. Keep changes narrowly scoped.
- Do not introduce new dependencies unless clearly justified.
- Preserve the existing Thai UX copy style when editing UI text.
- Prefer pure calculation functions with focused unit tests before adding UI.
- Keep every phase passing the existing tests.
- Do not implement investment advice, credit-score claims, or regulated financial advice. The app may provide planning estimates and educational suggestions only.
- For goals, debt, bills, or money assistant features, extend schema, boot normalization, selectors, storage, and tests deliberately instead of storing ad hoc UI-only data.
- Maintain backward compatibility between `inbox` and `scanInbox` where existing code does so.

## Commands

From `package.json`:

- Install dependencies: `npm install`
- Dev server: `npm run dev` (`next dev`)
- Build: `npm run build` (`next build`)
- Start production server: `npm run start` (`next start`)
- Preview: `npm run preview` (`next start`)
- Lint: `npm run lint`
- Unit tests: `npm test`
- Coverage tests: `npm run test:coverage`
- E2E tests: `npm run test:e2e`
- Supabase setup helper: `npm run supabase:setup`

After code changes, run `npm test`. If dependencies are missing, report the exact command needed instead of changing package scripts unnecessarily.
