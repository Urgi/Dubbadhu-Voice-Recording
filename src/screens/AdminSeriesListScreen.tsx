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
  TextInput,
  View,
} from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import { StatusPill } from '../components/StatusPill'
import supabase from '../lib/supabase'
import type { RecordingStatus, RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminSeriesList'>

type WordAggRow = {
  series: string
  language: string
  status: RecordingStatus
}

type SeriesSummary = {
  key: string
  series: string
  language: string
  pending: number
  recorded: number
  approved: number
  rejected: number
  rerecordRequested: number
  total: number
}

function aggregateWordRows(rows: WordAggRow[]): SeriesSummary[] {
  const map = new Map<
    string,
    {
      series: string
      language: string
      pending: number
      recorded: number
      approved: number
      rejected: number
      rerecordRequested: number
      total: number
    }
  >()

  for (const row of rows) {
    const key = `${row.series}\u0000${row.language}`
    let entry = map.get(key)
    if (!entry) {
      entry = {
        series: row.series,
        language: row.language,
        pending: 0,
        recorded: 0,
        approved: 0,
        rejected: 0,
        rerecordRequested: 0,
        total: 0,
      }
      map.set(key, entry)
    }
    entry.total += 1
    if (row.status === 'pending') entry.pending += 1
    else if (row.status === 'recorded') entry.recorded += 1
    else if (row.status === 'approved') entry.approved += 1
    else if (row.status === 'rejected') entry.rejected += 1
    else if (row.status === 'rerecord_requested') entry.rerecordRequested += 1
  }

  return Array.from(map.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => a.series.localeCompare(b.series) || a.language.localeCompare(b.language))
}

const DEFAULT_NEW_LANGUAGE = 'afaan oromo'

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

    const rows = (data as WordAggRow[] | null) ?? []
    setSummaries(aggregateWordRows(rows))
  }, [])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Word Manager',
      headerRight: () => (
        <Pressable onPress={() => setCreateOpen(true)} style={styles.headerBtn} hitSlop={8}>
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
      <Pressable
        style={styles.card}
        onPress={() =>
          navigation.navigate('AdminSeriesDetail', {
            seriesName: item.series,
            language: item.language,
          })
        }
      >
        <Text style={styles.cardTitle}>{item.series}</Text>
        <Text style={styles.cardLanguage}>{item.language}</Text>
        <View style={styles.pillRow}>
          {item.pending > 0 ? (
            <View style={styles.pillWithCount}>
              <StatusPill status="pending" compact />
              <Text style={styles.pillCount}>{item.pending}</Text>
            </View>
          ) : null}
          {item.recorded > 0 ? (
            <View style={styles.pillWithCount}>
              <StatusPill status="recorded" compact />
              <Text style={styles.pillCount}>{item.recorded}</Text>
            </View>
          ) : null}
          {item.approved > 0 ? (
            <View style={styles.pillWithCount}>
              <StatusPill status="approved" compact />
              <Text style={styles.pillCount}>{item.approved}</Text>
            </View>
          ) : null}
          {item.rejected > 0 ? (
            <View style={styles.pillWithCount}>
              <StatusPill status="rejected" compact />
              <Text style={styles.pillCount}>{item.rejected}</Text>
            </View>
          ) : null}
          {item.rerecordRequested > 0 ? (
            <View style={styles.pillWithCount}>
              <StatusPill status="rerecord_requested" compact />
              <Text style={styles.pillCount}>{item.rerecordRequested}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.total}>{item.total} words</Text>
      </Pressable>
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
      <FlatList
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
            <TextInput
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
  centered: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  headerBtn: {
    marginRight: 8,
    paddingHorizontal: 8,
    minWidth: 36,
    alignItems: 'center',
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
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
  cardLanguage: {
    color: '#a1a1aa',
    fontSize: 14,
    marginTop: 4,
    marginBottom: 10,
    textTransform: 'capitalize',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 4,
  },
  pillWithCount: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 6,
  },
  pillCount: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  total: {
    color: '#d4d4d8',
    fontSize: 14,
    marginTop: 8,
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
