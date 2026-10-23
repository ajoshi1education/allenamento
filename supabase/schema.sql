-- Allenamento sync table (Supabase free tier). Run once in Supabase → SQL Editor.
-- One row per stored record; each user can only see and change their own rows (row-level security).
create table if not exists public.records (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  store      text not null,
  id         text not null,
  data       jsonb not null,
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, store, id)
);
create index if not exists records_user_updated on public.records (user_id, updated_at);

alter table public.records enable row level security;
create policy "own rows: select" on public.records for select using (auth.uid() = user_id);
create policy "own rows: insert" on public.records for insert with check (auth.uid() = user_id);
create policy "own rows: update" on public.records for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows: delete" on public.records for delete using (auth.uid() = user_id);

-- The server stamps every change, so devices with wrong clocks can't confuse sync.
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records for each row execute function public.touch_updated_at();
