-- Allow the Voice-Recording admin app (anon key) to upload Gemini-generated quiz images.
-- Run in Supabase SQL Editor after the `word-comparison-images` bucket exists and is public.

DROP POLICY IF EXISTS "word_comparison_images_insert_anon" ON storage.objects;
CREATE POLICY "word_comparison_images_insert_anon"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'word-comparison-images');
