-- Run this once in the Supabase SQL editor to enable recoverable trash.
-- Deleted tasks are hidden from the planner but can be restored until permanently deleted.

alter table public.items
add column if not exists deleted_at timestamptz null;
