import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import {
  ADMIN_ACCENT_GOLD,
  AdminChevronRight,
  AdminPlusIcon,
  AdminSectionHeader,
} from '../components/lesson-config/AdminLessonConfigChrome'
import { LessonScreenEditModal } from '../components/lesson-editor/LessonScreenEditModal'
import { useAuth } from '../context/AuthContext'
import {
  type LessonContentDraft,
  type LessonScreen,
  type ScreenType,
  SCREEN_TYPE_OPTIONS,
  defaultScreen,
  parseLessonContent,
  sanitizeLessonScreensForSave,
  screenSubtitleLines,
  syncCelebrateScreensWithAudioExposure,
} from '../lib/lessonEditor'
import {
  isLessonStructureFrozen,
  isProfessorLessonEditingAllowed,
  normalizeSeriesStatus,
  type LessonSeriesStatus,
} from '../lib/lessonSeriesStatus'
import supabase from '../lib/supabase'
import { seriesKey, VOICE_BANK_LANGUAGE, wordsBankSeriesLabelFromSeriesId } from '../lib/voiceBankLabels'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'LessonConfigDetail'>

type LessonRecord = {
  id: string
  title: string | null
  series_id: string | null
  lesson_number: number | null
  next_lesson_id: string | null
  content: unknown
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T
}

type ScreenTypeOption = { value: ScreenType; label: string }

/** Alphabetical. Injects `videoReview` if missing (stale Metro bundle / old binary). */
function buildAddScreenOptions(): ScreenTypeOption[] {
  const base = SCREEN_TYPE_OPTIONS.filter((o) => o.value !== 'intro')
  const byValue = new Map<string, ScreenTypeOption>()
  for (const o of base) {
    byValue.set(o.value, o)
  }
  if (!byValue.has('videoReview')) {
    byValue.set('videoReview', { value: 'videoReview', label: 'Video review' })
  }
  return [...byValue.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  )
}

const ADD_SCREEN_OPTIONS = buildAddScreenOptions()

function screenTypeLabel(type: string): string {
  return SCREEN_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type
}

function introScreenIndex(screens: LessonScreen[]): number {
  return screens.findIndex((s) => s.type === 'intro')
}

function getIntroGoal(screens: LessonScreen[]): string {
  const i = introScreenIndex(screens)
  if (i < 0) return ''
  const g = screens[i].content.goal
  return typeof g === 'string' ? g : g != null ? String(g) : ''
}

function setIntroGoalOnDraft(d: LessonContentDraft, goal: string): LessonContentDraft {
  const screens = [...d.screens]
  const i = introScreenIndex(screens)
  if (i < 0) {
    return { ...d, screens: [{ type: 'intro', content: { goal } }, ...screens] }
  }
  const intro = screens[i]
  screens[i] = {
    ...intro,
    content: { ...intro.content, goal },
  }
  return { ...d, screens }
}

function stripNextNavFromLessonContent(obj: Record<string, unknown>): void {
  delete obj.nextLessonId
  delete obj.nextLesson
}

function stripNextNavFromAllScreens(content: Record<string, unknown>): void {
  const screens = content.screens
  if (!Array.isArray(screens)) return
  for (const item of screens) {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) continue
    const c = (item as Record<string, unknown>).content
    if (c == null || typeof c !== 'object' || Array.isArray(c)) continue
    delete (c as Record<string, unknown>).nextLessonId
    delete (c as Record<string, unknown>).nextLesson
  }
}

function isHttpUrl(v: unknown): boolean {
  return typeof v === 'string' && /^https?:\/\//i.test(v.trim())
}

function canonicalWordBankLanguage(v: string): string {
  const s = v.trim()
  if (!s) return VOICE_BANK_LANGUAGE.toLowerCase()
  return s.toLowerCase()
}

type WordBankAudioRow = {
  series?: string | null
  fast_audio_url?: string | null
  slow_audio_url?: string | null
  /** Optional; column may not exist until migration is applied. */
  fast_waveform_envelope?: unknown
  slow_waveform_envelope?: unknown
}

function normalizeEnvelopeArray(v: unknown): number[] | null {
  if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number')) return v as number[]
  if (v != null && typeof v === 'object' && !Array.isArray(v)) {
    const env = (v as { envelope?: unknown }).envelope
    if (Array.isArray(env) && env.length > 0 && env.every((x) => typeof x === 'number')) return env as number[]
  }
  return null
}

async function lookupWordAudioRow(args: {
  seriesId: string
  language: string
  word: string
}): Promise<WordBankAudioRow | null> {
  const word = args.word.trim()
  if (!word) return null

  const canonicalSeries = seriesKey(args.seriesId)
  const language = canonicalWordBankLanguage(args.language)

  const { data, error } = await supabase
    .from('words')
    .select('*')
    .ilike('language', language)
    .ilike('word', word)
    .limit(10)

  if (error || !data || data.length === 0) return null

  const rows = data as WordBankAudioRow[]
  const sameSeries = rows.find((r) => seriesKey(String(r.series ?? '')) === canonicalSeries)
  const pick =
    sameSeries ??
    rows.find((r) => Boolean(r.fast_audio_url?.trim() || r.slow_audio_url?.trim())) ??
    rows[0]
  return pick ?? null
}

/**
 * Hydrate legacy / missing audio refs inside a lesson from the `words` table.
 * This ensures Dubbadhu can play per-word audio even if the editor only stored text.
 */
async function hydrateAudioRefsFromWordBank(content: Record<string, unknown>, seriesId: string | null, language: string): Promise<void> {
  const sid = (seriesId ?? '').trim()
  if (!sid) return
  const lang = canonicalWordBankLanguage(language)

  const screens = content.screens
  if (!Array.isArray(screens) || screens.length === 0) return

  const cache = new Map<string, WordBankAudioRow | null>()
  const getRow = async (text: string): Promise<WordBankAudioRow | null> => {
    const key = text.trim()
    if (!key) return null
    if (cache.has(key)) return cache.get(key) ?? null
    const row = await lookupWordAudioRow({ seriesId: sid, language: lang, word: key })
    cache.set(key, row)
    return row
  }

  const applyWordRowToToken = (wr: Record<string, unknown>, row: WordBankAudioRow | null) => {
    if (!row) return
    const fast = row.fast_audio_url?.trim() || null
    const slow = row.slow_audio_url?.trim() || null
    if (fast) {
      wr.fastAudioRef = fast
      wr.audioRef = fast
    } else if (slow) {
      wr.audioRef = slow
    }
    if (slow) wr.slowAudioRef = slow
    const fe = normalizeEnvelopeArray(row.fast_waveform_envelope)
    const se = normalizeEnvelopeArray(row.slow_waveform_envelope)
    if (fe?.length) wr.waveformEnvelope = fe
    if (se?.length) wr.slowWaveformEnvelope = se
  }

  for (const s of screens) {
    if (s == null || typeof s !== 'object' || Array.isArray(s)) continue
    const sr = s as Record<string, unknown>
    const type = sr.type
    const c = sr.content
    if (c == null || typeof c !== 'object' || Array.isArray(c)) continue
    const cr = c as Record<string, unknown>

    if (type === 'audioExposure') {
      const words = cr.words
      if (Array.isArray(words)) {
        const next = await Promise.all(
          (words as unknown[]).map(async (w) => {
            if (w == null || typeof w !== 'object' || Array.isArray(w)) return w
            const wr = { ...(w as Record<string, unknown>) }
            const text = String(wr.oromo ?? wr.word ?? '').trim()
            const row = text ? await getRow(text) : null
            if (row) applyWordRowToToken(wr, row)
            return wr
          }),
        )
        cr.words = next
      }
      const titleWord = String(cr.word ?? '').trim()
      if (titleWord && !isHttpUrl(cr.audioRef)) {
        const row = await getRow(titleWord)
        if (row?.fast_audio_url?.trim()) cr.audioRef = row.fast_audio_url.trim()
      }
    }

    if (type === 'speakingPractice') {
      const prompt = String(cr.prompt ?? '').trim()
      const expected = String(cr.expectedAnswer ?? '').trim()
      const phrase = String(cr.phrase ?? '').trim()
      const lookupText = prompt && expected ? expected : phrase
      if (lookupText) {
        const wrow = await getRow(lookupText)
        if (wrow) {
          const fast = wrow.fast_audio_url?.trim()
          const slow = wrow.slow_audio_url?.trim()
          if (fast) cr.targetAudioRef = fast
          else if (slow) cr.targetAudioRef = slow
        }
      }
    }
  }
}

async function fetchNextLessonIdInSeries(seriesId: string | null, lessonNumber: number | null): Promise<string | null> {
  if (!seriesId?.trim() || lessonNumber == null || lessonNumber < 1) return null
  const nextNum = lessonNumber + 1
  const { data, error } = await supabase
    .from('lessons')
    .select('id')
    .eq('series_id', seriesId)
    .eq('lesson_number', nextNum)
    .maybeSingle()
  if (error || !data) return null
  return (data as { id: string }).id
}

export default function LessonConfigDetailScreen({ navigation, route }: Props) {
  const { role } = useAuth()
  const { lessonId } = route.params
  const [row, setRow] = useState<LessonRecord | null>(null)
  const [draft, setDraft] = useState<LessonContentDraft | null>(null)
  const [rawJsonMode, setRawJsonMode] = useState(false)
  const [rawJson, setRawJson] = useState('')
  const [parseError, setParseError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [error, setError] = useState('')
  const [pickTypeOpen, setPickTypeOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [viewIndex, setViewIndex] = useState<number | null>(null)
  const [seriesStatus, setSeriesStatus] = useState<LessonSeriesStatus>('draft')

  const unsavedRef = useRef(false)
  const markUnsaved = useCallback(() => {
    unsavedRef.current = true
  }, [])
  const clearUnsaved = useCallback(() => {
    unsavedRef.current = false
  }, [])

  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e) => {
      if (!unsavedRef.current) return
      e.preventDefault()
      Alert.alert(
        'Discard changes?',
        'You have unsaved changes to this lesson.',
        [
          { text: 'Keep editing', style: 'cancel' },
          {
            text: 'Leave without saving',
            style: 'destructive',
            onPress: () => {
              unsavedRef.current = false
              navigation.dispatch(e.data.action)
            },
          },
        ],
      )
    })
    return sub
  }, [navigation])

  const load = useCallback(async () => {
    setError('')
    setParseError('')
    const { data, error: err } = await supabase
      .from('lessons')
      .select('id,title,series_id,lesson_number,next_lesson_id,content')
      .eq('id', lessonId)
      .maybeSingle()

    if (err) {
      setError(err.message)
      setRow(null)
      setDraft(null)
      setLoading(false)
      clearUnsaved()
      return
    }
    const r = data as LessonRecord | null
    setRow(r)
    if (!r) {
      setDraft(null)
      setSeriesStatus('draft')
      setLoading(false)
      clearUnsaved()
      return
    }

    let resolvedSeriesStatus: LessonSeriesStatus = 'draft'
    const sid = (r.series_id ?? '').trim()
    if (sid) {
      const { data: lsRow, error: lsErr } = await supabase
        .from('lesson_series')
        .select('series_status,approved,audio_recorded')
        .eq('id', sid)
        .maybeSingle()
      if (!lsErr && lsRow) {
        const sr = lsRow as {
          series_status?: string | null
          approved?: boolean | null
          audio_recorded?: boolean | null
        }
        const raw = sr.series_status
        if (typeof raw === 'string' && raw.trim()) {
          resolvedSeriesStatus = normalizeSeriesStatus(raw)
        } else if (sr.audio_recorded === true && sr.approved === true) resolvedSeriesStatus = 'complete'
        else if (sr.approved === true) resolvedSeriesStatus = 'approved'
        else resolvedSeriesStatus = 'draft'
      }
    }
    setSeriesStatus(resolvedSeriesStatus)

    const parsed = parseLessonContent(r.content, r.id)
    if (parsed) {
      setDraft(parsed)
      setRawJsonMode(false)
      setRawJson('')
      setParseError('')
    } else {
      setDraft(null)
      setRawJsonMode(true)
      try {
        setRawJson(JSON.stringify(r.content ?? {}, null, 2))
      } catch {
        setRawJson('{}')
      }
      setParseError(
        'This lesson could not be opened in the visual editor (missing screens or unknown shape). You can still edit raw JSON below.',
      )
    }
    setLoading(false)
    clearUnsaved()
  }, [lessonId, clearUnsaved])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  const lessonContentEditable = useMemo(() => {
    if (role === 'professor') return isProfessorLessonEditingAllowed(seriesStatus)
    if (role === 'admin') return !isLessonStructureFrozen(seriesStatus)
    return false
  }, [role, seriesStatus])

  const save = useCallback(async () => {
    if (!row) return
    if (!lessonContentEditable) {
      Alert.alert('View only', 'This lesson cannot be edited while the series is in this status.')
      return
    }
    setSaving(true)
    setError('')
    try {
      let content: Record<string, unknown>
      let title: string

      if (rawJsonMode) {
        const parsed = JSON.parse(rawJson) as unknown
        if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Root must be a JSON object.')
        }
        const d = parseLessonContent(parsed, row.id)
        if (!d) {
          throw new Error('Invalid lesson content: need non-empty screens array with valid screen types.')
        }
        const screensSynced = sanitizeLessonScreensForSave(syncCelebrateScreensWithAudioExposure(d.screens))
        content = stripUndefined({ ...d, id: row.id, screens: screensSynced }) as Record<string, unknown>
        content.series = wordsBankSeriesLabelFromSeriesId(row.series_id ?? '')
        stripNextNavFromLessonContent(content)
        stripNextNavFromAllScreens(content)
        await hydrateAudioRefsFromWordBank(content, row.series_id, VOICE_BANK_LANGUAGE)
        title = typeof (parsed as Record<string, unknown>).title === 'string' ? (parsed as Record<string, unknown>).title as string : row.title ?? row.id
      } else {
        if (!draft) {
          throw new Error('Nothing to save.')
        }
        if (!draft.screens.length) {
          throw new Error('Lesson must have at least one screen.')
        }
        for (const s of draft.screens) {
          if (!s.type || typeof s.content !== 'object' || s.content === null || Array.isArray(s.content)) {
            throw new Error(`Invalid screen: ${s.type}`)
          }
        }
        const merged = stripUndefined({
          ...draft,
          id: row.id,
          title: draft.title.trim() || row.title || row.id,
          series: wordsBankSeriesLabelFromSeriesId(row.series_id ?? ''),
          screens: sanitizeLessonScreensForSave(syncCelebrateScreensWithAudioExposure(draft.screens)),
        }) as Record<string, unknown>
        stripNextNavFromLessonContent(merged)
        stripNextNavFromAllScreens(merged)
        await hydrateAudioRefsFromWordBank(merged, row.series_id, VOICE_BANK_LANGUAGE)
        content = merged
        title = String(merged.title ?? row.title ?? row.id)
      }

      const nextLessonId = await fetchNextLessonIdInSeries(row.series_id, row.lesson_number)

      const { data: updated, error: upErr } = await supabase
        .from('lessons')
        .update({
          title,
          next_lesson_id: nextLessonId,
          content,
        })
        .eq('id', row.id)
        .select('id,title,series_id,lesson_number,next_lesson_id,content')
        .single()

      if (upErr) throw new Error(upErr.message)
      const r = (updated as LessonRecord | null) ?? null
      if (!r) {
        throw new Error('Save failed: no row returned (0 rows updated). Check Supabase RLS/policies for `lessons`.')
      }

      // If the DB overwrote fields (trigger/RLS), surface it immediately.
      const savedTitle = r.title ?? ''
      if (String(savedTitle) !== String(title)) {
        throw new Error(
          `Save did not persist. Database title is still “${savedTitle}” (attempted “${title}”). Check RLS or triggers on public.lessons.`,
        )
      }

      setRow(r)
      if (!rawJsonMode) {
        const pd = parseLessonContent(r.content, row.id)
        if (pd) setDraft(pd)
      } else {
        try {
          setRawJson(JSON.stringify(r.content ?? {}, null, 2))
        } catch {
          setRawJson('{}')
        }
      }
      clearUnsaved()
      setSavedFlash(true)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      Alert.alert('Save failed', msg)
    } finally {
      setSaving(false)
    }
  }, [row, draft, rawJson, rawJsonMode, clearUnsaved, lessonContentEditable])

  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!savedFlash) return
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSavedFlash(false), 1400)
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = null
    }
  }, [savedFlash])

  const screensForList = useMemo(() => {
    if (!draft) return [] as { screen: LessonScreen; originalIndex: number }[]
    return draft.screens
      .map((screen, originalIndex) => ({ screen, originalIndex }))
      .filter(({ screen }) => screen.type !== 'intro')
  }, [draft])

  useLayoutEffect(() => {
    const headerTitle = draft?.title?.trim() || row?.title?.trim() || lessonId
    navigation.setOptions({
      title: headerTitle,
      headerRight: () =>
        lessonContentEditable ? (
          <Pressable onPress={() => void save()} disabled={saving || loading} style={styles.headerSaveBtn} hitSlop={8}>
            <Text style={[styles.headerSaveText, saving && styles.headerSaveDisabled]}>Save</Text>
          </Pressable>
        ) : (
          <Text style={styles.headerViewOnly}>View only</Text>
        ),
    })
  }, [navigation, lessonId, row?.title, draft?.title, save, saving, loading, lessonContentEditable])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#636366" />
      </View>
    )
  }

  if (error && !row) {
    return (
      <View style={styles.screen}>
        <Text style={styles.error}>{error}</Text>
      </View>
    )
  }

  if (!row) {
    return (
      <View style={styles.screen}>
        <Text style={styles.error}>Lesson not found.</Text>
      </View>
    )
  }

  if (rawJsonMode) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {parseError ? <Text style={styles.parseHint}>{parseError}</Text> : null}
        {!lessonContentEditable ? (
          <Text style={styles.viewOnlyBanner}>This series is view-only — switch back when the series is in draft (professor) or before audio complete (admin).</Text>
        ) : null}
        <Text style={styles.meta}>id: {row.id} (locked)</Text>
        <AdminSectionHeader label="Full lesson content (JSON)" emphasis="gold" />
        <TextInput
          style={styles.rawJson}
          multiline
          editable={lessonContentEditable}
          value={rawJson}
          onChangeText={(t) => {
            markUnsaved()
            setRawJson(t)
            setError('')
          }}
          textAlignVertical="top"
        />
        {lessonContentEditable ? (
          <Pressable
            style={styles.tryVisualBtn}
            onPress={() => {
              try {
                const p = JSON.parse(rawJson) as unknown
                const d = parseLessonContent(p, row.id)
                if (d) {
                  markUnsaved()
                  setDraft(d)
                  setRawJsonMode(false)
                  setParseError('')
                } else {
                  Alert.alert('Still invalid', 'Need screens[] with at least one valid screen.')
                }
              } catch {
                Alert.alert('Invalid JSON', 'Fix JSON syntax first.')
              }
            }}
          >
            <Text style={styles.tryVisualText}>Try visual editor again</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    )
  }

  if (!draft) {
    return (
      <View style={styles.screen}>
        <Text style={styles.error}>Could not load editor.</Text>
      </View>
    )
  }

  const moveScreen = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= draft.screens.length) return
    if (draft.screens[idx]?.type === 'intro' || draft.screens[j]?.type === 'intro') return
    markUnsaved()
    setDraft((d) => {
      if (!d) return d
      const next = [...d.screens]
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return { ...d, screens: syncCelebrateScreensWithAudioExposure(next) }
    })
  }

  const removeScreen = (idx: number) => {
    if (draft.screens[idx]?.type === 'intro') {
      Alert.alert('Intro screen', 'The intro is not shown in this list and cannot be removed here.')
      return
    }
    if (draft.screens.length <= 1) {
      Alert.alert('Keep at least one screen.')
      return
    }
    markUnsaved()
    setDraft((d) => {
      if (!d) return d
      return { ...d, screens: syncCelebrateScreensWithAudioExposure(d.screens.filter((_, i) => i !== idx)) }
    })
  }

  const applyScreenEdit = (idx: number, s: LessonScreen) => {
    markUnsaved()
    setDraft((d) => {
      if (!d) return d
      const screens = [...d.screens]
      screens[idx] = s
      return { ...d, screens: syncCelebrateScreensWithAudioExposure(screens) }
    })
  }

  const editingScreen = editingIndex != null ? draft.screens[editingIndex] ?? null : null

  return (
    <View style={styles.flex}>
      {error ? <Text style={styles.bannerError}>{error}</Text> : null}
      {savedFlash ? <Text style={styles.bannerSaved}>Saved</Text> : null}
      <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {!lessonContentEditable ? (
          <Text style={styles.viewOnlyBanner}>
            View only — open this lesson to review screens; editing unlocks when the series allows it.
          </Text>
        ) : null}
        <View style={styles.sectionBlock}>
          <AdminSectionHeader label="Lesson" emphasis="gold" />
          <View style={styles.lessonCard}>
            <Text style={styles.cardFieldLabel}>Title</Text>
            <TextInput
              style={styles.cardInput}
              editable={lessonContentEditable}
              value={draft.title}
              onChangeText={(t) => {
                markUnsaved()
                setDraft({ ...draft, title: t })
              }}
              placeholder="Lesson title"
              placeholderTextColor="#52525b"
            />
          </View>
          <View style={styles.lessonCard}>
            <Text style={styles.cardFieldLabel}>Goal (intro)</Text>
            <TextInput
              style={[styles.cardInput, styles.cardInputMultiline]}
              editable={lessonContentEditable}
              value={getIntroGoal(draft.screens)}
              onChangeText={(t) => {
                markUnsaved()
                setDraft((d) => (d ? setIntroGoalOnDraft(d, t) : d))
              }}
              placeholder="What learners should achieve on the first screen"
              placeholderTextColor="#52525b"
              multiline
              textAlignVertical="top"
            />
            <Text style={styles.cardFieldHint}>Shown on the intro screen; intro is not listed below.</Text>
          </View>
          <Text style={styles.metaRow}>
            <Text style={styles.metaMuted}>Next in app · </Text>
            <Text style={styles.metaGoldHighlight}>
              {row.series_id ?? '—'} · #{row.lesson_number ?? '—'}
            </Text>
            <Text style={styles.metaMuted}> · </Text>
            <Text style={styles.metaLessonId}>{row.id}</Text>
          </Text>
        </View>

        <View style={styles.sectionBlock}>
          <AdminSectionHeader label="Screens" right={`${screensForList.length} total`} emphasis="gold" />
          <View style={styles.screenList}>
            {screensForList.map(({ screen: s, originalIndex: i }, listIdx) => {
              const upDisabled = i === 0 || draft.screens[i - 1]?.type === 'intro'
              const downDisabled =
                i === draft.screens.length - 1 || draft.screens[i + 1]?.type === 'intro'
              const subtitleLines = screenSubtitleLines(s)
              return (
                <View key={`${s.type}-${i}`} style={styles.screenRowCard}>
                  <Pressable
                    style={styles.screenRowMain}
                    onPress={() =>
                      lessonContentEditable ? setEditingIndex(i) : setViewIndex(i)
                    }
                    android_ripple={{ color: '#333' }}
                  >
                    <View style={styles.screenBadge}>
                      <Text style={styles.screenBadgeText}>{listIdx + 1}</Text>
                    </View>
                    <View style={styles.screenRowText}>
                      <Text style={styles.screenRowTitle} numberOfLines={1}>
                        {screenTypeLabel(s.type)}
                      </Text>
                      <Text style={styles.screenRowSubtitle}>
                        {subtitleLines.join('\n')}
                      </Text>
                    </View>
                    <AdminChevronRight size={10} color="#636366" />
                  </Pressable>
                  {lessonContentEditable ? (
                    <View style={styles.screenRowToolbar}>
                      <Pressable
                        style={styles.toolbarBtn}
                        onPress={() => moveScreen(i, -1)}
                        disabled={upDisabled}
                        hitSlop={6}
                      >
                        <Text style={[styles.toolbarBtnText, upDisabled && styles.disabled]}>Up</Text>
                      </Pressable>
                      <Text style={styles.toolbarSep}>·</Text>
                      <Pressable
                        style={styles.toolbarBtn}
                        onPress={() => moveScreen(i, 1)}
                        disabled={downDisabled}
                        hitSlop={6}
                      >
                        <Text style={[styles.toolbarBtnText, downDisabled && styles.disabled]}>Down</Text>
                      </Pressable>
                      <Text style={styles.toolbarSep}>·</Text>
                      <Pressable style={styles.toolbarBtn} onPress={() => removeScreen(i)} hitSlop={6}>
                        <Text style={styles.toolbarDanger}>Remove</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              )
            })}
          </View>

          {lessonContentEditable ? (
            <Pressable
              style={styles.addScreenBtn}
              onPress={() => setPickTypeOpen(true)}
              android_ripple={{ color: '#333' }}
            >
              <AdminPlusIcon size={14} color={ADMIN_ACCENT_GOLD} />
              <Text style={styles.addScreenBtnText}>Add screen</Text>
            </Pressable>
          ) : null}
        </View>

        {lessonContentEditable ? (
          <Pressable
            style={styles.rawModeBtn}
            onPress={() => {
              try {
                setRawJson(JSON.stringify(draft, null, 2))
              } catch {
                setRawJson('{}')
              }
              setRawJsonMode(true)
              setDraft(null)
            }}
          >
            <Text style={styles.rawModeBtnText}>Switch to raw JSON (advanced)</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <Modal visible={pickTypeOpen} animationType="fade" transparent>
        <Pressable style={styles.pickOverlay} onPress={() => setPickTypeOpen(false)}>
          <Pressable style={styles.pickSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickTitle}>Screen type</Text>
            <Text style={styles.pickSubtitle}>Scroll for all types (e.g. Video review before Word breakdown).</Text>
            <ScrollView
              style={styles.pickList}
              contentContainerStyle={styles.pickListContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              nestedScrollEnabled
            >
              {ADD_SCREEN_OPTIONS.map((item) => (
                <Pressable
                  key={item.value}
                  style={styles.pickRow}
                  onPress={() => {
                    markUnsaved()
                    setDraft((d) => {
                      if (!d) return d
                      return {
                        ...d,
                        screens: syncCelebrateScreensWithAudioExposure([
                          ...d.screens,
                          defaultScreen(item.value),
                        ]),
                      }
                    })
                    setPickTypeOpen(false)
                  }}
                >
                  <Text style={styles.pickRowLabel}>{item.label}</Text>
                  <Text style={styles.pickRowValue}>{item.value}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={viewIndex !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setViewIndex(null)}
      >
        <View style={styles.viewScreenModalRoot}>
          <View style={styles.viewScreenModalHeader}>
            <Pressable hitSlop={12} onPress={() => setViewIndex(null)}>
              <Text style={styles.viewScreenModalClose}>Close</Text>
            </Pressable>
            <Text style={styles.viewScreenModalTitle} numberOfLines={1}>
              {viewIndex != null && draft.screens[viewIndex]
                ? screenTypeLabel(draft.screens[viewIndex].type)
                : 'Screen'}
            </Text>
            <View style={{ width: 56 }} />
          </View>
          <ScrollView
            style={styles.viewScreenModalScroll}
            contentContainerStyle={styles.viewScreenModalScrollContent}
          >
            {viewIndex != null && draft.screens[viewIndex] ? (
              <>
                <Text style={styles.viewScreenSummary}>
                  {screenSubtitleLines(draft.screens[viewIndex]).join('\n') ||
                    draft.screens[viewIndex].type}
                </Text>
                <Text style={styles.viewScreenJsonLabel}>Content (JSON)</Text>
                <Text selectable style={styles.viewScreenJson}>
                  {(() => {
                    try {
                      return JSON.stringify(draft.screens[viewIndex].content, null, 2)
                    } catch {
                      return String(draft.screens[viewIndex].content)
                    }
                  })()}
                </Text>
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      <LessonScreenEditModal
        visible={editingIndex !== null}
        screen={editingScreen}
        lessonScreens={draft?.screens ?? []}
        // Needed for Audio exposure → word bank sync + audio availability checks.
        lessonSeries={row?.series_id ?? null}
        lessonContentSeries={
          draft?.series != null && typeof draft.series === 'string' && draft.series.trim()
            ? draft.series.trim()
            : null
        }
        wordBankLanguage={VOICE_BANK_LANGUAGE}
        onClose={() => setEditingIndex(null)}
        onApply={(next) => {
          if (editingIndex === null) return
          applyScreenEdit(editingIndex, next)
          setEditingIndex(null)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  screen: { flex: 1, backgroundColor: '#000' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  sectionBlock: { marginBottom: 8 },
  lessonCard: {
    backgroundColor: '#1c1c1e',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#38383a',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
  },
  cardFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#a1a1aa',
    marginBottom: 6,
  },
  cardFieldHint: {
    fontSize: 11,
    color: '#636366',
    marginTop: 8,
    lineHeight: 15,
  },
  cardInput: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
    padding: 0,
    margin: 0,
  },
  cardInputMultiline: {
    minHeight: 88,
    paddingTop: 2,
  },
  screenList: { gap: 8 },
  screenRowCard: {
    backgroundColor: '#1c1c1e',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#38383a',
    borderRadius: 10,
    overflow: 'hidden',
  },
  screenRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  screenBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212, 175, 55, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: ADMIN_ACCENT_GOLD,
  },
  screenRowText: { flex: 1, minWidth: 0 },
  screenRowTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  screenRowSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: ADMIN_ACCENT_GOLD,
    marginTop: 1,
    lineHeight: 17,
  },
  screenRowToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2c2c2e',
    gap: 6,
  },
  toolbarBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  toolbarBtnText: { fontSize: 12, fontWeight: '500', color: '#a1a1aa' },
  toolbarSep: { fontSize: 12, color: '#3a3a3c' },
  toolbarDanger: { fontSize: 12, fontWeight: '500', color: '#c45c5c' },
  addScreenBtn: {
    width: '100%',
    marginTop: 8,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: 'rgba(212, 175, 55, 0.45)',
    borderRadius: 10,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  addScreenBtnText: { fontSize: 14, color: ADMIN_ACCENT_GOLD, fontWeight: '600' },
  centered: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  error: { color: '#f87171', padding: 16, fontSize: 14 },
  bannerError: { color: '#f87171', paddingHorizontal: 16, paddingTop: 8, fontSize: 13 },
  bannerSaved: { color: '#22c55e', paddingHorizontal: 16, paddingTop: 8, fontSize: 13, fontWeight: '700' },
  parseHint: { color: '#fbbf24', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  meta: { color: '#a1a1aa', fontSize: 14, marginBottom: 8 },
  metaRow: { marginTop: 4, marginBottom: 4, lineHeight: 20 },
  metaMuted: { fontSize: 11, color: '#636366' },
  metaGoldHighlight: { fontSize: 14, fontWeight: '600', color: ADMIN_ACCENT_GOLD },
  metaLessonId: {
    fontSize: 11,
    color: '#636366',
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  disabled: { opacity: 0.35 },
  rawModeBtn: { marginTop: 20, alignSelf: 'center', padding: 12 },
  rawModeBtnText: { color: '#636366', fontSize: 13 },
  rawJson: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: 8,
    padding: 12,
    color: '#e4e4e7',
    minHeight: 320,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 12,
  },
  tryVisualBtn: { marginTop: 16, paddingVertical: 14, alignItems: 'center' },
  tryVisualText: { color: '#a78bfa', fontSize: 16, fontWeight: '700' },
  pickOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  pickSheet: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    paddingBottom: 24,
  },
  pickTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  pickSubtitle: {
    color: '#71717a',
    fontSize: 13,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2c2c2e',
  },
  pickList: { maxHeight: 420 },
  pickListContent: { flexGrow: 1, paddingBottom: 12 },
  pickRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  pickRowLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  pickRowValue: { color: '#71717a', fontSize: 12, marginTop: 4 },
  headerSaveBtn: { marginRight: 12 },
  headerSaveText: { color: '#22c55e', fontSize: 16, fontWeight: '700' },
  headerSaveDisabled: { opacity: 0.4 },
  headerViewOnly: {
    marginRight: 14,
    fontSize: 13,
    fontWeight: '600',
    color: '#71717a',
  },
  viewOnlyBanner: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(113, 113, 122, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3f3f46',
    color: '#a1a1aa',
    fontSize: 13,
    lineHeight: 18,
  },
  viewScreenModalRoot: { flex: 1, backgroundColor: '#0a0a0a' },
  viewScreenModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  viewScreenModalClose: { color: '#a78bfa', fontSize: 16, fontWeight: '600' },
  viewScreenModalTitle: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1, textAlign: 'center' },
  viewScreenModalScroll: { flex: 1 },
  viewScreenModalScrollContent: { padding: 16, paddingBottom: 40 },
  viewScreenSummary: { color: '#d4d4d8', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  viewScreenJsonLabel: { color: '#71717a', fontSize: 12, fontWeight: '600', marginBottom: 8 },
  viewScreenJson: {
    color: '#e4e4e7',
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    lineHeight: 18,
  },
})
