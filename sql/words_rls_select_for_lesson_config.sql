-- Fix: Audio exposure "Save screen" never shows translation conflict — lookups return zero rows.
--
-- The Voice Recording app uses the Supabase ANON key without a JWT (see src/lib/supabase.ts).
-- The Table Editor uses the postgres role and bypasses RLS, so you still see rows in the dashboard
-- while the app gets empty SELECT results if RLS is ON and anon has no SELECT on public.words.
--
-- This adds a read-only policy for anon (and optional authenticated) so lesson editor can compare
-- lesson text to the voice bank before save.
--
-- Run in Supabase → SQL Editor. Tighten `using (...)` later if you need stricter access.

alter table public.words enable row level security;

drop policy if exists "words_select_lesson_config" on public.words;

create policy "words_select_lesson_config"
  on public.words for select
  to anon
  using (true);

-- If you add Supabase Auth for admins:
drop policy if exists "words_select_lesson_config_auth" on public.words;

create policy "words_select_lesson_config_auth"
  on public.words for select
  to authenticated
  using (true);
