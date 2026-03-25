import { Pressable, StyleSheet, Text, View } from 'react-native'
import { StatusPill } from './StatusPill'
import type { SeriesSummary } from '../lib/seriesAggregation'

type Props = {
  item: SeriesSummary
  onPress: () => void
  /** Dim tile and block press (e.g. voice actor: nothing left to record in this series) */
  disabled?: boolean
  /** Admin series list: show only count of `recorded` (not yet approved); hide status pills */
  showUnapprovedWords?: boolean
}

export function SeriesTileCard({ item, onPress, disabled, showUnapprovedWords }: Props) {
  return (
    <Pressable
      style={[styles.card, disabled && styles.cardDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.cardTitle}>{item.series}</Text>
      <Text style={styles.cardLanguage}>{item.language}</Text>
      {showUnapprovedWords ? (
        <Text style={styles.unapprovedLine}>
          Recorded, not yet approved ·{' '}
          <Text style={styles.unapprovedCount}>{item.recorded}</Text>
        </Text>
      ) : null}
      {showUnapprovedWords ? null : (
        <View style={styles.pillRow}>
          {item.pending > 0 ? (
            <View style={styles.pillWithCount}>
              <StatusPill status="pending" compact />
              <Text style={styles.pillCount}>{item.pending}</Text>
            </View>
          ) : null}
          {item.recorded > 0 ? (
            <View style={styles.pillWithCount}>
              <StatusPill status="recorded" compact />
              <Text style={styles.pillCount}>{item.recorded}</Text>
            </View>
          ) : null}
          {item.approved > 0 ? (
            <View style={styles.pillWithCount}>
              <StatusPill status="approved" compact />
              <Text style={styles.pillCount}>{item.approved}</Text>
            </View>
          ) : null}
          {item.rerecordRequested > 0 ? (
            <View style={styles.pillWithCount}>
              <StatusPill status="rerecord_requested" compact />
              <Text style={styles.pillCount}>{item.rerecordRequested}</Text>
            </View>
          ) : null}
        </View>
      )}
      <Text style={styles.total}>{item.total} words</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardDisabled: {
    opacity: 0.48,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
  cardLanguage: {
    color: '#a1a1aa',
    fontSize: 14,
    marginTop: 4,
    marginBottom: 8,
    textTransform: 'capitalize',
  },
  unapprovedLine: {
    color: '#d4d4d8',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
  },
  unapprovedCount: {
    color: '#fbbf24',
    fontWeight: '800',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 4,
  },
  pillWithCount: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 6,
  },
  pillCount: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  total: {
    color: '#d4d4d8',
    fontSize: 14,
    marginTop: 8,
  },
})
