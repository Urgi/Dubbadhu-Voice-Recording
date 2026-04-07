import { useCallback, useEffect, useRef, useState } from 'react'
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

const MIN_CROP = 56
const HANDLE = 32

export type SeriesListCoverCropModalProps = {
  visible: boolean
  imageUri: string | null
  /** Crop target aspect = width / height (e.g. 961 / 661). */
  aspectWidth: number
  aspectHeight: number
  onCancel: () => void
  /** Called with a new JPEG file URI after crop. */
  onDone: (croppedFileUri: string) => void | Promise<void>
}

type Crop = { x: number; y: number; w: number; h: number }

function maxCenteredCrop(dispW: number, dispH: number, ar: number): Crop {
  let w: number
  let h: number
  if (dispW / dispH > ar) {
    h = dispH
    w = h * ar
  } else {
    w = dispW
    h = w / ar
  }
  return { x: (dispW - w) / 2, y: (dispH - h) / 2, w, h }
}

function clampCrop(c: Crop, dispW: number, dispH: number, ar: number): Crop {
  let w = Math.max(MIN_CROP, Math.min(c.w, dispW))
  let h = w / ar
  if (h > dispH) {
    h = dispH
    w = h * ar
  }
  let x = Math.max(0, Math.min(c.x, dispW - w))
  let y = Math.max(0, Math.min(c.y, dispH - h))
  if (x + w > dispW) x = dispW - w
  if (y + h > dispH) y = dispH - h
  return { x, y, w, h }
}

export default function SeriesListCoverCropModal({
  visible,
  imageUri,
  aspectWidth,
  aspectHeight,
  onCancel,
  onDone,
}: SeriesListCoverCropModalProps) {
  const ar = aspectWidth / aspectHeight
  const [natW, setNatW] = useState(0)
  const [natH, setNatH] = useState(0)
  const [slotW, setSlotW] = useState(0)
  const [slotH, setSlotH] = useState(0)
  const [crop, setCrop] = useState<Crop | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const startCropRef = useRef<Crop>({ x: 0, y: 0, w: 0, h: 0 })
  const didInitCrop = useRef(false)

  const scaleFit =
    natW > 0 && natH > 0 && slotW > 0 && slotH > 0
      ? Math.min(slotW / natW, slotH / natH)
      : 0
  const fittedW = natW * scaleFit
  const fittedH = natH * scaleFit

  useEffect(() => {
    if (!visible || !imageUri) {
      setNatW(0)
      setNatH(0)
      setCrop(null)
      setLoadErr(null)
      didInitCrop.current = false
      return
    }
    setLoadErr(null)
    didInitCrop.current = false
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
    if (!visible || fittedW <= 0 || fittedH <= 0) return
    if (didInitCrop.current) return
    setCrop(maxCenteredCrop(fittedW, fittedH, ar))
    didInitCrop.current = true
  }, [visible, fittedW, fittedH, ar])

  const applyMove = useCallback(
    (tx: number, ty: number) => {
      const s = startCropRef.current
      setCrop((prev) => {
        if (!prev || fittedW <= 0 || fittedH <= 0) return prev
        return clampCrop(
          { ...prev, x: s.x + tx, y: s.y + ty },
          fittedW,
          fittedH,
          ar,
        )
      })
    },
    [fittedW, fittedH, ar],
  )

  const applyBR = useCallback(
    (tx: number) => {
      const s = startCropRef.current
      const w = s.w + tx
      setCrop((prev) => {
        if (!prev || fittedW <= 0 || fittedH <= 0) return prev
        return clampCrop({ x: s.x, y: s.y, w, h: w / ar }, fittedW, fittedH, ar)
      })
    },
    [fittedW, fittedH, ar],
  )

  const applyTL = useCallback(
    (tx: number, ty: number) => {
      const s = startCropRef.current
      const brx = s.x + s.w
      const bry = s.y + s.h
      let w = s.w - tx
      let h = w / ar
      let x = brx - w
      let y = bry - h
      setCrop((prev) => {
        if (!prev || fittedW <= 0 || fittedH <= 0) return prev
        return clampCrop({ x, y, w, h }, fittedW, fittedH, ar)
      })
    },
    [fittedW, fittedH, ar],
  )

  const applyTR = useCallback(
    (tx: number, ty: number) => {
      const s = startCropRef.current
      const blx = s.x
      const bly = s.y + s.h
      let w = s.w + tx
      let h = w / ar
      let y = bly - h
      let x = blx
      setCrop((prev) => {
        if (!prev || fittedW <= 0 || fittedH <= 0) return prev
        return clampCrop({ x, y, w, h }, fittedW, fittedH, ar)
      })
    },
    [fittedW, fittedH, ar],
  )

  const applyBL = useCallback(
    (tx: number, ty: number) => {
      const s = startCropRef.current
      const trx = s.x + s.w
      const tryY = s.y
      let h = s.h + ty
      let w = h * ar
      let x = trx - w
      let y = tryY
      setCrop((prev) => {
        if (!prev || fittedW <= 0 || fittedH <= 0) return prev
        return clampCrop({ x, y, w, h }, fittedW, fittedH, ar)
      })
    },
    [fittedW, fittedH, ar],
  )

  const movePan = Gesture.Pan()
    .onBegin(() => {
      if (crop) startCropRef.current = { ...crop }
    })
    .onUpdate((e) => applyMove(e.translationX, e.translationY))

  const brPan = Gesture.Pan()
    .onBegin(() => {
      if (crop) startCropRef.current = { ...crop }
    })
    .onUpdate((e) => applyBR(e.translationX))

  const tlPan = Gesture.Pan()
    .onBegin(() => {
      if (crop) startCropRef.current = { ...crop }
    })
    .onUpdate((e) => applyTL(e.translationX, e.translationY))

  const trPan = Gesture.Pan()
    .onBegin(() => {
      if (crop) startCropRef.current = { ...crop }
    })
    .onUpdate((e) => applyTR(e.translationX, e.translationY))

  const blPan = Gesture.Pan()
    .onBegin(() => {
      if (crop) startCropRef.current = { ...crop }
    })
    .onUpdate((e) => applyBL(e.translationX, e.translationY))

  const confirm = useCallback(async () => {
    if (!imageUri || !crop || natW <= 0 || natH <= 0 || fittedW <= 0) return
    const s = natW / fittedW
    let ox = Math.round(crop.x * s)
    let oy = Math.round(crop.y * s)
    let cw = Math.round(crop.w * s)
    let ch = Math.round(crop.h * s)
    ox = Math.max(0, Math.min(ox, natW - 1))
    oy = Math.max(0, Math.min(oy, natH - 1))
    cw = Math.max(1, Math.min(cw, natW - ox))
    ch = Math.max(1, Math.min(ch, natH - oy))
    setBusy(true)
    try {
      const out = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ crop: { originX: ox, originY: oy, width: cw, height: ch } }],
        { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG },
      )
      onDone(out.uri)
    } catch {
      setLoadErr('Could not crop image.')
    } finally {
      setBusy(false)
    }
  }, [imageUri, crop, natW, natH, fittedW, onDone])

  const ready = !!crop && fittedW > 0 && fittedH > 0 && !loadErr

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <GestureHandlerRootView style={styles.flex1}>
        <StatusBar barStyle="light-content" />
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Position cover
          </Text>
        </View>
        <Text style={styles.hint} numberOfLines={4}>
          Drag the gold frame to move. Drag corner dots to resize.{' '}
          <Text style={styles.hintEm}>Save cover</Text> applies this crop;{' '}
          <Text style={styles.hintEm}>Cancel</Text> discards and goes back.
        </Text>
        <View
          style={styles.stage}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout
            setSlotW(width)
            setSlotH(height)
          }}
        >
          {!imageUri || natW <= 0 ? (
            <ActivityIndicator color="#888" />
          ) : loadErr ? (
            <Text style={styles.err}>{loadErr}</Text>
          ) : (
            <View style={[styles.imageSlot, { width: fittedW, height: fittedH }]}>
              <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
              {crop && (
                <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                  <DimBands crop={crop} dispW={fittedW} dispH={fittedH} />
                  <GestureDetector gesture={movePan}>
                    <View
                      style={[
                        styles.cropHit,
                        {
                          left: crop.x,
                          top: crop.y,
                          width: crop.w,
                          height: crop.h,
                        },
                      ]}
                    />
                  </GestureDetector>
                  <View
                    pointerEvents="none"
                    style={[
                      styles.cropOutline,
                      {
                        left: crop.x,
                        top: crop.y,
                        width: crop.w,
                        height: crop.h,
                      },
                    ]}
                  />
                  <CornerHandle gesture={tlPan} left={crop.x - HANDLE / 2} top={crop.y - HANDLE / 2} />
                  <CornerHandle gesture={trPan} left={crop.x + crop.w - HANDLE / 2} top={crop.y - HANDLE / 2} />
                  <CornerHandle gesture={blPan} left={crop.x - HANDLE / 2} top={crop.y + crop.h - HANDLE / 2} />
                  <CornerHandle gesture={brPan} left={crop.x + crop.w - HANDLE / 2} top={crop.y + crop.h - HANDLE / 2} />
                </View>
              )}
            </View>
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
              <Text style={[styles.footerCancelText, busy && styles.footerCancelDisabled]}>Cancel</Text>
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

function DimBands({ crop, dispW, dispH }: { crop: Crop; dispW: number; dispH: number }) {
  const { x, y, w, h } = crop
  return (
    <>
      <View style={[styles.dim, { left: 0, top: 0, width: dispW, height: y }]} />
      <View style={[styles.dim, { left: 0, top: y + h, width: dispW, height: Math.max(0, dispH - y - h) }]} />
      <View style={[styles.dim, { left: 0, top: y, width: x, height: h }]} />
      <View style={[styles.dim, { left: x + w, top: y, width: Math.max(0, dispW - x - w), height: h }]} />
    </>
  )
}

function CornerHandle({
  gesture,
  left,
  top,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RNGH gesture union
  gesture: any
  left: number
  top: number
}) {
  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.handle, { left, top }]} />
    </GestureDetector>
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
  hintEm: { color: '#e4e4e7', fontWeight: '600' },
  stage: {
    flex: 1,
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
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
    backgroundColor: '#c9a227',
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
  imageSlot: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  image: { width: '100%', height: '100%' },
  dim: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  cropHit: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  cropOutline: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(201,162,39,0.95)',
  },
  handle: {
    position: 'absolute',
    width: HANDLE,
    height: HANDLE,
    borderRadius: HANDLE / 2,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 2,
    borderColor: '#c9a227',
  },
  err: { color: '#f87171', padding: 16, textAlign: 'center' },
})
