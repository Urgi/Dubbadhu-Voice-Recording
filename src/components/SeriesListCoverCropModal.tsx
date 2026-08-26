import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImageManipulator from 'expo-image-manipulator'
import Svg, { Path } from 'react-native-svg'
import { scaleHeroSweepPath } from '../lib/homeHeroSweepClipPath'

const PANEL = '#16281F'
const GOLD = '#c9a227'
const CREAM = '#F3F1E9'
const MUTED = '#BCC9B6'
const SPROUT_SOFT = '#8FDD97'
const INK = '#12240F'
const MIN_USER_SCALE = 1
const MAX_USER_SCALE = 4

export type SeriesListCoverCropModalProps = {
  visible: boolean
  imageUri: string | null
  /** Crop / upload target aspect = width / height. */
  aspectWidth: number
  aspectHeight: number
  onCancel: () => void
  onDone: (croppedFileUri: string) => void | Promise<void>
}

type Transform = { scale: number; tx: number; ty: number }

function coverScale(natW: number, natH: number, viewW: number, viewH: number) {
  if (natW <= 0 || natH <= 0 || viewW <= 0 || viewH <= 0) return 1
  return Math.max(viewW / natW, viewH / natH)
}

function clampTransform(
  t: Transform,
  natW: number,
  natH: number,
  viewW: number,
  viewH: number,
): Transform {
  const scale = Math.min(MAX_USER_SCALE, Math.max(MIN_USER_SCALE, t.scale))
  const base = coverScale(natW, natH, viewW, viewH)
  const total = base * scale
  const imgW = natW * total
  const imgH = natH * total
  const minTx = Math.min(0, viewW - imgW)
  const minTy = Math.min(0, viewH - imgH)
  const tx = Math.max(minTx, Math.min(0, t.tx))
  const ty = Math.max(minTy, Math.min(0, t.ty))
  return { scale, tx, ty }
}

function centeredCoverTransform(
  natW: number,
  natH: number,
  viewW: number,
  viewH: number,
): Transform {
  const base = coverScale(natW, natH, viewW, viewH)
  const imgW = natW * base
  const imgH = natH * base
  return clampTransform(
    { scale: 1, tx: (viewW - imgW) / 2, ty: (viewH - imgH) / 2 },
    natW,
    natH,
    viewW,
    viewH,
  )
}

/**
 * Cover cropper whose viewport is the Home continue-card sweep — pan/pinch the
 * photo under a fixed curve instead of a rectangular gold frame.
 */
export default function SeriesListCoverCropModal({
  visible,
  imageUri,
  aspectWidth,
  aspectHeight,
  onCancel,
  onDone,
}: SeriesListCoverCropModalProps) {
  const ar = aspectWidth / Math.max(1, aspectHeight)
  const [natW, setNatW] = useState(0)
  const [natH, setNatH] = useState(0)
  const [slotW, setSlotW] = useState(0)
  const [slotH, setSlotH] = useState(0)
  const [transform, setTransform] = useState<Transform>({ scale: 1, tx: 0, ty: 0 })
  const [busy, setBusy] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const startRef = useRef<Transform>({ scale: 1, tx: 0, ty: 0 })
  const pinchStartRef = useRef<Transform>({ scale: 1, tx: 0, ty: 0 })
  const transformRef = useRef(transform)
  transformRef.current = transform
  const didInit = useRef(false)

  const viewSize = useMemo(() => {
    if (slotW <= 0 || slotH <= 0) return { w: 0, h: 0 }
    let w = slotW
    let h = w / ar
    if (h > slotH) {
      h = slotH
      w = h * ar
    }
    return { w: Math.floor(w), h: Math.floor(h) }
  }, [slotW, slotH, ar])

  const { w: viewW, h: viewH } = viewSize
  const sweepPath = viewW > 0 && viewH > 0 ? scaleHeroSweepPath(viewW, viewH) : ''
  const titleMax = Math.round(viewW * 0.45)

  useEffect(() => {
    if (!visible || !imageUri) {
      setNatW(0)
      setNatH(0)
      setTransform({ scale: 1, tx: 0, ty: 0 })
      setLoadErr(null)
      didInit.current = false
      return
    }
    setLoadErr(null)
    didInit.current = false
    Image.getSize(
      imageUri,
      (w, h) => {
        setNatW(w)
        setNatH(h)
      },
      () => setLoadErr('Could not read image size.'),
    )
  }, [visible, imageUri])

  useEffect(() => {
    if (!visible || natW <= 0 || natH <= 0 || viewW <= 0 || viewH <= 0) return
    if (didInit.current) return
    setTransform(centeredCoverTransform(natW, natH, viewW, viewH))
    didInit.current = true
  }, [visible, natW, natH, viewW, viewH])

  const base = coverScale(natW, natH, viewW, viewH)
  const totalScale = base * transform.scale
  const imgW = natW * totalScale
  const imgH = natH * totalScale

  const applyPan = useCallback(
    (tx: number, ty: number, baseTx: number, baseTy: number, scale: number) => {
      setTransform(
        clampTransform(
          { scale, tx: baseTx + tx, ty: baseTy + ty },
          natW,
          natH,
          viewW,
          viewH,
        ),
      )
    },
    [natW, natH, viewW, viewH],
  )

  const applyPinch = useCallback(
    (nextScale: number, baseTx: number, baseTy: number, baseScale: number) => {
      const prevTotal = base * baseScale
      const clamped = Math.min(MAX_USER_SCALE, Math.max(MIN_USER_SCALE, nextScale))
      const nextTotal = base * clamped
      if (prevTotal <= 0) return
      const ratio = nextTotal / prevTotal
      const cx = viewW / 2
      const cy = viewH / 2
      const tx = cx - (cx - baseTx) * ratio
      const ty = cy - (cy - baseTy) * ratio
      setTransform(
        clampTransform({ scale: clamped, tx, ty }, natW, natH, viewW, viewH),
      )
    },
    [base, natW, natH, viewW, viewH],
  )

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => {
      startRef.current = { ...transformRef.current }
    })
    .onUpdate((e) => {
      applyPan(
        e.translationX,
        e.translationY,
        startRef.current.tx,
        startRef.current.ty,
        startRef.current.scale,
      )
    })

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => {
      pinchStartRef.current = { ...transformRef.current }
    })
    .onUpdate((e) => {
      applyPinch(
        pinchStartRef.current.scale * e.scale,
        pinchStartRef.current.tx,
        pinchStartRef.current.ty,
        pinchStartRef.current.scale,
      )
    })

  const composed = Gesture.Simultaneous(pan, pinch)

  const confirm = useCallback(async () => {
    if (!imageUri || natW <= 0 || natH <= 0 || viewW <= 0 || viewH <= 0) return
    const s = coverScale(natW, natH, viewW, viewH) * transform.scale
    if (s <= 0) return
    let ox = Math.round(-transform.tx / s)
    let oy = Math.round(-transform.ty / s)
    let cw = Math.round(viewW / s)
    let ch = Math.round(viewH / s)
    ox = Math.max(0, Math.min(ox, natW - 1))
    oy = Math.max(0, Math.min(oy, natH - 1))
    cw = Math.max(1, Math.min(cw, natW - ox))
    ch = Math.max(1, Math.min(ch, natH - oy))
    // Keep upload aspect: crop then resize to target pixel ratio frame
    const outW = aspectWidth
    const outH = aspectHeight
    setBusy(true)
    try {
      const out = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          { crop: { originX: ox, originY: oy, width: cw, height: ch } },
          { resize: { width: outW, height: outH } },
        ],
        { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG },
      )
      onDone(out.uri)
    } catch {
      setLoadErr('Could not crop image.')
    } finally {
      setBusy(false)
    }
  }, [
    imageUri,
    natW,
    natH,
    viewW,
    viewH,
    transform,
    aspectWidth,
    aspectHeight,
    onDone,
  ])

  const ready = natW > 0 && natH > 0 && viewW > 0 && viewH > 0 && !loadErr && !busy

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <GestureHandlerRootView style={styles.flex1}>
        <StatusBar barStyle="light-content" />
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Position Home cover
            </Text>
          </View>
          <Text style={styles.hint}>
            Drag to move · pinch to zoom. The curved window is what learners see on
            Home — the green side stays covered. Speaks tab still uses the full
            rectangle behind this shape.
          </Text>

          <View
            style={styles.stage}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout
              setSlotW(width)
              setSlotH(height)
            }}
          >
            {!imageUri || natW <= 0 || viewW <= 0 ? (
              <ActivityIndicator color="#888" />
            ) : loadErr ? (
              <Text style={styles.err}>{loadErr}</Text>
            ) : (
              <GestureDetector gesture={composed}>
                <View style={[styles.viewport, { width: viewW, height: viewH }]}>
                  <Image
                    source={{ uri: imageUri }}
                    style={{
                      position: 'absolute',
                      width: imgW,
                      height: imgH,
                      left: transform.tx,
                      top: transform.ty,
                    }}
                    resizeMode="stretch"
                  />

                  {/* Panel covers non-sweep; sweep is a hole showing the photo */}
                  <Svg
                    width={viewW}
                    height={viewH}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  >
                    <Path
                      d={`M0 0 H${viewW} V${viewH} H0 Z ${sweepPath}`}
                      fill={PANEL}
                      fillRule="evenodd"
                    />
                    <Path
                      d={sweepPath}
                      fill="none"
                      stroke={GOLD}
                      strokeWidth={2}
                    />
                  </Svg>

                  <View style={styles.chrome} pointerEvents="none">
                    <Text style={styles.lessonNo}>LESSON …</Text>
                    <Text style={[styles.title, { maxWidth: titleMax }]} numberOfLines={2}>
                      Home continue card
                    </Text>
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>LESSON PROGRESS</Text>
                    </View>
                    <View style={styles.continue}>
                      <Text style={styles.continueText}>Continue • … min</Text>
                    </View>
                  </View>
                </View>
              </GestureDetector>
            )}
          </View>

          <View style={styles.footer}>
            <View style={styles.footerRow}>
              <Pressable
                onPress={onCancel}
                style={({ pressed }) => [styles.footerCancel, pressed && styles.footerCancelPressed]}
                hitSlop={8}
                disabled={busy}
              >
                <Text style={[styles.footerCancelText, busy && styles.footerCancelDisabled]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void confirm()}
                style={({ pressed }) => [
                  styles.footerBtn,
                  (!ready || busy) && styles.footerBtnDisabled,
                  pressed && ready && !busy && styles.footerBtnPressed,
                ]}
                disabled={!ready || busy}
              >
                <Text style={styles.footerBtnText}>{busy ? 'Saving…' : 'Save cover'}</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  hint: {
    color: '#71717a',
    fontSize: 13,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    lineHeight: 18,
  },
  stage: {
    flex: 1,
    minHeight: 160,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  viewport: {
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: PANEL,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(243,241,233,0.12)',
  },
  chrome: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  lessonNo: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.1,
    color: GOLD,
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
    color: CREAM,
    marginBottom: 8,
  },
  pill: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(243,241,233,0.085)',
    marginBottom: 10,
  },
  pillText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.9,
    color: MUTED,
  },
  continue: {
    marginTop: 'auto',
    borderRadius: 999,
    backgroundColor: SPROUT_SOFT,
    paddingVertical: 10,
    alignItems: 'center',
  },
  continueText: {
    fontSize: 13,
    fontWeight: '600',
    color: INK,
  },
  footer: {
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
    backgroundColor: '#0a0a0a',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  footerCancel: {
    flexShrink: 0,
    paddingVertical: 16,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  footerCancelPressed: { opacity: 0.75 },
  footerCancelText: {
    color: '#e4e4e7',
    fontSize: 17,
    fontWeight: '600',
  },
  footerCancelDisabled: { opacity: 0.4 },
  footerBtn: {
    flex: 1,
    backgroundColor: GOLD,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnPressed: { opacity: 0.92 },
  footerBtnDisabled: { opacity: 0.4 },
  footerBtnText: {
    color: '#0a0a0a',
    fontSize: 17,
    fontWeight: '700',
  },
  err: { color: '#f87171', padding: 16, textAlign: 'center' },
})
