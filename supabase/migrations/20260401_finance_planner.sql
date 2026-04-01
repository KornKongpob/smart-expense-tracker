alter table public.accounts
  drop constraint if exists accounts_type_check;

alter table public.accounts
  add constraint accounts_type_check
  check (type in ('cash', 'bank', 'credit', 'loan', 'ewallet', 'investment', 'other'));

create table if not exists public.financial_goals (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  legacy_id text,
  name text not null,
  target_amount_satang bigint not null default 0 check (target_amount_satang >= 0),
  current_amount_satang bigint not null default 0 check (current_amount_satang >= 0),
  target_date date,
  monthly_contribution_satang bigint not null default 0 check (monthly_contribution_satang >= 0),
  linked_account_id bigint references public.accounts (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.debt_plans (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  legacy_id text,
  account_id bigint not null references public.accounts (id) on delete cascade,
  current_balance_satang bigint not null default 0 check (current_balance_satang >= 0),
  target_payment_satang bigint not null default 0 check (target_payment_satang >= 0),
  due_day smallint check (due_day between 1 and 31),
  payoff_target_date date,
  status text not null default 'active' check (status in ('active', 'paused', 'paid_off', 'archived')),
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists financial_goals_user_legacy_id_uidx
  on public.financial_goals (user_id, legacy_id)
  where legacy_id is not null;

create unique index if not exists debt_plans_user_legacy_id_uidx
  on public.debt_plans (user_id, legacy_id)
  where legacy_id is not null;

create index if not exists financial_goals_user_status_target_idx
  on public.financial_goals (user_id, status, target_date);

create index if not exists debt_plans_user_status_due_idx
  on public.debt_plans (user_id, status, due_day, payoff_target_date);

drop trigger if exists touch_financial_goals_updated_at on public.financial_goals;
create trigger touch_financial_goals_updated_at before update on public.financial_goals
for each row execute function public.touch_updated_at();

drop trigger if exists touch_debt_plans_updated_at on public.debt_plans;
create trigger touch_debt_plans_updated_at before update on public.debt_plans
for each row execute function public.touch_updated_at();

alter table public.financial_goals enable row level security;
alter table public.financial_goals force row level security;
alter table public.debt_plans enable row level security;
alter table public.debt_plans force row level security;

drop policy if exists financial_goals_self_all on public.financial_goals;
create policy financial_goals_self_all on public.financial_goals
for all
to authenticated
using (((select auth.uid()) = user_id))
with check (((select auth.uid()) = user_id));

drop policy if exists debt_plans_self_all on public.debt_plans;
create policy debt_plans_self_all on public.debt_plans
for all
to authenticated
using (((select auth.uid()) = user_id))
with check (((select auth.uid()) = user_id));
