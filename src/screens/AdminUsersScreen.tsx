import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useLayoutEffect, useState } from 'react'
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
import { ADMIN_ACCENT_GOLD } from '../components/lesson-config/AdminLessonConfigChrome'
import {
  fetchActiveUsersToday,
  fetchRegisteredUsers,
  registeredUserDisplayName,
  userRowToTimelineParams,
  type AdminRegisteredUserRow,
} from '../lib/adminUsers'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminUsers'>

function formatLastLogin(value: string | null | undefined): string {
  if (!value) return '—'
  // DATE comes as YYYY-MM-DD; keep short and readable.
  const trimmed = String(value).slice(0, 10)
  const [y, m, d] = trimmed.split('-')
  if (!y || !m || !d) return trimmed
  return `${m}/${d}/${y}`
}

function formatLastEventAt(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 16)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function UserRow({
  row,
  showLastEvent,
  onPress,
}: {
  row: AdminRegisteredUserRow
  showLastEvent: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open timeline for ${registeredUserDisplayName(row)}`}
    >
      <View style={styles.rowMain}>
        <Text style={styles.name} numberOfLines={1}>
          {registeredUserDisplayName(row)}
        </Text>
        {row.phone ? (
          <Text style={styles.phone} numberOfLines={1}>
            {row.phone}
          </Text>
        ) : null}
      </View>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{row.current_streak ?? 0}</Text>
          <Text style={styles.statLabel}>Streak</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{row.longest_streak ?? 0}</Text>
          <Text style={styles.statLabel}>Top</Text>
        </View>
        <View style={[styles.stat, styles.statWide]}>
          <Text style={styles.statValue}>
            {showLastEvent
              ? formatLastEventAt(row.last_event_at)
              : formatLastLogin(row.last_activity_date)}
          </Text>
          <Text style={styles.statLabel}>{showLastEvent ? 'Last active' : 'Last login'}</Text>
        </View>
      </View>
      <Text style={styles.timelineHint}>Tap for signup → lesson timeline</Text>
    </Pressable>
  )
}

export default function AdminUsersScreen({ navigation, route }: Props) {
  const mode = route.params?.mode === 'activeToday' ? 'activeToday' : 'registered'
  const isActiveToday = mode === 'activeToday'

  const [rows, setRows] = useState<AdminRegisteredUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadList = useCallback(async () => {
    setError('')
    const result = isActiveToday ? await fetchActiveUsersToday(10) : await fetchRegisteredUsers()
    if (result.error) {
      setError(result.error)
      setRows([])
    } else {
      setRows(result.data ?? [])
    }
  }, [isActiveToday])

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void (async () => {
        setLoading(true)
        await loadList()
        if (!cancelled) setLoading(false)
      })()
      return () => {
        cancelled = true
      }
    }, [loadList]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadList()
    setRefreshing(false)
  }, [loadList])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: isActiveToday ? 'Active today' : 'Registered users',
      headerStyle: { backgroundColor: '#000000' },
      headerTitleStyle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
      headerTintColor: '#ffffff',
    })
  }, [navigation, isActiveToday])

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
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ADMIN_ACCENT_GOLD} />
      }
    >
      <Text style={styles.lead}>
        {isActiveToday
          ? 'Users with analytics activity today (Pacific). Most recent first, max 10. Tap a user for their lesson timeline.'
          : 'Name, streak, top streak, and last login. Newest first. Tap a user for their lesson timeline.'}
      </Text>
      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
      <Text style={styles.count}>{rows.length} shown</Text>
      {rows.length === 0 && !error ? (
        <Text style={styles.empty}>
          {isActiveToday ? 'No active users today yet.' : 'No registered users found.'}
        </Text>
      ) : (
        rows.map((row) => (
          <UserRow
            key={row.id}
            row={row}
            showLastEvent={isActiveToday}
            onPress={() =>
              navigation.navigate('AdminUserTimeline', { user: userRowToTimelineParams(row) })
            }
          />
        ))
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 10,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  lead: {
    color: '#9ca3af',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  count: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  errorBanner: {
    color: '#fca5a5',
    backgroundColor: '#450a0a',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
  },
  empty: {
    color: '#6b7280',
    fontSize: 14,
    marginTop: 12,
  },
  row: {
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 12,
    gap: 10,
  },
  rowPressed: {
    opacity: 0.88,
  },
  rowMain: {
    gap: 2,
  },
  name: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  phone: {
    color: '#9ca3af',
    fontSize: 12,
  },
  stats: {
    flexDirection: 'row',
    gap: 8,
  },
  stat: {
    flex: 1,
    backgroundColor: '#0b1220',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  statWide: {
    flex: 1.4,
  },
  statValue: {
    color: ADMIN_ACCENT_GOLD,
    fontSize: 14,
    fontWeight: '700',
  },
  statLabel: {
    color: '#6b7280',
    fontSize: 10,
    marginTop: 2,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  timelineHint: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '500',
  },
})
