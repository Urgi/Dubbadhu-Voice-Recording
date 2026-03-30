import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
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
  Switch,
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
  AdminSeriesScriptCard,
} from '../components/lesson-config/AdminLessonConfigChrome'
import { defaultScreen } from '../lib/lessonEditor'
import supabase from '../lib/supabase'
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
  const { seriesId } = route.params
  const [lessons, setLessons] = useState<LessonRow[]>([])
  const [seriesTitle, setSeriesTitle] = useState<string>(seriesId)
  const [introScript, setIntroScript] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [scriptModalOpen, setScriptModalOpen] = useState(false)
  const [scriptDraft, setScriptDraft] = useState('')
  const [scriptSaving, setScriptSaving] = useState(false)
  const [seriesApproved, setSeriesApproved] = useState(false)
  const [approvalSaving, setApprovalSaving] = useState(false)
  const [seriesAudioRecorded, setSeriesAudioRecorded] = useState(false)
  const [audioRecordedSaving, setAudioRecordedSaving] = useState(false)
  /** False when there is no `lesson_series` row for this id (e.g. only lessons reference it). */
  const [lessonSeriesRowExists, setLessonSeriesRowExists] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [addLessonOpen, setAddLessonOpen] = useState(false)
  const [newLessonTitle, setNewLessonTitle] = useState('')
  const [addLessonSaving, setAddLessonSaving] = useState(false)

  const nextLessonNumber = useMemo(() => {
    let max = 0
    for (const L of lessons) {
      const n = L.lesson_number
      if (typeof n === 'number' && n > max) max = n
    }
    return max + 1
  }, [lessons])

  const load = useCallback(async () => {
    setError('')
    try {
      const { data: seriesRow, error: seriesErr } = await supabase
        .from('lesson_series')
        .select('title,intro_script,approved,audio_recorded')
        .eq('id', seriesId)
        .maybeSingle()

      if (seriesErr) {
        setError(seriesErr.message)
      } else if (seriesRow) {
        setLessonSeriesRowExists(true)
        const sr = seriesRow as {
          title?: string | null
          intro_script?: string | null
          approved?: boolean | null
          audio_recorded?: boolean | null
        }
        if (typeof sr.title === 'string') setSeriesTitle(sr.title)
        setIntroScript(typeof sr.intro_script === 'string' ? sr.intro_script : null)
        setSeriesApproved(sr.approved === true)
        setSeriesAudioRecorded(sr.audio_recorded === true)
      } else {
        setLessonSeriesRowExists(false)
        setIntroScript(null)
        setSeriesApproved(false)
        setSeriesAudioRecorded(false)
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError((prev) => (prev ? `${prev}\n${msg}` : msg))
    } finally {
      setLoading(false)
    }
  }, [seriesId])

  const openScriptModal = useCallback(() => {
    setScriptDraft(introScript ?? '')
    setScriptModalOpen(true)
  }, [introScript])

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
    setSeriesApproved(false)
    setSeriesAudioRecorded(false)
    setScriptModalOpen(false)
  }, [seriesId, scriptDraft, seriesTitle])

  const saveApproved = useCallback(
    async (next: boolean) => {
      setApprovalSaving(true)
      const { error: upErr } = await supabase
        .from('lesson_series')
        .update({ approved: next })
        .eq('id', seriesId)
      setApprovalSaving(false)
      if (upErr) {
        Alert.alert('Could not update approval', upErr.message)
        return
      }
      setSeriesApproved(next)
    },
    [seriesId],
  )

  const saveAudioRecorded = useCallback(
    async (next: boolean) => {
      setAudioRecordedSaving(true)
      const { error: upErr } = await supabase
        .from('lesson_series')
        .update({ audio_recorded: next })
        .eq('id', seriesId)
      setAudioRecordedSaving(false)
      if (upErr) {
        Alert.alert('Could not update audio status', upErr.message)
        return
      }
      setSeriesAudioRecorded(next)
    },
    [seriesId],
  )

  const performDeleteSeries = useCallback(async () => {
    if (seriesApproved) return
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
  }, [lessonSeriesRowExists, navigation, seriesApproved, seriesId])

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
    const seriesLabel = seriesTitle.trim() || sid
    const content = {
      id: lessonId,
      title: displayTitle,
      series: seriesLabel,
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

  const confirmDeleteSeries = useCallback(() => {
    if (seriesApproved) return
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
  }, [lessons.length, performDeleteSeries, seriesApproved, seriesId, seriesTitle])

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
      <View style={styles.scriptBlock}>
        <AdminSectionHeader label="Script" emphasis="gold" />
        <AdminSeriesScriptCard subtitle={scriptCardSubtitle(introScript)} onPress={openScriptModal} />
      </View>
      <View style={styles.statusBlock}>
        <AdminSectionHeader label="Status" emphasis="gold" />
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={styles.statusTextCol}>
              <Text style={styles.statusTitle}>Approved for release</Text>
              <Text style={styles.statusSubtitle}>
                {!lessonSeriesRowExists
                  ? 'Add a row in lesson_series for this series id (e.g. via Add series) to save status below.'
                  : seriesApproved
                    ? 'This series is marked approved.'
                    : 'Toggle on when content is ready.'}
              </Text>
            </View>
            <Switch
              value={seriesApproved}
              disabled={approvalSaving || audioRecordedSaving || !lessonSeriesRowExists}
              onValueChange={(v) => void saveApproved(v)}
              trackColor={{ false: '#3a3a3c', true: 'rgba(52, 199, 89, 0.35)' }}
              thumbColor={seriesApproved ? '#34c759' : '#a1a1aa'}
              ios_backgroundColor="#3a3a3c"
            />
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusRow}>
            <View style={styles.statusTextCol}>
              <Text style={styles.statusTitle}>Audio recorded</Text>
              <Text style={styles.statusSubtitle}>
                {!lessonSeriesRowExists
                  ? 'Requires a lesson_series row for this id.'
                  : seriesAudioRecorded
                    ? 'Marked as fully recorded.'
                    : 'Toggle on when all series audio is recorded.'}
              </Text>
            </View>
            <Switch
              value={seriesAudioRecorded}
              disabled={approvalSaving || audioRecordedSaving || !lessonSeriesRowExists}
              onValueChange={(v) => void saveAudioRecorded(v)}
              trackColor={{ false: '#3a3a3c', true: 'rgba(56, 189, 248, 0.35)' }}
              thumbColor={seriesAudioRecorded ? '#38bdf8' : '#a1a1aa'}
              ios_backgroundColor="#3a3a3c"
            />
          </View>
        </View>
      </View>
      <View style={styles.lessonsBlock}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <AdminSectionHeader label="Lessons" right={`${lessons.length} total`} emphasis="gold" />
      </View>
    </>
  )

  const bottomDisabled =
    loading || deleting || addLessonSaving || approvalSaving || audioRecordedSaving

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
          return (
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
        }}
      />

      {!seriesApproved ? (
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
            Delete is only available while the series is not approved for release.
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
  statusDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2c2c2e',
    marginVertical: 14,
  },
  lessonsBlock: { marginBottom: 8 },
  error: { color: '#f87171', marginBottom: 10, fontSize: 14 },
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
