import { useCallback, useLayoutEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import type { StackScreenProps } from '@react-navigation/stack'
import { ADMIN_ACCENT_GOLD } from '../components/lesson-config/AdminLessonConfigChrome'
import supabase from '../lib/supabase'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminHomeHeroPreview'>

const HEIGHT_MIN = 120
const HEIGHT_MAX = 320
const HEIGHT_DEFAULT = 200
const OFFSET_MIN = -80
const OFFSET_MAX = 80

type ConfigRow = {
  home_hero_preview_height_px: number
  home_hero_cover_offset_y_px: number
  updated_at?: string
}

function clampHeight(raw: string) {
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return HEIGHT_DEFAULT
  return Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, n))
}

function clampOffset(raw: string) {
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return 0
  return Math.min(OFFSET_MAX, Math.max(OFFSET_MIN, n))
}

export default function AdminHomeHeroPreviewScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [previewHeight, setPreviewHeight] = useState(String(HEIGHT_DEFAULT))
  const [coverOffsetY, setCoverOffsetY] = useState('0')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('app_config')
      .select('home_hero_preview_height_px, home_hero_cover_offset_y_px, updated_at')
      .eq('id', 1)
      .maybeSingle()
    if (error) {
      Alert.alert('Load failed', error.message)
      return
    }
    const row = data as ConfigRow | null
    setPreviewHeight(String(row?.home_hero_preview_height_px ?? HEIGHT_DEFAULT))
    setCoverOffsetY(String(row?.home_hero_cover_offset_y_px ?? 0))
    setUpdatedAt(row?.updated_at || null)
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
      title: 'Home hero preview',
      headerStyle: { backgroundColor: '#000000' },
      headerTitleStyle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
      headerTintColor: '#ffffff',
    })
  }, [navigation])

  const save = useCallback(async () => {
    const heightPx = clampHeight(previewHeight)
    const offsetPx = clampOffset(coverOffsetY)
    setSaving(true)
    const { error } = await supabase.from('app_config').upsert({
      id: 1,
      home_hero_preview_height_px: heightPx,
      home_hero_cover_offset_y_px: offsetPx,
    })
    setSaving(false)
    if (error) {
      Alert.alert('Save failed', error.message)
      return
    }
    setPreviewHeight(String(heightPx))
    setCoverOffsetY(String(offsetPx))
    Alert.alert(
      'Saved',
      'Learners will pick this up on next Home focus (no app build required).',
    )
    await load()
  }, [previewHeight, coverOffsetY, load])

  const resetDefaults = useCallback(() => {
    setPreviewHeight(String(HEIGHT_DEFAULT))
    setCoverOffsetY('0')
  }, [])

  if (loading) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator color={ADMIN_ACCENT_GOLD} style={{ marginTop: 40 }} />
      </View>
    )
  }

  const previewHeightNum = clampHeight(previewHeight)
  const coverOffsetNum = clampOffset(coverOffsetY)
  const mockOverlayPx = 76

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.hint}>
        Controls the learner Home screen series cover block. Preview height changes how
        much vertical space the image gets. Cover offset shifts the crop up or down
        without changing layout (positive = image moves down).
      </Text>

      {updatedAt ? (
        <Text style={styles.meta}>Last saved: {new Date(updatedAt).toLocaleString()}</Text>
      ) : null}

      <Text style={styles.label}>Preview height (px)</Text>
      <TextInput
        style={styles.input}
        placeholder={`${HEIGHT_DEFAULT}`}
        placeholderTextColor="#666"
        keyboardType="number-pad"
        value={previewHeight}
        onChangeText={setPreviewHeight}
      />
      <Text style={styles.rangeHint}>
        {HEIGHT_MIN}–{HEIGHT_MAX} · default {HEIGHT_DEFAULT}
      </Text>

      <Text style={styles.label}>Cover vertical offset (px)</Text>
      <TextInput
        style={styles.input}
        placeholder="0"
        placeholderTextColor="#666"
        keyboardType="numbers-and-punctuation"
        value={coverOffsetY}
        onChangeText={setCoverOffsetY}
      />
      <Text style={styles.rangeHint}>
        {OFFSET_MIN} to {OFFSET_MAX} · 0 = centered crop
      </Text>

      <Text style={styles.label}>Mock preview</Text>
      <View style={[styles.mockHero, { height: previewHeightNum }]}>
        <View
          style={[
            styles.mockCover,
            { transform: [{ translateY: coverOffsetNum }] },
          ]}
        />
        <View style={[styles.mockPlayZone, { bottom: mockOverlayPx }]}>
          <View style={styles.mockPlay} />
        </View>
        <View style={[styles.mockOverlay, { height: mockOverlayPx }]}>
          <Text style={styles.mockOverlayLabel}>Up next</Text>
          <Text style={styles.mockOverlayTitle}>Series lesson title</Text>
        </View>
      </View>

      <Pressable style={styles.secondaryBtn} onPress={resetDefaults}>
        <Text style={styles.secondaryBtnText}>Reset to defaults</Text>
      </Pressable>

      <Pressable
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={() => void save()}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 16, paddingBottom: 48 },
  hint: { color: '#9ca3af', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  meta: { color: '#6b7280', fontSize: 12, marginBottom: 12 },
  label: { color: '#9ca3af', fontSize: 12, marginBottom: 6, marginTop: 10 },
  rangeHint: { color: '#6b7280', fontSize: 11, marginTop: 4 },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  mockHero: {
    marginTop: 8,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#254A32',
    position: 'relative',
  },
  mockCover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#3d6b4a',
  },
  mockPlayZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mockPlay: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4eca7a',
  },
  mockOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0B1A14',
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  mockOverlayLabel: { color: '#8FC7A4', fontSize: 10 },
  mockOverlayTitle: { color: '#fff', fontSize: 14, marginTop: 2, fontWeight: '600' },
  secondaryBtn: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#d1d5db', fontWeight: '700' },
  saveBtn: {
    marginTop: 12,
    backgroundColor: ADMIN_ACCENT_GOLD,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#0a0a0a', fontWeight: '800', fontSize: 15 },
})
