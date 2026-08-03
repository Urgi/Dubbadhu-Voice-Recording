import { Image, StyleSheet, Text, View } from 'react-native'
import { ADMIN_ACCENT_GOLD } from './lesson-config/AdminLessonConfigChrome'
import { formatAppPromoEventDate } from '../lib/formatAppPromoEventDate'

const CARD_W = 220
const CARD_H = Math.round(CARD_W * (430 / 296))

type Props = {
  title: string
  body: string
  imageUri?: string | null
  eventDate?: string | null
  ctaLabel?: string | null
  hasCta?: boolean
}

/**
 * Compact preview of the learner full-bleed login promo card.
 */
export function AppPromoCardPreview({
  title,
  body,
  imageUri,
  eventDate,
  ctaLabel,
  hasCta,
}: Props) {
  const dateLabel = formatAppPromoEventDate(eventDate)
  const primary = hasCta ? ctaLabel?.trim() || 'Learn more' : 'Got it'
  const showTitle = title.trim() || 'Title'
  const showBody = body.trim() || 'Body copy appears here.'

  return (
    <View style={styles.wrap}>
      <Text style={styles.caption}>Learner preview</Text>
      <View style={styles.card}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, styles.fallback]}>
            <Text style={styles.fallbackText}>Photo</Text>
          </View>
        )}

        {dateLabel ? (
          <View style={styles.dateBadge}>
            <Text style={styles.dateBadgeText}>{dateLabel}</Text>
          </View>
        ) : null}

        <View style={styles.closeChip}>
          <Text style={styles.closeText}>✕</Text>
        </View>

        <View style={styles.band}>
          <Text style={styles.title} numberOfLines={2}>
            {showTitle}
          </Text>
          <Text style={styles.body} numberOfLines={3}>
            {showBody}
          </Text>
          <View style={styles.cta}>
            <Text style={styles.ctaText} numberOfLines={1}>
              {primary}
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginVertical: 12, gap: 8 },
  caption: { color: '#9ca3af', fontSize: 11, fontWeight: '600', alignSelf: 'flex-start' },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1B3129',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#33473C',
  },
  fallback: {
    backgroundColor: '#24382E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: { color: '#4E6A5B', fontSize: 13, fontWeight: '600' },
  dateBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 2,
    backgroundColor: ADMIN_ACCENT_GOLD,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 16,
  },
  dateBadgeText: { color: '#412402', fontSize: 10, fontWeight: '600' },
  closeChip: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#F2EDDD', fontSize: 11, fontWeight: '700' },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,18,14,0.92)',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
  },
  title: { color: '#F2EDDD', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  body: { color: 'rgba(242,237,221,0.72)', fontSize: 11, lineHeight: 15, marginBottom: 10 },
  cta: {
    backgroundColor: ADMIN_ACCENT_GOLD,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  ctaText: { color: '#0a1f12', fontSize: 12, fontWeight: '700' },
})
