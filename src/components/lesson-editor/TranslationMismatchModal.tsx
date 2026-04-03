import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'

const colors = {
  bgPrimary: '#1c1c1e',
  bgSecondary: '#2c2c2e',
  bgWarning: '#3d3519',
  bgInfoTint: 'rgba(10, 132, 255, 0.14)',
  borderTertiary: '#38383a',
  borderInfo: '#0a84ff',
  textPrimary: '#ffffff',
  textSecondary: '#8e8e93',
  textInfo: '#5ac8fa',
  textWarning: '#ffd60a',
  overlay: 'rgba(0, 0, 0, 0.55)',
}

type Props = {
  visible: boolean
  /**
   * When true, render as a full-screen layer inside the parent (e.g. lesson editor sheet).
   * A second RN `Modal` often does not appear above `presentationStyle="pageSheet"` on iOS.
   */
  embedded?: boolean
  afaan: string
  lessonTranslation: string
  databaseTranslation: string
  /** 1-based index for this prompt */
  conflictNumber: number
  /** Total mismatches in this save */
  totalConflicts: number
  onCancel: () => void
  onUseLesson: () => void
  onUseDatabase: () => void
}

export function TranslationMismatchModal({
  visible,
  embedded = false,
  afaan,
  lessonTranslation,
  databaseTranslation,
  conflictNumber,
  totalConflicts,
  onCancel,
  onUseLesson,
  onUseDatabase,
}: Props) {
  const dbDisplay = databaseTranslation.trim() ? databaseTranslation : '(empty in database)'
  const safeTotal = Math.max(1, totalConflicts)
  const safeN = Math.min(Math.max(1, conflictNumber), safeTotal)
  /** Counting this prompt, how many decisions are left */
  const leftIncludingThis = safeTotal - safeN + 1

  if (!visible) return null

  const body = (
    <View style={embedded ? styles.backdropEmbedded : styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerBlock}>
            <View style={styles.headerRow}>
              <View style={styles.warningCircle}>
                <Text style={styles.warningGlyph}>!</Text>
              </View>
              <View style={styles.headerTextWrap}>
                <Text style={styles.title}>Translation mismatch</Text>
                <Text style={styles.subtitle}>
                  Word: <Text style={styles.subtitleWord}>{afaan}</Text>
                </Text>
                {safeTotal > 1 ? (
                  <Text style={styles.progressLine}>
                    Conflict {safeN} of {safeTotal} · {leftIncludingThis} left to resolve
                  </Text>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.cards}>
            <View style={styles.cardLesson}>
              <View style={styles.cardTopRow}>
                <Text style={styles.labelLesson}>Lesson</Text>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>Option 1</Text>
                </View>
              </View>
              <Text style={styles.cardBody}>{lessonTranslation}</Text>
            </View>

            <View style={styles.cardDatabase}>
              <View style={styles.cardTopRow}>
                <Text style={styles.labelDatabase}>Database</Text>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>Option 2</Text>
                </View>
              </View>
              <Text style={styles.cardBody}>{dbDisplay}</Text>
            </View>
          </View>

          <View style={styles.infoWrap}>
            <View style={styles.infoRow}>
              <View style={styles.infoIconWrap}>
                <Text style={styles.infoIconI}>i</Text>
              </View>
              <Text style={styles.infoText}>
                New words are added to the voice bank only when an admin approves the series.
              </Text>
            </View>
          </View>

          <View style={styles.footer}>
            <Pressable style={({ pressed }) => [styles.footerCancel, pressed && styles.footerPressed]} onPress={onCancel}>
              <Text style={styles.footerCancelText}>Cancel</Text>
            </Pressable>
            <View style={styles.footerRightCol}>
              <Pressable
                style={({ pressed }) => [styles.footerActionTop, pressed && styles.footerPressed]}
                onPress={onUseLesson}
              >
                <Text style={styles.footerUseLesson}>Use lesson</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.footerActionBottom, pressed && styles.footerPressed]}
                onPress={onUseDatabase}
              >
                <Text style={styles.footerUseDatabase}>Use database</Text>
              </Pressable>
            </View>
          </View>
        </View>
    </View>
  )

  if (embedded) return body

  return (
    <Modal transparent animationType="fade" statusBarTranslucent visible onRequestClose={onCancel}>
      {body}
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  backdropEmbedded: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 2000,
    elevation: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.bgPrimary,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderTertiary,
    overflow: 'hidden',
  },
  headerBlock: {
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  warningCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bgWarning,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningGlyph: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textWarning,
    marginTop: -1,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  subtitleWord: {
    fontWeight: '500',
    color: colors.textPrimary,
  },
  progressLine: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 16,
  },
  cards: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 8,
  },
  cardLesson: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderTertiary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  cardDatabase: {
    borderWidth: 1.5,
    borderColor: colors.borderInfo,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.bgInfoTint,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  labelLesson: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  labelDatabase: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textInfo,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  pill: {
    backgroundColor: colors.bgSecondary,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 20,
  },
  pillText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  cardBody: {
    fontSize: 17,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  infoWrap: {
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: colors.bgSecondary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  infoIconWrap: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.2,
    borderColor: colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  infoIconI: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 10,
    marginTop: -0.5,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderTertiary,
  },
  footerCancel: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.borderTertiary,
  },
  footerPressed: {
    opacity: 0.65,
  },
  footerCancelText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  footerRightCol: {
    flex: 1,
  },
  footerActionTop: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderTertiary,
  },
  footerActionBottom: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  footerUseLesson: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
    textAlign: 'left',
  },
  footerUseDatabase: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textInfo,
    textAlign: 'left',
  },
})
