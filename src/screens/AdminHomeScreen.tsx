import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import { ADMIN_ACCENT_GOLD } from '../components/lesson-config/AdminLessonConfigChrome'
import { useAuth } from '../context/AuthContext'
import { fetchOpenCommunityBoardReportsCount } from '../lib/communityBoardReports'
import { fetchPendingDiscussionReviewCount } from '../lib/discussionReviewQueue'
import supabase from '../lib/supabase'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminHome'>

export default function AdminHomeScreen({ navigation }: Props) {
  const { setRole } = useAuth()
  const [unapprovedCount, setUnapprovedCount] = useState<number | null>(null)
  const [usersTotal, setUsersTotal] = useState<number | null>(null)
  const [seriesTotal, setSeriesTotal] = useState<number | null>(null)
  const [unapprovedSeriesCount, setUnapprovedSeriesCount] = useState<number | null>(null)
  const [openDiscussionReports, setOpenDiscussionReports] = useState<number | null>(null)
  const [pendingDiscussionReviews, setPendingDiscussionReviews] = useState<number | null>(null)
  const [freeAccessCount, setFreeAccessCount] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [error, setError] = useState('')
  const isFirstFocus = useRef(true)

  const loadCounts = useCallback(async () => {
    setError('')
    const [
      unapprovedRes,
      qubeeUnapprovedRes,
      usersRes,
      seriesTotalRes,
      unapprovedSeriesRes,
      discussionReportsCount,
      discussionReviewCount,
      freeAccessRes,
    ] = await Promise.all([
      supabase.from('words').select('id', { count: 'exact', head: true }).eq('status', 'recorded'),
      supabase.from('qubee_letters').select('id', { count: 'exact', head: true }).eq('status', 'recorded'),
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('lesson_series').select('id', { count: 'exact', head: true }),
      supabase
        .from('lesson_series')
        .select('id', { count: 'exact', head: true })
        .or('approved.eq.false,approved.is.null'),
      fetchOpenCommunityBoardReportsCount(),
      fetchPendingDiscussionReviewCount(),
      supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('premium_source', 'complimentary')
        .eq('isPremium', true),
    ])

    const errs: string[] = []
    const wordPending = unapprovedRes.error ? null : (unapprovedRes.count ?? 0)
    const qubeePending = qubeeUnapprovedRes.error ? null : (qubeeUnapprovedRes.count ?? 0)
    if (unapprovedRes.error) errs.push(unapprovedRes.error.message)
    if (qubeeUnapprovedRes.error) errs.push(`qubee_letters: ${qubeeUnapprovedRes.error.message}`)
    if (wordPending != null && qubeePending != null) {
      setUnapprovedCount(wordPending + qubeePending)
    } else if (wordPending != null) {
      setUnapprovedCount(wordPending)
    } else {
      setUnapprovedCount(null)
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
    setOpenDiscussionReports(discussionReportsCount)
    setPendingDiscussionReviews(discussionReviewCount)
    if (freeAccessRes?.error) {
      errs.push(`free access: ${freeAccessRes.error.message}`)
      setFreeAccessCount(null)
    } else {
      setFreeAccessCount(freeAccessRes?.count ?? 0)
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
        onPress={() => navigation.navigate('AdminDiscussionReview')}
      >
        <Text style={styles.tileTitle}>Discussion review queue</Text>
        <Text style={styles.recordedLine}>
          Pending AI review :{' '}
          <Text style={styles.recordedCount}>{pendingDiscussionReviews ?? '—'}</Text>
        </Text>
        <Text style={styles.tileHint}>Approve or reject posts held before publication</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        onPress={() => navigation.navigate('AdminCommunityReports')}
      >
        <Text style={styles.tileTitle}>Lesson Discussion Reports</Text>
        <Text style={styles.recordedLine}>
          Open reports :{' '}
          <Text style={styles.recordedCount}>{openDiscussionReports ?? '—'}</Text>
        </Text>
        <Text style={styles.tileHint}>Review learner reports · dismiss or remove posts from the board</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        onPress={() => navigation.navigate('AdminPracticeSuggestions')}
      >
        <Text style={styles.tileTitle}>Practice Suggestions</Text>
        <Text style={styles.recordedLine}>
          Curate “From the community” on Practice (7 per day, tied to Word of the Day)
        </Text>
        <Text style={styles.tileHint}>Select sentences that use today’s WOTD — learners see your picks first</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        onPress={() => navigation.navigate('AdminFreeAccess')}
      >
        <Text style={styles.tileTitle}>Free access</Text>
        <Text style={styles.recordedLine}>
          Complimentary Premium :{' '}
          <Text style={styles.recordedCount}>{freeAccessCount ?? '—'}</Text>
        </Text>
        <Text style={styles.tileHint}>
          isPremium true, no product id · search by phone · alert if store ppid exists
        </Text>
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
        onPress={() => navigation.navigate('QubeeLettersHub')}
      >
        <Text style={styles.tileTitle}>Qubee Letters</Text>
        <Text style={styles.recordedLine}>Alphabet recordings + approval queue</Text>
        <Text style={styles.tileHint}>One audio clip per letter — same approve / re-record flow as vocabulary</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        onPress={() => navigation.navigate('AdminVocabIllustrationReview')}
      >
        <Text style={styles.tileTitle}>Vocab Center</Text>
        <Text style={styles.recordedLine}>Edit words + translations · generate/select pictures</Text>
        <Text style={styles.tileHint}>Admin can toggle PictureFriendly (gates image generation)</Text>
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
