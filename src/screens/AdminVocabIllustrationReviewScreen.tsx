import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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
import { ADMIN_ACCENT_GOLD } from '../components/lesson-config/AdminLessonConfigChrome'
import { useAuth } from '../context/AuthContext'
import { getExpoPublicVocabBatchSecret } from '../lib/expoPublicEnv'
import supabase from '../lib/supabase'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminVocabIllustrationReview'>

type WordRow = {
  id: string
  word: string
  translation: string | null
  category: string | null
  part_of_speech: string | null
  definition: string | null
  example: string | null
  illustration_url: string | null
  picture_friendly: boolean | null
}

type FilterKey = 'all' | 'has_image' | 'no_image' | 'picture_friendly' | 'not_picture_friendly'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'has_image', label: 'Has image' },
  { key: 'no_image', label: 'No image' },
  { key: 'picture_friendly', label: 'PictureFriendly' },
  { key: 'not_picture_friendly', label: 'Not picture-friendly' },
]

export default function AdminVocabIllustrationReviewScreen({ navigation }: Props) {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const canGenerate = role === 'admin' || role === 'voice'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<WordRow[]>([])
  const [filter, setFilter] = useState<FilterKey>('has_image')
  const [query, setQuery] = useState('')
  const [actionId, setActionId] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editWord, setEditWord] = useState('')
  const [editTranslation, setEditTranslation] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editPos, setEditPos] = useState('')
  const [editDefinition, setEditDefinition] = useState('')
  const [editExample, setEditExample] = useState('')
  const [editIllustrationUrl, setEditIllustrationUrl] = useState('')
  const [editPictureFriendly, setEditPictureFriendly] = useState(true)
  const [editBusy, setEditBusy] = useState(false)

  const openEdit = (r: WordRow) => {
    setEditId(r.id)
    setEditWord(String(r.word ?? '').trim())
    setEditTranslation(String(r.translation ?? '').trim())
    setEditCategory(String(r.category ?? '').trim())
    setEditPos(String(r.part_of_speech ?? '').trim())
    setEditDefinition(String(r.definition ?? '').trim())
    setEditExample(String(r.example ?? '').trim())
    setEditIllustrationUrl(String(r.illustration_url ?? '').trim())
    setEditPictureFriendly(r.picture_friendly !== false)
    setEditOpen(true)
  }

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    const { data, error: e } = await supabase
      .from('words')
      .select('id, word, translation, category, part_of_speech, definition, example, illustration_url, picture_friendly')
      .order('word', { ascending: true })
      .limit(5000)
    if (e) {
      setError(e.message)
      setRows([])
      setLoading(false)
      return
    }
    const out: WordRow[] = (data ?? [])
      .map((r) => ({
        id: String((r as { id?: unknown }).id ?? ''),
        word: String((r as { word?: unknown }).word ?? ''),
        translation: (r as { translation?: unknown }).translation ? String((r as { translation?: unknown }).translation) : null,
        category: (r as { category?: unknown }).category ? String((r as { category?: unknown }).category) : null,
        part_of_speech: (r as { part_of_speech?: unknown }).part_of_speech
          ? String((r as { part_of_speech?: unknown }).part_of_speech)
          : null,
        definition: (r as { definition?: unknown }).definition ? String((r as { definition?: unknown }).definition) : null,
        example: (r as { example?: unknown }).example ? String((r as { example?: unknown }).example) : null,
        illustration_url: (r as { illustration_url?: unknown }).illustration_url
          ? String((r as { illustration_url?: unknown }).illustration_url).trim()
          : null,
        picture_friendly: ((r as { picture_friendly?: unknown }).picture_friendly as boolean | null | undefined) ?? null,
      }))
      .filter((r) => r.id && r.word)
    setRows(out)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    navigation.setOptions({
      title: 'Vocab Center',
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
        const id = String(r.id).toLowerCase()
        const w = String(r.word).toLowerCase()
        const t = String(r.translation ?? '').toLowerCase()
        const cat = String(r.category ?? '').toLowerCase()
        if (!id.includes(q) && !w.includes(q) && !t.includes(q) && !cat.includes(q)) return false
      }
      const hasImg = Boolean(r.illustration_url && r.illustration_url.trim())
      const friendly = r.picture_friendly !== false
      switch (filter) {
        case 'has_image':
          return hasImg
        case 'no_image':
          return !hasImg
        case 'picture_friendly':
          return friendly
        case 'not_picture_friendly':
          return !friendly
        default:
          return true
      }
    })
  }, [rows, filter, query])

  const saveEdit = async () => {
    const id = editId
    if (!id) return
    const nextWord = editWord.trim()
    const nextTranslation = editTranslation.trim()
    if (!nextWord || !nextTranslation) {
      Alert.alert('Missing fields', 'Both Afaan Oromo (word) and English (translation) are required.')
      return
    }
    setEditBusy(true)
    setError('')
    const payload: Record<string, unknown> = {
      word: nextWord,
      translation: nextTranslation,
      category: editCategory.trim() || null,
      part_of_speech: editPos.trim() || null,
      definition: editDefinition.trim() || null,
      example: editExample.trim() || null,
      illustration_url: editIllustrationUrl.trim() || null,
    }
    if (isAdmin) payload.picture_friendly = Boolean(editPictureFriendly)

    const { data, error: e } = await supabase
      .from('words')
      .update(payload)
      .eq('id', id)
      .select('id, word, translation, category, part_of_speech, definition, example, illustration_url, picture_friendly')
      .single()
    setEditBusy(false)
    if (e) {
      setError(e.message)
      return
    }
    const row = data as unknown as WordRow
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...row } : r)))
    setEditOpen(false)
  }

  const generateImageNow = async (r: WordRow) => {
    if (!canGenerate) return
    const friendly = r.picture_friendly !== false
    if (!friendly && role === 'voice') {
      Alert.alert('Not picture-friendly', 'Admin marked this word as not picture-friendly. You can still edit text.')
      return
    }
    const secret = getExpoPublicVocabBatchSecret().trim()
    if (!secret) {
      Alert.alert('Missing secret', 'Set EXPO_PUBLIC_VOCAB_BATCH_SECRET in admin .env, then restart Expo.')
      return
    }
    setActionId(r.id)
    setError('')
    const { data, error: fnErr } = await supabase.functions.invoke('word-illustration-generate', {
      body: { word_id: r.id },
      headers: { 'x-vocab-batch-secret': secret },
    })
    setActionId(null)
    if (fnErr) {
      setError(fnErr.message)
      Alert.alert('Generate failed', fnErr.message, [{ text: 'OK' }])
      return
    }
    const payload = data as { ok?: boolean; error?: string; illustration_url?: string }
    if (payload?.error) {
      setError(payload.error)
      Alert.alert('Generate failed', payload.error, [{ text: 'OK' }])
      return
    }
    if (payload?.illustration_url) {
      setRows((prev) => prev.map((row) => (row.id === r.id ? { ...row, illustration_url: payload.illustration_url! } : row)))
    } else {
      void load()
    }
  }

  const renderItem = ({ item: r }: { item: WordRow }) => {
    const busy = actionId === r.id
    const hasImg = Boolean(r.illustration_url)
    const friendly = r.picture_friendly !== false
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
            <Text style={styles.oromo}>{r.word}</Text>
            <Text style={styles.english}>{String(r.translation ?? '').trim() || '—'}</Text>
            <Text style={styles.metaSmall}>
              {r.category ? `${r.category}` : '—'}
              {r.part_of_speech ? ` · ${r.part_of_speech}` : ''}
              {friendly ? ' · PictureFriendly' : ' · Not picture-friendly'}
            </Text>
            <Text style={styles.metaSmall}>id {r.id}</Text>
          </View>
        </View>

        <View style={styles.imageActions}>
          <Pressable style={[styles.secondaryBtn, busy && styles.btnDisabled]} onPress={() => openEdit(r)} disabled={busy}>
            <Text style={styles.secondaryMuted}>Edit</Text>
          </Pressable>
          {!hasImg ? (
            <Pressable
              style={[
                styles.secondaryBtn,
                styles.secondaryAccent,
                (busy || !canGenerate || (!friendly && role === 'voice')) && styles.btnDisabled,
              ]}
              onPress={() => void generateImageNow(r)}
              disabled={busy || !canGenerate || (!friendly && role === 'voice')}
            >
              <Text style={styles.secondaryBtnText}>Generate image</Text>
            </Pressable>
          ) : null}
          {busy ? <ActivityIndicator size="small" color={ADMIN_ACCENT_GOLD} style={styles.inlineSpinner} /> : null}
        </View>
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
          placeholder="Search word, translation, category, id…"
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

      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => !editBusy && setEditOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => !editBusy && setEditOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>Edit word</Text>
            <Text style={styles.modalHint}>
              Voice actor can edit text + image. Admin can also toggle PictureFriendly.
            </Text>

            <Text style={styles.modalLabel}>Afaan Oromo (word)</Text>
            <TextInput
              style={styles.modalInput}
              value={editWord}
              onChangeText={setEditWord}
              placeholder="Afaan Oromo…"
              placeholderTextColor="#6b7280"
              editable={!editBusy}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.modalLabel}>English (translation)</Text>
            <TextInput
              style={styles.modalInput}
              value={editTranslation}
              onChangeText={setEditTranslation}
              placeholder="English…"
              placeholderTextColor="#6b7280"
              editable={!editBusy}
              autoCapitalize="sentences"
              autoCorrect
            />

            <Text style={styles.modalLabel}>Category</Text>
            <TextInput
              style={styles.modalInput}
              value={editCategory}
              onChangeText={setEditCategory}
              placeholder="e.g. Weather, Emotion…"
              placeholderTextColor="#6b7280"
              editable={!editBusy}
              autoCapitalize="words"
            />

            <Text style={styles.modalLabel}>Part of speech</Text>
            <TextInput
              style={styles.modalInput}
              value={editPos}
              onChangeText={setEditPos}
              placeholder="e.g. noun, verb…"
              placeholderTextColor="#6b7280"
              editable={!editBusy}
              autoCapitalize="none"
            />

            <Text style={styles.modalLabel}>Definition (optional)</Text>
            <TextInput
              style={[styles.modalInput, { minHeight: 64, textAlignVertical: 'top' }]}
              value={editDefinition}
              onChangeText={setEditDefinition}
              placeholder="Longer definition…"
              placeholderTextColor="#6b7280"
              editable={!editBusy}
              multiline
            />

            <Text style={styles.modalLabel}>Example sentence (optional)</Text>
            <TextInput
              style={[styles.modalInput, { minHeight: 64, textAlignVertical: 'top' }]}
              value={editExample}
              onChangeText={setEditExample}
              placeholder="Example sentence…"
              placeholderTextColor="#6b7280"
              editable={!editBusy}
              multiline
            />

            <Text style={styles.modalLabel}>Illustration URL</Text>
            <TextInput
              style={styles.modalInput}
              value={editIllustrationUrl}
              onChangeText={setEditIllustrationUrl}
              placeholder="https://…"
              placeholderTextColor="#6b7280"
              editable={!editBusy}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalSwitchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalLabel}>PictureFriendly</Text>
                <Text style={styles.modalHint}>
                  Voice actor cannot generate images when off. Admin only.
                </Text>
              </View>
              <Switch
                value={editPictureFriendly}
                onValueChange={setEditPictureFriendly}
                disabled={!isAdmin || editBusy}
                trackColor={{ false: '#334155', true: 'rgba(212,175,55,0.35)' }}
                thumbColor={editPictureFriendly ? ADMIN_ACCENT_GOLD : '#94a3b8'}
              />
            </View>

            <Pressable
              style={[styles.saveBtn, editBusy && styles.saveBtnDisabled, { marginTop: 12 }]}
              onPress={() => void saveEdit()}
              disabled={editBusy}
            >
              {editBusy ? <ActivityIndicator color="#111" /> : <Text style={styles.saveBtnText}>Save</Text>}
            </Pressable>
            <Pressable
              style={[styles.secondaryBtn, { marginTop: 10 }, editBusy && styles.btnDisabled]}
              onPress={() => !editBusy && setEditOpen(false)}
              disabled={editBusy}
            >
              <Text style={styles.secondaryMuted}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        initialNumToRender={10}
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
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(2,6,23,0.35)',
  },
  filterChipOn: {
    borderColor: ADMIN_ACCENT_GOLD,
    backgroundColor: 'rgba(212,175,55,0.14)',
  },
  filterChipText: { color: '#cbd5e1', fontWeight: '700' },
  filterChipTextOn: { color: '#fff' },
  errorBanner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fecaca',
    backgroundColor: 'rgba(239,68,68,0.14)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(239,68,68,0.35)',
  },
  countLine: { color: '#a1a1aa', paddingHorizontal: 16, paddingVertical: 10 },
  listContent: { padding: 16, paddingBottom: 40, gap: 16 },
  card: {
    backgroundColor: '#0b1220',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    padding: 12,
  },
  cardTop: { flexDirection: 'row', gap: 12 },
  thumb: {
    width: 82,
    height: 82,
    borderRadius: 12,
    backgroundColor: '#0b1020',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
  },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  thumbPlaceholderText: { color: '#6b7280', fontSize: 12, fontWeight: '700' },
  cardMeta: { flex: 1, minWidth: 0 },
  oromo: { color: '#fff', fontSize: 20, fontWeight: '900' },
  english: { color: '#e5e7eb', fontSize: 15, fontWeight: '700', marginTop: 4 },
  metaSmall: { color: '#a1a1aa', fontSize: 12, marginTop: 6 },
  imageActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
    alignItems: 'center',
  },
  saveBtn: {
    backgroundColor: ADMIN_ACCENT_GOLD,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#111', fontSize: 16, fontWeight: '900' },
  secondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
    backgroundColor: 'rgba(2,6,23,0.25)',
  },
  secondaryAccent: {
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.14)',
  },
  secondaryBtnText: { color: '#fff', fontWeight: '800' },
  secondaryMuted: { color: '#cbd5e1', fontWeight: '800' },
  btnDisabled: { opacity: 0.6 },
  inlineSpinner: { marginLeft: 6 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalSheet: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#0b1220',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.18)',
    padding: 14,
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  modalHint: { color: '#a1a1aa', fontSize: 12, marginTop: 8, lineHeight: 17 },
  modalLabel: { color: '#e5e7eb', fontSize: 13, fontWeight: '800', marginTop: 12 },
  modalInput: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.26)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    backgroundColor: 'rgba(2,6,23,0.55)',
    fontSize: 15,
  },
  modalSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
})

