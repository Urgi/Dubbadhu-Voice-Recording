import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useLayoutEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import { ADMIN_ACCENT_GOLD } from '../components/lesson-config/AdminLessonConfigChrome'
import {
  approveDiscussionReview,
  fetchPendingDiscussionReviews,
  rejectDiscussionReview,
  type DiscussionReviewQueueRow,
} from '../lib/discussionReviewQueue'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminDiscussionReview'>

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function QueueCard({
  row,
  busy,
  onApprove,
  onReject,
}: {
  row: DiscussionReviewQueueRow
  busy: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const mod = row.moderation_result ?? {}
  const decision = String(mod.decision ?? 'review')
  const reason = String(mod.reason ?? '')
  const author = row.is_anonymous
    ? 'Anonymous'
    : row.author_first_name?.trim() || 'Learner'

  return (
    <View style={styles.card}>
      <Text style={styles.meta}>
        {formatWhen(row.created_at)} · {author} · AI: {decision}
      </Text>
      <Text style={styles.lesson}>Lesson: {row.lesson_id}</Text>
      {row.lesson_prompt ? (
        <Text style={styles.prompt} numberOfLines={3}>
          Prompt: {row.lesson_prompt}
        </Text>
      ) : null}
      <Text style={styles.message}>{row.message}</Text>
      {reason ? <Text style={styles.reason}>AI note: {reason}</Text> : null}
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.btnOutline, pressed && styles.btnPressed, busy && styles.btnDisabled]}
          onPress={onReject}
          disabled={busy}
        >
          <Text style={styles.btnOutlineText}>Reject</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.btnApprove, pressed && styles.btnPressed, busy && styles.btnDisabled]}
          onPress={onApprove}
          disabled={busy}
        >
          <Text style={styles.btnApproveText}>Approve & publish</Text>
        </Pressable>
      </View>
    </View>
  )
}

export default function AdminDiscussionReviewScreen({ navigation }: Props) {
  const [rows, setRows] = useState<DiscussionReviewQueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [actingId, setActingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError('')
    const { data, error: err } = await fetchPendingDiscussionReviews()
    if (err) {
      setError(err)
      setRows([])
    } else {
      setRows(data ?? [])
    }
  }, [])

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
      title: 'Discussion review queue',
      headerStyle: { backgroundColor: '#000000' },
      headerTitleStyle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
      headerTintColor: '#ffffff',
    })
  }, [navigation])

  const confirmApprove = (row: DiscussionReviewQueueRow) => {
    Alert.alert('Publish this post?', 'It will appear on the lesson discussion board.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Publish', onPress: () => void runApprove(row.queue_id) },
    ])
  }

  const confirmReject = (row: DiscussionReviewQueueRow) => {
    Alert.alert('Reject this post?', 'It will not be published.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => void runReject(row.queue_id) },
    ])
  }

  const runApprove = async (queueId: string) => {
    setActingId(queueId)
    const res = await approveDiscussionReview(queueId)
    setActingId(null)
    if (!res.ok) {
      Alert.alert('Could not publish', res.error ?? 'Try again.')
      return
    }
    setRows((prev) => prev.filter((r) => r.queue_id !== queueId))
  }

  const runReject = async (queueId: string) => {
    setActingId(queueId)
    const res = await rejectDiscussionReview(queueId)
    setActingId(null)
    if (!res.ok) {
      Alert.alert('Could not reject', res.error ?? 'Try again.')
      return
    }
    setRows((prev) => prev.filter((r) => r.queue_id !== queueId))
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ADMIN_ACCENT_GOLD} />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true)
            void load().finally(() => setRefreshing(false))
          }}
          tintColor={ADMIN_ACCENT_GOLD}
        />
      }
    >
      <Text style={styles.lead}>
        Posts held after AI moderation (ambiguous, off-topic borderline, or service fallback). Approve to
        publish or reject to discard.
      </Text>
      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
      {rows.length === 0 ? (
        <Text style={styles.empty}>No posts awaiting review.</Text>
      ) : (
        rows.map((row) => (
          <QueueCard
            key={row.queue_id}
            row={row}
            busy={actingId === row.queue_id}
            onApprove={() => confirmApprove(row)}
            onReject={() => confirmReject(row)}
          />
        ))
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  lead: { color: '#a3a3a3', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  errorBanner: {
    color: '#fecaca',
    backgroundColor: 'rgba(127, 29, 29, 0.35)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 13,
  },
  empty: { color: '#737373', fontSize: 15, marginTop: 24, textAlign: 'center' },
  card: {
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: 14,
    marginBottom: 12,
  },
  meta: { color: '#a3a3a3', fontSize: 12, marginBottom: 6 },
  lesson: { color: ADMIN_ACCENT_GOLD, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  prompt: { color: '#a3a3a3', fontSize: 12, marginBottom: 8, fontStyle: 'italic' },
  message: { color: '#fafafa', fontSize: 15, lineHeight: 22, marginBottom: 8 },
  reason: { color: '#d4d4d4', fontSize: 12, marginBottom: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' },
  btnOutline: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#525252',
  },
  btnOutlineText: { color: '#e5e5e5', fontSize: 13, fontWeight: '600' },
  btnApprove: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    borderWidth: 1,
    borderColor: ADMIN_ACCENT_GOLD,
  },
  btnApproveText: { color: ADMIN_ACCENT_GOLD, fontSize: 13, fontWeight: '700' },
  btnPressed: { opacity: 0.85 },
  btnDisabled: { opacity: 0.5 },
})
