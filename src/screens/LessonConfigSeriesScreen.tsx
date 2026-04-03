import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
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
import { Swipeable } from 'react-native-gesture-handler'
import {
  ADMIN_ACCENT_GOLD,
  AdminChevronRight,
  AdminPlusIcon,
  AdminSectionHeader,
  AdminSeriesScriptCard,
} from '../components/lesson-config/AdminLessonConfigChrome'
import { defaultScreen } from '../lib/lessonEditor'
import { useAuth } from '../context/AuthContext'
import {
  isLessonStructureFrozen,
  isProfessorLessonEditingAllowed,
  legacyFlagsFromSeriesStatus,
  normalizeSeriesStatus,
  seriesStatusLabel,
  type LessonSeriesStatus,
} from '../lib/lessonSeriesStatus'
import {
  buildSeriesWordBankReviewSummary,
  fetchSeriesWordsVaProgress,
  seedWordsFromSeriesLessons,
  type SeriesWordBankReviewSummary,
  type SeriesWordsVaProgress,
} from '../lib/seedWordsFromLessons'
import supabase from '../lib/supabase'
import { VOICE_BANK_LANGUAGE, wordsBankSeriesLabelFromSeriesId } from '../lib/voiceBankLabels'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'LessonConfigSeries'>

type LessonRow = {
  id: string
  title: string | null
  series_id: string | null
  lesson_number: number | null
}

const SCRIPT_CARD_SUBTITLE_FALLBACK = 'docs/admin-lesson-editing-spec.schema.json'

const RLS_LESSON_SERIES_HINT =
  '\n\nThe app uses the Supabase anon key. If RLS is enabled on lesson_series, run sql/lesson_series_rls_for_lesson_config.sql in the Supabase SQL Editor.'

function withLessonSeriesRlsHint(message: string): string {
  if (/row-level security|permission denied for table|RLS/i.test(message)) {
    return message + RLS_LESSON_SERIES_HINT
  }
  return message
}

function scriptCardSubtitle(stored: string | null | undefined): string {
  const t = stored?.trim() ?? ''
  if (!t) return SCRIPT_CARD_SUBTITLE_FALLBACK
  const line = t.split(/\r?\n/).find((l) => l.trim()) ?? t
  const one = line.trim()
  return one.length > 80 ? `${one.slice(0, 80)}…` : one
}

function newLessonRowId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `lesson-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function withLessonsRlsHint(message: string): string {
  if (/row-level security|permission denied/i.test(message)) {
    return `${message}\n\nIf lessons has RLS, run sql/lessons_delete_rls_optional.sql in the Supabase SQL Editor.`
  }
  return message
}

export default function LessonConfigSeriesScreen({ navigation, route }: Props) {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const isProfessor = role === 'professor'

  const { seriesId } = route.params
  const [lessons, setLessons] = useState<LessonRow[]>([])
  const [seriesTitle, setSeriesTitle] = useState<string>(seriesId)
  const [introScript, setIntroScript] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [scriptModalOpen, setScriptModalOpen] = useState(false)
  const [scriptDraft, setScriptDraft] = useState('')
  const [scriptSaving, setScriptSaving] = useState(false)
  const [seriesStatus, setSeriesStatus] = useState<LessonSeriesStatus>('draft')
  const [seriesStatusSaving, setSeriesStatusSaving] = useState(false)
  const [vaSyncing, setVaSyncing] = useState(false)
  /** False when there is no `lesson_series` row for this id (e.g. only lessons reference it). */
  const [lessonSeriesRowExists, setLessonSeriesRowExists] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [addLessonOpen, setAddLessonOpen] = useState(false)
  const [newLessonTitle, setNewLessonTitle] = useState('')
  const [addLessonSaving, setAddLessonSaving] = useState(false)
  const [vaProgress, setVaProgress] = useState<SeriesWordsVaProgress | null>(null)
  /** Admin-only: what approving will insert or patch in `words` (from lesson JSON vs DB). */
  const [wordBankReview, setWordBankReview] = useState<SeriesWordBankReviewSummary | null>(null)
  const lessonSwipeRefs = useRef<Record<string, Swipeable | null>>({})

  const nextLessonNumber = useMemo(() => {
    let max = 0
    for (const L of lessons) {
      const n = L.lesson_number
      if (typeof n === 'number' && n > max) max = n
    }
    return max + 1
  }, [lessons])

  const audioStatusSubtitle = useMemo(() => {
    if (!lessonSeriesRowExists) return 'Requires a lesson_series row for this id.'
    if (seriesStatus === 'admin_draft') {
      return 'Admin draft — promote curriculum to add pending words for the voice queue, then mark audio complete when recording is done.'
    }
    if (seriesStatus === 'draft' || seriesStatus === 'submitted') {
      return 'Available after admin approves curriculum (pending words appear in the voice queue).'
    }
    if (seriesStatus === 'published') {
      return 'Published — this series status is locked.'
    }
    if (!vaProgress || vaProgress.totalLessonWords === 0) {
      return 'Add vocabulary in lessons (audio exposure / celebrate) so we can detect when all VA audio is done.'
    }
    if (!vaProgress.allLessonWordsInVoiceBank) {
      return 'Not all lesson batch words are in this voice-bank series yet — approve curriculum (or re-open this screen after lesson edits) to add pending rows.'
    }
    if (vaProgress.needRecording > 0) {
      return `${vaProgress.needRecording} word${
        vaProgress.needRecording === 1 ? '' : 's'
      } in this batch still need recording (pending or re-record).`
    }
    if (seriesStatus === 'complete') {
      return 'Audio approved — run npm run series:pull in the Dubbadhu app repo to publish to the learner bundle.'
    }
    return 'When all batch words are recorded or approved, an admin can tap Mark audio complete below.'
  }, [lessonSeriesRowExists, seriesStatus, vaProgress])

  const structureFrozen = useMemo(() => {
    if (isProfessor) return !isProfessorLessonEditingAllowed(seriesStatus)
    return isLessonStructureFrozen(seriesStatus)
  }, [isProfessor, seriesStatus])

  const scriptEditable = useMemo(() => {
    if (seriesStatus === 'published') return false
    if (isProfessor) return seriesStatus === 'draft'
    if (isAdmin) return true
    return true
  }, [isAdmin, isProfessor, seriesStatus])

  const canAdminApproveCurriculum =
    isAdmin && lessonSeriesRowExists && (seriesStatus === 'submitted' || seriesStatus === 'admin_draft')

  const showAdminPipeline =
    isAdmin && lessonSeriesRowExists && seriesStatus !== 'published' && seriesStatus !== 'draft'

  const showProfessorWorkflow =
    isProfessor && lessonSeriesRowExists && seriesStatus !== 'published'

  const canMarkAudioComplete =
    isAdmin &&
    lessonSeriesRowExists &&
    seriesStatus === 'approved' &&
    vaProgress != null &&
    vaProgress.allLessonWordsInVoiceBank &&
    vaProgress.totalLessonWords > 0 &&
    vaProgress.needRecording === 0

  const seriesStatusExplainer = useMemo(() => {
    if (!lessonSeriesRowExists) {
      return 'Add a row in lesson_series for this series id (e.g. via Add series) to drive status below.'
    }
    if (isProfessor) {
      if (seriesStatus === 'draft') return 'Edit lessons and script below, then submit for admin review.'
      if (seriesStatus === 'submitted') {
        return 'Submitted. Withdraw to edit again, or wait for admin to approve curriculum.'
      }
      return 'View only. Admin owns curriculum and audio workflow for this series now.'
    }
    return 'Handle submitted series or admin drafts: approve curriculum to create pending words for the voice queue, then mark audio complete when recording is done. After complete, run npm run series:pull in the Dubbadhu repo to publish.'
  }, [lessonSeriesRowExists, isProfessor, seriesStatus])

  const adminApproveLabel = 'Approve Series'

  const load = useCallback(async () => {
    setError('')
    try {
      const { data: seriesRow, error: seriesErr } = await supabase
        .from('lesson_series')
        .select('title,intro_script,approved,audio_recorded,series_status')
        .eq('id', seriesId)
        .maybeSingle()

      let resolvedStatus: LessonSeriesStatus = 'draft'
      let hasLessonSeriesRow = false

      if (seriesErr) {
        setError(seriesErr.message)
      } else if (seriesRow) {
        hasLessonSeriesRow = true
        setLessonSeriesRowExists(true)
        const sr = seriesRow as {
          title?: string | null
          intro_script?: string | null
          approved?: boolean | null
          audio_recorded?: boolean | null
          series_status?: string | null
        }
        if (typeof sr.title === 'string') setSeriesTitle(sr.title)
        setIntroScript(typeof sr.intro_script === 'string' ? sr.intro_script : null)
        const lsRaw = sr.series_status
        if (typeof lsRaw === 'string' && lsRaw.trim()) {
          resolvedStatus = normalizeSeriesStatus(lsRaw)
        } else {
          if (sr.audio_recorded === true && sr.approved === true) resolvedStatus = 'complete'
          else if (sr.approved === true) resolvedStatus = 'approved'
          else resolvedStatus = 'draft'
        }
        setSeriesStatus(resolvedStatus)
      } else {
        setLessonSeriesRowExists(false)
        setIntroScript(null)
        resolvedStatus = 'draft'
        setSeriesStatus('draft')
      }

      const { data, error: err } = await supabase
        .from('lessons')
        .select('id,title,series_id,lesson_number')
        .eq('series_id', seriesId)
        .order('lesson_number', { ascending: true })

      if (err) {
        setError((e) => (e ? `${e}\n${err.message}` : err.message))
        setLessons([])
      } else {
        setLessons((data ?? []) as LessonRow[])
      }

      const { progress: vaP, error: vaErr } = await fetchSeriesWordsVaProgress({ seriesId })
      let nextVa = vaP

      let reviewForAutoSync: SeriesWordBankReviewSummary | null = null
      if (isAdmin && hasLessonSeriesRow && resolvedStatus !== 'draft' && resolvedStatus !== 'published') {
        const rev = await buildSeriesWordBankReviewSummary(seriesId)
        if ('error' in rev) {
          setWordBankReview(null)
        } else {
          reviewForAutoSync = rev.summary
          setWordBankReview(rev.summary)
        }
      } else {
        setWordBankReview(null)
      }

      if (vaErr) {
        setError((e) => (e ? `${e}\n${vaErr}` : vaErr))
      } else if (
        isAdmin &&
        hasLessonSeriesRow &&
        resolvedStatus === 'approved' &&
        reviewForAutoSync &&
        (reviewForAutoSync.newWords.length > 0 || reviewForAutoSync.pendingTranslationChanges.length > 0)
      ) {
        const seed = await seedWordsFromSeriesLessons({ seriesId })
        if (!seed.error) {
          const { progress: vaP2, error: vaErr2 } = await fetchSeriesWordsVaProgress({ seriesId })
          nextVa = vaP2 ?? vaP
          if (vaErr2) {
            setError((e) => (e ? `${e}\n${vaErr2}` : vaErr2))
          }
          const rev2 = await buildSeriesWordBankReviewSummary(seriesId)
          if (!('error' in rev2)) setWordBankReview(rev2.summary)
        }
      }
      setVaProgress(nextVa)

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError((prev) => (prev ? `${prev}\n${msg}` : msg))
    } finally {
      setLoading(false)
    }
  }, [seriesId, isAdmin])

  const openScriptModal = useCallback(() => {
    if (!scriptEditable) {
      Alert.alert('View only', 'Script can be edited when the series is in draft (professor) or by an admin.')
      return
    }
    setScriptDraft(introScript ?? '')
    setScriptModalOpen(true)
  }, [introScript, scriptEditable])

  const saveScript = useCallback(async () => {
    const id = seriesId.trim()
    if (!id) {
      Alert.alert('Could not save script', 'Missing series id.')
      return
    }
    setScriptSaving(true)
    const trimmed = scriptDraft.trim()
    const value = trimmed === '' ? null : scriptDraft

    const { data: updated, error: upErr } = await supabase
      .from('lesson_series')
      .update({ intro_script: value })
      .eq('id', id)
      .select('intro_script')
      .maybeSingle()

    if (upErr) {
      setScriptSaving(false)
      Alert.alert('Could not save script', withLessonSeriesRlsHint(upErr.message))
      return
    }

    if (updated != null) {
      const next = (updated as { intro_script?: string | null }).intro_script
      setIntroScript(typeof next === 'string' ? next : value)
      setLessonSeriesRowExists(true)
      setScriptSaving(false)
      setScriptModalOpen(false)
      return
    }

    const title = (seriesTitle && seriesTitle.trim()) || id
    const { data: inserted, error: insErr } = await supabase
      .from('lesson_series')
      .insert({
        id,
        title,
        sort_order: 1,
        intro_script: value,
        approved: false,
        audio_recorded: false,
        series_status: isAdmin ? 'admin_draft' : 'draft',
      })
      .select('intro_script')
      .maybeSingle()

    setScriptSaving(false)
    if (insErr) {
      Alert.alert(
        'Could not save script',
        withLessonSeriesRlsHint(
          `${insErr.message}\n\nUpdate matched no row (wrong id?) or returned nothing; insert was tried next.`,
        ),
      )
      return
    }
    if (inserted == null) {
      Alert.alert(
        'Could not save script',
        'No row was returned after insert. Check Supabase RLS policies for lesson_series.' +
          RLS_LESSON_SERIES_HINT,
      )
      return
    }
    const next = (inserted as { intro_script?: string | null }).intro_script
    setIntroScript(typeof next === 'string' ? next : value)
    setLessonSeriesRowExists(true)
    setSeriesStatus(isAdmin ? 'admin_draft' : 'draft')
    setScriptModalOpen(false)
  }, [seriesId, scriptDraft, seriesTitle, isAdmin])

  const persistSeriesStatus = useCallback(
    async (next: LessonSeriesStatus, opts?: { quiet?: boolean }) => {
      const flags = legacyFlagsFromSeriesStatus(next)
      if (!opts?.quiet) setSeriesStatusSaving(true)
      const { error: upErr } = await supabase
        .from('lesson_series')
        .update({
          series_status: next,
          approved: flags.approved,
          audio_recorded: flags.audio_recorded,
        })
        .eq('id', seriesId)
      if (!opts?.quiet) setSeriesStatusSaving(false)
      if (upErr) {
        Alert.alert('Could not update status', withLessonSeriesRlsHint(upErr.message))
        return false
      }
      setSeriesStatus(next)
      return true
    },
    [seriesId],
  )

  const onMarkAudioComplete = useCallback(async () => {
    if (!canMarkAudioComplete) {
      Alert.alert(
        'Not ready',
        'All lesson words must be in this voice-bank series with every row recorded or approved before marking audio complete.',
      )
      return
    }
    const ok = await persistSeriesStatus('complete')
    if (ok) void load()
  }, [canMarkAudioComplete, persistSeriesStatus, load])

  const onApproveContent = useCallback(async () => {
    if (!lessonSeriesRowExists || !canAdminApproveCurriculum) return
    setVaSyncing(true)
    const okApproved = await persistSeriesStatus('approved', { quiet: true })
    if (!okApproved) {
      setVaSyncing(false)
      return
    }
    const seed = await seedWordsFromSeriesLessons({ seriesId })
    if (seed.error) {
      setVaSyncing(false)
      Alert.alert(
        'Approved',
        `Series is approved, but words could not be added for the voice queue:\n\n${seed.error}`,
      )
      await load()
      return
    }
    setVaSyncing(false)
    const bankLabel = wordsBankSeriesLabelFromSeriesId(seriesId)
    const lines: string[] = [
      `Pending words are in the voice queue (${VOICE_BANK_LANGUAGE}, series “${bankLabel}”).`,
      `New rows: ${seed.inserted}. Translations updated from lessons: ${seed.translationsUpdated}. Already in this series: ${seed.skippedExisting}. Lesson tokens scanned: ${seed.totalHarvested}.`,
    ]
    if (seed.blockedOtherSeries.length > 0) {
      lines.push(
        '',
        'Already in the database under another series (not duplicated here):',
        ...seed.blockedOtherSeries.slice(0, 20).map((b) => `• “${b.word}” → ${b.existingSeries}`),
      )
      if (seed.blockedOtherSeries.length > 20) {
        lines.push(`… +${seed.blockedOtherSeries.length - 20} more`)
      }
    }
    Alert.alert('Approved', lines.join('\n'))
    await load()
  }, [lessonSeriesRowExists, canAdminApproveCurriculum, persistSeriesStatus, seriesId, load])

  const onSubmitForReview = useCallback(async () => {
    if (!lessonSeriesRowExists) return
    void persistSeriesStatus('submitted')
  }, [lessonSeriesRowExists, persistSeriesStatus])

  const onWithdrawSubmission = useCallback(async () => {
    if (!lessonSeriesRowExists) return
    void persistSeriesStatus('draft')
  }, [lessonSeriesRowExists, persistSeriesStatus])

  const performDeleteSeries = useCallback(async () => {
    if (structureFrozen) return
    setDeleting(true)
    const { error: lessonsDelErr } = await supabase.from('lessons').delete().eq('series_id', seriesId)
    if (lessonsDelErr) {
      setDeleting(false)
      const msg = lessonsDelErr.message
      Alert.alert(
        'Could not delete lessons',
        /row-level security|permission denied/i.test(msg)
          ? `${msg}\n\nIf lessons has RLS, run sql/lessons_delete_rls_optional.sql in the Supabase SQL Editor.`
          : msg,
      )
      return
    }
    const { error: seriesDelErr } = await supabase.from('lesson_series').delete().eq('id', seriesId)
    setDeleting(false)
    if (seriesDelErr) {
      Alert.alert('Could not delete series', withLessonSeriesRlsHint(seriesDelErr.message))
      return
    }
    navigation.goBack()
  }, [lessonSeriesRowExists, navigation, structureFrozen, seriesId])

  const openAddLesson = useCallback(() => {
    setNewLessonTitle('')
    setAddLessonOpen(true)
  }, [])

  const saveNewLesson = useCallback(async () => {
    const sid = seriesId.trim()
    if (!sid) {
      Alert.alert('Add lesson', 'Missing series id.')
      return
    }
    const titleTrim = newLessonTitle.trim()
    const displayTitle = titleTrim || `Lesson ${nextLessonNumber}`
    const lessonId = newLessonRowId()
    const content = {
      id: lessonId,
      title: displayTitle,
      series: wordsBankSeriesLabelFromSeriesId(sid),
      screens: [defaultScreen('intro')],
    }

    setAddLessonSaving(true)
    const { data: inserted, error: insErr } = await supabase
      .from('lessons')
      .insert({
        id: lessonId,
        title: displayTitle,
        series_id: sid,
        lesson_number: nextLessonNumber,
        next_lesson_id: null,
        content,
      })
      .select('id')
      .maybeSingle()

    setAddLessonSaving(false)
    if (insErr) {
      Alert.alert('Could not add lesson', withLessonsRlsHint(insErr.message))
      return
    }
    if (!inserted || typeof (inserted as { id?: string }).id !== 'string') {
      Alert.alert('Could not add lesson', withLessonsRlsHint('No row returned after insert.'))
      return
    }
    setAddLessonOpen(false)
    await load()
    navigation.navigate('LessonConfigDetail', { lessonId: (inserted as { id: string }).id })
  }, [
    load,
    navigation,
    newLessonTitle,
    nextLessonNumber,
    seriesId,
    seriesTitle,
  ])

  const canSwipeDeleteLesson = seriesStatus !== 'published'

  const performDeleteLesson = useCallback(
    async (lesson: LessonRow) => {
      if (seriesStatus === 'published') return
      const { error: delErr } = await supabase.from('lessons').delete().eq('id', lesson.id)
      if (delErr) {
        Alert.alert('Could not delete lesson', withLessonsRlsHint(delErr.message))
        return
      }
      await load()
    },
    [load, seriesStatus],
  )

  const confirmDeleteLesson = useCallback(
    (lesson: LessonRow) => {
      if (seriesStatus === 'published') return
      lessonSwipeRefs.current[lesson.id]?.close()
      Alert.alert(
        'Delete lesson?',
        `“${(lesson.title ?? '').trim() || lesson.id}” will be removed permanently.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => void performDeleteLesson(lesson) },
        ],
      )
    },
    [performDeleteLesson, seriesStatus],
  )

  const confirmDeleteSeries = useCallback(() => {
    if (structureFrozen) return
    const n = lessons.length
    const name = seriesTitle.trim() || seriesId
    Alert.alert(
      'Delete this series?',
      n > 0
        ? `“${name}” and ${n} lesson(s) will be removed permanently.`
        : `The series “${name}” will be removed permanently.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void performDeleteSeries() },
      ],
    )
  }, [lessons.length, performDeleteSeries, structureFrozen, seriesId, seriesTitle])

  useLayoutEffect(() => {
    navigation.setOptions({ title: seriesTitle || seriesId })
  }, [navigation, seriesId, seriesTitle])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      void load()
    }, [load]),
  )

  if (loading && lessons.length === 0 && !error) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#636366" />
      </View>
    )
  }

  const listHeader = (
    <>
      <View style={[styles.scriptBlock, !scriptEditable && styles.scriptReadOnlyWrap]}>
        <AdminSectionHeader label="Script" emphasis="gold" />
        <AdminSeriesScriptCard subtitle={scriptCardSubtitle(introScript)} onPress={openScriptModal} />
      </View>
      <View style={styles.statusBlock}>
        <AdminSectionHeader label="Status" emphasis="gold" />
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={styles.statusTextCol}>
              <Text style={styles.statusTitle}>Series status</Text>
              <Text style={styles.seriesStatusBadge}>{seriesStatusLabel(seriesStatus)}</Text>
              {!showAdminPipeline ? (
                <Text style={styles.statusSubtitle}>{seriesStatusExplainer}</Text>
              ) : null}
            </View>
          </View>
          {showProfessorWorkflow ? (
            <View style={styles.reviewDraftRow}>
              {seriesStatus === 'draft' ? (
                <Pressable
                  style={[styles.secondaryBtn, seriesStatusSaving && styles.btnDisabledOpacity]}
                  onPress={() => void onSubmitForReview()}
                  disabled={seriesStatusSaving || vaSyncing}
                >
                  <Text style={styles.secondaryBtnText}>Submit for review</Text>
                </Pressable>
              ) : null}
              {seriesStatus === 'submitted' ? (
                <Pressable
                  style={[styles.secondaryBtn, seriesStatusSaving && styles.btnDisabledOpacity]}
                  onPress={() => void onWithdrawSubmission()}
                  disabled={seriesStatusSaving || vaSyncing}
                >
                  <Text style={styles.secondaryBtnText}>Withdraw — edit as draft</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {showAdminPipeline ? (
            <>
              <Pressable
                style={[
                  styles.primaryOutlineBtn,
                  (seriesStatusSaving || vaSyncing || !canAdminApproveCurriculum) && styles.btnDisabledOpacity,
                ]}
                onPress={() => void onApproveContent()}
                disabled={seriesStatusSaving || vaSyncing || !canAdminApproveCurriculum}
              >
                <Text style={styles.primaryOutlineBtnText}>{adminApproveLabel}</Text>
              </Pressable>
              {wordBankReview &&
              (wordBankReview.newWords.length > 0 ||
                wordBankReview.pendingTranslationChanges.length > 0 ||
                wordBankReview.blockedOtherSeries.length > 0) ? (
                <View style={styles.wordBankReviewBlock}>
                  <Text style={styles.wordBankReviewTitle}>Voice bank (on Approve Series)</Text>
                  <Text style={styles.wordBankReviewHint}>
                    Lesson saves only update JSON. Inserts and translation fixes run when you approve.
                  </Text>
                  {wordBankReview.newWords.length > 0 ? (
                    <View style={styles.wordBankReviewSection}>
                      <Text style={styles.wordBankReviewLabel}>New words — {wordBankReview.newWords.length}</Text>
                      {wordBankReview.newWords.slice(0, 15).map((nw, idx) => (
                        <Text key={`${nw.word}-${idx}`} style={styles.wordBankReviewLine}>
                          • {nw.word}
                          {nw.translation ? ` — ${nw.translation}` : ''}
                        </Text>
                      ))}
                      {wordBankReview.newWords.length > 15 ? (
                        <Text style={styles.wordBankReviewMore}>
                          … +{wordBankReview.newWords.length - 15} more
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                  {wordBankReview.pendingTranslationChanges.length > 0 ? (
                    <View style={styles.wordBankReviewSection}>
                      <Text style={styles.wordBankReviewLabel}>
                        Definition changes — {wordBankReview.pendingTranslationChanges.length}
                      </Text>
                      {wordBankReview.pendingTranslationChanges.slice(0, 12).map((ch) => (
                        <Text key={ch.word} style={styles.wordBankReviewLine}>
                          • {ch.word}: lesson “{ch.lessonTranslation}” vs DB “{ch.databaseTranslation}”
                        </Text>
                      ))}
                      {wordBankReview.pendingTranslationChanges.length > 12 ? (
                        <Text style={styles.wordBankReviewMore}>
                          … +{wordBankReview.pendingTranslationChanges.length - 12} more
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                  {wordBankReview.blockedOtherSeries.length > 0 ? (
                    <View style={styles.wordBankReviewSection}>
                      <Text style={styles.wordBankReviewLabel}>Other series (not duplicated)</Text>
                      {wordBankReview.blockedOtherSeries.slice(0, 8).map((b) => (
                        <Text key={b.word} style={styles.wordBankReviewLine}>
                          • “{b.word}” → {b.existingSeries}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
              {seriesStatus === 'approved' ? (
                <Pressable
                  style={[
                    styles.markAudioCompleteBtn,
                    (seriesStatusSaving || !canMarkAudioComplete) && styles.btnDisabledOpacity,
                  ]}
                  onPress={() => void onMarkAudioComplete()}
                  disabled={seriesStatusSaving || !canMarkAudioComplete}
                >
                  <Text style={styles.markAudioCompleteBtnText}>Mark audio complete</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
          {!showAdminPipeline ? (
            <>
              <View style={styles.statusDivider} />
              <View style={styles.statusRow}>
                <View style={styles.statusTextCol}>
                  <Text style={styles.statusTitle}>Audio status</Text>
                  <Text style={styles.statusSubtitle}>{audioStatusSubtitle}</Text>
                </View>
              </View>
            </>
          ) : null}
        </View>
      </View>
      <View style={styles.lessonsBlock}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <AdminSectionHeader label="Lessons" right={`${lessons.length} total`} emphasis="gold" />
        {lessons.length > 0 ? (
          <Text style={styles.lessonListHint}>
            {canSwipeDeleteLesson
              ? 'Swipe left on a lesson to delete.'
              : 'Published: delete lesson is disabled.'}
          </Text>
        ) : null}
      </View>
    </>
  )

  const bottomDisabled = loading || deleting || addLessonSaving || seriesStatusSaving || vaSyncing

  return (
    <View style={styles.screen}>
      <FlatList
        style={styles.listFlex}
        data={lessons}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>No lessons in this series yet.</Text> : null
        }
        renderItem={({ item, index }) => {
          const order = item.lesson_number != null && item.lesson_number > 0 ? item.lesson_number : index + 1
          const row = (
            <Pressable
              style={({ pressed }) => [styles.rowCard, pressed && styles.rowPressed]}
              onPress={() => navigation.navigate('LessonConfigDetail', { lessonId: item.id })}
              android_ripple={{ color: '#333' }}
            >
              <View style={styles.rowInner}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{order}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.title || item.id}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {item.id}
                  </Text>
                </View>
                <AdminChevronRight size={10} color="#636366" />
              </View>
            </Pressable>
          )
          if (!canSwipeDeleteLesson) {
            return row
          }
          return (
            <Swipeable
              ref={(r) => {
                lessonSwipeRefs.current[item.id] = r
              }}
              renderRightActions={() => (
                <View style={styles.lessonSwipeActions}>
                  <Pressable style={styles.lessonSwipeDelete} onPress={() => confirmDeleteLesson(item)}>
                    <Text style={styles.lessonSwipeDeleteText}>Delete</Text>
                  </Pressable>
                </View>
              )}
              overshootRight={false}
            >
              {row}
            </Swipeable>
          )
        }}
      />

      {!structureFrozen ? (
        <View style={styles.bottomActions}>
          <Pressable
            style={({ pressed }) => [
              styles.addLessonBtn,
              (pressed || bottomDisabled) && styles.addLessonBtnPressed,
            ]}
            onPress={openAddLesson}
            disabled={bottomDisabled}
            android_ripple={{ color: '#333' }}
          >
            <AdminPlusIcon size={14} color={ADMIN_ACCENT_GOLD} />
            <Text style={styles.addLessonBtnText}>Add lesson</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.deleteBtn,
              (pressed || bottomDisabled) && styles.deleteBtnPressed,
            ]}
            onPress={confirmDeleteSeries}
            disabled={bottomDisabled}
          >
            <Text style={styles.deleteBtnText}>{deleting ? 'Deleting…' : 'Delete series'}</Text>
          </Pressable>
          <Text style={styles.deleteFooterHint}>
            Delete is hidden once the series reaches audio complete or published.
          </Text>
        </View>
      ) : null}

      <Modal
        visible={addLessonOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => !addLessonSaving && setAddLessonOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalHeader}>
            <Pressable hitSlop={12} onPress={() => !addLessonSaving && setAddLessonOpen(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>New lesson</Text>
            <Pressable hitSlop={12} onPress={() => void saveNewLesson()} disabled={addLessonSaving}>
              <Text style={[styles.modalSave, addLessonSaving && styles.modalSaveDisabled]}>
                {addLessonSaving ? '…' : 'Save'}
              </Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.modalScrollContent}
          >
            <Text style={styles.modalInfo}>
              Lesson <Text style={styles.modalInfoEm}>{nextLessonNumber}</Text> in this series. The lesson id is generated
              automatically; you can set the title now or edit it on the next screen.
            </Text>
            <Text style={styles.modalLabel}>Title</Text>
            <TextInput
              style={styles.modalFieldInput}
              value={newLessonTitle}
              onChangeText={setNewLessonTitle}
              placeholder={`e.g. Lesson ${nextLessonNumber}`}
              placeholderTextColor="#52525b"
            />
            <Text style={styles.modalFieldHint}>
              {`Optional. Defaults to “Lesson ${nextLessonNumber}”.`}
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={scriptModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => !scriptSaving && setScriptModalOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalHeader}>
            <Pressable hitSlop={12} onPress={() => !scriptSaving && setScriptModalOpen(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Series intro script</Text>
            <Pressable hitSlop={12} onPress={() => void saveScript()} disabled={scriptSaving}>
              <Text style={[styles.modalSave, scriptSaving && styles.modalSaveDisabled]}>
                {scriptSaving ? '…' : 'Save'}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.modalHint}>{SCRIPT_CARD_SUBTITLE_FALLBACK}</Text>
          <ScrollView
            style={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.modalScrollContent}
          >
            <TextInput
              style={styles.scriptInput}
              value={scriptDraft}
              onChangeText={setScriptDraft}
              placeholder="Enter intro / voiceover script for this series…"
              placeholderTextColor="#52525b"
              multiline
              textAlignVertical="top"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  listFlex: { flex: 1 },
  centered: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  /** Outer list padding matches mock: 16px horizontal; section blocks 16 top / 8 bottom rhythm */
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 8 },
  bottomActions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2c2c2e',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    backgroundColor: '#000',
    gap: 10,
  },
  scriptBlock: { marginBottom: 8 },
  scriptReadOnlyWrap: { opacity: 0.55 },
  statusBlock: { marginBottom: 8 },
  statusCard: {
    backgroundColor: '#1c1c1e',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#38383a',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  statusTextCol: { flex: 1, minWidth: 0 },
  statusTitle: { fontSize: 14, fontWeight: '600', color: '#fff' },
  statusSubtitle: { fontSize: 12, color: '#636366', marginTop: 4, lineHeight: 16 },
  seriesStatusBadge: {
    fontSize: 15,
    fontWeight: '700',
    color: ADMIN_ACCENT_GOLD,
    marginTop: 6,
  },
  reviewDraftRow: { marginTop: 12, gap: 8 },
  secondaryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#52525b',
  },
  secondaryBtnText: { color: '#a1a1aa', fontSize: 13, fontWeight: '600' },
  primaryOutlineBtn: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.55)',
    alignItems: 'center',
  },
  primaryOutlineBtnText: { color: '#34c759', fontSize: 15, fontWeight: '700' },
  wordBankReviewBlock: {
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(212, 175, 55, 0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212, 175, 55, 0.35)',
  },
  wordBankReviewTitle: {
    color: ADMIN_ACCENT_GOLD,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6,
  },
  wordBankReviewHint: { color: '#8e8e93', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  wordBankReviewSection: { marginBottom: 10 },
  wordBankReviewLabel: { color: '#e5e5ea', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  wordBankReviewLine: { color: '#aeaeb2', fontSize: 12, lineHeight: 18, marginLeft: 4 },
  wordBankReviewMore: { color: '#636366', fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  markAudioCompleteBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.55)',
    alignItems: 'center',
    backgroundColor: 'rgba(14, 116, 144, 0.25)',
  },
  markAudioCompleteBtnText: { color: '#7dd3fc', fontSize: 15, fontWeight: '700' },
  completeSeriesBlock: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212, 175, 55, 0.35)',
  },
  completeSeriesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: ADMIN_ACCENT_GOLD,
    marginBottom: 4,
  },
  vaCountsLine: {
    marginTop: 10,
  },
  vaCrossSeriesWarning: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 17,
    color: '#ff453a',
    fontWeight: '600',
  },
  vaHint: {
    marginTop: 8,
    fontSize: 11,
    color: '#636366',
    lineHeight: 15,
  },
  btnDisabledOpacity: { opacity: 0.45 },
  statusDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2c2c2e',
    marginVertical: 14,
  },
  lessonsBlock: { marginBottom: 8 },
  lessonListHint: {
    fontSize: 11,
    color: '#636366',
    marginTop: 6,
    lineHeight: 15,
    paddingHorizontal: 2,
  },
  error: { color: '#f87171', marginBottom: 10, fontSize: 14 },
  lessonSwipeActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  lessonSwipeDelete: {
    backgroundColor: '#7f1d1d',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
  },
  lessonSwipeDeleteText: {
    color: '#fecaca',
    fontWeight: '700',
    fontSize: 14,
  },
  rowCard: {
    backgroundColor: '#1c1c1e',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#38383a',
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  rowPressed: { opacity: 0.92 },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212, 175, 55, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '600', color: ADMIN_ACCENT_GOLD },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '500', color: '#fff' },
  rowMeta: { fontSize: 12, color: '#636366', marginTop: 1 },
  empty: { color: '#636366', fontSize: 14, textAlign: 'center', marginTop: 32, paddingHorizontal: 24 },
  addLessonBtn: {
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
  addLessonBtnPressed: { opacity: 0.88 },
  addLessonBtnText: { fontSize: 14, color: ADMIN_ACCENT_GOLD, fontWeight: '600' },
  deleteBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ff453a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnPressed: { opacity: 0.85 },
  deleteBtnText: { color: '#ff453a', fontSize: 15, fontWeight: '600' },
  deleteFooterHint: {
    color: '#636366',
    fontSize: 12,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  modalRoot: { flex: 1, backgroundColor: '#000' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2c2c2e',
  },
  modalCancel: { fontSize: 16, color: '#a1a1aa', fontWeight: '500' },
  modalTitle: { fontSize: 16, fontWeight: '500', color: '#fff', flex: 1, textAlign: 'center' },
  modalSave: { fontSize: 16, color: '#34c759', fontWeight: '700' },
  modalSaveDisabled: { opacity: 0.4 },
  modalHint: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    fontSize: 11,
    color: '#636366',
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  modalScroll: { flex: 1 },
  modalScrollContent: { padding: 16, paddingBottom: 40 },
  modalInfo: {
    fontSize: 14,
    color: '#a1a1aa',
    lineHeight: 20,
    marginBottom: 16,
  },
  modalInfoEm: { color: '#fff', fontWeight: '600' },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#a1a1aa',
    marginBottom: 6,
  },
  modalFieldInput: {
    backgroundColor: '#1c1c1e',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#38383a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#fff',
  },
  modalFieldHint: { fontSize: 11, color: '#636366', marginTop: 6, lineHeight: 15 },
  scriptInput: {
    minHeight: 280,
    fontSize: 16,
    lineHeight: 22,
    color: '#fff',
    backgroundColor: '#1c1c1e',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#38383a',
    borderRadius: 10,
    padding: 14,
  },
})
