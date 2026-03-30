import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import {
  ADMIN_ACCENT_GOLD,
  AdminChevronRight,
  AdminPlusIcon,
  AdminSectionHeader,
} from '../components/lesson-config/AdminLessonConfigChrome'
import { LessonScreenEditModal } from '../components/lesson-editor/LessonScreenEditModal'
import {
  type LessonContentDraft,
  type LessonScreen,
  SCREEN_TYPE_OPTIONS,
  defaultScreen,
  parseLessonContent,
  screenSummary,
} from '../lib/lessonEditor'
import supabase from '../lib/supabase'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'LessonConfigDetail'>

type LessonRecord = {
  id: string
  title: string | null
  series_id: string | null
  lesson_number: number | null
  next_lesson_id: string | null
  content: unknown
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T
}

const ADD_SCREEN_OPTIONS = SCREEN_TYPE_OPTIONS.filter((o) => o.value !== 'intro')

function screenTypeLabel(type: string): string {
  return SCREEN_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type
}

function introScreenIndex(screens: LessonScreen[]): number {
  return screens.findIndex((s) => s.type === 'intro')
}

function getIntroGoal(screens: LessonScreen[]): string {
  const i = introScreenIndex(screens)
  if (i < 0) return ''
  const g = screens[i].content.goal
  return typeof g === 'string' ? g : g != null ? String(g) : ''
}

function setIntroGoalOnDraft(d: LessonContentDraft, goal: string): LessonContentDraft {
  const screens = [...d.screens]
  const i = introScreenIndex(screens)
  if (i < 0) {
    return { ...d, screens: [{ type: 'intro', content: { goal } }, ...screens] }
  }
  const intro = screens[i]
  screens[i] = {
    ...intro,
    content: { ...intro.content, goal },
  }
  return { ...d, screens }
}

function stripNextNavFromLessonContent(obj: Record<string, unknown>): void {
  delete obj.nextLessonId
  delete obj.nextLesson
}

function stripNextNavFromAllScreens(content: Record<string, unknown>): void {
  const screens = content.screens
  if (!Array.isArray(screens)) return
  for (const item of screens) {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) continue
    const c = (item as Record<string, unknown>).content
    if (c == null || typeof c !== 'object' || Array.isArray(c)) continue
    delete (c as Record<string, unknown>).nextLessonId
    delete (c as Record<string, unknown>).nextLesson
  }
}

async function fetchNextLessonIdInSeries(seriesId: string | null, lessonNumber: number | null): Promise<string | null> {
  if (!seriesId?.trim() || lessonNumber == null || lessonNumber < 1) return null
  const nextNum = lessonNumber + 1
  const { data, error } = await supabase
    .from('lessons')
    .select('id')
    .eq('series_id', seriesId)
    .eq('lesson_number', nextNum)
    .maybeSingle()
  if (error || !data) return null
  return (data as { id: string }).id
}

export default function LessonConfigDetailScreen({ navigation, route }: Props) {
  const { lessonId } = route.params
  const [row, setRow] = useState<LessonRecord | null>(null)
  const [draft, setDraft] = useState<LessonContentDraft | null>(null)
  const [rawJsonMode, setRawJsonMode] = useState(false)
  const [rawJson, setRawJson] = useState('')
  const [parseError, setParseError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [error, setError] = useState('')
  const [pickTypeOpen, setPickTypeOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const load = useCallback(async () => {
    setError('')
    setParseError('')
    const { data, error: err } = await supabase
      .from('lessons')
      .select('id,title,series_id,lesson_number,next_lesson_id,content')
      .eq('id', lessonId)
      .maybeSingle()

    if (err) {
      setError(err.message)
      setRow(null)
      setDraft(null)
      setLoading(false)
      return
    }
    const r = data as LessonRecord | null
    setRow(r)
    if (!r) {
      setDraft(null)
      setLoading(false)
      return
    }
    const parsed = parseLessonContent(r.content, r.id)
    if (parsed) {
      setDraft(parsed)
      setRawJsonMode(false)
      setRawJson('')
      setParseError('')
    } else {
      setDraft(null)
      setRawJsonMode(true)
      try {
        setRawJson(JSON.stringify(r.content ?? {}, null, 2))
      } catch {
        setRawJson('{}')
      }
      setParseError(
        'This lesson could not be opened in the visual editor (missing screens or unknown shape). You can still edit raw JSON below.',
      )
    }
    setLoading(false)
  }, [lessonId])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  const save = useCallback(async () => {
    if (!row) return
    setSaving(true)
    setError('')
    try {
      let content: Record<string, unknown>
      let title: string

      if (rawJsonMode) {
        const parsed = JSON.parse(rawJson) as unknown
        if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Root must be a JSON object.')
        }
        const d = parseLessonContent(parsed, row.id)
        if (!d) {
          throw new Error('Invalid lesson content: need non-empty screens array with valid screen types.')
        }
        content = stripUndefined({ ...d, id: row.id }) as Record<string, unknown>
        stripNextNavFromLessonContent(content)
        stripNextNavFromAllScreens(content)
        title = typeof (parsed as Record<string, unknown>).title === 'string' ? (parsed as Record<string, unknown>).title as string : row.title ?? row.id
      } else {
        if (!draft) {
          throw new Error('Nothing to save.')
        }
        if (!draft.screens.length) {
          throw new Error('Lesson must have at least one screen.')
        }
        for (const s of draft.screens) {
          if (!s.type || typeof s.content !== 'object' || s.content === null || Array.isArray(s.content)) {
            throw new Error(`Invalid screen: ${s.type}`)
          }
        }
        const merged = stripUndefined({
          ...draft,
          id: row.id,
          title: draft.title.trim() || row.title || row.id,
        }) as Record<string, unknown>
        stripNextNavFromLessonContent(merged)
        stripNextNavFromAllScreens(merged)
        content = merged
        title = String(merged.title ?? row.title ?? row.id)
      }

      const nextLessonId = await fetchNextLessonIdInSeries(row.series_id, row.lesson_number)

      const { data: updated, error: upErr } = await supabase
        .from('lessons')
        .update({
          title,
          next_lesson_id: nextLessonId,
          content,
        })
        .eq('id', row.id)
        .select('id,title,series_id,lesson_number,next_lesson_id,content')
        .single()

      if (upErr) throw new Error(upErr.message)
      const r = (updated as LessonRecord | null) ?? null
      if (!r) {
        throw new Error('Save failed: no row returned (0 rows updated). Check Supabase RLS/policies for `lessons`.')
      }

      // If the DB overwrote fields (trigger/RLS), surface it immediately.
      const savedTitle = r.title ?? ''
      if (String(savedTitle) !== String(title)) {
        throw new Error(
          `Save did not persist. Database title is still “${savedTitle}” (attempted “${title}”). Check RLS or triggers on public.lessons.`,
        )
      }

      setRow(r)
      setSavedFlash(true)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      Alert.alert('Save failed', msg)
    } finally {
      setSaving(false)
    }
  }, [row, draft, rawJson, rawJsonMode])

  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!savedFlash) return
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSavedFlash(false), 1400)
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = null
    }
  }, [savedFlash])

  const screensForList = useMemo(() => {
    if (!draft) return [] as { screen: LessonScreen; originalIndex: number }[]
    return draft.screens
      .map((screen, originalIndex) => ({ screen, originalIndex }))
      .filter(({ screen }) => screen.type !== 'intro')
  }, [draft])

  useLayoutEffect(() => {
    const headerTitle = draft?.title?.trim() || row?.title?.trim() || lessonId
    navigation.setOptions({
      title: headerTitle,
      headerRight: () => (
        <Pressable onPress={() => void save()} disabled={saving || loading} style={styles.headerSaveBtn} hitSlop={8}>
          <Text style={[styles.headerSaveText, saving && styles.headerSaveDisabled]}>Save</Text>
        </Pressable>
      ),
    })
  }, [navigation, lessonId, row?.title, draft?.title, save, saving, loading])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#636366" />
      </View>
    )
  }

  if (error && !row) {
    return (
      <View style={styles.screen}>
        <Text style={styles.error}>{error}</Text>
      </View>
    )
  }

  if (!row) {
    return (
      <View style={styles.screen}>
        <Text style={styles.error}>Lesson not found.</Text>
      </View>
    )
  }

  if (rawJsonMode) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {parseError ? <Text style={styles.parseHint}>{parseError}</Text> : null}
        <Text style={styles.meta}>id: {row.id} (locked)</Text>
        <AdminSectionHeader label="Full lesson content (JSON)" emphasis="gold" />
        <TextInput
          style={styles.rawJson}
          multiline
          value={rawJson}
          onChangeText={(t) => {
            setRawJson(t)
            setError('')
          }}
          textAlignVertical="top"
        />
        <Pressable
          style={styles.tryVisualBtn}
          onPress={() => {
            try {
              const p = JSON.parse(rawJson) as unknown
              const d = parseLessonContent(p, row.id)
              if (d) {
                setDraft(d)
                setRawJsonMode(false)
                setParseError('')
              } else {
                Alert.alert('Still invalid', 'Need screens[] with at least one valid screen.')
              }
            } catch {
              Alert.alert('Invalid JSON', 'Fix JSON syntax first.')
            }
          }}
        >
          <Text style={styles.tryVisualText}>Try visual editor again</Text>
        </Pressable>
      </ScrollView>
    )
  }

  if (!draft) {
    return (
      <View style={styles.screen}>
        <Text style={styles.error}>Could not load editor.</Text>
      </View>
    )
  }

  const moveScreen = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= draft.screens.length) return
    if (draft.screens[idx]?.type === 'intro' || draft.screens[j]?.type === 'intro') return
    setDraft((d) => {
      if (!d) return d
      const next = [...d.screens]
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return { ...d, screens: next }
    })
  }

  const removeScreen = (idx: number) => {
    if (draft.screens[idx]?.type === 'intro') {
      Alert.alert('Intro screen', 'The intro is not shown in this list and cannot be removed here.')
      return
    }
    if (draft.screens.length <= 1) {
      Alert.alert('Keep at least one screen.')
      return
    }
    setDraft((d) => {
      if (!d) return d
      return { ...d, screens: d.screens.filter((_, i) => i !== idx) }
    })
  }

  const applyScreenEdit = (idx: number, s: LessonScreen) => {
    setDraft((d) => {
      if (!d) return d
      const screens = [...d.screens]
      screens[idx] = s
      return { ...d, screens }
    })
  }

  const editingScreen = editingIndex != null ? draft.screens[editingIndex] ?? null : null

  return (
    <View style={styles.flex}>
      {error ? <Text style={styles.bannerError}>{error}</Text> : null}
      {savedFlash ? <Text style={styles.bannerSaved}>Saved</Text> : null}
      <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.sectionBlock}>
          <AdminSectionHeader label="Lesson" emphasis="gold" />
          <View style={styles.lessonCard}>
            <Text style={styles.cardFieldLabel}>Title</Text>
            <TextInput
              style={styles.cardInput}
              value={draft.title}
              onChangeText={(t) => setDraft({ ...draft, title: t })}
              placeholder="Lesson title"
              placeholderTextColor="#52525b"
            />
          </View>
          <View style={styles.lessonCard}>
            <Text style={styles.cardFieldLabel}>Goal (intro)</Text>
            <TextInput
              style={[styles.cardInput, styles.cardInputMultiline]}
              value={getIntroGoal(draft.screens)}
              onChangeText={(t) => setDraft((d) => (d ? setIntroGoalOnDraft(d, t) : d))}
              placeholder="What learners should achieve on the first screen"
              placeholderTextColor="#52525b"
              multiline
              textAlignVertical="top"
            />
            <Text style={styles.cardFieldHint}>Shown on the intro screen; intro is not listed below.</Text>
          </View>
          <Text style={styles.metaRow}>
            <Text style={styles.metaMuted}>Next in app · </Text>
            <Text style={styles.metaGoldHighlight}>
              {row.series_id ?? '—'} · #{row.lesson_number ?? '—'}
            </Text>
            <Text style={styles.metaMuted}> · </Text>
            <Text style={styles.metaLessonId}>{row.id}</Text>
          </Text>
        </View>

        <View style={styles.sectionBlock}>
          <AdminSectionHeader label="Screens" right={`${screensForList.length} total`} emphasis="gold" />
          <View style={styles.screenList}>
            {screensForList.map(({ screen: s, originalIndex: i }, listIdx) => {
              const upDisabled = i === 0 || draft.screens[i - 1]?.type === 'intro'
              const downDisabled =
                i === draft.screens.length - 1 || draft.screens[i + 1]?.type === 'intro'
              const summary = screenSummary(s)
              return (
                <View key={`${s.type}-${i}`} style={styles.screenRowCard}>
                  <Pressable
                    style={styles.screenRowMain}
                    onPress={() => setEditingIndex(i)}
                    android_ripple={{ color: '#333' }}
                  >
                    <View style={styles.screenBadge}>
                      <Text style={styles.screenBadgeText}>{listIdx + 1}</Text>
                    </View>
                    <View style={styles.screenRowText}>
                      <Text style={styles.screenRowTitle} numberOfLines={1}>
                        {screenTypeLabel(s.type)}
                      </Text>
                      <Text style={styles.screenRowSubtitle} numberOfLines={1}>
                        {summary || s.type}
                      </Text>
                    </View>
                    <AdminChevronRight size={10} color="#636366" />
                  </Pressable>
                  <View style={styles.screenRowToolbar}>
                    <Pressable
                      style={styles.toolbarBtn}
                      onPress={() => moveScreen(i, -1)}
                      disabled={upDisabled}
                      hitSlop={6}
                    >
                      <Text style={[styles.toolbarBtnText, upDisabled && styles.disabled]}>Up</Text>
                    </Pressable>
                    <Text style={styles.toolbarSep}>·</Text>
                    <Pressable
                      style={styles.toolbarBtn}
                      onPress={() => moveScreen(i, 1)}
                      disabled={downDisabled}
                      hitSlop={6}
                    >
                      <Text style={[styles.toolbarBtnText, downDisabled && styles.disabled]}>Down</Text>
                    </Pressable>
                    <Text style={styles.toolbarSep}>·</Text>
                    <Pressable style={styles.toolbarBtn} onPress={() => removeScreen(i)} hitSlop={6}>
                      <Text style={styles.toolbarDanger}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              )
            })}
          </View>

          <Pressable
            style={styles.addScreenBtn}
            onPress={() => setPickTypeOpen(true)}
            android_ripple={{ color: '#333' }}
          >
            <AdminPlusIcon size={14} color={ADMIN_ACCENT_GOLD} />
            <Text style={styles.addScreenBtnText}>Add screen</Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.rawModeBtn}
          onPress={() => {
            try {
              setRawJson(JSON.stringify(draft, null, 2))
            } catch {
              setRawJson('{}')
            }
            setRawJsonMode(true)
            setDraft(null)
          }}
        >
          <Text style={styles.rawModeBtnText}>Switch to raw JSON (advanced)</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={pickTypeOpen} animationType="fade" transparent>
        <Pressable style={styles.pickOverlay} onPress={() => setPickTypeOpen(false)}>
          <Pressable style={styles.pickSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickTitle}>Screen type</Text>
            <FlatList
              data={ADD_SCREEN_OPTIONS}
              keyExtractor={(item) => item.value}
              style={styles.pickList}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.pickRow}
                  onPress={() => {
                    setDraft((d) => {
                      if (!d) return d
                      return { ...d, screens: [...d.screens, defaultScreen(item.value)] }
                    })
                    setPickTypeOpen(false)
                  }}
                >
                  <Text style={styles.pickRowLabel}>{item.label}</Text>
                  <Text style={styles.pickRowValue}>{item.value}</Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <LessonScreenEditModal
        visible={editingIndex !== null}
        screen={editingScreen}
        lessonScreens={draft?.screens ?? []}
        onClose={() => setEditingIndex(null)}
        onApply={(next) => {
          if (editingIndex === null) return
          applyScreenEdit(editingIndex, next)
          setEditingIndex(null)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  screen: { flex: 1, backgroundColor: '#000' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  sectionBlock: { marginBottom: 8 },
  lessonCard: {
    backgroundColor: '#1c1c1e',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#38383a',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
  },
  cardFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#a1a1aa',
    marginBottom: 6,
  },
  cardFieldHint: {
    fontSize: 11,
    color: '#636366',
    marginTop: 8,
    lineHeight: 15,
  },
  cardInput: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
    padding: 0,
    margin: 0,
  },
  cardInputMultiline: {
    minHeight: 88,
    paddingTop: 2,
  },
  screenList: { gap: 8 },
  screenRowCard: {
    backgroundColor: '#1c1c1e',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#38383a',
    borderRadius: 10,
    overflow: 'hidden',
  },
  screenRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  screenBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212, 175, 55, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: ADMIN_ACCENT_GOLD,
  },
  screenRowText: { flex: 1, minWidth: 0 },
  screenRowTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  screenRowSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: ADMIN_ACCENT_GOLD,
    marginTop: 1,
  },
  screenRowToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2c2c2e',
    gap: 6,
  },
  toolbarBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  toolbarBtnText: { fontSize: 12, fontWeight: '500', color: '#a1a1aa' },
  toolbarSep: { fontSize: 12, color: '#3a3a3c' },
  toolbarDanger: { fontSize: 12, fontWeight: '500', color: '#c45c5c' },
  addScreenBtn: {
    width: '100%',
    marginTop: 8,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: 'rgba(212, 175, 55, 0.45)',
    borderRadius: 10,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  addScreenBtnText: { fontSize: 14, color: ADMIN_ACCENT_GOLD, fontWeight: '600' },
  centered: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  error: { color: '#f87171', padding: 16, fontSize: 14 },
  bannerError: { color: '#f87171', paddingHorizontal: 16, paddingTop: 8, fontSize: 13 },
  bannerSaved: { color: '#22c55e', paddingHorizontal: 16, paddingTop: 8, fontSize: 13, fontWeight: '700' },
  parseHint: { color: '#fbbf24', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  meta: { color: '#a1a1aa', fontSize: 14, marginBottom: 8 },
  metaRow: { marginTop: 4, marginBottom: 4, lineHeight: 20 },
  metaMuted: { fontSize: 11, color: '#636366' },
  metaGoldHighlight: { fontSize: 14, fontWeight: '600', color: ADMIN_ACCENT_GOLD },
  metaLessonId: {
    fontSize: 11,
    color: '#636366',
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  disabled: { opacity: 0.35 },
  rawModeBtn: { marginTop: 20, alignSelf: 'center', padding: 12 },
  rawModeBtnText: { color: '#636366', fontSize: 13 },
  rawJson: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: 8,
    padding: 12,
    color: '#e4e4e7',
    minHeight: 320,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 12,
  },
  tryVisualBtn: { marginTop: 16, paddingVertical: 14, alignItems: 'center' },
  tryVisualText: { color: '#a78bfa', fontSize: 16, fontWeight: '700' },
  pickOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  pickSheet: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    paddingBottom: 24,
  },
  pickTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2c2c2e',
  },
  pickList: { maxHeight: 400 },
  pickRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  pickRowLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  pickRowValue: { color: '#71717a', fontSize: 12, marginTop: 4 },
  headerSaveBtn: { marginRight: 12 },
  headerSaveText: { color: '#22c55e', fontSize: 16, fontWeight: '700' },
  headerSaveDisabled: { opacity: 0.4 },
})
