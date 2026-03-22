import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av'

/**
 * Play remote HTTPS audio (e.g. Supabase public URLs). Tracks which logical clip is playing for UI.
 * Uses polling to detect end — `didJustFinish` / `isPlaying` are unreliable on some iOS builds.
 */
export function useRemoteAudioUrl() {
  const soundRef = useRef<InstanceType<typeof Audio.Sound> | null>(null)
  const playbackPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const playingIdRef = useRef<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)

  const setPlaying = useCallback((id: string | null) => {
    playingIdRef.current = id
    setPlayingId(id)
  }, [])

  const clearPlaybackPoll = useCallback(() => {
    if (playbackPollRef.current) {
      clearInterval(playbackPollRef.current)
      playbackPollRef.current = null
    }
  }, [])

  const unloadSound = useCallback(async () => {
    clearPlaybackPoll()
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync()
      } catch {
        /* ignore */
      }
      try {
        await soundRef.current.unloadAsync()
      } catch {
        /* ignore */
      }
      soundRef.current = null
    }
    setPlaying(null)
  }, [clearPlaybackPoll, setPlaying])

  const finishPlayback = useCallback(
    async (sound: InstanceType<typeof Audio.Sound>) => {
      clearPlaybackPoll()
      try {
        await sound.stopAsync()
      } catch {
        /* ignore */
      }
      try {
        await sound.unloadAsync()
      } catch {
        /* ignore */
      }
      if (soundRef.current === sound) {
        soundRef.current = null
        setPlaying(null)
      }
    },
    [clearPlaybackPoll, setPlaying],
  )

  const playUrl = useCallback(
    async (url: string | null, clipId: string) => {
      if (!url?.trim()) return
      // Same clip tapped again → stop
      if (playingIdRef.current === clipId && soundRef.current) {
        await unloadSound()
        return
      }
      try {
        await unloadSound()
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          interruptionModeIOS: InterruptionModeIOS.DuckOthers,
          shouldDuckAndroid: true,
          interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
          playThroughEarpieceAndroid: false,
          staysActiveInBackground: false,
        })
        const { sound, status } = await Audio.Sound.createAsync(
          { uri: url },
          {
            shouldPlay: true,
            volume: 1,
            isLooping: false,
            progressUpdateIntervalMillis: 100,
          },
          (s) => {
            if (!s.isLoaded) return
            if (s.didJustFinish) {
              void finishPlayback(sound)
            }
          },
        )
        if (!status.isLoaded) {
          const err = 'error' in status ? status.error : undefined
          throw new Error(err ?? 'Could not load audio')
        }
        soundRef.current = sound
        setPlaying(clipId)
        try {
          await sound.setProgressUpdateIntervalAsync(100)
        } catch {
          /* optional */
        }
        await sound.playAsync()

        clearPlaybackPoll()
        playbackPollRef.current = setInterval(() => {
          void (async () => {
            const snd = soundRef.current
            if (!snd || snd !== sound) {
              clearPlaybackPoll()
              return
            }
            try {
              const st = await snd.getStatusAsync()
              if (!st.isLoaded) return
              const dur = st.durationMillis ?? 0
              const pos = st.positionMillis ?? 0
              // Slack scales down for short clips (avoid `dur - 120` going negative / always true)
              const slack = dur < 500 ? Math.max(16, Math.min(80, Math.floor(dur * 0.2))) : 120
              const atEnd = dur > 0 && pos >= dur - slack
              if (st.didJustFinish || atEnd) {
                await finishPlayback(snd)
              }
            } catch {
              clearPlaybackPoll()
            }
          })()
        }, 100)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        Alert.alert('Playback failed', msg)
        await unloadSound()
      }
    },
    [finishPlayback, unloadSound, clearPlaybackPoll, setPlaying],
  )

  useEffect(() => {
    return () => {
      void unloadSound()
    }
  }, [unloadSound])

  return { playUrl, stop: unloadSound, playingId }
}
