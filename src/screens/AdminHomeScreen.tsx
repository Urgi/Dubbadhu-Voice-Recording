/** Admin home — control center. */
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import { ADMIN_ACCENT_GOLD } from '../components/lesson-config/AdminLessonConfigChrome'
import SeriesPipelineBlock from '../components/SeriesPipelineBlock'
import { useAuth } from '../context/AuthContext'
import { registerAdminPushToken } from '../lib/adminPushRegistration'
import {
  ADMIN_HOME_SECTIONS,
  sectionBadge,
  type AdminHomeCounts,
  type AdminHomeSectionId,
} from '../lib/adminHomeSections'
import { fetchOpenCommunityBoardReportsCount } from '../lib/communityBoardReports'
import { fetchPendingDiscussionReviewCount } from '../lib/discussionReviewQueue'
import {
  METRIC_TONE_COLOR,
  explainActivationMetric,
  explainPremiumMetric,
  explainRegisteredMetric,
  toneForActivationPercent,
  toneForPremiumPercent,
  toneForRegisteredTotal,
  toneForWeeklyActivationDelta,
  toneForWeeklyPremiumDelta,
  toneForWeeklyRegisteredDelta,
} from '../lib/adminMetricTone'
import {
  fetchProductionSeriesPipeline,
  type ProductionSeriesPipeline,
} from '../lib/productionSeriesPipeline'
import {
  fetchRecentSignupFunnelRates,
  type RecentSignupFunnelRates,
} from '../lib/recentSignupActivation'
import supabase from '../lib/supabase'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminHome'>

const HOME_SECTION_ORDER: AdminHomeSectionId[] = ['analytics', 'assets', 'moderation']

function SectionCard({
  section,
  counts,
  usersThisWeek,
  funnel,
  seriesPipeline,
  onPress,
}: {
  section: AdminHomeSectionId
  counts: AdminHomeCounts
  usersThisWeek: number | null
  funnel: RecentSignupFunnelRates | null
  seriesPipeline: ProductionSeriesPipeline | null
  onPress: () => void
}) {
  const meta = ADMIN_HOME_SECTIONS[section]
  const badge = sectionBadge(section, counts)
  const isAnalytics = section === 'analytics'
  const isAssets = section === 'assets'
  const isModeration = section === 'moderation'

  const signupsThisWeek = usersThisWeek ?? 0
  const registeredDeltaTone = toneForWeeklyRegisteredDelta(usersThisWeek)
  const activationDeltaTone = toneForWeeklyActivationDelta(
    funnel?.activatedThisWeek ?? null,
    signupsThisWeek,
  )
  const premiumDeltaTone = toneForWeeklyPremiumDelta(
    funnel?.premiumConvertedThisWeek ?? null,
    signupsThisWeek,
  )
  const registeredValueTone = toneForRegisteredTotal(counts.usersTotal)
  const activationValueTone = toneForActivationPercent(funnel?.activationPercent ?? null)
  const premiumValueTone = toneForPremiumPercent(funnel?.premiumConversionPercent ?? null)

  const showMetricWhy = (explanation: { title: string; message: string }) => {
    Alert.alert(explanation.title, explanation.message)
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.sectionCard, pressed && styles.sectionCardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${meta.title}`}
    >
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>{meta.title}</Text>
          <Text style={styles.sectionSubtitle}>{meta.subtitle}</Text>
        </View>
        <Text style={styles.sectionChevron}>›</Text>
      </View>

      {isAnalytics ? (
        <View style={styles.analyticsMetrics}>
          <Pressable
            style={styles.metricCard}
            onLongPress={() =>
              showMetricWhy(
                explainRegisteredMetric({
                  total: counts.usersTotal,
                  thisWeek: usersThisWeek,
                }),
              )
            }
            delayLongPress={350}
            accessibilityHint="Long press for color explanation"
          >
            <Text style={styles.metricCardLabel}>Registered</Text>
            <Text style={[styles.metricCardValue, { color: METRIC_TONE_COLOR[registeredValueTone] }]}>
              {counts.usersTotal ?? '—'}
            </Text>
            <Text style={[styles.metricCardDelta, { color: METRIC_TONE_COLOR[registeredDeltaTone] }]}>
              {usersThisWeek != null ? `+${usersThisWeek} this week` : '—'}
            </Text>
          </Pressable>
          <Pressable
            style={styles.metricCard}
            onLongPress={() =>
              showMetricWhy(
                explainActivationMetric({
                  percent: funnel?.activationPercent ?? null,
                  activatedThisWeek: funnel?.activatedThisWeek ?? null,
                  signupsThisWeek,
                  activated: funnel?.activated ?? null,
                  cohortSize: funnel?.cohortSize ?? null,
                }),
              )
            }
            delayLongPress={350}
            accessibilityHint="Long press for color explanation"
          >
            <Text style={styles.metricCardLabel}>Activation</Text>
            <Text style={[styles.metricCardValue, { color: METRIC_TONE_COLOR[activationValueTone] }]}>
              {funnel?.activationPercent != null ? `${funnel.activationPercent.toFixed(0)}%` : '—'}
            </Text>
            <Text style={[styles.metricCardDelta, { color: METRIC_TONE_COLOR[activationDeltaTone] }]}>
              {funnel != null ? `+${funnel.activatedThisWeek} this week` : '—'}
            </Text>
          </Pressable>
          <Pressable
            style={styles.metricCard}
            onLongPress={() =>
              showMetricWhy(
                explainPremiumMetric({
                  percent: funnel?.premiumConversionPercent ?? null,
                  paidThisWeek: funnel?.premiumConvertedThisWeek ?? null,
                  signupsThisWeek,
                  paid: funnel?.premiumConverted ?? null,
                  cohortSize: funnel?.cohortSize ?? null,
                }),
              )
            }
            delayLongPress={350}
            accessibilityHint="Long press for color explanation"
          >
            <Text style={styles.metricCardLabel}>Premium</Text>
            <Text style={[styles.metricCardValue, { color: METRIC_TONE_COLOR[premiumValueTone] }]}>
              {funnel?.premiumConversionPercent != null
                ? `${funnel.premiumConversionPercent.toFixed(0)}%`
                : '—'}
            </Text>
            <Text style={[styles.metricCardDelta, { color: METRIC_TONE_COLOR[premiumDeltaTone] }]}>
              {funnel != null ? `+${funnel.premiumConvertedThisWeek} this week` : '—'}
            </Text>
          </Pressable>
        </View>
      ) : isAssets ? (
        <View style={styles.seriesPipeline}>
          <SeriesPipelineBlock pipeline={seriesPipeline} footer={badge} />
        </View>
      ) : isModeration ? (
        <View style={styles.analyticsMetrics}>
          <View style={styles.metricCard}>
            <Text style={styles.metricCardLabel}>Reports</Text>
            <Text
              style={[
                styles.metricCardValue,
                (counts.openDiscussionReports ?? 0) > 0 && styles.metricCardValueAttention,
              ]}
            >
              {counts.openDiscussionReports ?? '—'}
            </Text>
            <Text style={styles.metricCardDeltaMuted}>Open flags</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricCardLabel}>Review queue</Text>
            <Text
              style={[
                styles.metricCardValue,
                (counts.pendingDiscussionReviews ?? 0) > 0 && styles.metricCardValueAttention,
              ]}
            >
              {counts.pendingDiscussionReviews ?? '—'}
            </Text>
            <Text style={styles.metricCardDeltaMuted}>Pending AI hold</Text>
          </View>
        </View>
      ) : badge ? (
        <Text style={styles.sectionBadge}>{badge}</Text>
      ) : null}
    </Pressable>
  )
}

export default function AdminHomeScreen({ navigation }: Props) {
  const { setRole } = useAuth()
  const [counts, setCounts] = useState<AdminHomeCounts>({
    usersTotal: null,
    freeAccessCount: null,
    freeAccessNames: [],
    seriesTotal: null,
    unapprovedSeriesCount: null,
    unapprovedCount: null,
    pendingDiscussionReviews: null,
    openDiscussionReports: null,
  })
  const [funnel, setFunnel] = useState<RecentSignupFunnelRates | null>(null)
  const [seriesPipeline, setSeriesPipeline] = useState<ProductionSeriesPipeline | null>(null)
  const [usersThisWeek, setUsersThisWeek] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [error, setError] = useState('')
  const isFirstFocus = useRef(true)

  const loadCounts = useCallback(async () => {
    setError('')
    const weekAgoIso = new Date(Date.now() - 7 * 86400000).toISOString()
    const [
      unapprovedRes,
      qubeeUnapprovedRes,
      fidelUnapprovedRes,
      usersRes,
      usersWeekRes,
      seriesTotalRes,
      unapprovedSeriesRes,
      discussionReportsCount,
      discussionReviewCount,
      freeAccessRes,
      funnelRes,
      seriesPipelineRes,
    ] = await Promise.all([
      supabase.from('words').select('id', { count: 'exact', head: true }).eq('status', 'recorded'),
      supabase.from('qubee_letters').select('id', { count: 'exact', head: true }).eq('status', 'recorded'),
      supabase.from('fidel_letters').select('id', { count: 'exact', head: true }).eq('status', 'recorded'),
      supabase.rpc('admin_users_total_count'),
      supabase.rpc('admin_users_count_since', { p_since: weekAgoIso }),
      supabase.from('lesson_series').select('id', { count: 'exact', head: true }),
      supabase
        .from('lesson_series')
        .select('id', { count: 'exact', head: true })
        .or('approved.eq.false,approved.is.null'),
      fetchOpenCommunityBoardReportsCount(),
      fetchPendingDiscussionReviewCount(),
      supabase.rpc('admin_complimentary_users_count'),
      fetchRecentSignupFunnelRates(supabase, 50),
      fetchProductionSeriesPipeline(supabase),
    ])

    const errs: string[] = []
    const wordPending = unapprovedRes.error ? null : (unapprovedRes.count ?? 0)
    const qubeePending = qubeeUnapprovedRes.error ? null : (qubeeUnapprovedRes.count ?? 0)
    const fidelPending = fidelUnapprovedRes.error ? null : (fidelUnapprovedRes.count ?? 0)
    if (unapprovedRes.error) errs.push(unapprovedRes.error.message)
    if (qubeeUnapprovedRes.error) errs.push(`qubee_letters: ${qubeeUnapprovedRes.error.message}`)
    if (fidelUnapprovedRes.error) errs.push(`fidel_letters: ${fidelUnapprovedRes.error.message}`)
    const pendingParts = [wordPending, qubeePending, fidelPending].filter((n) => n != null) as number[]

    setCounts({
      usersTotal: usersRes.error ? null : Number(usersRes.data ?? 0),
      freeAccessCount: freeAccessRes?.error ? null : Number(freeAccessRes?.data ?? 0),
      freeAccessNames: [],
      seriesTotal: seriesTotalRes.error ? null : (seriesTotalRes.count ?? 0),
      unapprovedSeriesCount: unapprovedSeriesRes.error ? null : (unapprovedSeriesRes.count ?? 0),
      unapprovedCount: pendingParts.length ? pendingParts.reduce((sum, n) => sum + n, 0) : null,
      pendingDiscussionReviews: discussionReviewCount,
      openDiscussionReports: discussionReportsCount,
    })

    if (usersRes.error) errs.push(`users: ${usersRes.error.message}`)
    if (usersWeekRes.error) {
      errs.push(`users (week): ${usersWeekRes.error.message}`)
      setUsersThisWeek(null)
    } else {
      setUsersThisWeek(Number(usersWeekRes.data ?? 0))
    }
    if (seriesTotalRes.error) errs.push(`lesson_series (total): ${seriesTotalRes.error.message}`)
    if (unapprovedSeriesRes.error) {
      errs.push(`lesson_series (unapproved): ${unapprovedSeriesRes.error.message}`)
    }
    if (freeAccessRes?.error) errs.push(`free access: ${freeAccessRes.error.message}`)
    if (funnelRes.error) errs.push(`funnel: ${funnelRes.error}`)
    if (seriesPipelineRes.error) errs.push(`series pipeline: ${seriesPipelineRes.error}`)
    setFunnel(funnelRes.data)
    setSeriesPipeline(seriesPipelineRes.data)
    setError(errs.join('\n'))
  }, [])

  useEffect(() => {
    void registerAdminPushToken()
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

      {HOME_SECTION_ORDER.map((section) => (
        <SectionCard
          key={section}
          section={section}
          counts={counts}
          usersThisWeek={usersThisWeek}
          funnel={funnel}
          seriesPipeline={seriesPipeline}
          onPress={() => {
            if (section === 'analytics') {
              navigation.navigate('AdminAnalytics')
              return
            }
            navigation.navigate('AdminHubSection', { section })
          }}
        />
      ))}
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
    gap: 12,
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
  sectionCard: {
    backgroundColor: '#141414',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  sectionCardPressed: {
    opacity: 0.9,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  sectionHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  sectionSubtitle: {
    color: '#8e8e93',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  sectionChevron: {
    color: ADMIN_ACCENT_GOLD,
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 28,
    marginTop: -2,
  },
  sectionBadge: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 12,
  },
  seriesPipeline: {
    marginTop: 14,
  },
  analyticsMetrics: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 8,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#1c1c1e',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  metricCardLabel: {
    fontSize: 11,
    color: '#888888',
    marginBottom: 4,
  },
  metricCardValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 26,
  },
  metricCardDelta: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
  },
  metricCardDeltaMuted: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
    color: '#6b7280',
  },
  metricCardValueAttention: {
    color: '#fbbf24',
  },
})
