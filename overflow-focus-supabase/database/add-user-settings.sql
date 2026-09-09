-- Run this once in the Supabase SQL editor to sync daily goal and period focus across devices.

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_goal int not null default 3 check (daily_goal between 1 and 20),
  daily_goal_changed_on date null,
  period_focus_text text null,
  period_focus_months int not null default 3 check (period_focus_months in (3, 6, 9, 12)),
  period_focus_started_on date null,
  period_focus_change_count int not null default 0 check (period_focus_change_count between 0 and 2),
  updated_at timestamptz not null default now()
);

alter table public.user_settings
add column if not exists period_focus_text text null;

alter table public.user_settings
add column if not exists period_focus_months int not null default 3 check (period_focus_months in (3, 6, 9, 12));

alter table public.user_settings
add column if not exists period_focus_started_on date null;

alter table public.user_settings
add column if not exists period_focus_change_count int not null default 0 check (period_focus_change_count between 0 and 2);

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
