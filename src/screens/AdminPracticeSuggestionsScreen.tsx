import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
  fetchAutomaticCommunityFeedPreview,
  withAutoScore,
  type AutoFeedSentenceRow,
} from '../lib/practiceCommunityAutoFeed'
import {
  fetchPracticeCommunityPicksAdmin,
  PRACTICE_COMMUNITY_PICKS_MAX,
  savePracticeCommunityPicks,
  shiftDateYmd,
  ymdUTC,
  type PracticeCommunitySentenceRow,
} from '../lib/practiceCommunityFeatured'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminPracticeSuggestions'>

type ScoredRow = PracticeCommunitySentenceRow & { autoScore: number }

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function idKey(id: string | number): string {
  return String(id)
}

function SentencePickRow({
  row,
  selected,
  disabled,
  onToggle,
  readOnly,
  autoScore,
  rank,
}: {
  row: PracticeCommunitySentenceRow | AutoFeedSentenceRow
  selected?: boolean
  disabled?: boolean
  onToggle?: () => void
  readOnly?: boolean
  autoScore?: number
  rank?: number
}) {
  const score = autoScore ?? ('autoScore' in row ? row.autoScore : undefined)

  return (
    <Pressable
      onPress={readOnly ? undefined : onToggle}
      disabled={readOnly || disabled}
      style={({ pressed }) => [
        styles.pickRow,
        !readOnly && selected && styles.pickRowSelected,
        !readOnly && disabled && !selected && styles.pickRowDisabled,
        pressed && !readOnly && !disabled && styles.pickRowPressed,
      ]}
    >
      {readOnly ? (
        <Text style={styles.rankBadge}>{rank ?? '·'}</Text>
      ) : (
        <View style={[styles.checkbox, selected && styles.checkboxOn]}>
          {selected ? <Text style={styles.checkMark}>✓</Text> : null}
        </View>
      )}
      <View style={styles.pickBody}>
        <View style={styles.pickTitleRow}>
          {score != null ? (
            <Text style={styles.scoreBadge}>score {score}</Text>
          ) : null}
        </View>
        <Text style={styles.pickCorrected} numberOfLines={4}>
          {row.corrected}
        </Text>
        {row.intended ? (
          <Text style={styles.pickIntended} numberOfLines={2}>
            {row.intended}
          </Text>
        ) : null}
        <Text style={styles.pickMeta}>
          {formatShortDate(row.created_at)}
          {row.is_saved ? ' · saved by user' : ' · practice attempt'}
        </Text>
      </View>
    </Pressable>
  )
}

export default function AdminPracticeSuggestionsScreen({ navigation }: Props) {
  const [featuredDate, setFeaturedDate] = useState(ymdUTC())
  const [wotd, setWotd] = useState<{ oromo: string; english: string } | null>(null)
  const [featuredRows, setFeaturedRows] = useState<PracticeCommunitySentenceRow[]>([])
  const [candidateRows, setCandidateRows] = useState<PracticeCommunitySentenceRow[]>([])
  const [autoFeedRows, setAutoFeedRows] = useState<AutoFeedSentenceRow[]>([])
  const [selectedIds, setSelectedIds] = useState<Array<string | number>>([])
  const [initialIds, setInitialIds] = useState<Array<string | number>>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    const [adminRes, autoRes] = await Promise.all([
      fetchPracticeCommunityPicksAdmin(featuredDate),
      fetchAutomaticCommunityFeedPreview(),
    ])

    if (autoRes.error) {
      setError((prev) => (prev ? `${prev}\n` : '') + `Auto feed: ${autoRes.error}`)
    }
    setAutoFeedRows(autoRes.rows)

    if (adminRes.error || !adminRes.data) {
      setError((prev) => (prev ? `${prev}\n` : '') + (adminRes.error ?? 'Failed to load picks'))
      return
    }
    setWotd(adminRes.data.wotd)
    setFeaturedRows(adminRes.data.featured)
    setCandidateRows(adminRes.data.candidates)
    const ids = adminRes.data.featured.map((r) => r.id)
    setSelectedIds(ids)
    setInitialIds(ids)
  }, [featuredDate])

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
    }, [load, featuredDate]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const selectedSet = useMemo(() => new Set(selectedIds.map(idKey)), [selectedIds])
  const atMax = selectedIds.length >= PRACTICE_COMMUNITY_PICKS_MAX
  const dirty =
    selectedIds.length !== initialIds.length ||
    selectedIds.some((id, i) => idKey(id) !== idKey(initialIds[i]))

  const hasSavedPicks = featuredRows.length > 0

  const featuredScored = useMemo(
    (): ScoredRow[] => featuredRows.map((r) => withAutoScore(r)),
    [featuredRows],
  )

  const candidatesScored = useMemo((): ScoredRow[] => {
    return candidateRows
      .map((r) => withAutoScore(r))
      .sort((a, b) => b.autoScore - a.autoScore)
  }, [candidateRows])

  const toggleId = useCallback((id: string | number) => {
    const key = idKey(id)
    setSelectedIds((prev) => {
      const idx = prev.findIndex((x) => idKey(x) === key)
      if (idx >= 0) return prev.filter((x) => idKey(x) !== key)
      if (prev.length >= PRACTICE_COMMUNITY_PICKS_MAX) return prev
      return [...prev, id]
    })
  }, [])

  const onSave = useCallback(async () => {
    setSaving(true)
    setError('')
    const { error: err } = await savePracticeCommunityPicks(featuredDate, selectedIds)
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    setInitialIds([...selectedIds])
    Alert.alert('Saved', `Community feed updated for ${featuredDate} (${selectedIds.length} picks).`)
    await load()
  }, [featuredDate, selectedIds, load])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Practice Suggestions',
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
      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      <View style={styles.dateRow}>
        <Pressable
          onPress={() => setFeaturedDate((d) => shiftDateYmd(d, -1))}
          style={styles.dateBtn}
          hitSlop={8}
        >
          <Text style={styles.dateBtnText}>←</Text>
        </Pressable>
        <Text style={styles.dateLabel}>{featuredDate}</Text>
        <Pressable
          onPress={() => setFeaturedDate((d) => shiftDateYmd(d, 1))}
          style={styles.dateBtn}
          hitSlop={8}
        >
          <Text style={styles.dateBtnText}>→</Text>
        </Pressable>
      </View>

      {wotd ? (
        <View style={styles.wotdCard}>
          <Text style={styles.wotdLabel}>Word of the day</Text>
          <Text style={styles.wotdWord}>{wotd.oromo}</Text>
          <Text style={styles.wotdEnglish}>{wotd.english}</Text>
        </View>
      ) : (
        <Text style={styles.hint}>No word of the day for this date.</Text>
      )}

      <Text style={styles.sectionTitle}>Automatic feed preview</Text>
      <Text style={styles.hint}>
        Top {PRACTICE_COMMUNITY_PICKS_MAX} saved sentences (same scoring as the learner app).
        {hasSavedPicks
          ? ` Learners no longer see this list for ${featuredDate} — they see your saved picks below.`
          : ` Learners see this on Practice until you save picks for ${featuredDate}.`}
      </Text>
      {autoFeedRows.length === 0 ? (
        <Text style={styles.emptySection}>No sentences passed the auto filter right now.</Text>
      ) : (
        autoFeedRows.map((row, index) => (
          <SentencePickRow key={row.id} row={row} readOnly rank={index + 1} autoScore={row.autoScore} />
        ))
      )}

      <Text style={styles.counter}>
        Your picks: {selectedIds.length} / {PRACTICE_COMMUNITY_PICKS_MAX}
      </Text>
      <Text style={styles.hint}>
        Select from featured + WOTD candidates. Higher score ≈ more likely in the automatic feed.
      </Text>

      <Text style={styles.sectionTitle}>Currently featured (your picks)</Text>
      {featuredScored.length === 0 ? (
        <Text style={styles.emptySection}>None saved for this day yet.</Text>
      ) : (
        featuredScored.map((row) => (
          <SentencePickRow
            key={row.id}
            row={row}
            selected={selectedSet.has(idKey(row.id))}
            disabled={!selectedSet.has(idKey(row.id)) && atMax}
            onToggle={() => toggleId(row.id)}
            autoScore={row.autoScore}
          />
        ))
      )}

      <Text style={styles.sectionTitle}>WOTD candidates (sorted by score)</Text>
      {candidatesScored.length === 0 && wotd ? (
        <Text style={styles.emptySection}>No matching attempts in the last 30 days.</Text>
      ) : null}
      {candidatesScored.map((row) => (
        <SentencePickRow
          key={row.id}
          row={row}
          selected={selectedSet.has(idKey(row.id))}
          disabled={!selectedSet.has(idKey(row.id)) && atMax}
          onToggle={() => toggleId(row.id)}
          autoScore={row.autoScore}
        />
      ))}

      <Pressable
        onPress={() => void onSave()}
        disabled={!dirty || saving}
        style={({ pressed }) => [
          styles.saveBtn,
          (!dirty || saving) && styles.saveBtnDisabled,
          pressed && dirty && !saving && styles.saveBtnPressed,
        ]}
      >
        {saving ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.saveBtnText}>{dirty ? 'Save picks' : 'No changes'}</Text>
        )}
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  content: { padding: 20, paddingBottom: 48 },
  centered: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: { color: '#f87171', marginBottom: 12, fontSize: 14 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 16,
  },
  dateBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#1c1c1e',
    borderRadius: 10,
  },
  dateBtnText: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
  dateLabel: { color: '#ffffff', fontSize: 17, fontWeight: '600', minWidth: 120, textAlign: 'center' },
  wotdCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.25)',
  },
  wotdLabel: { color: '#8e8e93', fontSize: 12, fontWeight: '600', letterSpacing: 0.6 },
  wotdWord: { color: ADMIN_ACCENT_GOLD, fontSize: 22, fontWeight: '700', marginTop: 6 },
  wotdEnglish: { color: '#ebebf5', fontSize: 15, marginTop: 4 },
  counter: { color: '#ffffff', fontSize: 16, fontWeight: '700', marginTop: 8, marginBottom: 6 },
  hint: { color: '#8e8e93', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  sectionTitle: {
    color: ADMIN_ACCENT_GOLD,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 8,
  },
  emptySection: { color: '#8e8e93', fontSize: 13, marginBottom: 10 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  pickRowSelected: { borderColor: 'rgba(251, 191, 36, 0.45)' },
  pickRowDisabled: { opacity: 0.45 },
  pickRowPressed: { opacity: 0.9 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#636366',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: ADMIN_ACCENT_GOLD, borderColor: ADMIN_ACCENT_GOLD },
  checkMark: { color: '#000000', fontSize: 14, fontWeight: '800' },
  rankBadge: {
    width: 24,
    marginRight: 12,
    color: '#8e8e93',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  pickBody: { flex: 1 },
  pickTitleRow: { flexDirection: 'row', marginBottom: 4 },
  scoreBadge: {
    color: '#4ade80',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  pickCorrected: { color: '#ffffff', fontSize: 15, lineHeight: 21 },
  pickIntended: { color: '#8e8e93', fontSize: 13, marginTop: 6, fontStyle: 'italic' },
  pickMeta: { color: '#636366', fontSize: 11, marginTop: 8 },
  saveBtn: {
    marginTop: 20,
    backgroundColor: ADMIN_ACCENT_GOLD,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnPressed: { opacity: 0.88 },
  saveBtnText: { color: '#000000', fontSize: 16, fontWeight: '700' },
})
