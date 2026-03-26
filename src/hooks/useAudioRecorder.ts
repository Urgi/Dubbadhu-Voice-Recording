import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av'

const VOICE_RECORDING_OPTIONS = {
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    /** LOW prepares faster than MEDIUM/HIGH — sufficient for voice and reduces tap-to-record delay. */
    audioQuality: Audio.IOSAudioQuality.LOW,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
} as const

async function setModeForRecording() {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    shouldDuckAndroid: true,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    playThroughEarpieceAndroid: false,
    staysActiveInBackground: false,
  })
}

/** When Recording status has no duration, derive it from the decoded file (expo-av Sound). */
async function getDurationMillisFromFileUri(fileUri: string): Promise<number> {
  try {
    const { sound, status } = await Audio.Sound.createAsync(
      { uri: fileUri },
      { shouldPlay: false },
    )
    try {
      if (!status.isLoaded) return 0
      return status.durationMillis ?? 0
    } finally {
      try {
        await sound.unloadAsync()
      } catch {
        /* ignore */
      }
    }
  } catch {
    return 0
  }
}

async function setModeForPlayback() {
  // Prefer full-volume, non-ducked playback.
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    shouldDuckAndroid: false,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    playThroughEarpieceAndroid: false,
    staysActiveInBackground: false,
  })
}

function normalizePlayableUri(input: string): string {
  const s = String(input ?? '')
  if (s.startsWith('file://')) return s
  if (s.startsWith('file:/')) return s.replace(/^file:\/*/, 'file:///')
  if (s.startsWith('/')) return `file://${s}`
  return s
}

export function useAudioRecorder() {
  const recordingRef = useRef<InstanceType<typeof Audio.Recording> | null>(null)
  const soundRef = useRef<InstanceType<typeof Audio.Sound> | null>(null)
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  /** Last live duration from polling while recording — fallback if final status reports 0ms. */
  const lastRecordingDurationMsRef = useRef(0)
  /** Audio session already in recording mode — skip redundant setAudioModeAsync (saves ~stall before prepare). */
  const recordingModePrimedRef = useRef(false)
  /** iOS often under-reports position in the initial callback — poll getStatusAsync while playing. */
  const playbackPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearPlaybackPoll = useCallback(() => {
    if (playbackPollRef.current) {
      clearInterval(playbackPollRef.current)
      playbackPollRef.current = null
    }
  }, [])

  const [isRecording, setIsRecording] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [durationMs, setDurationMs] = useState(0)
  /** Live playback position (Sound status), 0 when not playing */
  const [playbackPositionMs, setPlaybackPositionMs] = useState(0)
  /** Loaded clip duration during playback */
  const [playbackDurationMs, setPlaybackDurationMs] = useState(0)
  const [uri, setUri] = useState<string | null>(null)
  const [permissionGranted, setPermissionGranted] = useState(false)

  const clearDurationInterval = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }
  }, [])

  const unloadSound = useCallback(async () => {
    clearPlaybackPoll()
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync()
      } catch {
        /* ignore */
      }
      soundRef.current = null
    }
    setIsPlaying(false)
  }, [clearPlaybackPoll])

  const unloadRecording = useCallback(async () => {
    clearDurationInterval()
    if (recordingRef.current) {
      try {
        const rec = recordingRef.current
        const status = await rec.getStatusAsync()
        if (status.canRecord && status.isRecording) {
          await rec.stopAndUnloadAsync()
        } else if (status.isDoneRecording === false) {
          await rec.stopAndUnloadAsync()
        }
      } catch {
        /* ignore */
      }
      recordingRef.current = null
    }
    setIsRecording(false)
  }, [clearDurationInterval])

  /** Stop playback + any in-flight recording (discard). Safe to call before starting another take. */
  const ensureIdle = useCallback(async () => {
    await unloadSound()
    await unloadRecording()
    setDurationMs(0)
  }, [unloadRecording, unloadSound])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { granted } = await Audio.requestPermissionsAsync()
        if (!cancelled) setPermissionGranted(granted)
        if (granted) {
          await setModeForRecording()
          recordingModePrimedRef.current = true
        }
      } catch {
        /* permission flow failed */
      }
    })()
    return () => {
      cancelled = true
      void ensureIdle()
    }
  }, [ensureIdle])

  const startRecording = useCallback(async () => {
    // Callers (e.g. RecordingScreen) already run `ensureIdle()` before this — avoid doubling
    // unload/stop work, which noticeably delays the first samples after tapping Record.
    setUri(null)
    setDurationMs(0)
    let granted = permissionGranted
    if (!granted) {
      const existing = await Audio.getPermissionsAsync()
      granted = existing.granted
      if (!granted) {
        const req = await Audio.requestPermissionsAsync()
        granted = req.granted
      }
    }
    if (!granted) {
      throw new Error('Missing audio recording permission.')
    }
    setPermissionGranted(true)
    if (!recordingModePrimedRef.current) {
      await setModeForRecording()
    }
    const recording = new Audio.Recording()
    recordingRef.current = recording
    try {
      await recording.prepareToRecordAsync(VOICE_RECORDING_OPTIONS as never)
      await recording.startAsync()
      recordingModePrimedRef.current = true
    } catch (e) {
      recordingRef.current = null
      throw e
    }
    setIsRecording(true)
    lastRecordingDurationMsRef.current = 0
    durationIntervalRef.current = setInterval(async () => {
      try {
        const status = await recording.getStatusAsync()
        if (status.isRecording && status.durationMillis != null) {
          lastRecordingDurationMsRef.current = status.durationMillis
          setDurationMs(status.durationMillis)
        }
      } catch {
        /* ignore */
      }
    }, 100)
  }, [permissionGranted])

  const stopRecording = useCallback(async (): Promise<{ uri: string | null; durationMillis: number }> => {
    const recording = recordingRef.current
    clearDurationInterval()
    if (!recording) {
      setIsRecording(false)
      return { uri: null, durationMillis: 0 }
    }
    try {
      // Final duration is on the status returned by stopAndUnloadAsync — getStatusAsync() after unload often reports 0.
      const finalStatus = await recording.stopAndUnloadAsync()
      const u = recording.getURI() ?? finalStatus.uri ?? null
      let ms = finalStatus.durationMillis ?? 0
      if (ms <= 0) {
        ms = lastRecordingDurationMsRef.current
      }
      if (ms <= 0 && u) {
        ms = await getDurationMillisFromFileUri(u)
      }
      lastRecordingDurationMsRef.current = 0
      setDurationMs(ms)
      setUri(u)
      recordingRef.current = null
      setIsRecording(false)
      return { uri: u, durationMillis: ms }
    } catch (e) {
      recordingRef.current = null
      setIsRecording(false)
      throw e
    }
  }, [clearDurationInterval])

  /** Stop/unload current sound only — does not switch audio mode (avoids earpiece routing when chaining play). */
  const stopSoundOnly = useCallback(async () => {
    clearPlaybackPoll()
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync()
        await soundRef.current.unloadAsync()
      } catch {
        /* ignore */
      }
      soundRef.current = null
    }
    setIsPlaying(false)
    setPlaybackPositionMs(0)
    setPlaybackDurationMs(0)
  }, [clearPlaybackPoll])

  const startPlayback = useCallback(
    async (sourceUri?: string | null) => {
      const raw = sourceUri ?? uri
      if (!raw) return
      const target = normalizePlayableUri(raw)
      setPlaybackPositionMs(0)
      setPlaybackDurationMs(0)
      // With allowsRecordingIOS=true, iOS may route playback to the earpiece — set playback mode BEFORE loading sound.
      await setModeForPlayback()
      recordingModePrimedRef.current = false
      await unloadRecording()
      await unloadSound()
      console.log('[audio][playback] startPlayback', { raw, target })
      const { sound, status } = await Audio.Sound.createAsync(
        { uri: target },
        { shouldPlay: true, volume: 1, progressUpdateIntervalMillis: 50 },
        (s) => {
          if (!s.isLoaded) return
          // Keep UI in sync with native player (didJustFinish is not always emitted on iOS).
          setIsPlaying(s.isPlaying)
          if (s.durationMillis != null && s.durationMillis > 0) {
            setPlaybackDurationMs(s.durationMillis)
          }
          setPlaybackPositionMs(s.positionMillis ?? 0)
          if (s.didJustFinish) {
            setIsPlaying(false)
            setPlaybackPositionMs(s.durationMillis ?? s.positionMillis ?? 0)
            clearPlaybackPoll()
            // Next tap to record skips a slow setAudioMode hop (was playback mode).
            void setModeForRecording().then(() => {
              recordingModePrimedRef.current = true
            })
          }
        },
      )
      if (!status.isLoaded) {
        const err = 'error' in status ? status.error : undefined
        console.log('[audio][playback] load failed', { raw, target, err })
        throw new Error(err ?? 'Could not load audio for playback')
      }
      console.log('[audio][playback] loaded', {
        raw,
        target,
        durationMillis: status.durationMillis ?? null,
        isMuted: 'isMuted' in status ? (status as any).isMuted : undefined,
        volume: 'volume' in status ? (status as any).volume : undefined,
        shouldPlay: status.shouldPlay,
      })
      if (status.durationMillis != null && status.durationMillis > 0) {
        setPlaybackDurationMs(status.durationMillis)
      }
      try {
        await sound.setVolumeAsync(1)
      } catch {
        /* ignore */
      }
      await sound.playAsync()
      try {
        const st = await sound.getStatusAsync()
        if (st.isLoaded) {
          console.log('[audio][playback] after playAsync', {
            isPlaying: st.isPlaying,
            positionMillis: st.positionMillis ?? null,
            durationMillis: st.durationMillis ?? null,
            isMuted: (st as any).isMuted,
            volume: (st as any).volume,
          })
        }
      } catch {
        /* ignore */
      }
      try {
        await sound.setProgressUpdateIntervalAsync(50)
      } catch {
        /* optional on some platforms */
      }
      soundRef.current = sound
      setIsPlaying(true)

      clearPlaybackPoll()
      let pollTicks = 0
      playbackPollRef.current = setInterval(async () => {
        pollTicks += 1
        const snd = soundRef.current
        if (!snd) {
          clearPlaybackPoll()
          return
        }
        try {
          const st = await snd.getStatusAsync()
          if (!st.isLoaded) return
          const dur = st.durationMillis ?? 0
          const pos = st.positionMillis ?? 0
          if (dur > 0) setPlaybackDurationMs(dur)
          setPlaybackPositionMs(pos)
          setIsPlaying(st.isPlaying)
          const finished =
            st.didJustFinish || (pollTicks >= 3 && !st.isPlaying && dur > 0)
          if (finished) {
            setIsPlaying(false)
            if (dur > 0) setPlaybackPositionMs(dur)
            clearPlaybackPoll()
            void setModeForRecording().then(() => {
              recordingModePrimedRef.current = true
            })
          }
        } catch {
          clearPlaybackPoll()
        }
      }, 100)
    },
    [uri, unloadRecording, unloadSound, clearPlaybackPoll],
  )

  /**
   * Play a bounded segment of a clip (non-destructive trim preview).
   * Ensures playback starts at startMs and stops at endMs.
   */
  const playSegment = useCallback(
    async (sourceUri: string, startMs: number, endMs: number) => {
      const raw = sourceUri
      if (!raw) return
      const target = normalizePlayableUri(raw)
      const start = Math.max(0, Math.floor(startMs))
      const end = Math.max(start, Math.floor(endMs))

      setPlaybackPositionMs(start)
      setPlaybackDurationMs(0)

      await setModeForPlayback()
      recordingModePrimedRef.current = false
      await unloadRecording()
      await unloadSound()
      console.log('[audio][playback] playSegment', { raw, target, start, end })

      const { sound, status } = await Audio.Sound.createAsync(
        { uri: target },
        { shouldPlay: false, volume: 1, progressUpdateIntervalMillis: 50 },
        (s) => {
          if (!s.isLoaded) return
          setIsPlaying(s.isPlaying)
          if (s.durationMillis != null && s.durationMillis > 0) {
            setPlaybackDurationMs(s.durationMillis)
          }
          setPlaybackPositionMs(s.positionMillis ?? 0)
        },
      )

      if (!status.isLoaded) {
        const err = 'error' in status ? status.error : undefined
        console.log('[audio][playback] segment load failed', { raw, target, err })
        throw new Error(err ?? 'Could not load audio for playback')
      }
      console.log('[audio][playback] segment loaded', {
        raw,
        target,
        durationMillis: status.durationMillis ?? null,
        isMuted: (status as any).isMuted,
        volume: (status as any).volume,
      })

      const dur = status.durationMillis ?? 0
      if (dur > 0) setPlaybackDurationMs(dur)

      // Clamp end to duration when known
      const boundedEnd = dur > 0 ? Math.min(end, dur) : end

      try {
        await sound.setVolumeAsync(1)
      } catch {
        /* ignore */
      }
      try {
        await sound.setPositionAsync(start)
      } catch {
        /* ignore */
      }

      soundRef.current = sound
      setIsPlaying(true)
      await sound.playAsync()
      try {
        const st = await sound.getStatusAsync()
        if (st.isLoaded) {
          console.log('[audio][playback] segment after playAsync', {
            isPlaying: st.isPlaying,
            positionMillis: st.positionMillis ?? null,
            durationMillis: st.durationMillis ?? null,
            isMuted: (st as any).isMuted,
            volume: (st as any).volume,
          })
        }
      } catch {
        /* ignore */
      }

      clearPlaybackPoll()
      playbackPollRef.current = setInterval(async () => {
        const snd = soundRef.current
        if (!snd) {
          clearPlaybackPoll()
          return
        }
        try {
          const st = await snd.getStatusAsync()
          if (!st.isLoaded) return
          const pos = st.positionMillis ?? 0
          const d = st.durationMillis ?? 0
          if (d > 0) setPlaybackDurationMs(d)
          setPlaybackPositionMs(pos)
          setIsPlaying(st.isPlaying)

          if (pos >= boundedEnd || st.didJustFinish) {
            try {
              await snd.stopAsync()
            } catch {
              /* ignore */
            }
            try {
              await snd.unloadAsync()
            } catch {
              /* ignore */
            }
            soundRef.current = null
            setIsPlaying(false)
            setPlaybackPositionMs(boundedEnd)
            clearPlaybackPoll()
            void setModeForRecording().then(() => {
              recordingModePrimedRef.current = true
            })
          }
        } catch {
          clearPlaybackPoll()
        }
      }, 80)
    },
    [unloadRecording, unloadSound, clearPlaybackPoll],
  )

  const stopPlayback = useCallback(async () => {
    clearPlaybackPoll()
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync()
        await soundRef.current.unloadAsync()
      } catch {
        /* ignore */
      }
      soundRef.current = null
    }
    setIsPlaying(false)
    setPlaybackPositionMs(0)
    setPlaybackDurationMs(0)
    await setModeForRecording()
    recordingModePrimedRef.current = true
  }, [clearPlaybackPoll])

  /** Clear last recorded clip from hook state (files remain on disk until overwritten). */
  const resetClip = useCallback(async () => {
    await ensureIdle()
    setUri(null)
    setDurationMs(0)
    await setModeForRecording()
    recordingModePrimedRef.current = true
  }, [ensureIdle])

  return {
    permissionGranted,
    startRecording,
    stopRecording,
    startPlayback,
    playSegment,
    stopSoundOnly,
    stopPlayback,
    isRecording,
    isPlaying,
    durationMs,
    playbackPositionMs,
    playbackDurationMs,
    uri,
    resetClip,
    ensureIdle,
  }
}
