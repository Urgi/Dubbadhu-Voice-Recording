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
    /** MEDIUM prepares faster than HIGH; still fine for voice. */
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
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
  // MixWithOthers routes to speaker more reliably after recording on some iOS builds (vs earpiece).
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    interruptionModeIOS:
      Platform.OS === 'ios' ? InterruptionModeIOS.MixWithOthers : InterruptionModeIOS.DuckOthers,
    shouldDuckAndroid: true,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    playThroughEarpieceAndroid: false,
    staysActiveInBackground: false,
  })
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
      const target = sourceUri ?? uri
      if (!target) return
      setPlaybackPositionMs(0)
      setPlaybackDurationMs(0)
      // With allowsRecordingIOS=true, iOS may route playback to the earpiece — set playback mode BEFORE loading sound.
      await setModeForPlayback()
      recordingModePrimedRef.current = false
      await unloadRecording()
      await unloadSound()
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
          }
        },
      )
      if (!status.isLoaded) {
        const err = 'error' in status ? status.error : undefined
        throw new Error(err ?? 'Could not load audio for playback')
      }
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
          }
        } catch {
          clearPlaybackPoll()
        }
      }, 100)
    },
    [uri, unloadRecording, unloadSound, clearPlaybackPoll],
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
