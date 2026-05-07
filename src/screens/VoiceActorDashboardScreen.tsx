import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import { SeriesTileCard } from '../components/SeriesTileCard'
import { useAuth } from '../context/AuthContext'
import {
  aggregateWordRows,
  type SeriesSummary,
  type WordAggRow,
} from '../lib/seriesAggregation'
import supabase from '../lib/supabase'
import { VOCABULARY_MERGED_SERIES } from '../lib/voiceBankLabels'
import { normalizeRecordingStatus, normalizeRecordingWords } from '../lib/wordStatus'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'VoiceActorDashboard'>

export default function VoiceActorDashboardScreen({ navigation }: Props) {
  const { setRole } = useAuth()
  const [summaries, setSummaries] = useState<SeriesSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const isFirstFocus = useRef(true)

  const load = useCallback(async () => {
    setError('')
    const { data, error: fetchError } = await supabase
      .from('words')
      .select('series, language, status')
      .or(`series.is.null,series.neq.${VOCABULARY_MERGED_SERIES}`)

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

  const onSignOut = useCallback(() => {
    setRole(null)
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] })
  }, [navigation, setRole])

  const onBackHome = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack()
    } else {
      navigation.navigate('VoiceActorHome')
    }
  }, [navigation])

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <Pressable onPress={onBackHome} style={styles.headerSignOut} hitSlop={8}>
          <Text style={styles.headerSignOutText}>‹ Home</Text>
        </Pressable>
      ),
      headerRight: () => (
        <Pressable onPress={onSignOut} style={styles.headerSignOutRight} hitSlop={8}>
          <Text style={styles.headerSignOutText}>Sign Out</Text>
        </Pressable>
      ),
    })
  }, [navigation, onBackHome, onSignOut])

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

  const hasRemainingWords = useMemo(
    () => summaries.reduce((n, s) => n + s.pending + s.rerecordRequested, 0) > 0,
    [summaries],
  )

  const startRecordingAll = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('words')
      .select('*')
      .in('status', ['pending', 'rerecord_requested'])
      .or(`series.is.null,series.neq.${VOCABULARY_MERGED_SERIES}`)
      .order('series', { ascending: true })
      .order('word', { ascending: true })
    if (err) {
      setError(err.message)
      return
    }
    const list = normalizeRecordingWords(data ?? [])
    if (list.length === 0) return
    navigation.navigate('Recording', { words: list })
  }, [navigation])

  const startSeriesRecording = useCallback(
    async (item: SeriesSummary) => {
      if (item.pending + item.rerecordRequested <= 0) return
      const { data, error: err } = await supabase
        .from('words')
        .select('*')
        .eq('series', item.series)
        .eq('language', item.language)
        .in('status', ['pending', 'rerecord_requested'])
        .neq('series', VOCABULARY_MERGED_SERIES)
        .order('word', { ascending: true })
      if (err) {
        setError(err.message)
        return
      }
      const list = normalizeRecordingWords(data ?? [])
      if (list.length === 0) return
      navigation.navigate('Recording', {
        words: list,
        seriesSession: { series: item.series, language: item.language },
      })
    },
    [navigation],
  )

  const showQueueEmptyMessage = !hasRemainingWords && summaries.length > 0

  const listHeader = useMemo(
    () => (
      <View style={styles.headerBlock}>
        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
        {hasRemainingWords ? (
          <Pressable style={styles.recordRemainingBtn} onPress={() => void startRecordingAll()}>
            <Text style={styles.recordRemainingBtnText}>Record Remaining Words</Text>
          </Pressable>
        ) : showQueueEmptyMessage ? (
          <Text style={styles.queueEmptyText}>There are no words in the queue …</Text>
        ) : null}
      </View>
    ),
    [error, hasRemainingWords, showQueueEmptyMessage, startRecordingAll],
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
      <FlatList
        data={summaries}
        keyExtractor={(item) => item.key}
        ListHeaderComponent={listHeader}
        contentContainerStyle={summaries.length === 0 ? styles.emptyList : styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />
        }
        renderItem={({ item }) => (
          <SeriesTileCard
            item={item}
            disabled={item.pending + item.rerecordRequested <= 0}
            onPress={() => void startSeriesRecording(item)}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No series yet. Ask an admin to add words.</Text>
        }
      />
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
  headerBlock: {
    marginBottom: 8,
  },
  headerSignOut: {
    marginLeft: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  headerSignOutRight: {
    marginRight: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  headerSignOutText: {
    color: '#a1a1aa',
    fontSize: 15,
    fontWeight: '600',
  },
  errorBanner: {
    color: '#f87171',
    paddingBottom: 12,
    fontSize: 14,
  },
  recordRemainingBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  recordRemainingBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  queueEmptyText: {
    color: '#22c55e',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  emptyText: {
    color: '#a1a1aa',
    fontSize: 16,
    textAlign: 'center',
  },
})
