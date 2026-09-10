-- Run this once in the Supabase SQL editor to let tasks keep optional reference images.

alter table public.items
add column if not exists image_url text null;

alter table public.items
add column if not exists image_alt text null;
