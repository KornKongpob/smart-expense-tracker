alter table public.profiles
  add column if not exists income_mode text not null default 'rolling_average'
    check (income_mode in ('fixed', 'rolling_average')),
  add column if not exists fixed_income_satang bigint not null default 0
    check (fixed_income_satang >= 0),
  add column if not exists income_lookback_months integer not null default 3
    check (income_lookback_months in (1, 3, 6, 12)),
  add column if not exists savings_mode text not null default 'amount'
    check (savings_mode in ('amount', 'percent')),
  add column if not exists savings_amount_satang bigint not null default 0
    check (savings_amount_satang >= 0),
  add column if not exists savings_percent_bps integer not null default 0
    check (savings_percent_bps between 0 and 10000),
  add column if not exists debt_strategy_mode text not null default 'paydown'
    check (debt_strategy_mode in ('survival', 'paydown'));

alter table public.debt_plans
  add column if not exists minimum_payment_satang bigint not null default 0
    check (minimum_payment_satang >= 0),
  add column if not exists apr_bps integer not null default 0
    check (apr_bps between 0 and 100000);

alter table public.category_preferences
  add column if not exists budget_behavior text;

alter table public.category_preferences
  drop constraint if exists category_preferences_budget_behavior_check;

alter table public.category_preferences
  add constraint category_preferences_budget_behavior_check
  check (budget_behavior is null or budget_behavior in ('fixed', 'essential', 'flexible'));

create table if not exists public.budgets (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  month_key text not null check (month_key ~ '^\d{4}-\d{2}$'),
  category_id text not null references public.categories (id) on delete cascade,
  limit_satang bigint not null default 0 check (limit_satang >= 0),
  alert_pct integer not null default 90 check (alert_pct between 1 and 100),
  source text not null default 'suggested' check (source in ('suggested', 'manual', 'migrated')),
  manual_override boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists budgets_user_month_category_uidx
  on public.budgets (user_id, month_key, category_id);

create index if not exists budgets_user_month_idx
  on public.budgets (user_id, month_key);

drop trigger if exists touch_budgets_updated_at on public.budgets;
create trigger touch_budgets_updated_at before update on public.budgets
for each row execute function public.touch_updated_at();

alter table public.budgets enable row level security;
alter table public.budgets force row level security;

drop policy if exists budgets_self_all on public.budgets;
create policy budgets_self_all on public.budgets
for all
to authenticated
using (((select auth.uid()) = user_id))
with check (((select auth.uid()) = user_id));
