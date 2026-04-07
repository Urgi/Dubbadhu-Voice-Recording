-- Bucket for Speak-tab locked-series cover images (lesson config upload).
-- Run in Supabase SQL Editor after creating the bucket if needed.

INSERT INTO storage.buckets (id, name, public)
VALUES ('series-list-covers', 'series-list-covers', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Public read (getPublicUrl + Image load in learner app)
DROP POLICY IF EXISTS "series_list_covers_select" ON storage.objects;
CREATE POLICY "series_list_covers_select"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'series-list-covers');

-- Anon upload (matches lesson_series lesson-config policies)
DROP POLICY IF EXISTS "series_list_covers_insert_anon" ON storage.objects;
CREATE POLICY "series_list_covers_insert_anon"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'series-list-covers');

DROP POLICY IF EXISTS "series_list_covers_update_anon" ON storage.objects;
CREATE POLICY "series_list_covers_update_anon"
  ON storage.objects FOR UPDATE
  TO anon
  USING (bucket_id = 'series-list-covers')
  WITH CHECK (bucket_id = 'series-list-covers');

DROP POLICY IF EXISTS "series_list_covers_delete_anon" ON storage.objects;
CREATE POLICY "series_list_covers_delete_anon"
  ON storage.objects FOR DELETE
  TO anon
  USING (bucket_id = 'series-list-covers');
