-- Run this in Supabase SQL editor if moving items to The One Thing fails with:
-- new row for relation "items" violates check constraint "items_column_check"
--
-- This replaces the old column check with the current app columns.

alter table public.items
drop constraint if exists items_column_check;

alter table public.items
add constraint items_column_check
check ("column" in ('thoughts', 'setaside', 'focus', 'log'));

-- Optional verification:
select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.items'::regclass
  and conname = 'items_column_check';
