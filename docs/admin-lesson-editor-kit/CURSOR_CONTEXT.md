## Paste this into Cursor in the admin app repo

You are building an **Admin Lesson Editor** for the Dubbadhu curriculum stored in **Supabase Postgres**.

### Goal
Create a minimal UI that lets me:
- Select a lesson (e.g. `lesson8`)
- Edit its `content` JSON (safely, with validations)
- Add/remove/reorder screens
- Save back to Supabase so the Dubbadhu app updates immediately (it loads lessons remote-first)

### Canonical DB tables
- `public.lesson_series`
  - `id` text (e.g. `series1`)
  - `title` text
  - `sort_order` int
  - `intro_video_url` text nullable
- `public.lessons`
  - `id` text (e.g. `lesson8`)  ✅ IMPORTANT: id is TEXT
  - `series_id` text FK → `lesson_series.id`
  - `lesson_number` int
  - `title` text
  - `next_lesson_id` text nullable
  - `content` jsonb  ✅ THIS is what the client renders

The Dubbadhu app fetches:
```sql
select content from lessons where id = :lessonKey;
```

### The content contract (import these in the admin app)
In the Dubbadhu repo, copy these files into your admin repo:
- `docs/admin-lesson-editing-spec.md` (human-readable spec)
- `docs/admin-lesson-editing-spec.schema.json` (JSON Schema to validate `lessons.content`)
- `docs/admin-lesson-editing-types.ts` (TypeScript types)

### Screen type strings (case-sensitive)
Must match the Dubbadhu screen registry:
- `intro`
- `firstLook`
- `match`
- `quiz`
- `CelebrateScreen`  (PascalCase)
- `moduleComplete`
- `situation`
- `dialogue`
- `concept`
- `animatedConcept`
- `comparison`
- `patternPractice`
- `audioRecognition`
- `audioResponse`
- `speakingPractice`
- `audioExposure`
- `audioDiscrimination`
- `communityBoard`
- `word-breakdown`

### Guardrails (minimize errors)
Before saving:
- Validate `lessons.content` with the JSON Schema
- Ensure `content.id === lessons.id`
- Ensure `content.screens[]` is non-empty, each screen has `{type, content}`
- Restrict `type` to the known list (dropdown)

### UX scope (minimal but effective)
- Left panel: lesson list (id + title)
- Main panel:
  - lesson-level fields (title/series/nextLessonId)
  - screens list with drag reorder + add/remove
  - per-type form for common types + raw JSON editor fallback
- Save button that writes to Supabase and shows success/error

### Security
Use service role or an admin-authenticated backend if needed.
Never expose the service role key in a public client app unless you fully trust the environment.

