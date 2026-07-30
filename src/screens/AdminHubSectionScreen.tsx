import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useLayoutEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import { ADMIN_ACCENT_GOLD } from '../components/lesson-config/AdminLessonConfigChrome'
import {
  ADMIN_HOME_SECTIONS,
  buildSectionTiles,
  navigateHubTile,
  type AdminHomeCounts,
  type AdminHomeSectionId,
} from '../lib/adminHomeSections'
import { fetchOpenCommunityBoardReportsCount } from '../lib/communityBoardReports'
import { fetchPendingDiscussionReviewCount } from '../lib/discussionReviewQueue'
import { fetchFreeAccessUsers, freeAccessDisplayName } from '../lib/freeAccessUsers'
import supabase from '../lib/supabase'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminHubSection'>

export default function AdminHubSectionScreen({ navigation, route }: Props) {
  const section = route.params.section as AdminHomeSectionId
  const meta = ADMIN_HOME_SECTIONS[section]

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
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
      freeAccessListRes,
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
      fetchFreeAccessUsers(40),
    ])

    const errs: string[] = []
    const wordPending = unapprovedRes.error ? null : (unapprovedRes.count ?? 0)
    const qubeePending = qubeeUnapprovedRes.error ? null : (qubeeUnapprovedRes.count ?? 0)
    const fidelPending = fidelUnapprovedRes.error ? null : (fidelUnapprovedRes.count ?? 0)
    if (unapprovedRes.error) errs.push(unapprovedRes.error.message)
    if (qubeeUnapprovedRes.error) errs.push(qubeeUnapprovedRes.error.message)
    if (fidelUnapprovedRes.error) errs.push(fidelUnapprovedRes.error.message)

    const freeAccessNames = (freeAccessListRes.data ?? []).map(freeAccessDisplayName)
    const pendingParts = [wordPending, qubeePending, fidelPending].filter((n) => n != null) as number[]
    setCounts({
      usersTotal: usersRes.error ? null : Number(usersRes.data ?? 0),
      freeAccessCount: freeAccessRes?.error ? null : Number(freeAccessRes?.data ?? 0),
      freeAccessNames,
      seriesTotal: seriesTotalRes.error ? null : (seriesTotalRes.count ?? 0),
      unapprovedSeriesCount: unapprovedSeriesRes.error ? null : (unapprovedSeriesRes.count ?? 0),
      unapprovedCount: pendingParts.length ? pendingParts.reduce((a, b) => a + b, 0) : null,
      pendingDiscussionReviews: discussionReviewCount,
      openDiscussionReports: discussionReportsCount,
    })
    if (usersRes.error) errs.push(usersRes.error.message)
    if (freeAccessRes?.error) errs.push(freeAccessRes.error.message)
    if (freeAccessListRes.error) errs.push(freeAccessListRes.error)
    setError(errs.join('\n'))
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
      title: meta?.title ?? 'Section',
      headerStyle: { backgroundColor: '#000000' },
      headerTitleStyle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
      headerTintColor: '#ffffff',
    })
  }, [navigation, meta?.title])

  const tiles = buildSectionTiles(section, counts)

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ADMIN_ACCENT_GOLD} />
      </View>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.subtitle}>{meta?.subtitle}</Text>
      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
      {tiles.map((tile) => (
        <Pressable
          key={tile.title}
          style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
          onPress={() => navigateHubTile(navigation, tile.route)}
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
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  content: { padding: 20, paddingBottom: 40, gap: 12 },
  centered: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    color: '#8e8e93',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  errorBanner: { color: '#f87171', marginBottom: 8, fontSize: 14 },
  tile: {
    backgroundColor: '#1c1c1e',
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  tilePressed: { opacity: 0.92 },
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
