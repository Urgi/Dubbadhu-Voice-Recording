import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ADMIN_ACCENT_GOLD } from './lesson-config/AdminLessonConfigChrome'
import type { ProductionSeriesPipeline, SeriesPipelineRow } from '../lib/productionSeriesPipeline'

function SeriesTitle({ row }: { row: SeriesPipelineRow }) {
  return (
    <Text style={styles.title} numberOfLines={1}>
      {row.title}
      <Text style={styles.number}> #{row.sortOrder}</Text>
    </Text>
  )
}

function PipelineRow({
  tag,
  tagStyle,
  row,
}: {
  tag: string
  tagStyle: object
  row: SeriesPipelineRow
}) {
  return (
    <View style={styles.row}>
      <Text style={tagStyle}>{tag}</Text>
      <View style={styles.body}>
        <SeriesTitle row={row} />
        <Text style={[styles.status, row.draftStale && styles.statusStale]}>
          {row.statusLabel}
          {row.daysAsDraft != null
            ? ` · ${row.daysAsDraft}d as draft${row.draftStale ? ' (over 15d)' : ''}`
            : ''}
        </Text>
      </View>
    </View>
  )
}

type Props = {
  pipeline: ProductionSeriesPipeline | null
  /** When set, whole block is tappable (e.g. open Series Config). */
  onPress?: () => void
  /** Optional footer under the pipeline rows. */
  footer?: string | null
}

/** Live + next-two production series list (Admin Home / Analytics). */
export default function SeriesPipelineBlock({ pipeline, onPress, footer }: Props) {
  const content = (
    <View style={styles.wrap}>
      {pipeline?.lastProduction ? (
        <PipelineRow tag="Live" tagStyle={styles.tagLive} row={pipeline.lastProduction} />
      ) : (
        <Text style={styles.empty}>No published series yet</Text>
      )}
      {(pipeline?.nextTwo?.length ? pipeline.nextTwo : []).map((row, i) => (
        <PipelineRow key={row.id} tag={`Next ${i + 1}`} tagStyle={styles.tagNext} row={row} />
      ))}
      {pipeline && !pipeline.lastProduction && pipeline.nextTwo.length === 0 ? (
        <Text style={styles.empty}>No series found</Text>
      ) : null}
      {pipeline?.lastProduction && pipeline.nextTwo.length === 0 ? (
        <Text style={styles.empty}>No series queued after live</Text>
      ) : null}
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  )

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Open Series Config"
      >
        {content}
      </Pressable>
    )
  }
  return content
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  pressed: { opacity: 0.9 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  tagLive: {
    minWidth: 48,
    color: '#30d158',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
  },
  tagNext: {
    minWidth: 48,
    color: ADMIN_ACCENT_GOLD,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
  },
  body: { flex: 1, minWidth: 0 },
  title: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  number: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '500',
  },
  status: {
    color: '#8e8e93',
    fontSize: 12,
    marginTop: 2,
  },
  statusStale: {
    color: '#ff453a',
    fontWeight: '600',
  },
  empty: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  },
  footer: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
})
