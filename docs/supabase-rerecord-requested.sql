-- Fix: "new row for relation words violates check constraint words_status_check"
-- Run in Supabase → SQL Editor (once).
--
-- The app sets status to 'rerecord_requested' for "Request re-record". Your table
-- must allow that value in the CHECK constraint.

-- Optional: see the old definition
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.words'::regclass AND conname = 'words_status_check';

ALTER TABLE public.words DROP CONSTRAINT IF EXISTS words_status_check;

ALTER TABLE public.words
  ADD CONSTRAINT words_status_check
  CHECK (
    status IN (
      'pending',
      'recorded',
      'approved',
      'rejected',
      'rerecord_requested'
    )
  );

-- If your column uses a Postgres ENUM instead of text + CHECK, use this pattern instead:
-- ALTER TYPE public.words_status_enum ADD VALUE IF NOT EXISTS 'rerecord_requested';
-- (Name of the enum type may differ — check in Table Editor → column type.)
