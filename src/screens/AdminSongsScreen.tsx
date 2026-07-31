import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
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

type Props = StackScreenProps<RootStackParamList, 'AdminSongs'>

type SongRow = {
  id: string
  language: 'oromo' | 'amharic'
  type: string
  title: string
  artist: string
  youtube_url: string
  description: string
  phrases: { term?: string; english?: string }[]
  sort_order: number
  is_published: boolean
  updated_at?: string
}

type RecRow = {
  id: string
  language: string
  title: string
  youtube_url: string
  status: string
  created_at: string
}

const LANGS: Array<'oromo' | 'amharic'> = ['oromo', 'amharic']
const DEFAULT_TYPES: Record<'oromo' | 'amharic', string[]> = {
  oromo: ['Modern', 'Oldies', 'Faarfannaa'],
  amharic: ['Modern', 'Classics', 'Mezmur'],
}

function phrasesToText(phrases: SongRow['phrases']): string {
  return (phrases || [])
    .map((p) => `${String(p.term || '').trim()} | ${String(p.english || '').trim()}`)
    .filter((line) => line !== ' | ')
    .join('\n')
}

function textToPhrases(text: string): { term: string; english: string }[] {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [term, ...rest] = line.split('|')
      return {
        term: String(term || '').trim(),
        english: rest.join('|').trim(),
      }
    })
    .filter((p) => p.term || p.english)
}

function emptyDraft(language: 'oromo' | 'amharic'): SongDraft {
  return {
    language,
    type: DEFAULT_TYPES[language][0],
    title: '',
    artist: '',
    youtube_url: '',
    description: '',
    phrasesText: '',
    is_published: true,
  }
}

export default function AdminSongsScreen({ navigation }: Props) {
  const [language, setLanguage] = useState<'oromo' | 'amharic'>('oromo')
  const [rows, setRows] = useState<SongRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState<SongDraft>(() => emptyDraft('oromo'))
  const [recs, setRecs] = useState<RecRow[]>([])

  const load = useCallback(async () => {
    setError('')
    const { data, error: err } = await supabase
      .from('songs')
      .select(
        'id, language, type, title, artist, youtube_url, description, phrases, sort_order, is_published, updated_at',
      )
      .eq('language', language)
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true })
    if (err) {
      setError(err.message)
      setRows([])
    } else {
      setRows((data || []) as SongRow[])
    }

    const { data: recData } = await supabase
      .from('song_recommendations')
      .select('id, language, title, youtube_url, status, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(40)
    setRecs((recData || []) as RecRow[])
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
      title: 'Songs / Music',
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

  const openEdit = useCallback((row: SongRow) => {
    setDraft({
      id: row.id,
      language: row.language,
      type: row.type,
      title: row.title,
      artist: row.artist,
      youtube_url: row.youtube_url,
      description: row.description || '',
      phrasesText: phrasesToText(row.phrases),
      is_published: row.is_published !== false,
    })
    setEditorOpen(true)
  }, [])

  const saveDraft = useCallback(async () => {
    const title = draft.title.trim()
    const youtube_url = draft.youtube_url.trim()
    if (!title || !youtube_url) {
      Alert.alert('Missing fields', 'Title and YouTube link are required.')
      return
    }
    setSaving(true)
    const phrases = textToPhrases(draft.phrasesText)
    const payload = {
      language: draft.language,
      type: draft.type.trim() || DEFAULT_TYPES[draft.language][0],
      title,
      artist: draft.artist.trim(),
      youtube_url,
      description: draft.description.trim(),
      phrases,
      is_published: draft.is_published,
    }

    let errMsg = ''
    if (draft.id) {
      const { error: err } = await supabase.from('songs').update(payload).eq('id', draft.id)
      errMsg = err?.message || ''
    } else {
      const nextSort =
        rows.reduce((m, r) => Math.max(m, Number(r.sort_order) || 0), -1) + 1
      const { error: err } = await supabase.from('songs').insert({
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

  const removeSong = useCallback(
    (row: SongRow) => {
      Alert.alert('Delete song?', `${row.title} — ${row.artist}`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const { error: err } = await supabase.from('songs').delete().eq('id', row.id)
              if (err) Alert.alert('Delete failed', err.message)
              else await load()
            })()
          },
        },
      ])
    },
    [load],
  )

  const moveSong = useCallback(
    async (row: SongRow, direction: -1 | 1) => {
      const idx = rows.findIndex((r) => r.id === row.id)
      const swapWith = rows[idx + direction]
      if (!swapWith) return
      const a = Number(row.sort_order) || idx
      const b = Number(swapWith.sort_order) || idx + direction
      const { error: e1 } = await supabase.from('songs').update({ sort_order: b }).eq('id', row.id)
      const { error: e2 } = await supabase
        .from('songs')
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

  const typeOptions = useMemo(() => {
    const fromRows = rows.map((r) => r.type).filter(Boolean)
    return Array.from(new Set([...DEFAULT_TYPES[language], ...fromRows]))
  }, [language, rows])

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
            Store YouTube links only. Thumbnails are derived in the learner app. Reorder with ↑↓.
            Saving bumps updated_at (Home yellow-dot).
          </Text>
          {recs.length > 0 ? (
            <View style={styles.recsBlock}>
              <Text style={styles.recsTitle}>Pending recommendations ({recs.length})</Text>
              {recs.map((rec) => (
                <View key={rec.id} style={styles.recCard}>
                  <Text style={styles.cardTitle}>{rec.title}</Text>
                  <Text style={styles.cardMeta}>
                    {rec.language} · {new Date(rec.created_at).toLocaleDateString()}
                  </Text>
                  <Text style={styles.cardUrl} numberOfLines={2}>
                    {rec.youtube_url}
                  </Text>
                  <View style={styles.cardActions}>
                    <Pressable
                      onPress={() => {
                        setDraft({
                          ...emptyDraft(
                            rec.language === 'amharic' ? 'amharic' : 'oromo',
                          ),
                          title: rec.title,
                          youtube_url: rec.youtube_url,
                        })
                        setEditorOpen(true)
                      }}
                    >
                      <Text style={styles.action}>Add as song</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        void (async () => {
                          await supabase
                            .from('song_recommendations')
                            .update({ status: 'rejected' })
                            .eq('id', rec.id)
                          await load()
                        })()
                      }}
                    >
                      <Text style={[styles.action, styles.actionDanger]}>Dismiss</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
          {rows.length === 0 ? (
            <Text style={styles.empty}>No songs yet for this language. Tap Add.</Text>
          ) : null}
          {rows.map((row, index) => (
            <View key={row.id} style={styles.card}>
              <Pressable onPress={() => openEdit(row)}>
                <Text style={styles.cardTitle}>
                  {row.title}
                  {!row.is_published ? ' · draft' : ''}
                </Text>
                <Text style={styles.cardMeta}>
                  {row.artist || '—'} · {row.type} · #{row.sort_order}
                </Text>
                <Text style={styles.cardUrl} numberOfLines={1}>
                  {row.youtube_url}
                </Text>
              </Pressable>
              <View style={styles.cardActions}>
                <Pressable onPress={() => void moveSong(row, -1)} disabled={index === 0}>
                  <Text style={[styles.action, index === 0 && styles.actionDisabled]}>↑</Text>
                </Pressable>
                <Pressable
                  onPress={() => void moveSong(row, 1)}
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
                <Pressable onPress={() => removeSong(row)}>
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
            <Text style={styles.modalTitle}>{draft.id ? 'Edit song' : 'Add song'}</Text>
            <ScrollView style={{ maxHeight: 480 }}>
              <Text style={styles.label}>Type / tab</Text>
              <View style={styles.typeRow}>
                {typeOptions.map((t) => (
                  <Pressable
                    key={t}
                    style={[styles.typeChip, draft.type === t && styles.typeChipOn]}
                    onPress={() => setDraft((d) => ({ ...d, type: t }))}
                  >
                    <Text style={styles.typeChipText}>{t}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={styles.input}
                placeholder="Or type a custom tab name"
                placeholderTextColor="#666"
                value={draft.type}
                onChangeText={(type) => setDraft((d) => ({ ...d, type }))}
              />
              <Text style={styles.label}>Title *</Text>
              <TextInput
                style={styles.input}
                placeholderTextColor="#666"
                value={draft.title}
                onChangeText={(title) => setDraft((d) => ({ ...d, title }))}
              />
              <Text style={styles.label}>Artist</Text>
              <TextInput
                style={styles.input}
                placeholderTextColor="#666"
                value={draft.artist}
                onChangeText={(artist) => setDraft((d) => ({ ...d, artist }))}
              />
              <Text style={styles.label}>YouTube URL *</Text>
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor="#666"
                value={draft.youtube_url}
                onChangeText={(youtube_url) => setDraft((d) => ({ ...d, youtube_url }))}
              />
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.inputMulti]}
                multiline
                placeholderTextColor="#666"
                value={draft.description}
                onChangeText={(description) => setDraft((d) => ({ ...d, description }))}
              />
              <Text style={styles.label}>Phrases (one per line: term | english)</Text>
              <TextInput
                style={[styles.input, styles.inputMulti]}
                multiline
                placeholderTextColor="#666"
                value={draft.phrasesText}
                onChangeText={(phrasesText) => setDraft((d) => ({ ...d, phrasesText }))}
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
  recsBlock: { marginBottom: 18 },
  recsTitle: {
    color: ADMIN_ACCENT_GOLD,
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 8,
  },
  recCard: {
    backgroundColor: '#1a1510',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(212,164,55,0.35)',
    padding: 14,
    marginBottom: 10,
  },
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
  cardTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cardMeta: { color: '#aaa', marginTop: 4, fontSize: 13 },
  cardUrl: { color: '#666', marginTop: 4, fontSize: 11 },
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
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: '#333',
  },
  typeChipOn: { borderColor: ADMIN_ACCENT_GOLD },
  typeChipText: { color: '#ddd', fontSize: 12 },
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
