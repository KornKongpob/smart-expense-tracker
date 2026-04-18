create table if not exists public.recurring_rules (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  legacy_id text,
  kind text not null check (kind in ('expense', 'income', 'transfer')),
  amount_satang bigint not null default 0 check (amount_satang >= 0),
  account_id bigint references public.accounts (id) on delete set null,
  from_account_id bigint references public.accounts (id) on delete set null,
  to_account_id bigint references public.accounts (id) on delete set null,
  category_id text references public.categories (id) on delete set null,
  merchant text,
  note text,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  interval_count integer not null default 1 check (interval_count between 1 and 120),
  anchor_day smallint not null default 1 check (anchor_day between 1 and 31),
  start_date date not null,
  end_date date,
  last_generated_date date,
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint recurring_rules_transfer_shape_check
    check (
      (kind = 'transfer' and from_account_id is not null and to_account_id is not null and account_id is null and category_id is null)
      or (kind <> 'transfer' and account_id is not null)
    ),
  constraint recurring_rules_end_after_start_check
    check (end_date is null or end_date >= start_date),
  constraint recurring_rules_last_generated_check
    check (last_generated_date is null or last_generated_date >= start_date)
);

alter table public.transactions
  add column if not exists source_recurring_id bigint;

alter table public.transactions
  drop constraint if exists transactions_source_recurring_id_fkey;

alter table public.transactions
  add constraint transactions_source_recurring_id_fkey
  foreign key (source_recurring_id)
  references public.recurring_rules (id)
  on delete set null;

create unique index if not exists recurring_rules_user_legacy_id_uidx on public.recurring_rules (user_id, legacy_id) where legacy_id is not null;
create index if not exists recurring_rules_user_enabled_start_idx on public.recurring_rules (user_id, enabled, start_date, frequency);
create index if not exists recurring_rules_user_last_generated_idx on public.recurring_rules (user_id, last_generated_date);
create index if not exists transactions_source_recurring_idx on public.transactions (source_recurring_id) where source_recurring_id is not null;

drop trigger if exists touch_recurring_rules_updated_at on public.recurring_rules;
create trigger touch_recurring_rules_updated_at before update on public.recurring_rules
for each row execute function public.touch_updated_at();

alter table public.recurring_rules enable row level security;
alter table public.recurring_rules force row level security;

drop policy if exists recurring_rules_self_all on public.recurring_rules;
create policy recurring_rules_self_all on public.recurring_rules
for all
to authenticated
using (((select auth.uid()) = user_id))
with check (((select auth.uid()) = user_id));
