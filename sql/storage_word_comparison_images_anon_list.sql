-- The JS client’s storage.list() needs SELECT on storage.objects. Without it, list() returns []
-- even when the dashboard shows files (dashboard uses the service role).
-- Run once in Supabase SQL editor for the same project as EXPO_PUBLIC_SUPABASE_URL.

drop policy if exists "Public read list word-comparison-images" on storage.objects;

create policy "word_comparison_images_object_select"
on storage.objects
for select
to public
using (bucket_id = 'word-comparison-images');
