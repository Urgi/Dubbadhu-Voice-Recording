import type { SupabaseClient } from '@supabase/supabase-js'
import {
  normalizeSeriesStatus,
  seriesStatusLabel,
  type LessonSeriesStatus,
} from './lessonSeriesStatus'

/** Draft / admin-draft longer than this → red on Admin Home pipeline. */
export const SERIES_DRAFT_STALE_DAYS = 15

export type SeriesPipelineRow = {
  id: string
  title: string
  sortOrder: number
  status: LessonSeriesStatus
  statusLabel: string
  /** True for the latest published (production) series. */
  isProduction: boolean
  /**
   * Days since series created while still in a draft-like status.
   * Null when not draft/admin_draft (no dedicated status-entered-at column).
   */
  daysAsDraft: number | null
  /** True when daysAsDraft > SERIES_DRAFT_STALE_DAYS. */
  draftStale: boolean
}

export type ProductionSeriesPipeline = {
  lastProduction: SeriesPipelineRow | null
  nextTwo: SeriesPipelineRow[]
}

function isDraftLike(status: LessonSeriesStatus): boolean {
  return status === 'admin_draft' || status === 'draft'
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  const days = Math.floor((Date.now() - t) / 86400000)
  return days >= 0 ? days : 0
}

function mapRow(raw: Record<string, unknown>): SeriesPipelineRow {
  const status = normalizeSeriesStatus(
    raw.series_status == null ? null : String(raw.series_status),
  )
  const sortOrder = Number(raw.sort_order ?? 0)
  const daysAsDraft = isDraftLike(status) ? daysSince(raw.created_at as string | null) : null
  return {
    id: String(raw.id),
    title: String(raw.title || 'Untitled').trim() || 'Untitled',
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    status,
    statusLabel: seriesStatusLabel(status),
    isProduction: status === 'published',
    daysAsDraft,
    draftStale: daysAsDraft != null && daysAsDraft > SERIES_DRAFT_STALE_DAYS,
  }
}

/**
 * Latest published series (by catalog sort_order), plus the next two series after it.
 */
export async function fetchProductionSeriesPipeline(
  client: SupabaseClient,
): Promise<{ data: ProductionSeriesPipeline | null; error: string | null }> {
  const { data, error } = await client
    .from('lesson_series')
    .select('id,title,sort_order,series_status,created_at')
    .order('sort_order', { ascending: true })

  if (error) return { data: null, error: error.message }

  const rows = ((data ?? []) as Record<string, unknown>[]).map(mapRow)

  let lastPublishedIndex = -1
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].status === 'published') lastPublishedIndex = i
  }

  if (lastPublishedIndex < 0) {
    return {
      data: {
        lastProduction: null,
        nextTwo: rows.slice(0, 2),
      },
      error: null,
    }
  }

  const lastProduction = { ...rows[lastPublishedIndex], isProduction: true }
  const nextTwo = rows.slice(lastPublishedIndex + 1, lastPublishedIndex + 3).map((r) => ({
    ...r,
    isProduction: false,
  }))

  return { data: { lastProduction, nextTwo }, error: null }
}
