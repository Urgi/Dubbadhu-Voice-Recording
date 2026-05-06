import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import { ADMIN_ACCENT_GOLD } from '../components/lesson-config/AdminLessonConfigChrome'
import { useAuth } from '../context/AuthContext'
import supabase from '../lib/supabase'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminHome'>

export default function AdminHomeScreen({ navigation }: Props) {
  const { setRole } = useAuth()
  const [unapprovedCount, setUnapprovedCount] = useState<number | null>(null)
  const [usersTotal, setUsersTotal] = useState<number | null>(null)
  const [seriesTotal, setSeriesTotal] = useState<number | null>(null)
  const [unapprovedSeriesCount, setUnapprovedSeriesCount] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [error, setError] = useState('')
  const isFirstFocus = useRef(true)

  const loadCounts = useCallback(async () => {
    setError('')
    const [
      unapprovedRes,
      usersRes,
      seriesTotalRes,
      unapprovedSeriesRes,
    ] = await Promise.all([
      supabase.from('words').select('id', { count: 'exact', head: true }).eq('status', 'recorded'),
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('lesson_series').select('id', { count: 'exact', head: true }),
      supabase
        .from('lesson_series')
        .select('id', { count: 'exact', head: true })
        .or('approved.eq.false,approved.is.null'),
    ])

    const errs: string[] = []
    if (unapprovedRes.error) {
      errs.push(unapprovedRes.error.message)
      setUnapprovedCount(null)
    } else {
      setUnapprovedCount(unapprovedRes.count ?? 0)
    }
    if (usersRes.error) {
      errs.push(`users: ${usersRes.error.message}`)
      setUsersTotal(null)
    } else {
      setUsersTotal(usersRes.count ?? 0)
    }
    if (seriesTotalRes.error) {
      errs.push(`lesson_series (total): ${seriesTotalRes.error.message}`)
      setSeriesTotal(null)
    } else {
      setSeriesTotal(seriesTotalRes.count ?? 0)
    }
    if (unapprovedSeriesRes.error) {
      errs.push(`lesson_series (unapproved): ${unapprovedSeriesRes.error.message}`)
      setUnapprovedSeriesCount(null)
    } else {
      setUnapprovedSeriesCount(unapprovedSeriesRes.count ?? 0)
    }
    setError(errs.join('\n'))
  }, [])

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void (async () => {
        if (isFirstFocus.current) {
          isFirstFocus.current = false
        } else {
          setRefreshing(true)
        }
        await loadCounts()
        if (!cancelled) {
          setRefreshing(false)
          setInitialLoadDone(true)
        }
      })()
      return () => {
        cancelled = true
      }
    }, [loadCounts]),
  )

  const onSignOut = useCallback(() => {
    setRole(null)
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] })
  }, [navigation, setRole])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Admin Control Center',
      headerStyle: { backgroundColor: '#000000' },
      headerTitleStyle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
      headerTintColor: '#ffffff',
      headerLeft: () => (
        <Pressable onPress={onSignOut} style={styles.headerBtn} hitSlop={8}>
          <Text style={styles.headerBtnText}>Sign Out</Text>
        </Pressable>
      ),
    })
  }, [navigation, onSignOut])

  if (!initialLoadDone) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#fbbf24" />
      </View>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {refreshing ? (
        <View style={styles.inlineRefresh}>
          <ActivityIndicator size="small" color="#fbbf24" />
        </View>
      ) : null}
      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      <Pressable
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        onPress={() => navigation.navigate('AdminSeriesList')}
      >
        <Text style={styles.tileTitle}>Voice Recording</Text>
        <Text style={styles.recordedLine}>
          Approval Requests :{' '}
          <Text style={styles.recordedCount}>{unapprovedCount ?? '—'}</Text>
        </Text>
        <Text style={styles.tileHint}>Tap to open Voice Recording (series list)</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        onPress={() => navigation.navigate('AdminAnalytics')}
      >
        <Text style={styles.tileTitle}>Analytics</Text>
        <Text style={styles.recordedLine}>
          Total Users :{' '}
          <Text style={styles.recordedCount}>{usersTotal ?? '—'}</Text>
        </Text>
        <Text style={styles.tileHint}>Tap for dashboards and AI summary of last 100 events</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        onPress={() => navigation.navigate('AdminVocabIllustrationReview')}
      >
        <Text style={styles.tileTitle}>Vocab illustrations QA</Text>
        <Text style={styles.recordedLine}>Review quiz images · mark good/bad + notes</Text>
        <Text style={styles.tileHint}>Use feedback when regenerating illustrations</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        onPress={() => navigation.navigate('LessonConfig')}
      >
        <Text style={styles.tileTitle}>Series Config</Text>
        <Text style={styles.recordedLine}>
          Total Series :{' '}
          <Text style={styles.recordedCount}>{seriesTotal ?? '—'}</Text>
        </Text>
        <Text style={[styles.recordedLine, styles.metricLineFollow]}>
          Unapproved Series :{' '}
          <Text style={styles.recordedCount}>{unapprovedSeriesCount ?? '—'}</Text>
        </Text>
        <Text style={styles.tileHint}>Tap here to change lesson and series data</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 14,
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
  inlineRefresh: {
    alignItems: 'center',
    marginBottom: 8,
  },
  errorBanner: {
    color: '#f87171',
    marginBottom: 12,
    fontSize: 14,
  },
  tile: {
    backgroundColor: '#1c1c1e',
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 0,
  },
  tilePressed: {
    opacity: 0.92,
  },
  tileTitle: {
    color: ADMIN_ACCENT_GOLD,
    fontSize: 18,
    fontWeight: '700',
  },
  /** Subtitle row: white body; count uses `recordedCount` (gold). */
  recordedLine: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '400',
    marginTop: 10,
    lineHeight: 20,
  },
  recordedCount: {
    color: '#fbbf24',
    fontWeight: '700',
  },
  metricLineFollow: {
    marginTop: 6,
  },
  tileHint: {
    color: '#8e8e93',
    fontSize: 13,
    fontWeight: '400',
    marginTop: 8,
    lineHeight: 18,
  },
})
