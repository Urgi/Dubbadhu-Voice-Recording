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
]

export type ScreenTypeOption = { value: ScreenType; label: string }

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
  return [...byValue.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  )
}

/** Professor-facing label hides “video” wording for the review step. */
export function screenTypeLabelForCurriculumEditor(type: string, role: string | undefined): string {
  if (role === 'professor' && type === 'videoReview') return 'Review'
  return SCREEN_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type
}

/** Professor list/view: no filenames or “Video:” lines for the review step. */
export function screenSubtitleLinesForCurriculumEditor(screen: LessonScreen, role: string | undefined): string[] {
  if (role !== 'professor' || screen.type !== 'videoReview') return screenSubtitleLines(screen)
  const c = screen.content as Record<string, unknown>
  const lines: string[] = []
  const intro = String(c.introMessage ?? '').trim()
  if (intro) lines.push(intro.slice(0, 100) + (intro.length > 100 ? '…' : ''))
  const rl = String(c.reviewLabel ?? '').trim()
  const rt = String(c.reviewTitle ?? '').trim()
  if (rl) lines.push(`Label: ${rl}`)
  if (rt) lines.push(`Title: ${rt}`)
  if (lines.length === 0) lines.push('Admin completes this step after curriculum approval')
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
      return { type, content: { targetWord: '', heading: '', bullets: [''] } }
    case 'dialogue':
      return {
        type,
        content: {
          dialogueData: {
            people: [
              { name: 'Speaker A', lines: [''], translations: [''] },
              { name: 'Speaker B', lines: [''], translations: [''] },
            ],
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
        content: { prompt: '', expectedAnswer: '' },
      }
    case 'audioExposure':
      return {
        type,
        content: { title: '', words: [{ oromo: '', english: '' }], autoPlayNext: false, delayReveal: 0 },
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
          introMessage:
            "Let's see how much of this conversation you can pick up with no translations.",
          videoUrl: '',
          reviewLabel: 'SERIES REVIEW',
          reviewTitle: '',
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
    const afaan = String(rec.oromo ?? rec.text ?? rec.word ?? '').trim()
    const english = String(rec.english ?? rec.translation ?? '').trim()
    if (!afaan && !english) continue
    lines.push(english ? `${afaan} — ${english}` : afaan)
  }
  return lines.length ? lines : ['—']
}

/** Dialogue content always has exactly two `people` entries (pads or truncates). */
export function normalizeDialogueContent(content: Record<string, unknown>): Record<string, unknown> {
  const dd = (content.dialogueData as Record<string, unknown> | undefined) ?? {}
  const peopleRaw = Array.isArray(dd.people) ? (dd.people as unknown[]) : []
  const nextPeople: Record<string, unknown>[] = peopleRaw
    .filter((p: unknown): p is Record<string, unknown> => p != null && typeof p === 'object' && !Array.isArray(p))
    .map((p) => ({ ...p }))
  while (nextPeople.length < 2) {
    nextPeople.push({ name: '', lines: [''], translations: [''] })
  }
  if (nextPeople.length > 2) {
    nextPeople.length = 2
  }
  return {
    ...content,
    dialogueData: {
      ...dd,
      people: nextPeople,
    },
  }
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
      return { image: '', imageRequestDescription: '', correctWordIndex: 0, explanation: '' }
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
      correctWordIndex,
      explanation: String(sc.explanation ?? '').trim(),
    }
  })

  if (scenes.length === 0) {
    scenes.push({ image: '', imageRequestDescription: '', correctWordIndex: 0, explanation: '' })
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
export function normalizeVideoReviewContentForEdit(content: Record<string, unknown>): Record<string, unknown> {
  return {
    introMessage: String(content.introMessage ?? content.message ?? '').trim(),
    videoUrl: String(content.videoUrl ?? '').trim(),
    reviewLabel: String(content.reviewLabel ?? content.seriesReviewLabel ?? '').trim(),
    reviewTitle: String(content.reviewTitle ?? content.seriesReviewTitle ?? '').trim(),
  }
}

function pickAllowedKeys(obj: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(obj)) {
    if (allowed.has(k)) out[k] = obj[k]
  }
  return out
}

/** Per-word keys used by Dubbadhu AudioExposure + waveform embed pipeline. */
const AUDIO_EXPOSURE_WORD_KEYS = new Set([
  'oromo',
  'text',
  'english',
  'translation',
  'word',
  'audioRef',
  'fastAudioRef',
  'slowAudioRef',
  'note',
  'word_id',
  'waveformEnvelope',
  'fastWaveformEnvelope',
  'slowWaveformEnvelope',
  'waveformBars32',
  'fastWaveformBars32',
  'slowWaveformBars32',
])

const QUIZ_OPTION_KEYS = new Set(['text', 'english', 'audioRef'])

function sanitizeQuizOptionsArray(opts: unknown): unknown {
  if (!Array.isArray(opts)) return opts
  return opts.map((o) => {
    if (typeof o === 'string') return o
    if (o != null && typeof o === 'object' && !Array.isArray(o)) {
      return pickAllowedKeys(o as Record<string, unknown>, QUIZ_OPTION_KEYS)
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
    case 'intro':
      return pickAllowedKeys(content, new Set(['goal', 'heading', 'body', 'subheading', 'readyText']))
    case 'concept': {
      const base = pickAllowedKeys(
        content,
        new Set([
          'targetWord',
          'heading',
          'title',
          'concept',
          'examples',
          'pattern',
          'tip',
          'culturalNote',
          'subtitle',
          'keyPoints',
          'bullets',
          'note',
          'sections',
        ]),
      )
      const b = base.bullets
      if (Array.isArray(b)) {
        base.bullets = b.map((x) => (typeof x === 'string' ? x : String(x ?? '')))
      }
      return base
    }
    case 'dialogue': {
      const base = pickAllowedKeys(content, new Set(['dialogueData', 'showTranslations', 'heading', 'subtitle']))
      const dd = base.dialogueData
      if (dd != null && typeof dd === 'object' && !Array.isArray(dd)) {
        const ddo = dd as Record<string, unknown>
        const peopleRaw = Array.isArray(ddo.people) ? ddo.people : []
        const people = peopleRaw.map((p) =>
          p != null && typeof p === 'object' && !Array.isArray(p)
            ? pickAllowedKeys(p as Record<string, unknown>, new Set(['name', 'lines', 'translations']))
            : p,
        )
        base.dialogueData = { people }
      }
      return base
    }
    case 'match':
      return pickAllowedKeys(content, new Set(['title', 'pairs', 'heading']))
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
        return qo
      })
      return base
    }
    case 'speakingPractice':
      return pickAllowedKeys(
        content,
        new Set([
          'phrase',
          'phraseEnglish',
          'oromo',
          'targetAudioRef',
          'prompt',
          'expectedAnswer',
          'hint',
          'tip',
          'showAnswerAfterRecording',
          'speaking_word_id',
          'syllables',
        ]),
      )
    case 'audioExposure': {
      const base = pickAllowedKeys(content, new Set(['title', 'subtitle', 'words', 'autoPlayNext', 'delayReveal']))
      const words = base.words
      if (!Array.isArray(words)) return base
      base.words = words.map((w) =>
        w != null && typeof w === 'object' && !Array.isArray(w)
          ? pickAllowedKeys(w as Record<string, unknown>, AUDIO_EXPOSURE_WORD_KEYS)
          : w,
      )
      return base
    }
    case 'CelebrateScreen':
      return pickAllowedKeys(
        content,
        new Set(['message', 'learned', 'learned_extra', 'nextLesson', 'encouragement', 'summary']),
      )
    case 'patternPractice': {
      const base = pickAllowedKeys(content, new Set(['heading', 'instruction', 'pattern', 'exercises']))
      const ex = base.exercises
      if (!Array.isArray(ex)) return base
      base.exercises = ex.map((e) => {
        if (e == null || typeof e !== 'object' || Array.isArray(e)) return e
        return pickAllowedKeys(e as Record<string, unknown>, new Set([
          'prompt',
          'options',
          'correctSuffix',
          'nounPart',
          'nounPartLabel',
          'suffixLabel',
          'explanation',
        ]))
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
        base.scenes = sc.map((s) =>
          s != null && typeof s === 'object' && !Array.isArray(s)
            ? pickAllowedKeys(s as Record<string, unknown>, sk)
            : s,
        )
      }
      return base
    }
    case 'videoReview':
      return pickAllowedKeys(content, new Set(['introMessage', 'videoUrl', 'reviewLabel', 'reviewTitle']))
    default:
      return { ...content }
  }
}

/** Normalize + strip before persisting a single screen (modal save + full lesson save). */
export function finalizeScreenContentPayload(
  type: ScreenType,
  content: Record<string, unknown>,
): Record<string, unknown> {
  let c = { ...content }
  if (type === 'dialogue') c = normalizeDialogueContent(c)
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
  return screens.map(finalizeLessonScreenForSave)
}

export function screenSummary(screen: LessonScreen): string {
  const c = screen.content
  switch (screen.type) {
    case 'intro':
      return String(c.goal ?? c.heading ?? '').slice(0, 80) || '—'
    case 'concept': {
      const tw = String(c.targetWord ?? '').trim()
      if (tw) {
        const n = Array.isArray(c.bullets) ? c.bullets.length : 0
        return `Target Word: ${tw} · Number of Points: ${n}`
      }
      return String(c.heading ?? c.title ?? '').slice(0, 80) || '—'
    }
    case 'dialogue': {
      const people = (c.dialogueData as Record<string, unknown> | undefined)?.people
      if (Array.isArray(people) && people.length >= 2) {
        const p0 = people[0] as Record<string, unknown> | undefined
        const p1 = people[1] as Record<string, unknown> | undefined
        const n0 = String(p0?.name ?? '').trim() || 'Speaker 1'
        const n1 = String(p1?.name ?? '').trim() || 'Speaker 2'
        return `${n0} / ${n1}`
      }
      return '2 speakers'
    }
    case 'quiz':
      if (Array.isArray(c.questions)) return `${c.questions.length} question(s)`
      return String(c.question ?? '').slice(0, 60) || '—'
    case 'match':
      return Array.isArray(c.pairs) ? `${c.pairs.length} pair(s)` : '—'
    case 'speakingPractice':
      return String(c.prompt ?? c.phrase ?? '').slice(0, 80) || '—'
    case 'audioExposure': {
      const lines = audioExposureWordSummaryLines(c as Record<string, unknown>)
      return lines.join(' · ')
    }
    case 'CelebrateScreen':
      return String(c.message ?? '').slice(0, 80) || '—'
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
      const intro = String(c.introMessage ?? '').trim()
      return intro.slice(0, 72) || '—'
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
    default:
      return Object.keys(c).length ? `${Object.keys(c).length} field(s)` : 'Empty'
  }
}

/** Multi-line subtitle for the lesson screen list (and view summary). */
export function screenSubtitleLines(screen: LessonScreen): string[] {
  const c = screen.content
  switch (screen.type) {
    case 'concept': {
      const tw = String(c.targetWord ?? '').trim()
      if (tw) {
        const n = Array.isArray(c.bullets) ? c.bullets.length : 0
        return [`Target Word: ${tw}`, `Number of Points: ${n}`]
      }
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
      const rl = String(c.reviewLabel ?? '').trim()
      const rt = String(c.reviewTitle ?? '').trim()
      if (rl) lines.push(`Label: ${rl}`)
      if (rt) lines.push(`Title: ${rt}`)
      return lines.length ? lines : [screenSummary(screen)]
    }
    case 'dialogue': {
      const people = ((c.dialogueData as Record<string, unknown> | undefined)?.people ?? []) as unknown[]
      if (Array.isArray(people) && people.length >= 2) {
        const p0 = people[0] as Record<string, unknown> | undefined
        const p1 = people[1] as Record<string, unknown> | undefined
        const n0 = String(p0?.name ?? '').trim() || 'Speaker 1'
        const n1 = String(p1?.name ?? '').trim() || 'Speaker 2'
        return [`${n0} / ${n1}`]
      }
      return ['2 speakers']
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
      const afaan = String(rec.oromo ?? rec.text ?? rec.word ?? '').trim()
      const english = String(rec.english ?? rec.translation ?? '').trim()
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
