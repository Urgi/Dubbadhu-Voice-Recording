-- storage.list() for bucket Videos-Dubbadhu in the lesson admin (anon key) needs SELECT on storage.objects.
-- Run in Supabase SQL for the project that backs EXPO_PUBLIC_SUPABASE_URL.

drop policy if exists "Public read list Videos-Dubbadhu" on storage.objects;

create policy "videos_dubbadhu_object_select"
on storage.objects
for select
to public
using (bucket_id = 'Videos-Dubbadhu');
