import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { LessonScreen } from '../../lib/lessonEditor'
import {
  SCREEN_TYPE_OPTIONS,
  celebrateAfaanDedupeKey,
  celebrateExposureWordRows,
  celebrateLearnedExtraEditorRows,
  celebrateLearnedExtraFromContent,
  celebrateLearnedWordsFromScreens,
  celebrateSanitizedLearnedExtra,
  mergeCelebrateLearnedFromExposureAndExtra,
  finalizeScreenContentPayload,
  listAudioExposureLinkOptionsFromScreens,
  normalizeAudioExposureContentForEdit,
  normalizeDialogueContent,
  newDraftTokenId,
  normalizeVideoReviewContentForEdit,
  normalizeWordDiscriminationContentForEdit,
} from '../../lib/lessonEditor'
import { generateAndUploadWordDiscriminationImage } from '../../lib/geminiWordDiscriminationImage'
import { getExpoPublicGeminiKey } from '../../lib/expoPublicEnv'
import supabase from '../../lib/supabase'
import type { HarvestedWord } from '../../lib/seedWordsFromLessons'
import {
  buildWordBankLookupLabels,
  fetchWordBankRowForLessonWord,
  harvestWordsFromLessonScreens,
  lookupWordBankRowWithSeriesLabels,
} from '../../lib/seedWordsFromLessons'
import { VOICE_BANK_LANGUAGE, voiceBankLanguageSqlValues } from '../../lib/voiceBankLabels'
import { LessonScreenLearnerPreview } from './LessonScreenLearnerPreview'
import { VideoReviewFreezeFrameEditor } from './VideoReviewFreezeFrameEditor'
import { TranslationMismatchModal } from './TranslationMismatchModal'
import { DialogueTwoPersonEditor } from './DialogueTwoPersonEditor'

const STRUCTURED_SCREEN_TYPES_FOR_HEADER_SAVE = new Set([
  'intro',
  'concept',
  'dialogue',
  'match',
  'quiz',
  'speakingPractice',
  'audioExposure',
  'CelebrateScreen',
  'patternPractice',
  'discriminationDrill',
  'videoReview',
])

/** Public storage bucket for Word discrimination quiz question images (Supabase dashboard). */
const WORD_DISCRIMINATION_IMAGES_BUCKET = 'word-comparison-images'

/** Public bucket for Dubbadhu lesson / series videos (same as learner app SeriesIntro URLs). */
const VIDEOS_DUBBADHU_BUCKET = 'Videos-Dubbadhu'

type Props = {
  visible: boolean
  screen: LessonScreen | null
  /** Same draft as the lesson editor; used to derive Celebrate `learned` from Audio exposure words. */
  lessonScreens?: LessonScreen[]
  /** Index of this screen in `lessonScreens` (for Afaan lookup: include unsaved edits on this screen in harvest). */
  lessonScreenIndex?: number | null
  /** Optional: series id for word-bank checks from parent (Audio exposure, etc.). */
  lessonSeries?: string | null
  /** Optional: `lesson.content.series` string (e.g. "Mastering Greetings") for `words.series` matching. */
  lessonContentSeries?: string | null
  wordBankLanguage?: string
  /** Professors: false — hide raw JSON and JSON-only escape hatches. */
  allowJsonEditing?: boolean
  /** Professors: false — no storage picker / URL fields for the review step (admin adds later). */
  allowVideoReviewMediaFields?: boolean
  /** Preview-only: same structured UI as admins, no edits or save (e.g. professor viewing admin_draft). */
  readOnly?: boolean
  onClose: () => void
  onApply: (next: LessonScreen) => void
}

const LessonEditorReadOnlyContext = createContext(false)

function useLessonEditorReadOnly() {
  return useContext(LessonEditorReadOnlyContext)
}

/** Normalize pattern practice / legacy option entries to display text (no audio refs persisted). */
function patternOptionString(x: unknown): string {
  if (typeof x === 'string') return x.trim()
  if (x != null && typeof x === 'object' && !Array.isArray(x)) {
    const t = (x as Record<string, unknown>).text
    if (typeof t === 'string') return t.trim()
  }
  return String(x ?? '').trim()
}

/** Row from `public.words` (`word` + `translation` + audio URLs). Lesson-only harvest rows reuse the same shape. */
type WordBankRow = {
  id: string
  word?: string | null
  translation?: string | null
  slow_audio_url?: string | null
  fast_audio_url?: string | null
}

/** Columns returned for word-bank search / pick lists (matches `public.words`). */
const WORD_BANK_LIST_COLUMNS = 'id,word,translation,slow_audio_url,fast_audio_url'

function rowAfaanText(r: WordBankRow): string {
  return String(r.word ?? '').trim()
}

function rowAfaanTextForBankPick(r: WordBankRow): string {
  return String(r.word ?? '').trim()
}

function rowTranslationText(r: WordBankRow): string {
  return String(r.translation ?? '').trim()
}

/** Shorter Afaan labels first (then alphabetical) so tight substring matches surface before long phrases. */
function sortWordBankRowsShortestAfaanFirst(rows: WordBankRow[]): WordBankRow[] {
  return [...rows].sort((a, b) => {
    const sa = rowAfaanText(a)
    const sb = rowAfaanText(b)
    const la = sa.length
    const lb = sb.length
    if (la !== lb) return la - lb
    const c = sa.localeCompare(sb, undefined, { sensitivity: 'base' })
    if (c !== 0) return c
    return a.id.localeCompare(b.id)
  })
}

/** Dubbadhu quiz `audioRef`: prefer fast recording URL, then slow, when present on `words`. */
function audioRefFromWordRow(row: WordBankRow): string | undefined {
  const fast = row.fast_audio_url?.trim()
  const slow = row.slow_audio_url?.trim()
  return fast || slow || undefined
}

/**
 * Word bank → learner exposure fields (`AudioExposureScreen.resolveExposureAudioUrls`).
 * Writes `fastAudioRef` / `slowAudioRef` only; clears legacy `audioRef`.
 */
function applyWordBankUrlsToExposureWord(item: Record<string, unknown>, row: WordBankRow) {
  const fast = row.fast_audio_url?.trim()
  const slow = row.slow_audio_url?.trim()
  delete item.fastAudioRef
  delete item.slowAudioRef
  delete item.audioRef
  if (fast) {
    item.fastAudioRef = fast
  }
  if (slow) {
    item.slowAudioRef = slow
  }
}

type QuizOptionDraft = {
  text: string
  english: string
  word_id?: string
  audioRef?: string
}

function serializeQuizOption(x: QuizOptionDraft): Record<string, unknown> {
  const o: Record<string, unknown> = { text: x.text, english: x.english }
  if (x.word_id) o.word_id = x.word_id
  if (x.audioRef?.trim()) o.audioRef = x.audioRef.trim()
  return o
}

function ensureQuizQuestionsArray(cur: Record<string, unknown>): Record<string, unknown>[] {
  let questions = (cur.questions as Record<string, unknown>[]) ?? []
  if (!Array.isArray(questions) || questions.length === 0) {
    if (typeof cur.question === 'string') {
      questions = [
        {
          question: cur.question,
          options: Array.isArray(cur.options) ? cur.options : ['', ''],
          correctAnswer: typeof cur.correctAnswer === 'number' ? cur.correctAnswer : 0,
        },
      ]
    } else {
      questions = [{ question: '', options: ['', ''], correctAnswer: 0 }]
    }
  }
  return questions
}

function quizOptionsDraftFromQ0(q0: Record<string, unknown>): QuizOptionDraft[] {
  const optionsRaw = Array.isArray(q0.options) ? (q0.options as unknown[]) : []
  return optionsRaw
    .map((o) => {
      if (typeof o === 'string') return { text: o, english: '' }
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        const ro = o as Record<string, unknown>
        const ar = ro.audioRef
        return {
          text: typeof ro.text === 'string' ? ro.text : String(ro.text ?? ''),
          english: typeof ro.english === 'string' ? ro.english : '',
          word_id: typeof ro.word_id === 'string' ? ro.word_id : undefined,
          audioRef: typeof ar === 'string' && ar.trim() ? ar.trim() : undefined,
        }
      }
      return { text: String(o ?? ''), english: '' }
    })
    .filter((x) => x.text.trim() !== '')
}

function quizContentWithAudioOptionsFlag(content: Record<string, unknown>): Record<string, unknown> {
  const qs = content.questions
  if (!Array.isArray(qs) || qs.length === 0) return { ...content, audioOptions: false }
  const q0 = qs[0] as Record<string, unknown> | undefined
  const opts = q0?.options
  if (!Array.isArray(opts)) return { ...content, audioOptions: false }
  const hasAudio = opts.some((item) => {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) return false
    const ar = (item as Record<string, unknown>).audioRef
    return typeof ar === 'string' && ar.trim().length > 0
  })
  return { ...content, audioOptions: hasAudio }
}

function glossFromWordRow(row: { translation?: string | null }): string {
  return String(row.translation ?? '').trim()
}

type TranslationConflictChoice = 'lesson' | 'database' | 'cancel'

type TranslationConflictPrompt = (args: {
  afaan: string
  lessonTranslation: string
  databaseTranslation: string
  conflictNumber: number
  totalConflicts: number
}) => Promise<TranslationConflictChoice>

type TranslationConflictPayload = {
  key: number
  afaan: string
  lessonTranslation: string
  databaseTranslation: string
  conflictNumber: number
  totalConflicts: number
}

/**
 * Compares Audio exposure tokens to this series’ `words` rows only. Does not write to the database;
 * conflicts are resolved in lesson JSON. Inserts and translation updates run on series approve.
 */
async function resolveAudioExposureWordsAgainstBank(
  words: Record<string, unknown>[],
  lessonSeriesId: string | null | undefined,
  lessonContentSeries: string | null | undefined,
  promptConflict: TranslationConflictPrompt,
): Promise<Record<string, unknown>[]> {
  const labels = await buildWordBankLookupLabels(lessonSeriesId, lessonContentSeries)
  if (labels.length === 0) {
    return words.map((w) => ({ ...w }))
  }

  const out = words.map((w) => ({ ...w }))

  type Collected = {
    wordIndex: number
    afaan: string
    lessonTranslation: string
    databaseTranslation: string
  }
  const conflicts: Collected[] = []
  for (let i = 0; i < out.length; i++) {
    const item = out[i] as Record<string, unknown>
    const o = String(item.word ?? '').trim()
    const e = String(item.translation ?? item.english ?? '').trim()
    if (!o || !e) throw new Error('Audio exposure words require both Afaan Oromo text and translation.')

    const row = await lookupWordBankRowWithSeriesLabels(labels, o)
    if (!row) continue

    const dbGloss = glossFromWordRow(row)
    if (dbGloss === e) continue

    conflicts.push({
      wordIndex: i,
      afaan: o,
      lessonTranslation: e,
      databaseTranslation: dbGloss,
    })
  }

  for (let c = 0; c < conflicts.length; c++) {
    const { wordIndex, afaan, lessonTranslation, databaseTranslation } = conflicts[c]
    const choice = await promptConflict({
      afaan,
      lessonTranslation,
      databaseTranslation,
      conflictNumber: c + 1,
      totalConflicts: conflicts.length,
    })
    if (choice === 'cancel') throw new Error('Save cancelled.')

    if (choice === 'database') {
      const item = out[wordIndex] as Record<string, unknown>
      out[wordIndex] = { ...item, translation: databaseTranslation, english: undefined }
    }
  }
  return out
}

function wordLabel(row: WordBankRow): string {
  const a = rowAfaanTextForBankPick(row)
  const b = rowTranslationText(row)
  if (a && b) return `${a} — ${b}`
  return a || b || row.id
}

function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

/** Gloss from `public.words` for tokens that only store `word_id` (admin editor + bank compare). */
async function fetchWordTranslationsByIds(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [
    ...new Set(ids.map((id) => id.trim().toLowerCase()).filter((id) => isUuidLike(id))),
  ]
  if (unique.length === 0) return map
  const { data, error } = await supabase.from('words').select('id,translation').in('id', unique)
  if (error || !Array.isArray(data)) return map
  for (const row of data as { id: string; translation?: string | null }[]) {
    const gloss = String(row.translation ?? '').trim()
    if (gloss) map.set(String(row.id).trim().toLowerCase(), gloss)
  }
  return map
}

function screenTypeTitle(type: string): string {
  return SCREEN_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type
}

async function fetchWordBankRows(query: string): Promise<{ data: WordBankRow[] | null; error: Error | null }> {
  const trimmed = query.trim()
  const isUuid = isUuidLike(trimmed)
  let q = supabase.from('words').select(WORD_BANK_LIST_COLUMNS).limit(25)
  if (isUuid) q = q.eq('id', trimmed)
  else q = q.or(`word.ilike.%${trimmed}%,translation.ilike.%${trimmed}%`)
  const res = await q
  if (res.error) return { data: null, error: new Error(res.error.message) }
  const filtered = ((res.data as WordBankRow[] | null) ?? []).filter((r) => typeof r?.id === 'string')
  return { data: sortWordBankRowsShortestAfaanFirst(filtered), error: null }
}

const LESSON_PICK_ID_PREFIX = 'lesson-token:'

function mergeDbAndLessonHarvestForPicker(db: WordBankRow[], harvested: HarvestedWord[], query: string): WordBankRow[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return db
  const keys = new Set(db.map((r) => celebrateAfaanDedupeKey(rowAfaanText(r))))
  const extra: WordBankRow[] = []
  for (const h of harvested) {
    const w = h.word.trim()
    if (!w || !w.toLowerCase().includes(q)) continue
    const k = celebrateAfaanDedupeKey(w)
    if (keys.has(k)) continue
    keys.add(k)
    extra.push({
      id: `${LESSON_PICK_ID_PREFIX}${k}`,
      word: w,
      translation: h.translation,
    })
  }
  return sortWordBankRowsShortestAfaanFirst([...db, ...extra])
}

/** Audio exposure tokens in the draft lesson (for Afaan lookup: same shape as broad harvest merge). */
function harvestAudioExposureWordsForPicker(screens: LessonScreen[]): HarvestedWord[] {
  return celebrateExposureWordRows(screens).map((r) => ({
    word: r.afaan.trim(),
    translation: r.english.trim() ? r.english.trim() : null,
  }))
}

function isRealWordBankRowId(row: WordBankRow): boolean {
  return !row.id.startsWith(LESSON_PICK_ID_PREFIX)
}

/** Word bank rows restricted to `words.series` labels (+ language when column exists). */
async function fetchWordBankRowsForSeries(
  query: string,
  seriesLabels: string[],
): Promise<{ data: WordBankRow[] | null; error: Error | null }> {
  if (!seriesLabels.length) return { data: [], error: null }
  const trimmed = query.trim()
  const isUuid = isUuidLike(trimmed)
  const langVals = voiceBankLanguageSqlValues()

  const run = async (useLanguage: boolean): Promise<{ data: WordBankRow[] | null; error: Error | null }> => {
    let q = supabase.from('words').select(WORD_BANK_LIST_COLUMNS).in('series', seriesLabels).limit(25)
    if (useLanguage) q = q.in('language', langVals)
    if (isUuid) q = q.eq('id', trimmed)
    else q = q.or(`word.ilike.%${trimmed}%,translation.ilike.%${trimmed}%`)
    const res = await q
    if (res.error) return { data: null, error: new Error(res.error.message) }
    const filtered = ((res.data as WordBankRow[] | null) ?? []).filter((r) => typeof r?.id === 'string')
    return { data: sortWordBankRowsShortestAfaanFirst(filtered), error: null }
  }

  let lastMsg = ''
  for (const useLang of [true, false]) {
    const { data, error } = await run(useLang)
    if (!error && data) return { data, error: null }
    if (error) {
      lastMsg = error.message
      if (
        useLang &&
        /column .* does not exist|Could not find|does not exist|PGRST100/i.test(error.message)
      ) {
        continue
      }
      return { data: null, error }
    }
  }
  return { data: null, error: new Error(lastMsg || 'words search failed') }
}

function LessonAndSeriesWordPicker({
  label,
  seriesLabels,
  lessonHarvested,
  onPick,
  hint,
}: {
  /** Omit to show only search + results (e.g. word discrimination already has “Word N” above). */
  label?: string
  seriesLabels: string[]
  lessonHarvested: HarvestedWord[]
  onPick: (row: WordBankRow) => void
  hint?: string
}) {
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<WordBankRow[]>([])
  const [err, setErr] = useState('')
  const lastReq = useRef(0)

  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) {
      setRows([])
      setErr('')
      return
    }
    const reqId = ++lastReq.current
    setLoading(true)
    setErr('')
    const t = setTimeout(() => {
      void (async () => {
        const { data, error } = await fetchWordBankRowsForSeries(query, seriesLabels)
        if (reqId !== lastReq.current) return
        setLoading(false)
        if (error || data == null) {
          setErr(error?.message ?? 'Search failed')
          setRows([])
          return
        }
        setErr('')
        setRows(mergeDbAndLessonHarvestForPicker(data, lessonHarvested, query))
      })()
    }, 250)
    return () => clearTimeout(t)
  }, [q, seriesLabels, lessonHarvested])

  return (
    <View style={styles.wordPicker}>
      {label?.trim() ? <Text style={styles.label}>{label}</Text> : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <TextInput
        style={styles.input}
        value={q}
        onChangeText={setQ}
        placeholder="Search (2+ letters) — series word bank + words from this lesson"
        placeholderTextColor="#52525b"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {loading ? <Text style={styles.hint}>Searching…</Text> : null}
      {err ? <Text style={styles.jsonErr}>{err}</Text> : null}
      {rows.length ? (
        <View style={styles.wordResults}>
          {rows.map((r) => (
            <Pressable
              key={r.id}
              style={styles.wordResultRow}
              onPress={() => {
                onPick(r)
                setQ('')
                setRows([])
              }}
            >
              <View style={styles.wordResultTextCol}>
                <Text style={styles.wordResultTextTop}>{rowAfaanTextForBankPick(r) || r.id}</Text>
                {rowTranslationText(r) ? (
                  <Text style={styles.wordResultTextSub}>{rowTranslationText(r)}</Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}

async function isWordAllowedForDiscrimination(
  word: string,
  lessonSeries: string | null | undefined,
  lessonContentSeries: string | null | undefined,
  harvested: HarvestedWord[],
): Promise<boolean> {
  const w = word.trim()
  if (!w) return false
  const k = w.toLowerCase()
  if (harvested.some((h) => h.word.trim().toLowerCase() === k)) return true
  const row = await fetchWordBankRowForLessonWord(lessonSeries, lessonContentSeries, w)
  return row != null
}

/** Canonical English/gloss for saved JSON: word bank row wins, else lesson harvest. */
async function resolveDiscriminationDefinition(
  word: string,
  lessonSeries: string | null | undefined,
  lessonContentSeries: string | null | undefined,
  harvested: HarvestedWord[],
): Promise<string> {
  const w = word.trim()
  if (!w) return ''
  const row = await fetchWordBankRowForLessonWord(lessonSeries, lessonContentSeries, w)
  const bank = (row?.translation ?? '').trim()
  if (bank) return bank
  const k = w.toLowerCase()
  const h = harvested.find((x) => x.word.trim().toLowerCase() === k)
  return (h?.translation ?? '').trim()
}

function SceneCorrectWordPicker({
  wordLabels,
  valueIndex,
  onSelect,
}: {
  wordLabels: string[]
  valueIndex: number
  onSelect: (i: number) => void
}) {
  const [open, setOpen] = useState(false)
  const max = wordLabels.length - 1
  const safe = max < 0 ? 0 : Math.max(0, Math.min(max, Math.floor(valueIndex)))
  const currentLabel = wordLabels[safe] ?? '—'

  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.label}>Word</Text>
      {wordLabels.length < 2 ? (
        <Text style={styles.hint}>Add at least two words above first.</Text>
      ) : (
        <>
          <Text style={styles.hint}>Pick the correct word for this question, then add the image below.</Text>
          <Pressable style={styles.quizCorrectBtn} onPress={() => setOpen(true)}>
            <Text style={styles.quizCorrectBtnLabel}>Tap to choose</Text>
            <Text style={styles.quizCorrectBtnValue}>{currentLabel}</Text>
          </Pressable>
          <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
            <Pressable style={styles.quizCorrectOverlay} onPress={() => setOpen(false)}>
              <Pressable style={styles.quizCorrectSheet} onPress={() => {}}>
                <Text style={styles.personTitle}>Which word is correct?</Text>
                {wordLabels.map((lab, idx) => (
                  <Pressable
                    key={`cw-${idx}`}
                    style={styles.quizCorrectChoice}
                    onPress={() => {
                      onSelect(idx)
                      setOpen(false)
                    }}
                  >
                    <Text style={styles.quizCorrectChoiceText}>
                      {idx === safe ? '✓ ' : ''}
                      {lab}
                    </Text>
                  </Pressable>
                ))}
              </Pressable>
            </Pressable>
          </Modal>
        </>
      )}
    </View>
  )
}

/** True for real files from storage.list (has object id, or name looks like an image file). */
function isStorageObjectFile(f: { name: string; id?: string | null }): boolean {
  const name = f.name
  if (!name || name.endsWith('/')) return false
  if (f.id != null && String(f.id).length > 0) return true
  return /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i.test(name)
}

function isVideoStorageObjectFile(f: { name: string; id?: string | null }): boolean {
  const name = f.name
  if (!name || name.endsWith('/')) return false
  if (f.id != null && String(f.id).length > 0) return true
  return /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(name)
}

function VideoReviewDubbadhuVideoField({
  videoUrl,
  setContent,
  readOnly = false,
}: {
  videoUrl: string
  setContent: (patch: Record<string, unknown> | ((cur: Record<string, unknown>) => Record<string, unknown>)) => void
  readOnly?: boolean
}) {
  const [browseOpen, setBrowseOpen] = useState(false)
  const [bucketFiles, setBucketFiles] = useState<string[]>([])
  const [filterQ, setFilterQ] = useState('')
  const [listErr, setListErr] = useState('')
  const [listLoading, setListLoading] = useState(false)
  const [rawListCount, setRawListCount] = useState(0)

  const loadBucket = useCallback(async () => {
    setListLoading(true)
    setListErr('')
    setRawListCount(0)
    const bucket = VIDEOS_DUBBADHU_BUCKET
    const { data, error } = await supabase.storage.from(bucket).list('', { limit: 1000 })
    if (error) {
      setListLoading(false)
      setListErr(error.message)
      setBucketFiles([])
      return
    }
    const dataRows = data ?? []
    setRawListCount(dataRows.length)

    const fileRows = dataRows.map((f) => ({
      name: String(f.name ?? '').trim(),
      id: (f as { id?: string | null }).id,
    }))

    let names = fileRows.filter(isVideoStorageObjectFile).map((f) => f.name)

    if (names.length === 0 && dataRows.length > 0) {
      const folderPrefixes = fileRows
        .filter((f) => f.name && (f.id == null || f.id === '') && !f.name.includes('.'))
        .map((f) => f.name)
      for (const prefix of folderPrefixes.slice(0, 12)) {
        const nested = await supabase.storage.from(bucket).list(prefix, { limit: 500 })
        if (nested.error) continue
        const nestedRows = (nested.data ?? []).map((f) => ({
          name: String(f.name ?? '').trim(),
          id: (f as { id?: string | null }).id,
        }))
        for (const row of nestedRows.filter(isVideoStorageObjectFile)) {
          names.push(`${prefix}/${row.name}`)
        }
      }
      names = [...new Set(names)].sort((a, b) => a.localeCompare(b))
    } else {
      names = names.sort((a, b) => a.localeCompare(b))
    }

    setBucketFiles(names)
    setListLoading(false)
  }, [])

  useEffect(() => {
    if (browseOpen) {
      setFilterQ('')
      void loadBucket()
    }
  }, [browseOpen, loadBucket])

  const filteredFiles = useMemo(() => {
    const q = filterQ.trim().toLowerCase()
    if (!q) return bucketFiles
    return bucketFiles.filter((n) => n.toLowerCase().includes(q))
  }, [bucketFiles, filterQ])

  const v = String(videoUrl ?? '').trim()
  let statusLine = 'No video selected'
  if (v) {
    try {
      const tail = v.split('/').pop() ?? v
      statusLine = `Selected: ${decodeURIComponent(tail.split('?')[0] ?? tail)}`
    } catch {
      statusLine = 'Video URL set'
    }
  }

  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.label}>Video (Videos-Dubbadhu bucket)</Text>
      <Text style={[styles.hint, !v && styles.imagePickStatusEmpty]}>{statusLine}</Text>
      {readOnly ? null : (
        <>
          <Pressable style={styles.quizCorrectBtn} onPress={() => setBrowseOpen(true)}>
            <Text style={styles.quizCorrectBtnLabel}>Browse bucket</Text>
          </Pressable>
          {v ? (
            <Pressable style={styles.removeBtn} onPress={() => setContent((cur) => ({ ...cur, videoUrl: '' }))}>
              <Text style={styles.removeBtnText}>Clear video</Text>
            </Pressable>
          ) : null}
        </>
      )}

      <Modal visible={browseOpen} transparent animationType="fade" onRequestClose={() => setBrowseOpen(false)}>
        <Pressable style={styles.quizCorrectOverlay} onPress={() => setBrowseOpen(false)}>
          <Pressable style={[styles.quizCorrectSheet, { maxHeight: 520 }]} onPress={() => {}}>
            <Text style={styles.personTitle}>Videos in {VIDEOS_DUBBADHU_BUCKET}</Text>
            <TextInput
              style={styles.input}
              value={filterQ}
              onChangeText={setFilterQ}
              placeholder="Filter by file name…"
              placeholderTextColor="#52525b"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {listLoading ? <Text style={styles.hint}>Loading…</Text> : null}
            {listErr ? <Text style={styles.jsonErr}>{listErr}</Text> : null}
            {!listLoading && !listErr && bucketFiles.length === 0 && rawListCount === 0 ? (
              <Text style={styles.hint}>
                Storage returned no files (RLS often hides objects from list). In Supabase → SQL, add a SELECT policy on
                storage.objects for this bucket (see sql/storage_videos_dubbadhu_anon_list.sql).
              </Text>
            ) : null}
            {!listLoading && !listErr && bucketFiles.length > 0 && filteredFiles.length === 0 ? (
              <Text style={styles.hint}>No file name matches your filter.</Text>
            ) : null}
            <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
              {filteredFiles.map((name) => (
                <Pressable
                  key={name}
                  style={styles.quizCorrectChoice}
                  onPress={() => {
                    const { data } = supabase.storage.from(VIDEOS_DUBBADHU_BUCKET).getPublicUrl(name)
                    const url = data.publicUrl
                    if (url) {
                      setContent((cur) => ({ ...cur, videoUrl: url }))
                    }
                    setBrowseOpen(false)
                  }}
                >
                  <Text style={styles.quizCorrectChoiceText}>{name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

function WordDiscriminationSceneImageField({
  sceneIndex,
  image,
  imageRequestDescription,
  setContent,
}: {
  sceneIndex: number
  image: string
  imageRequestDescription: string
  setContent: (patch: Record<string, unknown> | ((cur: Record<string, unknown>) => Record<string, unknown>)) => void
}) {
  const [browseOpen, setBrowseOpen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const [requestDraft, setRequestDraft] = useState('')
  const [bucketFiles, setBucketFiles] = useState<string[]>([])
  const [filterQ, setFilterQ] = useState('')
  const [listErr, setListErr] = useState('')
  const [listLoading, setListLoading] = useState(false)
  const [rawListCount, setRawListCount] = useState(0)
  const [geminiBusy, setGeminiBusy] = useState(false)

  const applyScenePatch = useCallback(
    (patch: Record<string, unknown>) => {
      setContent((cur) => {
        const arr = [...((cur.scenes as Record<string, unknown>[]) ?? [])]
        const next = arr.map((x, j) => (j === sceneIndex ? { ...x, ...patch } : x))
        return { ...cur, scenes: next }
      })
    },
    [sceneIndex, setContent],
  )

  const loadBucket = useCallback(async () => {
    setListLoading(true)
    setListErr('')
    setRawListCount(0)
    const bucket = WORD_DISCRIMINATION_IMAGES_BUCKET
    const { data, error } = await supabase.storage.from(bucket).list('', { limit: 1000 })
    if (error) {
      setListLoading(false)
      setListErr(error.message)
      setBucketFiles([])
      return
    }
    const dataRows = data ?? []
    setRawListCount(dataRows.length)

    const fileRows = dataRows.map((f) => ({
      name: String(f.name ?? '').trim(),
      id: (f as { id?: string | null }).id,
    }))

    let names = fileRows.filter(isStorageObjectFile).map((f) => f.name)

    if (names.length === 0 && dataRows.length > 0) {
      const folderPrefixes = fileRows
        .filter((f) => f.name && (f.id == null || f.id === '') && !f.name.includes('.'))
        .map((f) => f.name)
      for (const prefix of folderPrefixes.slice(0, 12)) {
        const nested = await supabase.storage.from(bucket).list(prefix, { limit: 500 })
        if (nested.error) continue
        const nestedRows = (nested.data ?? []).map((f) => ({
          name: String(f.name ?? '').trim(),
          id: (f as { id?: string | null }).id,
        }))
        for (const row of nestedRows.filter(isStorageObjectFile)) {
          names.push(`${prefix}/${row.name}`)
        }
      }
      names = [...new Set(names)].sort((a, b) => a.localeCompare(b))
    } else {
      names = names.sort((a, b) => a.localeCompare(b))
    }

    setBucketFiles(names)
    setListLoading(false)
  }, [])

  useEffect(() => {
    if (browseOpen) {
      setFilterQ('')
      void loadBucket()
    }
  }, [browseOpen, loadBucket])

  useEffect(() => {
    if (requestOpen) {
      setRequestDraft(String(imageRequestDescription ?? '').trim())
    }
  }, [requestOpen, imageRequestDescription])

  const filteredFiles = useMemo(() => {
    const q = filterQ.trim().toLowerCase()
    if (!q) return bucketFiles
    return bucketFiles.filter((n) => n.toLowerCase().includes(q))
  }, [bucketFiles, filterQ])

  const img = String(image ?? '').trim()
  const req = String(imageRequestDescription ?? '').trim()
  let statusLine = 'No image selected'
  if (img) {
    try {
      const tail = img.split('/').pop() ?? img
      statusLine = `Selected: ${decodeURIComponent(tail)}`
    } catch {
      statusLine = 'Image URL set'
    }
  } else if (req) {
    statusLine = `New image requested: ${req.length > 90 ? `${req.slice(0, 90)}…` : req}`
  }

  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.label}>Image</Text>
      <Text style={[styles.hint, !img && !req && styles.imagePickStatusEmpty]}>{statusLine}</Text>
      <Pressable style={styles.quizCorrectBtn} onPress={() => setBrowseOpen(true)}>
        <Text style={styles.quizCorrectBtnLabel}>Search available images</Text>
      </Pressable>
      <Pressable style={[styles.quizCorrectBtn, { marginTop: 8 }]} onPress={() => setRequestOpen(true)}>
        <Text style={styles.quizCorrectBtnLabel}>Request new image</Text>
        <Text style={[styles.quizCorrectBtnValue, { fontSize: 12, fontWeight: '600' }]}>
          Describe what your team should add
        </Text>
      </Pressable>
      {img || req ? (
        <Pressable
          style={styles.removeBtn}
          onPress={() =>
            applyScenePatch({ image: '', imageRequestDescription: '' })
          }
        >
          <Text style={styles.removeBtnText}>Clear image</Text>
        </Pressable>
      ) : null}

      <Modal visible={browseOpen} transparent animationType="fade" onRequestClose={() => setBrowseOpen(false)}>
        <Pressable style={styles.quizCorrectOverlay} onPress={() => setBrowseOpen(false)}>
          <Pressable style={[styles.quizCorrectSheet, { maxHeight: 520 }]} onPress={() => {}}>
            <Text style={styles.personTitle}>Available images</Text>
            <TextInput
              style={styles.input}
              value={filterQ}
              onChangeText={setFilterQ}
              placeholder="Filter by file name…"
              placeholderTextColor="#52525b"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {listLoading ? <Text style={styles.hint}>Loading…</Text> : null}
            {listErr ? <Text style={styles.jsonErr}>{listErr}</Text> : null}
            {!listLoading && !listErr && bucketFiles.length === 0 && rawListCount === 0 ? (
              <Text style={styles.hint}>
                Storage returned no files (RLS often hides objects from list). In Supabase → SQL, add a SELECT policy
                on storage.objects for this app’s image bucket (see sql/storage_word_comparison_images_anon_list.sql).
                Confirm EXPO_PUBLIC_SUPABASE_URL matches this project.
              </Text>
            ) : null}
            {!listLoading && !listErr && bucketFiles.length > 0 && filteredFiles.length === 0 ? (
              <Text style={styles.hint}>No file name matches your filter.</Text>
            ) : null}
            <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
              {filteredFiles.map((name) => (
                <Pressable
                  key={name}
                  style={styles.quizCorrectChoice}
                  onPress={() => {
                    const { data } = supabase.storage.from(WORD_DISCRIMINATION_IMAGES_BUCKET).getPublicUrl(name)
                    const url = data.publicUrl
                    if (url) {
                      applyScenePatch({ image: url, imageRequestDescription: '' })
                    }
                    setBrowseOpen(false)
                  }}
                >
                  <Text style={styles.quizCorrectChoiceText}>{name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={requestOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!geminiBusy) setRequestOpen(false)
        }}
      >
        <Pressable style={styles.quizCorrectOverlay} onPress={() => !geminiBusy && setRequestOpen(false)}>
          <Pressable style={styles.quizCorrectSheet} onPress={() => {}}>
            <Text style={styles.personTitle}>Request new image</Text>
            <Text style={styles.hint}>
              Describe the image for your team to add in Storage. Learners see this text until an image is set. You can
              also generate a draft image with Gemini (same API key as document word extraction) and upload it to this
              bucket.
            </Text>
            <TextInput
              style={[styles.input, { minHeight: 88, textAlignVertical: 'top' }]}
              value={requestDraft}
              onChangeText={setRequestDraft}
              placeholder="e.g. Older woman smiling, outdoor setting…"
              placeholderTextColor="#52525b"
              multiline
              editable={!geminiBusy}
            />
            {geminiBusy ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <ActivityIndicator color="#d4af37" />
                <Text style={styles.hint}>Generating and uploading…</Text>
              </View>
            ) : null}
            {!getExpoPublicGeminiKey().trim() ? (
              <Text style={[styles.hint, { marginTop: 8 }]}>
                Gemini generation needs EXPO_PUBLIC_GEMINI_API_KEY in your env (restart Metro after adding).
              </Text>
            ) : null}
            <Pressable
              style={[
                styles.addBtn,
                { marginTop: 10, opacity: geminiBusy || !requestDraft.trim() ? 0.45 : 1 },
              ]}
              disabled={geminiBusy || !requestDraft.trim() || !getExpoPublicGeminiKey().trim()}
              onPress={() => {
                const t = requestDraft.trim()
                if (!t || geminiBusy) return
                void (async () => {
                  setGeminiBusy(true)
                  const out = await generateAndUploadWordDiscriminationImage(t)
                  setGeminiBusy(false)
                  if ('error' in out) {
                    Alert.alert('Could not generate image', out.error)
                    return
                  }
                  applyScenePatch({ image: out.publicUrl, imageRequestDescription: '' })
                  setRequestOpen(false)
                })()
              }}
            >
              <Text style={styles.addBtnText}>Generate with Gemini & use image</Text>
            </Pressable>
            <Pressable
              style={[styles.addBtn, { marginTop: 8, opacity: geminiBusy ? 0.45 : 1 }]}
              disabled={geminiBusy}
              onPress={() => {
                const t = requestDraft.trim()
                if (!t) return
                applyScenePatch({ image: '', imageRequestDescription: t })
                setRequestOpen(false)
              }}
            >
              <Text style={styles.addBtnText}>Save request (text only)</Text>
            </Pressable>
            <Pressable
              style={[styles.removeBtn, { marginTop: 4 }]}
              disabled={geminiBusy}
              onPress={() => setRequestOpen(false)}
            >
              <Text style={styles.removeBtnText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

function WordDiscriminationQuizEditor({
  content,
  setContent,
  lessonScreens,
  lessonSeries,
  lessonContentSeries,
  saveStructured,
  draftRef,
  setJsonError,
  registerPrimarySave,
  readOnly = false,
}: {
  content: Record<string, unknown>
  setContent: (patch: Record<string, unknown> | ((cur: Record<string, unknown>) => Record<string, unknown>)) => void
  lessonScreens: LessonScreen[]
  lessonSeries: string | null
  lessonContentSeries: string | null
  saveStructured: (c: Record<string, unknown>) => void
  draftRef: MutableRefObject<LessonScreen | null>
  setJsonError: (s: string) => void
  registerPrimarySave?: (fn: () => void) => void
  readOnly?: boolean
}) {
  const [seriesLabels, setSeriesLabels] = useState<string[]>([])
  const harvested = useMemo(() => harvestWordsFromLessonScreens(lessonScreens as unknown[]), [lessonScreens])

  useEffect(() => {
    let cancel = false
    void (async () => {
      const labels = await buildWordBankLookupLabels(lessonSeries, lessonContentSeries)
      if (!cancel) setSeriesLabels(labels)
    })()
    return () => {
      cancel = true
    }
  }, [lessonSeries, lessonContentSeries])

  const runDiscriminationPrimarySave = useCallback(() => {
    void (async () => {
      setJsonError('')
      const d = draftRef.current
      if (!d) return
      const payload = { ...(d.content as Record<string, unknown>) }
      const sharedQ = String(payload.question ?? payload.title ?? payload.prompt ?? '').trim()
      if (!sharedQ) {
        setJsonError('Enter the Title Question (shown above images for every question).')
        return
      }
      const wordsRaw = (payload.words as Record<string, unknown>[] | undefined) ?? []
      if (!Array.isArray(wordsRaw) || wordsRaw.length < 2) {
        setJsonError('Add at least two words.')
        return
      }
      const texts: string[] = []
      for (let wi = 0; wi < wordsRaw.length; wi++) {
        const wr = wordsRaw[wi]
        if (!wr || typeof wr !== 'object' || Array.isArray(wr)) {
          setJsonError(`Word ${wi + 1} is invalid.`)
          return
        }
        const tw = String((wr as Record<string, unknown>).text ?? '').trim()
        if (!tw) {
          setJsonError(`Word ${wi + 1}: pick or enter a word.`)
          return
        }
        texts.push(tw)
      }
      const seen = new Set<string>()
      for (const tw of texts) {
        const k = celebrateAfaanDedupeKey(tw)
        if (seen.has(k)) {
          setJsonError('All words on this screen must be different.')
          return
        }
        seen.add(k)
      }
      const hw = harvestWordsFromLessonScreens(lessonScreens as unknown[])
      for (let wi = 0; wi < texts.length; wi++) {
        const ok = await isWordAllowedForDiscrimination(
          texts[wi],
          lessonSeries,
          lessonContentSeries,
          hw,
        )
        if (!ok) {
          setJsonError(
            'Each word must appear in this lesson (any screen) or exist in the series word bank. Adjust titles/series or pick again.',
          )
          return
        }
      }
      const resolvedWords: Record<string, unknown>[] = []
      for (let wi = 0; wi < wordsRaw.length; wi++) {
        const wr = wordsRaw[wi] as Record<string, unknown>
        const tw = texts[wi]
        const def = await resolveDiscriminationDefinition(tw, lessonSeries, lessonContentSeries, hw)
        const entry: Record<string, unknown> = { text: tw, definition: def }
        const wid = wr.word_id
        if (typeof wid === 'string' && isUuidLike(wid) && !wid.startsWith(LESSON_PICK_ID_PREFIX)) {
          entry.word_id = wid
        }
        resolvedWords.push(entry)
      }
      const nWords = resolvedWords.length
      const scRaw = (payload.scenes as Record<string, unknown>[] | undefined) ?? []
      if (!Array.isArray(scRaw) || scRaw.length === 0) {
        setJsonError('Add at least one question.')
        return
      }
      const outScenes: Record<string, unknown>[] = []
      for (let si = 0; si < scRaw.length; si++) {
        const s = scRaw[si]
        if (!s || typeof s !== 'object' || Array.isArray(s)) {
          setJsonError(`Question ${si + 1} is invalid.`)
          return
        }
        const sr = s as Record<string, unknown>
        const img = String(sr.image ?? '').trim()
        const reqDesc = String(sr.imageRequestDescription ?? '').trim()
        const expl = String(sr.explanation ?? '').trim()
        if (!img && !reqDesc) {
          setJsonError(`Question ${si + 1}: choose an available image or enter a new-image request.`)
          return
        }
        if (!expl) {
          setJsonError(`Question ${si + 1}: explanation required.`)
          return
        }
        let cwi =
          typeof sr.correctWordIndex === 'number' && Number.isFinite(sr.correctWordIndex)
            ? Math.floor(sr.correctWordIndex)
            : String(sr.correct ?? 'A').toUpperCase().startsWith('B')
              ? 1
              : 0
        if (cwi < 0 || cwi >= nWords) cwi = 0
        const sceneOut: Record<string, unknown> = {
          image: img,
          explanation: expl,
          correctWordIndex: cwi,
        }
        if (reqDesc && !img) {
          sceneOut.imageRequestDescription = reqDesc
        }
        outScenes.push(sceneOut)
      }
      payload.question = sharedQ
      delete payload.title
      delete payload.prompt
      delete payload.wordA
      delete payload.wordB
      delete payload.word_a
      delete payload.word_b
      delete payload.definitionA
      delete payload.definitionB
      delete payload.wordA_id
      delete payload.wordB_id
      payload.words = resolvedWords
      payload.scenes = outScenes
      payload.streakTarget = nWords
      saveStructured(payload)
    })()
  }, [draftRef, lessonScreens, lessonSeries, lessonContentSeries, saveStructured, setJsonError])

  useLayoutEffect(() => {
    if (!registerPrimarySave) return
    if (readOnly) {
      registerPrimarySave(() => {})
      return () => registerPrimarySave(() => {})
    }
    registerPrimarySave(runDiscriminationPrimarySave)
    return () => registerPrimarySave(() => {})
  }, [registerPrimarySave, runDiscriminationPrimarySave, readOnly])

  let words = (content.words as Record<string, unknown>[] | undefined) ?? []
  if (!Array.isArray(words) || words.length < 2) {
    words = [
      { text: '', definition: '' },
      { text: '', definition: '' },
    ]
  }

  let scenes = (content.scenes as Record<string, unknown>[] | undefined) ?? []
  if (!Array.isArray(scenes) || scenes.length === 0) {
    scenes = [{ image: '', imageRequestDescription: '', correctWordIndex: 0, explanation: '' }]
  }

  const wordPickerLabels = words.map((w, idx) => {
    const t = String(w?.text ?? '').trim()
    return t || `Word ${idx + 1} (empty)`
  })

  const applyWordPick = (wordIndex: number, row: WordBankRow) => {
    const afaan = rowAfaanText(row)
    const gloss = rowTranslationText(row)
    const persistId = isUuidLike(row.id) && !row.id.startsWith(LESSON_PICK_ID_PREFIX)
    setContent((cur) => {
      const arr = [...((cur.words as Record<string, unknown>[]) ?? [])]
      while (arr.length <= wordIndex) arr.push({ text: '', definition: '' })
      const prev = { ...(arr[wordIndex] ?? {}) }
      prev.text = afaan
      prev.definition = gloss
      if (persistId) prev.word_id = row.id
      else delete prev.word_id
      arr[wordIndex] = prev
      return { ...cur, words: arr }
    })
  }

  const clearWordSlot = (wordIndex: number) => {
    setContent((cur) => {
      const arr = [...((cur.words as Record<string, unknown>[]) ?? [])]
      if (!arr[wordIndex]) return cur
      const next = { ...arr[wordIndex] }
      next.text = ''
      next.definition = ''
      delete next.word_id
      arr[wordIndex] = next
      return { ...cur, words: arr }
    })
  }

  return (
    <View style={styles.form}>
      <Field
        label="Title Question"
        value={String(content.question ?? content.title ?? content.prompt ?? '')}
        multiline
        onChangeText={(t) => setContent((cur) => ({ ...cur, question: t }))}
      />
      <Text style={styles.label}>Words on this screen</Text>
      <Text style={styles.hint}>Pick at least two words to compare.</Text>

      {words.map((w, i) => {
        const wt = String(w?.text ?? '').trim()
        return (
          <View key={`wdq-word-${i}`} style={{ marginBottom: 14 }}>
            <Text style={styles.personTitle}>Word {i + 1}</Text>
            {wt ? (
              <View style={styles.matchSelectedBox}>
                <Text style={styles.matchSelectedTop}>{wt}</Text>
                <Text style={styles.matchSelectedSub}>{String(w?.definition ?? '').trim() || '—'}</Text>
                <Pressable style={styles.changeWordBtn} onPress={() => clearWordSlot(i)}>
                  <Text style={styles.changeWordBtnText}>Change word</Text>
                </Pressable>
              </View>
            ) : (
              <LessonAndSeriesWordPicker
                seriesLabels={seriesLabels}
                lessonHarvested={harvested}
                onPick={(row) => applyWordPick(i, row)}
                hint={
                  !seriesLabels.length && i === 0
                    ? 'No series labels yet — lesson-only tokens below; link series for bank search.'
                    : undefined
                }
              />
            )}
            {words.length > 2 ? (
              <Pressable
                style={styles.removeBtn}
                onPress={() => {
                  setContent((cur) => {
                    const arr = [...((cur.words as Record<string, unknown>[]) ?? [])]
                    if (arr.length <= 2) return cur
                    const nextWords = arr.filter((_, j) => j !== i)
                    const scList = [...((cur.scenes as Record<string, unknown>[]) ?? [])]
                    const nextScenes = scList.map((s) => {
                      let idx =
                        typeof s.correctWordIndex === 'number' && Number.isFinite(s.correctWordIndex)
                          ? Math.floor(s.correctWordIndex)
                          : 0
                      if (idx === i) idx = 0
                      else if (idx > i) idx -= 1
                      const maxI = Math.max(0, nextWords.length - 1)
                      if (idx > maxI) idx = maxI
                      if (idx < 0) idx = 0
                      return { ...s, correctWordIndex: idx }
                    })
                    return { ...cur, words: nextWords, scenes: nextScenes }
                  })
                }}
              >
                <Text style={styles.removeBtnText}>Remove word</Text>
              </Pressable>
            ) : null}
          </View>
        )
      })}

      <Pressable
        style={styles.addBtn}
        onPress={() =>
          setContent((cur) => {
            const arr = [...((cur.words as Record<string, unknown>[]) ?? [])]
            return { ...cur, words: [...arr, { text: '', definition: '' }] }
          })
        }
      >
        <Text style={styles.addBtnText}>+ Add word</Text>
      </Pressable>

      <Text style={styles.label}>Questions</Text>
      <Text style={styles.hint}>
        Each question: pick the word first, then choose an available image or request a new one with a description.
      </Text>
      {scenes.map((sc, i) => {
        const cwi =
          typeof sc.correctWordIndex === 'number' && Number.isFinite(sc.correctWordIndex)
            ? Math.floor(sc.correctWordIndex)
            : 0
        return (
          <View key={i} style={styles.pairCard}>
            <Text style={styles.personTitle}>Question {i + 1}</Text>
            <SceneCorrectWordPicker
              wordLabels={wordPickerLabels}
              valueIndex={cwi}
              onSelect={(idx) => {
                setContent((cur) => {
                  const arr = [...((cur.scenes as Record<string, unknown>[]) ?? [])]
                  const wArr = (cur.words as unknown[] | undefined) ?? []
                  const maxI = Math.max(0, wArr.length - 1)
                  const v = Math.max(0, Math.min(maxI, idx))
                  const next = arr.map((x, j) => (j === i ? { ...x, correctWordIndex: v } : x))
                  return { ...cur, scenes: next }
                })
              }}
            />
            <WordDiscriminationSceneImageField
              sceneIndex={i}
              image={String(sc.image ?? '')}
              imageRequestDescription={String(sc.imageRequestDescription ?? '')}
              setContent={setContent}
            />
            <Field
              label="Explanation (after answering)"
              value={String(sc.explanation ?? '')}
              multiline
              onChangeText={(t) => {
                setContent((cur) => {
                  const arr = [...((cur.scenes as Record<string, unknown>[]) ?? [])]
                  const next = arr.map((x, j) => (j === i ? { ...x, explanation: t } : x))
                  return { ...cur, scenes: next }
                })
              }}
            />
            <Pressable
              style={styles.removeBtn}
              onPress={() => {
                setContent((cur) => {
                  const arr = [...((cur.scenes as Record<string, unknown>[]) ?? [])]
                  return { ...cur, scenes: arr.filter((_, j) => j !== i) }
                })
              }}
            >
              <Text style={styles.removeBtnText}>Remove question</Text>
            </Pressable>
          </View>
        )
      })}
      <Pressable
        style={styles.addBtn}
        onPress={() =>
          setContent((cur) => {
            const arr = [...((cur.scenes as Record<string, unknown>[]) ?? [])]
            return {
              ...cur,
              scenes: [...arr, { image: '', imageRequestDescription: '', correctWordIndex: 0, explanation: '' }],
            }
          })
        }
      >
        <Text style={styles.addBtnText}>+ Add question</Text>
      </Pressable>
    </View>
  )
}

function WordBankPicker({
  label,
  value,
  onPick,
  placeholder = 'Search word bank…',
}: {
  label: string
  value: WordBankRow | null
  onPick: (row: WordBankRow) => void
  placeholder?: string
}) {
  const ro = useLessonEditorReadOnly()
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<WordBankRow[]>([])
  const [err, setErr] = useState('')
  const lastReq = useRef(0)

  useEffect(() => {
    if (ro) {
      setRows([])
      setErr('')
      setLoading(false)
      return
    }
    const query = q.trim()
    if (query.length < 2) {
      setRows([])
      setErr('')
      return
    }
    const reqId = ++lastReq.current
    setLoading(true)
    setErr('')
    const t = setTimeout(() => {
      void (async () => {
        const isUuid = isUuidLike(query)
        const base = supabase.from('words').select(WORD_BANK_LIST_COLUMNS).limit(25)
        const res = isUuid
          ? await base.eq('id', query)
          : await base.or(`word.ilike.%${query}%,translation.ilike.%${query}%`)
        if (reqId !== lastReq.current) return
        setLoading(false)
        if (res.error) {
          setErr(res.error.message)
          setRows([])
          return
        }
        setRows(((res.data as WordBankRow[] | null) ?? []).filter((r) => typeof r?.id === 'string'))
      })()
    }, 250)
    return () => clearTimeout(t)
  }, [q, ro])

  return (
    <View style={styles.wordPicker}>
      <Text style={styles.label}>{label}</Text>
      {value ? <Text style={styles.wordPicked}>{wordLabel(value)}</Text> : <Text style={styles.wordNone}>None</Text>}
      {ro ? null : (
      <TextInput
        style={styles.input}
        value={q}
        onChangeText={setQ}
        placeholder={placeholder}
        placeholderTextColor="#52525b"
        autoCapitalize="none"
        autoCorrect={false}
      />
      )}
      {!ro && loading ? <Text style={styles.hint}>Searching…</Text> : null}
      {!ro && err ? <Text style={styles.jsonErr}>{err}</Text> : null}
      {!ro && rows.length ? (
        <View style={styles.wordResults}>
          {rows.map((r) => (
            <Pressable
              key={r.id}
              style={styles.wordResultRow}
              onPress={() => {
                onPick(r)
                setQ('')
                setRows([])
              }}
            >
              <View style={styles.wordResultTextCol}>
                <Text style={styles.wordResultTextTop}>{rowAfaanTextForBankPick(r) || r.id}</Text>
                {rowTranslationText(r) ? (
                  <Text style={styles.wordResultTextSub}>{rowTranslationText(r)}</Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}

/** Afaan Oromo field with debounced word-bank matches (same query as WordBankPicker). */
function AudioExposureOromoField({
  value,
  onChangeText,
  onPickFromBank,
  compact = false,
  hideLabel = false,
  onEditorFocus,
  instanceKey,
  externalFocusKey,
  readOnly = false,
  lessonHarvested = [],
}: {
  value: string
  onChangeText: (t: string) => void
  onPickFromBank: (row: WordBankRow) => void
  /** Tighter layout (e.g. video review line vocab). */
  compact?: boolean
  /** Hide “Afaan Oromo” when a parent label (e.g. “Vocab Words”) is shown above. */
  hideLabel?: boolean
  /** Runs when the text field gains focus (e.g. activate this line in video review). */
  onEditorFocus?: () => void
  /** Stable id for this field (e.g. `${lineId}-w${index}`) when using `externalFocusKey`. */
  instanceKey?: string
  /** When set to another field’s `instanceKey` or `${lineId}:line`, this field’s suggestion list closes. */
  externalFocusKey?: string
  /** After picking from the word bank (`word_id` set), text is not editable — remove the row/word to change. */
  readOnly?: boolean
  /** Other Audio exposure words in this lesson (not yet in DB) — merged into matches like word-bank rows. */
  lessonHarvested?: HarvestedWord[]
}) {
  const ctxReadOnly = useLessonEditorReadOnly()
  const bankReadOnly = readOnly || ctxReadOnly
  const [rows, setRows] = useState<WordBankRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [suggestOpen, setSuggestOpen] = useState(false)
  const lastReq = useRef(0)
  const blurHideSuggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearSuggestBlurTimer = useCallback(() => {
    if (blurHideSuggestTimerRef.current) {
      clearTimeout(blurHideSuggestTimerRef.current)
      blurHideSuggestTimerRef.current = null
    }
  }, [])

  useEffect(() => () => clearSuggestBlurTimer(), [clearSuggestBlurTimer])

  useEffect(() => {
    if (!instanceKey || externalFocusKey === undefined) return
    if (externalFocusKey === instanceKey) return
    // Hide dropdown only; keep `rows` so refocusing this field still shows matches without retyping.
    setSuggestOpen(false)
  }, [externalFocusKey, instanceKey])

  useEffect(() => {
    if (bankReadOnly) {
      setRows([])
      setErr('')
      setSuggestOpen(false)
      return
    }
    const query = value.trim()
    if (query.length < 2) {
      setRows([])
      setErr('')
      return
    }
    const reqId = ++lastReq.current
    setLoading(true)
    setErr('')
    const t = setTimeout(() => {
      void (async () => {
        const { data, error } = await fetchWordBankRows(query)
        if (reqId !== lastReq.current) return
        setLoading(false)
        if (error || data == null) {
          setErr(error?.message ?? 'Search failed')
          setRows([])
          return
        }
        setErr('')
        setRows(mergeDbAndLessonHarvestForPicker(data, lessonHarvested, query))
      })()
    }, 250)
    return () => clearTimeout(t)
  }, [value, bankReadOnly, lessonHarvested])

  return (
    <View style={compact ? styles.fieldVideoReviewOromo : styles.field}>
      {hideLabel ? null : (
        <Text style={[styles.label, compact && styles.labelVideoReviewCompact]}>Afaan Oromo</Text>
      )}
      <TextInput
        style={[
          styles.input,
          compact && styles.inputVideoReviewCompact,
          bankReadOnly && styles.inputReadOnlyBank,
        ]}
        value={value}
        editable={!bankReadOnly}
        onChangeText={onChangeText}
        onFocus={() => {
          onEditorFocus?.()
          if (!bankReadOnly) setSuggestOpen(true)
        }}
        onBlur={() => {
          clearSuggestBlurTimer()
          blurHideSuggestTimerRef.current = setTimeout(() => {
            blurHideSuggestTimerRef.current = null
            setSuggestOpen(false)
          }, 320)
        }}
        placeholder={
          bankReadOnly
            ? ''
            : compact
              ? hideLabel
                ? 'Search word bank (2+ letters) or type a word'
                : 'Type or search word bank (2+ letters)'
              : 'Type or search the word bank (2+ letters show matches)'
        }
        placeholderTextColor="#52525b"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {suggestOpen && loading ? <Text style={styles.hint}>Searching word bank…</Text> : null}
      {suggestOpen && err ? <Text style={styles.jsonErr}>{err}</Text> : null}
      {suggestOpen && !loading && rows.length ? (
        <View style={styles.wordResults}>
          {rows.map((r) => (
            <Pressable
              key={r.id}
              style={styles.wordResultRow}
              onPress={() => {
                clearSuggestBlurTimer()
                onPickFromBank(r)
                setSuggestOpen(false)
                setRows([])
              }}
            >
              <View style={styles.wordResultTextCol}>
                <Text style={styles.wordResultTextTop}>{rowAfaanTextForBankPick(r) || r.id}</Text>
                {rowTranslationText(r) ? (
                  <Text style={styles.wordResultTextSub}>{rowTranslationText(r)}</Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}

function cloneScreen(s: LessonScreen): LessonScreen {
  return JSON.parse(JSON.stringify(s)) as LessonScreen
}

function modalContentDirty(
  draft: LessonScreen,
  jsonFallback: string,
  baseline: LessonScreen,
  baselineJsonText: string,
): boolean {
  if (JSON.stringify(draft) !== JSON.stringify(baseline)) return true
  try {
    const cur = JSON.stringify(JSON.parse(jsonFallback))
    const base = JSON.stringify(JSON.parse(baselineJsonText))
    return cur !== base
  } catch {
    return jsonFallback.trim() !== baselineJsonText.trim()
  }
}

function modalContentDirtyForRole(
  allowJsonEditing: boolean,
  draft: LessonScreen,
  jsonFallback: string,
  baseline: LessonScreen,
  baselineJsonText: string,
  readOnly?: boolean,
): boolean {
  if (readOnly) return false
  if (!allowJsonEditing) {
    return JSON.stringify(draft) !== JSON.stringify(baseline)
  }
  return modalContentDirty(draft, jsonFallback, baseline, baselineJsonText)
}

export function LessonScreenEditModal({
  visible,
  screen,
  lessonScreens = [],
  lessonScreenIndex = null,
  lessonSeries = null,
  lessonContentSeries = null,
  wordBankLanguage = VOICE_BANK_LANGUAGE,
  allowJsonEditing = true,
  allowVideoReviewMediaFields = true,
  readOnly = false,
  onClose: onCloseFromParent,
  onApply,
}: Props) {
  const isReadOnly = Boolean(readOnly)
  const [draft, setDraft] = useState<LessonScreen | null>(null)
  const [jsonFallback, setJsonFallback] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [quizCorrectOpen, setQuizCorrectOpen] = useState(false)
  const [patternCorrectOpen, setPatternCorrectOpen] = useState(false)
  /** Video review: one expanded line at a time; lines with vocab are minimized unless this is their `id` (`null` = none). */
  const [videoReviewActiveLineId, setVideoReviewActiveLineId] = useState<string | null>(null)
  /** Which vocab/line editor has focus — closes other rows’ word-bank dropdowns so they don’t block taps. */
  const [videoReviewVocabFocusKey, setVideoReviewVocabFocusKey] = useState('')
  const draftRef = useRef<LessonScreen | null>(null)
  draftRef.current = draft
  const visibleRef = useRef(visible)
  visibleRef.current = visible
  const baselineScreenRef = useRef<LessonScreen | null>(null)
  const baselineJsonTextRef = useRef('')
  /** Wired by each structured editor (or inline in switch); header Save invokes this. */
  const primaryScreenSaveRef = useRef<(() => void) | null>(null)
  const registerPrimaryScreenSave = useCallback((fn: () => void) => {
    primaryScreenSaveRef.current = fn
  }, [])

  /**
   * After choosing a word-bank row, RN can emit a stale `onChangeText` on the Afaan field (blur/keyboard timing).
   * That handler used to spread the word then delete `translation`, reverting the pick.
   */
  const audioExposureOromoTypingIgnoreUntilRef = useRef<Map<number, number>>(new Map())

  const exposureWordsForAfaanPicker = useMemo(() => {
    const idx = lessonScreenIndex
    let screens = lessonScreens
    if (typeof idx === 'number' && idx >= 0 && idx < lessonScreens.length) {
      const overlay = draft ?? screen
      if (overlay) {
        screens = lessonScreens.map((s, i) => (i === idx ? overlay : s))
      }
    }
    return harvestAudioExposureWordsForPicker(screens)
  }, [lessonScreens, lessonScreenIndex, draft, screen])

  const audioExposureSpeakingLinkOptions = useMemo(() => {
    const idx = lessonScreenIndex
    let screens = lessonScreens
    if (typeof idx === 'number' && idx >= 0 && idx < lessonScreens.length) {
      const overlay = draft ?? screen
      if (overlay) {
        screens = lessonScreens.map((s, i) => (i === idx ? overlay : s))
      }
    }
    return listAudioExposureLinkOptionsFromScreens(screens)
  }, [lessonScreens, lessonScreenIndex, draft, screen])

  useEffect(() => {
    if (visible && screen) {
      audioExposureOromoTypingIgnoreUntilRef.current.clear()
      let c = cloneScreen(screen)
      if (
        c.type === 'dialogue'
      ) {
        c = {
          ...c,
          content: normalizeDialogueContent(c.content as Record<string, unknown>),
        }
      }
      {
        const st = c.type as string
        if (st === 'discriminationDrill' || st === 'wordDiscriminationQuiz') {
          c = {
            ...c,
            type: 'discriminationDrill',
            content: normalizeWordDiscriminationContentForEdit(c.content as Record<string, unknown>),
          }
        }
        if (st === 'animatedConcept') {
          c = { ...c, type: 'concept' }
        }
      }
      if (c.type === 'videoReview') {
        c = {
          ...c,
          content: normalizeVideoReviewContentForEdit(c.content as Record<string, unknown>),
        }
      }
      if (c.type === 'audioExposure') {
        c = {
          ...c,
          content: normalizeAudioExposureContentForEdit(c.content as Record<string, unknown>),
        }
      }
      baselineScreenRef.current = c
      try {
        const js = JSON.stringify(c.content, null, 2)
        baselineJsonTextRef.current = js
        setJsonFallback(js)
      } catch {
        baselineJsonTextRef.current = '{}'
        setJsonFallback('{}')
      }
      setDraft(c)
      setJsonError('')
      setVideoReviewActiveLineId(null)
      setVideoReviewVocabFocusKey('')
    } else if (!visible) {
      audioExposureOromoTypingIgnoreUntilRef.current.clear()
    }
  }, [visible, screen])

  /** Lean `word_id` tokens often omit `translation` in JSON; fill from `words` so the Translation row is visible. */
  useEffect(() => {
    if (!visible || !screen || screen.type !== 'audioExposure') return
    const normalized = normalizeAudioExposureContentForEdit(screen.content as Record<string, unknown>)
    const wordsRaw = normalized.words
    if (!Array.isArray(wordsRaw)) return
    const needIds: string[] = []
    for (const w of wordsRaw) {
      if (w == null || typeof w !== 'object' || Array.isArray(w)) continue
      const rec = w as Record<string, unknown>
      const wid = String(rec.word_id ?? '').trim().toLowerCase()
      if (!isUuidLike(wid)) continue
      const gloss = String(rec.translation ?? rec.english ?? '').trim()
      if (!gloss) needIds.push(wid)
    }
    if (needIds.length === 0) return
    let cancelled = false
    const t = setTimeout(() => {
      void (async () => {
        const byId = await fetchWordTranslationsByIds(needIds)
        if (cancelled || byId.size === 0) return
        setDraft((d) => {
          if (!d || d.type !== 'audioExposure') return d
          const co = d.content as Record<string, unknown>
          const ws = (co.words as Record<string, unknown>[]) ?? []
          if (!Array.isArray(ws)) return d
          let changed = false
          const next = ws.map((item) => {
            if (item == null || typeof item !== 'object' || Array.isArray(item)) return item
            const rec = item as Record<string, unknown>
            const wid = String(rec.word_id ?? '').trim().toLowerCase()
            if (!isUuidLike(wid)) return item
            const have = String(rec.translation ?? rec.english ?? '').trim()
            if (have) return item
            const g = byId.get(wid)
            if (!g) return item
            changed = true
            const merged: Record<string, unknown> = { ...rec, translation: g }
            delete merged.english
            return merged
          })
          if (!changed) return d
          return { ...d, content: { ...co, words: next } }
        })
      })()
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [visible, screen])

  useEffect(() => {
    if (draft?.type !== 'videoReview' || videoReviewActiveLineId == null) return
    const c = draft.content as Record<string, unknown>
    const lines = Array.isArray(c.lines) ? (c.lines as Record<string, unknown>[]) : []
    const exists = lines.some((l, i) => String(l?.id ?? `line_${i + 1}`).trim() === videoReviewActiveLineId)
    if (!exists) setVideoReviewActiveLineId(null)
  }, [draft, videoReviewActiveLineId])

  const requestClose = useCallback(() => {
    if (isReadOnly) {
      onCloseFromParent()
      return
    }
    if (!visible || !screen) {
      onCloseFromParent()
      return
    }
    if (!draft) {
      onCloseFromParent()
      return
    }
    const b = baselineScreenRef.current
    if (!b) {
      onCloseFromParent()
      return
    }
    if (
      !modalContentDirtyForRole(
        allowJsonEditing,
        draft,
        jsonFallback,
        b,
        baselineJsonTextRef.current,
        isReadOnly,
      )
    ) {
      onCloseFromParent()
      return
    }
    Alert.alert(
      'Discard edits?',
      'You have changes to this screen that were not applied to the lesson.',
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => onCloseFromParent() },
      ],
    )
  }, [visible, screen, draft, jsonFallback, allowJsonEditing, onCloseFromParent, isReadOnly])

  const [translationConflict, setTranslationConflict] = useState<TranslationConflictPayload | null>(null)
  const translationConflictResolveRef = useRef<((c: TranslationConflictChoice) => void) | null>(null)
  const translationConflictKeyRef = useRef(0)
  /** Prevents overlapping Audio exposure saves from clobbering the conflict resolver ref. */
  const audioExposureBankSaveBusyRef = useRef(false)

  /** Defer opening to the next frame so sequential conflicts reliably repaint (embedded overlay + RN batching). */
  const promptTranslationConflict = useCallback<TranslationConflictPrompt>(
    (args) =>
      new Promise((resolve) => {
        translationConflictResolveRef.current = resolve
        translationConflictKeyRef.current += 1
        const payload: TranslationConflictPayload = { key: translationConflictKeyRef.current, ...args }
        requestAnimationFrame(() => {
          if (!visibleRef.current) {
            const stuck = translationConflictResolveRef.current
            translationConflictResolveRef.current = null
            stuck?.('cancel')
            return
          }
          setTranslationConflict(payload)
        })
      }),
    [],
  )

  /** Do not clear overlay before fn(choice): removing the layer first lets the same touch fall through to "Save screen" / header and close the editor mid-resolve. */
  const finishTranslationConflict = useCallback((choice: TranslationConflictChoice) => {
    const fn = translationConflictResolveRef.current
    translationConflictResolveRef.current = null
    fn?.(choice)
    if (choice === 'cancel') setTranslationConflict(null)
  }, [])

  useEffect(() => {
    if (visible) return
    const fn = translationConflictResolveRef.current
    translationConflictResolveRef.current = null
    setTranslationConflict(null)
    if (fn) fn('cancel')
  }, [visible])

  /** Must stay above any early return — Rules of Hooks. */
  const patchDraftContent = useCallback(
    (patch: Record<string, unknown> | ((cur: Record<string, unknown>) => Record<string, unknown>)) => {
      if (isReadOnly) return
      setDraft((d) => {
        if (!d) return null
        const curContent = d.content as Record<string, unknown>
        const next = typeof patch === 'function' ? patch(curContent) : patch
        return { ...d, content: next }
      })
    },
    [isReadOnly],
  )

  if (!visible || !screen || !draft) return null

  const applyJsonFallback = () => {
    try {
      const parsed = JSON.parse(jsonFallback) as Record<string, unknown>
      if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setJsonError('Content must be a JSON object.')
        return
      }
      setJsonError('')
      const d = draftRef.current
      if (!d) return
      const content = finalizeScreenContentPayload(d.type, parsed)
      onApply({ type: d.type, content })
      onCloseFromParent()
    } catch {
      setJsonError('Invalid JSON.')
    }
  }

  const saveStructured = (content: Record<string, unknown>) => {
    const d = draftRef.current
    if (!d) return
    const payload = finalizeScreenContentPayload(d.type, content)
    onApply({ type: d.type, content: payload })
    onCloseFromParent()
  }

  const structuredForm = (readOnlyMode: boolean) => {
    const c = draft.content
    const setContent = patchDraftContent
    primaryScreenSaveRef.current = null

    switch (draft.type) {
      case 'intro': {
        primaryScreenSaveRef.current = () => {
          const d = draftRef.current
          if (!d) return
          const goal = String((d.content as Record<string, unknown>).goal ?? '')
          saveStructured({ goal })
        }
        return (
          <View style={styles.form}>
            <Field label="Goal" value={String(c.goal ?? '')} onChangeText={(t) => setContent((cur) => ({ ...cur, goal: t }))} />
          </View>
        )
      }
      case 'concept': {
        const hasLegacySections = Array.isArray(c.sections)
        const rawBullets = Array.isArray(c.bullets) ? (c.bullets as string[]) : ['']
        const bullets = rawBullets.slice(0, 3)
        const setBullets = (next: string[]) => {
          setContent((cur) => ({ ...cur, bullets: next.slice(0, 3) }))
        }

        const moveBullet = (idx: number, dir: -1 | 1) => {
          const j = idx + dir
          if (j < 0 || j >= bullets.length) return
          const next = [...bullets]
          ;[next[idx], next[j]] = [next[j], next[idx]]
          setBullets(next)
        }

        const removeBullet = (idx: number) => {
          if (bullets.length <= 1) return
          setBullets(bullets.filter((_, i) => i !== idx))
        }

        const addBullet = () => {
          if (bullets.length >= 3) return
          setBullets([...bullets, ''])
        }

        const convertLegacySectionsToCanonical = () => {
          const heading =
            (typeof c.heading === 'string' && c.heading.trim()) ||
            (typeof c.title === 'string' && c.title.trim()) ||
            'Concept'
          const sections = Array.isArray(c.sections) ? (c.sections as Record<string, unknown>[]) : []
          const converted = sections
            .map((s) => {
              const t = typeof s.title === 'string' ? s.title : ''
              const body =
                typeof s.content === 'string' ? s.content : typeof s.text === 'string' ? s.text : ''
              const both = [t, body].filter(Boolean).join(' — ')
              return both.trim()
            })
            .filter(Boolean)
          setContent(() => ({
            targetWord: heading,
            bullets: converted.length ? converted.slice(0, 3) : [''],
          }))
        }

        primaryScreenSaveRef.current = () => {
          const d = draftRef.current
          if (!d) return
          const co = d.content as Record<string, unknown>
          const rb = Array.isArray(co.bullets) ? (co.bullets as string[]) : ['']
          const cleaned = rb.slice(0, 3).map((x) => String(x ?? '').trim()).filter(Boolean)
          const tw = String(co.targetWord ?? '').trim()
          if (!tw) {
            setJsonError('Concept needs a target word.')
            return
          }
          if (cleaned.length < 1) {
            setJsonError('Concept needs at least one non-empty bullet.')
            return
          }
          setJsonError('')
          saveStructured({ targetWord: tw, bullets: cleaned.slice(0, 3) })
        }

        return (
          <View style={styles.form}>
            {hasLegacySections ? (
              <View style={styles.warningBox}>
                <Text style={styles.warningTitle}>This concept still has legacy `sections[]` in JSON</Text>
                <Text style={styles.warningBody}>
                  The learner expects `targetWord` and `bullets` only. Convert here, or clean the row in Supabase / raw
                  JSON.
                  {allowJsonEditing ? ' Raw JSON is available below if needed.' : ''}
                </Text>
                <Pressable style={styles.convertBtn} onPress={convertLegacySectionsToCanonical}>
                  <Text style={styles.convertBtnText}>Convert to target word + bullets</Text>
                </Pressable>
              </View>
            ) : null}

            <Field
              label="Target word"
              value={String(c.targetWord ?? '')}
              onChangeText={(t) =>
                setContent((cur) => ({
                  ...cur,
                  targetWord: t,
                  bullets: (Array.isArray(cur.bullets) ? (cur.bullets as string[]) : ['']).slice(0, 3),
                }))
              }
            />
            <Text style={styles.hint}>
              Learner shows an animated reveal for the target word and up to three bullets. Persist only these fields.
            </Text>

            <Text style={styles.label}>Bullets (max 3)</Text>
            {bullets.map((b, i) => (
              <View key={i} style={styles.bulletRow}>
                <TextInput
                  style={styles.bulletInput}
                  value={String(b ?? '')}
                  onChangeText={(t) => {
                    const next = bullets.map((x, j) => (j === i ? t : x))
                    setBullets(next)
                  }}
                  placeholder={`Bullet ${i + 1}`}
                  placeholderTextColor="#52525b"
                />
                <Pressable
                  style={styles.bulletMiniBtn}
                  onPress={() => moveBullet(i, -1)}
                  disabled={i === 0}
                >
                  <Text style={[styles.bulletMiniBtnText, i === 0 && styles.bulletMiniDisabled]}>↑</Text>
                </Pressable>
                <Pressable
                  style={styles.bulletMiniBtn}
                  onPress={() => moveBullet(i, 1)}
                  disabled={i === bullets.length - 1}
                >
                  <Text
                    style={[
                      styles.bulletMiniBtnText,
                      i === bullets.length - 1 && styles.bulletMiniDisabled,
                    ]}
                  >
                    ↓
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.bulletMiniBtn}
                  onPress={() => removeBullet(i)}
                  disabled={bullets.length <= 1}
                >
                  <Text
                    style={[
                      styles.bulletMiniBtnTextDanger,
                      bullets.length <= 1 && styles.bulletMiniDisabled,
                    ]}
                  >
                    ✕
                  </Text>
                </Pressable>
              </View>
            ))}
            <Pressable style={styles.addBtn} onPress={addBullet} disabled={bullets.length >= 3}>
              <Text style={[styles.addBtnText, bullets.length >= 3 && styles.bulletMiniDisabled]}>+ Add bullet</Text>
            </Pressable>
          </View>
        )
      }
      case 'dialogue': {
        return (
          <DialogueTwoPersonEditor
            content={c}
            setContent={setContent}
            hideFooterSave
            readOnly={readOnlyMode}
            onRegisterHeaderSave={registerPrimaryScreenSave}
            onSave={() => {
              const d = draftRef.current
              if (!d) return
              saveStructured({ ...(d.content as Record<string, unknown>) })
            }}
          />
        )
      }
      case 'match': {
        let pairs = (c.pairs as Record<string, unknown>[] | undefined) ?? []
        if (!Array.isArray(pairs)) pairs = []
        primaryScreenSaveRef.current = () => {
          setJsonError('')
          const d = draftRef.current
          if (!d) return
          const content = d.content as Record<string, unknown>
          const pr = content.pairs
          if (!Array.isArray(pr) || pr.length === 0) {
            setJsonError(
              allowJsonEditing
                ? 'Match screen needs at least one pair. Add a pair first (or paste JSON and Apply JSON & close).'
                : 'Match screen needs at least one pair. Add a pair first.',
            )
            return
          }
          saveStructured(content)
        }
        return (
          <View style={styles.form}>
            {pairs.length === 0 ? (
              <View style={styles.matchEmptyBlock}>
                <Text style={styles.hint}>
                  No pairs yet. Remove everything to start fresh, then use + Add pair. You need at least one pair before Save
                  screen.
                </Text>
                <Pressable
                  style={styles.fillFromExposureBtn}
                  onPress={() => {
                    const rows = celebrateExposureWordRows(lessonScreens)
                    if (rows.length === 0) {
                      setJsonError('No words on Audio exposure screens in this lesson yet.')
                      return
                    }
                    setJsonError('')
                    setContent((cur) => ({
                      ...cur,
                      pairs: rows.map((r) => ({ left: r.afaan, right: r.english })),
                    }))
                  }}
                >
                  <Text style={styles.fillFromExposureBtnText}>Add all from Audio exposure in this lesson</Text>
                  <Text style={styles.fillFromExposureBtnSub}>
                    One-time fill: every word from Audio exposure screens (order in lesson, Afaan deduped).
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {pairs.map((p, i) => (
              <View key={i} style={styles.pairCard}>
                <Text style={styles.personTitle}>Pair {i + 1}</Text>
                {String(p.left ?? '').trim() ? (
                  <View style={styles.matchSelectedBox}>
                    <Text style={styles.matchSelectedTop}>{String(p.left ?? '').trim()}</Text>
                    <Text style={styles.matchSelectedSub}>{String(p.right ?? '').trim() || '—'}</Text>
                  </View>
                ) : (
                  <>
                    <WordBankPicker
                      label="Word (Oromo)"
                      value={null}
                      onPick={(row) => {
                        setContent((cur) => {
                          const pr = (cur.pairs as Record<string, unknown>[]) ?? []
                          const next = pr.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  word_id: row.id,
                                  left_word_id: row.id,
                                  left: rowAfaanTextForBankPick(row),
                                  right: rowTranslationText(row),
                                }
                              : x,
                          )
                          return { ...cur, pairs: next }
                        })
                      }}
                      placeholder="Search Oromo word…"
                    />
                    <Text style={styles.matchRightPreviewLabel}>Right option (English)</Text>
                    <Text style={styles.matchRightPreview}>—</Text>
                  </>
                )}
                <Pressable
                  style={styles.removeBtn}
                  onPress={() => {
                    setContent((cur) => {
                      const pr = (cur.pairs as Record<string, unknown>[]) ?? []
                      return { ...cur, pairs: pr.filter((_, j) => j !== i) }
                    })
                  }}
                >
                  <Text style={styles.removeBtnText}>Remove pair</Text>
                </Pressable>
              </View>
            ))}
            <Pressable
              style={styles.addBtn}
              onPress={() =>
                setContent((cur) => {
                  const pr = (cur.pairs as Record<string, unknown>[]) ?? []
                  return { ...cur, pairs: [...pr, { left: '', right: '' }] }
                })
              }
            >
              <Text style={styles.addBtnText}>+ Add pair</Text>
            </Pressable>
          </View>
        )
      }
      case 'quiz': {
        let questions = (c.questions as Record<string, unknown>[] | undefined) ?? []
        if (!Array.isArray(questions) || questions.length === 0) {
          if (typeof c.question === 'string') {
            questions = [
              {
                question: c.question,
                options: Array.isArray(c.options) ? c.options : ['', ''],
                correctAnswer: typeof c.correctAnswer === 'number' ? c.correctAnswer : 0,
              },
            ]
          } else {
            questions = [{ question: '', options: ['', ''], correctAnswer: 0 }]
          }
        }
        const q0 = questions[0] ?? { question: '', options: ['', ''], correctAnswer: 0 }
        const optionsRaw = Array.isArray(q0.options) ? (q0.options as unknown[]) : []
        const options: QuizOptionDraft[] = optionsRaw
          .map((o) => {
            if (typeof o === 'string') return { text: o, english: '' }
            if (o && typeof o === 'object' && !Array.isArray(o)) {
              const ro = o as Record<string, unknown>
              const ar = ro.audioRef
              return {
                text: typeof ro.text === 'string' ? ro.text : String(ro.text ?? ''),
                english: typeof ro.english === 'string' ? ro.english : '',
                word_id: typeof ro.word_id === 'string' ? ro.word_id : undefined,
                audioRef: typeof ar === 'string' && ar.trim() ? ar.trim() : undefined,
              }
            }
            return { text: String(o ?? ''), english: '' }
          })
          .filter((x) => x.text.trim() !== '')
        const correctIdx = typeof q0.correctAnswer === 'number' ? q0.correctAnswer : 0
        const correctLabel = options[correctIdx]?.text?.trim() || (options.length ? `Option ${correctIdx + 1}` : '—')
        primaryScreenSaveRef.current = () => {
          const d = draftRef.current
          if (!d) return
          saveStructured(quizContentWithAudioOptionsFlag({ ...(d.content as Record<string, unknown>) }))
        }
        return (
          <View style={styles.form}>
            <Field label="Question" value={String(q0.question ?? '')} multiline onChangeText={(t) => {
              setContent((cur) => {
                const qs = ensureQuizQuestionsArray(cur)
                const qFirst = { ...(qs[0] ?? { question: '', options: ['', ''], correctAnswer: 0 }), question: t }
                return { ...cur, questions: [qFirst, ...qs.slice(1)] }
              })
            }} />
            <Text style={styles.label}>Options (pick from word bank)</Text>
            <Text style={styles.hint}>Search Oromo; English shows for context. No custom options.</Text>
            {options.map((opt, i) => (
              <View key={`${opt.word_id ?? opt.text}-${i}`} style={styles.quizOptionCard}>
                <View style={styles.quizOptionTextCol}>
                  <Text style={styles.quizOptionTop}>{opt.text}</Text>
                  {opt.english?.trim() ? <Text style={styles.quizOptionSub}>{opt.english.trim()}</Text> : null}
                  {opt.audioRef?.trim() ? (
                    <Text style={styles.quizOptionAudioHint}>Audio from word bank</Text>
                  ) : null}
                </View>
                <Pressable
                  style={styles.quizOptionRemoveBtn}
                  onPress={() => {
                    setContent((cur) => {
                      const qs = ensureQuizQuestionsArray(cur)
                      const qFirst = { ...(qs[0] ?? { question: '', options: ['', ''], correctAnswer: 0 }) }
                      const opts = quizOptionsDraftFromQ0(qFirst)
                      const cIdx = typeof qFirst.correctAnswer === 'number' ? qFirst.correctAnswer : 0
                      const nextOpts = opts.filter((_, j) => j !== i).map((x) => ({ ...x }))
                      const serial = nextOpts.map(serializeQuizOption)
                      const nextCorrect = Math.max(0, Math.min(cIdx, Math.max(0, serial.length - 1)))
                      const hasAudio = nextOpts.some((x) => Boolean(x.audioRef?.trim()))
                      const nextQs = [
                        {
                          ...qFirst,
                          options: serial.length ? serial : [{ text: '', english: '' }, { text: '', english: '' }],
                          correctAnswer: nextCorrect,
                        },
                        ...qs.slice(1),
                      ]
                      return { ...cur, questions: nextQs, audioOptions: hasAudio }
                    })
                  }}
                >
                  <Text style={styles.quizOptionRemoveText}>Remove</Text>
                </Pressable>
              </View>
            ))}
            <WordBankPicker
              label="Add option (Oromo)"
              value={null}
              onPick={(row) => {
                setContent((cur) => {
                  const qs = ensureQuizQuestionsArray(cur)
                  const qFirst = { ...(qs[0] ?? { question: '', options: ['', ''], correctAnswer: 0 }) }
                  const opts = quizOptionsDraftFromQ0(qFirst)
                  const cIdx = typeof qFirst.correctAnswer === 'number' ? qFirst.correctAnswer : 0
                  const ar = audioRefFromWordRow(row)
                  const nextOpts: QuizOptionDraft[] = [
                    ...opts,
                    {
                      text: rowAfaanTextForBankPick(row),
                      english: rowTranslationText(row),
                      word_id: row.id,
                      ...(ar ? { audioRef: ar } : {}),
                    },
                  ]
                  const serial = nextOpts.map(serializeQuizOption)
                  const nextCorrect = Math.max(0, Math.min(cIdx, serial.length - 1))
                  const hasAudio = nextOpts.some((x) => Boolean(x.audioRef?.trim()))
                  return {
                    ...cur,
                    questions: [{ ...qFirst, options: serial, correctAnswer: nextCorrect }, ...qs.slice(1)],
                    audioOptions: hasAudio,
                  }
                })
              }}
              placeholder="Search Oromo word…"
            />
            <Pressable
              style={styles.quizCorrectBtn}
              onPress={() => setQuizCorrectOpen(true)}
              disabled={options.length < 2}
            >
              <Text style={styles.quizCorrectBtnLabel}>Correct answer</Text>
              <Text style={styles.quizCorrectBtnValue}>{correctLabel}</Text>
            </Pressable>
            <Field label="Explanation (optional)" value={String(q0.explanation ?? '')} multiline onChangeText={(t) => {
              setContent((cur) => {
                const qs = ensureQuizQuestionsArray(cur)
                const qFirst = { ...(qs[0] ?? {}), explanation: t }
                return { ...cur, questions: [qFirst, ...qs.slice(1)] }
              })
            }} />

            <Modal visible={quizCorrectOpen} transparent animationType="fade" onRequestClose={() => setQuizCorrectOpen(false)}>
              <Pressable style={styles.quizCorrectOverlay} onPress={() => setQuizCorrectOpen(false)}>
                <Pressable style={styles.quizCorrectSheet} onPress={() => {}}>
                  <Text style={styles.personTitle}>Select correct answer</Text>
                  {options.length < 2 ? (
                    <Text style={styles.hint}>Add at least 2 options first.</Text>
                  ) : (
                    options.map((opt, idx) => (
                      <Pressable
                        key={`${opt.word_id ?? opt.text}-${idx}`}
                        style={styles.quizCorrectChoice}
                        onPress={() => {
                          setContent((cur) => {
                            const qs = ensureQuizQuestionsArray(cur)
                            const qFirst = { ...(qs[0] ?? {}), correctAnswer: idx }
                            return { ...cur, questions: [qFirst, ...qs.slice(1)] }
                          })
                          setQuizCorrectOpen(false)
                        }}
                      >
                        <Text style={styles.quizCorrectChoiceText}>
                          {idx === correctIdx ? '✓ ' : ''}
                          {opt.text}
                        </Text>
                        {opt.english?.trim() ? <Text style={styles.quizCorrectChoiceSub}>{opt.english.trim()}</Text> : null}
                      </Pressable>
                    ))
                  )}
                </Pressable>
              </Pressable>
            </Modal>
          </View>
        )
      }
      case 'speakingPractice': {
        const phraseVal = String(c.word ?? c.prompt ?? '')
        const exposureLinked = Boolean(String(c.speakingDraftTokenId ?? '').trim())
        primaryScreenSaveRef.current = () => {
          const d = draftRef.current
          if (!d) return
          saveStructured({ ...(d.content as Record<string, unknown>) })
        }
        return (
          <View style={styles.form}>
            <Text style={styles.hint}>
              Type in Afaan Oromo, or type 2+ letters and pick from the word bank — the English gloss comes from the
              bank when you pick a row.
            </Text>
            <AudioExposureOromoField
              readOnly={Boolean(c.word_id) || exposureLinked}
              lessonHarvested={exposureWordsForAfaanPicker}
              value={phraseVal}
              onChangeText={(t) => {
                setContent((cur) => {
                  const next: Record<string, unknown> = {
                    ...cur,
                    word: t,
                    prompt: t,
                    word_id: null,
                    tip: '',
                  }
                  if (!next.word_id) delete next.word_id
                  delete next.speakingDraftTokenId
                  return next
                })
              }}
              onPickFromBank={(row) => {
                setContent((cur) => {
                  const bankId = isRealWordBankRowId(row) ? row.id : null
                  const next: Record<string, unknown> = {
                    ...cur,
                    word_id: bankId,
                    word: rowAfaanTextForBankPick(row),
                    prompt: rowAfaanTextForBankPick(row),
                  }
                  if (!bankId) delete next.word_id
                  delete next.speakingDraftTokenId
                  return next
                })
              }}
            />
            {audioExposureSpeakingLinkOptions.length ? (
              <View style={{ marginTop: 14 }}>
                <Text style={[styles.hint, { marginBottom: 8 }]}>
                  Or link this screen to a word from an Audio exposure step in this lesson (works even when that word
                  is not in the word bank yet). Example audio appears once exposure has clips or after you add the word
                  to the bank.
                </Text>
                {audioExposureSpeakingLinkOptions.map((opt) => (
                  <Pressable
                    key={opt.draftTokenId}
                    style={styles.quizCorrectChoice}
                    onPress={() => {
                      setContent((cur) => {
                        const next: Record<string, unknown> = {
                          ...cur,
                          word: opt.afaan,
                          prompt: opt.afaan,
                          speakingDraftTokenId: opt.draftTokenId,
                          tip: '',
                        }
                        delete next.word_id
                        return next
                      })
                    }}
                  >
                    <Text style={styles.quizCorrectChoiceText}>
                      {opt.afaan}
                      {opt.screenIndex ? ` · exposure screen #${opt.screenIndex}` : ''}
                    </Text>
                    {opt.english.trim() ? (
                      <Text style={styles.quizCorrectChoiceSub}>{opt.english.trim()}</Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Pressable
              style={styles.changeWordBtn}
              onPress={() => {
                setContent((cur) => {
                  const next: Record<string, unknown> = {
                    ...cur,
                    word_id: null,
                    word: '',
                    prompt: '',
                    tip: '',
                  }
                  if (!next.word_id) delete next.word_id
                  delete next.speakingDraftTokenId
                  return next
                })
              }}
            >
              <Text style={styles.changeWordBtnText}>Clear</Text>
            </Pressable>
            <Field
              label="Tip (optional)"
              value={String(c.tip ?? '')}
              onChangeText={(t) => setContent((cur) => ({ ...cur, tip: t }))}
            />
          </View>
        )
      }
      case 'audioExposure': {
        let words = (c.words as Record<string, unknown>[] | undefined) ?? []
        if (!Array.isArray(words)) words = []
        primaryScreenSaveRef.current = () => {
          void (async () => {
            if (audioExposureBankSaveBusyRef.current) return
            audioExposureBankSaveBusyRef.current = true
            try {
              setJsonError('')
              const current = draftRef.current
              if (!current) return
              const c2 = current.content as Record<string, unknown>
              const ws = (c2.words as Record<string, unknown>[] | undefined) ?? []
              if (!Array.isArray(ws) || ws.length < 1) {
                setJsonError(
                  allowJsonEditing
                    ? 'Audio exposure needs at least one word. Add a word or use Apply JSON & close.'
                    : 'Audio exposure needs at least one word. Add a word first.',
                )
                return
              }
              const contentSeries = String(c2.series ?? '').trim()
              const runBankCompare = Boolean((lessonSeries ?? '').trim() || contentSeries)
              const resolvedWords = runBankCompare
                ? await resolveAudioExposureWordsAgainstBank(
                    ws as Record<string, unknown>[],
                    lessonSeries,
                    contentSeries || null,
                    promptTranslationConflict,
                  )
                : (ws as Record<string, unknown>[])
              setTranslationConflict(null)
              saveStructured({ ...c2, words: resolvedWords })
            } catch (e) {
              setTranslationConflict(null)
              const msg = e instanceof Error ? e.message : String(e)
              setJsonError(msg)
            } finally {
              audioExposureBankSaveBusyRef.current = false
            }
          })()
        }
        return (
          <View style={styles.form}>
            {words.length === 0 ? (
              <Text style={styles.hint}>
                {allowJsonEditing
                  ? 'No words yet. Remove the last word to start fresh, then use + Add word. Save requires at least one word (or use Apply JSON & close).'
                  : 'No words yet. Remove the last word to start fresh, then use + Add word. Save requires at least one word.'}
              </Text>
            ) : null}
            {words.length ? (
              <Text style={styles.hint}>
                Each row must be linked to the word bank (tap a match) so the lesson stores a valid word_id and
                learner audio URLs work. Free-typed text alone cannot be saved for this screen.
              </Text>
            ) : null}
            {words.map((w, i) => (
              <View key={i} style={styles.pairCard}>
                <Text style={styles.personTitle}>Word {i + 1}</Text>
                <AudioExposureOromoField
                  readOnly={Boolean(w.word_id)}
                  lessonHarvested={exposureWordsForAfaanPicker}
                  value={String(w.word ?? '')}
                  onChangeText={(t) => {
                    const ignoreUntil = audioExposureOromoTypingIgnoreUntilRef.current.get(i) ?? 0
                    if (Date.now() < ignoreUntil) return
                    setContent((cur) => {
                      const ws = (cur.words as Record<string, unknown>[]) ?? []
                      const next = ws.map((x, j) => {
                        if (j !== i) return x
                        const prev = x as Record<string, unknown>
                        const wid = String(prev.word_id ?? '').trim()
                        if (wid && isUuidLike(wid)) {
                          return prev
                        }
                        const nx: Record<string, unknown> = { ...prev, word: t }
                        delete nx.oromo
                        delete nx.english
                        delete nx.translation
                        return nx
                      })
                      return { ...cur, words: next }
                    })
                  }}
                  onPickFromBank={(row) => {
                    audioExposureOromoTypingIgnoreUntilRef.current.set(i, Date.now() + 500)
                    setContent((cur) => {
                      const ws = (cur.words as Record<string, unknown>[]) ?? []
                      const bankId = isRealWordBankRowId(row) ? row.id : null
                      const next = ws.map((x, j) => {
                        if (j !== i) return x
                        const item: Record<string, unknown> = {
                          ...(x as Record<string, unknown>),
                          word_id: bankId,
                          word: rowAfaanTextForBankPick(row),
                          translation: rowTranslationText(row),
                        }
                        delete item.oromo
                        delete item.english
                        if (!bankId) delete item.word_id
                        applyWordBankUrlsToExposureWord(item, row)
                        return item
                      })
                      return { ...cur, words: next }
                    })
                  }}
                />
                <Field
                  label="Translation"
                  value={String(w.translation ?? w.english ?? '')}
                  editable
                  onChangeText={(t) => {
                    setContent((cur) => {
                      const ws = (cur.words as Record<string, unknown>[]) ?? []
                      const next = ws.map((x, j) => {
                        if (j !== i) return x
                        const nx: Record<string, unknown> = { ...(x as Record<string, unknown>), translation: t }
                        delete nx.english
                        return nx
                      })
                      return { ...cur, words: next }
                    })
                  }}
                />
                <Pressable
                  style={styles.removeBtn}
                  onPress={() => {
                    setContent((cur) => {
                      const ws = (cur.words as Record<string, unknown>[]) ?? []
                      return { ...cur, words: ws.filter((_, j) => j !== i) }
                    })
                  }}
                >
                  <Text style={styles.removeBtnText}>Remove word</Text>
                </Pressable>
              </View>
            ))}
            <Pressable
              style={styles.addBtn}
              onPress={() =>
                setContent((cur) => {
                  const ws = (cur.words as Record<string, unknown>[]) ?? []
                  return {
                    ...cur,
                    words: [...ws, { word: '', english: '', draftTokenId: newDraftTokenId() }],
                  }
                })
              }
            >
              <Text style={styles.addBtnText}>+ Add word</Text>
            </Pressable>
          </View>
        )
      }
      case 'CelebrateScreen': {
        const exposureRows = celebrateExposureWordRows(lessonScreens)
        const exposureKeys = new Set(exposureRows.map((r) => celebrateAfaanDedupeKey(r.afaan)))
        const extraRows = celebrateLearnedExtraEditorRows(c as Record<string, unknown>, exposureKeys)
        const updateLearnedExtra = (fn: (rows: string[]) => string[]) => {
          setContent((cur) => {
            const keys = new Set(
              celebrateExposureWordRows(lessonScreens).map((r) => celebrateAfaanDedupeKey(r.afaan)),
            )
            const row0 = celebrateLearnedExtraEditorRows(cur as Record<string, unknown>, keys)
            return { ...cur, learned_extra: fn(row0) }
          })
        }
        primaryScreenSaveRef.current = () => {
          const d = draftRef.current
          if (!d) return
          const base = { ...(d.content as Record<string, unknown>) }
          delete base.learned_words
          delete base.title
          const exp = celebrateLearnedWordsFromScreens(lessonScreens)
          const keys = new Set(exp.map(celebrateAfaanDedupeKey))
          const extra = Array.isArray(base.learned_extra)
            ? celebrateSanitizedLearnedExtra(base.learned_extra)
            : celebrateLearnedExtraFromContent(base, keys)
          const learned = mergeCelebrateLearnedFromExposureAndExtra(exp, extra)
          saveStructured({ ...base, learned, learned_extra: extra })
        }
        return (
          <View style={styles.form}>
            <Field label="Message" value={String(c.message ?? '')} multiline onChangeText={(t) => setContent((cur) => ({ ...cur, message: t }))} />
            <View style={styles.learnedBlock}>
              <Text style={styles.label}>From Audio exposure</Text>
              <Text style={styles.hint}>
                These follow every Audio exposure in lesson order. They update when you save after changing exposure screens;
                removed exposure words drop off unless you also add them below.
              </Text>
              {exposureRows.length ? (
                <View style={styles.learnedList}>
                  {exposureRows.map((row) => (
                    <View key={row.afaan} style={styles.learnedReadOnlyRow}>
                      <Text style={styles.learnedText}>{row.afaan}</Text>
                      {row.english ? <Text style={styles.learnedReadOnlySub}>{row.english}</Text> : null}
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.hint}>None yet. Add words on Audio exposure screens, or only use additional words below.</Text>
              )}
            </View>
            <View style={styles.learnedBlock}>
              <Text style={styles.label}>Additional words</Text>
              <Text style={styles.hint}>
                Kept when exposure changes. Duplicates of an exposure word are skipped in the final list.
              </Text>
              {extraRows.map((ex, i) => (
                <View key={`celebrate-extra-${i}`} style={styles.bulletRow}>
                  <TextInput
                    style={styles.bulletInput}
                    value={ex}
                    onChangeText={(t) => {
                      updateLearnedExtra((rows) => {
                        const next = [...rows]
                        next[i] = t
                        return next
                      })
                    }}
                    placeholder="Afaan (optional)"
                    placeholderTextColor="#52525b"
                  />
                  <Pressable
                    style={styles.bulletMiniBtn}
                    onPress={() => {
                      updateLearnedExtra((rows) => rows.filter((_, j) => j !== i))
                    }}
                  >
                    <Text style={styles.bulletMiniBtnTextDanger}>✕</Text>
                  </Pressable>
                </View>
              ))}
              <Pressable style={styles.addBtn} onPress={() => updateLearnedExtra((rows) => [...rows, ''])}>
                <Text style={styles.addBtnText}>+ Add word</Text>
              </Pressable>
            </View>
          </View>
        )
      }
      case 'patternPractice': {
        let exercises = (c.exercises as Record<string, unknown>[] | undefined) ?? []
        if (!Array.isArray(exercises) || exercises.length === 0) {
          exercises = [{ prompt: '', options: [], correctSuffix: '' }]
        }
        const ex0 = { ...(exercises[0] as Record<string, unknown>) }
        const optionsRaw = Array.isArray(ex0.options) ? (ex0.options as unknown[]) : []
        const options = optionsRaw.map(patternOptionString).filter(Boolean)
        const correctSuffix = String(ex0.correctSuffix ?? '').trim()
        const correctOk = Boolean(correctSuffix && options.includes(correctSuffix))

        const patchEx0 = (fn: (e0: Record<string, unknown>) => Record<string, unknown>) => {
          setContent((cur) => {
            const ex = (cur.exercises as Record<string, unknown>[]) ?? []
            const e0 = { ...(ex[0] ?? { prompt: '', options: [], correctSuffix: '' }) }
            return { ...cur, exercises: [fn(e0), ...ex.slice(1)] }
          })
        }

        primaryScreenSaveRef.current = () => {
          setJsonError('')
          const d = draftRef.current
          if (!d) return
          const content = { ...(d.content as Record<string, unknown>) }
          const ex = (content.exercises as Record<string, unknown>[] | undefined) ?? []
          const e0pat = ex[0] as Record<string, unknown> | undefined
          const opts = Array.isArray(e0pat?.options)
            ? (e0pat.options as unknown[]).map(patternOptionString).filter(Boolean)
            : []
          if (opts.length < 2) {
            setJsonError('Pattern practice needs at least 2 options.')
            return
          }
          const cs = String(e0pat?.correctSuffix ?? '').trim()
          if (!opts.includes(cs)) {
            setJsonError('Correct answer must be one of the options.')
            return
          }
          saveStructured(content)
        }

        return (
          <View style={styles.form}>
            <Field label="Prompt" value={String(ex0.prompt ?? '')} multiline onChangeText={(t) => patchEx0((e0) => ({ ...e0, prompt: t }))} />
            <Text style={styles.label}>Options (pick from word bank)</Text>
            <Text style={styles.hint}>Same flow as quiz options, but stored as plain text (no audio).</Text>
            {options.map((opt, i) => (
              <View key={`${opt}-${i}`} style={styles.quizOptionCard}>
                <View style={styles.quizOptionTextCol}>
                  <Text style={styles.quizOptionTop}>{opt}</Text>
                </View>
                <Pressable
                  style={styles.quizOptionRemoveBtn}
                  onPress={() => {
                    patchEx0((e0) => {
                      const optsRaw = Array.isArray(e0.options) ? (e0.options as unknown[]) : []
                      const opts = optsRaw.map(patternOptionString).filter(Boolean)
                      const nextOpts = opts.filter((_, j) => j !== i)
                      let nextCorrect = String(e0.correctSuffix ?? '').trim()
                      if (!nextOpts.includes(nextCorrect)) nextCorrect = nextOpts[0] ?? ''
                      return { ...e0, options: nextOpts, correctSuffix: nextCorrect }
                    })
                  }}
                >
                  <Text style={styles.quizOptionRemoveText}>Remove</Text>
                </Pressable>
              </View>
            ))}
            <WordBankPicker
              label="Add option (Oromo)"
              value={null}
              onPick={(row) => {
                const text = rowAfaanTextForBankPick(row)
                if (!text) return
                patchEx0((e0) => {
                  const optsRaw = Array.isArray(e0.options) ? (e0.options as unknown[]) : []
                  const opts = optsRaw.map(patternOptionString).filter(Boolean)
                  if (opts.includes(text)) return e0
                  const nextOpts = [...opts, text]
                  let nextCorrect = String(e0.correctSuffix ?? '').trim()
                  if (!nextCorrect || !nextOpts.includes(nextCorrect)) nextCorrect = nextOpts[0] ?? ''
                  return { ...e0, options: nextOpts, correctSuffix: nextCorrect }
                })
              }}
              placeholder="Search Oromo word…"
            />
            <Pressable
              style={styles.quizCorrectBtn}
              onPress={() => setPatternCorrectOpen(true)}
              disabled={options.length < 2}
            >
              <Text style={styles.quizCorrectBtnLabel}>Correct answer</Text>
              <Text style={styles.quizCorrectBtnValue}>{correctOk ? correctSuffix : options.length >= 2 ? 'Tap to choose' : '—'}</Text>
            </Pressable>
            <Field
              label="Explanation (optional)"
              value={String(ex0.explanation ?? '')}
              multiline
              onChangeText={(t) => patchEx0((e0) => ({ ...e0, explanation: t }))}
            />

            <Modal visible={patternCorrectOpen} transparent animationType="fade" onRequestClose={() => setPatternCorrectOpen(false)}>
              <Pressable style={styles.quizCorrectOverlay} onPress={() => setPatternCorrectOpen(false)}>
                <Pressable style={styles.quizCorrectSheet} onPress={() => {}}>
                  <Text style={styles.personTitle}>Select correct answer</Text>
                  {options.length < 2 ? (
                    <Text style={styles.hint}>Add at least 2 options first.</Text>
                  ) : (
                    options.map((opt, idx) => (
                      <Pressable
                        key={`${idx}-${opt}`}
                        style={styles.quizCorrectChoice}
                        onPress={() => {
                          patchEx0((e0) => {
                            const optsRaw = Array.isArray(e0.options) ? (e0.options as unknown[]) : []
                            const opts = optsRaw.map(patternOptionString).filter(Boolean)
                            return { ...e0, options: opts, correctSuffix: opt }
                          })
                          setPatternCorrectOpen(false)
                        }}
                      >
                        <Text style={styles.quizCorrectChoiceText}>
                          {opt === correctSuffix ? '✓ ' : ''}
                          {opt}
                        </Text>
                      </Pressable>
                    ))
                  )}
                </Pressable>
              </Pressable>
            </Modal>
          </View>
        )
      }
      case 'discriminationDrill': {
        return (
          <WordDiscriminationQuizEditor
            content={c as Record<string, unknown>}
            setContent={setContent}
            lessonScreens={lessonScreens}
            lessonSeries={lessonSeries ?? null}
            lessonContentSeries={lessonContentSeries ?? null}
            saveStructured={saveStructured}
            draftRef={draftRef}
            setJsonError={setJsonError}
            registerPrimarySave={registerPrimaryScreenSave}
            readOnly={readOnlyMode}
          />
        )
      }
      case 'videoReview': {
        primaryScreenSaveRef.current = () => {
          const base = draftRef.current?.content as Record<string, unknown> | undefined
          if (!base) return
          saveStructured(normalizeVideoReviewContentForEdit({ ...base }))
        }
        return (
          <View style={styles.form}>
            {!allowVideoReviewMediaFields ? (
              <Text style={styles.hint}>An admin completes this step after curriculum approval.</Text>
            ) : (
              <>
                <Text style={styles.hint}>
                  Pick the clip learners watch for this step; files live in the Videos-Dubbadhu bucket on Supabase.
                </Text>
                <VideoReviewDubbadhuVideoField
                  videoUrl={String(c.videoUrl ?? '')}
                  setContent={setContent}
                  readOnly={readOnlyMode}
                />
                <VideoReviewFreezeFrameEditor
                  videoUrl={String(c.videoUrl ?? '')}
                  freezeAtSeconds={c.freezeAtSeconds}
                  setContent={setContent}
                  enabled
                  readOnly={readOnlyMode}
                />
              </>
            )}
            {allowVideoReviewMediaFields ? null : (
              <VideoReviewFreezeFrameEditor
                videoUrl={String(c.videoUrl ?? '')}
                freezeAtSeconds={c.freezeAtSeconds}
                setContent={setContent}
                enabled={false}
              />
            )}
            <Text style={styles.label}>Video Lines and Vocab</Text>
            <Text style={styles.hint}>Lines to script and its associated vocab.</Text>
            {(() => {
              const lines = Array.isArray(c.lines) ? (c.lines as Record<string, unknown>[]) : []
              return (
                <>
                  {lines.map((ln, idx) => {
                    const id = String(ln?.id ?? `line_${idx + 1}`)
                    const text = String(ln?.text ?? '')
                    const vocabWords = Array.isArray(ln?.vocabWords) ? (ln.vocabWords as Record<string, unknown>[]) : []
                    const vocabPreview = vocabWords
                      .map((w) => String(w?.word ?? '').trim())
                      .filter(Boolean)
                    const hasVocab = vocabPreview.length > 0
                    const lineCollapsed = hasVocab && videoReviewActiveLineId !== id
                    return (
                      <View key={`${id}-${idx}`} style={styles.videoReviewLineCard}>
                        {lineCollapsed ? (
                          <>
                            <View style={styles.videoReviewCollapsedHeader}>
                              <Text style={[styles.videoReviewLineTitle, styles.videoReviewLineTitleInRow]}>
                                Line {idx + 1}
                              </Text>
                              <View style={styles.videoReviewHeaderActions}>
                                <Pressable hitSlop={8} onPress={() => setVideoReviewActiveLineId(id)}>
                                  <Text style={styles.videoReviewExpandLink}>Expand</Text>
                                </Pressable>
                                <Pressable
                                  hitSlop={8}
                                  style={styles.videoReviewRemoveLineBtnHeader}
                                  onPress={() => {
                                    if (videoReviewActiveLineId === id) setVideoReviewActiveLineId(null)
                                    setContent((cur) => {
                                      const arr = Array.isArray(cur.lines) ? (cur.lines as Record<string, unknown>[]) : []
                                      return { ...cur, lines: arr.filter((_, j) => j !== idx) }
                                    })
                                  }}
                                >
                                  <Text style={styles.removeBtnText}>Remove line</Text>
                                </Pressable>
                              </View>
                            </View>
                            <Pressable onPress={() => setVideoReviewActiveLineId(id)}>
                              <Text style={styles.videoReviewCollapsedScript} numberOfLines={5}>
                                {text.trim() || '—'}
                              </Text>
                              <Text style={styles.videoReviewCollapsedWords} numberOfLines={3}>
                                {vocabPreview.join(' · ')}
                              </Text>
                              <Text style={styles.videoReviewCollapsedMeta}>
                                {vocabPreview.length} word{vocabPreview.length !== 1 ? 's' : ''} · tap to expand
                              </Text>
                            </Pressable>
                          </>
                        ) : (
                          <>
                        <View style={styles.videoReviewLineHeaderRow}>
                          <Text style={[styles.videoReviewLineTitle, styles.videoReviewLineTitleInRow]}>
                            Line {idx + 1}
                          </Text>
                          <Pressable
                            hitSlop={8}
                            style={styles.videoReviewRemoveLineBtnHeader}
                            onPress={() => {
                              if (videoReviewActiveLineId === id) setVideoReviewActiveLineId(null)
                              setContent((cur) => {
                                const arr = Array.isArray(cur.lines) ? (cur.lines as Record<string, unknown>[]) : []
                                return { ...cur, lines: arr.filter((_, j) => j !== idx) }
                              })
                            }}
                          >
                            <Text style={styles.removeBtnText}>Remove line</Text>
                          </Pressable>
                        </View>
                        <Field
                          label="Line text"
                          value={text}
                          multiline
                          multilineCompact
                          onFocus={() => {
                            setVideoReviewActiveLineId(id)
                            setVideoReviewVocabFocusKey(`${id}:line`)
                          }}
                          onChangeText={(t) => {
                            setContent((cur) => {
                              const arr = Array.isArray(cur.lines) ? (cur.lines as Record<string, unknown>[]) : []
                              const next = arr.map((x, j) => (j === idx ? { ...(x as Record<string, unknown>), id, text: t } : x))
                              return { ...cur, lines: next }
                            })
                          }}
                        />
                        <Text style={styles.label}>Vocab Words</Text>
                        {vocabWords.map((w, wi) => (
                          <View key={`${id}-w-${wi}`} style={styles.videoReviewWordRow}>
                            <View style={styles.videoReviewWordCol}>
                            <AudioExposureOromoField
                              compact
                              hideLabel
                              readOnly={Boolean(w.word_id)}
                              lessonHarvested={exposureWordsForAfaanPicker}
                              instanceKey={`${id}-w${wi}`}
                              externalFocusKey={videoReviewVocabFocusKey}
                              onEditorFocus={() => {
                                setVideoReviewActiveLineId(id)
                                setVideoReviewVocabFocusKey(`${id}-w${wi}`)
                              }}
                              value={String(w.word ?? '')}
                              onChangeText={(t) => {
                                setContent((cur) => {
                                  const arr = Array.isArray(cur.lines) ? (cur.lines as Record<string, unknown>[]) : []
                                  const curLine = (arr[idx] as Record<string, unknown>) ?? {}
                                  const ws = Array.isArray(curLine.vocabWords) ? (curLine.vocabWords as Record<string, unknown>[]) : []
                                  const nextWs = ws.map((x, j) => {
                                    if (j !== wi) return x
                                    const prev = x as Record<string, unknown>
                                    const prevText = String(prev.word ?? '').trim()
                                    const nextWord: Record<string, unknown> = { ...prev, word: t }
                                    delete nextWord.oromo
                                    if (String(t).trim() !== prevText) {
                                      delete nextWord.english
                                      delete nextWord.translation
                                      delete nextWord.word_id
                                      delete nextWord.audioRef
                                      delete nextWord.fastAudioRef
                                      delete nextWord.slowAudioRef
                                    }
                                    return nextWord
                                  })
                                  const nextLine = { ...curLine, id, text: String(curLine.text ?? ''), vocabWords: nextWs }
                                  const next = arr.map((x, j) => (j === idx ? nextLine : x))
                                  return { ...cur, lines: next }
                                })
                              }}
                              onPickFromBank={(row) => {
                                setContent((cur) => {
                                  const arr = Array.isArray(cur.lines) ? (cur.lines as Record<string, unknown>[]) : []
                                  const curLine = (arr[idx] as Record<string, unknown>) ?? {}
                                  const ws = Array.isArray(curLine.vocabWords) ? (curLine.vocabWords as Record<string, unknown>[]) : []
                                  const bankId = isRealWordBankRowId(row) ? row.id : null
                                  const nextWs = ws.map((x, j) => {
                                    if (j !== wi) return x
                                    const item: Record<string, unknown> = {
                                      ...(x as Record<string, unknown>),
                                      word_id: bankId,
                                      word: rowAfaanTextForBankPick(row),
                                      translation: rowTranslationText(row),
                                    }
                                    delete item.oromo
                                    delete item.english
                                    if (!bankId) delete item.word_id
                                    applyWordBankUrlsToExposureWord(item, row)
                                    return item
                                  })
                                  const nextLine = { ...curLine, id, text: String(curLine.text ?? ''), vocabWords: nextWs }
                                  const next = arr.map((x, j) => (j === idx ? nextLine : x))
                                  return { ...cur, lines: next }
                                })
                              }}
                            />
                            {String(w.translation ?? w.english ?? '').trim() ? (
                              <Text style={styles.videoReviewEnglishHint}>
                                {String(w.translation ?? w.english ?? '').trim()}
                              </Text>
                            ) : null}
                            </View>
                            <Pressable
                              hitSlop={{ top: 6, bottom: 6, left: 0, right: 10 }}
                              style={styles.videoReviewRemoveWordBtn}
                              onPress={() => {
                                setContent((cur) => {
                                  const arr = Array.isArray(cur.lines) ? (cur.lines as Record<string, unknown>[]) : []
                                  const curLine = (arr[idx] as Record<string, unknown>) ?? {}
                                  const ws = Array.isArray(curLine.vocabWords) ? (curLine.vocabWords as Record<string, unknown>[]) : []
                                  const nextWs = ws.filter((_, j) => j !== wi)
                                  const nextLine = { ...curLine, id, text: String(curLine.text ?? ''), vocabWords: nextWs }
                                  const next = arr.map((x, j) => (j === idx ? nextLine : x))
                                  return { ...cur, lines: next }
                                })
                              }}
                            >
                              <Text style={styles.removeBtnText}>Remove word</Text>
                            </Pressable>
                          </View>
                        ))}
                        <Pressable
                          style={styles.videoReviewAddWordBtn}
                          onPress={() => {
                            setVideoReviewActiveLineId(id)
                            setVideoReviewVocabFocusKey(`${id}:add`)
                            setContent((cur) => {
                              const arr = Array.isArray(cur.lines) ? (cur.lines as Record<string, unknown>[]) : []
                              const curLine = (arr[idx] as Record<string, unknown>) ?? {}
                              const ws = Array.isArray(curLine.vocabWords) ? (curLine.vocabWords as Record<string, unknown>[]) : []
                              const nextWs = [...ws, { word: '' }]
                              const nextLine = { ...curLine, id, text: String(curLine.text ?? ''), vocabWords: nextWs }
                              const next = arr.map((x, j) => (j === idx ? nextLine : x))
                              return { ...cur, lines: next }
                            })
                          }}
                        >
                          <Text style={styles.videoReviewAddWordBtnText}>+ Add word</Text>
                        </Pressable>
                        {hasVocab ? (
                          <Pressable
                            style={styles.videoReviewMinimizeBtn}
                            onPress={() => setVideoReviewActiveLineId(null)}
                          >
                            <Text style={styles.videoReviewMinimizeBtnText}>Minimize line</Text>
                          </Pressable>
                        ) : null}
                          </>
                        )}
                      </View>
                    )
                  })}
                  <Pressable
                    style={styles.addBtn}
                    onPress={() =>
                      setContent((cur) => {
                        const arr = Array.isArray(cur.lines) ? (cur.lines as Record<string, unknown>[]) : []
                        return {
                          ...cur,
                          lines: [
                            ...arr,
                            {
                              id: `line_${arr.length + 1}`,
                              text: '',
                              vocabWords: [{ word: '' }],
                            },
                          ],
                        }
                      })
                    }
                  >
                    <Text style={styles.addBtnText}>+ Add line</Text>
                  </Pressable>
                </>
              )
            })()}
          </View>
        )
      }
      default:
        return null
    }
  }

  const hasStructured = STRUCTURED_SCREEN_TYPES_FOR_HEADER_SAVE.has(draft.type)

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={requestClose}>
      <LessonEditorReadOnlyContext.Provider value={isReadOnly}>
      <View style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <Pressable onPress={requestClose} hitSlop={12}>
            <Text style={styles.modalCancel}>{isReadOnly ? 'Close' : 'Cancel'}</Text>
          </Pressable>
          <Text style={styles.modalTitle} numberOfLines={1}>
            {!allowVideoReviewMediaFields && draft.type === 'videoReview'
              ? 'Review'
              : screenTypeTitle(draft.type)}
          </Text>
          {isReadOnly ? (
            <View style={{ width: 56 }} />
          ) : (
          <Pressable
            onPress={() => {
              if (STRUCTURED_SCREEN_TYPES_FOR_HEADER_SAVE.has(draft.type)) {
                primaryScreenSaveRef.current?.()
                return
              }
              if (allowJsonEditing) applyJsonFallback()
            }}
            hitSlop={8}
            style={styles.modalHeaderSave}
          >
            <Text style={styles.modalHeaderSaveText}>Save</Text>
          </Pressable>
          )}
        </View>
        <ScrollView
          style={styles.modalScroll}
          contentContainerStyle={styles.modalScrollContent}
          keyboardShouldPersistTaps="always"
          removeClippedSubviews={false}
        >
          {draft.type === 'videoReview' ? null : (
            <View style={styles.screenHeader}>
              <Text style={styles.screenHeaderTitle}>{screenTypeTitle(draft.type)}</Text>
              <Text style={styles.screenHeaderSubtitle}>
                {isReadOnly
                  ? 'Preview only — same fields as admins see; changes are not saved.'
                  : allowJsonEditing
                  ? 'Adjust inputs below to modify/create screen.'
                  : 'Sample learner UI is shown above the form so you can match fields to what students see.'}
              </Text>
            </View>
          )}
          {!allowJsonEditing ? <LessonScreenLearnerPreview screenType={draft.type} /> : null}
          {!allowJsonEditing && jsonError ? <Text style={styles.jsonErr}>{jsonError}</Text> : null}
          <View pointerEvents={isReadOnly ? 'none' : 'auto'} collapsable={false}>
          {hasStructured ? (
            structuredForm(isReadOnly)
          ) : allowJsonEditing ? (
            <Text style={styles.hint}>No simple form for this type yet — edit JSON below.</Text>
          ) : (
            <Text style={styles.hint}>
              This screen type doesn’t have a visual editor yet. Ask an admin to change it.
            </Text>
          )}
          </View>
          {allowJsonEditing ? (
            <>
              <Text style={styles.advancedLabel}>Screen content (JSON)</Text>
              {jsonError ? <Text style={styles.jsonErr}>{jsonError}</Text> : null}
              <TextInput
                style={styles.jsonInput}
                multiline
                value={jsonFallback}
                onChangeText={(t) => {
                  setJsonFallback(t)
                  setJsonError('')
                }}
                textAlignVertical="top"
              />
              <Pressable style={styles.applyJsonBtn} onPress={applyJsonFallback}>
                <Text style={styles.applyJsonText}>Apply JSON & close</Text>
              </Pressable>
            </>
          ) : null}
        </ScrollView>
        {translationConflict ? (
          <TranslationMismatchModal
            key={translationConflict.key}
            embedded
            visible
            afaan={translationConflict.afaan}
            lessonTranslation={translationConflict.lessonTranslation}
            databaseTranslation={translationConflict.databaseTranslation}
            conflictNumber={translationConflict.conflictNumber}
            totalConflicts={translationConflict.totalConflicts}
            onCancel={() => finishTranslationConflict('cancel')}
            onUseLesson={() => finishTranslationConflict('lesson')}
            onUseDatabase={() => finishTranslationConflict('database')}
          />
        ) : null}
      </View>
      </LessonEditorReadOnlyContext.Provider>
    </Modal>
  )
}

function Field(props: {
  label: string
  value: string
  onChangeText: (t: string) => void
  multiline?: boolean
  /** Multiline with ~one-line min height; scrolls when content exceeds max height. */
  multilineCompact?: boolean
  keyboardType?: 'default' | 'number-pad'
  onFocus?: () => void
  editable?: boolean
}) {
  const ro = useLessonEditorReadOnly()
  const ml = !!props.multiline
  const compact = !!props.multilineCompact
  const editable = props.editable !== false && !ro
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={[
          styles.input,
          ml && !compact && styles.inputMulti,
          ml && compact && styles.inputMultiCompact,
          !editable && styles.inputReadOnlyBank,
        ]}
        value={props.value}
        editable={editable}
        onChangeText={props.onChangeText}
        onFocus={props.onFocus}
        multiline={ml}
        scrollEnabled={ml && compact}
        keyboardType={props.keyboardType}
        placeholderTextColor="#52525b"
      />
    </View>
  )
}

function Row(props: { label: string; children: ReactNode }) {
  return (
    <View style={styles.rowSwitch}>
      <Text style={styles.label}>{props.label}</Text>
      {props.children}
    </View>
  )
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, backgroundColor: '#0a0a0a' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  modalCancel: { color: '#a78bfa', fontSize: 16, fontWeight: '600' },
  modalHeaderSave: { minWidth: 56, alignItems: 'flex-end', justifyContent: 'center', paddingVertical: 2 },
  modalHeaderSaveText: { color: '#22c55e', fontSize: 16, fontWeight: '700' },
  modalTitle: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1, textAlign: 'center' },
  modalScroll: { flex: 1 },
  modalScrollContent: { flexGrow: 1, padding: 16, paddingBottom: 48 },
  screenHeader: { marginBottom: 12 },
  screenHeaderTitle: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'left' },
  screenHeaderSubtitle: { color: '#a1a1aa', fontSize: 13, marginTop: 6, textAlign: 'left', lineHeight: 18 },
  hint: { color: '#a1a1aa', fontSize: 14, marginBottom: 12 },
  imagePickStatusEmpty: { color: '#f87171' },
  form: { marginBottom: 20 },
  field: { marginBottom: 14 },
  label: { color: '#d4d4d8', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
  },
  inputMulti: { minHeight: 88, textAlignVertical: 'top' },
  inputMultiCompact: {
    minHeight: 44,
    maxHeight: 120,
    textAlignVertical: 'top',
    paddingTop: 10,
    paddingBottom: 10,
  },
  rowSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  personCard: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  personTitle: { color: '#e4e4e7', fontWeight: '700', marginBottom: 8 },
  pairCard: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  videoReviewLineCard: {
    backgroundColor: '#18181b',
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  videoReviewLineTitle: {
    color: '#e4e4e7',
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 4,
  },
  videoReviewLineTitleInRow: { flex: 1, marginBottom: 0, minWidth: 0 },
  videoReviewLineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  videoReviewHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 14, flexShrink: 0 },
  videoReviewRemoveLineBtnHeader: { paddingVertical: 2, paddingLeft: 4 },
  videoReviewWordRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  videoReviewWordCol: { flex: 1, minWidth: 0 },
  videoReviewEnglishHint: {
    color: '#a1a1aa',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
    marginBottom: 2,
    paddingHorizontal: 2,
  },
  videoReviewRemoveWordBtn: { marginTop: 10, flexShrink: 0, paddingVertical: 2, paddingLeft: 2 },
  videoReviewAddWordBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#27272a',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 4,
  },
  videoReviewAddWordBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  videoReviewCollapsedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  videoReviewExpandLink: { color: '#a78bfa', fontSize: 14, fontWeight: '700' },
  videoReviewCollapsedScript: {
    color: '#e4e4e7',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 6,
  },
  videoReviewCollapsedWords: {
    color: '#d4d4d8',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  videoReviewCollapsedMeta: { color: '#71717a', fontSize: 11, marginBottom: 6 },
  videoReviewMinimizeBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#52525b',
    backgroundColor: '#111',
  },
  videoReviewMinimizeBtnText: { color: '#d4d4d8', fontSize: 13, fontWeight: '600' },
  fieldVideoReviewOromo: { marginBottom: 2 },
  labelVideoReviewCompact: { fontSize: 11, marginBottom: 4, color: '#a1a1aa' },
  inputVideoReviewCompact: { paddingVertical: 8, fontSize: 14 },
  inputReadOnlyBank: { color: '#a1a1aa', opacity: 0.95 },
  row2: { flexDirection: 'row', alignItems: 'flex-start' },
  wordRow: { marginBottom: 10 },
  removeBtn: { marginTop: 8, alignSelf: 'flex-start' },
  removeBtnText: { color: '#f87171', fontSize: 14, fontWeight: '600' },
  addBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#27272a',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  addBtnText: { color: '#fff', fontWeight: '600' },
  matchEmptyBlock: { marginBottom: 8 },
  fillFromExposureBtn: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3f3f46',
    backgroundColor: '#1a1a1c',
  },
  fillFromExposureBtnText: { color: '#e4e4e7', fontSize: 15, fontWeight: '700' },
  fillFromExposureBtnSub: { color: '#71717a', fontSize: 12, marginTop: 6, lineHeight: 16 },
  wordPicker: { marginBottom: 14 },
  wordPicked: { color: '#e4e4e7', fontSize: 14, marginBottom: 8 },
  wordNone: { color: '#71717a', fontSize: 14, marginBottom: 8 },
  wordResults: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  wordResultRow: { paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#27272a' },
  wordResultTextCol: { gap: 2 },
  wordResultTextTop: { color: '#e4e4e7', fontSize: 14, fontWeight: '700' },
  wordResultTextSub: { color: '#a1a1aa', fontSize: 13 },
  matchRightPreviewLabel: { color: '#d4d4d8', fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 6 },
  matchRightPreview: {
    color: '#a1a1aa',
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 10,
  },
  matchSelectedBox: {
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 12,
    backgroundColor: '#111',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  matchSelectedTop: { color: '#e4e4e7', fontSize: 15, fontWeight: '800' },
  matchSelectedSub: { color: '#a1a1aa', fontSize: 13, marginTop: 4, lineHeight: 18 },
  changeWordBtn: { marginTop: 10, alignSelf: 'flex-start' },
  changeWordBtnText: { color: '#a78bfa', fontSize: 14, fontWeight: '700' },
  learnedBlock: { marginTop: 8, marginBottom: 6 },
  learnedList: { marginTop: 8, gap: 8 },
  learnedReadOnlyRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272a',
    backgroundColor: '#111',
  },
  learnedText: { color: '#e4e4e7', fontSize: 14 },
  learnedReadOnlySub: { color: '#a1a1aa', fontSize: 13, marginTop: 4 },
  quizOptionCard: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#27272a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  quizOptionTextCol: { flex: 1, minWidth: 0 },
  quizOptionTop: { color: '#e4e4e7', fontSize: 15, fontWeight: '800' },
  quizOptionSub: { color: '#a1a1aa', fontSize: 13, marginTop: 4, lineHeight: 18 },
  quizOptionAudioHint: { color: '#34c759', fontSize: 11, fontWeight: '600', marginTop: 6 },
  quizOptionRemoveBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#27272a' },
  quizOptionRemoveText: { color: '#f87171', fontSize: 13, fontWeight: '800' },
  quizCorrectBtn: {
    marginTop: 8,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3f3f46',
    backgroundColor: '#18181b',
  },
  quizCorrectBtnLabel: { color: '#d4d4d8', fontSize: 13, fontWeight: '700' },
  quizCorrectBtnValue: { color: '#fff', fontSize: 15, fontWeight: '800', marginTop: 6 },
  quizCorrectOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  quizCorrectSheet: {
    backgroundColor: '#0a0a0a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 14,
  },
  quizCorrectChoice: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272a',
    backgroundColor: '#111',
    marginTop: 10,
  },
  quizCorrectChoiceText: { color: '#e4e4e7', fontSize: 14, fontWeight: '800' },
  quizCorrectChoiceSub: { color: '#a1a1aa', fontSize: 13, marginTop: 4, lineHeight: 18 },
  warningBox: {
    backgroundColor: '#2a1a00',
    borderWidth: 1,
    borderColor: '#a16207',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  warningTitle: { color: '#fbbf24', fontSize: 13, fontWeight: '800', marginBottom: 6 },
  warningBody: { color: '#fde68a', fontSize: 12, lineHeight: 16, marginBottom: 10 },
  convertBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#a16207',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  convertBtnText: { color: '#111', fontWeight: '800' },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  bulletInput: {
    flex: 1,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
  },
  bulletMiniBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletMiniBtnText: { color: '#fff', fontWeight: '800' },
  bulletMiniBtnTextDanger: { color: '#f87171', fontWeight: '900' },
  bulletMiniDisabled: { opacity: 0.35 },
  saveStructured: {
    backgroundColor: '#22c55e',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  saveStructuredTextSave: { color: '#0a0a0a', fontWeight: '800', fontSize: 16 },
  advancedLabel: { color: '#fbbf24', fontSize: 13, fontWeight: '700', marginTop: 8, marginBottom: 8 },
  jsonInput: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: 8,
    padding: 12,
    color: '#e4e4e7',
    fontSize: 12,
    minHeight: 120,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  jsonErr: { color: '#f87171', marginBottom: 8 },
  applyJsonBtn: {
    marginTop: 12,
    backgroundColor: '#7c3aed',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  applyJsonText: { color: '#fff', fontWeight: '700' },
})
