# Admin lesson editing spec (Dubbadhu)

This file is meant to be copied into your **admin app** repo so it has the right context to safely **edit lessons in Supabase** that the Dubbadhu app will render.

It documents:
- Supabase tables + fields you’ll edit
- The canonical **screen type strings**
- The **`content` shape** (required vs optional) for each screen type
- Practical constraints so you don’t create lessons that crash in the client

---

## Supabase data model (what to edit)

### `lesson_series` (metadata)
- **`id`**: `text` — `"series1"`…`"seriesN"` (primary key)
- **`title`**: `text` — shown in UI
- **`sort_order`**: `int`
- **`intro_video_url`**: `text | null`
- **`intro_script`**: `text | null` — optional series-level intro copy (voiceover / narrator script); edited in Lesson Config → series screen
- **`approved`**: `boolean` — default `false`; set in Lesson Config when the series is ready for release
- **`audio_recorded`**: `boolean` — default `false`; set in Lesson Config when series audio recording is complete

### `lessons` (the actual lesson payload)
- **`id`**: `text` — `"lesson1"`… (primary key; Dubbadhu uses this as `lessonKey`)
- **`series_id`**: `text` — foreign key to `lesson_series.id`
- **`lesson_number`**: `int` — used for ordering in admin tooling
- **`title`**: `text`
- **`next_lesson_id`**: `text | null` — optional
- **`content`**: `jsonb` — **this is what Dubbadhu renders**

In Dubbadhu, lessons are fetched as:

```sql
select content from lessons where id = :lessonKey;
```

So your admin app should primarily **edit `lessons.content`** (and optionally keep `title/series_id/lesson_number/next_lesson_id` consistent).

---

## Canonical lesson JSON shape

`lessons.content` is expected to look like this:

```json
{
  "id": "lesson8",
  "title": "Good Morning — Akkam Bultte & Akkam Bultaan",
  "series": "Time-of-Day Greetings & First Meeting",
  "nextLessonId": "lesson9",
  "screens": [
    {
      "type": "intro",
      "content": { "goal": "…", "heading": "…", "body": "…" }
    }
  ]
}
```

### Global constraints
- **`id`** must equal the row id (e.g. `"lesson8"`). Keep them aligned.
- **`screens`** must be a non-empty array.
- Every screen must have:
  - **`type`**: one of the supported type strings (below)
  - **`content`**: an object (may be `{}` for some screens, but must exist)
- **Screen `type` strings are case-sensitive.**
  - In particular: `CelebrateScreen` is **PascalCase** in existing lessons and in the registry.

---

## Screen types (must match Dubbadhu `screenRegistry.js`)

Supported `type` values:
- `intro`
- `firstLook`
- `match`
- `quiz`
- `CelebrateScreen`
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

If you write a different string, the Dubbadhu client won’t be able to render it.

---

## Per-screen `content` contracts (admin validation targets)

Notes:
- Many screens support multiple “formats” for backward compatibility. Your admin UI can output **the simplest valid format**.
- Fields marked **required** are necessary to avoid client errors or “empty screen”.

### `intro`
Used as the first screen of a lesson.

**content**
- **`goal`**: `string` (recommended; used by UI)
- `heading`: `string` (optional; some lessons include)
- `body`: `string` (optional; some lessons include)

Minimal safe:

```json
{ "goal": "Learn X" }
```

### `concept`
This screen is flexible; it supports:

**Format A (bullets) — easiest**
- **`heading`**: `string` (or `title`)
- **`bullets`**: `string[]` (>= 1)
- `note`: `string` (optional)

Example:

```json
{
  "heading": "Concept",
  "bullets": ["Bullet 1", "Bullet 2"],
  "note": "Optional note"
}
```

**Format B (key points)**
- **`title`**: `string`
- `subtitle`: `string` (optional)
- **`keyPoints`**: `{ title: string, text: string, icon?: string }[]` (>= 1)

### `dialogue`
**Required**: `dialogueData.people[]`

**content**
- **`dialogueData`**: object
  - **`people`**: array (>= 1)
    - **`name`**: `string`
    - **`lines`**: `string[]`
    - `translations`: `(string|null)[]` (optional)
- `showTranslations`: `boolean` (optional; default true)

Example:

```json
{
  "dialogueData": {
    "people": [
      { "name": "A", "lines": ["Akkam?"], "translations": ["Hello?"] },
      { "name": "B", "lines": ["Naguma."], "translations": ["I’m good."] }
    ]
  },
  "showTranslations": true
}
```

### `audioExposure`
Audio-first vocab. Dubbadhu supports **text-only mode** if `audioRef` is missing.

**content**
- `title`: `string` (optional)
- `subtitle`: `string` (optional)
- **`words`**: array (>= 1)
  - `audioRef`: `string` (optional)
  - **`oromo`**: `string` (required)
  - **`english`**: `string` (required)
- `autoPlayNext`: `boolean` (optional; default true)
- `delayReveal`: `number` ms (optional; default 2000)

Example (text-only safe):

```json
{
  "title": "Listen First",
  "words": [
    { "oromo": "Akkam", "english": "Hello" }
  ],
  "autoPlayNext": false,
  "delayReveal": 0
}
```

### `speakingPractice`
Supports two modes:

**Mode A (prompt/expectedAnswer) — easiest**
- **`prompt`**: `string`
- **`expectedAnswer`**: `string`
- `hint`: `string` (optional)
- `showAnswerAfterRecording`: `boolean` (optional; default false)

Example:

```json
{
  "prompt": "Say: Good morning (respectful)",
  "expectedAnswer": "Akkam Bultaan?",
  "showAnswerAfterRecording": true
}
```

**Mode B (phrase/phraseEnglish/targetAudioRef)**
- `phrase`: `string`
- `phraseEnglish`: `string`
- `targetAudioRef`: `string` (optional)
- `tip`: `string` (optional)
- `hint`: `string` (optional)

### `quiz`
Supports a multi-question array or a single-question object.

**Preferred shape**
- `heading`: `string` (optional)
- **`questions`**: array (>= 1)
  - **`question`**: `string`
  - **`options`**: `(string | { text: string, audioRef: string })[]` (>= 2)
  - **`correctAnswer`**: `number` (0-based index)
  - `explanation`: `string` (optional)
- `audioOptions`: `boolean` (optional)
  - If true, options should be objects with `{text, audioRef}` and the UI forces playing before selecting.

Example:

```json
{
  "questions": [
    {
      "question": "How do you say hello?",
      "options": ["Akkam", "Nagaan"],
      "correctAnswer": 0,
      "explanation": "Akkam = Hello"
    }
  ]
}
```

### `match`
**content**
- `title`: `string` (optional; subtitle text)
- **`pairs`**: array (>= 1)
  - **`left`**: `string`
  - **`right`**: `string`

Example:

```json
{
  "title": "Tap left, then right",
  "pairs": [
    { "left": "Akkam", "right": "Hello" }
  ]
}
```

### `CelebrateScreen`
This one is important: the type is **exactly** `"CelebrateScreen"`.

**content** (varies a lot between lessons; safest minimal)
- `title`: `string` (recommended)
- `message`: `string` (recommended)
- `encouragement`: `string` (optional)
- `series`: `string` (optional; used in some analytics/UI)
- `nextLesson`: `string` (optional; used by some legacy lessons)
- `nextLessonId`: `string` (optional; used by newer lessons)
- `learned`: `string[]` (optional)
- `xpEarned`: `number` (optional)

Minimal safe:

```json
{
  "title": "Lesson Complete!",
  "message": "Nice work.",
  "nextLesson": "lesson9"
}

### `animatedConcept`
Typing animation for a target word + up to 3 bullets.

**content**
- **`targetWord`**: `string`
- **`bullets`**: `string[]` (recommended 1–3; UI displays max 3)

Example:

```json
{ "targetWord": "Akkam", "bullets": ["Used as hello", "Works anytime"] }
```

### `comparison`
Two supported formats:

**Format A (term/definition list)**
- **`heading`**: `string`
- **`items`**: `{ term: string, definition: string, color?: string }[]`
- `tip`: `string` (optional)
- `note`: `string` (optional)

**Format B (wrong vs right)**
- **`heading`**: `string`
- **`comparisons`**: `{ wrong: string, right: string, wrongExplanation?: string, rightExplanation?: string, why?: string }[]`

### `firstLook`
Tap-to-reveal list.

**content**
- `heading`: `string` (optional)
- `note`: `string` (optional)
- **`entries`**: array (>= 1)
  - `audio`: `string` (optional; remote URL)
  - **`word`**: `string` (required)
  - `translation`: `string` (optional)

### `situation`
Multiple choice with an image and options.

**content**
- **`introText`**: `string`
- **`image`**: `string | any` (URI string recommended for DB; local `require()` won’t work from DB)
- `subText`: `string | null` (optional)
- **`options`**: `{ text: string, correct?: boolean }[]` (>= 2)

### `patternPractice`
Exercise builder.

**content**
- **`heading`**: `string`
- **`instruction`**: `string`
- `pattern`: `string` (optional; UI doesn’t currently render it prominently)
- **`exercises`**: array (>= 1)
  - `prompt`: `string` (optional)
  - `nounPart`: `string` (optional)
  - `nounPartLabel`: `string` (optional)
  - `suffixLabel`: `string` (optional)
  - **`options`**: `string[]` (>= 2)
  - **`correctSuffix`**: `string`
  - `explanation`: `string` (optional)

### `word-breakdown`
Break a phrase into word boxes (personalizes `original` by replacing `____` with the user name).

**content**
- **`heading`**: `string`
- `original`: `string` (optional; can include `____`)
- **`words`**: `{ oromo: string, english: string }[]` (>= 1)
- `tip`: `string` (optional)

---

## Screen types not fully specified here

The following exist in the app but weren’t fully documented above (they depend on audio flows or specialized logic):
- `audioRecognition`
- `audioResponse`
- `audioDiscrimination`
- `communityBoard`
- `moduleComplete`

For these, your admin UI should either:
- offer a **raw JSON editor**, or
- restrict to editing only the top-level text fields you’re confident about.
```

---

## Admin UI recommendations (minimal but safe)

### Always include these guardrails
- **Screen type dropdown** restricted to the supported list.
- Per-type editor showing only relevant fields + a “raw JSON” escape hatch.
- Validation before save:
  - `lesson.content.id` matches row `lessons.id`
  - `screens[].type` is valid
  - `screens[].content` is object
  - Required fields for that `type` exist

### Add/remove/reorder screens
The Dubbadhu app uses `screens` order directly. Reordering is safe if each screen remains valid.

### “Preview in Dubbadhu”
If you keep Dubbadhu remote-first enabled, you can edit in admin → reopen lesson in Dubbadhu → it renders immediately.

---

## Known compatibility quirks (don’t fight them)

- Some screens support multiple historic formats (e.g. `concept`, `quiz`, `speakingPractice`).
  - Your admin app should output one “preferred” format per type (documented above).
- `CelebrateScreen` is PascalCase; most others are camelCase/kebab-case.
- `audioExposure.words[].audioRef` is optional; Dubbadhu will run in text-only mode when missing.

