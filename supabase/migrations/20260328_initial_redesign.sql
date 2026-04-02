create extension if not exists pgcrypto with schema public;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  monthly_target_satang bigint not null default 0 check (monthly_target_satang >= 0),
  locale text not null default 'th-TH',
  migrated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.categories (
  id text primary key,
  user_id uuid references auth.users (id) on delete cascade,
  is_system boolean not null default false,
  kind text not null check (kind in ('expense', 'income')),
  name text not null,
  icon text not null default '',
  color text not null default '#0f766e',
  parent_id text references public.categories (id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint categories_system_scope_check
    check ((is_system and user_id is null) or ((not is_system) and user_id is not null))
);

create table if not exists public.accounts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  legacy_id text,
  name text not null,
  type text not null check (type in ('cash', 'bank', 'credit', 'ewallet', 'investment', 'other')),
  institution_label text,
  currency text not null default 'THB',
  color text not null default '#0f766e',
  icon text not null default '🏦',
  opening_balance_satang bigint not null default 0,
  last4 text,
  last6 text,
  digits_ciphertext text,
  digits_masked text,
  credit_limit_satang bigint not null default 0,
  statement_day smallint check (statement_day between 1 and 31),
  due_day smallint check (due_day between 1 and 31),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.merchant_mappings (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  merchant_key text not null,
  canonical_merchant text not null,
  preferred_category_id text references public.categories (id) on delete set null,
  preferred_account_id bigint references public.accounts (id) on delete set null,
  usage_count integer not null default 0,
  last_used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.scan_documents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  legacy_id text,
  source_type text not null default 'upload' check (source_type in ('upload', 'migration', 'legacy_inbox', 'manual')),
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected', 'parse_failed')),
  storage_bucket text not null default 'expense-documents',
  file_path text,
  file_name text,
  mime_type text,
  file_hash text,
  raw_scan_payload jsonb not null default '{}'::jsonb,
  normalized_suggestion jsonb not null default '{}'::jsonb,
  confidence numeric(4,3),
  matched_account_id bigint references public.accounts (id) on delete set null,
  matched_category_id text references public.categories (id) on delete set null,
  approved_transaction_id bigint,
  merchant_key text,
  parse_error text,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  legacy_id text,
  scan_document_id bigint references public.scan_documents (id) on delete set null,
  kind text not null check (kind in ('expense', 'income', 'transfer')),
  status text not null default 'posted' check (status in ('posted', 'archived')),
  account_id bigint references public.accounts (id) on delete set null,
  from_account_id bigint references public.accounts (id) on delete set null,
  to_account_id bigint references public.accounts (id) on delete set null,
  category_id text references public.categories (id) on delete set null,
  merchant text,
  merchant_key text,
  note text,
  reference text,
  payment_method text,
  amount_satang bigint not null default 0 check (amount_satang >= 0),
  currency text not null default 'THB',
  date date not null,
  attachment_path text,
  attachment_name text,
  attachment_mime_type text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint transactions_transfer_shape_check
    check (
      (kind = 'transfer' and from_account_id is not null and to_account_id is not null)
      or kind <> 'transfer'
    )
);

create table if not exists public.transaction_line_items (
  id bigint generated always as identity primary key,
  transaction_id bigint not null references public.transactions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  line_order integer not null default 0,
  name text not null,
  category_id text references public.categories (id) on delete set null,
  amount_satang bigint not null default 0 check (amount_satang >= 0),
  quantity numeric(12,2),
  unit_price_satang bigint,
  receipt_line_type text not null default 'item' check (receipt_line_type in ('item', 'adjustment')),
  adjustment_effect text not null default 'add' check (adjustment_effect in ('add', 'subtract')),
  adjustment_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.import_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null,
  source_fingerprint text,
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed')),
  counts jsonb not null default '{}'::jsonb,
  failures jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.scan_documents
  add constraint scan_documents_approved_transaction_id_fkey
  foreign key (approved_transaction_id)
  references public.transactions (id)
  on delete set null;

create unique index if not exists categories_user_id_id_idx on public.categories (user_id, id);
create unique index if not exists accounts_user_legacy_id_uidx on public.accounts (user_id, legacy_id) where legacy_id is not null;
create unique index if not exists merchant_mappings_user_merchant_key_uidx on public.merchant_mappings (user_id, merchant_key);
create unique index if not exists scan_documents_user_legacy_id_uidx on public.scan_documents (user_id, legacy_id) where legacy_id is not null;
create unique index if not exists transactions_user_legacy_id_uidx on public.transactions (user_id, legacy_id) where legacy_id is not null;
create unique index if not exists import_runs_user_source_fingerprint_uidx on public.import_runs (user_id, source, source_fingerprint) where source_fingerprint is not null;

create index if not exists categories_user_kind_sort_idx on public.categories (user_id, kind, sort_order, name);
create index if not exists accounts_user_created_idx on public.accounts (user_id, created_at desc);
create index if not exists merchant_mappings_user_merchant_idx on public.merchant_mappings (user_id, merchant_key);
create index if not exists scan_documents_user_status_created_idx on public.scan_documents (user_id, status, created_at desc);
create index if not exists scan_documents_user_created_idx on public.scan_documents (user_id, created_at desc);
create index if not exists scan_documents_user_file_hash_idx on public.scan_documents (user_id, file_hash) where file_hash is not null;
create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);
create index if not exists transactions_user_kind_date_idx on public.transactions (user_id, kind, date desc);
create index if not exists transactions_user_merchant_idx on public.transactions (user_id, merchant_key);
create index if not exists transaction_line_items_tx_order_idx on public.transaction_line_items (transaction_id, line_order);
create index if not exists transaction_line_items_user_idx on public.transaction_line_items (user_id, transaction_id);
create index if not exists import_runs_user_created_idx on public.import_runs (user_id, created_at desc);

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists touch_categories_updated_at on public.categories;
create trigger touch_categories_updated_at before update on public.categories
for each row execute function public.touch_updated_at();

drop trigger if exists touch_accounts_updated_at on public.accounts;
create trigger touch_accounts_updated_at before update on public.accounts
for each row execute function public.touch_updated_at();

drop trigger if exists touch_merchant_mappings_updated_at on public.merchant_mappings;
create trigger touch_merchant_mappings_updated_at before update on public.merchant_mappings
for each row execute function public.touch_updated_at();

drop trigger if exists touch_scan_documents_updated_at on public.scan_documents;
create trigger touch_scan_documents_updated_at before update on public.scan_documents
for each row execute function public.touch_updated_at();

drop trigger if exists touch_transactions_updated_at on public.transactions;
create trigger touch_transactions_updated_at before update on public.transactions
for each row execute function public.touch_updated_at();

drop trigger if exists touch_transaction_line_items_updated_at on public.transaction_line_items;
create trigger touch_transaction_line_items_updated_at before update on public.transaction_line_items
for each row execute function public.touch_updated_at();

drop trigger if exists touch_import_runs_updated_at on public.import_runs;
create trigger touch_import_runs_updated_at before update on public.import_runs
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(coalesce(new.email, ''), '@', 1),
      'Smart Expense User'
    )
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.categories enable row level security;
alter table public.categories force row level security;
alter table public.accounts enable row level security;
alter table public.accounts force row level security;
alter table public.merchant_mappings enable row level security;
alter table public.merchant_mappings force row level security;
alter table public.scan_documents enable row level security;
alter table public.scan_documents force row level security;
alter table public.transactions enable row level security;
alter table public.transactions force row level security;
alter table public.transaction_line_items enable row level security;
alter table public.transaction_line_items force row level security;
alter table public.import_runs enable row level security;
alter table public.import_runs force row level security;

drop policy if exists profiles_self_all on public.profiles;
create policy profiles_self_all on public.profiles
for all
to authenticated
using (((select auth.uid()) = user_id))
with check (((select auth.uid()) = user_id));

drop policy if exists categories_select_all on public.categories;
create policy categories_select_all on public.categories
for select
to authenticated
using (user_id is null or ((select auth.uid()) = user_id));

drop policy if exists categories_insert_custom on public.categories;
create policy categories_insert_custom on public.categories
for insert
to authenticated
with check (((select auth.uid()) = user_id) and (not is_system));

drop policy if exists categories_update_custom on public.categories;
create policy categories_update_custom on public.categories
for update
to authenticated
using (((select auth.uid()) = user_id) and (not is_system))
with check (((select auth.uid()) = user_id) and (not is_system));

drop policy if exists categories_delete_custom on public.categories;
create policy categories_delete_custom on public.categories
for delete
to authenticated
using (((select auth.uid()) = user_id) and (not is_system));

drop policy if exists accounts_self_all on public.accounts;
create policy accounts_self_all on public.accounts
for all
to authenticated
using (((select auth.uid()) = user_id))
with check (((select auth.uid()) = user_id));

drop policy if exists merchant_mappings_self_all on public.merchant_mappings;
create policy merchant_mappings_self_all on public.merchant_mappings
for all
to authenticated
using (((select auth.uid()) = user_id))
with check (((select auth.uid()) = user_id));

drop policy if exists scan_documents_self_all on public.scan_documents;
create policy scan_documents_self_all on public.scan_documents
for all
to authenticated
using (((select auth.uid()) = user_id))
with check (((select auth.uid()) = user_id));

drop policy if exists transactions_self_all on public.transactions;
create policy transactions_self_all on public.transactions
for all
to authenticated
using (((select auth.uid()) = user_id))
with check (((select auth.uid()) = user_id));

drop policy if exists transaction_line_items_self_all on public.transaction_line_items;
create policy transaction_line_items_self_all on public.transaction_line_items
for all
to authenticated
using (((select auth.uid()) = user_id))
with check (((select auth.uid()) = user_id));

drop policy if exists import_runs_self_all on public.import_runs;
create policy import_runs_self_all on public.import_runs
for all
to authenticated
using (((select auth.uid()) = user_id))
with check (((select auth.uid()) = user_id));

insert into storage.buckets (id, name, public)
values ('expense-documents', 'expense-documents', false)
on conflict (id) do nothing;

drop policy if exists "expense-documents-read-own" on storage.objects;
create policy "expense-documents-read-own" on storage.objects
for select
to authenticated
using (
  bucket_id = 'expense-documents'
  and ((storage.foldername(name))[1] = (select auth.uid())::text)
);

drop policy if exists "expense-documents-insert-own" on storage.objects;
create policy "expense-documents-insert-own" on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'expense-documents'
  and ((storage.foldername(name))[1] = (select auth.uid())::text)
);

drop policy if exists "expense-documents-update-own" on storage.objects;
create policy "expense-documents-update-own" on storage.objects
for update
to authenticated
using (
  bucket_id = 'expense-documents'
  and ((storage.foldername(name))[1] = (select auth.uid())::text)
)
with check (
  bucket_id = 'expense-documents'
  and ((storage.foldername(name))[1] = (select auth.uid())::text)
);

drop policy if exists "expense-documents-delete-own" on storage.objects;
create policy "expense-documents-delete-own" on storage.objects
for delete
to authenticated
using (
  bucket_id = 'expense-documents'
  and ((storage.foldername(name))[1] = (select auth.uid())::text)
);

create or replace function public.dashboard_cashflow_series(target_month date default timezone('utc', now())::date)
returns table (
  bucket date,
  income_satang bigint,
  expense_satang bigint,
  net_satang bigint
)
language sql
security invoker
set search_path = public
as $$
with bounds as (
  select date_trunc('month', target_month)::date as month_start,
         (date_trunc('month', target_month) + interval '1 month - 1 day')::date as month_end
),
days as (
  select generate_series(
    (select month_start from bounds),
    (select month_end from bounds),
    interval '1 day'
  )::date as bucket
),
income_rows as (
  select t.date as bucket, sum(t.amount_satang)::bigint as income_satang
  from public.transactions t
  join bounds b on t.date between b.month_start and b.month_end
  where t.user_id = (select auth.uid())
    and t.kind = 'income'
  group by t.date
),
expense_line_ids as (
  select distinct tli.transaction_id
  from public.transaction_line_items tli
  join public.transactions t on t.id = tli.transaction_id
  join bounds b on t.date between b.month_start and b.month_end
  where t.user_id = (select auth.uid())
    and t.kind = 'expense'
),
expense_line_rows as (
  select
    t.date as bucket,
    sum(
      case
        when tli.adjustment_effect = 'subtract' then -tli.amount_satang
        else tli.amount_satang
      end
    )::bigint as expense_satang
  from public.transaction_line_items tli
  join public.transactions t on t.id = tli.transaction_id
  join bounds b on t.date between b.month_start and b.month_end
  where t.user_id = (select auth.uid())
    and t.kind = 'expense'
  group by t.date
),
expense_parent_rows as (
  select t.date as bucket, sum(t.amount_satang)::bigint as expense_satang
  from public.transactions t
  join bounds b on t.date between b.month_start and b.month_end
  where t.user_id = (select auth.uid())
    and t.kind = 'expense'
    and not exists (
      select 1
      from expense_line_ids eli
      where eli.transaction_id = t.id
    )
  group by t.date
),
expense_rows as (
  select bucket, sum(expense_satang)::bigint as expense_satang
  from (
    select * from expense_line_rows
    union all
    select * from expense_parent_rows
  ) x
  group by bucket
)
select
  d.bucket,
  coalesce(i.income_satang, 0)::bigint as income_satang,
  greatest(coalesce(e.expense_satang, 0), 0)::bigint as expense_satang,
  (coalesce(i.income_satang, 0) - greatest(coalesce(e.expense_satang, 0), 0))::bigint as net_satang
from days d
left join income_rows i on i.bucket = d.bucket
left join expense_rows e on e.bucket = d.bucket
order by d.bucket;
$$;

grant execute on function public.dashboard_cashflow_series(date) to authenticated;

create or replace function public.dashboard_snapshot(target_month date default timezone('utc', now())::date)
returns jsonb
language sql
security invoker
set search_path = public
as $$
with bounds as (
  select date_trunc('month', target_month)::date as month_start,
         (date_trunc('month', target_month) + interval '1 month - 1 day')::date as month_end
),
month_transactions as (
  select *
  from public.transactions t
  join bounds b on t.date between b.month_start and b.month_end
  where t.user_id = (select auth.uid())
),
expense_line_ids as (
  select distinct tli.transaction_id
  from public.transaction_line_items tli
  join month_transactions mt on mt.id = tli.transaction_id
  where mt.kind = 'expense'
),
expense_total as (
  select coalesce(sum(amount_satang), 0)::bigint as total
  from (
    select
      case
        when tli.adjustment_effect = 'subtract' then -tli.amount_satang
        else tli.amount_satang
      end as amount_satang
    from public.transaction_line_items tli
    join month_transactions mt on mt.id = tli.transaction_id
    where mt.kind = 'expense'
    union all
    select mt.amount_satang
    from month_transactions mt
    where mt.kind = 'expense'
      and not exists (
        select 1
        from expense_line_ids eli
        where eli.transaction_id = mt.id
      )
  ) q
),
income_total as (
  select coalesce(sum(mt.amount_satang), 0)::bigint as total
  from month_transactions mt
  where mt.kind = 'income'
),
category_rollup as (
  select
    c.id,
    c.name,
    c.icon,
    c.color,
    sum(value_satang)::bigint as total_satang
  from (
    select
      coalesce(tli.category_id, mt.category_id) as category_id,
      case
        when tli.adjustment_effect = 'subtract' then -tli.amount_satang
        else tli.amount_satang
      end as value_satang
    from public.transaction_line_items tli
    join month_transactions mt on mt.id = tli.transaction_id
    where mt.kind = 'expense'
    union all
    select
      mt.category_id,
      mt.amount_satang as value_satang
    from month_transactions mt
    where mt.kind = 'expense'
      and not exists (
        select 1
        from expense_line_ids eli
        where eli.transaction_id = mt.id
      )
  ) values_rows
  join public.categories c on c.id = values_rows.category_id
  where values_rows.value_satang > 0
  group by c.id, c.name, c.icon, c.color
  order by total_satang desc
  limit 6
),
pending_state as (
  select
    count(*) filter (where status = 'pending_review')::integer as pending_review_count,
    count(*) filter (
      where status = 'pending_review'
        and (
          matched_account_id is null
          or matched_category_id is null
        )
    )::integer as unmatched_count
  from public.scan_documents
  where user_id = (select auth.uid())
),
account_balances as (
  select
    a.id,
    a.name,
    a.type,
    a.color,
    a.icon,
    (
      a.opening_balance_satang
      + coalesce((
        select sum(
          case
            when t.kind = 'income' and t.account_id = a.id then t.amount_satang
            when t.kind = 'expense' and t.account_id = a.id then -t.amount_satang
            when t.kind = 'transfer' and t.to_account_id = a.id then t.amount_satang
            when t.kind = 'transfer' and t.from_account_id = a.id then -t.amount_satang
            else 0
          end
        )::bigint
        from public.transactions t
        where t.user_id = (select auth.uid())
      ), 0)
    )::bigint as balance_satang
  from public.accounts a
  where a.user_id = (select auth.uid())
  order by balance_satang desc
  limit 4
)
select jsonb_build_object(
  'month_start', (select month_start from bounds),
  'month_end', (select month_end from bounds),
  'monthly_target_satang', coalesce((select monthly_target_satang from public.profiles where user_id = (select auth.uid())), 0),
  'income_satang', (select total from income_total),
  'expense_satang', greatest((select total from expense_total), 0),
  'net_satang', ((select total from income_total) - greatest((select total from expense_total), 0)),
  'pending_review_count', (select pending_review_count from pending_state),
  'unmatched_count', (select unmatched_count from pending_state),
  'top_categories', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'icon', icon,
        'color', color,
        'total_satang', total_satang
      )
      order by total_satang desc
    )
    from category_rollup
  ), '[]'::jsonb),
  'accounts', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'type', type,
        'color', color,
        'icon', icon,
        'balance_satang', balance_satang
      )
      order by balance_satang desc
    )
    from account_balances
  ), '[]'::jsonb)
);
$$;

grant execute on function public.dashboard_snapshot(date) to authenticated;
