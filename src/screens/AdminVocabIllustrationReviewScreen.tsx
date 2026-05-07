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

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<WordRow[]>([])
  const [filter, setFilter] = useState<FilterKey>('has_image')
  const [query, setQuery] = useState('')
  const [actionId, setActionId] = useState<string | null>(null)
  const [friendlyBusyId, setFriendlyBusyId] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editWord, setEditWord] = useState('')
  const [editTranslation, setEditTranslation] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editPos, setEditPos] = useState('')
  const [editExample, setEditExample] = useState('')
  const [editPictureFriendly, setEditPictureFriendly] = useState(true)
  const [editBusy, setEditBusy] = useState(false)
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const [newCategoryDraft, setNewCategoryDraft] = useState('')
  const [newCategoryOpen, setNewCategoryOpen] = useState(false)

  const [illustrationModalRow, setIllustrationModalRow] = useState<WordRow | null>(null)
  const [illustrationPrompt, setIllustrationPrompt] = useState('')

  const distinctCategories = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) {
      const c = String(r.category ?? '').trim()
      if (c) set.add(c)
    }
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [rows])

  const patchRow = useCallback((id: string, patch: Partial<WordRow>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }, [])

  const openEdit = (r: WordRow) => {
    setEditId(r.id)
    setEditWord(String(r.word ?? '').trim())
    setEditTranslation(String(r.translation ?? '').trim())
    setEditCategory(String(r.category ?? '').trim())
    setEditPos(String(r.part_of_speech ?? '').trim())
    setEditExample(String(r.example ?? '').trim())
    setEditPictureFriendly(r.picture_friendly !== false)
    setNewCategoryDraft('')
    setNewCategoryOpen(false)
    setCategoryPickerOpen(false)
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
      Alert.alert('Missing fields', 'Word (Afaan Oromo) and Translation (English) are required.')
      return
    }
    setEditBusy(true)
    setError('')
    let payload: Record<string, unknown>
    if (!isAdmin) {
      payload = {
        word: nextWord,
        translation: nextTranslation,
        example: editExample.trim() || null,
      }
    } else {
      payload = {
        word: nextWord,
        translation: nextTranslation,
        category: editCategory.trim() || null,
        part_of_speech: editPos.trim() || null,
        example: editExample.trim() || null,
        picture_friendly: Boolean(editPictureFriendly),
      }
    }

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

  const togglePictureFriendlyCard = async (r: WordRow, value: boolean) => {
    if (!isAdmin) return
    setFriendlyBusyId(r.id)
    setError('')
    const { error: e } = await supabase.from('words').update({ picture_friendly: value }).eq('id', r.id)
    setFriendlyBusyId(null)
    if (e) {
      setError(e.message)
      Alert.alert('Update failed', e.message)
      return
    }
    patchRow(r.id, { picture_friendly: value })
  }

  const clearIllustration = (r: WordRow) => {
    if (!isAdmin) return
    Alert.alert('Remove illustration?', 'This clears the image URL for this word.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setActionId(r.id)
          setError('')
          const { error: e } = await supabase.from('words').update({ illustration_url: null }).eq('id', r.id)
          setActionId(null)
          if (e) {
            setError(e.message)
            Alert.alert('Failed', e.message)
            return
          }
          patchRow(r.id, { illustration_url: null })
          if (illustrationModalRow?.id === r.id) {
            setIllustrationModalRow((prev) => (prev ? { ...prev, illustration_url: null } : null))
          }
        },
      },
    ])
  }

  const getVocabSecret = (): string | null => {
    const secret = getExpoPublicVocabBatchSecret().trim()
    if (!secret) {
      Alert.alert('Missing secret', 'Set EXPO_PUBLIC_VOCAB_BATCH_SECRET in admin .env, then restart Expo.')
      return null
    }
    return secret
  }

  const generateIllustration = async (wordId: string, customPrompt?: string) => {
    if (!isAdmin) return
    const secret = getVocabSecret()
    if (!secret) return
    setActionId(wordId)
    setError('')
    const body: { word_id: string; custom_prompt?: string } = { word_id: wordId }
    const p = String(customPrompt ?? '').trim()
    if (p) body.custom_prompt = p
    const { data, error: fnErr } = await supabase.functions.invoke('word-illustration-generate', {
      body,
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
      patchRow(wordId, { illustration_url: payload.illustration_url })
      setIllustrationModalRow((prev) =>
        prev && prev.id === wordId ? { ...prev, illustration_url: payload.illustration_url! } : prev,
      )
    } else {
      void load()
    }
  }

  const openIllustrationModal = (r: WordRow) => {
    if (!isAdmin) return
    if (r.picture_friendly === false) {
      Alert.alert('Not picture-friendly', 'Turn on PictureFriendly to generate illustrations.')
      return
    }
    setIllustrationPrompt('')
    setIllustrationModalRow(r)
  }

  const confirmSelectCategory = (name: string) => {
    setEditCategory(name)
    setCategoryPickerOpen(false)
    setNewCategoryOpen(false)
    setNewCategoryDraft('')
  }

  const confirmNewCategory = () => {
    const n = newCategoryDraft.trim()
    if (!n) return
    setEditCategory(n)
    setCategoryPickerOpen(false)
    setNewCategoryOpen(false)
    setNewCategoryDraft('')
  }

  const renderCategoryPickerModal = () => (
    <Modal visible={categoryPickerOpen} transparent animationType="fade" onRequestClose={() => setCategoryPickerOpen(false)}>
      <Pressable style={styles.modalOverlay} onPress={() => setCategoryPickerOpen(false)}>
        <Pressable style={styles.pickerSheet} onPress={() => {}}>
          <Text style={styles.modalTitle}>Category</Text>
          <Text style={styles.modalHint}>Pick an existing category or add a new one.</Text>
          <FlatList
            data={distinctCategories}
            keyExtractor={(item) => item}
            style={{ maxHeight: 220 }}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.pickerRow, item === editCategory && styles.pickerRowOn]}
                onPress={() => confirmSelectCategory(item)}
              >
                <Text style={styles.pickerRowText}>{item}</Text>
              </Pressable>
            )}
          />
          <Pressable
            style={[styles.secondaryBtn, { marginTop: 12 }]}
            onPress={() => {
              setNewCategoryOpen(true)
              setNewCategoryDraft(editCategory.trim() || '')
            }}
          >
            <Text style={styles.secondaryBtnText}>＋ Add new category…</Text>
          </Pressable>
          {newCategoryOpen ? (
            <>
              <TextInput
                style={styles.modalInput}
                value={newCategoryDraft}
                onChangeText={setNewCategoryDraft}
                placeholder="New category name"
                placeholderTextColor="#6b7280"
                autoCapitalize="words"
              />
              <Pressable style={[styles.saveBtn, { marginTop: 10 }]} onPress={confirmNewCategory}>
                <Text style={styles.saveBtnText}>Use this category</Text>
              </Pressable>
            </>
          ) : null}
          <Pressable style={[styles.secondaryBtn, { marginTop: 10 }]} onPress={() => setCategoryPickerOpen(false)}>
            <Text style={styles.secondaryMuted}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )

  const renderIllustrationModal = () => {
    const r = illustrationModalRow
    if (!r) return null
    const busy = actionId === r.id
    const hasImg = Boolean(r.illustration_url)
    return (
      <Modal visible={Boolean(illustrationModalRow)} transparent animationType="fade" onRequestClose={() => !busy && setIllustrationModalRow(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => !busy && setIllustrationModalRow(null)}>
          <Pressable style={styles.illModalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>Illustration</Text>
            <Text style={styles.modalHint}>
              Optional prompt guides the image. Leave blank to use the default style for this word.
            </Text>
            <Pressable
              disabled={busy}
              onPress={() => {}}
              style={styles.illPreviewWrap}
            >
              {r.illustration_url ? (
                <Image source={{ uri: r.illustration_url }} style={styles.illPreview} resizeMode="contain" />
              ) : (
                <View style={[styles.illPreview, styles.thumbPlaceholder]}>
                  <Text style={styles.thumbPlaceholderText}>No image yet</Text>
                </View>
              )}
            </Pressable>
            <Text style={styles.modalLabel}>Prompt for new image</Text>
            <TextInput
              style={[styles.modalInput, { minHeight: 72, textAlignVertical: 'top' }]}
              value={illustrationPrompt}
              onChangeText={setIllustrationPrompt}
              placeholder='e.g. "child holding umbrella in rain"'
              placeholderTextColor="#6b7280"
              multiline
              editable={!busy}
            />
            <Pressable
              style={[styles.saveBtn, busy && styles.saveBtnDisabled, { marginTop: 12 }]}
              disabled={busy}
              onPress={() => void generateIllustration(r.id, illustrationPrompt)}
            >
              {busy ? <ActivityIndicator color="#111" /> : <Text style={styles.saveBtnText}>Generate / replace image</Text>}
            </Pressable>
            {hasImg ? (
              <Pressable
                style={[styles.secondaryBtn, { marginTop: 10 }, busy && styles.btnDisabled]}
                disabled={busy}
                onPress={() => clearIllustration(r)}
              >
                <Text style={styles.dangerText}>Remove image</Text>
              </Pressable>
            ) : null}
            <Pressable style={[styles.secondaryBtn, { marginTop: 10 }, busy && styles.btnDisabled]} onPress={() => !busy && setIllustrationModalRow(null)}>
              <Text style={styles.secondaryMuted}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    )
  }

  const renderItem = ({ item: r }: { item: WordRow }) => {
    const busy = actionId === r.id
    const hasImg = Boolean(r.illustration_url)
    const friendly = r.picture_friendly !== false
    const friendlyBusy = friendlyBusyId === r.id

    const imageTile = (
      <Pressable
        onPress={() => openIllustrationModal(r)}
        disabled={!isAdmin}
        style={[styles.thumb, !isAdmin && styles.thumbDisabled]}
      >
        {r.illustration_url ? (
          <Image source={{ uri: r.illustration_url }} style={styles.thumbImage} resizeMode="contain" />
        ) : (
          <View style={[styles.thumbImage, styles.thumbPlaceholder]}>
            <Text style={styles.thumbPlaceholderText}>{isAdmin ? 'Tap to add' : 'No image'}</Text>
          </View>
        )}
      </Pressable>
    )

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View>
            {imageTile}
            {isAdmin ? (
              <View style={styles.cardPictureControls}>
                <View style={styles.cardToggleRow}>
                  <Text style={styles.cardToggleLabel}>PictureFriendly</Text>
                  {friendlyBusy ? (
                    <ActivityIndicator size="small" color={ADMIN_ACCENT_GOLD} />
                  ) : (
                    <Switch
                      value={friendly}
                      onValueChange={(v) => void togglePictureFriendlyCard(r, v)}
                      disabled={busy}
                      trackColor={{ false: '#334155', true: 'rgba(212,175,55,0.35)' }}
                      thumbColor={friendly ? ADMIN_ACCENT_GOLD : '#94a3b8'}
                    />
                  )}
                </View>
                <Pressable
                  style={[styles.microBtn, busy && styles.btnDisabled]}
                  onPress={() => clearIllustration(r)}
                  disabled={busy || !hasImg}
                >
                  <Text style={styles.dangerText}>Delete image</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
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
            <Text style={styles.secondaryMuted}>Edit word</Text>
          </Pressable>
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
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>{isAdmin ? 'Edit word (admin)' : 'Edit word'}</Text>
              <Text style={styles.modalHint}>
                {isAdmin
                  ? 'Tap the illustration on the card to generate or replace the image. Category uses existing values or add new.'
                  : 'You can edit Word (Afaan Oromo), Translation (English), and Sentence.'}
              </Text>

              <Text style={styles.modalLabel}>Word — Afaan Oromo</Text>
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

              <Text style={styles.modalLabel}>Translation — English</Text>
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

              {isAdmin ? (
                <>
                  <Text style={styles.modalLabel}>Category</Text>
                  <Pressable
                    style={[styles.modalInput, styles.categoryTrigger]}
                    onPress={() => setCategoryPickerOpen(true)}
                    disabled={editBusy}
                  >
                    <Text style={{ color: editCategory.trim() ? '#fff' : '#6b7280' }}>
                      {editCategory.trim() || 'Select or add category…'}
                    </Text>
                  </Pressable>

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
                </>
              ) : null}

              <Text style={styles.modalLabel}>Sentence</Text>
              <TextInput
                style={[styles.modalInput, { minHeight: 88, textAlignVertical: 'top' }]}
                value={editExample}
                onChangeText={setEditExample}
                placeholder="Example sentence…"
                placeholderTextColor="#6b7280"
                editable={!editBusy}
                multiline
              />

              {isAdmin ? (
                <View style={styles.modalSwitchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>PictureFriendly</Text>
                    <Text style={styles.modalHint}>When off, illustration generation is blocked.</Text>
                  </View>
                  <Switch
                    value={editPictureFriendly}
                    onValueChange={setEditPictureFriendly}
                    disabled={editBusy}
                    trackColor={{ false: '#334155', true: 'rgba(212,175,55,0.35)' }}
                    thumbColor={editPictureFriendly ? ADMIN_ACCENT_GOLD : '#94a3b8'}
                  />
                </View>
              ) : null}

              <Pressable
                style={[styles.saveBtn, editBusy && styles.saveBtnDisabled, { marginTop: 12 }]}
                onPress={() => void saveEdit()}
                disabled={editBusy}
              >
                {editBusy ? <ActivityIndicator color="#111" /> : <Text style={styles.saveBtnText}>Save</Text>}
              </Pressable>
              <Pressable style={[styles.secondaryBtn, { marginTop: 10 }, editBusy && styles.btnDisabled]} onPress={() => !editBusy && setEditOpen(false)}>
                <Text style={styles.secondaryMuted}>Cancel</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {renderCategoryPickerModal()}
      {renderIllustrationModal()}

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
  filterScroll: { gap: 8, paddingBottom: 8 },
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
    width: 100,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    backgroundColor: '#0b1020',
  },
  thumbDisabled: { opacity: 0.95 },
  thumbImage: { width: 100, height: 100 },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  thumbPlaceholderText: { color: '#6b7280', fontSize: 11, fontWeight: '700', textAlign: 'center', paddingHorizontal: 6 },
  cardPictureControls: {
    marginTop: 10,
    gap: 8,
    maxWidth: 100,
  },
  cardToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  cardToggleLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '700', flex: 1 },
  microBtn: {
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    backgroundColor: 'rgba(127,29,29,0.2)',
  },
  cardMeta: { flex: 1, minWidth: 0 },
  oromo: { color: '#fff', fontSize: 20, fontWeight: '900' },
  english: { color: '#e5e7eb', fontSize: 15, fontWeight: '700', marginTop: 4 },
  metaSmall: { color: '#a1a1aa', fontSize: 12, marginTop: 6 },
  imageActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12, alignItems: 'center' },
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
    alignItems: 'center',
  },
  secondaryAccent: {
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.14)',
  },
  secondaryBtnText: { color: '#fff', fontWeight: '800' },
  secondaryMuted: { color: '#cbd5e1', fontWeight: '800' },
  dangerText: { color: '#fca5a5', fontWeight: '800', fontSize: 13 },
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
    maxHeight: '88%',
    backgroundColor: '#0b1220',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.18)',
    padding: 14,
  },
  pickerSheet: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '80%',
    backgroundColor: '#0b1220',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.18)',
    padding: 14,
  },
  illModalSheet: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '92%',
    backgroundColor: '#0b1220',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.18)',
    padding: 14,
  },
  illPreviewWrap: { alignSelf: 'center', marginTop: 12 },
  illPreview: {
    width: 220,
    height: 220,
    borderRadius: 12,
    backgroundColor: '#0b1020',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
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
  categoryTrigger: {
    justifyContent: 'center',
    minHeight: 44,
  },
  pickerRow: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.15)',
  },
  pickerRowOn: { backgroundColor: 'rgba(212,175,55,0.12)' },
  pickerRowText: { color: '#e5e7eb', fontSize: 15 },
  modalSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
})
