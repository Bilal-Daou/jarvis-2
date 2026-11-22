-- Jarvis cloud sync: run this ONCE in Supabase -> SQL Editor -> New query -> paste -> Run.
-- Creates two tables and locks them so each signed-in person can only see and change their OWN rows.

-- 1) Live data: one row per person per part of the app (notes, expenses, food, habits...)
create table if not exists public.jarvis_data (
  user_id   uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  ns        text        not null,             -- which part of the app
  data      jsonb       not null,             -- that part's data
  stamp     bigint      not null default 0,   -- when the device last changed it (ms), used for "newest wins"
  server_at timestamptz not null default now(),-- set by the server on every write, used to fetch only what changed
  primary key (user_id, ns)
);

-- 2) Daily full copies (kept 30 days) so any mistake can be undone
create table if not exists public.jarvis_backups (
  user_id   uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  day       date        not null,
  data      jsonb       not null,
  server_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- 3) Security: row-level security (RLS) = each account sees only its own rows
alter table public.jarvis_data    enable row level security;
alter table public.jarvis_backups enable row level security;

drop policy if exists "own data" on public.jarvis_data;
create policy "own data" on public.jarvis_data for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own backups" on public.jarvis_backups;
create policy "own backups" on public.jarvis_backups for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.jarvis_data, public.jarvis_backups from anon;
grant select, insert, update, delete on public.jarvis_data, public.jarvis_backups to authenticated;

-- 4) Server clock on every write, and old backups cleaned up
create or replace function public.jarvis_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.server_at := clock_timestamp();
  if tg_table_name = 'jarvis_backups' then
    delete from public.jarvis_backups where user_id = new.user_id and day < current_date - 30;
  end if;
  return new;
end $$;

drop trigger if exists jarvis_data_touch on public.jarvis_data;
create trigger jarvis_data_touch before insert or update on public.jarvis_data
  for each row execute function public.jarvis_touch();
drop trigger if exists jarvis_backups_touch on public.jarvis_backups;
create trigger jarvis_backups_touch before insert or update on public.jarvis_backups
  for each row execute function public.jarvis_touch();
