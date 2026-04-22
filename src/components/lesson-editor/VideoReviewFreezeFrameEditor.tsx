import * as VideoThumbnails from 'expo-video-thumbnails'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

type SetContent = (patch: Record<string, unknown> | ((cur: Record<string, unknown>) => Record<string, unknown>)) => void

function roundSec(t: number): number {
  return Math.round(t * 100) / 100
}

/** `null` = use midpoint of the video when the lesson runs (learner app). */
function parseFreezeSeconds(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'string' && raw.trim() === '') return null
  const n = Number(typeof raw === 'string' ? raw.trim().replace(/[^\d.]/g, '') : raw)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

const MAX_FRAME_SEC = 6 * 60 * 60

type Props = {
  videoUrl: string
  freezeAtSeconds: unknown
  setContent: SetContent
  /** When false (e.g. professor draft), only a short note is shown. */
  enabled: boolean
  /** When true with enabled, show still preview but do not change freeze time (admin-draft preview). */
  readOnly?: boolean
}

/**
 * Picks which moment in the source video becomes the dimmed background still behind the review lines.
 * Uses expo-video-thumbnails (no expo-av Video in this ScrollView — that crashed iOS).
 */
export function VideoReviewFreezeFrameEditor({
  videoUrl,
  freezeAtSeconds,
  setContent,
  enabled,
  readOnly = false,
}: Props) {
  const uri = String(videoUrl ?? '').trim()
  const [freezeDraft, setFreezeDraft] = useState('')
  const [thumbUri, setThumbUri] = useState<string | null>(null)
  const [thumbBusy, setThumbBusy] = useState(false)
  const [thumbErr, setThumbErr] = useState('')

  const freezeParsed = useMemo(() => parseFreezeSeconds(freezeAtSeconds), [freezeAtSeconds])

  /** Thumbnail time: explicit second, or near start when learner will use runtime middle. */
  const thumbnailTimeMs = useMemo(() => {
    if (!uri) return null
    if (freezeParsed != null) {
      const sec = Math.min(Math.max(0, freezeParsed), MAX_FRAME_SEC)
      return Math.floor(sec * 1000)
    }
    return 0
  }, [uri, freezeParsed])

  useEffect(() => {
    const fp = parseFreezeSeconds(freezeAtSeconds)
    setFreezeDraft(fp == null ? '' : String(fp))
  }, [uri, freezeAtSeconds])

  useEffect(() => {
    if (!uri || thumbnailTimeMs === null) {
      setThumbUri(null)
      setThumbErr('')
      setThumbBusy(false)
      return
    }

    let cancelled = false
    const t = setTimeout(() => {
      void (async () => {
        setThumbBusy(true)
        setThumbErr('')
        try {
          const { uri: out } = await VideoThumbnails.getThumbnailAsync(uri, {
            time: thumbnailTimeMs,
            quality: 0.82,
          })
          if (!cancelled) {
            setThumbUri(out)
            setThumbErr('')
          }
        } catch {
          if (!cancelled) {
            setThumbUri(null)
            setThumbErr('Could not load still (check URL or try a smaller second)')
          }
        } finally {
          if (!cancelled) setThumbBusy(false)
        }
      })()
    }, 160)

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [uri, thumbnailTimeMs, enabled])

  const setFreezeNumber = (sec: number) => {
    const s = roundSec(Math.min(Math.max(0, sec), MAX_FRAME_SEC))
    setContent((cur) => ({ ...cur, freezeAtSeconds: s }))
  }

  const clearFreezeToMiddleDefault = () => {
    setFreezeDraft('')
    setContent((cur) => {
      const next = { ...cur }
      delete next.freezeAtSeconds
      return next
    })
  }

  const onFreezeSecondText = (text: string) => {
    setFreezeDraft(text)
    const trimmed = text.trim()
    if (trimmed === '') {
      setContent((cur) => {
        const next = { ...cur }
        delete next.freezeAtSeconds
        return next
      })
      return
    }
    if (/\.$/.test(trimmed) || /\.[^\d]+$/.test(trimmed)) return
    const n = Number(trimmed.replace(/[^\d.]/g, ''))
    if (!Number.isFinite(n) || n < 0) return
    setFreezeNumber(Math.min(n, MAX_FRAME_SEC))
  }

  if (!enabled && !readOnly) {
    return null
  }

  if (!uri) {
    return null
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Background still</Text>
      <Text style={styles.hint}>
        Dimmed still behind the review lines after the clip—one moment from this file. Leave seconds empty for the
        middle of the video at runtime; this screen then previews the opening frame.
      </Text>

      <View style={styles.previewShell} collapsable={false}>
        <View style={styles.previewBox}>
          {thumbUri ? (
            <Image source={{ uri: thumbUri }} style={styles.thumb} resizeMode="contain" />
          ) : null}
          <View style={styles.darken} pointerEvents="none" />
          {thumbBusy ? (
            <View style={styles.thumbSpinner} pointerEvents="none">
              <ActivityIndicator color="#fde68a" />
            </View>
          ) : null}
          <View style={styles.badge} pointerEvents="none">
            <Text style={styles.badgeText}>
              {thumbErr
                ? thumbErr
                : freezeParsed == null
                  ? 'Middle of video at runtime · preview: start'
                  : `Background · ${freezeParsed.toFixed(2)}s`}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.row}>
        <Pressable
          style={[styles.btn, freezeParsed == null && styles.btnOn]}
          disabled={readOnly}
          onPress={() => clearFreezeToMiddleDefault()}
        >
          <Text style={[styles.btnText, freezeParsed == null && styles.btnTextOn]}>Middle of video (default)</Text>
        </Pressable>
      </View>

      <Text style={styles.subLabel}>Background at (seconds), optional</Text>
      <TextInput
        style={styles.input}
        value={freezeDraft}
        onChangeText={onFreezeSecondText}
        placeholder="e.g. 12.5 — leave empty for middle"
        placeholderTextColor="#52525b"
        keyboardType="decimal-pad"
        editable={!readOnly}
      />
    </View>
  )
}

const PREVIEW_H = 220

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { color: '#e4e4e7', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  subLabel: { color: '#a1a1aa', fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 8 },
  hint: { color: '#a1a1aa', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  input: {
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
    marginBottom: 10,
  },
  previewShell: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewBox: {
    width: '100%',
    height: PREVIEW_H,
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 12,
    overflow: 'hidden',
  },
  thumb: { ...StyleSheet.absoluteFillObject },
  darken: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  thumbSpinner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  badgeText: { color: '#fde68a', fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3f3f46',
    backgroundColor: '#18181b',
  },
  btnOn: { borderColor: '#a78bfa', backgroundColor: '#27272a' },
  btnText: { color: '#d4d4d8', fontSize: 13, fontWeight: '700' },
  btnTextOn: { color: '#fff' },
})
