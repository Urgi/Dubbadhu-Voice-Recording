import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useLayoutEffect, useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import { ADMIN_ACCENT_GOLD } from '../components/lesson-config/AdminLessonConfigChrome'
import {
  fetchRegisteredUsers,
  registeredUserDisplayName,
  type AdminRegisteredUserRow,
} from '../lib/adminUsers'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminUsers'>

function formatLastLogin(value: string | null): string {
  if (!value) return '—'
  // DATE comes as YYYY-MM-DD; keep short and readable.
  const trimmed = String(value).slice(0, 10)
  const [y, m, d] = trimmed.split('-')
  if (!y || !m || !d) return trimmed
  return `${m}/${d}/${y}`
}

function UserRow({ row }: { row: AdminRegisteredUserRow }) {
  return (
    <View style={styles.row}>
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
          <Text style={styles.statValue}>{formatLastLogin(row.last_activity_date)}</Text>
          <Text style={styles.statLabel}>Last login</Text>
        </View>
      </View>
    </View>
  )
}

export default function AdminUsersScreen({ navigation }: Props) {
  const [rows, setRows] = useState<AdminRegisteredUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadList = useCallback(async () => {
    setError('')
    const { data, error: err } = await fetchRegisteredUsers()
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
      title: 'Registered users',
      headerStyle: { backgroundColor: '#000000' },
      headerTitleStyle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
      headerTintColor: '#ffffff',
    })
  }, [navigation])

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
        Name, streak, top streak, and last login (users.last_activity_date). Newest first.
      </Text>
      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
      <Text style={styles.count}>{rows.length} shown</Text>
      {rows.length === 0 && !error ? (
        <Text style={styles.empty}>No registered users found.</Text>
      ) : (
        rows.map((row) => <UserRow key={row.id} row={row} />)
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
})
