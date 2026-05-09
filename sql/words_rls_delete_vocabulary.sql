-- Pair with Dubbadhu/supabase/migrations/20260517120000_words_delete_vocabulary_rls.sql
-- Apply in Supabase SQL Editor if you manage RLS manually.

drop policy if exists "words_delete_vocabulary_anon" on public.words;
drop policy if exists "words_delete_vocabulary_authenticated" on public.words;

create policy "words_delete_vocabulary_anon"
  on public.words for delete
  to anon
  using (
    lower(trim(coalesce(series, ''))) = 'vocabulary'
    and lower(regexp_replace(trim(coalesce(language, '')), '\s+', ' ', 'g')) = 'afaan oromo'
  );

create policy "words_delete_vocabulary_authenticated"
  on public.words for delete
  to authenticated
  using (
    lower(trim(coalesce(series, ''))) = 'vocabulary'
    and lower(regexp_replace(trim(coalesce(language, '')), '\s+', ' ', 'g')) = 'afaan oromo'
  );
