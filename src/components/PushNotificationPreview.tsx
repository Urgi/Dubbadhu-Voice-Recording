import { StyleSheet, Text, View } from 'react-native'

type Props = {
  title: string
  body: string
  /** Optional destination hint under the banner (e.g. Opens Speak). */
  openHint?: string | null
}

/**
 * Stylized lock-screen / banner mock of an Expo push notification.
 */
export function PushNotificationPreview({ title, body, openHint }: Props) {
  const showTitle = title.trim() || 'Notification title'
  const showBody = body.trim() || 'Message body appears here.'

  return (
    <View style={styles.wrap}>
      <Text style={styles.caption}>Push preview</Text>
      <View style={styles.banner}>
        <View style={styles.appRow}>
          <View style={styles.appIcon}>
            <Text style={styles.appIconLetter}>D</Text>
          </View>
          <Text style={styles.appName}>DUBBADHU</Text>
          <Text style={styles.now}>now</Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {showTitle}
        </Text>
        <Text style={styles.body} numberOfLines={3}>
          {showBody}
        </Text>
        {openHint ? <Text style={styles.hint}>Opens: {openHint}</Text> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 12, gap: 8 },
  caption: { color: '#9ca3af', fontSize: 11, fontWeight: '600' },
  banner: {
    backgroundColor: 'rgba(44,44,46,0.95)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  appRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  appIcon: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: '#0a1f12',
    borderWidth: 1,
    borderColor: '#d4a437',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIconLetter: { color: '#d4a437', fontSize: 11, fontWeight: '800' },
  appName: {
    flex: 1,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  now: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  title: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  body: { color: 'rgba(255,255,255,0.78)', fontSize: 14, lineHeight: 19 },
  hint: { color: 'rgba(212,164,55,0.85)', fontSize: 11, marginTop: 8, fontWeight: '600' },
})
