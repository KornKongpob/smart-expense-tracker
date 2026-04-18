# Smart Expense Feature Roadmap

อัปเดตล่าสุด: 2026-04-18

เอกสารนี้สรุป roadmap ที่ทำเสร็จแล้วใน active runtime shell (`src/features/app/*`) เพื่อให้ทีมเห็นภาพรวมของฟีเจอร์หลัก, migration ที่ต้อง apply, และ regression ที่ควรรันก่อนปล่อยงาน

## Status

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 1 | Bug fixes and cleanup | Completed |
| 2 | Transactions history screen | Completed |
| 3 | Recurring transactions | Completed |
| 4 | Analytics and notification center | Completed |
| 5 | Polish, docs, regression | Completed |

## Completed work

### Phase 1

- Fixed planner/account/dashboard quick-win bugs from the runtime shell
- Tightened planner validation and duplicate-submit guards
- Kept account deeplink behavior reliable while editors are open
- Removed dead dashboard helpers and cleaned toast/runtime wiring

### Phase 2

- Added dedicated `/transactions` history screen
- Added month, kind, account, category, and text filters
- Reused shared edit/delete sheet for history rows
- Added CSV export and dashboard deep link into the history view

### Phase 3

- Added `public.recurring_rules`
- Added `transactions.source_recurring_id`
- Added provider state and actions for save/delete/toggle/run recurring rules
- Added `/recurring` screen with create/edit/pause/delete flows
- Added dashboard recurring summary card and `Run now` action
- Extended recurring helpers to support `daily` and `yearly`
- Added recurring regression coverage in `tests/utils.edge.test.js`

### Phase 4

- Added dashboard month-over-month comparison cards
- Added category breakdown chart
- Added spend heatmap based on cashflow series
- Added `public.notifications`
- Added runtime notification synthesis for:
  - budget alerts
  - debt reminders
  - recurring due items
  - pending inbox scans
- Added header bell icon, unread badge, and notification center sheet
- Kept inline budget alerting in Add flow

### Phase 5

- Added merchant autocomplete from history and merchant mappings
- Remembered latest account/category defaults per transaction kind in Add flow
- Updated README and migration notes
- Verified regression commands: `npm run lint`, `npm run test`, `npm run build`

## Runtime entry points

- `/dashboard`
- `/inbox`
- `/add`
- `/transactions`
- `/accounts`
- `/categories`
- `/planner`
- `/recurring`
- `/settings`

## Migration order

Apply migrations in filename order:

1. `supabase/migrations/20260328_initial_redesign.sql`
2. `supabase/migrations/20260329_category_preferences.sql`
3. `supabase/migrations/20260401_finance_planner.sql`
4. `supabase/migrations/20260402_account_balance_snapshot.sql`
5. `supabase/migrations/20260403_split_transactions_runtime.sql`
6. `supabase/migrations/20260413_income_budget_planner.sql`
7. `supabase/migrations/20260415_planner_monthly_plans.sql`
8. `supabase/migrations/20260417_recurring_rules.sql`
9. `supabase/migrations/20260417_notifications.sql`

## Regression checklist

Run before shipping:

```bash
npm run lint
npm run test
npm run build
```

Optional when the environment is ready:

```bash
npm run test:e2e
```

Manual smoke path:

1. Add a manual transaction
2. Create a recurring rule and run it once
3. Edit or delete a row from `/transactions`
4. Verify dashboard analytics and notification center
5. Re-open planner and confirm recommendations still apply cleanly
