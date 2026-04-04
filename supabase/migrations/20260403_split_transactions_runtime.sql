alter table public.accounts
  drop constraint if exists accounts_type_check;

alter table public.accounts
  add constraint accounts_type_check
  check (type in ('cash', 'bank', 'credit', 'loan', 'ewallet', 'investment', 'other'));

alter table public.transactions
  add column if not exists is_split_parent boolean not null default false,
  add column if not exists is_split_child boolean not null default false,
  add column if not exists split_group_id text,
  add column if not exists split_parent_id bigint references public.transactions (id) on delete set null,
  add column if not exists split_index integer,
  add column if not exists split_count integer,
  add column if not exists split_label text,
  add column if not exists receipt_line_type text not null default 'item',
  add column if not exists adjustment_effect text not null default 'add',
  add column if not exists adjustment_type text;

alter table public.transactions
  drop constraint if exists transactions_receipt_line_type_check;

alter table public.transactions
  add constraint transactions_receipt_line_type_check
  check (receipt_line_type in ('item', 'adjustment'));

alter table public.transactions
  drop constraint if exists transactions_adjustment_effect_check;

alter table public.transactions
  add constraint transactions_adjustment_effect_check
  check (adjustment_effect in ('add', 'subtract'));

create index if not exists transactions_user_split_group_idx
  on public.transactions (user_id, split_group_id)
  where split_group_id is not null;

create index if not exists transactions_split_parent_idx
  on public.transactions (split_parent_id)
  where split_parent_id is not null;

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
month_transactions as (
  select *
  from public.transactions t
  join bounds b on t.date between b.month_start and b.month_end
  where t.user_id = (select auth.uid())
    and coalesce(t.is_split_parent, false) = false
),
income_rows as (
  select mt.date as bucket, sum(mt.amount_satang)::bigint as income_satang
  from month_transactions mt
  where mt.kind = 'income'
  group by mt.date
),
expense_line_ids as (
  select distinct tli.transaction_id
  from public.transaction_line_items tli
  join month_transactions mt on mt.id = tli.transaction_id
  where mt.kind = 'expense'
),
expense_line_rows as (
  select
    mt.date as bucket,
    sum(
      case
        when tli.adjustment_effect = 'subtract' then -tli.amount_satang
        else tli.amount_satang
      end
    )::bigint as expense_satang
  from public.transaction_line_items tli
  join month_transactions mt on mt.id = tli.transaction_id
  where mt.kind = 'expense'
  group by mt.date
),
expense_direct_rows as (
  select
    mt.date as bucket,
    sum(
      case
        when mt.adjustment_effect = 'subtract' then -mt.amount_satang
        else mt.amount_satang
      end
    )::bigint as expense_satang
  from month_transactions mt
  where mt.kind = 'expense'
    and not exists (
      select 1
      from expense_line_ids eli
      where eli.transaction_id = mt.id
    )
  group by mt.date
),
expense_rows as (
  select bucket, sum(expense_satang)::bigint as expense_satang
  from (
    select * from expense_line_rows
    union all
    select * from expense_direct_rows
  ) values_rows
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
    and coalesce(t.is_split_parent, false) = false
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
    select
      case
        when mt.adjustment_effect = 'subtract' then -mt.amount_satang
        else mt.amount_satang
      end as amount_satang
    from month_transactions mt
    where mt.kind = 'expense'
      and not exists (
        select 1
        from expense_line_ids eli
        where eli.transaction_id = mt.id
      )
  ) values_rows
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
      case
        when mt.adjustment_effect = 'subtract' then -mt.amount_satang
        else mt.amount_satang
      end as value_satang
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
  where values_rows.category_id is not null
    and values_rows.value_satang > 0
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
            when t.kind = 'expense' and t.account_id = a.id then
              case
                when t.adjustment_effect = 'subtract' then t.amount_satang
                else -t.amount_satang
              end
            when t.kind = 'transfer' and t.to_account_id = a.id then t.amount_satang
            when t.kind = 'transfer' and t.from_account_id = a.id then -t.amount_satang
            else 0
          end
        )::bigint
        from public.transactions t
        where t.user_id = (select auth.uid())
          and coalesce(t.is_split_parent, false) = false
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

create or replace function public.account_balance_snapshot(target_user uuid)
returns table (
  id bigint,
  balance_satang bigint
)
language sql
security invoker
set search_path = public
as $$
  select
    a.id,
    (
      a.opening_balance_satang
      + coalesce(
        sum(
          case
            when coalesce(t.is_split_parent, false) then 0
            when t.kind = 'income' and t.account_id = a.id then t.amount_satang
            when t.kind = 'expense' and t.account_id = a.id then
              case
                when t.adjustment_effect = 'subtract' then t.amount_satang
                else -t.amount_satang
              end
            when t.kind = 'transfer' and t.to_account_id = a.id then t.amount_satang
            when t.kind = 'transfer' and t.from_account_id = a.id then -t.amount_satang
            else 0
          end
        ),
        0
      )
    )::bigint as balance_satang
  from public.accounts a
  left join public.transactions t
    on t.user_id = a.user_id
   and (
     (t.kind in ('income', 'expense') and t.account_id = a.id)
     or t.from_account_id = a.id
     or t.to_account_id = a.id
   )
  where a.user_id = target_user
  group by a.id, a.opening_balance_satang, a.created_at
  order by a.created_at asc;
$$;

grant execute on function public.account_balance_snapshot(uuid) to authenticated;
