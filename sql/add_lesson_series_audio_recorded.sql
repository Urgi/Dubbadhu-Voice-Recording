-- Run in Supabase SQL editor (or migrate) before using series audio status in Lesson Config.
alter table public.lesson_series
  add column if not exists audio_recorded boolean not null default false;

comment on column public.lesson_series.audio_recorded is 'When true, series audio is considered fully recorded in admin workflows.';
