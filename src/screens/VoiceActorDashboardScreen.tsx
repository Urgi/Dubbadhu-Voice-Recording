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
import {
  VOCABULARY_MERGED_SERIES,
  VOICE_BANK_LANGUAGE,
  voiceBankLanguageSqlValues,
} from '../lib/voiceBankLabels'
import { normalizeRecordingStatus, normalizeRecordingWords } from '../lib/wordStatus'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'VoiceActorDashboard'>

function emptyVocabSummary(): SeriesSummary {
  return {
    key: `${VOCABULARY_MERGED_SERIES}\u0000${VOICE_BANK_LANGUAGE}`,
    series: VOCABULARY_MERGED_SERIES,
    language: VOICE_BANK_LANGUAGE,
    pending: 0,
    recorded: 0,
    approved: 0,
    rerecordRequested: 0,
    total: 0,
  }
}

/** One tile for all `Vocabulary` rows (may span minor language string variants in DB). */
function mergeVocabSummaries(aggregated: SeriesSummary[]): SeriesSummary {
  if (aggregated.length === 0) return emptyVocabSummary()
  const base = emptyVocabSummary()
  for (const a of aggregated) {
    base.pending += a.pending
    base.recorded += a.recorded
    base.approved += a.approved
    base.rerecordRequested += a.rerecordRequested
    base.total += a.total
  }
  return base
}

export default function VoiceActorDashboardScreen({ navigation }: Props) {
  const { setRole } = useAuth()
  const [summaries, setSummaries] = useState<SeriesSummary[]>([])
  const [vocabSummary, setVocabSummary] = useState<SeriesSummary>(() => emptyVocabSummary())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const isFirstFocus = useRef(true)

  const load = useCallback(async () => {
    setError('')
    const langVals = voiceBankLanguageSqlValues()
    const [seriesRes, vocabRes] = await Promise.all([
      supabase
        .from('words')
        .select('series, language, status')
        .or(`series.is.null,series.neq.${VOCABULARY_MERGED_SERIES}`),
      supabase
        .from('words')
        .select('series, language, status')
        .eq('series', VOCABULARY_MERGED_SERIES)
        .eq('vocab_text_approved', true)
        .in('language', langVals),
    ])

    if (seriesRes.error) {
      setError(seriesRes.error.message)
      setSummaries([])
      setVocabSummary(emptyVocabSummary())
      return
    }
    if (vocabRes.error) {
      setError(vocabRes.error.message)
      setSummaries([])
      setVocabSummary(emptyVocabSummary())
      return
    }

    const seriesRows = ((seriesRes.data as WordAggRow[] | null) ?? []).map((r) => ({
      ...r,
      status: normalizeRecordingStatus(r.status),
    }))
    setSummaries(aggregateWordRows(seriesRows))

    const vocabRows = ((vocabRes.data as WordAggRow[] | null) ?? []).map((r) => ({
      ...r,
      status: normalizeRecordingStatus(r.status),
    }))
    const vocabAgg = aggregateWordRows(vocabRows)
    setVocabSummary(mergeVocabSummaries(vocabAgg))
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

  const hasRemainingWords = useMemo(() => {
    const v = vocabSummary.pending + vocabSummary.rerecordRequested
    const s = summaries.reduce((n, x) => n + x.pending + x.rerecordRequested, 0)
    return v + s > 0
  }, [summaries, vocabSummary])

  const awaitingApprovalCount = useMemo(() => {
    const v = vocabSummary.recorded
    const s = summaries.reduce((n, x) => n + x.recorded, 0)
    return v + s
  }, [summaries, vocabSummary])

  const openAwaitingApproval = useCallback(
    (opts?: { series?: string; language?: string; vocabOnly?: boolean }) => {
      if (opts) {
        navigation.navigate('VoiceActorAwaitingApproval', opts)
      } else {
        navigation.navigate('VoiceActorAwaitingApproval')
      }
    },
    [navigation],
  )

  const startRecordingAll = useCallback(async () => {
    const langVals = voiceBankLanguageSqlValues()
    const [vRes, sRes] = await Promise.all([
      supabase
        .from('words')
        .select('*')
        .eq('series', VOCABULARY_MERGED_SERIES)
        .eq('vocab_text_approved', true)
        .in('language', langVals)
        .in('status', ['pending', 'rerecord_requested'])
        .order('word', { ascending: true }),
      supabase
        .from('words')
        .select('*')
        .in('status', ['pending', 'rerecord_requested'])
        .or(`series.is.null,series.neq.${VOCABULARY_MERGED_SERIES}`)
        .order('series', { ascending: true })
        .order('word', { ascending: true }),
    ])
    const err = vRes.error ?? sRes.error
    if (err) {
      setError(err.message)
      return
    }
    const list = [
      ...normalizeRecordingWords(vRes.data ?? []),
      ...normalizeRecordingWords(sRes.data ?? []),
    ]
    if (list.length === 0) return
    navigation.navigate('Recording', { words: list })
  }, [navigation])

  const startSeriesRecording = useCallback(
    async (item: SeriesSummary) => {
      if (item.pending + item.rerecordRequested <= 0) return
      const langVals = voiceBankLanguageSqlValues()
      const q =
        item.series === VOCABULARY_MERGED_SERIES
          ? supabase
              .from('words')
              .select('*')
              .eq('series', VOCABULARY_MERGED_SERIES)
              .eq('vocab_text_approved', true)
              .in('language', langVals)
              .in('status', ['pending', 'rerecord_requested'])
              .order('word', { ascending: true })
          : supabase
              .from('words')
              .select('*')
              .eq('series', item.series)
              .eq('language', item.language)
              .in('status', ['pending', 'rerecord_requested'])
              .order('word', { ascending: true })
      const { data, error: err } = await q
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

  const onSeriesPress = useCallback(
    (item: SeriesSummary) => {
      const canRecord = item.pending + item.rerecordRequested > 0
      if (canRecord) {
        void startSeriesRecording(item)
        return
      }
      if (item.recorded > 0) {
        if (item.series === VOCABULARY_MERGED_SERIES) {
          openAwaitingApproval({ vocabOnly: true })
        } else {
          openAwaitingApproval({ series: item.series, language: item.language })
        }
      }
    },
    [openAwaitingApproval, startSeriesRecording],
  )

  const showQueueEmptyMessage =
    !hasRemainingWords && (summaries.length > 0 || vocabSummary.total > 0)

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
        {awaitingApprovalCount > 0 ? (
          <Pressable
            style={styles.awaitingBtn}
            onPress={() => openAwaitingApproval()}
          >
            <Text style={styles.awaitingBtnText}>
              Review awaiting approval ({awaitingApprovalCount})
            </Text>
            <Text style={styles.awaitingBtnSub}>Listen or re-record submitted takes</Text>
          </Pressable>
        ) : null}
        <Text style={styles.sectionTitle}>Vocabulary (word bank)</Text>
        <Text style={styles.sectionHint}>
          {VOCABULARY_MERGED_SERIES} · {vocabSummary.language} — text-approved, pending audio
        </Text>
        <SeriesTileCard
          item={vocabSummary}
          disabled={
            vocabSummary.pending + vocabSummary.rerecordRequested + vocabSummary.recorded <= 0
          }
          onPress={() => onSeriesPress(vocabSummary)}
        />
        <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>Lesson series</Text>
      </View>
    ),
    [
      awaitingApprovalCount,
      error,
      hasRemainingWords,
      onSeriesPress,
      openAwaitingApproval,
      showQueueEmptyMessage,
      startRecordingAll,
      vocabSummary,
    ],
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
        contentContainerStyle={
          summaries.length === 0 && vocabSummary.total === 0 ? styles.emptyList : styles.listContent
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />
        }
        renderItem={({ item }) => (
          <SeriesTileCard
            item={item}
            disabled={item.pending + item.rerecordRequested + item.recorded <= 0}
            onPress={() => onSeriesPress(item)}
          />
        )}
        ListEmptyComponent={
          summaries.length === 0 ? (
            <Text style={styles.emptyText}>No lesson series with words in the recording queue.</Text>
          ) : null
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
  sectionTitle: {
    color: '#e4e4e7',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  sectionTitleSpaced: {
    marginTop: 20,
  },
  sectionHint: {
    color: '#71717a',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 8,
    lineHeight: 16,
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
  awaitingBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fbbf24',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    marginTop: 4,
  },
  awaitingBtnText: {
    color: '#fbbf24',
    fontSize: 16,
    fontWeight: '700',
  },
  awaitingBtnSub: {
    color: '#a1a1aa',
    fontSize: 13,
    marginTop: 4,
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
