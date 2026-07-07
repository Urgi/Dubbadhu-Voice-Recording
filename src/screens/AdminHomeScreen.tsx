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

type HubTile = {
  title: string
  lines: string[]
  hint: string
  onPress: () => void
}

function HubSection({
  title,
  subtitle,
  badge,
  tiles,
}: {
  title: string
  subtitle: string
  badge?: string | null
  tiles: HubTile[]
}) {
  return (
    <View style={styles.hubSection}>
      <View style={styles.hubHeader}>
        <View style={styles.hubHeaderText}>
          <Text style={styles.hubTitle}>{title}</Text>
          <Text style={styles.hubSubtitle}>{subtitle}</Text>
        </View>
        {badge ? <Text style={styles.hubBadge}>{badge}</Text> : null}
      </View>
      {tiles.map((tile) => (
        <Pressable
          key={tile.title}
          style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
          onPress={tile.onPress}
        >
          <Text style={styles.tileTitle}>{tile.title}</Text>
          {tile.lines.map((line) => (
            <Text key={line} style={styles.recordedLine}>
              {line}
            </Text>
          ))}
          <Text style={styles.tileHint}>{tile.hint}</Text>
        </Pressable>
      ))}
    </View>
  )
}

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
      fidelUnapprovedRes,
      usersRes,
      seriesTotalRes,
      unapprovedSeriesRes,
      discussionReportsCount,
      discussionReviewCount,
      freeAccessRes,
    ] = await Promise.all([
      supabase.from('words').select('id', { count: 'exact', head: true }).eq('status', 'recorded'),
      supabase.from('qubee_letters').select('id', { count: 'exact', head: true }).eq('status', 'recorded'),
      supabase.from('fidel_letters').select('id', { count: 'exact', head: true }).eq('status', 'recorded'),
      supabase.rpc('admin_users_total_count'),
      supabase.from('lesson_series').select('id', { count: 'exact', head: true }),
      supabase
        .from('lesson_series')
        .select('id', { count: 'exact', head: true })
        .or('approved.eq.false,approved.is.null'),
      fetchOpenCommunityBoardReportsCount(),
      fetchPendingDiscussionReviewCount(),
      supabase.rpc('admin_complimentary_users_count'),
    ])

    const errs: string[] = []
    const wordPending = unapprovedRes.error ? null : (unapprovedRes.count ?? 0)
    const qubeePending = qubeeUnapprovedRes.error ? null : (qubeeUnapprovedRes.count ?? 0)
    const fidelPending = fidelUnapprovedRes.error ? null : (fidelUnapprovedRes.count ?? 0)
    if (unapprovedRes.error) errs.push(unapprovedRes.error.message)
    if (qubeeUnapprovedRes.error) errs.push(`qubee_letters: ${qubeeUnapprovedRes.error.message}`)
    if (fidelUnapprovedRes.error) errs.push(`fidel_letters: ${fidelUnapprovedRes.error.message}`)
    const pendingParts = [wordPending, qubeePending, fidelPending].filter((n) => n != null) as number[]
    if (pendingParts.length > 0) {
      setUnapprovedCount(pendingParts.reduce((sum, n) => sum + n, 0))
    } else {
      setUnapprovedCount(null)
    }
    if (usersRes.error) {
      errs.push(`users: ${usersRes.error.message}`)
      setUsersTotal(null)
    } else {
      setUsersTotal(Number(usersRes.data ?? 0))
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
      setFreeAccessCount(Number(freeAccessRes?.data ?? 0))
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

  const assetBadge =
    unapprovedCount != null || unapprovedSeriesCount != null
      ? `${(unapprovedCount ?? 0) + (unapprovedSeriesCount ?? 0)} pending`
      : null
  const moderationBadge =
    openDiscussionReports != null || pendingDiscussionReviews != null
      ? `${(pendingDiscussionReviews ?? 0) + (openDiscussionReports ?? 0)} open`
      : null

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {refreshing ? (
        <View style={styles.inlineRefresh}>
          <ActivityIndicator size="small" color="#fbbf24" />
        </View>
      ) : null}
      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      <HubSection
        title="Asset Management"
        subtitle="Lessons, audio, vocab, and media that ship to learners"
        badge={assetBadge}
        tiles={[
          {
            title: 'Series Config',
            lines: [
              `Total Series : ${seriesTotal ?? '—'}`,
              `Unapproved Series : ${unapprovedSeriesCount ?? '—'}`,
            ],
            hint: 'Edit lesson JSON, series metadata, and publish status',
            onPress: () => navigation.navigate('LessonConfig'),
          },
          {
            title: 'Voice Recording',
            lines: [`Approval Requests : ${unapprovedCount ?? '—'}`],
            hint: 'Vocabulary audio by series — record, review, approve',
            onPress: () => navigation.navigate('AdminSeriesList'),
          },
          {
            title: 'Vocab Center',
            lines: ['Edit words + translations · generate/select pictures'],
            hint: 'Lexical assets and illustration review for the Vocab tab',
            onPress: () => navigation.navigate('AdminVocabIllustrationReview'),
          },
          {
            title: 'Qubee Letters',
            lines: ['Alphabet recordings + approval queue'],
            hint: 'One audio clip per Oromo letter',
            onPress: () => navigation.navigate('QubeeLettersHub'),
          },
          {
            title: 'Fidel Letters',
            lines: ["Ge'ez syllable recordings + approval queue"],
            hint: 'Approve syllable clips used in Fidel Quiz',
            onPress: () => navigation.navigate('FidelLettersHub'),
          },
        ]}
      />

      <HubSection
        title="Content Moderation"
        subtitle="Community posts, reports, and curated learner sentences"
        badge={moderationBadge}
        tiles={[
          {
            title: 'Discussion review queue',
            lines: [`Pending AI review : ${pendingDiscussionReviews ?? '—'}`],
            hint: 'Approve or reject posts held before publication',
            onPress: () => navigation.navigate('AdminDiscussionReview'),
          },
          {
            title: 'Lesson Discussion Reports',
            lines: [`Open reports : ${openDiscussionReports ?? '—'}`],
            hint: 'Dismiss or remove learner-flagged board posts',
            onPress: () => navigation.navigate('AdminCommunityReports'),
          },
          {
            title: 'Practice Suggestions',
            lines: ['Curate “From the community” on Practice (7 per day, tied to Word of the Day)'],
            hint: 'Pick sentences that use today’s WOTD — learners see your picks first',
            onPress: () => navigation.navigate('AdminPracticeSuggestions'),
          },
        ]}
      />

      <HubSection
        title="Analytics"
        subtitle="Product health, user insights, and support lookups"
        badge={usersTotal != null ? `${usersTotal} users` : null}
        tiles={[
          {
            title: 'Analytics',
            lines: [`Total Users : ${usersTotal ?? '—'}`],
            hint: 'Dashboards, retention, waitlist, and Gemini Q&A (up to 10k events)',
            onPress: () => navigation.navigate('AdminAnalytics'),
          },
          {
            title: 'Free access',
            lines: [`Complimentary Premium : ${freeAccessCount ?? '—'}`],
            hint: 'Audit complimentary Premium grants · search by phone',
            onPress: () => navigation.navigate('AdminFreeAccess'),
          },
        ]}
      />
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
    gap: 8,
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
  hubSection: {
    marginBottom: 18,
    gap: 10,
  },
  hubHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 4,
  },
  hubHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  hubTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  hubSubtitle: {
    color: '#8e8e93',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  hubBadge: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
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
  recordedLine: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '400',
    marginTop: 10,
    lineHeight: 20,
  },
  tileHint: {
    color: '#8e8e93',
    fontSize: 13,
    fontWeight: '400',
    marginTop: 8,
    lineHeight: 18,
  },
})
