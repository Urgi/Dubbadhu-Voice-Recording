import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import { ADMIN_ACCENT_GOLD } from '../components/lesson-config/AdminLessonConfigChrome'
import supabase from '../lib/supabase'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminVocabIllustrationReview'>

type ReviewRow = {
  vocabulary_id: number
  status: 'good' | 'bad'
  notes: string
  updated_at: string
}

type VocabRow = {
  id: number
  oromo: string
  english: string
  part_of_speech: string | null
  illustration_url: string | null
  category: string | null
  serverReview: ReviewRow | null
}

type FilterKey = 'all' | 'has_image' | 'no_image' | 'unreviewed' | 'good' | 'bad'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'has_image', label: 'Has image' },
  { key: 'no_image', label: 'No image' },
  { key: 'unreviewed', label: 'Unreviewed' },
  { key: 'good', label: 'Good' },
  { key: 'bad', label: 'Bad' },
]

export default function AdminVocabIllustrationReviewScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<VocabRow[]>([])
  const [filter, setFilter] = useState<FilterKey>('has_image')
  const [query, setQuery] = useState('')
  /** Draft edits before Save — keyed by vocabulary id */
  const [draftStatus, setDraftStatus] = useState<Record<number, 'good' | 'bad'>>({})
  const [draftNotes, setDraftNotes] = useState<Record<number, string>>({})
  const [savingId, setSavingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    const [vRes, rRes] = await Promise.all([
      supabase
        .from('vocabulary')
        .select('id, oromo, english, part_of_speech, illustration_url, category')
        .order('id', { ascending: true }),
      supabase.from('vocabulary_illustration_reviews').select('vocabulary_id, status, notes, updated_at'),
    ])
    if (vRes.error) {
      setError(vRes.error.message)
      setLoading(false)
      return
    }
    if (rRes.error) {
      setError(rRes.error.message)
      setLoading(false)
      return
    }
    const reviewMap = new Map<number, ReviewRow>()
    for (const r of rRes.data ?? []) {
      reviewMap.set(r.vocabulary_id, r as ReviewRow)
    }
    const merged: VocabRow[] = (vRes.data ?? []).map((v) => ({
      id: v.id,
      oromo: String(v.oromo ?? ''),
      english: String(v.english ?? ''),
      part_of_speech: v.part_of_speech ? String(v.part_of_speech) : null,
      illustration_url: v.illustration_url ? String(v.illustration_url).trim() : null,
      category: v.category ? String(v.category) : null,
      serverReview: reviewMap.get(v.id) ?? null,
    }))
    setRows(merged)
    setDraftStatus({})
    setDraftNotes({})
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    navigation.setOptions({
      title: 'Vocab illustrations',
      headerRight: () => (
        <Pressable onPress={() => void load()} style={styles.headerBtn} hitSlop={10}>
          <Text style={styles.headerBtnText}>Refresh</Text>
        </Pressable>
      ),
    })
  }, [navigation, load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (q) {
        const hit =
          r.oromo.toLowerCase().includes(q) ||
          r.english.toLowerCase().includes(q) ||
          String(r.id).includes(q)
        if (!hit) return false
      }
      const hasImg = Boolean(r.illustration_url)
      const rev = r.serverReview
      switch (filter) {
        case 'all':
          return true
        case 'has_image':
          return hasImg
        case 'no_image':
          return !hasImg
        case 'unreviewed':
          return rev == null
        case 'good':
          return rev?.status === 'good'
        case 'bad':
          return rev?.status === 'bad'
        default:
          return true
      }
    })
  }, [rows, filter, query])

  const getDraftStatus = (r: VocabRow): 'good' | 'bad' | null => {
    if (draftStatus[r.id] !== undefined) return draftStatus[r.id]!
    return r.serverReview?.status ?? null
  }

  const getDraftNotes = (r: VocabRow): string => {
    if (draftNotes[r.id] !== undefined) return draftNotes[r.id]!
    return r.serverReview?.notes ?? ''
  }

  const setStatusDraft = (id: number, status: 'good' | 'bad') => {
    setDraftStatus((prev) => ({ ...prev, [id]: status }))
  }

  const setNotesDraft = (id: number, notes: string) => {
    setDraftNotes((prev) => ({ ...prev, [id]: notes }))
  }

  const saveRow = async (r: VocabRow) => {
    const status = getDraftStatus(r)
    if (!status) {
      setError('Choose Good or Bad before saving.')
      return
    }
    setSavingId(r.id)
    setError('')
    const notes = getDraftNotes(r).trim()
    const { error: upErr } = await supabase.from('vocabulary_illustration_reviews').upsert(
      {
        vocabulary_id: r.id,
        status,
        notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'vocabulary_id' },
    )
    setSavingId(null)
    if (upErr) {
      setError(upErr.message)
      return
    }
    setRows((prev) =>
      prev.map((row) =>
        row.id === r.id
          ? {
              ...row,
              serverReview: {
                vocabulary_id: r.id,
                status,
                notes,
                updated_at: new Date().toISOString(),
              },
            }
          : row,
      ),
    )
    setDraftStatus((prev) => {
      const n = { ...prev }
      delete n[r.id]
      return n
    })
    setDraftNotes((prev) => {
      const n = { ...prev }
      delete n[r.id]
      return n
    })
  }

  const renderItem = ({ item: r }: { item: VocabRow }) => {
    const st = getDraftStatus(r)
    const notes = getDraftNotes(r)
    const busy = savingId === r.id
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          {r.illustration_url ? (
            <Image source={{ uri: r.illustration_url }} style={styles.thumb} resizeMode="contain" />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Text style={styles.thumbPlaceholderText}>No image</Text>
            </View>
          )}
          <View style={styles.cardMeta}>
            <Text style={styles.oromo}>{r.oromo}</Text>
            <Text style={styles.english}>{r.english}</Text>
            <Text style={styles.metaSmall}>
              id {r.id}
              {r.category ? ` · ${r.category}` : ''}
              {r.part_of_speech ? ` · ${r.part_of_speech}` : ''}
            </Text>
            {r.serverReview?.updated_at ? (
              <Text style={styles.savedAt}>
                Saved {new Date(r.serverReview.updated_at).toLocaleString()}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.ratingRow}>
          <Pressable
            onPress={() => setStatusDraft(r.id, 'good')}
            style={[styles.chip, st === 'good' && styles.chipSelectedGood]}
          >
            <Text style={[styles.chipText, st === 'good' && styles.chipTextOn]}>Good</Text>
          </Pressable>
          <Pressable
            onPress={() => setStatusDraft(r.id, 'bad')}
            style={[styles.chip, st === 'bad' && styles.chipSelectedBad]}
          >
            <Text style={[styles.chipText, st === 'bad' && styles.chipTextOn]}>Bad</Text>
          </Pressable>
        </View>

        <Text style={styles.notesLabel}>Why (notes for future regeneration)</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="e.g. Wrong object, weird crop, color misleading…"
          placeholderTextColor="#6b7280"
          multiline
          value={notes}
          onChangeText={(t) => setNotesDraft(r.id, t)}
          editable={!busy}
        />

        <Pressable
          style={[styles.saveBtn, busy && styles.saveBtnDisabled]}
          onPress={() => void saveRow(r)}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#111" />
          ) : (
            <Text style={styles.saveBtnText}>Save review</Text>
          )}
        </Pressable>
      </View>
    )
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ADMIN_ACCENT_GOLD} />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <View style={styles.toolbar}>
        <TextInput
          style={styles.search}
          placeholder="Search Oromo, English, id…"
          placeholderTextColor="#6b7280"
          value={query}
          onChangeText={setQuery}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.filterChip, filter === f.key && styles.filterChipOn]}
            >
              <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextOn]}>{f.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      <Text style={styles.countLine}>
        Showing {filtered.length} of {rows.length}
      </Text>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        initialNumToRender={8}
        windowSize={7}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000000' },
  centered: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  headerBtnText: { color: ADMIN_ACCENT_GOLD, fontSize: 16, fontWeight: '600' },
  toolbar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2c2c2e',
  },
  search: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 16,
    marginBottom: 10,
  },
  filterScroll: {
    gap: 8,
    paddingBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1c1c1e',
    marginRight: 8,
  },
  filterChipOn: {
    backgroundColor: '#2d2640',
    borderWidth: 1,
    borderColor: ADMIN_ACCENT_GOLD,
  },
  filterChipText: {
    color: '#a1a1aa',
    fontSize: 14,
    fontWeight: '600',
  },
  filterChipTextOn: {
    color: ADMIN_ACCENT_GOLD,
  },
  errorBanner: {
    color: '#f87171',
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
  },
  countLine: {
    color: '#8e8e93',
    fontSize: 13,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  card: {
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 4,
  },
  cardTop: {
    flexDirection: 'row',
    gap: 14,
  },
  thumb: {
    width: 120,
    height: 120,
    borderRadius: 12,
    backgroundColor: '#2c2c2e',
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPlaceholderText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
  },
  cardMeta: {
    flex: 1,
    minWidth: 0,
  },
  oromo: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  english: {
    color: '#e5e5e5',
    fontSize: 16,
    marginTop: 4,
  },
  metaSmall: {
    color: '#8e8e93',
    fontSize: 13,
    marginTop: 8,
  },
  savedAt: {
    color: '#6ee7b7',
    fontSize: 12,
    marginTop: 6,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  chip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#2c2c2e',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chipSelectedGood: {
    borderColor: '#22c55e',
    backgroundColor: '#14532d',
  },
  chipSelectedBad: {
    borderColor: '#ef4444',
    backgroundColor: '#450a0a',
  },
  chipText: {
    color: '#d4d4d8',
    fontSize: 16,
    fontWeight: '700',
  },
  chipTextOn: {
    color: '#fff',
  },
  notesLabel: {
    color: '#a1a1aa',
    fontSize: 13,
    marginTop: 14,
    marginBottom: 6,
  },
  notesInput: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3f3f46',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  saveBtn: {
    marginTop: 12,
    backgroundColor: ADMIN_ACCENT_GOLD,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#111',
    fontSize: 16,
    fontWeight: '800',
  },
})
