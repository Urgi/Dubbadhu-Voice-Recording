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
- **`intro_video_url`**: `text | null` — series intro with translation
- **`intro_video_no_translation_url`**: `text | null` — series asset without English (dialogue playback / review)
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
- `imageScreen`
- `repetition`
- `repetitionPractice`
- `sentenceBuilder`

If you write a different string, the Dubbadhu client won’t be able to render it.

---

## Per-screen `content` contracts (admin validation targets)

Notes:
- Many screens support multiple “formats” for backward compatibility. Your admin UI can output **the simplest valid format**.
- Fields marked **required** are necessary to avoid client errors or “empty screen”.

### `intro`
Used as the first screen of a lesson. The learner only reads **`goal`**; series and lesson titles come from catalog / lesson metadata, not intro JSON.

**content**
- **`goal`**: `string` (only persisted field)

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
**Required**: `dialogueData.person1` and `dialogueData.person2` (two objects). There are **always exactly two speakers**; legacy `people` must have **exactly two** object rows. Anything else is invalid: the learner drops that screen at runtime, and the admin editor removes it on full-lesson save (or you can delete it in the screen modal).

**Person 1** speaks first; the learner alternates lines by index (`person1.lines[i]`, then `person2.lines[i]`, then `person1.lines[i+1]`, …).

**content**
- **`dialogueData`**: object
  - **`person1`**, **`person2`**: each
    - **`name`**: `string`
    - **`lines`**: `string[]` (one string per turn for that speaker, in order)
    - `translations`: `(string|null)[]` (optional; parallel to `lines`)
- **`fromSecond`**: `number` (optional) — start of clip on the series no-translation video
- **`toSecond`**: `number` (optional) — end of clip; must be greater than `fromSecond`

When both clip seconds are set and the series has a no-translation video, the learner shows a video icon titled **Dialogue Playback Lesson X**.

The learner starts with translations hidden; learners can tap **Show** on the dialogue screen. Do not persist a `showTranslations` flag.

Example:

```json
{
  "dialogueData": {
    "person1": { "name": "A", "lines": ["Akkam?"], "translations": ["Hello?"] },
    "person2": { "name": "B", "lines": ["Naguma."], "translations": ["I’m good."] }
  },
  "fromSecond": 12,
  "toSecond": 28
}
```

### `audioExposure`
Audio-first vocab. Dubbadhu supports **text-only mode** if `audioRef` is missing.

**content**
- `title`: `string` (optional) — real headline override only. Do not store bare `Listen First` / `Listen & Learn` (learner treats those as defaults). Prefer `Listen First: Foo` → persist `Foo` only.
- `saidBy`: `string` (optional, **per word**) — speaker name shown as **Said by:** under the English gloss for that entry. Legacy screen-level `saidBy` is migrated onto words when editing.
- **`words`**: array (>= 1). Each item is either:
  - **Lean (preferred when linked to `public.words`)**: `word_id` (UUID), optional `word` (Afaan display string for JSON size), optional `draftTokenId` (editor / speaking links), optional `saidBy`, optional `translation`. URLs and `oromo`/`english` are filled at runtime in the learner app.
  - **Legacy / text-only**: `oromo` + `english`, optional `audioRef` / `fastAudioRef` / `slowAudioRef`, etc.

Example (text-only safe):

```json
{
  "title": "Listen First",
  "words": [
    { "oromo": "Akkam", "english": "Hello" }
  ]
}
```

### Field precedence (Oromo vs English in shared shapes)
When an object can carry both languages under different keys, **Dubbadhu prefers `oromo` over `word` over `text`** for the Afaan line, and **`definition` / `english` / `translation`** for the English gloss. That matches `features/LessonTab/lessonTextFields.js` and avoids showing English as the main drill line when admin JSON keys are inconsistent.

### `speakingPractice`
Preferred shape: one or more phrases practiced **sequentially** on a single screen (same learner flow as stacking multiple Speaking practice steps).

**Preferred — `phrases` array**
- **`phrases`**: array (1–10)
  - **`word`**: `string` — Afaan Oromo to say (canonical)
  - **`prompt`**: `string` (optional; defaults to `word` when saving)
  - **`word_id`**: `string` (optional UUID from `public.words`)
  - **`speakingDraftTokenId`**: `string` (optional; link to an Audio exposure draft token for example audio)
  - **`tip`**: `string` (optional)

Example:

```json
{
  "phrases": [
    { "word": "Kee", "prompt": "Kee", "word_id": "…" },
    { "word": "Koo", "prompt": "Koo", "word_id": "…" }
  ]
}
```

**Legacy (still read by the learner app)** — single phrase at the top level with the same keys (`word` / `prompt` / `word_id` / `tip` / `speakingDraftTokenId`). Admin save migrates this into `phrases: […]`.

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
- `learned_extra`: `string[]` (optional; admin-only extras merged into `learned`)
- `xpEarned`: `number` (optional)
- `communityDiscussionEnabled`: `boolean` (optional; default off — classic celebration)
- `communityDiscussionPrompt`: `string` (optional; shown when community discussion is on; posts go through `discussion-moderate`)
- `communityDiscussionAllowedEnglish`: `string` (optional; author note for AI — which English / non-Oromo words or patterns are allowed; not shown to learners)
- `vocabSectionId`: `string` (optional; Vocab tab section key e.g. `Greetings`. When set, Celebrate CTA is “Series Vocab” and opens that section. When omitted, CTA is “Language Vocab” and opens all vocabulary.)

Minimal safe:

```json
{
  "title": "Lesson Complete!",
  "message": "Nice work.",
  "nextLesson": "lesson9"
}
```

With community chat:

```json
{
  "message": "Nice work.",
  "communityDiscussionEnabled": true,
  "communityDiscussionPrompt": "Say “akkam” to other learners in Afaan Oromo.",
  "communityDiscussionAllowedEnglish": "English names and “hello” are OK."
}
```

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
Break a phrase into word boxes (personalizes `original` by replacing `____` with the user name). No separate title field — the phrase is the headline.

**content**
- **`original`**: `string` (required; can include `____` for the learner name)
- **`words`**: `{ word: string, translation: string }[]` (>= 1) — target-language segment and gloss/explanation
- `tip`: `string` (optional)

### `repetition`
Pattern exposure with up to 6 related example lines.

**content**
- `title`: `string` (optional)
- `target`: `string` (optional) — pattern word highlighted in each Oromo line (e.g. `jiru`)
- **`examples`**: `{ oromo: string, english: string, audio?: string }[]` (1–6)

### `repetitionPractice`
Three-pair pattern induction and speaking check. The learner reveals the first five Oromo words in sequence, records the missing sixth word, then compares learner/model audio. Exactly three complete pairs are required.

**content**
- `title`: `string` (optional)
- `instruction`: `string` (optional)
- `onePairAtATime`: `boolean` (optional, default false) — when true, the learner sees one pair at a time with a bottom arrow to advance (more room for long words). When omitted/false, all three pairs stack on one screen.
- **`pairs`**: exactly 3 `{ base, answer, sharedStem?, addedPart? }` objects
- `base`: `{ oromo: string, english: string, audio?: string, word_id?: uuid }`
- `answer`: `{ oromo: string, audio?: string, word_id?: uuid }`
  - A typed word without bank audio is added to `public.words` as pending during series sync/approval, then appears in the voice-recording queue.
  - After recording, learner lesson hydration resolves `audio` from the linked `word_id`.
  - `sharedStem`: `string` (optional) — highlighted after the final answer
  - `addedPart`: `string` (optional) — highlighted after the final answer

### `sentenceBuilder`
Tap-to-order Afaan Oromo sentence construction. `words` is persisted in the one correct order; the learner receives a shuffled copy.

**content**
- `title`: `string` (optional)
- `instruction`: `string` (optional)
- **`english`**: `string` — English cue
- **`words`**: `string[]` (at least 2) — ordered target words or meaningful chunks
- `audio`: `string` (optional) — model sentence audio
- `tip`: `string` (optional) — shown after completion

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

