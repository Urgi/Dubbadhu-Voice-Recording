## Admin Lesson Editor Kit (drop-in)

Copy this entire folder into your admin app repo (anywhere, e.g. `docs/admin-lesson-editor-kit/`).

This kit is the **single source of context** for building an admin UI that edits Dubbadhu lessons stored in Supabase, with strong validation to minimize app-breaking edits.

### Files included (copy all)

- `admin-lesson-editor-kit/README.md` (this file)
- `admin-lesson-editor-kit/CURSOR_CONTEXT.md` (paste into Cursor for instant context)
- `../admin-lesson-editing-spec.md` (human-readable contract + examples)
- `../admin-lesson-editing-spec.schema.json` (**JSON Schema** to validate `lessons.content`)
- `../admin-lesson-editing-types.ts` (**TypeScript types** for editor code)

If you want everything co-located, you can also copy the three `../admin-lesson-editing-*` files into this same folder.

---

## What your admin app should do (minimal, safe)

### 1) Load lesson
- Table: `public.lessons`
- Select: `id, title, series_id, lesson_number, next_lesson_id, content`
- The Dubbadhu app renders **`content`** (JSONB) and expects `content.id === lessons.id`.

### 2) Edit lesson
- Allow:
  - Edit lesson `title`, `nextLessonId` (inside content) if you want
  - Add/remove/reorder `content.screens[]`
  - Edit each screen’s `content` object
- Guardrails:
  - Screen `type` must be one of the known strings (dropdown)
  - Validate `content` with the JSON Schema before save

### 3) Save lesson
- Update row: `public.lessons`
- Write `content` JSONB back
- Recommended: also keep `lessons.title` aligned to `content.title` (optional but nice)

---

## Validation (recommended)

Use `docs/admin-lesson-editing-spec.schema.json` to validate `lessons.content`.

If your admin app is TypeScript, also import the types from:
- `docs/admin-lesson-editing-types.ts`

---

## Screens that are “safe” to support with a minimal UI

These have the clearest constraints and lowest chance of crashing the client:
- `intro`
- `concept`
- `dialogue`
- `audioExposure` (text-only mode supported)
- `speakingPractice`
- `quiz`
- `match`
- `animatedConcept`
- `comparison`
- `firstLook`
- `situation`
- `patternPractice`
- `word-breakdown`

Other screen types exist but have more specialized logic/audio flows; for those, offer a raw JSON editor.

