-- Run this once in the Supabase SQL editor to sync quotes, advice, and personal reminders across devices.

create table if not exists public.quote_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

alter table public.quote_notes enable row level security;

drop policy if exists "Users can view their own quote notes" on public.quote_notes;
drop policy if exists "Users can insert their own quote notes" on public.quote_notes;
drop policy if exists "Users can update their own quote notes" on public.quote_notes;
drop policy if exists "Users can delete their own quote notes" on public.quote_notes;

create policy "Users can view their own quote notes"
on public.quote_notes for select
using (auth.uid() = user_id);

create policy "Users can insert their own quote notes"
on public.quote_notes for insert
with check (auth.uid() = user_id);

create policy "Users can update their own quote notes"
on public.quote_notes for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own quote notes"
on public.quote_notes for delete
using (auth.uid() = user_id);
