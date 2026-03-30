-- Run in Supabase SQL editor (or migrate) before using series intro script in Lesson Config.
alter table public.lesson_series
  add column if not exists intro_script text;

comment on column public.lesson_series.intro_script is 'Optional series intro script (plain text) for admins / voiceover.';
