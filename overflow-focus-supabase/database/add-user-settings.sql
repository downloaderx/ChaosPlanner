-- Run this once in the Supabase SQL editor to sync daily goal across devices.

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
