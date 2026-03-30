import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import { useRemoteAudioUrl } from '../hooks/useRemoteAudioUrl'
import supabase from '../lib/supabase'
import { normalizeRecordingWords } from '../lib/wordStatus'
import type { RecordingWord, RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminSeriesAudioReview'>

export default function AdminSeriesAudioReviewScreen({ navigation, route }: Props) {
  const { seriesName, language } = route.params

  const [queue, setQueue] = useState<RecordingWord[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const { playUrl, stop, playingId } = useRemoteAudioUrl()
  const autoStateRef = useRef<{
    itemId: string | null
    waitingSlowEnd: boolean
    waitingFastEnd: boolean
  }>({ itemId: null, waitingSlowEnd: false, waitingFastEnd: false })

  const titleCase = useCallback((s: string) => {
    return String(s ?? '')
      .trim()
      .split(/\s+/g)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  }, [])

  const loadQueue = useCallback(async () => {
    setError('')
    const { data, error: fetchError } = await supabase
      .from('words')
      .select('*')
      .eq('series', seriesName)
      .eq('language', language)
      .in('status', ['recorded', 'approved', 'rerecord_requested'])
      .or('slow_audio_url.not.is.null,fast_audio_url.not.is.null')
      .order('word', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
      setQueue([])
      return
    }

    const rows = normalizeRecordingWords(data ?? []).filter(
      (w) => w.status === 'recorded' && Boolean(w.slow_audio_url?.trim() || w.fast_audio_url?.trim()),
    )
    setQueue(rows)
    setIndex(0)
  }, [language, seriesName])

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Series Audio Queue' })
  }, [navigation])

  useEffect(() => {
    let active = true
    void (async () => {
      setLoading(true)
      await loadQueue()
      if (active) setLoading(false)
    })()
    return () => {
      active = false
      void stop()
    }
  }, [loadQueue, stop])

  const current = queue[index]
  const total = queue.length
  const hasPrev = index > 0
  const hasNext = index < total - 1

  const goNext = useCallback(() => {
    if (!hasNext) return
    setIndex((n) => Math.min(total - 1, n + 1))
  }, [hasNext, total])

  const goPrev = useCallback(() => {
    if (!hasPrev) return
    setIndex((n) => Math.max(0, n - 1))
  }, [hasPrev])

  const approveAndNext = useCallback(async () => {
    if (!current || saving) return
    setSaving(true)
    const { error: updateError } = await supabase.from('words').update({ status: 'approved' }).eq('id', current.id)
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    await stop()
    setQueue((prev) => {
      const next = prev.filter((w) => w.id !== current.id)
      if (next.length === 0) return next
      setIndex((old) => Math.min(old, next.length - 1))
      return next
    })
  }, [current, saving, stop])

  const rerecordAndNext = useCallback(async () => {
    if (!current || saving) return
    setSaving(true)
    const noteLine = `[${new Date().toISOString().slice(0, 10)}] Re-record requested`
    const nextNotes = current.notes?.trim() ? `${current.notes.trim()}\n${noteLine}` : noteLine
    const { error: updateError } = await supabase
      .from('words')
      .update({ status: 'rerecord_requested', notes: nextNotes })
      .eq('id', current.id)
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    await stop()
    setQueue((prev) => {
      const next = prev.filter((w) => w.id !== current.id)
      if (next.length === 0) return next
      setIndex((old) => Math.min(old, next.length - 1))
      return next
    })
  }, [current, saving, stop])

  useEffect(() => {
    if (!current) return
    autoStateRef.current = { itemId: current.id, waitingSlowEnd: false, waitingFastEnd: false }
    void (async () => {
      await stop()
      if (current.slow_audio_url) {
        autoStateRef.current.waitingSlowEnd = true
        await playUrl(current.slow_audio_url, `${current.id}-slow`)
        return
      }
      if (current.fast_audio_url) {
        autoStateRef.current.waitingFastEnd = true
        void playUrl(current.fast_audio_url, `${current.id}-fast`)
      }
    })()
  }, [current?.id, current?.slow_audio_url, current?.fast_audio_url, playUrl, stop])

  useEffect(() => {
    const a = autoStateRef.current
    if (!current || a.itemId !== current.id) return

    if (a.waitingSlowEnd && playingId === null) {
      a.waitingSlowEnd = false
      if (current.fast_audio_url) {
        a.waitingFastEnd = true
        void playUrl(current.fast_audio_url, `${current.id}-fast`)
      }
      return
    }
    if (a.waitingFastEnd && playingId === null) {
      a.waitingFastEnd = false
    }
  }, [current, playingId, playUrl])

  const progressLabel = useMemo(() => {
    if (total === 0) return '0 of 0'
    return `${index + 1} of ${total}`
  }, [index, total])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    )
  }

  if (!current) {
    return (
      <View style={styles.centered}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Text style={styles.doneTitle}>No recorded words left in this series queue.</Text>
        <Pressable style={styles.doneBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.doneBtnText}>Back</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Text style={styles.progress}>{progressLabel}</Text>
      <Text style={styles.word}>{current.word}</Text>
      <Text style={styles.meta}>
        {current.series} · {titleCase(current.language)}
      </Text>

      <View style={styles.playRow}>
        <Pressable
          style={styles.playBtn}
          onPress={() => void playUrl(current.slow_audio_url, `${current.id}-slow`)}
          disabled={!current.slow_audio_url}
        >
          <Text style={styles.playBtnText}>
            {playingId === `${current.id}-slow` ? '■ Stop slow' : '▶ Play slow'}
          </Text>
        </Pressable>
        <Pressable
          style={styles.playBtn}
          onPress={() => void playUrl(current.fast_audio_url, `${current.id}-fast`)}
          disabled={!current.fast_audio_url}
        >
          <Text style={styles.playBtnText}>
            {playingId === `${current.id}-fast` ? '■ Stop fast' : '▶ Play fast'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.navRow}>
        <Pressable style={[styles.navBtn, !hasPrev && styles.disabled]} onPress={goPrev} disabled={!hasPrev}>
          <Text style={styles.navText}>Previous</Text>
        </Pressable>
        <Pressable style={[styles.navBtn, !hasNext && styles.disabled]} onPress={goNext} disabled={!hasNext}>
          <Text style={styles.navText}>Next</Text>
        </Pressable>
      </View>

      <View style={styles.finalActions}>
        <Pressable
          style={[styles.rerecordBtn, saving && styles.disabled]}
          onPress={() => void rerecordAndNext()}
          disabled={saving}
        >
          <Text style={styles.rerecordText}>{saving ? 'Saving…' : 'Re-record + Next'}</Text>
        </Pressable>

        <Pressable
          style={[styles.approveBtn, saving && styles.disabled]}
          onPress={() => void approveAndNext()}
          disabled={saving}
        >
          <Text style={styles.approveText}>{saving ? 'Approving…' : 'Approve + Next'}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    padding: 20,
  },
  centered: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorText: {
    color: '#f87171',
    marginBottom: 10,
    textAlign: 'center',
  },
  progress: {
    color: '#a1a1aa',
    fontSize: 13,
    marginBottom: 10,
  },
  word: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
  },
  meta: {
    color: '#22c55e',
    marginTop: 6,
    marginBottom: 18,
    fontSize: 14,
  },
  playRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  playBtn: {
    flex: 1,
    backgroundColor: '#2e1064',
    borderWidth: 1,
    borderColor: '#7C3AED',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  playBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  navRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  navBtn: {
    flex: 1,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
  },
  navText: {
    color: '#fff',
    fontWeight: '600',
  },
  finalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  approveBtn: {
    flex: 1,
    backgroundColor: '#166534',
    borderWidth: 1,
    borderColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  approveText: {
    color: '#dcfce7',
    fontSize: 16,
    fontWeight: '700',
  },
  rerecordBtn: {
    flex: 1,
    backgroundColor: '#312e81',
    borderWidth: 1,
    borderColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  rerecordText: {
    color: '#e0e7ff',
    fontSize: 16,
    fontWeight: '700',
  },
  doneTitle: {
    color: '#22c55e',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 18,
  },
  doneBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.35 },
})

