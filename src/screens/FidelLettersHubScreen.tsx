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
import { ADMIN_ACCENT_GOLD } from '../components/lesson-config/AdminLessonConfigChrome'
import { useAuth } from '../context/AuthContext'
import {
  fidelRowToRecordingWord,
  normalizeFidelRows,
  sortFidelRowsByChartOrder,
  type FidelLetterRow,
} from '../lib/fidelLetters'
import supabase from '../lib/supabase'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'FidelLettersHub'>

type StatusCounts = {
  pending: number
  recorded: number
  approved: number
  rerecordRequested: number
  total: number
}

function countByStatus(rows: FidelLetterRow[]): StatusCounts {
  const c: StatusCounts = {
    pending: 0,
    recorded: 0,
    approved: 0,
    rerecordRequested: 0,
    total: rows.length,
  }
  for (const r of rows) {
    if (r.status === 'pending') c.pending += 1
    else if (r.status === 'recorded') c.recorded += 1
    else if (r.status === 'approved') c.approved += 1
    else if (r.status === 'rerecord_requested') c.rerecordRequested += 1
  }
  return c
}

function statusPillStyle(status: FidelLetterRow['status']) {
  switch (status) {
    case 'approved':
      return { bg: 'rgba(34,197,94,0.15)', text: '#4ade80' }
    case 'recorded':
      return { bg: 'rgba(124,58,237,0.2)', text: '#c4b5fd' }
    case 'rerecord_requested':
      return { bg: 'rgba(251,191,36,0.15)', text: '#fbbf24' }
    default:
      return { bg: 'rgba(255,255,255,0.08)', text: '#a1a1aa' }
  }
}

export default function FidelLettersHubScreen({ navigation }: Props) {
  const { role } = useAuth()
  const canRecord = role === 'fidel'
  const [rows, setRows] = useState<FidelLetterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const isFirstFocus = useRef(true)

  const counts = useMemo(() => countByStatus(rows), [rows])
  const needRecording = counts.pending + counts.rerecordRequested

  const load = useCallback(async () => {
    setError('')
    const { data, error: fetchError } = await supabase.from('fidel_letters').select('*')

    if (fetchError) {
      setError(fetchError.message)
      setRows([])
      return
    }
    setRows(sortFidelRowsByChartOrder(normalizeFidelRows(data ?? [])))
  }, [])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Fidel Letters',
      headerStyle: { backgroundColor: '#000000' },
      headerTitleStyle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
      headerTintColor: '#ffffff',
      headerLeft: () => (
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.headerBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.headerBtnText}>‹ Back</Text>
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

  const startRecording = useCallback(async () => {
    if (!canRecord) return
    const queue = rows
      .filter((r) => r.status === 'pending' || r.status === 'rerecord_requested')
      .map(fidelRowToRecordingWord)
    if (queue.length === 0) return
    navigation.navigate('Recording', {
      words: queue,
      recordingTable: 'fidel_letters',
      seriesSession: { series: 'Fidel', language: 'Amharic' },
    })
  }, [canRecord, navigation, rows])

  const recordOne = useCallback(
    (row: FidelLetterRow) => {
      if (!canRecord) return
      navigation.navigate('Recording', {
        words: [fidelRowToRecordingWord(row)],
        recordingTable: 'fidel_letters',
        seriesSession: { series: 'Fidel', language: 'Amharic' },
      })
    },
    [canRecord, navigation],
  )

  const renderItem = useCallback(
    ({ item }: { item: FidelLetterRow }) => {
      const pill = statusPillStyle(item.status)
      const rowCanRecord =
        canRecord && (item.status === 'pending' || item.status === 'rerecord_requested')
      return (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && rowCanRecord && styles.rowPressed]}
          onPress={() => (rowCanRecord ? recordOne(item) : undefined)}
          disabled={!rowCanRecord}
        >
          <View style={styles.rowMain}>
            <Text style={styles.rowSymbol}>{item.symbol}</Text>
            <Text style={styles.rowMeta} numberOfLines={1}>
              {item.english_sound} · {item.family_name}
            </Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: pill.bg }]}>
            <Text style={[styles.statusPillText, { color: pill.text }]}>{item.status}</Text>
          </View>
        </Pressable>
      )
    },
    [canRecord, recordOne],
  )

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ADMIN_ACCENT_GOLD} />
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      <View style={styles.summary}>
        <Text style={styles.summaryLine}>
          {counts.approved} approved · {counts.recorded} awaiting review · {needRecording} to record
        </Text>
        {canRecord ? (
          <Text style={styles.summaryHint}>Record the isolated syllable sound (e.g. ta, hi).</Text>
        ) : null}
      </View>

      {canRecord && needRecording > 0 ? (
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
          onPress={() => void startRecording()}
        >
          <Text style={styles.primaryBtnText}>Record {needRecording} symbols</Text>
        </Pressable>
      ) : null}

      {role === 'admin' && counts.recorded > 0 ? (
        <Pressable
          style={({ pressed }) => [styles.reviewBar, pressed && styles.reviewBarPressed]}
          onPress={() => navigation.navigate('AdminAudioReview', { fidelOnly: true })}
        >
          <View>
            <Text style={styles.reviewBarTitle}>Review Fidel audio</Text>
            <Text style={styles.reviewBarSub}>{counts.recorded} recorded — approve or request re-record</Text>
          </View>
          <Text style={styles.reviewChevron}>›</Text>
        </Pressable>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ADMIN_ACCENT_GOLD} />
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centered: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtn: {
    marginLeft: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  headerBtnText: {
    color: '#ebebf5',
    fontSize: 15,
    fontWeight: '500',
  },
  errorBanner: {
    color: '#f87171',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  summary: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  summaryLine: {
    color: '#8e8e93',
    fontSize: 14,
    lineHeight: 20,
  },
  summaryHint: {
    color: '#6b9077',
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  primaryBtn: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: ADMIN_ACCENT_GOLD,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnPressed: {
    opacity: 0.9,
  },
  primaryBtnText: {
    color: '#1a1a1a',
    fontSize: 16,
    fontWeight: '700',
  },
  reviewBar: {
    marginHorizontal: 20,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1c1c1e',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(78,202,122,0.28)',
  },
  reviewBarPressed: {
    opacity: 0.92,
  },
  reviewBarTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  reviewBarSub: {
    color: '#a1a1aa',
    fontSize: 13,
    marginTop: 4,
  },
  reviewChevron: {
    color: '#4ade80',
    fontSize: 28,
    fontWeight: '300',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  rowPressed: {
    opacity: 0.9,
  },
  rowMain: {
    flex: 1,
    marginRight: 12,
  },
  rowSymbol: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '600',
  },
  rowMeta: {
    color: ADMIN_ACCENT_GOLD,
    fontSize: 14,
    marginTop: 4,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
})
