-- Pair with Dubbadhu/supabase/migrations/20260515120000_words_anon_insert_vocabulary_only.sql
-- Apply via Supabase SQL Editor if you manage RLS manually (internal app uses anon key).

drop policy if exists "words_insert_vocabulary_anon" on public.words;
drop policy if exists "words_insert_vocabulary_authenticated" on public.words;

create policy "words_insert_vocabulary_anon"
  on public.words for insert
  to anon
  with check (
    lower(trim(coalesce(series, ''))) = 'vocabulary'
    and lower(regexp_replace(trim(coalesce(language, '')), '\s+', ' ', 'g')) = 'afaan oromo'
  );

create policy "words_insert_vocabulary_authenticated"
  on public.words for insert
  to authenticated
  with check (
    lower(trim(coalesce(series, ''))) = 'vocabulary'
    and lower(regexp_replace(trim(coalesce(language, '')), '\s+', ' ', 'g')) = 'afaan oromo'
  );
