import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { AdminTextInput } from '../components/AdminTextInput'
import type { StackScreenProps } from '@react-navigation/stack'
import { SeriesTileCard } from '../components/SeriesTileCard'
import {
  aggregateWordRows,
  type SeriesSummary,
  type WordAggRow,
} from '../lib/seriesAggregation'
import supabase from '../lib/supabase'
import { VOICE_BANK_LANGUAGE } from '../lib/voiceBankLabels'
import { normalizeRecordingStatus } from '../lib/wordStatus'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminSeriesList'>

const DEFAULT_NEW_LANGUAGE = VOICE_BANK_LANGUAGE

export default function AdminSeriesListScreen({ navigation }: Props) {
  const [summaries, setSummaries] = useState<SeriesSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newSeriesName, setNewSeriesName] = useState('')
  const isFirstFocus = useRef(true)

  const load = useCallback(async () => {
    setError('')
    const { data, error: fetchError } = await supabase
      .from('words')
      .select('series, language, status')

    if (fetchError) {
      setError(fetchError.message)
      setSummaries([])
      return
    }

    const rows = ((data as WordAggRow[] | null) ?? []).map((r) => ({
      ...r,
      status: normalizeRecordingStatus(r.status),
    }))
    setSummaries(aggregateWordRows(rows))
  }, [])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Voice Recording',
      headerTitleAlign: 'center',
      headerLeft: () => (
        <Pressable
          onPress={() => navigation.navigate('AdminHome')}
          style={styles.headerBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back to admin"
        >
          <Text style={styles.headerBackText}>‹ Admin</Text>
        </Pressable>
      ),
      headerRight: () => (
        <Pressable
          onPress={() => setCreateOpen(true)}
          style={styles.headerPlusBtn}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="New series"
        >
          <Text style={styles.headerPlus}>+</Text>
        </Pressable>
      ),
    })
  }, [navigation])

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void (async () => {
        if (isFirstFocus.current) {
          setLoading(true)
          isFirstFocus.current = false
        }
        await load()
        if (!cancelled) setLoading(false)
      })()
      return () => {
        cancelled = true
      }
    }, [load]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const onCreateSeries = () => {
    const name = newSeriesName.trim()
    if (!name) return
    setCreateOpen(false)
    setNewSeriesName('')
    navigation.navigate('AdminSeriesDetail', {
      seriesName: name,
      language: DEFAULT_NEW_LANGUAGE,
    })
  }

  const renderItem = useCallback(
    ({ item }: { item: SeriesSummary }) => (
      <SeriesTileCard
        item={item}
        showUnapprovedWords
        onPress={() =>
          navigation.navigate('AdminSeriesDetail', {
            seriesName: item.series,
            language: item.language,
          })
        }
      />
    ),
    [navigation],
  )

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
      <Pressable
        style={({ pressed }) => [styles.reviewAudioBar, pressed && styles.reviewAudioBarPressed]}
        onPress={() => navigation.navigate('AdminAudioReview')}
        accessibilityRole="button"
        accessibilityLabel="Review recorded words awaiting approval"
      >
        <View style={styles.reviewAudioBarTextCol}>
          <Text style={styles.reviewAudioBarTitle}>Review Audio</Text>
          <Text style={styles.reviewAudioBarSub}>Recorded words awaiting approval</Text>
        </View>
        <Text style={styles.reviewAudioBarChevron}>›</Text>
      </Pressable>
      <FlatList
        style={styles.listFlex}
        data={summaries}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        contentContainerStyle={summaries.length === 0 ? styles.emptyList : styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No series yet. Tap + to create one.</Text>
        }
      />

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCreateOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>New series</Text>
            <AdminTextInput
              style={styles.modalInput}
              value={newSeriesName}
              onChangeText={setNewSeriesName}
              placeholder="Series name"
              placeholderTextColor="#a1a1aa"
              autoCapitalize="words"
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setCreateOpen(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalCreate} onPress={onCreateSeries}>
                <Text style={styles.modalCreateText}>Create</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  listFlex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 32,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  reviewAudioBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151',
  },
  reviewAudioBarPressed: {
    opacity: 0.88,
  },
  reviewAudioBarTextCol: {
    flex: 1,
  },
  reviewAudioBarTitle: {
    color: '#f4f4f5',
    fontSize: 16,
    fontWeight: '700',
  },
  reviewAudioBarSub: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  reviewAudioBarChevron: {
    color: '#6b7280',
    fontSize: 22,
    fontWeight: '300',
    marginLeft: 12,
  },
  headerBack: {
    marginLeft: 4,
    paddingVertical: 8,
    paddingRight: 8,
  },
  headerBackText: {
    color: '#a1a1aa',
    fontSize: 15,
    fontWeight: '600',
  },
  headerPlusBtn: {
    marginRight: 6,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
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
  emptyText: {
    color: '#a1a1aa',
    fontSize: 16,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 18,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalInput: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 12,
    color: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
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
  modalCreate: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#7C3AED',
  },
  modalCreateText: {
    color: '#ffffff',
    fontWeight: '600',
  },
})
