import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import { useAuth } from '../context/AuthContext'
import supabase from '../lib/supabase'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminHome'>

export default function AdminHomeScreen({ navigation }: Props) {
  const { setRole } = useAuth()
  const [unapprovedCount, setUnapprovedCount] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [error, setError] = useState('')
  const isFirstFocus = useRef(true)

  const loadCounts = useCallback(async () => {
    setError('')
    const unapprovedRes = await supabase
      .from('words')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'recorded')

    if (unapprovedRes.error) {
      setError(unapprovedRes.error.message)
      setUnapprovedCount(null)
    } else {
      setUnapprovedCount(unapprovedRes.count ?? 0)
    }
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
      title: 'Admin',
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
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {refreshing ? (
        <View style={styles.inlineRefresh}>
          <ActivityIndicator size="small" color="#7C3AED" />
        </View>
      ) : null}
      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      <Pressable
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        onPress={() => navigation.navigate('AdminSeriesList')}
      >
        <Text style={styles.tileTitle}>Voice Recording</Text>
        <Text style={styles.recordedLine}>
          Recorded, not yet approved ·{' '}
          <Text style={styles.recordedCount}>{unapprovedCount ?? '—'}</Text>
        </Text>
        <Text style={styles.tileHint}>Tap to open Voice Recording (series list)</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        onPress={() => navigation.navigate('AdminAnalytics')}
      >
        <Text style={styles.tileTitle}>Analytics</Text>
        <Text style={styles.recordedLine}>Users, waitlist, retention, events, Gemini</Text>
        <Text style={styles.tileHint}>Tap for dashboards and AI summary of last 100 events</Text>
      </Pressable>
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
  headerBtn: {
    marginLeft: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  headerBtnText: {
    color: '#a1a1aa',
    fontSize: 15,
    fontWeight: '600',
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
    backgroundColor: '#18181b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 20,
    marginBottom: 12,
  },
  tilePressed: {
    opacity: 0.88,
  },
  tileTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  /** Same typography as `SeriesTileCard` unapproved line + count */
  recordedLine: {
    color: '#d4d4d8',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  recordedCount: {
    color: '#fbbf24',
    fontWeight: '800',
  },
  tileHint: {
    color: '#71717a',
    fontSize: 13,
    marginTop: 8,
  },
})
