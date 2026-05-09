-- Pair with Dubbadhu/supabase/migrations/20260516120000_words_vocab_text_approved.sql
-- Apply in Supabase SQL Editor if you manage schema manually.

alter table public.words
  add column if not exists vocab_text_approved boolean not null default true;

comment on column public.words.vocab_text_approved is
  'When false (Vocabulary series in internal app), voice actor must approve text in Vocab Center before the word appears in the vocabulary recording queue.';

update public.words w
set vocab_text_approved = false
where lower(trim(coalesce(w.series, ''))) = 'vocabulary'
  and coalesce(nullif(trim(w.slow_audio_url), ''), null) is null
  and coalesce(w.status::text, '') in ('pending', 'rerecord_requested');
