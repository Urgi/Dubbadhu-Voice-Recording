import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import supabase from '../lib/supabase'
import type { RecordingStatus, RecordingWord, RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'VoiceActorDashboard'>

function aggregateStatus(rows: { status: RecordingStatus }[]) {
  let pending = 0
  let recorded = 0
  let rejected = 0
  let approved = 0
  let rerecordRequested = 0
  for (const r of rows) {
    if (r.status === 'pending') pending += 1
    else if (r.status === 'recorded') recorded += 1
    else if (r.status === 'rejected') rejected += 1
    else if (r.status === 'approved') approved += 1
    else if (r.status === 'rerecord_requested') rerecordRequested += 1
  }
  return { pending, recorded, rejected, approved, rerecordRequested, total: rows.length }
}

export default function VoiceActorDashboardScreen({ navigation }: Props) {
  const [rows, setRows] = useState<{ status: RecordingStatus }[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    const { data, error: err } = await supabase.from('words').select('status')
    if (err) {
      setError(err.message)
      setRows([])
      return
    }
    setRows((data as { status: RecordingStatus }[] | null) ?? [])
  }, [])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await load()
      setLoading(false)
    })()
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const stats = useMemo(() => aggregateStatus(rows), [rows])
  const recordedForBar = stats.recorded + stats.approved
  const progress = stats.total > 0 ? recordedForBar / stats.total : 0

  const startRecording = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('words')
      .select('*')
      .in('status', ['pending', 'rejected', 'rerecord_requested'])
      .order('series', { ascending: true })
      .order('word', { ascending: true })
    if (err) {
      setError(err.message)
      return
    }
    const list = (data as RecordingWord[] | null) ?? []
    if (list.length === 0) return
    navigation.navigate('Recording', { words: list })
  }, [navigation])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    )
  }

  const hasWork = stats.pending + stats.rejected + stats.rerecordRequested > 0

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />
      }
    >
      <Text style={styles.title}>Recording Studio</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.progressSection}>
        <Text style={styles.progressLabel}>
          {recordedForBar} of {stats.total} recorded
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      </View>

      <View style={styles.pillRow}>
        <View style={[styles.pill, styles.pillPending]}>
          <Text style={styles.pillTextMuted}>Pending</Text>
          <Text style={styles.pillCount}>{stats.pending}</Text>
        </View>
        <View style={[styles.pill, styles.pillRecorded]}>
          <Text style={styles.pillTextAmber}>Recorded</Text>
          <Text style={styles.pillCount}>{stats.recorded}</Text>
        </View>
        <View style={[styles.pill, styles.pillRejected]}>
          <Text style={styles.pillTextRed}>Rejected</Text>
          <Text style={styles.pillCount}>{stats.rejected}</Text>
        </View>
        <View style={[styles.pill, styles.pillRerecord]}>
          <Text style={styles.pillTextViolet}>Re-record</Text>
          <Text style={styles.pillCount}>{stats.rerecordRequested}</Text>
        </View>
      </View>

      {hasWork ? (
        <Pressable style={styles.startBtn} onPress={() => void startRecording()}>
          <Text style={styles.startBtnText}>Start Recording</Text>
        </Pressable>
      ) : (
        <Text style={styles.caughtUp}>All caught up! Nothing to record.</Text>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 24,
  },
  error: {
    color: '#f87171',
    marginBottom: 12,
  },
  progressSection: {
    marginBottom: 24,
  },
  progressLabel: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  track: {
    height: 14,
    borderRadius: 7,
    backgroundColor: '#333333',
    overflow: 'hidden',
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
  },
  fill: {
    height: '100%',
    backgroundColor: '#7C3AED',
    borderRadius: 7,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 28,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 88,
    alignItems: 'center',
  },
  pillPending: {
    backgroundColor: '#3a3a3a',
  },
  pillRecorded: {
    backgroundColor: '#3a2500',
  },
  pillRejected: {
    backgroundColor: '#2a0a0a',
  },
  pillRerecord: {
    backgroundColor: '#1e1b4b',
  },
  pillTextViolet: {
    color: '#c4b5fd',
    fontSize: 11,
    fontWeight: '600',
  },
  pillTextMuted: {
    color: '#888888',
    fontSize: 11,
    fontWeight: '600',
  },
  pillTextAmber: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '600',
  },
  pillTextRed: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '600',
  },
  pillCount: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  startBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startBtnText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  caughtUp: {
    color: '#888888',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 8,
  },
})
