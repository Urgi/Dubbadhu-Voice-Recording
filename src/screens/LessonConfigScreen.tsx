import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useMemo, useState } from 'react'
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
import {
  ADMIN_ACCENT_GOLD,
  AdminChevronRight,
  AdminPlusIcon,
  AdminSectionHeader,
} from '../components/lesson-config/AdminLessonConfigChrome'
import { useAuth } from '../context/AuthContext'
import { seriesStatusLabel, normalizeSeriesStatus } from '../lib/lessonSeriesStatus'
import supabase from '../lib/supabase'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'LessonConfig'>

type SeriesRow = {
  id: string
  title: string | null
  sort_order: number | null
  /** From `lesson_series.approved`; null when series id only exists on lessons. */
  approved: boolean | null
  /** From `lesson_series.audio_recorded`; null when series id only exists on lessons. */
  audio_recorded: boolean | null
  series_status: string | null
}

/** Next `series1`-style id: max existing `seriesN` + 1, skipping collisions. */
function nextSeriesId(existingIds: string[]): string {
  const taken = new Set(existingIds.map((id) => id.toLowerCase()))
  let maxN = 0
  const re = /^series(\d+)$/i
  for (const id of existingIds) {
    const m = id.match(re)
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10))
  }
  let n = maxN + 1
  if (n < 1) n = 1
  let candidate = `series${n}`
  while (taken.has(candidate)) {
    n += 1
    candidate = `series${n}`
  }
  return candidate
}

function seriesNumberFromId(id: string, fallback: number): number {
  const m = id.match(/^series(\d+)$/i)
  if (m) return parseInt(m[1], 10)
  return fallback
}

export default function LessonConfigScreen({ navigation }: Props) {
  const { role } = useAuth()
  const [seriesList, setSeriesList] = useState<SeriesRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [addOpen, setAddOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const suggestedSort = useMemo(() => {
    const nums = seriesList
      .map((s) => s.sort_order)
      .filter((n): n is number => typeof n === 'number' && n > 0)
    if (nums.length === 0) return Math.max(1, seriesList.length + 1)
    return Math.max(...nums) + 1
  }, [seriesList])

  const suggestedSeriesId = useMemo(
    () => nextSeriesId(seriesList.map((s) => s.id)),
    [seriesList],
  )

  const friendlySeriesNumber = useMemo(
    () => seriesNumberFromId(suggestedSeriesId, suggestedSort),
    [suggestedSeriesId, suggestedSort],
  )

  const load = useCallback(async () => {
    setError('')

    const { data: seriesData, error: seriesErr } = await supabase
      .from('lesson_series')
      .select('id,title,sort_order,approved,audio_recorded,series_status')
      .order('sort_order', { ascending: true })

    if (!seriesErr && seriesData && seriesData.length > 0) {
      setSeriesList(
        (seriesData as SeriesRow[]).map((r) => ({
          ...r,
          approved: typeof r.approved === 'boolean' ? r.approved : false,
          audio_recorded: typeof r.audio_recorded === 'boolean' ? r.audio_recorded : false,
          series_status: typeof r.series_status === 'string' ? r.series_status : null,
        })),
      )
      setLoading(false)
      return
    }

    const { data: lessonRows, error: lessonErr } = await supabase.from('lessons').select('series_id')

    if (lessonErr) {
      setError(seriesErr?.message ?? lessonErr.message)
      setSeriesList([])
      setLoading(false)
      return
    }

    const ids = Array.from(
      new Set(
        ((lessonRows as { series_id: string | null }[] | null) ?? [])
          .map((r) => r.series_id)
          .filter((x): x is string => Boolean(x)),
      ),
    ).sort((a, b) => a.localeCompare(b))

    setSeriesList(
      ids.map((id) => ({
        id,
        title: id,
        sort_order: null,
        approved: null,
        audio_recorded: null,
        series_status: null,
      })),
    )
    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      void load()
    }, [load]),
  )

  const openAdd = useCallback(() => {
    setNewTitle('')
    setAddOpen(true)
  }, [])

  const saveNewSeries = useCallback(async () => {
    const title = newTitle.trim()
    if (!title) {
      Alert.alert('Title', 'Enter a title for this series.')
      return
    }
    const id = nextSeriesId(seriesList.map((s) => s.id))

    setSaving(true)
    const initialStatus = role === 'admin' ? 'admin_draft' : 'draft'
    const { error: insErr } = await supabase.from('lesson_series').insert({
      id,
      title,
      sort_order: suggestedSort,
      approved: false,
      audio_recorded: false,
      series_status: initialStatus,
    })
    setSaving(false)

    if (insErr) {
      Alert.alert('Could not add series', insErr.message)
      return
    }
    setAddOpen(false)
    setLoading(true)
    void load()
    navigation.navigate('LessonConfigSeries', { seriesId: id })
  }, [seriesList, newTitle, suggestedSort, load, navigation, role])

  if (loading && seriesList.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#636366" />
      </View>
    )
  }

  const listHeader = (
    <View style={styles.headerBlock}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <AdminSectionHeader label="Series" right={`${seriesList.length} total`} emphasis="gold" />
    </View>
  )

  const listFooter = (
    <Pressable style={styles.addBtn} onPress={openAdd} android_ripple={{ color: '#333' }}>
      <AdminPlusIcon size={14} color={ADMIN_ACCENT_GOLD} />
      <Text style={styles.addBtnText}>Add series</Text>
    </Pressable>
  )

  return (
    <View style={styles.screen}>
      <FlatList
        data={seriesList}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No series yet. Tap Add series below, or add rows in Supabase.
          </Text>
        }
        renderItem={({ item, index }) => {
          const order = item.sort_order != null && item.sort_order > 0 ? item.sort_order : index + 1
          const ls =
            item.series_status != null && item.series_status.trim()
              ? normalizeSeriesStatus(item.series_status)
              : item.audio_recorded === true && item.approved === true
                ? 'complete'
                : item.approved === true
                  ? 'approved'
                  : 'draft'
          const statusLine = seriesStatusLabel(ls)
          return (
            <Pressable
              style={({ pressed }) => [styles.rowCard, pressed && styles.rowPressed]}
              onPress={() => navigation.navigate('LessonConfigSeries', { seriesId: item.id })}
              android_ripple={{ color: '#333' }}
            >
              <View style={styles.rowInner}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{order}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {item.title || item.id}
                  </Text>
                  <Text style={styles.statusLifecycle} numberOfLines={1}>
                    {statusLine}
                  </Text>
                  <Text
                    style={
                      item.audio_recorded === true ? styles.statusAudioOn : styles.statusAudioOff
                    }
                    numberOfLines={1}
                  >
                    {item.audio_recorded === true ? 'Audio complete' : 'Audio not complete'}
                  </Text>
                </View>
                <AdminChevronRight size={10} color="#636366" />
              </View>
            </Pressable>
          )
        }}
      />

      <Modal
        visible={addOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => !saving && setAddOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalHeader}>
            <Pressable hitSlop={12} onPress={() => !saving && setAddOpen(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>New series</Text>
            <Pressable hitSlop={12} onPress={() => void saveNewSeries()} disabled={saving}>
              <Text style={[styles.modalSave, saving && styles.modalSaveDisabled]}>
                {saving ? '…' : 'Save'}
              </Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.modalScrollContent}
          >
            <Text style={styles.modalInfo}>
              This will show as{' '}
              <Text style={styles.modalInfoEm}>Series {friendlySeriesNumber}</Text> in Series Config. The internal id is
              assigned automatically for lessons to link to.
            </Text>
            <Text style={styles.modalLabel}>Title</Text>
            <TextInput
              style={styles.modalInput}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="e.g. Mastering greetings"
              placeholderTextColor="#52525b"
            />
            <Text style={styles.modalHint}>Required. This is the name shown in the series list.</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  headerBlock: { paddingHorizontal: 16, paddingTop: 8 },
  error: { color: '#f87171', marginBottom: 10, fontSize: 14 },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
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
  statusLifecycle: { fontSize: 12, fontWeight: '600', color: ADMIN_ACCENT_GOLD, marginTop: 4 },
  statusApproved: { fontSize: 12, fontWeight: '600', color: '#34c759', marginTop: 4 },
  statusNotApproved: { fontSize: 12, fontWeight: '500', color: '#a8a29e', marginTop: 4 },
  statusAudioOn: { fontSize: 12, fontWeight: '600', color: '#38bdf8', marginTop: 2 },
  statusAudioOff: { fontSize: 12, fontWeight: '500', color: '#a8a29e', marginTop: 2 },
  empty: { color: '#636366', fontSize: 14, textAlign: 'center', marginTop: 32, paddingHorizontal: 24 },
  addBtn: {
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
  addBtnText: { fontSize: 14, color: ADMIN_ACCENT_GOLD, fontWeight: '600' },
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
  modalTitle: { fontSize: 16, fontWeight: '600', color: '#fff', flex: 1, textAlign: 'center' },
  modalSave: { fontSize: 16, color: '#34c759', fontWeight: '700' },
  modalSaveDisabled: { opacity: 0.4 },
  modalScroll: { flex: 1 },
  modalScrollContent: { padding: 16, paddingBottom: 40 },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#a1a1aa',
    marginBottom: 6,
    marginTop: 12,
  },
  modalInfo: {
    fontSize: 14,
    color: '#a1a1aa',
    lineHeight: 20,
    marginBottom: 16,
  },
  modalInfoEm: { color: '#fff', fontWeight: '600' },
  modalHint: { fontSize: 11, color: '#636366', marginTop: 6, lineHeight: 15 },
  modalInput: {
    backgroundColor: '#1c1c1e',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#38383a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#fff',
  },
})
