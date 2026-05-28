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
  dismissCommunityBoardReport,
  fetchOpenCommunityBoardReports,
  removeCommunityBoardPostAdmin,
  type CommunityBoardReportRow,
} from '../lib/communityBoardReports'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminCommunityReports'>

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

function reviewDeadlineLabel(hiddenAt: string | null): string | null {
  if (!hiddenAt) return null
  try {
    const deadline = new Date(hiddenAt)
    deadline.setHours(deadline.getHours() + 24)
    return `Review by ${formatWhen(deadline.toISOString())}`
  } catch {
    return null
  }
}

function ReportCard({
  row,
  busy,
  onDismiss,
  onRemovePost,
}: {
  row: CommunityBoardReportRow
  busy: boolean
  onDismiss: () => void
  onRemovePost: () => void
}) {
  const lesson = row.lesson_id ?? '—'
  const author = row.post_author_first_name?.trim() || 'Unknown'
  const reporter = row.reporter_first_name?.trim() || 'Anonymous'
  const isHiddenPending = row.post_moderation_status === 'hidden_pending_review'
  const reviewBy = reviewDeadlineLabel(row.post_hidden_at)

  return (
    <View style={styles.card}>
      <Text style={styles.cardMeta}>
        Reported {formatWhen(row.report_created_at)} · by {reporter}
      </Text>
      {isHiddenPending ? (
        <Text style={styles.cardHidden}>
          Hidden from learners{row.post_hidden_at ? ` since ${formatWhen(row.post_hidden_at)}` : ''}
          {reviewBy ? ` · ${reviewBy}` : ''}
        </Text>
      ) : null}
      <Text style={styles.cardLesson}>Lesson: {lesson}</Text>
      <Text style={styles.cardAuthor}>Post author: {author}</Text>
      <Text style={styles.cardMessage}>{row.post_message}</Text>
      {row.post_is_deleted ? (
        <Text style={styles.cardDeleted}>Post already removed from board</Text>
      ) : null}
      <View style={styles.cardActions}>
        <Pressable
          style={({ pressed }) => [styles.btnOutline, pressed && styles.btnPressed, busy && styles.btnDisabled]}
          onPress={onDismiss}
          disabled={busy}
        >
          <Text style={styles.btnOutlineText}>Restore post</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.btnDanger, pressed && styles.btnPressed, busy && styles.btnDisabled]}
          onPress={onRemovePost}
          disabled={busy || row.post_is_deleted}
        >
          <Text style={styles.btnDangerText}>Remove from board</Text>
        </Pressable>
      </View>
    </View>
  )
}

export default function AdminCommunityReportsScreen({ navigation }: Props) {
  const [rows, setRows] = useState<CommunityBoardReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [actingId, setActingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError('')
    const { data, error: err } = await fetchOpenCommunityBoardReports()
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
      title: 'Discussion Reports',
      headerStyle: { backgroundColor: '#000000' },
      headerTitleStyle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
      headerTintColor: '#ffffff',
    })
  }, [navigation])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const confirmDismiss = (row: CommunityBoardReportRow) => {
    Alert.alert(
      'Restore this post?',
      'Dismiss the report and return the post to all learners if no other open reports remain for it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: () => void runDismiss(row.report_id),
        },
      ],
    )
  }

  const confirmRemove = (row: CommunityBoardReportRow) => {
    Alert.alert(
      'Remove post from board?',
      'Learners will no longer see this post. Open reports for this post will be marked resolved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove post',
          style: 'destructive',
          onPress: () => void runRemove(row),
        },
      ],
    )
  }

  const runDismiss = async (reportId: string) => {
    setActingId(reportId)
    const res = await dismissCommunityBoardReport(reportId)
    setActingId(null)
    if (!res.ok) {
      Alert.alert('Could not dismiss', res.error ?? 'Try again.')
      return
    }
    setRows((prev) => prev.filter((r) => r.report_id !== reportId))
  }

  const runRemove = async (row: CommunityBoardReportRow) => {
    setActingId(row.report_id)
    const res = await removeCommunityBoardPostAdmin(row.post_id)
    setActingId(null)
    if (!res.ok) {
      Alert.alert('Could not remove post', res.error ?? 'Try again.')
      return
    }
    setRows((prev) => prev.filter((r) => r.report_id !== row.report_id))
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
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={ADMIN_ACCENT_GOLD} />
      }
    >
      <Text style={styles.lead}>
        Reported posts are hidden from learners immediately. Restore within 24 hours if the report was
        mistaken, or remove the post to confirm deletion.
      </Text>
      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
      {rows.length === 0 ? (
        <Text style={styles.empty}>No open reports.</Text>
      ) : (
        rows.map((row) => (
          <ReportCard
            key={row.report_id}
            row={row}
            busy={actingId === row.report_id}
            onDismiss={() => confirmDismiss(row)}
            onRemovePost={() => confirmRemove(row)}
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
  cardMeta: { color: '#a3a3a3', fontSize: 12, marginBottom: 6 },
  cardHidden: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    lineHeight: 17,
  },
  cardLesson: { color: ADMIN_ACCENT_GOLD, fontSize: 12, fontWeight: '600', marginBottom: 4 },
  cardAuthor: { color: '#d4d4d4', fontSize: 13, marginBottom: 8 },
  cardMessage: { color: '#fafafa', fontSize: 15, lineHeight: 22, marginBottom: 10 },
  cardDeleted: { color: '#f87171', fontSize: 12, marginBottom: 10 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  btnOutline: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#525252',
  },
  btnOutlineText: { color: '#e5e5e5', fontSize: 13, fontWeight: '600' },
  btnDanger: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: 'rgba(185, 28, 28, 0.35)',
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  btnDangerText: { color: '#fecaca', fontSize: 13, fontWeight: '600' },
  btnPressed: { opacity: 0.85 },
  btnDisabled: { opacity: 0.5 },
})
