-- Fix: "new row violates row-level security policy for table 'lesson_series'"
--
-- The app uses the Supabase ANON key (see src/lib/supabase.ts). If RLS is ON and
-- there is no policy allowing anon to SELECT/INSERT/UPDATE/DELETE lesson_series
-- (and Add series) will fail even though rows exist in the Table Editor.
--
-- Run this in Supabase → SQL Editor as a user that can change policies (postgres).
-- Adjust TO anon / TO authenticated to match how you use the app (anon only until you add Supabase Auth).

-- Optional: inspect existing policies
-- select * from pg_policies where tablename = 'lesson_series';

alter table public.lesson_series enable row level security;

-- Drop these names if you re-run the script (ignore errors if they don't exist)
drop policy if exists "lesson_series_select_lesson_config" on public.lesson_series;
drop policy if exists "lesson_series_insert_lesson_config" on public.lesson_series;
drop policy if exists "lesson_series_update_lesson_config" on public.lesson_series;
drop policy if exists "lesson_series_delete_lesson_config" on public.lesson_series;

-- Anon key (Expo app without Supabase Auth session)
create policy "lesson_series_select_lesson_config"
  on public.lesson_series for select
  to anon
  using (true);

create policy "lesson_series_insert_lesson_config"
  on public.lesson_series for insert
  to anon
  with check (true);

create policy "lesson_series_update_lesson_config"
  on public.lesson_series for update
  to anon
  using (true)
  with check (true);

create policy "lesson_series_delete_lesson_config"
  on public.lesson_series for delete
  to anon
  using (true);

-- If you sign in with Supabase Auth for admins, also allow authenticated:
drop policy if exists "lesson_series_select_lesson_config_auth" on public.lesson_series;
drop policy if exists "lesson_series_insert_lesson_config_auth" on public.lesson_series;
drop policy if exists "lesson_series_update_lesson_config_auth" on public.lesson_series;
drop policy if exists "lesson_series_delete_lesson_config_auth" on public.lesson_series;

create policy "lesson_series_select_lesson_config_auth"
  on public.lesson_series for select
  to authenticated
  using (true);

create policy "lesson_series_insert_lesson_config_auth"
  on public.lesson_series for insert
  to authenticated
  with check (true);

create policy "lesson_series_update_lesson_config_auth"
  on public.lesson_series for update
  to authenticated
  using (true)
  with check (true);

create policy "lesson_series_delete_lesson_config_auth"
  on public.lesson_series for delete
  to authenticated
  using (true);
