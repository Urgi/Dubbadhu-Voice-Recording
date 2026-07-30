import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useLayoutEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import { ADMIN_ACCENT_GOLD } from '../components/lesson-config/AdminLessonConfigChrome'
import { registeredUserDisplayName } from '../lib/adminUsers'
import {
  fetchSignupTimelineForUser,
  type RecentSignupTimeline,
} from '../lib/recentSignupTimelines'
import supabase from '../lib/supabase'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminUserTimeline'>

export default function AdminUserTimelineScreen({ navigation, route }: Props) {
  const user = route.params.user
  const [timeline, setTimeline] = useState<RecentSignupTimeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    const res = await fetchSignupTimelineForUser(supabase, user)
    if (res.error && !res.data) {
      setError(res.error)
      setTimeline(null)
    } else {
      if (res.error) setError(res.error)
      setTimeline(res.data)
    }
  }, [user])

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
      title: registeredUserDisplayName(user),
      headerStyle: { backgroundColor: '#000000' },
      headerTitleStyle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
      headerTintColor: '#ffffff',
    })
  }, [navigation, user])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ADMIN_ACCENT_GOLD} />
      </View>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
      {timeline ? (
        <View style={styles.card}>
          <Text style={styles.title}>{timeline.title}</Text>
          <Text style={styles.summary}>{timeline.lessonSummary}</Text>
          {timeline.steps.map((step, si) => (
            <View key={`${timeline.userId}-${si}-${step.label}`} style={styles.step}>
              <View style={styles.dotCol}>
                <View style={styles.dot} />
                {si < timeline.steps.length - 1 ? <View style={styles.line} /> : null}
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepLabel}>{step.label}</Text>
                {step.detail ? <Text style={styles.stepDetail}>{step.detail}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>No timeline available.</Text>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  content: { padding: 16, paddingBottom: 40 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  errorBanner: {
    color: '#fca5a5',
    backgroundColor: '#450a0a',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    marginBottom: 12,
  },
  empty: { color: '#6b7280', fontSize: 14, marginTop: 12 },
  card: {
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 16,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 4 },
  summary: { fontSize: 13, color: '#fbbf24', fontWeight: '600', marginBottom: 14 },
  step: { flexDirection: 'row', alignItems: 'stretch', minHeight: 28 },
  dotCol: { width: 14, alignItems: 'center', paddingTop: 5 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ADMIN_ACCENT_GOLD,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: '#374151',
    marginTop: 2,
  },
  stepBody: { flex: 1, paddingBottom: 12, paddingLeft: 8 },
  stepLabel: { fontSize: 14, color: '#e5e7eb', fontWeight: '500' },
  stepDetail: { fontSize: 12, color: '#888888', marginTop: 2 },
})
