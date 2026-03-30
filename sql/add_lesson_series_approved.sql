-- Run in Supabase SQL editor (or migrate) before using series approval in Lesson Config.
alter table public.lesson_series
  add column if not exists approved boolean not null default false;

comment on column public.lesson_series.approved is 'When true, series is treated as approved for release in admin workflows.';
