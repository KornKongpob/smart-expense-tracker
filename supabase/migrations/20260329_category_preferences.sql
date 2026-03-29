create table if not exists public.category_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id text not null references public.categories (id) on delete cascade,
  name text,
  icon text,
  color text,
  hidden boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, category_id)
);

create index if not exists category_preferences_user_idx
  on public.category_preferences (user_id, category_id);

drop trigger if exists touch_category_preferences_updated_at on public.category_preferences;
create trigger touch_category_preferences_updated_at
before update on public.category_preferences
for each row execute function public.touch_updated_at();

alter table public.category_preferences enable row level security;
alter table public.category_preferences force row level security;

drop policy if exists category_preferences_select_own on public.category_preferences;
create policy category_preferences_select_own on public.category_preferences
for select
using (((select auth.uid()) = user_id));

drop policy if exists category_preferences_insert_own on public.category_preferences;
create policy category_preferences_insert_own on public.category_preferences
for insert
with check (((select auth.uid()) = user_id));

drop policy if exists category_preferences_update_own on public.category_preferences;
create policy category_preferences_update_own on public.category_preferences
for update
using (((select auth.uid()) = user_id))
with check (((select auth.uid()) = user_id));

drop policy if exists category_preferences_delete_own on public.category_preferences;
create policy category_preferences_delete_own on public.category_preferences
for delete
using (((select auth.uid()) = user_id));

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
    coalesce(nullif(trim(cp.name), ''), c.name) as name,
    coalesce(nullif(trim(cp.icon), ''), c.icon) as icon,
    coalesce(nullif(trim(cp.color), ''), c.color) as color,
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
  left join public.category_preferences cp
    on cp.category_id = c.id
   and cp.user_id = (select auth.uid())
  where values_rows.value_satang > 0
  group by
    c.id,
    coalesce(nullif(trim(cp.name), ''), c.name),
    coalesce(nullif(trim(cp.icon), ''), c.icon),
    coalesce(nullif(trim(cp.color), ''), c.color)
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
