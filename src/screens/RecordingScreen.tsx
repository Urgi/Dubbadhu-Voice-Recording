import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  PanResponder,
} from 'react-native'
import Slider from '@react-native-community/slider'
import { trim as nativeTrim } from 'react-native-video-trim'
import type { StackScreenProps } from '@react-navigation/stack'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { useAuth } from '../context/AuthContext'
import supabase from '../lib/supabase'
import { formatQubeeLetterDisplay } from '../lib/qubeeLetters'
import { fidelAudioStoragePath, qubeeAudioStoragePath, uploadVoiceM4a, voiceStoragePaths } from '../lib/voiceUpload'
import type { RecordingWord, RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'Recording'>

type Slot = 'slow' | 'fast' | null

const BASE_WAVE_HEIGHTS = [
  12, 20, 16, 24, 14, 22, 18, 26, 15, 21, 17, 23, 14, 20, 16, 22, 18, 24, 14, 19, 15, 22, 17, 25, 13, 21, 18,
  24, 16, 20, 14, 23,
]
const ACCENT_ORANGE = '#f59e0b'
const ACCENT_GREEN = '#22c55e'
const ACCENT_YELLOW = '#facc15'
const PILL_PURPLE_BG = '#1e1b4b'
const PILL_PURPLE_TEXT = '#c4b5fd'
const TRIM_SNAP_MS = 20
const TRIM_MIN_GAP_MS = 150

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
              backgroundColor: mode === 'playing' ? ACCENT_GREEN : ACCENT_ORANGE,
            },
          ]}
        />
      ))}
    </View>
  )
}

function TrimWaveEditor({
  ms,
  trimStartMs,
  trimEndMs,
  setTrimStartMs,
  setTrimEndMs,
}: {
  ms: number
  trimStartMs: number
  trimEndMs: number
  setTrimStartMs: (v: number) => void
  setTrimEndMs: (v: number) => void
}) {
  const wrapRef = useRef<View>(null)
  const widthRef = useRef(0)

  const msRef = useRef(ms)
  const startRef = useRef(trimStartMs)
  const endRef = useRef(trimEndMs)
  const startAtGrantRef = useRef(0)
  const endAtGrantRef = useRef(0)
  const startAtGrantForEndRef = useRef(0)

  useEffect(() => {
    msRef.current = ms
  }, [ms])
  useEffect(() => {
    startRef.current = trimStartMs
  }, [trimStartMs])
  useEffect(() => {
    endRef.current = trimEndMs
  }, [trimEndMs])

  const measureWidth = useCallback(() => {
    wrapRef.current?.measure((_x, _y, w) => {
      widthRef.current = w
    })
  }, [])

  const startPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          measureWidth()
          startAtGrantRef.current = startRef.current
        },
        onPanResponderMove: (_e, gesture) => {
          const w = widthRef.current
          const dur = msRef.current
          if (!w || !dur) return

          const deltaMs = (gesture.dx / w) * dur
          const raw = startAtGrantRef.current + deltaMs
          const stepped = Math.round(raw / TRIM_SNAP_MS) * TRIM_SNAP_MS

          const end = endRef.current
          const next = Math.max(0, Math.min(stepped, end - TRIM_MIN_GAP_MS))
          setTrimStartMs(next)
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [measureWidth, setTrimStartMs],
  )

  const endPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          measureWidth()
          endAtGrantRef.current = endRef.current
          startAtGrantForEndRef.current = startRef.current
        },
        onPanResponderMove: (_e, gesture) => {
          const w = widthRef.current
          const dur = msRef.current
          if (!w || !dur) return

          const deltaMs = (gesture.dx / w) * dur
          const raw = endAtGrantRef.current + deltaMs
          const stepped = Math.round(raw / TRIM_SNAP_MS) * TRIM_SNAP_MS

          const start = startAtGrantForEndRef.current
          const minEnd = start + TRIM_MIN_GAP_MS
          const next = Math.min(dur, Math.max(stepped, minEnd))
          setTrimEndMs(next)
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [measureWidth, setTrimEndMs],
  )

  const startPct = ms > 0 ? (trimStartMs / ms) * 100 : 0
  const endPct = ms > 0 ? (trimEndMs / ms) * 100 : 100

  return (
    <View ref={wrapRef} style={styles.inlineWaveWrap}>
      <View pointerEvents="none">
        <WaveformBars mode="ready" />
      </View>

      <View style={[styles.inlineShade, styles.inlineShadeLeft, { width: `${startPct}%` }]} />
      <View
        style={[styles.inlineShade, styles.inlineShadeRight, { width: `${Math.max(0, 100 - endPct)}%` }]}
      />

      <View {...startPanResponder.panHandlers} style={[styles.inlineHandle, { left: `${startPct}%` }]} />
      <View {...endPanResponder.panHandlers} style={[styles.inlineHandle, { left: `${endPct}%` }]} />
    </View>
  )
}

export default function RecordingScreen({ navigation, route }: Props) {
  const { words: initialWords, mergeIntoSession, seriesSession, recordingTable = 'words' } = route.params
  const { role } = useAuth()
  const audio = useAudioRecorder()

  useEffect(() => {
    if (recordingTable === 'fidel_letters' && role !== 'fidel') {
      Alert.alert('Not allowed', 'Only the Fidel recorder can upload Fidel syllable audio.')
      navigation.goBack()
    }
  }, [navigation, recordingTable, role])

  const initialTotalRef = useRef(initialWords.length)
  const [queue, setQueue] = useState<RecordingWord[]>(() => [...initialWords])
  const [skippedCount, setSkippedCount] = useState(0)
  const [sessionRecorded, setSessionRecorded] = useState<RecordingWord[]>([])

  const [slowUri, setSlowUri] = useState<string | null>(null)
  const [fastUri, setFastUri] = useState<string | null>(null)
  const [slowMs, setSlowMs] = useState(0)
  const [fastMs, setFastMs] = useState(0)
  const [slowTrim, setSlowTrim] = useState<{ startMs: number; endMs: number } | null>(null)
  const [fastTrim, setFastTrim] = useState<{ startMs: number; endMs: number } | null>(null)
  const [recordingSlot, setRecordingSlot] = useState<Slot>(null)
  /** Which slot is currently playing back (for waveform + timer). */
  const [playingSlot, setPlayingSlot] = useState<Slot>(null)
  /** True while startPlayback is in flight — avoids clearing playingSlot when isPlaying is still false (race with useEffect). */
  const [playbackPending, setPlaybackPending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [inlineTrimSlot, setInlineTrimSlot] = useState<Exclude<Slot, null> | null>(null)
  const [trimSlot, setTrimSlot] = useState<Exclude<Slot, null> | null>(null)
  const [trimStartMs, setTrimStartMs] = useState(0)
  const [trimEndMs, setTrimEndMs] = useState(0)

  const pulse = useRef(new Animated.Value(1)).current
  const [waveWidth, setWaveWidth] = useState(0)
  const waveWidthRef = useRef(0)
  const trimStartMsRef = useRef(trimStartMs)
  const trimEndMsRef = useRef(trimEndMs)
  const trimStartAtGrantRef = useRef(0)
  const trimEndAtGrantRef = useRef(0)

  useEffect(() => {
    trimStartMsRef.current = trimStartMs
  }, [trimStartMs])
  useEffect(() => {
    trimEndMsRef.current = trimEndMs
  }, [trimEndMs])

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
    setSlowTrim(null)
    setFastTrim(null)
    setRecordingSlot(null)
  }, [audio])

  const isSingleTake = recordingTable === 'qubee_letters' || recordingTable === 'fidel_letters'
  const isFidelTake = recordingTable === 'fidel_letters'
  const bothReady = isSingleTake ? Boolean(slowUri) : Boolean(slowUri && fastUri)

  const titleCase = useCallback((s: string) => {
    return String(s ?? '')
      .trim()
      .split(/\s+/g)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  }, [])

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
            setSlowTrim({ startMs: 0, endMs: ms })
          } else {
            setFastUri(u)
            setFastMs(ms)
            setFastTrim({ startMs: 0, endMs: ms })
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
      const playingThis = playingSlot === slot && (audio.isPlaying || playbackPending)
      if (playingThis) {
        try {
          await audio.stopPlayback()
        } catch {
          /* ignore */
        } finally {
          setPlaybackPending(false)
          setPlayingSlot(null)
        }
        return
      }
      const t = slot === 'slow' ? slowTrim : fastTrim
      try {
        await audio.stopSoundOnly()
        setPlayingSlot(slot)
        setPlaybackPending(true)
        if (t && t.endMs > t.startMs) {
          await audio.playSegment(uri, t.startMs, t.endMs)
        } else {
          await audio.startPlayback(uri)
        }
      } catch (e) {
        setPlayingSlot(null)
        Alert.alert('Playback', messageFromUnknownError(e))
      } finally {
        setPlaybackPending(false)
      }
    },
    [audio, fastTrim, fastUri, playbackPending, playingSlot, slowTrim, slowUri],
  )

  const openTrim = useCallback(
    async (slot: 'slow' | 'fast') => {
      const uri = slot === 'slow' ? slowUri : fastUri
      const ms = slot === 'slow' ? slowMs : fastMs
      if (!uri || ms <= 0) return
      const t = slot === 'slow' ? slowTrim : fastTrim
      try {
        await audio.stopSoundOnly()
      } catch {
        /* ignore */
      }
      setTrimSlot(slot)
      setTrimStartMs(t?.startMs ?? 0)
      setTrimEndMs(t?.endMs ?? ms)
      setInlineTrimSlot(slot)
    },
    [audio, fastMs, fastTrim, fastUri, slowMs, slowTrim, slowUri],
  )

  const closeTrim = useCallback(async () => {
    try {
      await audio.stopSoundOnly()
    } catch {
      /* ignore */
    }
    setInlineTrimSlot(null)
    setTrimSlot(null)
    setTrimStartMs(0)
    setTrimEndMs(0)
  }, [audio])

  const previewTrim = useCallback(async () => {
    if (!trimSlot) return
    const uri = trimSlot === 'slow' ? slowUri : fastUri
    if (!uri) return
    const playingThis = playingSlot === trimSlot && (audio.isPlaying || playbackPending)
    if (playingThis) {
      try {
        await audio.stopPlayback()
      } catch {
        /* ignore */
      } finally {
        setPlaybackPending(false)
        setPlayingSlot(null)
      }
      return
    }
    const start = Math.max(0, Math.min(trimStartMs, trimEndMs))
    const end = Math.max(start, trimEndMs)
    try {
      await audio.stopSoundOnly()
      setPlayingSlot(trimSlot)
      setPlaybackPending(true)
      await audio.playSegment(uri, start, end)
    } catch (e) {
      setPlayingSlot(null)
      Alert.alert('Trim preview', messageFromUnknownError(e))
    } finally {
      setPlaybackPending(false)
    }
  }, [
    audio,
    fastUri,
    playbackPending,
    playingSlot,
    slowUri,
    trimEndMs,
    trimSlot,
    trimStartMs,
  ])

  const applyTrim = useCallback(async () => {
    if (!trimSlot) return
    const uri = trimSlot === 'slow' ? slowUri : fastUri
    const ms = trimSlot === 'slow' ? slowMs : fastMs
    if (!uri || ms <= 0) return

    const start = Math.max(0, Math.min(trimStartMs, trimEndMs))
    const end = Math.max(start, Math.min(trimEndMs, ms))
    if (end - start < 150) {
      Alert.alert('Trim', 'Trim range is too small. Please keep at least 0.2s.')
      return
    }
    try {
      const result = await nativeTrim(uri, {
        type: 'audio',
        outputExt: 'm4a',
        saveToPhoto: false,
        removeAfterSavedToPhoto: false,
        removeAfterFailedToSavePhoto: false,
        enableRotation: false,
        rotationAngle: 0,
        startTime: Math.floor(start),
        endTime: Math.floor(end),
      })

      if (!result?.success || !result?.outputPath) {
        throw new Error('Native trim did not return an output file.')
      }

      const rawOutPath = String(result.outputPath)
      const outUri = (() => {
        if (rawOutPath.startsWith('file://')) return rawOutPath
        if (rawOutPath.startsWith('file:/')) return rawOutPath.replace(/^file:\/*/, 'file:///')
        if (rawOutPath.startsWith('/')) return `file://${rawOutPath}`
        return rawOutPath
      })()

      // `end-start` is in our UI units (ms). Use it to avoid unit mismatches in native duration.
      const newMs = Math.max(0, Math.floor(end - start))

      if (trimSlot === 'slow') {
        setSlowUri(outUri)
        setSlowMs(newMs)
        setSlowTrim({ startMs: 0, endMs: newMs })
      } else {
        setFastUri(outUri)
        setFastMs(newMs)
        setFastTrim({ startMs: 0, endMs: newMs })
      }
      await closeTrim()
    } catch (e) {
      Alert.alert('Trim failed', messageFromUnknownError(e))
    }
  }, [closeTrim, fastMs, fastUri, slowMs, slowUri, trimEndMs, trimSlot, trimStartMs])

  const onTrimStartChange = useCallback(
    (v: number) => {
      // Keep end handle fixed visually; only clamp start to remain before end.
      const next = Math.max(0, Math.min(v, trimEndMs - 50))
      setTrimStartMs(next)
    },
    [trimEndMs],
  )

  const reRecordSlot = useCallback(
    async (slot: 'slow' | 'fast') => {
      try {
        await audio.stopPlayback()
      } catch {
        /* ignore */
      }
      if (trimSlot === slot || inlineTrimSlot === slot) {
        setInlineTrimSlot(null)
        setTrimSlot(null)
        setTrimStartMs(0)
        setTrimEndMs(0)
      }
      if (slot === 'slow') {
        setSlowUri(null)
        setSlowMs(0)
        setSlowTrim(null)
      } else {
        setFastUri(null)
        setFastMs(0)
        setFastTrim(null)
      }
      setRecordingSlot(null)
      await audio.resetClip()
    },
    [audio, inlineTrimSlot, trimSlot],
  )

  const uploadCurrentWord = useCallback(async () => {
    if (!current || !slowUri || (!isSingleTake && !fastUri)) return
    setUploading(true)
    try {
      const recordedAt = new Date().toISOString()
      let slowUrl = ''
      let fastUrl: string | null = null

      if (isSingleTake) {
        const storagePath = isFidelTake
          ? fidelAudioStoragePath(current.id)
          : qubeeAudioStoragePath(current.id)
        slowUrl = await uploadVoiceM4a(slowUri, storagePath)
        const payload = {
          audio_url: slowUrl,
          status: 'recorded' as const,
          recorded_at: recordedAt,
          updated_at: recordedAt,
        }
        const table = isFidelTake ? 'fidel_letters' : 'qubee_letters'
        const { error } = await supabase.from(table).update(payload).eq('id', current.id)
        if (error) throw new Error(error.message)
      } else {
        const paths = voiceStoragePaths(current.id, current.series)
        ;[slowUrl, fastUrl] = await Promise.all([
          uploadVoiceM4a(slowUri, paths.slow),
          uploadVoiceM4a(fastUri!, paths.fast),
        ])
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
      }

      const merged: RecordingWord = {
        ...current,
        slow_audio_url: slowUrl,
        fast_audio_url: fastUrl,
        status: 'recorded',
        recorded_at: recordedAt,
      }

      if (mergeIntoSession != null) {
        const next = mergeIntoSession.map((w) => (w.id === merged.id ? merged : w))
        navigation.navigate('Review', { recordedWords: next, recordingTable })
        return
      }

      const nextSession = [...sessionRecorded, merged]
      if (queue.length <= 1) {
        navigation.navigate('Review', { recordedWords: nextSession, recordingTable })
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
    recordingTable,
    isSingleTake,
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
    const trim = slot === 'slow' ? slowTrim : fastTrim
    const effectiveMs = trim ? Math.max(0, trim.endMs - trim.startMs) : ms
    const inTrimMode = inlineTrimSlot === slot
    const trimDur = Math.max(0, trimEndMs - trimStartMs)
    const trimStartPct = ms > 0 ? (trimStartMs / ms) * 100 : 0
    const trimEndPct = ms > 0 ? (trimEndMs / ms) * 100 : 100
    const handleHalfPx = 17
    const halfPct = waveWidthRef.current > 0 ? (handleHalfPx / waveWidthRef.current) * 100 : 0
    const safeStartPct = Math.max(0, Math.min(100, Math.max(halfPct, trimStartPct)))
    const safeEndPct = Math.max(0, Math.min(100, Math.min(100 - halfPct, trimEndPct)))
    const TRIM_SNAP_MS = 20
    const TRIM_MIN_GAP_MS = 150
    const timeLabel = playingThis
      ? `${formatDurationMs(audio.playbackPositionMs)} / ${formatDurationMs(totalPlaybackMs)}`
      : formatDurationMs(effectiveMs)
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
              inTrimMode ? (
                <>
                  <View style={styles.trimHeadRow}>
                    <Pressable style={styles.playCircleSmall} onPress={() => void previewTrim()}>
                      <Text style={styles.playTriSmall}>{playingThis ? '⏹' : '▶'}</Text>
                    </Pressable>
                    <View style={styles.trimHeadInfo}>
                      <Text style={styles.trimHeadDuration}>
                        {formatDurationMs(trimDur)} · {playingThis ? 'playing' : 'trimming'}
                      </Text>
                      <Text style={styles.trimHeadHint}>drag start/end to trim</Text>
                    </View>
                  </View>

                  <TrimWaveEditor
                    ms={ms}
                    trimStartMs={trimStartMs}
                    trimEndMs={trimEndMs}
                    setTrimStartMs={setTrimStartMs}
                    setTrimEndMs={setTrimEndMs}
                  />

                  <View style={styles.waveEdgeTimes}>
                    <Text style={styles.waveEdgeTime}>Start {formatDurationMs(trimStartMs)}</Text>
                    <Text style={styles.waveEdgeTime}>End {formatDurationMs(trimEndMs)}</Text>
                  </View>

                  <View style={styles.trimInlineActions}>
                    <Pressable style={styles.trimInlineBtnGhost} onPress={() => void closeTrim()}>
                      <Text style={styles.trimInlineBtnGhostText} numberOfLines={1}>
                        Cancel
                      </Text>
                    </Pressable>
                    <Pressable style={styles.trimInlineBtnGhost} onPress={() => void reRecordSlot(slot)}>
                      <Text style={styles.trimInlineBtnGhostText} numberOfLines={1}>
                        Re-record
                      </Text>
                    </Pressable>
                    <Pressable style={styles.trimInlineBtnApply} onPress={() => void applyTrim()}>
                      <Text style={styles.trimInlineBtnApplyText} numberOfLines={1}>
                        Apply
                      </Text>
                    </Pressable>
                  </View>
                </>
              ) : (
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
                    <Text style={styles.playTri}>{playingThis ? '⏹' : '▶'}</Text>
                  </Pressable>
                  <Pressable onPress={() => void openTrim(slot)} disabled={uploading}>
                    <Text style={[styles.reRecordText, uploading && styles.disabledText]}>Trim</Text>
                  </Pressable>
                  <Pressable onPress={() => void reRecordSlot(slot)}>
                    <Text style={styles.reRecordText}>Re-record</Text>
                  </Pressable>
                </View>
              </>
              )
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
          <Text style={styles.seriesSessionLang}>
            {titleCase(seriesSession.language)}
            {current?.series ? ` · ${current.series}` : ''}
          </Text>
          <Text style={styles.seriesSessionLeft}>
            {queue.length} {queue.length === 1 ? (isSingleTake ? 'Letter' : 'Word') : isSingleTake ? 'Letters' : 'Words'} Left
          </Text>
        </View>
      ) : null}
      <View style={styles.topMeta}>
        <Text style={styles.progressText}>
          {isSingleTake ? 'Letter' : 'Word'} {wordNum} of {totalWords}
          {skippedCount > 0 ? ` · ${skippedCount} skipped` : ''}
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(sessionProgress * 100)}%` }]} />
        </View>
      </View>

      <View style={[styles.wordRow, isSingleTake && styles.wordRowQubee]}>
        <View style={styles.wordTextCol}>
          {isSingleTake && current.qubeeLetter ? (
            <>
              <Text style={styles.qubeeRecordHint}>Record the letter and example word in one clip</Text>
              <Text style={styles.qubeeLetterHero}>
                {formatQubeeLetterDisplay(current.qubeeLetter)}
              </Text>
              <Text style={styles.qubeeExampleWord} numberOfLines={2}>
                {current.word}
              </Text>
            </>
          ) : isFidelTake && current.fidelSymbol ? (
            <>
              <Text style={styles.qubeeRecordHint}>Record this syllable sound only</Text>
              <Text style={styles.fidelSymbolHero}>{current.fidelSymbol}</Text>
              <Text style={styles.fidelSoundHint}>{current.word}</Text>
            </>
          ) : (
            <Text style={styles.wordText} numberOfLines={2}>
              {current.word}
            </Text>
          )}
        </View>
        <Pressable
          style={[
            styles.wordRerecordPill,
            (isSingleTake ? !slowUri : !slowUri && !fastUri) && styles.wordRerecordPillDisabled,
          ]}
          onPress={() => void clearSlots()}
          disabled={isSingleTake ? !slowUri : !slowUri && !fastUri}
        >
          <Text style={styles.wordRerecordPillText}>Re-record</Text>
        </Pressable>
      </View>
      {/* Status pill removed from this screen; re-record is now handled by the word-level action pill. */}

      {slotCard('slow', isSingleTake ? 'Pronunciation' : 'Slow')}
      {!isSingleTake ? slotCard('fast', 'Fast') : null}

      <Pressable
        style={[styles.nextBtn, (!bothReady || uploading) && styles.nextBtnDisabled]}
        disabled={!bothReady || uploading}
        onPress={() => void uploadCurrentWord()}
      >
        {uploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.nextBtnText}>{isSingleTake ? 'Next Letter' : 'Next Word'}</Text>
        )}
      </Pressable>

      <Pressable style={styles.skipBtn} onPress={() => void skipWord()} disabled={uploading}>
        <Text style={styles.skipText}>{isSingleTake ? 'Skip Letter' : 'Skip Word'}</Text>
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
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3f3f46',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  seriesSessionLang: {
    color: ACCENT_GREEN,
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
    backgroundColor: ACCENT_ORANGE,
    borderRadius: 4,
  },
  wordTextCol: {
    flex: 1,
    flexShrink: 1,
    marginRight: 10,
  },
  wordRowQubee: {
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  qubeeRecordHint: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 10,
    lineHeight: 18,
  },
  qubeeLetterHero: {
    color: ACCENT_YELLOW,
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  qubeeExampleWord: {
    color: ACCENT_GREEN,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
  },
  fidelSymbolHero: {
    color: '#ffffff',
    fontSize: 56,
    fontWeight: '700',
    marginBottom: 8,
  },
  fidelSoundHint: {
    color: ACCENT_GREEN,
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 38,
  },
  wordText: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '700',
    flexShrink: 1,
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 10,
  },
  wordRerecordPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: PILL_PURPLE_BG,
    borderWidth: 1,
    borderColor: '#312e81',
  },
  wordRerecordPillDisabled: {
    opacity: 0.5,
  },
  wordRerecordPillText: {
    color: PILL_PURPLE_TEXT,
    fontSize: 14,
    fontWeight: '700',
  },
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
    width: '100%',
  },
  waveBar: {
    flex: 1,
    marginRight: 2,
    borderRadius: 2,
    backgroundColor: ACCENT_ORANGE,
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
    backgroundColor: ACCENT_ORANGE,
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
  disabledText: {
    opacity: 0.4,
  },
  nextBtn: {
    marginTop: 8,
    backgroundColor: ACCENT_GREEN,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  nextBtnDisabled: {
    opacity: 0.4,
  },
  nextBtnText: {
    color: '#0a0a0a',
    fontSize: 17,
    fontWeight: '700',
  },
  skipBtn: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 8,
  },
  skipText: {
    color: ACCENT_YELLOW,
    fontSize: 15,
  },
  trimHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  playCircleSmall: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: ACCENT_ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTriSmall: { color: '#fff', fontSize: 13, marginLeft: 2 },
  trimHeadInfo: { flex: 1 },
  trimHeadDuration: { color: '#fff', fontSize: 13, fontWeight: '600' },
  trimHeadHint: { color: '#71717a', fontSize: 11 },
  inlineWaveWrap: {
    height: 56,
    backgroundColor: '#111',
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'visible',
    position: 'relative',
  },
  inlineShade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  inlineShadeLeft: { left: 0 },
  inlineShadeRight: { right: 0 },
  inlineHandle: {
    position: 'absolute',
    top: 11,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: ACCENT_ORANGE,
    marginLeft: -17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineHandleTime: { display: 'none' },
  trimSliderRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  trimSliderHalf: { flex: 1 },
  trimMiniLabel: { color: '#a1a1aa', fontSize: 10, marginBottom: -4 },
  waveEdgeTimes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -2,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  waveEdgeTime: { color: '#9ca3af', fontSize: 10, fontVariant: ['tabular-nums'] },
  trimInlineActions: { flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'center' },
  trimInlineBtnGhost: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trimInlineBtnGhostText: { color: '#a1a1aa', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  trimInlineBtnApply: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: ACCENT_ORANGE,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trimInlineBtnApplyText: { color: '#0a0a0a', fontSize: 11, fontWeight: '700', textAlign: 'center' },
})
