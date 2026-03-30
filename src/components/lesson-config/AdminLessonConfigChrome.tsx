import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'

/** Accent for Lesson Config series UI (headers, badges, add action). */
export const ADMIN_ACCENT_GOLD = '#D4AF37'

const chrome = StyleSheet.create({
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingTop: 8,
  },
  sectionHeaderLabel: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#636366',
  },
  sectionHeaderLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2c2c2e',
  },
  sectionHeaderRight: {
    fontSize: 11,
    fontWeight: '500',
    color: '#636366',
  },
  sectionHeaderLabelGold: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.75,
    color: ADMIN_ACCENT_GOLD,
  },
  sectionHeaderRightGold: {
    fontSize: 13,
    fontWeight: '600',
    color: ADMIN_ACCENT_GOLD,
  },
  sectionHeaderLineGold: {
    backgroundColor: 'rgba(212, 175, 55, 0.28)',
  },
})

export function AdminSectionHeader({
  label,
  right,
  emphasis,
}: {
  label: string
  right?: string
  /** Larger, gold label + count (Lesson Config series list). */
  emphasis?: 'gold'
}) {
  const gold = emphasis === 'gold'
  return (
    <View style={chrome.sectionHeaderRow}>
      <Text style={[chrome.sectionHeaderLabel, gold && chrome.sectionHeaderLabelGold]}>{label}</Text>
      <View style={[chrome.sectionHeaderLine, gold && chrome.sectionHeaderLineGold]} />
      {right ? (
        <Text style={[chrome.sectionHeaderRight, gold && chrome.sectionHeaderRightGold]}>{right}</Text>
      ) : null}
    </View>
  )
}

export function AdminChevronRight({ size = 10, color = '#636366' }: { size?: number; color?: string }) {
  return (
    <Svg width={(size * 6) / 10} height={size} viewBox="0 0 6 10" fill="none">
      <Path
        d="M1 1l4 4-4 4"
        stroke={color}
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function AdminPlusIcon({ size = 14, color = '#a1a1aa' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <Path d="M7 1v12M1 7h12" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  )
}

/** Matches series_config_admin_v2.html document badge (36×36 wrap, blue strokes). */
export function AdminScriptDocIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Rect x="2" y="2" width="12" height="12" rx="2" stroke="#185FA5" strokeWidth={1.2} />
      <Path d="M5 5.5h6M5 8h6M5 10.5h4" stroke="#185FA5" strokeWidth={1.2} strokeLinecap="round" />
    </Svg>
  )
}

const scriptCard = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#1c1c1e',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#38383a',
    borderRadius: 10,
  },
  rowPressed: { opacity: 0.92 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#E6F1FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#a1a1aa',
    lineHeight: 16,
  },
})

/** Tappable row: “Series intro script” + subtitle + chevron (HTML mock). */
export function AdminSeriesScriptCard({
  subtitle,
  onPress,
}: {
  subtitle: string
  onPress: () => void
}) {
  return (
    <Pressable
      style={({ pressed }) => [scriptCard.row, pressed && scriptCard.rowPressed]}
      onPress={onPress}
      android_ripple={{ color: '#333' }}
    >
      <View style={scriptCard.iconWrap}>
        <AdminScriptDocIcon size={16} />
      </View>
      <View style={scriptCard.textCol}>
        <Text style={scriptCard.title} numberOfLines={1}>
          Series intro script
        </Text>
        <Text style={scriptCard.subtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <AdminChevronRight size={10} color="#636366" />
    </Pressable>
  )
}
