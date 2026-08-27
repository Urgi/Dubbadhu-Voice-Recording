import { useMemo, useState } from 'react'
import {
  Image,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { scaleHeroSweepPath, HOME_SWEEP_PANEL_TEXT_WIDTH_RATIO } from '../lib/homeHeroSweepClipPath'
import {
  HOME_CONTINUE_CARD_ASPECT_HEIGHT,
  HOME_CONTINUE_CARD_ASPECT_WIDTH,
} from '../lib/homeHeroCover'

const PANEL = '#16281F'
const CREAM = '#F3F1E9'
const GOLD = '#D9A441'
const SPROUT_SOFT = '#8FDD97'
const INK = '#12240F'
const MUTED = '#BCC9B6'

const CARD_ASPECT = HOME_CONTINUE_CARD_ASPECT_WIDTH / HOME_CONTINUE_CARD_ASPECT_HEIGHT

/** Crop rect in the same coordinate space as the source image display (fitted). */
export type HomeHeroLiveCrop = {
  x: number
  y: number
  w: number
  h: number
  /** Displayed source image width/height (fitted). */
  sourceW: number
  sourceH: number
}

export type HomeHeroCoverShapePreviewProps = {
  imageUri: string | null
  /** When set, pans/scales the photo so this crop fills the card (live crop UI). */
  liveCrop?: HomeHeroLiveCrop | null
  /** @deprecated Aspect is locked to the learner continue card (520×304). */
  height?: number
  showChrome?: boolean
  style?: StyleProp<ViewStyle>
}

/**
 * Preview of the learner Home continue card: photo clipped by the bezier sweep.
 * Aspect matches learner ContinueLessonCard + admin crop output.
 */
export default function HomeHeroCoverShapePreview({
  imageUri,
  liveCrop,
  showChrome = true,
  style,
}: HomeHeroCoverShapePreviewProps) {
  const [width, setWidth] = useState(320)
  const height = Math.max(1, Math.round(width / CARD_ASPECT))
  const sweepPath = scaleHeroSweepPath(width, height)
  const titleMax = Math.round(width * HOME_SWEEP_PANEL_TEXT_WIDTH_RATIO)

  const photoStyle = useMemo(() => {
    if (
      !liveCrop ||
      liveCrop.w <= 0 ||
      liveCrop.h <= 0 ||
      liveCrop.sourceW <= 0 ||
      liveCrop.sourceH <= 0 ||
      width <= 0
    ) {
      return { width, height }
    }
    const scale = Math.max(width / liveCrop.w, height / liveCrop.h)
    return {
      width: liveCrop.sourceW * scale,
      height: liveCrop.sourceH * scale,
      transform: [
        { translateX: -liveCrop.x * scale },
        { translateY: -liveCrop.y * scale },
      ],
    }
  }, [liveCrop, width, height])

  return (
    <View
      style={[styles.card, { aspectRatio: CARD_ASPECT }, style]}
      onLayout={(e) => {
        const w = Math.ceil(e.nativeEvent.layout.width)
        if (w > 0 && w !== width) setWidth(w)
      }}
    >
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={[styles.photo, photoStyle]}
          resizeMode="stretch"
        />
      ) : (
        <View style={[styles.photoFallback, { width, height }]} />
      )}

      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path
          d={`M0 0 H${width} V${height} H0 Z ${sweepPath}`}
          fill={PANEL}
          fillRule="evenodd"
        />
      </Svg>

      {showChrome ? (
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
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: PANEL,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(243,241,233,0.12)',
    position: 'relative',
    width: '100%',
  },
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  photoFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: '#254A32',
  },
  chrome: {
    flex: 1,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 14,
    justifyContent: 'flex-start',
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
})
