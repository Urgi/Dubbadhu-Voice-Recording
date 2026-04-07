-- `supabase.storage.from('Videos-Dubbadhu').list()` uses the anon (or authenticated) role.
-- It requires SELECT on `storage.objects` for that bucket — "bucket is public" alone is not enough for listing.
--
-- Bucket id must match exactly (case-sensitive): Videos-Dubbadhu — same as in:
--   Dubbadhu-Voice-Recording/src/lib/videosDubbadhuStorage.ts → VIDEOS_DUBBADHU_BUCKET
--
-- Run in Supabase SQL Editor for the project behind EXPO_PUBLIC_SUPABASE_URL.

-- Keep bucket public so getPublicUrl() works without signed URLs
INSERT INTO storage.buckets (id, name, public)
VALUES ('Videos-Dubbadhu', 'Videos-Dubbadhu', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Remove older policy names (idempotent)
DROP POLICY IF EXISTS "Public read list Videos-Dubbadhu" ON storage.objects;
DROP POLICY IF EXISTS "videos_dubbadhu_object_select" ON storage.objects;
DROP POLICY IF EXISTS "videos_dubbadhu_anon_authenticated_select" ON storage.objects;

-- Anon + authenticated can list and read object metadata (required for storage.list)
CREATE POLICY "videos_dubbadhu_anon_authenticated_select"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'Videos-Dubbadhu');
