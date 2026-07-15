/**
 * Lesson `content` helpers for the admin Lesson Config editor.
 * Screen types align with docs/admin-lesson-editing-types.ts / Dubbadhu registry.
 */

export type ScreenType =
  | 'intro'
  | 'firstLook'
  | 'match'
  | 'quiz'
  | 'CelebrateScreen'
  | 'dialogue'
  | 'concept'
  | 'patternPractice'
  | 'speakingPractice'
  | 'audioExposure'
  | 'discriminationDrill'
  | 'communityBoard'
  | 'word-breakdown'
  | 'videoReview'
  | 'imageScreen'

/** Legacy `type` strings in stored JSON → canonical ScreenType (learner registry keeps aliases too). */
export const LEGACY_SCREEN_TYPE_ALIASES: Record<string, ScreenType> = {
  animatedConcept: 'concept',
  wordDiscriminationQuiz: 'discriminationDrill',
}

/** Removed screen types: dropped when parsing lesson content (admin / save pipeline). */
export const REMOVED_SCREEN_TYPES = new Set<string>([
  'moduleComplete',
  'situation',
  'audioRecognition',
  'audioResponse',
  'audioDiscrimination',
  'comparison',
])

export type LessonScreen = {
  type: ScreenType
  content: Record<string, unknown>
}

export type LessonContentDraft = {
  id: string
  title: string
  series?: string
  nextLessonId?: string | null
  screens: LessonScreen[]
  [k: string]: unknown
}

export const SCREEN_TYPE_OPTIONS: { value: ScreenType; label: string }[] = [
  { value: 'intro', label: 'Intro' },
  { value: 'concept', label: 'Concept' },
  { value: 'dialogue', label: 'Dialogue' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'match', label: 'Match' },
  { value: 'speakingPractice', label: 'Speaking practice' },
  { value: 'audioExposure', label: 'Audio exposure' },
  { value: 'CelebrateScreen', label: 'Celebrate' },
  { value: 'firstLook', label: 'First look' },
  { value: 'patternPractice', label: 'Pattern practice' },
  { value: 'discriminationDrill', label: 'Discrimination drill' },
  { value: 'communityBoard', label: 'Community board' },
  { value: 'word-breakdown', label: 'Word breakdown' },
  { value: 'videoReview', label: 'Video review' },
  { value: 'imageScreen', label: 'Cultural Context' },
]

export type ScreenTypeOption = { value: ScreenType; label: string }

/** Learner Vocab tab section keys (matches Dubbadhu VocabularyData). */
export const VOCAB_SECTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'Pronouns', label: 'Pronouns' },
  { value: 'Demonstratives', label: 'Demonstratives' },
  { value: 'Greetings', label: 'Greetings' },
  { value: 'TimeWords', label: 'Time Words' },
  { value: 'QuestionWords', label: 'Question Words' },
  { value: 'Food', label: 'Food' },
  { value: 'Numbers', label: 'Numbers' },
  { value: 'Family', label: 'Family' },
  { value: 'PlacesLocations', label: 'Places & Locations' },
  { value: 'Adjectives', label: 'Adjectives' },
  { value: 'BodyParts', label: 'Body Parts' },
  { value: 'Colors', label: 'Colors' },
  { value: 'CommonWords', label: 'Common Words' },
  { value: 'DirectionsMovement', label: 'Directions & Movement' },
  { value: 'WeatherNature', label: 'Weather & Nature' },
  { value: 'ActionVerbs', label: 'Action Verbs' },
  { value: 'Emotions', label: 'Emotions' },
  { value: 'Shopping', label: 'Shopping' },
  { value: 'ImportantPhrases', label: 'Important Phrases' },
  { value: 'PossessiveSuffixes', label: 'Possessive Suffixes' },
  { value: 'CaseMarkers', label: 'Case Markers' },
  { value: 'Negatives', label: 'Negatives' },
]

/**
 * Order for “Add screen” (intro is not addable — it stays first). Matches how lessons are usually built:
 * preview → teach → hear words → speak → pattern drill → check → match → discriminate → analyze → celebrate → extras → video.
 */
const ADD_SCREEN_CURRICULUM_ORDER: ScreenType[] = [
  'firstLook',
  'concept',
  'dialogue',
  'audioExposure',
  'speakingPractice',
  'patternPractice',
  'quiz',
  'match',
  'discriminationDrill',
  'word-breakdown',
  'CelebrateScreen',
  'communityBoard',
  'videoReview',
  'imageScreen',
]

/**
 * Options for “Add screen”. Professors omit video review — admins attach that after curriculum approval.
 */
export function buildAddScreenOptionsForCurriculumEditor(role: string | undefined): ScreenTypeOption[] {
  const excludeVideoReview = role === 'professor'
  const base = SCREEN_TYPE_OPTIONS.filter((o) => o.value !== 'intro')
  const byValue = new Map<string, ScreenTypeOption>()
  for (const o of base) {
    if (excludeVideoReview && o.value === 'videoReview') continue
    byValue.set(o.value, o)
  }
  if (!excludeVideoReview && !byValue.has('videoReview')) {
    byValue.set('videoReview', { value: 'videoReview', label: 'Video review' })
  }
  const ordered: ScreenTypeOption[] = []
  const placed = new Set<string>()
  for (const value of ADD_SCREEN_CURRICULUM_ORDER) {
    const o = byValue.get(value)
    if (o) {
      ordered.push(o)
      placed.add(value)
    }
  }
  for (const o of byValue.values()) {
    if (!placed.has(o.value)) ordered.push(o)
  }
  return ordered
}

/** Professor-facing label hides “video” wording for the review step. */
export function screenTypeLabelForCurriculumEditor(type: string, role: string | undefined): string {
  if (role === 'professor' && type === 'videoReview') return 'Review'
  return SCREEN_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type
}

/** True when `id` looks like a `public.words` primary key (used before DB round-trips). */
export function looksLikeWordsRowUuid(id: unknown): boolean {
  const s = typeof id === 'string' ? id.trim() : ''
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

/**
 * Speaking practice JSON uses `word_id` (same as learner). Older drafts used `speaking_word_id`.
 * Used for list subtitles and optional hydration from `public.words`.
 */
export function speakingPracticeWordsBankRowId(content: Record<string, unknown>): string | null {
  const raw = String(content.word_id ?? content.speaking_word_id ?? '').trim()
  if (!looksLikeWordsRowUuid(raw)) return null
  return raw.toLowerCase()
}

export type ScreenSubtitleContext = {
  /** Full lesson `screens` (same draft as the list); reserved for cross-screen list hints. */
  lessonScreens?: LessonScreen[]
}

/** Professor list/view: no filenames or “Video:” lines for the review step. */
export function screenSubtitleLinesForCurriculumEditor(
  screen: LessonScreen,
  role: string | undefined,
  lessonScreens?: LessonScreen[],
): string[] {
  const ctx: ScreenSubtitleContext | undefined =
    lessonScreens && lessonScreens.length ? { lessonScreens } : undefined
  if (role !== 'professor' || screen.type !== 'videoReview') return screenSubtitleLines(screen, ctx)
  const lines: string[] = []
  lines.push('Admin completes this step after curriculum approval')
  return lines
}

const KNOWN: Set<string> = new Set(SCREEN_TYPE_OPTIONS.map((o) => o.value))

export function isScreenType(s: string): s is ScreenType {
  return KNOWN.has(s)
}

export function parseLessonContent(raw: unknown, lessonId: string): LessonContentDraft | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const screensRaw = o.screens
  if (!Array.isArray(screensRaw) || screensRaw.length === 0) return null
  const screens: LessonScreen[] = []
  for (const item of screensRaw) {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) continue
    const typeRaw = (item as Record<string, unknown>).type
    const c = (item as Record<string, unknown>).content
    if (typeof typeRaw !== 'string') continue
    if (REMOVED_SCREEN_TYPES.has(typeRaw)) continue
    const mapped = LEGACY_SCREEN_TYPE_ALIASES[typeRaw]
    const t = (mapped ?? typeRaw) as string
    if (!isScreenType(t)) continue
    if (c == null || typeof c !== 'object' || Array.isArray(c)) continue
    screens.push({
      type: t,
      content: { ...(c as Record<string, unknown>) },
    })
  }
  if (screens.length === 0) return null
  return {
    ...o,
    id: typeof o.id === 'string' ? o.id : lessonId,
    title: typeof o.title === 'string' ? o.title : '',
    series: typeof o.series === 'string' ? o.series : undefined,
    nextLessonId: (() => {
      if (!('nextLessonId' in o)) return undefined
      const v = o.nextLessonId
      if (v === null) return null
      if (typeof v === 'string') return v
      if (v === undefined) return undefined
      return String(v)
    })(),
    screens,
  } as LessonContentDraft
}

export function defaultScreen(type: ScreenType): LessonScreen {
  switch (type) {
    case 'intro':
      return { type, content: { goal: '' } }
    case 'concept':
      return { type, content: { targetWord: '', bullets: [''] } }
    case 'dialogue':
      return {
        type,
        content: {
          dialogueData: {
            person1: { name: 'Person 1', lines: [''], translations: [''] },
            person2: { name: 'Person 2', lines: [''], translations: [''] },
          },
        },
      }
    case 'quiz':
      return {
        type,
        content: {
          heading: '',
          questions: [{ question: '', options: ['', ''], correctAnswer: 0 }],
        },
      }
    case 'match':
      return { type, content: { title: '', pairs: [{ left: '', right: '' }] } }
    case 'speakingPractice':
      return {
        type,
        content: { word: '', word_id: '', prompt: '' },
      }
    case 'audioExposure':
      return {
        type,
        content: { words: [{ word: '', word_id: '' }] },
      }
    case 'CelebrateScreen':
      return { type, content: { message: 'Nice work.' } }
    case 'patternPractice':
      return {
        type,
        content: {
          exercises: [{ prompt: '', options: [], correctSuffix: '' }],
        },
      }
    case 'discriminationDrill':
      return {
        type,
        content: {
          question: '',
          words: [
            { text: '', definition: '' },
            { text: '', definition: '' },
          ],
          scenes: [
            {
              image: '',
              imageRequestDescription: '',
              imageContext: '',
              correctWordIndex: 0,
              explanation: '',
            },
          ],
        },
      }
    case 'videoReview':
      return {
        type,
        content: {
          videoUrl: '',
          lines: [],
        },
      }
    case 'imageScreen':
      return {
        type,
        content: {
          image: '',
          imagePrompt: '',
          title: '',
          body: '',
        },
      }
    default:
      return { type, content: {} }
  }
}

/** One line per Audio exposure word for lesson list subtitles (Afaan — English when both exist). */
export function audioExposureWordSummaryLines(content: Record<string, unknown>): string[] {
  const words = content.words
  if (!Array.isArray(words)) return ['—']
  const lines: string[] = []
  for (const w of words) {
    if (w == null || typeof w !== 'object' || Array.isArray(w)) continue
    const rec = w as Record<string, unknown>
    const wid = String(rec.word_id ?? '').trim().toLowerCase()
    const afaan = String(rec.word ?? '').trim()
    const english = String(rec.translation ?? '').trim()
    if (!afaan && !english) continue
    const label = english ? `${afaan} — ${english}` : afaan
    if (UUID_RE_FOR_WORD_ROW.test(wid)) {
      lines.push(label)
      continue
    }
    const dt = String(rec.draftTokenId ?? '').trim()
    if (!dt || !afaan) continue
    lines.push(`${label} (no audio yet)`)
  }
  return lines.length ? lines : ['—']
}

/** One side of a two-person dialogue (Person 1 speaks first; lines alternate with Person 2). */
export function mapDialogueSide(input: Record<string, unknown> | undefined): Record<string, unknown> {
  const name = String(input?.name ?? '').trim()
  const linesSrc = input?.lines
  let lines: string[] = []
  if (Array.isArray(linesSrc)) {
    // Preserve spaces while typing — trim only at validation/save, not on every normalize.
    lines = linesSrc.map((x) => String(x ?? ''))
  } else if (typeof linesSrc === 'string') {
    lines = linesSrc.split(/\r?\n/).map((s) => String(s ?? ''))
  }
  if (lines.length === 0) lines = ['']
  const transSrc = input?.translations
  let translations: string[] = []
  if (Array.isArray(transSrc)) {
    translations = transSrc.map((x) => (x == null ? '' : String(x)))
  } else if (typeof transSrc === 'string') {
    translations = transSrc.split(/\r?\n/).map((s) => s.trim())
  }
  while (translations.length < lines.length) translations.push('')
  if (translations.length > lines.length) translations = translations.slice(0, lines.length)
  return { name, lines, translations }
}

export function normalizeDialogueContent(content: Record<string, unknown>): Record<string, unknown> {
  const dd = (content.dialogueData as Record<string, unknown> | undefined) ?? {}
  const p1in = dd.person1
  const p2in = dd.person2
  let person1: Record<string, unknown>
  let person2: Record<string, unknown>
  if (
    p1in != null &&
    typeof p1in === 'object' &&
    !Array.isArray(p1in) &&
    p2in != null &&
    typeof p2in === 'object' &&
    !Array.isArray(p2in)
  ) {
    person1 = mapDialogueSide(p1in as Record<string, unknown>)
    person2 = mapDialogueSide(p2in as Record<string, unknown>)
  } else {
    person1 = mapDialogueSide(undefined)
    person2 = mapDialogueSide(undefined)
  }
  return {
    dialogueData: {
      person1,
      person2,
    },
    // Keep optional dialogue playback clip bounds (not part of speaker data).
    ...(content.fromSecond !== undefined ? { fromSecond: content.fromSecond } : {}),
    ...(content.toSecond !== undefined ? { toSecond: content.toSecond } : {}),
  }
}

/** Short label for lesson lists from `person1` / `person2` names. */
export function dialogueNameSummaryFromContent(content: Record<string, unknown>): string {
  const dd = content.dialogueData as Record<string, unknown> | undefined
  if (!dd || typeof dd !== 'object') return '2 speakers'
  const p1 = dd.person1 as Record<string, unknown> | undefined
  const p2 = dd.person2 as Record<string, unknown> | undefined
  if (
    p1 != null &&
    typeof p1 === 'object' &&
    !Array.isArray(p1) &&
    p2 != null &&
    typeof p2 === 'object' &&
    !Array.isArray(p2)
  ) {
    const n0 = String(p1.name ?? '').trim() || 'Person 1'
    const n1 = String(p2.name ?? '').trim() || 'Person 2'
    return `${n0} / ${n1}`
  }
  return '2 speakers'
}

/**
 * Word discrimination quiz: migrate legacy wordA/wordB + scenes[].correct (A|B) into
 * `words[]` and `scenes[].correctWordIndex` when opening the editor.
 */
export function normalizeWordDiscriminationContentForEdit(content: Record<string, unknown>): Record<string, unknown> {
  const rawWords = content.words
  let words: Record<string, unknown>[] = []

  if (Array.isArray(rawWords) && rawWords.length >= 2) {
    words = rawWords.map((w) => {
      if (w == null || typeof w !== 'object' || Array.isArray(w)) {
        return { text: '', definition: '' }
      }
      const r = w as Record<string, unknown>
      const text = String(r.text ?? r.oromo ?? r.word ?? '').trim()
      const definition = String(r.definition ?? r.english ?? r.translation ?? '').trim()
      const o: Record<string, unknown> = { text, definition }
      if (typeof r.word_id === 'string' && r.word_id.trim()) o.word_id = r.word_id.trim()
      return o
    })
  } else {
    const wa = String(content.wordA ?? content.word_a ?? '').trim()
    const wb = String(content.wordB ?? content.word_b ?? '').trim()
    const da = String(content.definitionA ?? '').trim()
    const db = String(content.definitionB ?? '').trim()
    if (wa && wb) {
      const a: Record<string, unknown> = { text: wa, definition: da }
      const b: Record<string, unknown> = { text: wb, definition: db }
      if (typeof content.wordA_id === 'string' && content.wordA_id.trim()) a.word_id = content.wordA_id.trim()
      if (typeof content.wordB_id === 'string' && content.wordB_id.trim()) b.word_id = content.wordB_id.trim()
      words = [a, b]
    } else {
      words = [
        { text: '', definition: '' },
        { text: '', definition: '' },
      ]
    }
  }

  while (words.length < 2) {
    words.push({ text: '', definition: '' })
  }

  const rawScenes = Array.isArray(content.scenes) ? content.scenes : []
  let sharedQuestion = String(content.question ?? content.title ?? content.prompt ?? '').trim()
  if (!sharedQuestion) {
    for (const s of rawScenes) {
      if (s == null || typeof s !== 'object' || Array.isArray(s)) continue
      const sc = s as Record<string, unknown>
      const q = String(sc.question ?? sc.title ?? sc.prompt ?? '').trim()
      if (q) {
        sharedQuestion = q
        break
      }
    }
  }

  const scenes: Record<string, unknown>[] = rawScenes.map((s) => {
    if (s == null || typeof s !== 'object' || Array.isArray(s)) {
      return { image: '', imageRequestDescription: '', imageContext: '', correctWordIndex: 0, explanation: '' }
    }
    const sc = s as Record<string, unknown>
    let correctWordIndex = 0
    if (typeof sc.correctWordIndex === 'number' && Number.isFinite(sc.correctWordIndex)) {
      correctWordIndex = Math.floor(sc.correctWordIndex)
    } else {
      const cor = String(sc.correct ?? '').trim().toUpperCase()
      correctWordIndex = cor === 'B' ? 1 : 0
    }
    const maxIdx = Math.max(0, words.length - 1)
    if (correctWordIndex < 0 || correctWordIndex > maxIdx) correctWordIndex = 0
    return {
      image: String(sc.image ?? sc.imageUrl ?? '').trim(),
      imageRequestDescription: String(sc.imageRequestDescription ?? '').trim(),
      imageContext: String(sc.imageContext ?? '').trim(),
      correctWordIndex,
      explanation: String(sc.explanation ?? '').trim(),
    }
  })

  if (scenes.length === 0) {
    scenes.push({ image: '', imageRequestDescription: '', imageContext: '', correctWordIndex: 0, explanation: '' })
  }

  const next: Record<string, unknown> = {
    question: sharedQuestion,
    words,
    scenes,
  }
  const stRaw = content.streakTarget ?? content.streak_target
  if (stRaw != null && Number.isFinite(Number(stRaw))) {
    next.streakTarget = Math.floor(Number(stRaw))
  }
  return next
}

/** Video review: only keys the app reads (drops legacy aliases from stored JSON). */
export function normalizeVideoReviewContentForEdit(
  content: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (content == null || typeof content !== 'object' || Array.isArray(content)) {
    return { videoUrl: '', lines: [] }
  }
  const freezeRaw = (content.freezeAtSeconds ?? content.freeze_at_seconds) as unknown
  const freezeAtSeconds =
    freezeRaw != null && Number.isFinite(Number(freezeRaw)) ? Number(freezeRaw) : undefined

  const rawLines = Array.isArray(content.lines) ? (content.lines as unknown[]) : []
  const lines = rawLines
    .map((x, idx) => {
      if (x == null || typeof x !== 'object' || Array.isArray(x)) {
        return { id: `line_${idx + 1}`, text: '', vocabWords: [] }
      }
      const r = x as Record<string, unknown>
      const id = String(r.id ?? `line_${idx + 1}`).trim() || `line_${idx + 1}`
      const text = String(r.text ?? r.line ?? '').trim()
      const vwRaw = Array.isArray(r.vocabWords) ? (r.vocabWords as unknown[]) : Array.isArray(r.words) ? (r.words as unknown[]) : []
      const vocabWords = vwRaw
        .filter((w) => w != null && typeof w === 'object' && !Array.isArray(w))
        .map((w) => {
          const rec = { ...(w as Record<string, unknown>) }
          const afaan = String(rec.word ?? rec.oromo ?? rec.text ?? '').trim()
          if (afaan) rec.word = afaan
          delete rec.oromo
          delete rec.text
          return rec
        })
      return { id, text, vocabWords }
    })
    .filter((l) => String((l as Record<string, unknown>).text ?? '').trim())

  const out: Record<string, unknown> = {
    videoUrl: String(content.videoUrl ?? '').trim(),
    lines,
  }
  if (freezeAtSeconds != null) out.freezeAtSeconds = freezeAtSeconds
  return out
}

function pickAllowedKeys(obj: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(obj)) {
    if (allowed.has(k)) out[k] = obj[k]
  }
  return out
}

/**
 * Defaults mirrored in learner screens; persist JSON only when it differs — keeps `lessons.content` small.
 *
 * - Audio exposure timing/chrome: fixed in `Dubbadhu/.../AudioExposureScreen.js` (not stored; only optional `title` + `words`).
 * - Match subtitle line: `Dubbadhu/features/LessonTab/LessonModules/MatchScreen.js`
 * - Dialogue translations: hidden by default in `DialogueScreen.js` (learner can tap Show).
 * - Discrimination streak (legacy 2-word mode): `Dubbadhu/features/LessonTab/LessonModules/WordDiscriminationQuizScreen.js`
 */
export const MATCH_DEFAULT_SUBTITLE_LINE = 'Tap a word, then its meaning'
export const DISCRIMINATION_LEGACY_DEFAULT_STREAK_TARGET = 5

/** Drop placeholder titles; keep only real overrides (matches learner `exposureTitleForDisplay`). */
function normalizeAudioExposureTitleForPersistence(
  title: unknown,
): string | undefined {
  const raw = String(title ?? '').trim()
  if (!raw) return undefined
  if (/^listen\s+&\s*learn$/i.test(raw.replace(/\s+/g, ' '))) return undefined
  if (/^listen\s+first\s*$/i.test(raw)) return undefined
  const m = raw.match(/^listen\s+first(\s*[:\-–—]\s*|\s+)(.+)$/i)
  if (m) {
    const suf = String(m[2] ?? '').trim()
    return suf || undefined
  }
  return raw
}

const UUID_RE_FOR_WORD_ROW =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Persist `{ word_id, word?, draftTokenId?, translation?, saidBy? }` (lean; learner hydrates gloss from DB too).
 * When there is no `word_id` yet, persist `{ draftTokenId, word, translation?, saidBy? }` so exposure rows stay
 * in the lesson until they are linked to the word bank (same `draftTokenId` for speaking practice).
 * Optional `translation` keeps admin / Celebrate subtitles readable when JSON has no inline gloss.
 * Optional `saidBy` is per-word speaker attribution in the learner app.
 */
export function sanitizeAudioExposureWordTokenForPersistence(
  w: Record<string, unknown>,
): Record<string, unknown> | null {
  const wid = String(w.word_id ?? '').trim().toLowerCase()
  const wordReadable = String(w.word ?? '').trim()
  const dt = String(w.draftTokenId ?? '').trim()
  const gloss = String(w.translation ?? w.english ?? '').trim()
  const saidBy = String(w.saidBy ?? '').trim()

  if (UUID_RE_FOR_WORD_ROW.test(wid)) {
    const out: Record<string, unknown> = { word_id: wid }
    if (wordReadable) out.word = wordReadable
    if (dt) out.draftTokenId = dt
    if (gloss) out.translation = gloss
    if (saidBy) out.saidBy = saidBy
    return out
  }

  if (!dt || !wordReadable) return null
  const out: Record<string, unknown> = { draftTokenId: dt, word: wordReadable }
  if (gloss) out.translation = gloss
  if (saidBy) out.saidBy = saidBy
  return out
}

export type AudioExposureWordIdGap = {
  /** 0-based index in `lesson.screens` */
  screenIndex: number
  /** 0-based index in `content.words` */
  wordIndex: number
  /** Short label for error copy */
  label: string
}

function audioExposureAfaanFromRec(rec: Record<string, unknown>): string {
  return String(rec.word ?? (rec as { oromo?: string }).oromo ?? (rec as { text?: string }).text ?? '').trim()
}

function audioExposureGlossFromRec(rec: Record<string, unknown>): string {
  return String(rec.translation ?? rec.english ?? '').trim()
}

/**
 * Lesson / screen save while series is still draft: require Afaan + translation (or an existing `word_id`).
 * New phrases stay as `draftTokenId` in JSON until **Approve Series** inserts `words` rows and backfills ids.
 */
export function findAudioExposureWordsBlockingLessonSave(screens: LessonScreen[]): AudioExposureWordIdGap[] {
  const out: AudioExposureWordIdGap[] = []
  screens.forEach((s, si) => {
    if (s.type !== 'audioExposure') return
    const words = (s.content as Record<string, unknown>).words
    if (!Array.isArray(words)) return
    words.forEach((w, wi) => {
      if (w == null || typeof w !== 'object' || Array.isArray(w)) return
      const rec = w as Record<string, unknown>
      const wid = String(rec.word_id ?? '').trim().toLowerCase()
      if (UUID_RE_FOR_WORD_ROW.test(wid)) return
      const afaan = audioExposureAfaanFromRec(rec)
      const gloss = audioExposureGlossFromRec(rec)
      const label = afaan.slice(0, 48) || `row ${wi + 1}`
      if (!afaan || !gloss) {
        out.push({ screenIndex: si, wordIndex: wi, label })
      }
    })
  })
  return out
}

/** Human-readable checklist when saving a lesson screen (draft phrases allowed). */
export function formatAudioExposureDraftGapsForLessonSave(gaps: AudioExposureWordIdGap[]): string {
  if (gaps.length === 0) return ''
  const lines = gaps
    .slice(0, 14)
    .map(
      (g) =>
        `• Screen ${g.screenIndex + 1} (Listen & Learn), word ${g.wordIndex + 1}: “${g.label}” — add Afaan Oromo and translation`,
    )
  const more = gaps.length > 14 ? `\n… +${gaps.length - 14} more` : ''
  return `${lines.join('\n')}${more}`
}

/**
 * Returns exposure `words[]` rows that do not have a UUID `word_id` (not linked to `public.words`).
 * Use before **Approve Series** (after seed/backfill) or for published curriculum checks — not for draft lesson saves.
 */
export function findAudioExposureWordsMissingWordId(screens: LessonScreen[]): AudioExposureWordIdGap[] {
  const out: AudioExposureWordIdGap[] = []
  screens.forEach((s, si) => {
    if (s.type !== 'audioExposure') return
    const words = (s.content as Record<string, unknown>).words
    if (!Array.isArray(words)) return
    words.forEach((w, wi) => {
      if (w == null || typeof w !== 'object' || Array.isArray(w)) return
      const rec = w as Record<string, unknown>
      const wid = String(rec.word_id ?? '').trim().toLowerCase()
      if (UUID_RE_FOR_WORD_ROW.test(wid)) return
      const label =
        String(rec.word ?? (rec as { oromo?: string }).oromo ?? '')
          .trim()
          .slice(0, 48) || `row ${wi + 1}`
      out.push({ screenIndex: si, wordIndex: wi, label })
    })
  })
  return out
}

/** Human-readable checklist for alerts (newline-separated bullet lines after the header). */
export function formatAudioExposureWordIdGapsForAdmin(gaps: AudioExposureWordIdGap[]): string {
  if (gaps.length === 0) return ''
  const lines = gaps
    .slice(0, 14)
    .map(
      (g) =>
        `• Screen ${g.screenIndex + 1} (Listen & Learn), word ${g.wordIndex + 1}: “${g.label}” — link to word bank`,
    )
  const more = gaps.length > 14 ? `\n… +${gaps.length - 14} more` : ''
  return `${lines.join('\n')}${more}`
}

/** Client-generated id so speaking practice can reference an exposure row in the same draft JSON. */
export function newDraftTokenId(): string {
  return `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/** Ensure every audio-exposure word has `draftTokenId` (for cross-screen links while editing). */
export function normalizeAudioExposureContentForEdit(content: Record<string, unknown>): Record<string, unknown> {
  const out = { ...content }
  // Legacy screen-level saidBy → stamp onto words that lack their own (then drop screen field).
  const legacySaidBy = String(out.saidBy ?? '').trim()
  delete out.saidBy
  const wordsRaw = out.words
  if (!Array.isArray(wordsRaw)) return out
  out.words = wordsRaw.map((w) => {
    if (w == null || typeof w !== 'object' || Array.isArray(w)) return w
    const rec = { ...(w as Record<string, unknown>) }
    const afaan = String(rec.word ?? rec.oromo ?? rec.text ?? '').trim()
    if (afaan) rec.word = afaan
    delete rec.oromo
    delete rec.text
    const gloss = String(rec.translation ?? rec.english ?? '').trim()
    if (gloss) {
      rec.translation = gloss
      delete rec.english
    }
    const wordSaidBy = String(rec.saidBy ?? '').trim()
    if (wordSaidBy) rec.saidBy = wordSaidBy
    else if (legacySaidBy) rec.saidBy = legacySaidBy
    else delete rec.saidBy
    const existing = String(rec.draftTokenId ?? '').trim()
    if (!existing) rec.draftTokenId = newDraftTokenId()
    delete rec.audioRef
    return rec
  })
  return out
}

export type AudioExposureLinkOption = {
  draftTokenId: string
  afaan: string
  english: string
  /** 1-based index in lesson `screens` (for admin display). */
  screenIndex: number
}

/** Tokens admins can attach to speaking practice (same lesson, audio exposure screens). */
export function listAudioExposureLinkOptionsFromScreens(screens: LessonScreen[]): AudioExposureLinkOption[] {
  const out: AudioExposureLinkOption[] = []
  screens.forEach((s, idx) => {
    if (s.type !== 'audioExposure') return
    const words = (s.content as Record<string, unknown>).words
    if (!Array.isArray(words)) return
    for (const w of words) {
      if (w == null || typeof w !== 'object' || Array.isArray(w)) continue
      const rec = w as Record<string, unknown>
      const id = String(rec.draftTokenId ?? '').trim()
      const afaan = String(rec.word ?? '').trim()
      if (!id || !afaan) continue
      const english = String(rec.translation ?? '').trim()
      out.push({ draftTokenId: id, afaan, english, screenIndex: idx + 1 })
    }
  })
  return out
}

/** Find raw exposure word object by `draftTokenId` (hydration / editor). */
export function findAudioExposureWordRecordByDraftTokenId(
  screens: LessonScreen[],
  tokenId: string,
): Record<string, unknown> | null {
  const id = tokenId.trim()
  if (!id) return null
  for (const s of screens) {
    if (s.type !== 'audioExposure') continue
    const words = (s.content as Record<string, unknown>).words
    if (!Array.isArray(words)) continue
    for (const w of words) {
      if (w == null || typeof w !== 'object' || Array.isArray(w)) continue
      const rec = w as Record<string, unknown>
      if (String(rec.draftTokenId ?? '').trim() === id) return rec
    }
  }
  return null
}

function speakingPracticePrimaryLine(c: Record<string, unknown>): string {
  const prompt = String(c.prompt ?? '').trim()
  if (prompt) return prompt
  return String(c.word ?? '').trim()
}

function speakingPracticeEnglishLine(c: Record<string, unknown>): string {
  return ''
}

const QUIZ_OPTION_KEYS = new Set(['text', 'english', 'audioRef', 'word_id'])

/** Map quiz option JSON (admin `text`/`english`, learner-style `word`/`translation`, or legacy `oromo`) for editor + sanitize. */
export function normalizeQuizOptionRowForEditor(rec: Record<string, unknown>): {
  text: string
  english: string
  word_id?: string
  audioRef?: string
} {
  const text = String(rec.text ?? rec.word ?? rec.oromo ?? '').trim()
  const english = String(rec.english ?? rec.translation ?? rec.definition ?? '').trim()
  const ar = rec.audioRef
  const wid = rec.word_id
  return {
    text,
    english,
    word_id: typeof wid === 'string' && wid.trim() ? wid.trim() : undefined,
    audioRef: typeof ar === 'string' && ar.trim() ? ar.trim() : undefined,
  }
}

function sanitizeQuizOptionsArray(opts: unknown): unknown {
  if (!Array.isArray(opts)) return opts
  return opts.map((o) => {
    if (typeof o === 'string') return o
    if (o != null && typeof o === 'object' && !Array.isArray(o)) {
      const d = normalizeQuizOptionRowForEditor(o as Record<string, unknown>)
      const out: Record<string, unknown> = { text: d.text, english: d.english }
      if (d.word_id) out.word_id = d.word_id
      if (d.audioRef) out.audioRef = d.audioRef
      return pickAllowedKeys(out, QUIZ_OPTION_KEYS)
    }
    return o
  })
}

/**
 * Strip content keys the learner app and admin forms never read, so Supabase JSON stays aligned
 * with the structured editor. Run after type-specific normalizers.
 */
export function sanitizeScreenContentForPersistence(
  type: ScreenType,
  content: Record<string, unknown>,
): Record<string, unknown> {
  switch (type) {
    case 'intro': {
      const base = pickAllowedKeys(content, new Set(['goal']))
      const g = base.goal
      base.goal = typeof g === 'string' ? g : String(g ?? '')
      return base
    }
    case 'concept': {
      const base = pickAllowedKeys(content, new Set(['targetWord', 'bullets']))
      base.targetWord = String(base.targetWord ?? '').trim()
      const b = base.bullets
      if (Array.isArray(b)) {
        base.bullets = b
          .map((x) => (typeof x === 'string' ? x : String(x ?? '')))
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 3)
      } else {
        base.bullets = []
      }
      if (!Array.isArray(base.bullets) || base.bullets.length === 0) {
        base.bullets = ['']
      }
      return base
    }
    case 'dialogue': {
      const base = pickAllowedKeys(
        content,
        new Set(['dialogueData', 'fromSecond', 'toSecond']),
      )
      const dd = base.dialogueData
      if (dd != null && typeof dd === 'object' && !Array.isArray(dd)) {
        const merged = normalizeDialogueContent(base as Record<string, unknown>)
        const md = merged.dialogueData as Record<string, unknown>
        const sideKeys = new Set(['name', 'lines', 'translations'])
        const shape = (x: unknown) =>
          x != null && typeof x === 'object' && !Array.isArray(x)
            ? pickAllowedKeys(x as Record<string, unknown>, sideKeys)
            : { name: '', lines: [''], translations: [] as string[] }
        base.dialogueData = {
          person1: shape(md.person1),
          person2: shape(md.person2),
        }
      }
      const fromSec = Number(base.fromSecond)
      const toSec = Number(base.toSecond)
      if (Number.isFinite(fromSec) && fromSec >= 0) base.fromSecond = fromSec
      else delete base.fromSecond
      if (Number.isFinite(toSec) && toSec > 0) base.toSecond = toSec
      else delete base.toSecond
      if (
        base.fromSecond != null &&
        base.toSecond != null &&
        Number(base.toSecond) <= Number(base.fromSecond)
      ) {
        delete base.fromSecond
        delete base.toSecond
      }
      return base
    }
    case 'match': {
      const base = pickAllowedKeys(content, new Set(['title', 'pairs']))
      const t = String(base.title ?? '').trim()
      if (!t || t === MATCH_DEFAULT_SUBTITLE_LINE) delete base.title
      return base
    }
    case 'quiz': {
      const base = pickAllowedKeys(content, new Set([
        'heading',
        'questions',
        'audioOptions',
        'question',
        'options',
        'correctAnswer',
        'answer',
        'explanation',
      ]))
      if (Array.isArray(base.options)) base.options = sanitizeQuizOptionsArray(base.options)
      const rootAo = base.audioOptions
      if (rootAo !== true && rootAo !== 'true') delete base.audioOptions
      const h = String(base.heading ?? '').trim()
      if (!h) delete base.heading
      const ex0 = base.explanation
      if (ex0 == null || !String(ex0).trim()) delete base.explanation

      const qs = base.questions
      if (!Array.isArray(qs)) return base
      base.questions = qs.map((q) => {
        if (q == null || typeof q !== 'object' || Array.isArray(q)) return q
        const qo = pickAllowedKeys(q as Record<string, unknown>, new Set([
          'question',
          'options',
          'correctAnswer',
          'answer',
          'explanation',
          'audioOptions',
        ]))
        if (Array.isArray(qo.options)) qo.options = sanitizeQuizOptionsArray(qo.options)
        const qao = qo.audioOptions
        if (qao !== true && qao !== 'true') delete qo.audioOptions
        const ex = qo.explanation
        if (ex == null || !String(ex).trim()) delete qo.explanation
        return qo
      })
      return base
    }
    case 'speakingPractice': {
      const sp = pickAllowedKeys(
        content,
        new Set([
          'word',
          'word_id',
          'prompt',
          'tip',
          'speakingDraftTokenId',
        ]),
      )
      const wiRaw = String((sp as Record<string, unknown>).word_id ?? '').trim().toLowerCase()
      if (UUID_RE_FOR_WORD_ROW.test(wiRaw)) {
        ;(sp as Record<string, unknown>).word_id = wiRaw
      } else {
        delete (sp as Record<string, unknown>).word_id
      }
      const linkTok = String((sp as Record<string, unknown>).speakingDraftTokenId ?? '').trim()
      if (linkTok) (sp as Record<string, unknown>).speakingDraftTokenId = linkTok
      else delete (sp as Record<string, unknown>).speakingDraftTokenId
      const w = String((sp as Record<string, unknown>).word ?? '').trim()
      if (!w) delete (sp as Record<string, unknown>).word
      else (sp as Record<string, unknown>).word = w
      const p = String((sp as Record<string, unknown>).prompt ?? '').trim()
      if (!p) delete (sp as Record<string, unknown>).prompt
      else (sp as Record<string, unknown>).prompt = p
      const t = String((sp as Record<string, unknown>).tip ?? '').trim()
      if (!t) delete (sp as Record<string, unknown>).tip
      return sp
    }
    case 'audioExposure': {
      const base = pickAllowedKeys(content, new Set(['title', 'saidBy', 'words']))
      const words = base.words
      if (!Array.isArray(words)) return base
      base.words = words
        .map((w) =>
          w != null && typeof w === 'object' && !Array.isArray(w)
            ? sanitizeAudioExposureWordTokenForPersistence(w as Record<string, unknown>)
            : null,
        )
        .filter((x): x is Record<string, unknown> => x != null)
      const b = base as Record<string, unknown>
      const titNorm = normalizeAudioExposureTitleForPersistence(b.title)
      if (titNorm === undefined) delete b.title
      else b.title = titNorm
      const saidBy = String(b.saidBy ?? '').trim()
      if (!saidBy) delete b.saidBy
      else b.saidBy = saidBy
      return base
    }
    case 'CelebrateScreen': {
      const base = pickAllowedKeys(
        content,
        new Set([
          'learned',
          'learned_extra',
          'encouragement',
          'summary',
          'message',
          'nextLesson',
          'communityDiscussionEnabled',
          'communityDiscussionPrompt',
          'communityDiscussionAllowedEnglish',
          'vocabSectionId',
        ]),
      )
      const nl = base.nextLesson
      if (nl == null || !String(nl).trim()) delete base.nextLesson
      const vocabSectionId = String(base.vocabSectionId ?? '').trim()
      if (vocabSectionId) base.vocabSectionId = vocabSectionId
      else delete base.vocabSectionId
      const enabled =
        base.communityDiscussionEnabled === true ||
        base.communityDiscussionEnabled === 'true' ||
        base.communityDiscussionEnabled === 1 ||
        base.communityDiscussionEnabled === '1'
      if (enabled) {
        base.communityDiscussionEnabled = true
        const prompt = String(base.communityDiscussionPrompt ?? '').trim()
        if (prompt) base.communityDiscussionPrompt = prompt
        else delete base.communityDiscussionPrompt
        const allowed = String(base.communityDiscussionAllowedEnglish ?? '').trim()
        if (allowed) base.communityDiscussionAllowedEnglish = allowed
        else delete base.communityDiscussionAllowedEnglish
      } else {
        delete base.communityDiscussionEnabled
        delete base.communityDiscussionPrompt
        delete base.communityDiscussionAllowedEnglish
      }
      const msg = base.message
      if (msg == null || !String(msg).trim()) delete base.message
      return base
    }
    case 'patternPractice': {
      const base = pickAllowedKeys(content, new Set(['heading', 'instruction', 'pattern', 'exercises']))
      for (const k of ['heading', 'instruction', 'pattern'] as const) {
        const v = base[k]
        if (v == null || !String(v).trim()) delete base[k]
      }
      const ex = base.exercises
      if (!Array.isArray(ex)) return base
      base.exercises = ex.map((e) => {
        if (e == null || typeof e !== 'object' || Array.isArray(e)) return e
        const row = pickAllowedKeys(e as Record<string, unknown>, new Set([
          'prompt',
          'options',
          'correctSuffix',
          'nounPart',
          'nounPartLabel',
          'suffixLabel',
          'explanation',
        ]))
        const exRow = row.explanation
        if (exRow == null || !String(exRow).trim()) delete row.explanation
        return row
      })
      return base
    }
    case 'discriminationDrill': {
      const base = pickAllowedKeys(
        content,
        new Set(['question', 'title', 'prompt', 'words', 'scenes', 'streakTarget', 'streak_target']),
      )
      const wk = new Set(['text', 'definition', 'word_id', 'oromo', 'word'])
      const sk = new Set([
        'image',
        'imageUrl',
        'imageRequestDescription',
        'imageContext',
        'correctWordIndex',
        'correct',
        'explanation',
        'question',
        'title',
        'prompt',
      ])
      const ws = base.words
      if (Array.isArray(ws)) {
        base.words = ws.map((w) =>
          w != null && typeof w === 'object' && !Array.isArray(w)
            ? pickAllowedKeys(w as Record<string, unknown>, wk)
            : w,
        )
      }
      const sc = base.scenes
      if (Array.isArray(sc)) {
        base.scenes = sc.map((s) => {
          if (s == null || typeof s !== 'object' || Array.isArray(s)) return s
          const row = pickAllowedKeys(s as Record<string, unknown>, sk)
          const ctx = row.imageContext
          if (ctx == null || !String(ctx).trim()) delete row.imageContext
          return row
        })
      }
      const wordRows = Array.isArray(base.words) ? base.words : []
      const wordCount = wordRows.filter((w) => w != null && typeof w === 'object' && !Array.isArray(w)).length
      if (wordCount >= 2) {
        delete base.streakTarget
        delete base.streak_target
      } else {
        const st = Number(base.streakTarget ?? base.streak_target)
        if (!Number.isFinite(st) || st === DISCRIMINATION_LEGACY_DEFAULT_STREAK_TARGET) {
          delete base.streakTarget
          delete base.streak_target
        }
      }
      for (const k of ['question', 'title', 'prompt'] as const) {
        const v = base[k]
        if (v == null || !String(v).trim()) delete base[k]
      }
      return base
    }
    case 'firstLook': {
      const base = pickAllowedKeys(content, new Set(['entries', 'heading', 'note']))
      const ent = base.entries
      if (Array.isArray(ent)) {
        const ek = new Set(['word', 'translation', 'audio', 'oromo', 'english'])
        base.entries = ent.map((e) =>
          e != null && typeof e === 'object' && !Array.isArray(e)
            ? pickAllowedKeys(e as Record<string, unknown>, ek)
            : e,
        )
      }
      for (const k of ['heading', 'note'] as const) {
        const v = base[k]
        if (v == null || !String(v).trim()) delete base[k]
      }
      return base
    }
    case 'communityBoard':
      return pickAllowedKeys(content, new Set(['prompt', 'topic']))
    case 'word-breakdown': {
      const base = pickAllowedKeys(content, new Set(['original', 'words', 'tip']))
      delete (base as Record<string, unknown>).heading
      const wr = base.words
      if (Array.isArray(wr)) {
        base.words = wr.map((w) =>
          w != null && typeof w === 'object' && !Array.isArray(w)
            ? pickAllowedKeys(w as Record<string, unknown>, new Set(['word', 'translation']))
            : w,
        )
      }
      for (const k of ['tip'] as const) {
        const v = base[k]
        if (v == null || !String(v).trim()) delete base[k]
      }
      const orig = String(base.original ?? '').trim()
      if (orig) base.original = orig
      else delete base.original
      return base
    }
    case 'videoReview': {
      const base = pickAllowedKeys(
        content,
        new Set(['videoUrl', 'freezeAtSeconds', 'lines']),
      )

      const sanitizeWordArr = (arr: unknown): unknown => {
        if (!Array.isArray(arr)) return arr
        return arr
          .map((w) =>
            w != null && typeof w === 'object' && !Array.isArray(w)
              ? sanitizeAudioExposureWordTokenForPersistence(w as Record<string, unknown>)
              : null,
          )
          .filter((x): x is Record<string, unknown> => x != null)
      }

      const rawLines = base.lines
      if (Array.isArray(rawLines)) {
        base.lines = rawLines.map((l, idx) => {
          if (l == null || typeof l !== 'object' || Array.isArray(l)) return l
          const rec = l as Record<string, unknown>
          const out = pickAllowedKeys(rec, new Set(['id', 'text', 'vocabWords']))
          const id = String(out.id ?? `line_${idx + 1}`).trim() || `line_${idx + 1}`
          out.id = id
          out.text = String(out.text ?? '').trim()
          out.vocabWords = sanitizeWordArr(out.vocabWords)
          return out
        })
      }

      // Normalize numeric for persistence
      const fr = base.freezeAtSeconds
      if (fr != null && Number.isFinite(Number(fr))) base.freezeAtSeconds = Number(fr)
      else if (fr != null) delete base.freezeAtSeconds

      return base
    }
    case 'imageScreen': {
      const base = pickAllowedKeys(content, new Set(['image', 'imagePrompt', 'title', 'body']))
      // Prefer `image`; accept legacy `imageUrl` once if `image` empty.
      const image =
        String(base.image ?? '').trim() ||
        String((content as Record<string, unknown>).imageUrl ?? '').trim()
      base.image = image
      const prompt = String(base.imagePrompt ?? '').trim()
      if (prompt) base.imagePrompt = prompt
      else delete base.imagePrompt
      base.title = String(base.title ?? '').trim()
      base.body = String(base.body ?? '').trim()
      return base
    }
    default:
      return { ...content }
  }
}

export function normalizeSpeakingPracticeContentForSave(content: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...content }
  const word = String(out.word ?? '').trim()
  let prompt = String(out.prompt ?? '').trim()
  if (!prompt && word) prompt = word
  const tip = String(out.tip ?? '').trim()
  const wi = String(out.word_id ?? '').trim().toLowerCase()
  const linkTok = String(out.speakingDraftTokenId ?? '').trim()
  out.word = word
  out.prompt = prompt
  if (tip) out.tip = tip
  else delete out.tip
  if (UUID_RE_FOR_WORD_ROW.test(wi)) out.word_id = wi
  else delete out.word_id
  if (linkTok) out.speakingDraftTokenId = linkTok
  else delete out.speakingDraftTokenId
  return out
}

/** Normalize + strip before persisting a single screen (modal save + full lesson save). */
export function finalizeScreenContentPayload(
  type: ScreenType,
  content: Record<string, unknown>,
): Record<string, unknown> {
  let c = { ...content }
  if (type === 'dialogue') c = normalizeDialogueContent(c)
  if (type === 'speakingPractice') c = normalizeSpeakingPracticeContentForSave(c)
  if (type === 'discriminationDrill') c = normalizeWordDiscriminationContentForEdit(c)
  if (type === 'videoReview') c = normalizeVideoReviewContentForEdit(c)
  return sanitizeScreenContentForPersistence(type, c)
}

export function finalizeLessonScreenForSave(screen: LessonScreen): LessonScreen {
  const raw = screen.type as string
  const canonical = (LEGACY_SCREEN_TYPE_ALIASES[raw] ?? raw) as ScreenType
  return {
    ...screen,
    type: canonical,
    content: finalizeScreenContentPayload(canonical, screen.content as Record<string, unknown>),
  }
}

export function sanitizeLessonScreensForSave(screens: LessonScreen[]): LessonScreen[] {
  return screens
    .map(finalizeLessonScreenForSave)
    .filter((s) => {
      if (s.type !== 'audioExposure') return true
      const w = (s.content as Record<string, unknown>).words
      return Array.isArray(w) && w.length > 0
    })
}

export function screenSummary(screen: LessonScreen): string {
  const c = screen.content
  switch (screen.type) {
    case 'intro':
      return String(c.goal ?? '').slice(0, 80) || '—'
    case 'concept': {
      const tw = String(c.targetWord ?? '').trim()
      const n = Array.isArray(c.bullets) ? c.bullets.length : 0
      if (tw) return `Target Word: ${tw} · Number of Points: ${n}`
      return n ? `${n} bullet(s) (set target word)` : '—'
    }
    case 'dialogue':
      return dialogueNameSummaryFromContent(c as Record<string, unknown>)
    case 'quiz':
      if (Array.isArray(c.questions)) return `${c.questions.length} question(s)`
      return String(c.question ?? '').slice(0, 60) || '—'
    case 'match':
      return Array.isArray(c.pairs) ? `${c.pairs.length} pair(s)` : '—'
    case 'speakingPractice': {
      const cr = c as Record<string, unknown>
      const primary = speakingPracticePrimaryLine(cr)
      const en = speakingPracticeEnglishLine(cr)
      if (!primary) return '—'
      if (en) {
        const a = primary.length > 52 ? `${primary.slice(0, 52)}…` : primary
        const b = en.length > 24 ? `${en.slice(0, 24)}…` : en
        return `${a} — ${b}`
      }
      return primary.slice(0, 80) || '—'
    }
    case 'audioExposure': {
      const lines = audioExposureWordSummaryLines(c as Record<string, unknown>)
      return lines.join(' · ')
    }
    case 'CelebrateScreen': {
      const learned = c.learned
      const communityOn =
        c.communityDiscussionEnabled === true ||
        c.communityDiscussionEnabled === 'true' ||
        c.communityDiscussionEnabled === 1 ||
        c.communityDiscussionEnabled === '1'
      const learnedPart =
        Array.isArray(learned) && learned.length ? `${learned.length} learned` : ''
      const communityPart = communityOn ? 'community on' : ''
      if (learnedPart || communityPart) {
        return [learnedPart, communityPart].filter(Boolean).join(' · ')
      }
      const s = String(c.summary ?? c.encouragement ?? (c as { message?: unknown }).message ?? '').trim()
      return s.slice(0, 80) || '—'
    }
    case 'patternPractice': {
      const ex = c.exercises
      if (Array.isArray(ex) && ex.length > 0) {
        const p = (ex[0] as Record<string, unknown>)?.prompt
        if (typeof p === 'string' && p.trim()) return p.slice(0, 80)
        const opts = (ex[0] as Record<string, unknown>)?.options
        if (Array.isArray(opts)) return `${opts.length} option(s)`
      }
      return '—'
    }
    case 'videoReview': {
      const u = String(c.videoUrl ?? '').trim()
      const tail = u ? (u.split('/').pop() ?? u).split('?')[0] : ''
      if (tail) return `Video: ${tail.length > 52 ? `${tail.slice(0, 52)}…` : tail}`
      return '—'
    }
    case 'imageScreen': {
      const t = String(c.title ?? '').trim()
      if (t) return t.length > 80 ? `${t.slice(0, 80)}…` : t
      const img = String(c.image ?? '').trim()
      if (img) {
        const tail = (img.split('/').pop() ?? img).split('?')[0]
        return tail ? `Image: ${tail.slice(0, 60)}` : 'Image'
      }
      return '—'
    }
    case 'discriminationDrill': {
      const q = String(c.question ?? c.title ?? c.prompt ?? '').trim()
      const raw = c.words
      let labels: string[] = []
      if (Array.isArray(raw) && raw.length >= 2) {
        for (const w of raw) {
          if (w == null || typeof w !== 'object' || Array.isArray(w)) continue
          const t = String((w as Record<string, unknown>).text ?? (w as Record<string, unknown>).oromo ?? '').trim()
          if (t) labels.push(t)
        }
      }
      if (labels.length < 2) {
        const a = String(c.wordA ?? '').trim()
        const b = String(c.wordB ?? '').trim()
        if (a && b) labels = [a, b]
      }
      const n = Array.isArray(c.scenes) ? c.scenes.length : 0
      const tail = labels.length >= 2 ? `${labels.join(' vs ')} · ${n} question(s)` : n ? `${n} question(s)` : '—'
      if (q) return `${q.slice(0, 48)}${q.length > 48 ? '…' : ''} · ${tail}`
      return tail
    }
    case 'word-breakdown': {
      const orig = String((c as Record<string, unknown>).original ?? '').trim()
      if (!orig) return '—'
      return orig.length > 100 ? `${orig.slice(0, 100)}…` : orig
    }
    default:
      return Object.keys(c).length ? `${Object.keys(c).length} field(s)` : 'Empty'
  }
}

/** Multi-line subtitle for the lesson screen list (and view summary). */
export function screenSubtitleLines(screen: LessonScreen, _ctx?: ScreenSubtitleContext): string[] {
  const c = screen.content
  switch (screen.type) {
    case 'concept': {
      const tw = String(c.targetWord ?? '').trim()
      const n = Array.isArray(c.bullets) ? c.bullets.length : 0
      if (tw) return [`Target Word: ${tw}`, `Number of Points: ${n}`]
      return [screenSummary(screen)]
    }
    case 'audioExposure':
      return audioExposureWordSummaryLines(c as Record<string, unknown>)
    case 'videoReview': {
      const lines: string[] = []
      const u = String(c.videoUrl ?? '').trim()
      if (u) {
        const tail = (u.split('/').pop() ?? u).split('?')[0]
        lines.push(`Video: ${tail}`)
      }
      return lines.length ? lines : [screenSummary(screen)]
    }
    case 'imageScreen': {
      const t = String(c.title ?? '').trim()
      if (t) return [t.length > 120 ? `${t.slice(0, 120)}…` : t]
      return [screenSummary(screen)]
    }
    case 'speakingPractice': {
      const cr = c as Record<string, unknown>
      const primary = speakingPracticePrimaryLine(cr)
      const en = speakingPracticeEnglishLine(cr)
      if (primary) {
        return [en ? `${primary} — ${en}` : primary]
      }
      return [screenSummary(screen)]
    }
    case 'dialogue':
      return [dialogueNameSummaryFromContent(c as Record<string, unknown>)]
    case 'word-breakdown': {
      const orig = String((c as Record<string, unknown>).original ?? '').trim()
      if (!orig) return ['—']
      return [orig.length > 200 ? `${orig.slice(0, 200)}…` : orig]
    }
    default:
      return [screenSummary(screen)]
  }
}

/**
 * Lesson order → audio exposure words (Afaan + English), deduped by Afaan.
 * Used for Celebrate “learned” and the modal preview.
 */
export function celebrateExposureWordRows(screens: LessonScreen[]): { afaan: string; english: string }[] {
  const out: { afaan: string; english: string }[] = []
  const seen = new Set<string>()
  for (const s of screens) {
    if (s.type !== 'audioExposure') continue
    const words = (s.content as Record<string, unknown>).words
    if (!Array.isArray(words)) continue
    for (const w of words) {
      if (w == null || typeof w !== 'object' || Array.isArray(w)) continue
      const rec = w as Record<string, unknown>
      const afaan = String(rec.word ?? '').trim()
      const english = String(rec.translation ?? '').trim()
      if (!afaan) continue
      if (seen.has(afaan)) continue
      seen.add(afaan)
      out.push({ afaan, english })
    }
  }
  return out
}

export function celebrateLearnedWordsFromScreens(screens: LessonScreen[]): string[] {
  return celebrateExposureWordRows(screens).map((r) => r.afaan)
}

/** Case-insensitive key for matching Celebrate / Audio exposure tokens. */
export function celebrateAfaanDedupeKey(s: string): string {
  return s.trim().toLowerCase()
}

function celebrateParseTrimmedStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const t = item.trim()
    if (!t) continue
    const k = celebrateAfaanDedupeKey(t)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

/** Non-empty, deduped extras for persisting `learned` / sync. */
export function celebrateSanitizedLearnedExtra(raw: unknown): string[] {
  return celebrateParseTrimmedStringList(raw)
}

/**
 * Rows for the Celebrate editor: keeps empty strings while typing. If `learned_extra` is missing,
 * uses legacy inference (learned minus current exposure keys).
 */
export function celebrateLearnedExtraEditorRows(
  content: Record<string, unknown>,
  exposureAfaanKeys: Set<string>,
): string[] {
  if (Array.isArray(content.learned_extra)) {
    return content.learned_extra.map((x) => (typeof x === 'string' ? x : String(x ?? '')))
  }
  return celebrateLearnedExtraFromContent(content, exposureAfaanKeys)
}

/**
 * Manual Celebrate entries: `learned_extra` when present, otherwise words in `learned` that are not
 * currently on any Audio exposure (legacy lessons).
 */
export function celebrateLearnedExtraFromContent(
  content: Record<string, unknown>,
  exposureAfaanKeys: Set<string>,
): string[] {
  if ('learned_extra' in content) {
    return celebrateParseTrimmedStringList(content.learned_extra)
  }
  const fromLearned = celebrateParseTrimmedStringList(content.learned)
  return fromLearned.filter((w) => !exposureAfaanKeys.has(celebrateAfaanDedupeKey(w)))
}

/** Exposure order first, then extras not already present (by dedupe key). */
export function mergeCelebrateLearnedFromExposureAndExtra(
  exposureAfaans: string[],
  extraAfaans: string[],
): string[] {
  const seen = new Set(exposureAfaans.map(celebrateAfaanDedupeKey))
  const out = [...exposureAfaans]
  for (const e of extraAfaans) {
    const t = e.trim()
    if (!t) continue
    const k = celebrateAfaanDedupeKey(t)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

/**
 * Updates every CelebrateScreen: `learned` = Audio exposure words (lesson order) plus `learned_extra`.
 * Removing or changing Audio exposure drops those tokens from `learned` unless the same Afaan is also
 * listed in `learned_extra`. Drops legacy `learned_words`.
 */
export function syncCelebrateScreensWithAudioExposure(screens: LessonScreen[]): LessonScreen[] {
  if (!screens.some((s) => s.type === 'CelebrateScreen')) return screens
  const exposureAfaans = celebrateLearnedWordsFromScreens(screens)
  const exposureKeys = new Set(exposureAfaans.map(celebrateAfaanDedupeKey))

  return screens.map((sc) => {
    if (sc.type !== 'CelebrateScreen') return sc
    const c = { ...(sc.content as Record<string, unknown>) }
    const extra = celebrateLearnedExtraFromContent(c, exposureKeys)
    c.learned_extra = extra
    c.learned = mergeCelebrateLearnedFromExposureAndExtra(exposureAfaans, extra)
    delete c.learned_words
    return { ...sc, content: c }
  })
}
