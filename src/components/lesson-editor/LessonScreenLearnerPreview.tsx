import { Image, StyleSheet, Text, View } from 'react-native'
import type { ImageSourcePropType } from 'react-native'
import type { ScreenType } from '../../lib/lessonEditor'
import { LEGACY_SCREEN_TYPE_ALIASES } from '../../lib/lessonEditor'

/**
 * Sample Dubbadhu learner screenshots bundled for professors (no JSON).
 * Paths: `assets/lesson-screen-previews/*.png`
 */
const SOURCES: Record<string, ImageSourcePropType> = {
  intro: require('../../../assets/lesson-screen-previews/concept.png'),
  firstLook: require('../../../assets/lesson-screen-previews/listen-first.png'),
  match: require('../../../assets/lesson-screen-previews/match.png'),
  quiz: require('../../../assets/lesson-screen-previews/quiz.png'),
  CelebrateScreen: require('../../../assets/lesson-screen-previews/celebrate.png'),
  dialogue: require('../../../assets/lesson-screen-previews/dialogue.png'),
  concept: require('../../../assets/lesson-screen-previews/concept.png'),
  patternPractice: require('../../../assets/lesson-screen-previews/quiz.png'),
  speakingPractice: require('../../../assets/lesson-screen-previews/speaking-practice.png'),
  audioExposure: require('../../../assets/lesson-screen-previews/listen-first.png'),
  discriminationDrill: require('../../../assets/lesson-screen-previews/quiz.png'),
  communityBoard: require('../../../assets/lesson-screen-previews/community-board.png'),
  'word-breakdown': require('../../../assets/lesson-screen-previews/concept.png'),
  videoReview: require('../../../assets/lesson-screen-previews/concept.png'),
  imageScreen: require('../../../assets/lesson-screen-previews/concept.png'),
  repetition: require('../../../assets/lesson-screen-previews/concept.png'),
  repetitionPractice: require('../../../assets/lesson-screen-previews/concept.png'),
}

function resolvePreviewSource(type: string): ImageSourcePropType | null {
  const canonical = (LEGACY_SCREEN_TYPE_ALIASES[type] ?? type) as ScreenType | string
  return SOURCES[canonical] ?? SOURCES[type] ?? null
}

export function LessonScreenLearnerPreview({ screenType }: { screenType: string }) {
  const source = resolvePreviewSource(screenType)

  return (
    <View style={styles.wrap}>
      <Text style={styles.caption}>Learner app (sample)</Text>
      <Text style={styles.sub}>
        Reference for how this screen type usually looks — your content may differ.
      </Text>
      {source ? (
        <View style={styles.frame}>
          <Image source={source} style={styles.image} resizeMode="contain" accessibilityLabel="Learner screen sample" />
        </View>
      ) : (
        <Text style={styles.missing}>No sample image for this type yet; use the fields below.</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  caption: {
    fontSize: 13,
    fontWeight: '700',
    color: '#d4a853',
    marginBottom: 4,
  },
  sub: {
    fontSize: 12,
    color: '#71717a',
    lineHeight: 17,
    marginBottom: 10,
  },
  frame: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0a0a0a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3f3f46',
    maxHeight: 320,
  },
  image: {
    width: '100%',
    height: 300,
    backgroundColor: '#000',
  },
  missing: {
    fontSize: 13,
    color: '#a1a1aa',
    fontStyle: 'italic',
    paddingVertical: 12,
  },
})
