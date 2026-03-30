-- Optional: run in Supabase SQL Editor if Series Config hits RLS on public.lessons
-- (delete series, add lesson, or updates from the lesson editor).
--
-- Only add policies if `lessons` already has RLS enabled; otherwise writes may work without this.
-- Tighten for production (e.g. service role or admin claim only).

drop policy if exists "lessons_insert_lesson_config" on public.lessons;
create policy "lessons_insert_lesson_config"
  on public.lessons for insert
  to anon
  with check (true);

drop policy if exists "lessons_insert_lesson_config_auth" on public.lessons;
create policy "lessons_insert_lesson_config_auth"
  on public.lessons for insert
  to authenticated
  with check (true);

drop policy if exists "lessons_delete_lesson_config" on public.lessons;
create policy "lessons_delete_lesson_config"
  on public.lessons for delete
  to anon
  using (true);

drop policy if exists "lessons_delete_lesson_config_auth" on public.lessons;
create policy "lessons_delete_lesson_config_auth"
  on public.lessons for delete
  to authenticated
  using (true);
