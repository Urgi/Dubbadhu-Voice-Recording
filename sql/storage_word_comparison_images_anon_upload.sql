-- Allow the Voice-Recording admin app (anon key) to upload Gemini-generated quiz images.
-- Prefer applying via migration: Dubbadhu/supabase/migrations/20260520180000_word_comparison_images_storage_policies.sql
-- Or run this file once in Supabase SQL Editor (same project as EXPO_PUBLIC_SUPABASE_URL).

INSERT INTO storage.buckets (id, name, public)
VALUES ('word-comparison-images', 'word-comparison-images', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "word_comparison_images_insert_anon" ON storage.objects;
CREATE POLICY "word_comparison_images_insert_anon"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'word-comparison-images');
