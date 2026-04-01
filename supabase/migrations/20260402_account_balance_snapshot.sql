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
            when t.kind = 'income' and t.account_id = a.id then t.amount_satang
            when t.kind = 'expense' and t.account_id = a.id then -t.amount_satang
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
