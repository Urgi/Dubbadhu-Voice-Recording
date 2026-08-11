import { useCallback, useLayoutEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import type { StackScreenProps } from '@react-navigation/stack'
import { ADMIN_ACCENT_GOLD } from '../components/lesson-config/AdminLessonConfigChrome'
import supabase from '../lib/supabase'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminProverbs'>

type ProverbRow = {
  id: string
  language: 'oromo' | 'amharic'
  native_text: string
  english: string
  sort_order: number
  is_published: boolean
  updated_at?: string
}

type ProverbDraft = {
  id?: string
  language: 'oromo' | 'amharic'
  native_text: string
  english: string
  is_published: boolean
}

const LANGS: Array<'oromo' | 'amharic'> = ['oromo', 'amharic']

function emptyDraft(language: 'oromo' | 'amharic'): ProverbDraft {
  return {
    language,
    native_text: '',
    english: '',
    is_published: true,
  }
}

export default function AdminProverbsScreen({ navigation }: Props) {
  const [language, setLanguage] = useState<'oromo' | 'amharic'>('oromo')
  const [rows, setRows] = useState<ProverbRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState<ProverbDraft>(() => emptyDraft('oromo'))

  const load = useCallback(async () => {
    setError('')
    const { data, error: err } = await supabase
      .from('proverbs')
      .select('id, language, native_text, english, sort_order, is_published, updated_at')
      .eq('language', language)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (err) {
      setError(err.message)
      setRows([])
    } else {
      setRows((data || []) as ProverbRow[])
    }
  }, [language])

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void (async () => {
        setLoading(true)
        await load()
        if (!cancelled) setLoading(false)
      })()
      return () => {
        cancelled = true
      }
    }, [load]),
  )

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Proverbs',
      headerStyle: { backgroundColor: '#000000' },
      headerTitleStyle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
      headerTintColor: '#ffffff',
      headerRight: () => (
        <Pressable
          onPress={() => {
            setDraft(emptyDraft(language))
            setEditorOpen(true)
          }}
          style={{ paddingHorizontal: 12, paddingVertical: 6 }}
        >
          <Text style={{ color: ADMIN_ACCENT_GOLD, fontWeight: '700' }}>Add</Text>
        </Pressable>
      ),
    })
  }, [navigation, language])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const openEdit = useCallback((row: ProverbRow) => {
    setDraft({
      id: row.id,
      language: row.language,
      native_text: row.native_text || '',
      english: row.english || '',
      is_published: row.is_published !== false,
    })
    setEditorOpen(true)
  }, [])

  const saveDraft = useCallback(async () => {
    const native_text = draft.native_text.trim()
    if (!native_text) {
      Alert.alert('Missing fields', 'Proverb text is required.')
      return
    }
    setSaving(true)
    const payload = {
      language: draft.language,
      native_text,
      english: draft.english.trim(),
      is_published: draft.is_published,
    }

    let errMsg = ''
    if (draft.id) {
      const { error: err } = await supabase.from('proverbs').update(payload).eq('id', draft.id)
      errMsg = err?.message || ''
    } else {
      const nextSort =
        rows.reduce((m, r) => Math.max(m, Number(r.sort_order) || 0), -1) + 1
      const { error: err } = await supabase.from('proverbs').insert({
        ...payload,
        sort_order: nextSort,
      })
      errMsg = err?.message || ''
    }
    setSaving(false)
    if (errMsg) {
      Alert.alert('Save failed', errMsg)
      return
    }
    setEditorOpen(false)
    await load()
  }, [draft, load, rows])

  const removeProverb = useCallback(
    (row: ProverbRow) => {
      Alert.alert('Delete proverb?', row.native_text.slice(0, 80), [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const { error: err } = await supabase.from('proverbs').delete().eq('id', row.id)
              if (err) Alert.alert('Delete failed', err.message)
              else await load()
            })()
          },
        },
      ])
    },
    [load],
  )

  const moveProverb = useCallback(
    async (row: ProverbRow, direction: -1 | 1) => {
      const idx = rows.findIndex((r) => r.id === row.id)
      const swapWith = rows[idx + direction]
      if (!swapWith) return
      const a = Number(row.sort_order) || idx
      const b = Number(swapWith.sort_order) || idx + direction
      const { error: e1 } = await supabase
        .from('proverbs')
        .update({ sort_order: b })
        .eq('id', row.id)
      const { error: e2 } = await supabase
        .from('proverbs')
        .update({ sort_order: a })
        .eq('id', swapWith.id)
      if (e1 || e2) {
        Alert.alert('Reorder failed', e1?.message || e2?.message || 'Unknown error')
        return
      }
      await load()
    },
    [load, rows],
  )

  return (
    <View style={styles.screen}>
      <View style={styles.langRow}>
        {LANGS.map((lang) => (
          <Pressable
            key={lang}
            style={[styles.langChip, language === lang && styles.langChipOn]}
            onPress={() => setLanguage(lang)}
          >
            <Text style={[styles.langChipText, language === lang && styles.langChipTextOn]}>
              {lang === 'oromo' ? 'Oromo' : 'Amharic'}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={ADMIN_ACCENT_GOLD} style={{ marginTop: 24 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <Text style={styles.hint}>
            Native proverb + English translation. Publish to show on Home → Proverbs. Reorder with
            ↑↓.
          </Text>
          {rows.length === 0 ? (
            <Text style={styles.empty}>No proverbs yet for this language. Tap Add.</Text>
          ) : null}
          {rows.map((row, index) => (
            <View key={row.id} style={styles.card}>
              <Pressable onPress={() => openEdit(row)}>
                <Text style={styles.cardTitle}>
                  {row.native_text}
                  {!row.is_published ? ' · draft' : ''}
                </Text>
                {row.english ? (
                  <Text style={styles.cardMeta} numberOfLines={2}>
                    {row.english}
                  </Text>
                ) : null}
              </Pressable>
              <View style={styles.cardActions}>
                <Pressable onPress={() => void moveProverb(row, -1)} disabled={index === 0}>
                  <Text style={[styles.action, index === 0 && styles.actionDisabled]}>↑</Text>
                </Pressable>
                <Pressable
                  onPress={() => void moveProverb(row, 1)}
                  disabled={index === rows.length - 1}
                >
                  <Text
                    style={[styles.action, index === rows.length - 1 && styles.actionDisabled]}
                  >
                    ↓
                  </Text>
                </Pressable>
                <Pressable onPress={() => openEdit(row)}>
                  <Text style={styles.action}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => removeProverb(row)}>
                  <Text style={[styles.action, styles.actionDanger]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <Modal visible={editorOpen} animationType="slide" transparent>
        <View style={styles.modalRoot}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{draft.id ? 'Edit proverb' : 'Add proverb'}</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              <Text style={styles.label}>
                {draft.language === 'amharic' ? 'Amharic text' : 'Afaan Oromo text'}
              </Text>
              <TextInput
                style={[styles.input, styles.inputMulti]}
                multiline
                placeholderTextColor="#666"
                value={draft.native_text}
                onChangeText={(native_text) => setDraft((d) => ({ ...d, native_text }))}
              />
              <Text style={styles.label}>English</Text>
              <TextInput
                style={[styles.input, styles.inputMulti]}
                multiline
                placeholderTextColor="#666"
                value={draft.english}
                onChangeText={(english) => setDraft((d) => ({ ...d, english }))}
              />
              <View style={styles.publishRow}>
                <Text style={styles.label}>Published</Text>
                <Switch
                  value={draft.is_published}
                  onValueChange={(is_published) => setDraft((d) => ({ ...d, is_published }))}
                />
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setEditorOpen(false)} style={styles.modalBtn}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void saveDraft()}
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                disabled={saving}
              >
                <Text style={[styles.modalBtnText, styles.modalBtnPrimaryText]}>
                  {saving ? 'Saving…' : 'Save'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 16, paddingBottom: 40 },
  langRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  langChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  langChipOn: { borderColor: ADMIN_ACCENT_GOLD, backgroundColor: 'rgba(212,164,55,0.12)' },
  langChipText: { color: '#aaa', fontWeight: '600' },
  langChipTextOn: { color: ADMIN_ACCENT_GOLD },
  hint: { color: '#888', fontSize: 12, marginBottom: 12, lineHeight: 17 },
  empty: { color: '#777', marginTop: 20 },
  error: { color: '#f87171', paddingHorizontal: 16, marginTop: 8 },
  card: {
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: { color: '#fff', fontWeight: '700', fontSize: 15, lineHeight: 21 },
  cardMeta: { color: '#aaa', marginTop: 6, fontSize: 13, lineHeight: 18 },
  cardActions: { flexDirection: 'row', gap: 16, marginTop: 12 },
  action: { color: ADMIN_ACCENT_GOLD, fontWeight: '700' },
  actionDisabled: { color: '#444' },
  actionDanger: { color: '#f87171' },
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#121212',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#333',
    padding: 16,
  },
  modalTitle: { color: '#fff', fontWeight: '800', fontSize: 17, marginBottom: 12 },
  label: { color: '#bbb', fontSize: 12, marginTop: 10, marginBottom: 4 },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    color: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  publishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 14 },
  modalBtn: { paddingHorizontal: 14, paddingVertical: 10 },
  modalBtnPrimary: {
    backgroundColor: ADMIN_ACCENT_GOLD,
    borderRadius: 8,
  },
  modalBtnText: { color: '#ccc', fontWeight: '700' },
  modalBtnPrimaryText: { color: '#111' },
})
