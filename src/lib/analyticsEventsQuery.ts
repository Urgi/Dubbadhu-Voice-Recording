import type { SupabaseClient } from '@supabase/supabase-js'
import { ANALYTICS_GEMINI_CONTEXT_EVENT_LIMIT } from './geminiEventInsights'
import { isAnalyticsExcludedUserId } from './analyticsExcludedUsers'

export type AnalyticsEventRow = {
  id: string
  user_id: string | null
  event_name: string
  properties: Record<string, unknown> | null
  created_at: string
}

/** PostgREST default max per request; paginate to reach ANALYTICS_GEMINI_CONTEXT_EVENT_LIMIT. */
const FETCH_PAGE_SIZE = 1000

function normalizeAnalyticsEventRow(raw: Record<string, unknown>): AnalyticsEventRow {
  return {
    id: String(raw.id ?? ''),
    user_id: raw.user_id == null ? null : String(raw.user_id),
    event_name: String(raw.event_name ?? ''),
    properties: (raw.properties as Record<string, unknown> | null) ?? null,
    created_at: String(raw.created_at ?? ''),
  }
}

/** Newest analytics_events rows for Gemini context (up to limit, paginated when needed). */
export async function fetchRecentAnalyticsEventsForGemini(
  client: SupabaseClient,
  limit = ANALYTICS_GEMINI_CONTEXT_EVENT_LIMIT,
): Promise<{ data: AnalyticsEventRow[]; error: string | null }> {
  const cap = Math.max(1, Math.min(limit, ANALYTICS_GEMINI_CONTEXT_EVENT_LIMIT))
  const rows: AnalyticsEventRow[] = []
  let offset = 0
  /** Extra pages allowed while skipping excluded seed/dev accounts. */
  const maxOffset = cap * 3

  while (rows.length < cap && offset < maxOffset) {
    const pageSize = Math.min(FETCH_PAGE_SIZE, Math.max(cap - rows.length, 200))
    const { data, error } = await client.rpc('admin_fetch_analytics_events', {
      p_since: null,
      p_limit: pageSize,
      p_offset: offset,
    })

    if (error) {
      return { data: rows, error: error.message }
    }

    const batch = ((data ?? []) as Record<string, unknown>[]).map((row) =>
      normalizeAnalyticsEventRow(row),
    )
    if (batch.length === 0) break

    for (const row of batch) {
      if (isAnalyticsExcludedUserId(row.user_id)) continue
      rows.push(row)
      if (rows.length >= cap) break
    }

    offset += batch.length
    if (batch.length < pageSize) break
  }

  return { data: rows, error: null }
}

/** Newest analytics_events for one user (admin Registered → timeline). */
export async function fetchUserAnalyticsEvents(
  client: SupabaseClient,
  userId: string,
  limit = 20,
): Promise<{ data: AnalyticsEventRow[]; error: string | null }> {
  const uid = String(userId || '').trim()
  if (!uid) return { data: [], error: 'Missing user id' }

  const cap = Math.max(1, Math.min(limit, 100))
  const { data, error } = await client.rpc('admin_fetch_user_analytics_events', {
    p_user_id: uid,
    p_limit: cap,
  })

  if (error) {
    return { data: [], error: error.message }
  }

  const rows = ((data ?? []) as Record<string, unknown>[]).map((row) =>
    normalizeAnalyticsEventRow(row),
  )
  return { data: rows, error: null }
}
