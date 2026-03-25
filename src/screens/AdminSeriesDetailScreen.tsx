import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import * as DocumentPicker from 'expo-document-picker'
import type { StackScreenProps } from '@react-navigation/stack'
import { StatusPill } from '../components/StatusPill'
import { useRemoteAudioUrl } from '../hooks/useRemoteAudioUrl'
import { extractWordsFromDocument } from '../lib/gemini'
import supabase from '../lib/supabase'
import { normalizeRecordingWords } from '../lib/wordStatus'
import type { RecordingWord, RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminSeriesDetail'>

const SUPPORTED_DOC_TYPES = [
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

function messageFromUnknownError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string') return error
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }
  return String(error)
}

function importDocumentErrorMessage(error: unknown): string {
  const msg = messageFromUnknownError(error)
  const lower = msg.toLowerCase()

  if (
    lower.includes('expo document picker') ||
    lower.includes('expo documentpicker') ||
    lower.includes('expo-document-picker') ||
    lower.includes('cannot find native module') ||
    lower.includes('native module')
  ) {
    return 'Document import needs a dev build with native modules. Run: npx expo run:ios (or run:android), then open the app with --dev-client.'
  }

  if (lower.includes('missing expo_public_gemini_api_key')) {
    return 'Add EXPO_PUBLIC_GEMINI_API_KEY to .env and restart Expo (npx expo start -c).'
  }

  if (lower.includes('network request failed') || lower.includes('fetch')) {
    return 'Network error talking to Gemini. Check internet, API key, and try again—or paste manually.'
  }

  return `Could not extract words. Please try again or paste manually.\n(${msg})`
}

export default function AdminSeriesDetailScreen({ navigation, route }: Props) {
  const { seriesName, language } = route.params
  const [words, setWords] = useState<RecordingWord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [listError, setListError] = useState('')

  const [addOpen, setAddOpen] = useState(false)
  const [addWordText, setAddWordText] = useState('')
  const [addExtracting, setAddExtracting] = useState(false)
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [addMessage, setAddMessage] = useState('')
  const [addError, setAddError] = useState('')

  const [editOpen, setEditOpen] = useState(false)
  const [editWord, setEditWord] = useState<RecordingWord | null>(null)
  const [editWordText, setEditWordText] = useState('')
  const [editSeriesChosen, setEditSeriesChosen] = useState('')
  const [editUseNewSeries, setEditUseNewSeries] = useState(false)
  const [editNewSeriesName, setEditNewSeriesName] = useState('')
  const [editSeriesOptions, setEditSeriesOptions] = useState<string[]>([])
  const [editSeriesLoading, setEditSeriesLoading] = useState(false)
  const [seriesPickerOpen, setSeriesPickerOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const swipeRefs = useRef<Record<string, Swipeable | null>>({})
  const { playUrl, playingId } = useRemoteAudioUrl()

  const loadWords = useCallback(async () => {
    setListError('')
    const { data, error } = await supabase
      .from('words')
      .select('*')
      .eq('series', seriesName)
      .eq('language', language)
      .order('word')

    if (error) {
      setListError(error.message)
      setWords([])
      return
    }
    setWords(normalizeRecordingWords(data ?? []))
  }, [seriesName, language])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: seriesName,
      headerRight: () => (
        <Pressable onPress={() => setAddOpen(true)} style={styles.headerBtn} hitSlop={8}>
          <Text style={styles.headerPlus}>+</Text>
        </Pressable>
      ),
    })
  }, [navigation, seriesName])

  useEffect(() => {
    let active = true
    void (async () => {
      setLoading(true)
      await loadWords()
      if (active) setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [loadWords])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadWords()
    setRefreshing(false)
  }, [loadWords])

  useEffect(() => {
    if (!editOpen || !editWord) return
    const ensureSeries = editWord.series
    let cancelled = false
    void (async () => {
      setEditSeriesLoading(true)
      const { data, error } = await supabase.from('words').select('series').order('series')
      if (cancelled) return
      if (error) {
        setEditSeriesOptions(ensureSeries ? [ensureSeries] : [])
        setEditSeriesLoading(false)
        return
      }
      const rows = (data as { series: string }[] | null) ?? []
      const unique = Array.from(new Set(rows.map((r) => r.series).filter(Boolean)))
      unique.sort((a, b) => a.localeCompare(b))
      if (ensureSeries && !unique.includes(ensureSeries)) {
        unique.push(ensureSeries)
        unique.sort((a, b) => a.localeCompare(b))
      }
      setEditSeriesOptions(unique)
      setEditSeriesLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [editOpen, editWord?.id, editWord?.series])

  const openEdit = (w: RecordingWord) => {
    setEditWord(w)
    setEditWordText(w.word)
    setEditSeriesChosen(w.series)
    setEditUseNewSeries(false)
    setEditNewSeriesName('')
    setEditSeriesOptions([])
    setSeriesPickerOpen(false)
    setEditError('')
    setEditOpen(true)
  }

  const closeEdit = () => {
    setEditOpen(false)
    setEditWord(null)
    setSeriesPickerOpen(false)
    setEditUseNewSeries(false)
    setEditNewSeriesName('')
    setEditSeriesOptions([])
  }

  const saveEdit = async () => {
    if (!editWord) return
    const nextWord = editWordText.trim()
    const nextSeries = editUseNewSeries ? editNewSeriesName.trim() : editSeriesChosen.trim()
    if (!nextWord) {
      setEditError('Word cannot be empty')
      return
    }
    if (!nextSeries) {
      setEditError(editUseNewSeries ? 'Enter a new series name' : 'Select a series')
      return
    }
    setEditSaving(true)
    setEditError('')
    const { error } = await supabase
      .from('words')
      .update({
        word: nextWord,
        series: nextSeries,
        status: 'pending',
        slow_audio_url: null,
        fast_audio_url: null,
        recorded_at: null,
      })
      .eq('id', editWord.id)
    setEditSaving(false)
    if (error) {
      setEditError(error.message)
      return
    }
    const id = editWord.id
    const movedToOtherSeries = nextSeries !== seriesName
    closeEdit()
    if (movedToOtherSeries) {
      setWords((prev) => prev.filter((w) => w.id !== id))
      Alert.alert('Moved', `Moved to “${nextSeries}”.`)
    } else {
      setWords((prev) =>
        prev
          .map((w) =>
            w.id === id
              ? ({
                  ...w,
                  word: nextWord,
                  series: nextSeries,
                  status: 'pending' as const,
                  slow_audio_url: null,
                  fast_audio_url: null,
                  recorded_at: null,
                } satisfies RecordingWord)
              : w,
          )
          .sort((a, b) => a.word.localeCompare(b.word)),
      )
    }
  }

  const confirmDelete = (w: RecordingWord) => {
    swipeRefs.current[w.id]?.close()
    Alert.alert('Delete word', `Remove “${w.word}”?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('words').delete().eq('id', w.id)
          if (error) {
            Alert.alert('Error', error.message)
            return
          }
          await loadWords()
        },
      },
    ])
  }

  const resetWord = async (w: RecordingWord) => {
    swipeRefs.current[w.id]?.close()
    const { error } = await supabase
      .from('words')
      .update({
        status: 'pending',
        slow_audio_url: null,
        fast_audio_url: null,
      })
      .eq('id', w.id)
    if (error) {
      Alert.alert('Error', error.message)
      return
    }
    await loadWords()
  }

  const acceptRecording = async (w: RecordingWord) => {
    swipeRefs.current[w.id]?.close()
    const { error } = await supabase.from('words').update({ status: 'approved' }).eq('id', w.id)
    if (error) {
      Alert.alert('Error', error.message)
      return
    }
    await loadWords()
  }

  const doRequestRerecord = async (w: RecordingWord) => {
    const noteLine = `[${new Date().toISOString().slice(0, 10)}] Re-record requested`
    const nextNotes = w.notes?.trim() ? `${w.notes.trim()}\n${noteLine}` : noteLine
    const { error } = await supabase
      .from('words')
      .update({
        status: 'rerecord_requested',
        notes: nextNotes,
      })
      .eq('id', w.id)
    if (error) {
      Alert.alert('Error', error.message)
      return
    }
    await loadWords()
  }

  const confirmRequestRerecord = (w: RecordingWord) => {
    swipeRefs.current[w.id]?.close()
    Alert.alert(
      'Request re-record?',
      `“${w.word}” will appear in the voice actor’s recording queue. Current audio stays until they upload a new take.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Request', onPress: () => void doRequestRerecord(w) },
      ],
    )
  }

  const parsedAddWords = useMemo(() => {
    const cleaned = addWordText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    return Array.from(new Set(cleaned))
  }, [addWordText])

  const onImportDocument = async () => {
    setAddError('')
    setAddMessage('')
    setAddExtracting(true)
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: SUPPORTED_DOC_TYPES,
        multiple: false,
        copyToCacheDirectory: true,
      })
      if (result.canceled) {
        setAddExtracting(false)
        return
      }
      const file = result.assets[0]
      const extracted = await extractWordsFromDocument(file.uri, file.mimeType || 'text/plain')
      setAddWordText(extracted.join('\n'))
    } catch (err) {
      setAddError(importDocumentErrorMessage(err))
    } finally {
      setAddExtracting(false)
    }
  }

  const onCreateBatch = async () => {
    setAddError('')
    setAddMessage('')
    if (parsedAddWords.length === 0) {
      setAddError('Enter at least one word')
      return
    }
    setAddSubmitting(true)
    const { data: existingRows, error: existingErr } = await supabase
      .from('words')
      .select('word')
      .eq('series', seriesName)
      .eq('language', language)
    if (existingErr) {
      setAddError(existingErr.message)
      setAddSubmitting(false)
      return
    }
    const existingSet = new Set(
      ((existingRows as { word: string }[] | null) ?? []).map((r) => r.word.trim().toLowerCase()),
    )
    const toInsert = parsedAddWords.filter((w) => !existingSet.has(w.trim().toLowerCase()))
    const skipped = parsedAddWords.length - toInsert.length
    if (toInsert.length === 0) {
      setAddMessage(`0 new words added, ${skipped} duplicates skipped`)
      setAddSubmitting(false)
      return
    }
    const rows = toInsert.map((word) => ({
      series: seriesName,
      word,
      language,
      status: 'pending' as const,
      slow_audio_url: null,
      fast_audio_url: null,
    }))
    const { error: insertErr } = await supabase.from('words').insert(rows)
    setAddSubmitting(false)
    if (insertErr) {
      setAddError(insertErr.message)
      return
    }
    setAddWordText('')
    setAddMessage(`${toInsert.length} new words added, ${skipped} duplicates skipped`)
    await loadWords()
  }

  const closeAddModal = () => {
    setAddOpen(false)
    setAddWordText('')
    setAddMessage('')
    setAddError('')
  }

  const renderRightActions = (w: RecordingWord) => (
    <View style={styles.swipeActions}>
      <Pressable style={styles.swipeDelete} onPress={() => confirmDelete(w)}>
        <Text style={styles.swipeDeleteText}>Delete</Text>
      </Pressable>
      <Pressable style={styles.swipeReset} onPress={() => resetWord(w)}>
        <Text style={styles.swipeResetText}>Reset</Text>
      </Pressable>
    </View>
  )

  const renderItem = ({ item }: { item: RecordingWord }) => {
    const hasSlow = Boolean(item.slow_audio_url)
    const hasFast = Boolean(item.fast_audio_url)
    const hasAnyAudio = hasSlow || hasFast
    const canRequestRerecord = item.status === 'recorded' || item.status === 'approved'
    const showRerecordRow = canRequestRerecord || item.status === 'rerecord_requested'

    return (
      <Swipeable
        ref={(r) => {
          swipeRefs.current[item.id] = r
        }}
        renderRightActions={() => renderRightActions(item)}
        overshootRight={false}
      >
        <View style={styles.rowWrap}>
          <Pressable style={styles.row} onPress={() => openEdit(item)}>
            <Text style={styles.rowWord}>{item.word}</Text>
            <StatusPill status={item.status} compact />
          </Pressable>
          {hasAnyAudio ? (
            <View style={styles.playbackRow}>
              {hasSlow ? (
                <Pressable
                  style={[
                    styles.playPill,
                    playingId === `${item.id}-slow` && styles.playPillActive,
                  ]}
                  onPress={() => void playUrl(item.slow_audio_url, `${item.id}-slow`)}
                >
                  <Text style={styles.playPillText}>
                    {playingId === `${item.id}-slow` ? '■ Stop' : '▶ Slow'}
                  </Text>
                </Pressable>
              ) : null}
              {hasFast ? (
                <Pressable
                  style={[
                    styles.playPill,
                    playingId === `${item.id}-fast` && styles.playPillActive,
                  ]}
                  onPress={() => void playUrl(item.fast_audio_url, `${item.id}-fast`)}
                >
                  <Text style={styles.playPillText}>
                    {playingId === `${item.id}-fast` ? '■ Stop' : '▶ Fast'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {item.status === 'recorded' ? (
            <View style={styles.adminActionsRow}>
              <Pressable style={styles.acceptBtn} onPress={() => void acceptRecording(item)}>
                <Text style={styles.acceptBtnText}>Accept recording</Text>
              </Pressable>
            </View>
          ) : null}
          {showRerecordRow ? (
            <View style={styles.rerecordRow}>
              {item.status === 'rerecord_requested' ? (
                <Text style={styles.rerecordHint}>In voice actor queue for re-record</Text>
              ) : (
                <Pressable style={styles.rerecordBtn} onPress={() => confirmRequestRerecord(item)}>
                  <Text style={styles.rerecordBtnText}>Request re-record</Text>
                </Pressable>
              )}
            </View>
          ) : null}
        </View>
      </Swipeable>
    )
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      {listError ? <Text style={styles.errorBanner}>{listError}</Text> : null}
      <FlatList
        data={words}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={words.length === 0 ? styles.emptyList : styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />
        }
        ListEmptyComponent={<Text style={styles.emptyText}>No words in this series yet. Tap + to add.</Text>}
      />

      {/* Add words modal */}
      <Modal visible={addOpen} animationType="slide" transparent onRequestClose={closeAddModal}>
        <KeyboardAvoidingView
          style={styles.addModalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.addModalCard}>
            <Text style={styles.addModalTitle}>Add words</Text>
            <Text style={styles.lockedLabel}>Series</Text>
            <View style={styles.lockedBox}>
              <Text style={styles.lockedText}>{seriesName}</Text>
            </View>
            <Text style={styles.lockedLabel}>Language</Text>
            <View style={styles.lockedBox}>
              <Text style={styles.lockedText}>{language}</Text>
            </View>
            <Pressable
              style={[styles.importBtn, addExtracting && styles.btnDisabled]}
              onPress={onImportDocument}
              disabled={addExtracting}
            >
              {addExtracting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.importBtnText}>📄 Import Document</Text>
              )}
            </Pressable>
            <View style={styles.addInputWrap}>
              <TextInput
                style={styles.addMultiline}
                value={addWordText}
                onChangeText={setAddWordText}
                placeholder="Paste words here, one per line"
                placeholderTextColor="#a1a1aa"
                multiline
                textAlignVertical="top"
                editable={!addExtracting}
              />
              {addExtracting ? (
                <View style={styles.addOverlay}>
                  <ActivityIndicator color="#7C3AED" />
                  <Text style={styles.addOverlayText}>Extracting words with AI...</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.addCount}>{parsedAddWords.length} words</Text>
            {addError ? <Text style={styles.addErr}>{addError}</Text> : null}
            {addMessage ? <Text style={styles.addOk}>{addMessage}</Text> : null}
            <Pressable
              style={[styles.createBatchBtn, addSubmitting && styles.btnDisabled]}
              onPress={onCreateBatch}
              disabled={addSubmitting}
            >
              {addSubmitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.createBatchText}>Create Batch</Text>
              )}
            </Pressable>
            <Pressable style={styles.addCloseBtn} onPress={closeAddModal}>
              <Text style={styles.addCloseText}>Close</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit word modal — card is View (not Pressable) so nested controls receive touches; picker is an overlay in the same Modal (nested Modals often ignore touches on iOS). */}
      <Modal
        visible={editOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (seriesPickerOpen) setSeriesPickerOpen(false)
          else closeEdit()
        }}
      >
        <View style={styles.editModalRoot}>
          <Pressable style={styles.editModalBackdropFill} onPress={closeEdit} />
          <View style={styles.editModalCenter} pointerEvents="box-none">
            <View style={styles.editCard}>
              <Text style={styles.editTitle}>Edit word</Text>
              <Text style={styles.fieldLabel}>Word</Text>
              <TextInput
                style={styles.editInput}
                value={editWordText}
                onChangeText={setEditWordText}
                placeholderTextColor="#a1a1aa"
              />
              <Text style={styles.fieldLabel}>Series</Text>
              <Pressable
                style={[styles.seriesSelectButton, editSeriesLoading && styles.seriesSelectButtonDisabled]}
                onPress={() => {
                  if (!editSeriesLoading) setSeriesPickerOpen(true)
                }}
                disabled={editSeriesLoading}
                hitSlop={8}
              >
                {editSeriesLoading ? (
                  <ActivityIndicator color="#7C3AED" size="small" />
                ) : (
                  <>
                    <Text style={styles.seriesSelectText} numberOfLines={2}>
                      {editUseNewSeries
                        ? editNewSeriesName.trim()
                          ? `New: ${editNewSeriesName.trim()}`
                          : 'New series…'
                        : editSeriesChosen || 'Select series'}
                    </Text>
                    <Text style={styles.seriesChevron}>▼</Text>
                  </>
                )}
              </Pressable>
              {editUseNewSeries ? (
                <>
                  <Text style={styles.fieldLabelSecondary}>New series name</Text>
                  <TextInput
                    style={styles.editInput}
                    value={editNewSeriesName}
                    onChangeText={setEditNewSeriesName}
                    placeholder="Type a new series name"
                    placeholderTextColor="#a1a1aa"
                    autoCapitalize="words"
                  />
                </>
              ) : null}
              {editError ? <Text style={styles.addErr}>{editError}</Text> : null}
              <View style={styles.editActions}>
                <Pressable style={styles.modalCancel} onPress={closeEdit}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalSave, editSaving && styles.btnDisabled]}
                  onPress={() => void saveEdit()}
                  disabled={editSaving}
                >
                  {editSaving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.modalSaveText}>Save</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>

          {seriesPickerOpen ? (
            <View style={styles.seriesPickerOverlayRoot} pointerEvents="box-none">
              <Pressable
                style={styles.seriesPickerOverlayBackdrop}
                onPress={() => setSeriesPickerOpen(false)}
              />
              <View style={styles.seriesPickerOverlayCenter} pointerEvents="box-none">
                <View style={styles.seriesPickerCard}>
                  <Text style={styles.seriesPickerTitle}>Select series</Text>
                  <FlatList
                    data={[...editSeriesOptions, '__NEW__']}
                    keyExtractor={(item) => item}
                    style={styles.seriesPickerList}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => {
                      if (item === '__NEW__') {
                        const selectedNew = editUseNewSeries
                        return (
                          <Pressable
                            style={[styles.seriesPickerRow, selectedNew && styles.seriesPickerRowSelected]}
                            onPress={() => {
                              setEditUseNewSeries(true)
                              setEditNewSeriesName('')
                              setEditSeriesChosen('')
                              setSeriesPickerOpen(false)
                            }}
                          >
                            <Text style={styles.seriesPickerRowText}>New series…</Text>
                            {selectedNew ? <Text style={styles.seriesPickerCheck}>✓</Text> : null}
                          </Pressable>
                        )
                      }
                      const selected = !editUseNewSeries && editSeriesChosen === item
                      return (
                        <Pressable
                          style={[styles.seriesPickerRow, selected && styles.seriesPickerRowSelected]}
                          onPress={() => {
                            setEditSeriesChosen(item)
                            setEditUseNewSeries(false)
                            setEditNewSeriesName('')
                            setSeriesPickerOpen(false)
                          }}
                        >
                          <Text style={styles.seriesPickerRowText}>{item}</Text>
                          {selected ? <Text style={styles.seriesPickerCheck}>✓</Text> : null}
                        </Pressable>
                      )
                    }}
                  />
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  centered: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  headerBtn: {
    marginRight: 8,
    paddingHorizontal: 8,
  },
  headerPlus: {
    color: '#7C3AED',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
  },
  errorBanner: {
    color: '#f87171',
    padding: 12,
    textAlign: 'center',
    fontSize: 14,
  },
  rowWrap: {
    backgroundColor: '#0a0a0a',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#27272a',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  playbackRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  playPill: {
    backgroundColor: '#1a1033',
    borderWidth: 1,
    borderColor: '#4c1d95',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  playPillActive: {
    borderColor: '#a78bfa',
    backgroundColor: '#2e1064',
  },
  playPillText: {
    color: '#e9d5ff',
    fontSize: 13,
    fontWeight: '600',
  },
  adminActionsRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  acceptBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#14532d',
    borderWidth: 1,
    borderColor: '#22c55e',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  acceptBtnText: {
    color: '#bbf7d0',
    fontSize: 14,
    fontWeight: '700',
  },
  rerecordRow: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  rerecordBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#312e81',
    borderWidth: 1,
    borderColor: '#6366f1',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  rerecordBtnText: {
    color: '#e0e7ff',
    fontSize: 13,
    fontWeight: '700',
  },
  rerecordHint: {
    color: '#a5b4fc',
    fontSize: 12,
    fontStyle: 'italic',
  },
  rowWord: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  swipeReset: {
    backgroundColor: '#3a2500',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  swipeResetText: {
    color: '#f59e0b',
    fontWeight: '700',
    fontSize: 14,
  },
  swipeDelete: {
    backgroundColor: '#7f1d1d',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  swipeDeleteText: {
    color: '#fecaca',
    fontWeight: '700',
    fontSize: 14,
  },
  emptyText: {
    color: '#a1a1aa',
    fontSize: 16,
    textAlign: 'center',
  },
  addModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  addModalCard: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 28,
    maxHeight: '92%',
  },
  addModalTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  lockedLabel: {
    color: '#a1a1aa',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  lockedBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  lockedText: {
    color: '#ffffff',
    fontSize: 16,
  },
  importBtn: {
    marginTop: 14,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#7C3AED',
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 15,
  },
  addInputWrap: {
    position: 'relative',
    marginTop: 10,
  },
  addMultiline: {
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 12,
    color: '#ffffff',
    minHeight: 200,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  addOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,10,0.85)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addOverlayText: {
    color: '#ffffff',
    fontSize: 14,
  },
  addCount: {
    color: '#a1a1aa',
    fontSize: 13,
    marginTop: 8,
  },
  addErr: {
    color: '#f87171',
    marginTop: 10,
    fontSize: 14,
  },
  addOk: {
    color: '#86efac',
    marginTop: 10,
    fontSize: 14,
  },
  createBatchBtn: {
    marginTop: 16,
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBatchText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  addCloseBtn: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 10,
  },
  addCloseText: {
    color: '#a1a1aa',
    fontSize: 16,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  editModalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  editModalBackdropFill: {
    ...StyleSheet.absoluteFillObject,
  },
  editModalCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    padding: 20,
  },
  editCard: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 18,
  },
  editTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  fieldLabel: {
    color: '#ffffff',
    fontSize: 13,
    marginBottom: 6,
    marginTop: 8,
  },
  fieldLabelSecondary: {
    color: '#a1a1aa',
    fontSize: 12,
    marginBottom: 6,
    marginTop: 10,
  },
  seriesSelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
  },
  seriesSelectButtonDisabled: {
    opacity: 0.7,
  },
  seriesSelectText: {
    color: '#ffffff',
    fontSize: 16,
    flex: 1,
    marginRight: 8,
  },
  seriesChevron: {
    color: '#7C3AED',
    fontSize: 12,
    fontWeight: '700',
  },
  editInput: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 12,
    color: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 18,
    gap: 12,
  },
  modalCancel: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#27272a',
  },
  modalCancelText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  modalSave: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#7C3AED',
    minWidth: 88,
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  seriesPickerOverlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
  },
  seriesPickerOverlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  seriesPickerOverlayCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    padding: 20,
  },
  seriesPickerCard: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    maxHeight: '70%',
    paddingVertical: 12,
    width: '100%',
    alignSelf: 'center',
  },
  seriesPickerTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#27272a',
  },
  seriesPickerList: {
    flexGrow: 0,
  },
  seriesPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#27272a',
  },
  seriesPickerRowSelected: {
    backgroundColor: '#1f1633',
  },
  seriesPickerRowText: {
    color: '#ffffff',
    fontSize: 16,
    flex: 1,
    marginRight: 12,
  },
  seriesPickerCheck: {
    color: '#7C3AED',
    fontSize: 18,
    fontWeight: '700',
  },
})
