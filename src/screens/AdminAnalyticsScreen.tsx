import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import type { StackScreenProps } from '@react-navigation/stack'
import {
  summarizeReliabilityEvents24h,
  type Reliability24hSummary,
  type ReliabilityEventRow,
} from '../lib/analyticsHealthEvents'
import { fetchRecentAnalyticsEventsForGemini } from '../lib/analyticsEventsQuery'
import {
  ANALYTICS_GEMINI_CONTEXT_EVENT_LIMIT,
  ANALYTICS_GEMINI_PROMPT_EVENT_LIMIT,
  runGeminiAnalyticsInsights,
  runGeminiAnalyticsQuestion,
} from '../lib/geminiEventInsights'
import supabase from '../lib/supabase'
import type { RootStackParamList } from '../types'
import GeminiMarkdownText from '../components/GeminiMarkdownText'

type Props = StackScreenProps<RootStackParamList, 'AdminAnalytics'>

type RetentionRow = {
  cohort_date: string
  cohort_size: number
  d1_retained: number
  d7_retained: number
  d1_retention_percent: number
  d7_retention_percent: number
}

type AnalyticsEventRow = {
  id: string
  user_id: string | null
  event_name: string
  properties: Record<string, unknown> | null
  created_at: string
}

type RetentionRange = '7d' | '30d' | 'all'

const ORANGE = '#f5a623'
const PURPLE = '#5b5bd6'
const PURPLE_BAR = '#7b4fcd'
const CARD_BG = '#1c1c1e'
const SCREEN_BG = '#111111'

function ymdUTC(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Cohort signup dates in the rolling UTC window ending today (inclusive). */
function cohortsInRange(rows: RetentionRow[], range: RetentionRange): RetentionRow[] {
  if (range === 'all') return rows
  const days = range === '7d' ? 7 : 30
  const end = new Date()
  const start = new Date()
  start.setUTCDate(start.getUTCDate() - (days - 1))
  start.setUTCHours(0, 0, 0, 0)
  const lo = ymdUTC(start)
  const hi = ymdUTC(end)
  return rows.filter((r) => r.cohort_date >= lo && r.cohort_date <= hi)
}

/** Weighted retention: sum(retained) / sum(cohort_size) */
function weightedRetention(rows: RetentionRow[]) {
  let size = 0
  let d1 = 0
  let d7 = 0
  for (const r of rows) {
    size += r.cohort_size
    d1 += r.d1_retained
    d7 += r.d7_retained
  }
  if (size === 0) return null
  return {
    rows: rows.length,
    signups: size,
    d1Pct: (d1 / size) * 100,
    d7Pct: (d7 / size) * 100,
  }
}

const RING_R = 28
const RING_STROKE = 8
const RING_C = 2 * Math.PI * RING_R

function RetentionDonut({
  pct,
  color,
  labelShort,
  labelLong,
}: {
  pct: number
  color: string
  labelShort: string
  labelLong: string
}) {
  const clamped = Math.min(100, Math.max(0, pct))
  const offset = RING_C * (1 - clamped / 100)
  return (
    <View style={styles.ringWrap}>
      <View style={styles.ringSvgWrap}>
        {/* Rotate the whole SVG instead of <G> — avoids "Unimplemented component" on some RN/Fabric builds. */}
        <View style={styles.svgRotateNeg90}>
          <Svg width={72} height={72} viewBox="0 0 72 72">
            <Circle cx={36} cy={36} r={RING_R} fill="none" stroke="#2a2a2a" strokeWidth={RING_STROKE} />
            <Circle
              cx={36}
              cy={36}
              r={RING_R}
              fill="none"
              stroke={color}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={`${RING_C} ${RING_C}`}
              strokeDashoffset={offset}
            />
          </Svg>
        </View>
        <View style={styles.ringCenter} pointerEvents="none">
          <Text style={styles.ringPct}>{clamped.toFixed(1)}%</Text>
          <Text style={styles.ringRetained}>retained</Text>
        </View>
      </View>
      <Text style={styles.ringLabel}>{labelShort}</Text>
      <Text style={styles.ringSublabel}>{labelLong}</Text>
    </View>
  )
}

export default function AdminAnalyticsScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [usersTotal, setUsersTotal] = useState<number | null>(null)
  const [usersThisWeek, setUsersThisWeek] = useState<number | null>(null)
  const [activeToday, setActiveToday] = useState<number | null>(null)
  const [retention, setRetention] = useState<RetentionRow[]>([])
  const [waitlistByLang, setWaitlistByLang] = useState<{ language: string; count: number }[]>([])
  const [events, setEvents] = useState<AnalyticsEventRow[]>([])
  const [loadErrors, setLoadErrors] = useState<string[]>([])
  const [insights, setInsights] = useState('')
  const [insightsSource, setInsightsSource] = useState('')
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState('')
  const [reliability24h, setReliability24h] = useState<Reliability24hSummary | null>(null)
  const [askQuestion, setAskQuestion] = useState('')
  const [askAnswer, setAskAnswer] = useState('')
  const [askSource, setAskSource] = useState('')
  const [askLoading, setAskLoading] = useState(false)
  const [askError, setAskError] = useState('')
  const [retentionRange, setRetentionRange] = useState<RetentionRange>('30d')
  const scrollRef = useRef<ScrollView>(null)
  const askSectionY = useRef(0)

  const load = useCallback(async () => {
    const errs: string[] = []

    const usersRes = await supabase.rpc('admin_users_total_count')
    if (usersRes.error) errs.push(`users: ${usersRes.error.message}`)
    else setUsersTotal(Number(usersRes.data ?? 0))

    const weekAgoIso = new Date(Date.now() - 7 * 86400000).toISOString()
    const usersWeekRes = await supabase.rpc('admin_users_count_since', { p_since: weekAgoIso })
    if (usersWeekRes.error) {
      errs.push(`users (week): ${usersWeekRes.error.message}`)
      setUsersThisWeek(null)
    } else setUsersThisWeek(Number(usersWeekRes.data ?? 0))

    const evToday = await supabase.rpc('admin_count_active_users_today')
    if (evToday.error) {
      if (!evToday.error.message.includes('does not exist')) {
        errs.push(`analytics_events (today): ${evToday.error.message}`)
      }
      setActiveToday(null)
    } else {
      setActiveToday(Number(evToday.data ?? 0))
    }

    const retRes = await supabase.rpc('admin_get_retention_cohorts', { p_limit: 500 })
    if (retRes.error) errs.push(`retention_cohorts: ${retRes.error.message}`)
    else
      setRetention(
        (retRes.data as RetentionRow[] | null)?.map((r) => ({
          cohort_date: String(r.cohort_date).slice(0, 10),
          cohort_size: Number(r.cohort_size),
          d1_retained: Number(r.d1_retained),
          d7_retained: Number(r.d7_retained),
          d1_retention_percent: Number(r.d1_retention_percent),
          d7_retention_percent: Number(r.d7_retention_percent),
        })) ?? [],
      )

    const wlRes = await supabase.rpc('admin_waitlist_by_language')
    if (wlRes.error) errs.push(`waitlist_signups: ${wlRes.error.message}`)
    else {
      setWaitlistByLang(
        (wlRes.data as { language?: string; signup_count?: number }[] | null)?.map((row) => ({
          language: String(row.language || 'Unknown').trim() || 'Unknown',
          count: Number(row.signup_count ?? 0),
        })) ?? [],
      )
    }

    const evRes = await fetchRecentAnalyticsEventsForGemini(supabase)
    if (evRes.error) errs.push(`analytics_events: ${evRes.error}`)
    else setEvents(evRes.data)

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const ev24Res = await supabase.rpc('admin_fetch_analytics_events', {
      p_since: since24h,
      p_limit: 500,
      p_offset: 0,
    })
    if (ev24Res.error) {
      errs.push(`analytics_events (24h): ${ev24Res.error.message}`)
      setReliability24h(null)
    } else {
      const rows =
        (ev24Res.data as ReliabilityEventRow[] | null)?.map((e) => ({
          ...e,
          properties: (e.properties as Record<string, unknown> | null) ?? null,
        })) ?? []
      setReliability24h(summarizeReliabilityEvents24h(rows))
    }

    setLoadErrors(errs)
  }, [])

  const retentionSlice = useMemo(() => cohortsInRange(retention, retentionRange), [retention, retentionRange])
  const retentionStats = useMemo(() => weightedRetention(retentionSlice), [retentionSlice])

  const waitlistTotal = useMemo(
    () => waitlistByLang.reduce((sum, x) => sum + x.count, 0),
    [waitlistByLang],
  )

  const waitlistMax = useMemo(() => waitlistByLang.reduce((m, x) => Math.max(m, x.count), 0), [waitlistByLang])

  const activePctOfTotal = useMemo(() => {
    if (usersTotal == null || usersTotal === 0 || activeToday == null) return null
    return Math.round((activeToday / usersTotal) * 100)
  }, [usersTotal, activeToday])

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

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({
        title: 'Analytics',
        headerTintColor: ORANGE,
        headerTitleStyle: { color: '#fff', fontWeight: '600' },
        headerStyle: { backgroundColor: SCREEN_BG },
      })
    }, [navigation]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const onGemini = useCallback(async () => {
    setInsightsError('')
    setInsights('')
    setInsightsSource('')
    setInsightsLoading(true)
    try {
      const out = await runGeminiAnalyticsInsights(events)
      if (out.ok) {
        setInsights(out.text)
        setInsightsSource(out.sourceLabel)
      } else {
        setInsightsError(out.error)
      }
    } catch (e) {
      setInsightsError(e instanceof Error ? e.message : String(e))
    } finally {
      setInsightsLoading(false)
    }
  }, [events])

  const onAskAnalytics = useCallback(async () => {
    setAskError('')
    setAskAnswer('')
    setAskSource('')
    setAskLoading(true)
    try {
      const out = await runGeminiAnalyticsQuestion(events, askQuestion, {
        reliabilitySummary24h: reliability24h,
      })
      if (out.ok) {
        setAskAnswer(out.text)
        setAskSource(out.sourceLabel)
      } else {
        setAskError(out.error)
      }
    } catch (e) {
      setAskError(e instanceof Error ? e.message : String(e))
    } finally {
      setAskLoading(false)
    }
  }, [events, askQuestion, reliability24h])

  const scrollAskIntoView = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, askSectionY.current - 16),
        animated: true,
      })
    }, 120)
  }, [])

  const onHealthInfo = useCallback(() => {
    Alert.alert(
      'App health (24h)',
      'Counts component_error and other reliability events from analytics_events in the last 24 hours (up to 500 rows). This is JS telemetry from ErrorBoundary and trackError — not native crash reports from Xcode or Sentry.',
    )
  }, [])

  const onRetentionInfo = useCallback(() => {
    Alert.alert(
      'Cohort retention',
      'D1 and D7 show weighted retention for the selected window: total retained users divided by total cohort signups across those cohort rows. Data comes from retention_cohorts (up to 500 most recent rows loaded).',
    )
  }, [])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ORANGE} />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
    >
      {loadErrors.length > 0 ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>Some queries failed (check RLS / table names)</Text>
          {loadErrors.map((e) => (
            <Text key={e} style={styles.warnText}>
              {e}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Users</Text>
      <View style={styles.metricRow}>
        <Pressable
          style={styles.metricCard}
          onPress={() => navigation.navigate('AdminUsers')}
          accessibilityRole="button"
          accessibilityLabel="View registered users"
        >
          <Text style={styles.metricLabel}>Registered</Text>
          <Text style={styles.metricValue}>{usersTotal ?? '—'}</Text>
          <Text style={styles.metricDeltaUp}>
            {usersThisWeek != null ? `+${usersThisWeek} this week` : '—'}
          </Text>
        </Pressable>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Active today</Text>
          <Text style={styles.metricValue}>{activeToday != null ? activeToday : '—'}</Text>
          <Text style={styles.metricDeltaNeutral}>
            {activePctOfTotal != null ? `${activePctOfTotal}% of total` : '—'}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>App health · 24h</Text>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Crashes & reliability</Text>
          <Pressable onPress={onHealthInfo} style={styles.infoBtn} hitSlop={8} accessibilityLabel="Health info">
            <Text style={styles.infoBtnText}>i</Text>
          </Pressable>
        </View>
        {reliability24h == null ? (
          <Text style={styles.muted}>Could not load 24h events.</Text>
        ) : reliability24h.total === 0 ? (
          <Text style={styles.healthOk}>No errors or crashes logged in the last 24 hours.</Text>
        ) : (
          <>
            <View style={styles.metricRow}>
              <View style={styles.healthStat}>
                <Text style={styles.healthStatValue}>{reliability24h.total}</Text>
                <Text style={styles.healthStatLabel}>Events</Text>
              </View>
              <View style={styles.healthStat}>
                <Text style={styles.healthStatValue}>{reliability24h.uniqueUsers}</Text>
                <Text style={styles.healthStatLabel}>Users affected</Text>
              </View>
            </View>
            {reliability24h.byEventName.map((row) => (
              <View key={row.event_name} style={styles.healthCountRow}>
                <Text style={styles.healthEventName}>{row.event_name}</Text>
                <Text style={styles.healthEventCount}>{row.count}</Text>
              </View>
            ))}
            {reliability24h.recent.length > 0 ? (
              <>
                <Text style={styles.healthRecentTitle}>Recent</Text>
                {reliability24h.recent.map((row, i) => (
                  <View key={`${row.created_at}-${row.event_name}-${i}`} style={styles.healthRecentRow}>
                    <Text style={styles.healthRecentMeta}>
                      {row.created_at.replace('T', ' ').slice(0, 19)} ·{' '}
                      {row.user_id ? row.user_id.slice(0, 8) : 'anon'}
                    </Text>
                    <Text style={styles.healthRecentEvent}>{row.event_name}</Text>
                    <Text style={styles.healthRecentDetail} numberOfLines={2}>
                      {row.detail}
                    </Text>
                  </View>
                ))}
              </>
            ) : null}
          </>
        )}
      </View>

      <Text style={styles.sectionLabel}>Retention</Text>
      <View style={styles.card}>
        <View style={styles.timeFilter}>
          {(
            [
              { key: '7d' as const, label: '7d' },
              { key: '30d' as const, label: '30d' },
              { key: 'all' as const, label: 'All' },
            ] as const
          ).map(({ key, label }) => (
            <Pressable
              key={key}
              onPress={() => setRetentionRange(key)}
              style={[styles.tfBtn, retentionRange === key && styles.tfBtnActive]}
              hitSlop={4}
            >
              <Text style={[styles.tfBtnText, retentionRange === key && styles.tfBtnTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Cohort retention</Text>
          <View style={styles.cardHeaderRight}>
            <Text style={styles.cardSource}>
              {retentionStats
                ? `${retentionStats.rows} cohorts · ${retentionStats.signups} signups`
                : 'No signups in range'}
            </Text>
            <Pressable
              onPress={onRetentionInfo}
              style={styles.infoBtn}
              hitSlop={8}
              accessibilityLabel="Retention info"
            >
              <Text style={styles.infoBtnText}>i</Text>
            </Pressable>
          </View>
        </View>

        {retentionStats ? (
          <View style={styles.retentionRow}>
            <RetentionDonut pct={retentionStats.d1Pct} color={ORANGE} labelShort="D1" labelLong="Day 1" />
            <View style={styles.retentionDivider} />
            <RetentionDonut pct={retentionStats.d7Pct} color={PURPLE} labelShort="D7" labelLong="Day 7" />
          </View>
        ) : (
          <Text style={styles.muted}>No cohort data in this time range.</Text>
        )}
      </View>

      <Text style={styles.sectionLabel}>Waitlist</Text>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>By language</Text>
          <Text style={styles.cardSource}>{waitlistTotal} total</Text>
        </View>
        {waitlistByLang.length === 0 ? (
          <Text style={styles.muted}>
            No rows returned. If the table has data in Supabase, allow SELECT on waitlist_signups for your anon key
            (RLS).
          </Text>
        ) : (
          waitlistByLang.map((w, i) => {
            const barPct = waitlistMax > 0 ? (w.count / waitlistMax) * 100 : 0
            const barColor = i % 2 === 0 ? ORANGE : PURPLE_BAR
            const isLast = i === waitlistByLang.length - 1
            return (
              <View key={w.language}>
                <View style={[styles.waitlistRow, isLast && styles.waitlistRowLast]}>
                  <Text style={styles.langName}>{w.language}</Text>
                  <Text style={styles.langCount}>{w.count}</Text>
                </View>
                <View style={styles.waitlistBarWrap}>
                  <View style={[styles.waitlistBar, { width: `${barPct}%`, backgroundColor: barColor }]} />
                </View>
                <View style={styles.waitlistSpacer} />
              </View>
            )
          })
        )}
      </View>

      <Text style={styles.sectionLabel}>Ask analytics</Text>
      <View
        style={styles.card}
        onLayout={(event) => {
          askSectionY.current = event.nativeEvent.layout.y
        }}
      >
        <Text style={styles.askHint}>
          Ask a question; Gemini uses up to {ANALYTICS_GEMINI_PROMPT_EVENT_LIMIT.toLocaleString()} of the newest
          events loaded below ({events.length.toLocaleString()} now, up to{' '}
          {ANALYTICS_GEMINI_CONTEXT_EVENT_LIMIT.toLocaleString()}) plus the 24h reliability summary.
        </Text>
        <TextInput
          style={styles.askInput}
          placeholder="e.g. Any component_error spikes after build 97? Who exited lesson 1 early?"
          placeholderTextColor="#666"
          value={askQuestion}
          onChangeText={setAskQuestion}
          multiline
          editable={!askLoading}
          onFocus={scrollAskIntoView}
        />
        <Pressable
          onPress={() => {
            void onAskAnalytics()
          }}
          disabled={askLoading || !askQuestion.trim()}
          style={({ pressed }) => [
            styles.aiBtn,
            styles.askBtn,
            pressed && styles.aiBtnPressed,
            (askLoading || !askQuestion.trim()) && styles.disabled,
          ]}
        >
          <Text style={styles.aiBtnText}>{askLoading ? 'Asking Gemini…' : 'Ask Gemini'}</Text>
        </Pressable>
        {askError ? <Text style={styles.errorText}>{askError}</Text> : null}
        {askAnswer ? (
          <View style={styles.insightsCardInline}>
            <Text style={styles.insightsTitle}>Answer</Text>
            {askSource ? <Text style={styles.insightsMeta}>Source: {askSource}</Text> : null}
            <GeminiMarkdownText text={askAnswer} />
          </View>
        ) : null}
      </View>

      <Text style={styles.sectionLabel}>AI summary</Text>
      <Pressable
        onPress={() => {
          void onGemini()
        }}
        disabled={insightsLoading}
        style={({ pressed }) => [
          styles.aiBtn,
          pressed && styles.aiBtnPressed,
          insightsLoading && styles.disabled,
        ]}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityState={{ disabled: insightsLoading }}
      >
        <Text style={styles.aiBtnText}>
          {insightsLoading
            ? 'Asking Gemini…'
            : events.length > 0
              ? `Gemini: insights on ${events.length.toLocaleString()} events`
              : 'Gemini: insights (need analytics events)'}
        </Text>
      </Pressable>
      <Text style={styles.aiSub}>
        Newest rows from analytics_events (up to {ANALYTICS_GEMINI_CONTEXT_EVENT_LIMIT.toLocaleString()} when
        available).
      </Text>
      {events.length === 0 ? (
        <Text style={styles.mutedSmall}>Allow SELECT on analytics_events for the anon key, then pull to refresh.</Text>
      ) : null}

      {insightsError ? <Text style={styles.errorText}>{insightsError}</Text> : null}
      {insights ? (
        <View style={styles.insightsCard}>
          <Text style={styles.insightsTitle}>Gemini summary</Text>
          {insightsSource ? <Text style={styles.insightsMeta}>Source: {insightsSource}</Text> : null}
          <GeminiMarkdownText text={insights} />
        </View>
      ) : null}
    </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: SCREEN_BG },
  content: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 120 },
  centered: {
    flex: 1,
    backgroundColor: SCREEN_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#666666',
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 6,
    marginHorizontal: 4,
  },
  metricRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  metricCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  metricLabel: { fontSize: 11, color: '#888888', marginBottom: 4 },
  metricValue: { fontSize: 26, fontWeight: '700', color: '#fff', lineHeight: 30 },
  metricDeltaUp: { fontSize: 11, marginTop: 4, color: '#30d158', fontWeight: '600' },
  metricDeltaNeutral: { fontSize: 11, marginTop: 4, color: '#888888' },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  timeFilter: {
    flexDirection: 'row',
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 2,
    marginBottom: 12,
  },
  tfBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    borderRadius: 6,
  },
  tfBtnActive: { backgroundColor: '#3a3a3c' },
  tfBtnText: { fontSize: 11, color: '#888888', fontWeight: '500' },
  tfBtnTextActive: { color: '#fff', fontWeight: '600' },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 8,
  },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#fff', flexShrink: 0 },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end' },
  cardSource: { fontSize: 10, color: '#555555', textAlign: 'right', flexShrink: 1 },
  infoBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#444444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBtnText: { fontSize: 10, color: '#666666', fontWeight: '600' },
  retentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 6,
  },
  retentionDivider: { width: 1, height: 60, backgroundColor: '#333333' },
  ringWrap: { alignItems: 'center', gap: 6 },
  ringSvgWrap: { width: 72, height: 72, position: 'relative' },
  svgRotateNeg90: {
    width: 72,
    height: 72,
    transform: [{ rotate: '-90deg' }],
  },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 4,
  },
  ringPct: { color: '#fff', fontSize: 13, fontWeight: '700' },
  ringRetained: { color: '#666666', fontSize: 9, marginTop: 0 },
  ringLabel: { fontSize: 12, color: '#888888', fontWeight: '600', letterSpacing: 0.5 },
  ringSublabel: { fontSize: 10, color: '#555555', textAlign: 'center' },
  waitlistRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
  },
  waitlistRowLast: { borderBottomWidth: 0 },
  langName: { fontSize: 14, color: '#fff', fontWeight: '500', textTransform: 'capitalize' },
  langCount: { fontSize: 18, fontWeight: '700', color: ORANGE },
  waitlistBarWrap: {
    height: 4,
    backgroundColor: '#2a2a2a',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  waitlistBar: { height: 4, borderRadius: 2 },
  waitlistSpacer: { height: 8 },
  aiBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: PURPLE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PURPLE_BAR,
  },
  aiBtnPressed: { opacity: 0.92 },
  aiBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  aiSub: { fontSize: 10, color: '#888888', marginTop: 6, textAlign: 'center', marginBottom: 8 },
  muted: { color: '#71717a', fontSize: 13, lineHeight: 18 },
  mutedSmall: { color: '#52525b', fontSize: 12, marginTop: 4, lineHeight: 16 },
  warnBox: {
    backgroundColor: '#422006',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#78350f',
  },
  warnTitle: { color: '#fcd34d', fontWeight: '700', marginBottom: 6 },
  warnText: { color: '#fde68a', fontSize: 12, marginBottom: 4 },
  disabled: { opacity: 0.5 },
  errorText: { color: '#f87171', fontSize: 14, marginBottom: 12 },
  insightsCard: {
    backgroundColor: '#0c1118',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e3a5f',
    padding: 14,
    marginTop: 12,
    marginBottom: 24,
  },
  insightsTitle: { color: '#93c5fd', fontWeight: '700', marginBottom: 6 },
  insightsMeta: { color: '#6b7280', fontSize: 12, marginBottom: 10 },
  insightsBody: { color: '#e5e7eb', fontSize: 14, lineHeight: 22 },
  insightsCardInline: {
    backgroundColor: '#0c1118',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e3a5f',
    padding: 14,
    marginTop: 12,
  },
  healthOk: { color: '#30d158', fontSize: 14, lineHeight: 20 },
  healthStat: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  healthStatValue: { fontSize: 22, fontWeight: '700', color: '#fff' },
  healthStatLabel: { fontSize: 10, color: '#888', marginTop: 2 },
  healthCountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
  },
  healthEventName: { color: '#fca5a5', fontSize: 13, flex: 1, marginRight: 8 },
  healthEventCount: { color: '#fff', fontWeight: '700', fontSize: 15 },
  healthRecentTitle: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#666',
    textTransform: 'uppercase',
  },
  healthRecentRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
  },
  healthRecentMeta: { color: '#666', fontSize: 10, marginBottom: 2 },
  healthRecentEvent: { color: '#fff', fontSize: 13, fontWeight: '600' },
  healthRecentDetail: { color: '#a1a1aa', fontSize: 12, marginTop: 2, lineHeight: 16 },
  askHint: { color: '#888', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  askInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3a3a3c',
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 22,
    minHeight: 96,
    maxHeight: 160,
    paddingHorizontal: 12,
    paddingVertical: 12,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  askBtn: { marginTop: 0 },
})
