-- Use this only if you are creating the Supabase table from scratch.
-- If you already created the `items` table and policies, you do not need to run this again.

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  column text not null check (column in ('thoughts', 'setaside', 'focus', 'log')),
  text text not null,
  project_tag text null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  deleted_at timestamptz null
);

alter table public.items
add column if not exists project_tag text null;

alter table public.items
add column if not exists deleted_at timestamptz null;

alter table public.items enable row level security;

drop policy if exists "Users can view their own items" on public.items;
drop policy if exists "Users can insert their own items" on public.items;
drop policy if exists "Users can update their own items" on public.items;
drop policy if exists "Users can delete their own items" on public.items;

create policy "Users can view their own items"
on public.items for select
using (auth.uid() = user_id);

create policy "Users can insert their own items"
on public.items for insert
with check (auth.uid() = user_id);

create policy "Users can update their own items"
on public.items for update
using (auth.uid() = user_id);

create policy "Users can delete their own items"
on public.items for delete
using (auth.uid() = user_id);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_goal int not null default 3 check (daily_goal between 1 and 20),
  daily_goal_changed_on date null,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "Users can view their own settings" on public.user_settings;
drop policy if exists "Users can insert their own settings" on public.user_settings;
drop policy if exists "Users can update their own settings" on public.user_settings;

create policy "Users can view their own settings"
on public.user_settings for select
using (auth.uid() = user_id);

create policy "Users can insert their own settings"
on public.user_settings for insert
with check (auth.uid() = user_id);

create policy "Users can update their own settings"
on public.user_settings for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
