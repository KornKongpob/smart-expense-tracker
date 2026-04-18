create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  data_key text not null default '',
  is_read boolean not null default false,
  read_at timestamptz,
  is_dismissed boolean not null default false,
  dismissed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists notifications_user_kind_key_uidx on public.notifications (user_id, kind, data_key);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications (user_id, is_dismissed, is_read, created_at desc);

drop trigger if exists touch_notifications_updated_at on public.notifications;
create trigger touch_notifications_updated_at before update on public.notifications
for each row execute function public.touch_updated_at();

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

drop policy if exists notifications_self_all on public.notifications;
create policy notifications_self_all on public.notifications
for all
to authenticated
using (((select auth.uid()) = user_id))
with check (((select auth.uid()) = user_id));
