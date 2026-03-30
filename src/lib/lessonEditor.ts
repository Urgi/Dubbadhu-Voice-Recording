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
  | 'moduleComplete'
  | 'situation'
  | 'dialogue'
  | 'concept'
  | 'animatedConcept'
  | 'comparison'
  | 'patternPractice'
  | 'audioRecognition'
  | 'audioResponse'
  | 'speakingPractice'
  | 'audioExposure'
  | 'audioDiscrimination'
  | 'communityBoard'
  | 'word-breakdown'

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
  { value: 'moduleComplete', label: 'Module complete' },
  { value: 'firstLook', label: 'First look' },
  { value: 'situation', label: 'Situation' },
  { value: 'animatedConcept', label: 'Animated concept' },
  { value: 'comparison', label: 'Comparison' },
  { value: 'patternPractice', label: 'Pattern practice' },
  { value: 'audioRecognition', label: 'Audio recognition' },
  { value: 'audioResponse', label: 'Audio response' },
  { value: 'audioDiscrimination', label: 'Audio discrimination' },
  { value: 'communityBoard', label: 'Community board' },
  { value: 'word-breakdown', label: 'Word breakdown' },
]

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
    const t = (item as Record<string, unknown>).type
    const c = (item as Record<string, unknown>).content
    if (typeof t !== 'string' || !isScreenType(t)) continue
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
      return { type, content: { heading: '', bullets: [''] } }
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
    case 'animatedConcept':
      return { type, content: { targetWord: '', bullets: [''] } }
    case 'patternPractice':
      return {
        type,
        content: {
          exercises: [{ prompt: '', options: [], correctSuffix: '' }],
        },
      }
    default:
      return { type, content: {} }
  }
}

export function screenSummary(screen: LessonScreen): string {
  const c = screen.content
  switch (screen.type) {
    case 'intro':
      return String(c.goal ?? c.heading ?? '').slice(0, 80) || '—'
    case 'concept':
      return String(c.heading ?? c.title ?? '').slice(0, 80) || '—'
    case 'dialogue': {
      const people = (c.dialogueData as Record<string, unknown> | undefined)?.people
      const n = Array.isArray(people) ? people.length : 0
      return `${n} speaker(s)`
    }
    case 'quiz':
      if (Array.isArray(c.questions)) return `${c.questions.length} question(s)`
      return String(c.question ?? '').slice(0, 60) || '—'
    case 'match':
      return Array.isArray(c.pairs) ? `${c.pairs.length} pair(s)` : '—'
    case 'speakingPractice':
      return String(c.prompt ?? c.phrase ?? '').slice(0, 80) || '—'
    case 'audioExposure':
      return Array.isArray(c.words) ? `${c.words.length} word(s)` : '—'
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
    default:
      return Object.keys(c).length ? `${Object.keys(c).length} field(s)` : 'Empty'
  }
}
