import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import { StatusPill } from '../components/StatusPill'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import supabase from '../lib/supabase'
import { uploadVoiceM4a, voiceStoragePaths } from '../lib/voiceUpload'
import type { RecordingWord, RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'Recording'>

type Slot = 'slow' | 'fast' | null

const BASE_WAVE_HEIGHTS = [12, 20, 16, 24, 14, 22, 18, 26, 15, 21, 17, 23, 14, 20, 16, 22, 18, 24, 14, 19]

/** Static bars when clip is ready; animated bars while audio is playing. */
function WaveformBars({ mode }: { mode: 'idle' | 'ready' | 'recording' | 'playing' }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (mode !== 'playing') return
    const id = setInterval(() => setTick((t) => t + 1), 110)
    return () => clearInterval(id)
  }, [mode])

  const heights = useMemo(() => {
    if (mode === 'idle') {
      return BASE_WAVE_HEIGHTS.map(() => 6)
    }
    if (mode === 'ready' || mode === 'recording') {
      return BASE_WAVE_HEIGHTS
    }
    // playing: animate bars
    return BASE_WAVE_HEIGHTS.map((h, i) => {
      const wobble = Math.sin(tick * 0.5 + i * 0.55) * 10 + 10
      return Math.max(8, Math.min(34, h * 0.45 + wobble))
    })
  }, [mode, tick])

  const active = mode !== 'idle'
  return (
    <View style={styles.waveformRow}>
      {heights.map((h, i) => (
        <View
          key={i}
          style={[
            styles.waveBar,
            {
              height: h,
              opacity: active ? 0.92 : 0.35,
              backgroundColor: mode === 'playing' ? '#a78bfa' : '#7C3AED',
            },
          ]}
        />
      ))}
    </View>
  )
}

export default function RecordingScreen({ navigation, route }: Props) {
  const { words: initialWords, mergeIntoSession, seriesSession } = route.params
  const audio = useAudioRecorder()

  const initialTotalRef = useRef(initialWords.length)
  const [queue, setQueue] = useState<RecordingWord[]>(() => [...initialWords])
  const [skippedCount, setSkippedCount] = useState(0)
  const [sessionRecorded, setSessionRecorded] = useState<RecordingWord[]>([])

  const [slowUri, setSlowUri] = useState<string | null>(null)
  const [fastUri, setFastUri] = useState<string | null>(null)
  const [slowMs, setSlowMs] = useState(0)
  const [fastMs, setFastMs] = useState(0)
  const [recordingSlot, setRecordingSlot] = useState<Slot>(null)
  /** Which slot is currently playing back (for waveform + timer). */
  const [playingSlot, setPlayingSlot] = useState<Slot>(null)
  /** True while startPlayback is in flight — avoids clearing playingSlot when isPlaying is still false (race with useEffect). */
  const [playbackPending, setPlaybackPending] = useState(false)
  const [uploading, setUploading] = useState(false)

  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!audio.isPlaying && !playbackPending) {
      setPlayingSlot(null)
    }
  }, [audio.isPlaying, playbackPending])

  useEffect(() => {
    if (recordingSlot) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.12, duration: 450, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 450, useNativeDriver: true }),
        ]),
      )
      loop.start()
      return () => loop.stop()
    }
    pulse.setValue(1)
  }, [recordingSlot, pulse])

  const current = queue[0]
  const doneCount = sessionRecorded.length
  const wordNum = doneCount + 1
  const totalWords = initialTotalRef.current
  const sessionProgress = totalWords > 0 ? wordNum / totalWords : 0

  const clearSlots = useCallback(async () => {
    await audio.ensureIdle()
    setSlowUri(null)
    setFastUri(null)
    setSlowMs(0)
    setFastMs(0)
    setRecordingSlot(null)
  }, [audio])

  const bothReady = Boolean(slowUri && fastUri)

  const toggleRecord = useCallback(
    async (slot: 'slow' | 'fast') => {
      if (uploading || !current) return
      if (recordingSlot && recordingSlot !== slot) return

      if (recordingSlot === slot) {
        try {
          const { uri: u, durationMillis: ms } = await audio.stopRecording()
          if (!u) {
            Alert.alert('Recording', 'Could not save recording file.')
          } else if (slot === 'slow') {
            setSlowUri(u)
            setSlowMs(ms)
          } else {
            setFastUri(u)
            setFastMs(ms)
          }
        } catch (e) {
          Alert.alert('Recording', messageFromUnknownError(e))
        }
        setRecordingSlot(null)
        return
      }

      try {
        // Show recording UI immediately; cleanup + prepare still run right after.
        setRecordingSlot(slot)
        await audio.ensureIdle()
        await audio.startRecording()
      } catch (e) {
        setRecordingSlot(null)
        Alert.alert('Recording', messageFromUnknownError(e))
      }
    },
    [audio, current, recordingSlot, uploading],
  )

  const playSlot = useCallback(
    async (slot: 'slow' | 'fast') => {
      const uri = slot === 'slow' ? slowUri : fastUri
      if (!uri) return
      try {
        await audio.stopSoundOnly()
        setPlayingSlot(slot)
        setPlaybackPending(true)
        await audio.startPlayback(uri)
      } catch (e) {
        setPlayingSlot(null)
        Alert.alert('Playback', messageFromUnknownError(e))
      } finally {
        setPlaybackPending(false)
      }
    },
    [audio, fastUri, slowUri],
  )

  const reRecordSlot = useCallback(
    async (slot: 'slow' | 'fast') => {
      try {
        await audio.stopPlayback()
      } catch {
        /* ignore */
      }
      if (slot === 'slow') {
        setSlowUri(null)
        setSlowMs(0)
      } else {
        setFastUri(null)
        setFastMs(0)
      }
      setRecordingSlot(null)
      await audio.resetClip()
    },
    [audio],
  )

  const uploadCurrentWord = useCallback(async () => {
    if (!current || !slowUri || !fastUri) return
    setUploading(true)
    try {
      const paths = voiceStoragePaths(current.id, current.series)
      const [slowUrl, fastUrl] = await Promise.all([
        uploadVoiceM4a(slowUri, paths.slow),
        uploadVoiceM4a(fastUri, paths.fast),
      ])

      const recordedAt = new Date().toISOString()
      const { error } = await supabase
        .from('words')
        .update({
          slow_audio_url: slowUrl,
          fast_audio_url: fastUrl,
          status: 'recorded',
          recorded_at: recordedAt,
        })
        .eq('id', current.id)

      if (error) throw new Error(error.message)

      const merged: RecordingWord = {
        ...current,
        slow_audio_url: slowUrl,
        fast_audio_url: fastUrl,
        status: 'recorded',
        recorded_at: recordedAt,
      }

      if (mergeIntoSession != null) {
        const next = mergeIntoSession.map((w) => (w.id === merged.id ? merged : w))
        navigation.navigate('Review', { recordedWords: next })
        return
      }

      const nextSession = [...sessionRecorded, merged]
      if (queue.length <= 1) {
        navigation.navigate('Review', { recordedWords: nextSession })
      } else {
        setSessionRecorded(nextSession)
        setQueue((q) => q.slice(1))
        await clearSlots()
      }
    } catch (e) {
      Alert.alert('Upload failed', messageFromUnknownError(e), [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Retry', onPress: () => void uploadCurrentWord() },
      ])
    } finally {
      setUploading(false)
    }
  }, [
    clearSlots,
    current,
    fastUri,
    mergeIntoSession,
    navigation,
    queue.length,
    sessionRecorded,
    slowUri,
  ])

  const skipWord = useCallback(async () => {
    if (!current || uploading) return
    await clearSlots()
    setQueue((q) => {
      if (q.length === 0) return q
      const [head, ...rest] = q
      return [...rest, head]
    })
    setSkippedCount((n) => n + 1)
  }, [clearSlots, current, uploading])

  /** Recording timer, clip length, and playback — always show tenths of a second. */
  const formatDurationMs = (ms: number) => {
    const x = Math.max(0, ms)
    const sec = x / 1000
    if (sec < 60) return `${sec.toFixed(1)}s`
    const m = Math.floor(sec / 60)
    const r = sec - m * 60
    const secPart = r < 10 ? `0${r.toFixed(1)}` : r.toFixed(1)
    return `${m}:${secPart}`
  }

  const slotCard = (slot: 'slow' | 'fast', label: string) => {
    const uri = slot === 'slow' ? slowUri : fastUri
    const ms = slot === 'slow' ? slowMs : fastMs
    const isRec = recordingSlot === slot
    const otherRec = recordingSlot && recordingSlot !== slot
    const playingThis = playingSlot === slot && (audio.isPlaying || playbackPending)
    const totalPlaybackMs =
      audio.playbackDurationMs > 0 ? audio.playbackDurationMs : ms
    const timeLabel = playingThis
      ? `${formatDurationMs(audio.playbackPositionMs)} / ${formatDurationMs(totalPlaybackMs)}`
      : formatDurationMs(ms)
    const waveMode =
      isRec ? 'recording' : playingThis ? 'playing' : uri ? 'ready' : 'idle'

    return (
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{label}</Text>
        <View style={styles.cardRow}>
          <Animated.View style={{ transform: [{ scale: isRec ? pulse : 1 }] }}>
            <Pressable
              style={[styles.recordCircle, isRec && styles.recordCircleActive]}
              onPress={() => void toggleRecord(slot)}
              disabled={uploading || Boolean(otherRec)}
            >
              {isRec ? <View style={styles.recordInner} /> : <Text style={styles.recordHint}>●</Text>}
            </Pressable>
          </Animated.View>
          <View style={styles.cardSide}>
            {isRec ? (
              <Text style={styles.timer}>{formatDurationMs(audio.durationMs)}</Text>
            ) : uri ? (
              <>
                <WaveformBars mode={waveMode} />
                <Text style={styles.durText}>{timeLabel}</Text>
                {playingThis ? (
                  <Text style={styles.subDur}>Playing</Text>
                ) : (
                  <Text style={styles.subDur}>Clip length · tap ▶ to preview</Text>
                )}
                <View style={styles.playRow}>
                  <Pressable style={styles.playCircle} onPress={() => void playSlot(slot)}>
                    <Text style={styles.playTri}>▶</Text>
                  </Pressable>
                  <Pressable onPress={() => void reRecordSlot(slot)}>
                    <Text style={styles.reRecordText}>Re-record</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Text style={styles.hint}>Tap circle to record</Text>
            )}
          </View>
        </View>
      </View>
    )
  }

  if (!current) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No words in queue.</Text>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      {seriesSession ? (
        <View style={styles.seriesSessionBanner}>
          <Text style={styles.seriesSessionLang}>{seriesSession.language}</Text>
          <Text style={styles.seriesSessionLeft}>
            {queue.length} word{queue.length === 1 ? '' : 's'} left in this series
          </Text>
        </View>
      ) : null}
      <View style={styles.topMeta}>
        <Text style={styles.progressText}>
          Word {wordNum} of {totalWords}
          {skippedCount > 0 ? ` · ${skippedCount} skipped` : ''}
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(sessionProgress * 100)}%` }]} />
        </View>
      </View>

      <Text style={styles.wordText}>{current.word}</Text>
      <Text style={styles.seriesHint}>{current.series}</Text>
      <View style={styles.badgeWrap}>
        <StatusPill status={current.status} compact />
      </View>

      {slotCard('slow', 'Slow')}
      {slotCard('fast', 'Fast')}

      <Pressable
        style={[styles.nextBtn, (!bothReady || uploading) && styles.nextBtnDisabled]}
        disabled={!bothReady || uploading}
        onPress={() => void uploadCurrentWord()}
      >
        {uploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.nextBtnText}>Next Word</Text>
        )}
      </Pressable>

      <Pressable style={styles.skipBtn} onPress={() => void skipWord()} disabled={uploading}>
        <Text style={styles.skipText}>Skip Word</Text>
      </Pressable>
    </View>
  )
}

function messageFromUnknownError(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    padding: 20,
    paddingBottom: 32,
  },
  empty: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: '#888', fontSize: 16 },
  seriesSessionBanner: {
    backgroundColor: '#1a1525',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4c1d95',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  seriesSessionLang: {
    color: '#c4b5fd',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  seriesSessionLeft: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  topMeta: { marginBottom: 16 },
  progressText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#333',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: '#7C3AED',
    borderRadius: 4,
  },
  wordText: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  seriesHint: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
  },
  badgeWrap: { alignItems: 'center', marginBottom: 16 },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
  },
  cardLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  recordCircleActive: {
    backgroundColor: '#ef4444',
  },
  recordInner: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
  recordHint: {
    color: '#888',
    fontSize: 28,
  },
  cardSide: {
    flex: 1,
  },
  timer: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '600',
  },
  hint: {
    color: '#888888',
    fontSize: 14,
  },
  waveformRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 32,
    marginBottom: 6,
  },
  waveBar: {
    width: 4,
    marginRight: 3,
    borderRadius: 2,
    backgroundColor: '#7C3AED',
  },
  durText: {
    color: '#e4e4e7',
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    marginBottom: 4,
  },
  subDur: {
    color: '#71717a',
    fontSize: 12,
    marginBottom: 8,
  },
  playRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  playCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTri: {
    color: '#ffffff',
    fontSize: 16,
    marginLeft: 3,
  },
  reRecordText: {
    color: '#888888',
    fontSize: 14,
  },
  nextBtn: {
    marginTop: 8,
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  nextBtnDisabled: {
    opacity: 0.4,
  },
  nextBtnText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  skipBtn: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 8,
  },
  skipText: {
    color: '#888888',
    fontSize: 15,
  },
})
