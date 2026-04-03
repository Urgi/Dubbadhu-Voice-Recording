import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import {
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
  normalizeDialogueContent,
  normalizeWordDiscriminationContentForEdit,
} from '../../lib/lessonEditor'
import supabase from '../../lib/supabase'
import type { HarvestedWord } from '../../lib/seedWordsFromLessons'
import {
  buildWordBankLookupLabels,
  fetchWordBankRowForLessonWord,
  harvestWordsFromLessonScreens,
  lookupWordBankRowWithSeriesLabels,
} from '../../lib/seedWordsFromLessons'
import { VOICE_BANK_LANGUAGE, voiceBankLanguageSqlValues } from '../../lib/voiceBankLabels'
import { TranslationMismatchModal } from './TranslationMismatchModal'

/** Public storage bucket for Word discrimination quiz question images (Supabase dashboard). */
const WORD_DISCRIMINATION_IMAGES_BUCKET = 'word-comparison-images'

type Props = {
  visible: boolean
  screen: LessonScreen | null
  /** Same draft as the lesson editor; used to derive Celebrate `learned` from Audio exposure words. */
  lessonScreens?: LessonScreen[]
  /** Optional: series id for word-bank checks from parent (Audio exposure, etc.). */
  lessonSeries?: string | null
  /** Optional: `lesson.content.series` string (e.g. "Mastering Greetings") for `words.series` matching. */
  lessonContentSeries?: string | null
  wordBankLanguage?: string
  onClose: () => void
  onApply: (next: LessonScreen) => void
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

/** Row from `public.words`. Production uses `word` + `translation`; optional fields support alternate schemas. */
type WordBankRow = {
  id: string
  word?: string | null
  oromo?: string | null
  translation?: string | null
  english?: string | null
  slow_audio_url?: string | null
  fast_audio_url?: string | null
}

function rowAfaanText(r: WordBankRow): string {
  return (r.word ?? r.oromo ?? '').trim()
}

function rowTranslationText(r: WordBankRow): string {
  return (r.translation ?? r.english ?? '').trim()
}

/** Dubbadhu quiz `audioRef`: prefer fast recording URL, then slow, when present on `words`. */
function audioRefFromWordRow(row: WordBankRow): string | undefined {
  const fast = row.fast_audio_url?.trim()
  const slow = row.slow_audio_url?.trim()
  return fast || slow || undefined
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

function glossFromWordRow(row: { translation?: string | null; english?: string | null }): string {
  return (row.translation ?? row.english ?? '').trim()
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
    const o = String(item.oromo ?? '').trim()
    const e = String(item.english ?? '').trim()
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
      out[wordIndex] = { ...item, english: databaseTranslation }
    }
  }
  return out
}

function wordLabel(row: WordBankRow): string {
  const a = rowAfaanText(row)
  const b = rowTranslationText(row)
  if (a && b) return `${a} — ${b}`
  return a || b || row.id
}

function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

function screenTypeTitle(type: string): string {
  return SCREEN_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type
}

async function fetchWordBankRows(
  query: string,
  searchMode: 'both' | 'oromo',
): Promise<{ data: WordBankRow[] | null; error: Error | null }> {
  const isUuid = isUuidLike(query)
  const variants = [
    'id,word,translation,slow_audio_url,fast_audio_url',
    'id,oromo,english,slow_audio_url,fast_audio_url',
  ] as const

  let lastMsg = ''
  for (const cols of variants) {
    let q = supabase.from('words').select(cols).limit(25)
    if (isUuid) q = q.eq('id', query)
    else if (searchMode === 'oromo') {
      q = cols.startsWith('id,word') ? q.ilike('word', `%${query}%`) : q.ilike('oromo', `%${query}%`)
    } else {
      q = cols.startsWith('id,word')
        ? q.or(`word.ilike.%${query}%,translation.ilike.%${query}%`)
        : q.or(`oromo.ilike.%${query}%,english.ilike.%${query}%`)
    }

    const res = await q
    if (!res.error) {
      return {
        data: ((res.data as WordBankRow[] | null) ?? []).filter((r) => typeof r?.id === 'string'),
        error: null,
      }
    }
    lastMsg = res.error.message
    if (!/column .* does not exist|Could not find/i.test(res.error.message)) {
      return { data: null, error: new Error(res.error.message) }
    }
  }
  return { data: null, error: new Error(lastMsg || 'words search failed') }
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
      oromo: w,
      translation: h.translation,
      english: h.translation,
    })
  }
  return [...db, ...extra]
}

/** Word bank rows restricted to `words.series` labels (+ language when column exists). */
async function fetchWordBankRowsForSeries(
  query: string,
  searchMode: 'both' | 'oromo',
  seriesLabels: string[],
): Promise<{ data: WordBankRow[] | null; error: Error | null }> {
  if (!seriesLabels.length) return { data: [], error: null }
  const trimmed = query.trim()
  const isUuid = isUuidLike(trimmed)
  const langVals = voiceBankLanguageSqlValues()
  const variants = [
    'id,word,translation,slow_audio_url,fast_audio_url',
    'id,oromo,english,slow_audio_url,fast_audio_url',
  ] as const

  const runVariant = async (
    cols: (typeof variants)[number],
    useLanguage: boolean,
  ): Promise<{ data: WordBankRow[] | null; error: Error | null }> => {
    let q = supabase.from('words').select(cols).in('series', seriesLabels).limit(25)
    if (useLanguage) q = q.in('language', langVals)
    if (isUuid) q = q.eq('id', trimmed)
    else if (searchMode === 'oromo') {
      q = cols.startsWith('id,word') ? q.ilike('word', `%${trimmed}%`) : q.ilike('oromo', `%${trimmed}%`)
    } else {
      q = cols.startsWith('id,word')
        ? q.or(`word.ilike.%${trimmed}%,translation.ilike.%${trimmed}%`)
        : q.or(`oromo.ilike.%${trimmed}%,english.ilike.%${trimmed}%`)
    }
    const res = await q
    if (res.error) return { data: null, error: new Error(res.error.message) }
    return {
      data: ((res.data as WordBankRow[] | null) ?? []).filter((r) => typeof r?.id === 'string'),
      error: null,
    }
  }

  let lastMsg = ''
  for (const cols of variants) {
    for (const useLang of [true, false]) {
      const { data, error } = await runVariant(cols, useLang)
      if (!error && data) {
        return { data, error: null }
      }
      if (error) {
        lastMsg = error.message
        if (
          useLang &&
          /column .* does not exist|Could not find|does not exist|PGRST100/i.test(error.message)
        ) {
          continue
        }
        if (!/column .* does not exist|Could not find|does not exist|PGRST100/i.test(error.message)) {
          return { data: null, error }
        }
      }
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
        const { data, error } = await fetchWordBankRowsForSeries(query, 'oromo', seriesLabels)
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
                <Text style={styles.wordResultTextTop}>{rowAfaanText(r) || r.id}</Text>
                {rowTranslationText(r) ? (
                  <Text style={styles.wordResultTextSub}>{rowTranslationText(r)}</Text>
                ) : null}
                {r.id.startsWith(LESSON_PICK_ID_PREFIX) ? (
                  <Text style={[styles.hint, { marginTop: 4 }]}>From this lesson (add to word bank to sync series)</Text>
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

      <Modal visible={requestOpen} transparent animationType="fade" onRequestClose={() => setRequestOpen(false)}>
        <Pressable style={styles.quizCorrectOverlay} onPress={() => setRequestOpen(false)}>
          <Pressable style={styles.quizCorrectSheet} onPress={() => {}}>
            <Text style={styles.personTitle}>Request new image</Text>
            <Text style={styles.hint}>
              Describe the image for your team to add in Storage. Learners see this text until an image is set.
            </Text>
            <TextInput
              style={[styles.input, { minHeight: 88, textAlignVertical: 'top' }]}
              value={requestDraft}
              onChangeText={setRequestDraft}
              placeholder="e.g. Older woman smiling, outdoor setting…"
              placeholderTextColor="#52525b"
              multiline
            />
            <Pressable
              style={styles.addBtn}
              onPress={() => {
                const t = requestDraft.trim()
                if (!t) return
                applyScenePatch({ image: '', imageRequestDescription: t })
                setRequestOpen(false)
              }}
            >
              <Text style={styles.addBtnText}>Save request</Text>
            </Pressable>
            <Pressable style={styles.removeBtn} onPress={() => setRequestOpen(false)}>
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
}: {
  content: Record<string, unknown>
  setContent: (patch: Record<string, unknown> | ((cur: Record<string, unknown>) => Record<string, unknown>)) => void
  lessonScreens: LessonScreen[]
  lessonSeries: string | null
  lessonContentSeries: string | null
  saveStructured: (c: Record<string, unknown>) => void
  draftRef: MutableRefObject<LessonScreen | null>
  setJsonError: (s: string) => void
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
      <SaveRow
        onPress={() => {
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
        }}
      />
    </View>
  )
}

function WordBankPicker({
  label,
  value,
  onPick,
  placeholder = 'Search word bank…',
  searchMode = 'both',
}: {
  label: string
  value: WordBankRow | null
  onPick: (row: WordBankRow) => void
  placeholder?: string
  searchMode?: 'both' | 'oromo'
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
        const isUuid = isUuidLike(query)
        const base = supabase
          .from('words')
          .select('id,word,translation,slow_audio_url,fast_audio_url')
          .limit(25)
        const res = isUuid
          ? await base.eq('id', query)
          : searchMode === 'oromo'
            ? await base.ilike('word', `%${query}%`)
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
  }, [q, searchMode])

  return (
    <View style={styles.wordPicker}>
      <Text style={styles.label}>{label}</Text>
      {value ? <Text style={styles.wordPicked}>{wordLabel(value)}</Text> : <Text style={styles.wordNone}>None</Text>}
      <TextInput
        style={styles.input}
        value={q}
        onChangeText={setQ}
        placeholder={placeholder}
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
                <Text style={styles.wordResultTextTop}>{rowAfaanText(r) || r.id}</Text>
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
}: {
  value: string
  onChangeText: (t: string) => void
  onPickFromBank: (row: WordBankRow) => void
}) {
  const [rows, setRows] = useState<WordBankRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [suggestOpen, setSuggestOpen] = useState(false)
  const lastReq = useRef(0)

  useEffect(() => {
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
        const { data, error } = await fetchWordBankRows(query, 'oromo')
        if (reqId !== lastReq.current) return
        setLoading(false)
        if (error || data == null) {
          setErr(error?.message ?? 'Search failed')
          setRows([])
          return
        }
        setErr('')
        setRows(data)
      })()
    }, 250)
    return () => clearTimeout(t)
  }, [value])

  return (
    <View style={styles.field}>
      <Text style={styles.label}>Afaan Oromo</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setSuggestOpen(true)}
        onBlur={() => {
          setTimeout(() => setSuggestOpen(false), 220)
        }}
        placeholder="Type or search the word bank (2+ letters show matches)"
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
              onPressIn={() => {
                onPickFromBank(r)
                setSuggestOpen(false)
                setRows([])
              }}
            >
              <View style={styles.wordResultTextCol}>
                <Text style={styles.wordResultTextTop}>{rowAfaanText(r) || r.id}</Text>
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

export function LessonScreenEditModal({
  visible,
  screen,
  lessonScreens = [],
  lessonSeries = null,
  lessonContentSeries = null,
  wordBankLanguage = VOICE_BANK_LANGUAGE,
  onClose: onCloseFromParent,
  onApply,
}: Props) {
  const [draft, setDraft] = useState<LessonScreen | null>(null)
  const [jsonFallback, setJsonFallback] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [quizCorrectOpen, setQuizCorrectOpen] = useState(false)
  const [patternCorrectOpen, setPatternCorrectOpen] = useState(false)
  const draftRef = useRef<LessonScreen | null>(null)
  draftRef.current = draft
  const visibleRef = useRef(visible)
  visibleRef.current = visible
  const baselineScreenRef = useRef<LessonScreen | null>(null)
  const baselineJsonTextRef = useRef('')

  useEffect(() => {
    if (visible && screen) {
      let c = cloneScreen(screen)
      if (c.type === 'dialogue') {
        c = {
          ...c,
          content: normalizeDialogueContent(c.content as Record<string, unknown>),
        }
      }
      if (c.type === 'wordDiscriminationQuiz') {
        c = {
          ...c,
          content: normalizeWordDiscriminationContentForEdit(c.content as Record<string, unknown>),
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
    }
  }, [visible, screen])

  const requestClose = useCallback(() => {
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
    if (!modalContentDirty(draft, jsonFallback, b, baselineJsonTextRef.current)) {
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
  }, [visible, screen, draft, jsonFallback, onCloseFromParent])

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
      const content =
        d.type === 'dialogue' ? normalizeDialogueContent(parsed) : parsed
      onApply({ type: d.type, content })
      onCloseFromParent()
    } catch {
      setJsonError('Invalid JSON.')
    }
  }

  const saveStructured = (content: Record<string, unknown>) => {
    const d = draftRef.current
    if (!d) return
    const payload =
      d.type === 'dialogue' ? normalizeDialogueContent(content) : content
    onApply({ type: d.type, content: payload })
    onCloseFromParent()
  }

  const structuredForm = () => {
    const c = draft.content
    /** Functional updates avoid stale `draft`/`c` when typing quickly across fields (e.g. Audio exposure). */
    const setContent = (
      patch: Record<string, unknown> | ((cur: Record<string, unknown>) => Record<string, unknown>),
    ) => {
      setDraft((d) => {
        if (!d) return null
        const curContent = d.content as Record<string, unknown>
        const next = typeof patch === 'function' ? patch(curContent) : patch
        return { ...d, content: next }
      })
    }

    switch (draft.type) {
      case 'intro':
        return (
          <View style={styles.form}>
            <Field label="Goal" value={String(c.goal ?? '')} onChangeText={(t) => setContent((cur) => ({ ...cur, goal: t }))} />
            <Field label="Heading (optional)" value={String(c.heading ?? '')} onChangeText={(t) => setContent((cur) => ({ ...cur, heading: t }))} />
            <Field label="Body (optional)" value={String(c.body ?? '')} multiline onChangeText={(t) => setContent((cur) => ({ ...cur, body: t }))} />
            <SaveRow
              onPress={() => {
                const d = draftRef.current
                if (!d) return
                const next = { ...(d.content as Record<string, unknown>) }
                if (typeof next.goal !== 'string') next.goal = String(next.goal ?? '')
                saveStructured(next)
              }}
            />
          </View>
        )
      case 'concept': {
        const bulletsArr = Array.isArray(c.bullets) ? (c.bullets as string[]) : null
        const hasLegacySections = Array.isArray(c.sections)
        const isBulletsFormat = Array.isArray(bulletsArr)
        const bullets = isBulletsFormat ? bulletsArr : ['']
        const setBullets = (next: string[]) => setContent((cur) => ({ ...cur, bullets: next }))

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

        const addBullet = () => setBullets([...bullets, ''])

        const convertLegacyToBullets = () => {
          const parts: string[] = []
          if (typeof c.heading === 'string') parts.push(c.heading)
          if (typeof c.title === 'string' && !parts.length) parts.push(c.title)
          const heading = parts[0] ?? 'Concept'

          const sections = Array.isArray(c.sections) ? (c.sections as Record<string, unknown>[]) : []
          const converted = sections
            .map((s) => {
              const t = typeof s.title === 'string' ? s.title : ''
              const body = typeof s.content === 'string' ? s.content : typeof s.text === 'string' ? s.text : ''
              const both = [t, body].filter(Boolean).join(' — ')
              return both.trim()
            })
            .filter(Boolean)

          setContent((cur) => ({
            ...cur,
            heading,
            bullets: converted.length ? converted : [''],
            note: typeof cur.note === 'string' ? cur.note : undefined,
          }))
        }

        return (
          <View style={styles.form}>
            {!isBulletsFormat && hasLegacySections ? (
              <View style={styles.warningBox}>
                <Text style={styles.warningTitle}>This concept uses an older format (sections[])</Text>
                <Text style={styles.warningBody}>
                  The visual editor expects bullets format. You can convert it (and still edit JSON below if needed).
                </Text>
                <Pressable style={styles.convertBtn} onPress={convertLegacyToBullets}>
                  <Text style={styles.convertBtnText}>Convert to bullets format</Text>
                </Pressable>
              </View>
            ) : null}

            <Field
              label="Heading"
              value={String(c.heading ?? c.title ?? '')}
              onChangeText={(t) => setContent((cur) => ({ ...cur, heading: t, title: t }))}
            />
            <Text style={styles.label}>Bullets</Text>
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
            <Pressable style={styles.addBtn} onPress={addBullet}>
              <Text style={styles.addBtnText}>+ Add bullet</Text>
            </Pressable>
            <Field label="Note (optional)" value={String(c.note ?? '')} multiline onChangeText={(t) => setContent((cur) => ({ ...cur, note: t }))} />
            <SaveRow
              onPress={() => {
                const cleaned = bullets.map((x) => String(x ?? '').trim()).filter(Boolean)
                if (cleaned.length < 1) {
                  setJsonError('Concept needs at least 1 bullet.')
                  return
                }
                setJsonError('')
                saveStructured({ ...draft.content, bullets: cleaned })
              }}
            />
          </View>
        )
      }
      case 'dialogue': {
        const nc = normalizeDialogueContent(c)
        const dd = (nc.dialogueData as Record<string, unknown>) ?? {}
        const people = (dd.people as Record<string, unknown>[]) ?? []
        const updatePerson = (i: number, patch: Record<string, unknown>) => {
          setContent((cur) => {
            const normalized = normalizeDialogueContent(cur)
            const d2 = (normalized.dialogueData as Record<string, unknown>) ?? {}
            const ppl = (d2.people as Record<string, unknown>[]) ?? []
            const next = ppl.map((p, j) => (j === i ? { ...p, ...patch } : p))
            return { ...cur, dialogueData: { ...d2, people: next } }
          })
        }
        return (
          <View style={styles.form}>
            <Text style={styles.hint}>Dialogue uses two speakers (fixed).</Text>
            {people.map((p, i) => (
              <View key={i} style={styles.personCard}>
                <Text style={styles.personTitle}>Speaker {i + 1}</Text>
                <Field
                  label="Name"
                  value={String(p.name ?? '')}
                  onChangeText={(t) => updatePerson(i, { name: t })}
                />
                <Field
                  label="Lines (one per line)"
                  value={Array.isArray(p.lines) ? (p.lines as string[]).join('\n') : ''}
                  multiline
                  onChangeText={(t) =>
                    updatePerson(i, {
                      lines: t.split('\n').length ? t.split('\n') : [''],
                    })
                  }
                />
                <Field
                  label="Translations (optional, one per line)"
                  value={Array.isArray(p.translations) ? (p.translations as string[]).join('\n') : ''}
                  multiline
                  onChangeText={(t) =>
                    updatePerson(i, {
                      translations: t.split('\n').length ? t.split('\n') : [''],
                    })
                  }
                />
              </View>
            ))}
            <SaveRow onPress={() => saveStructured({ ...draft.content })} />
          </View>
        )
      }
      case 'match': {
        let pairs = (c.pairs as Record<string, unknown>[] | undefined) ?? []
        if (!Array.isArray(pairs)) pairs = []
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
                                  left: rowAfaanText(row),
                                  right: rowTranslationText(row),
                                }
                              : x,
                          )
                          return { ...cur, pairs: next }
                        })
                      }}
                      placeholder="Search Oromo word…"
                      searchMode="oromo"
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
            <SaveRow
              onPress={() => {
                setJsonError('')
                const d = draftRef.current
                if (!d) return
                const content = d.content as Record<string, unknown>
                const pr = content.pairs
                if (!Array.isArray(pr) || pr.length === 0) {
                  setJsonError('Match screen needs at least one pair. Add a pair first (or paste JSON and Apply JSON & close).')
                  return
                }
                saveStructured(content)
              }}
            />
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
                      text: rowAfaanText(row),
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
              searchMode="oromo"
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
            <SaveRow
              onPress={() =>
                saveStructured(quizContentWithAudioOptionsFlag({ ...(draft.content as Record<string, unknown>) }))
              }
            />

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
      case 'speakingPractice':
        return (
          <View style={styles.form}>
            {String(c.prompt ?? c.phrase ?? '').trim() ? (
              <View style={styles.matchSelectedBox}>
                <Text style={styles.matchSelectedTop}>{String(c.prompt ?? c.phrase ?? '').trim()}</Text>
                <Text style={styles.matchSelectedSub}>{String(c.expectedAnswer ?? c.phraseEnglish ?? '').trim() || '—'}</Text>
                <Pressable
                  style={styles.changeWordBtn}
                  onPress={() => {
                    setContent((cur) => {
                      const next = {
                        ...cur,
                        speaking_word_id: null,
                        prompt: '',
                        phrase: '',
                        expectedAnswer: '',
                        phraseEnglish: '',
                      }
                      delete (next as Record<string, unknown>).targetAudioRef
                      return next
                    })
                  }}
                >
                  <Text style={styles.changeWordBtnText}>Change word</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <WordBankPicker
                  label="Word (Oromo)"
                  value={null}
                  onPick={(row) => {
                    setContent((cur) => {
                      const ref = audioRefFromWordRow(row)
                      const next: Record<string, unknown> = {
                        ...cur,
                        speaking_word_id: row.id,
                        prompt: rowAfaanText(row),
                        phrase: rowAfaanText(row),
                        expectedAnswer: rowTranslationText(row),
                        phraseEnglish: rowTranslationText(row),
                      }
                      if (ref) next.targetAudioRef = ref
                      else delete next.targetAudioRef
                      return next
                    })
                  }}
                  placeholder="Search Oromo word…"
                  searchMode="oromo"
                />
                <Text style={styles.matchRightPreviewLabel}>Translation (English)</Text>
                <Text style={styles.matchRightPreview}>—</Text>
              </>
            )}
            <Field
              label="Hint (optional)"
              value={String(c.hint ?? c.tip ?? '')}
              onChangeText={(t) => setContent((cur) => ({ ...cur, hint: t, tip: t }))}
            />
            <SaveRow
              onPress={() => {
                const d = draftRef.current
                if (!d) return
                const content = { ...(d.content as Record<string, unknown>) }
                delete content.showAnswerAfterRecording
                saveStructured(content)
              }}
            />
          </View>
        )
      case 'audioExposure': {
        let words = (c.words as Record<string, unknown>[] | undefined) ?? []
        if (!Array.isArray(words)) words = []
        return (
          <View style={styles.form}>
            {words.length === 0 ? (
              <Text style={styles.hint}>
                No words yet. Remove the last word to start fresh, then use + Add word. Save requires at least one word (or use
                Apply JSON & close).
              </Text>
            ) : null}
            {words.length ? (
              <Text style={styles.hint}>
                In Afaan Oromo, type two or more letters to see word-bank matches under the field. Tap a match to fill
                translation and audio, or keep typing a custom phrase.
              </Text>
            ) : null}
            {words.map((w, i) => (
              <View key={i} style={styles.pairCard}>
                <Text style={styles.personTitle}>Word {i + 1}</Text>
                <AudioExposureOromoField
                  value={String(w.oromo ?? '')}
                  onChangeText={(t) => {
                    setContent((cur) => {
                      const ws = (cur.words as Record<string, unknown>[]) ?? []
                      const next = ws.map((x, j) => (j === i ? { ...x, oromo: t } : x))
                      return { ...cur, words: next }
                    })
                  }}
                  onPickFromBank={(row) => {
                    setContent((cur) => {
                      const ws = (cur.words as Record<string, unknown>[]) ?? []
                      const ar = audioRefFromWordRow(row)
                      const next = ws.map((x, j) => {
                        if (j !== i) return x
                        const item: Record<string, unknown> = {
                          ...(x as Record<string, unknown>),
                          word_id: row.id,
                          oromo: rowAfaanText(row),
                          english: rowTranslationText(row),
                        }
                        if (ar) item.audioRef = ar
                        else delete item.audioRef
                        return item
                      })
                      return { ...cur, words: next }
                    })
                  }}
                />
                <Field label="Translation" value={String(w.english ?? '')} onChangeText={(t) => {
                  setContent((cur) => {
                    const ws = (cur.words as Record<string, unknown>[]) ?? []
                    const next = ws.map((x, j) => (j === i ? { ...x, english: t } : x))
                    return { ...cur, words: next }
                  })
                }} />
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
                  return { ...cur, words: [...ws, { oromo: '', english: '' }] }
                })
              }
            >
              <Text style={styles.addBtnText}>+ Add word</Text>
            </Pressable>
            <SaveRow
              onPress={() => {
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
                      setJsonError('Audio exposure needs at least one word. Add a word or use Apply JSON & close.')
                      return
                    }
                    // Match `words.series` to lesson_series id, slug, title, AND lesson JSON `content.series`
                    // (e.g. "Mastering Greetings") so lookups work even when `lessons.series_id` is missing.
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
              }}
            />
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
            <SaveRow
              onPress={() => {
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
              }}
            />
          </View>
        )
      }
      case 'animatedConcept': {
        const bullets = Array.isArray(c.bullets) ? (c.bullets as string[]) : ['']
        const limited = bullets.slice(0, 3)
        const setBullets = (next: string[]) => setContent((cur) => ({ ...cur, bullets: next.slice(0, 3) }))
        return (
          <View style={styles.form}>
            <Field label="Target word" value={String(c.targetWord ?? '')} onChangeText={(t) => setContent((cur) => ({ ...cur, targetWord: t }))} />
            <Text style={styles.label}>Bullets (max 3)</Text>
            {limited.map((b, i) => (
              <View key={i} style={styles.bulletRow}>
                <TextInput
                  style={styles.bulletInput}
                  value={String(b ?? '')}
                  onChangeText={(t) => {
                    const next = limited.map((x, j) => (j === i ? t : x))
                    setBullets(next)
                  }}
                  placeholder={`Bullet ${i + 1}`}
                  placeholderTextColor="#52525b"
                />
                <Pressable
                  style={styles.bulletMiniBtn}
                  onPress={() => {
                    if (limited.length <= 1) return
                    setBullets(limited.filter((_, j) => j !== i))
                  }}
                  disabled={limited.length <= 1}
                >
                  <Text
                    style={[
                      styles.bulletMiniBtnTextDanger,
                      limited.length <= 1 && styles.bulletMiniDisabled,
                    ]}
                  >
                    ✕
                  </Text>
                </Pressable>
              </View>
            ))}
            {limited.length < 3 ? (
              <Pressable style={styles.addBtn} onPress={() => setBullets([...limited, ''])}>
                <Text style={styles.addBtnText}>+ Add bullet</Text>
              </Pressable>
            ) : (
              <Text style={styles.hint}>Only the first 3 bullets display in the app.</Text>
            )}
            <SaveRow
              onPress={() => {
                const cleaned = limited.map((x) => String(x ?? '').trim()).filter(Boolean)
                if (cleaned.length < 1) {
                  setJsonError('Animated concept needs at least 1 bullet.')
                  return
                }
                setJsonError('')
                saveStructured({ ...draft.content, bullets: cleaned })
              }}
            />
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
                const text = rowAfaanText(row)
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
              searchMode="oromo"
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
            <SaveRow
              onPress={() => {
                setJsonError('')
                const d = draftRef.current
                if (!d) return
                const content = { ...(d.content as Record<string, unknown>) }
                const ex = (content.exercises as Record<string, unknown>[] | undefined) ?? []
                const e0 = ex[0] as Record<string, unknown> | undefined    
                const opts = Array.isArray(e0?.options)
                  ? (e0.options as unknown[]).map(patternOptionString).filter(Boolean)
                  : []
                if (opts.length < 2) {
                  setJsonError('Pattern practice needs at least 2 options.')
                  return
                }
                const cs = String(e0?.correctSuffix ?? '').trim()
                if (!opts.includes(cs)) {
                  setJsonError('Correct answer must be one of the options.')
                  return
                }
                saveStructured(content)
              }}
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
      case 'wordDiscriminationQuiz': {
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
          />
        )
      }
      default:
        return null
    }
  }

  const hasStructured = [
    'intro',
    'concept',
    'dialogue',
    'match',
    'quiz',
    'speakingPractice',
    'audioExposure',
    'CelebrateScreen',
    'animatedConcept',
    'patternPractice',
    'wordDiscriminationQuiz',
  ].includes(draft.type)

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={requestClose}>
      <View style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <Pressable onPress={requestClose} hitSlop={12}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.modalTitle} numberOfLines={1}>
            {screenTypeTitle(draft.type)}
          </Text>
          <View style={{ width: 56 }} />
        </View>
        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.screenHeader}>
            <Text style={styles.screenHeaderTitle}>{screenTypeTitle(draft.type)}</Text>
            <Text style={styles.screenHeaderSubtitle}>
              Adjust inputs below to modify/create screen.
            </Text>
          </View>
          {hasStructured ? (
            structuredForm()
          ) : (
            <Text style={styles.hint}>No simple form for this type yet — edit JSON below.</Text>
          )}
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
    </Modal>
  )
}

function Field(props: {
  label: string
  value: string
  onChangeText: (t: string) => void
  multiline?: boolean
  keyboardType?: 'default' | 'number-pad'
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={[styles.input, props.multiline && styles.inputMulti]}
        value={props.value}
        onChangeText={props.onChangeText}
        multiline={props.multiline}
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

function SaveRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.saveStructured} onPress={onPress}>
      <Text style={styles.saveStructuredTextSave}>Save screen</Text>
    </Pressable>
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
  modalTitle: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1, textAlign: 'center' },
  modalScroll: { flex: 1 },
  modalScrollContent: { padding: 16, paddingBottom: 40 },
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
