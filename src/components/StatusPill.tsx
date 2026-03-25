import { StyleSheet, Text, View } from 'react-native'
import type { RecordingStatus } from '../types'

const STATUS_THEME: Record<
  RecordingStatus,
  { backgroundColor: string; color: string; label: string }
> = {
  pending: { backgroundColor: '#3a3a3a', color: '#888888', label: 'Pending' },
  recorded: { backgroundColor: '#3a2500', color: '#f59e0b', label: 'Recorded' },
  approved: { backgroundColor: '#0a2a0a', color: '#22c55e', label: 'Approved' },
  rerecord_requested: {
    backgroundColor: '#1e1b4b',
    color: '#c4b5fd',
    label: 'Re-record',
  },
}

type Props = {
  status: RecordingStatus
  compact?: boolean
}

export function StatusPill({ status, compact }: Props) {
  const theme = STATUS_THEME[status]
  return (
    <View
      style={[
        styles.pill,
        compact ? styles.pillCompact : null,
        { backgroundColor: theme.backgroundColor },
      ]}
    >
      <Text style={[styles.text, compact ? styles.textCompact : null, { color: theme.color }]}>
        {theme.label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginRight: 6,
    marginBottom: 6,
  },
  pillCompact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 0,
    marginBottom: 0,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  textCompact: {
    fontSize: 11,
  },
})
