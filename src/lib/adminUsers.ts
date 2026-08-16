import type { AnalyticsCountryScope } from './analyticsEventsQuery'
import supabase from './supabase'
import { isAnalyticsExcludedUser } from './analyticsExcludedUsers'

export type AdminRegisteredUserRow = {
  id: string
  phone: string | null
  first_name: string | null
  last_name: string | null
  current_streak: number
  longest_streak: number
  last_activity_date: string | null
  created_at: string
  /** Present on active-today rows: most recent analytics_events.created_at today (Pacific). */
  last_event_at?: string | null
}

function normalizeCountryScope(scope?: AnalyticsCountryScope | null): AnalyticsCountryScope {
  return scope === 'et' || scope === 'non_et' ? scope : 'all'
}

export async function fetchRegisteredUsers(
  limit = 200,
  countryScope: AnalyticsCountryScope = 'all',
): Promise<{
  data: AdminRegisteredUserRow[] | null
  error: string | null
}> {
  const { data, error } = await supabase.rpc('admin_list_registered_users', {
    p_limit: limit,
    p_country_scope: normalizeCountryScope(countryScope),
  })
  if (error) return { data: null, error: error.message }
  const rows = ((data ?? []) as AdminRegisteredUserRow[]).filter(
    (row) => !isAnalyticsExcludedUser(row),
  )
  return { data: rows, error: null }
}

/** Users with any analytics event today (Pacific), most recent first. Caps at 10. */
export async function fetchActiveUsersToday(
  limit = 10,
  countryScope: AnalyticsCountryScope = 'all',
): Promise<{
  data: AdminRegisteredUserRow[] | null
  error: string | null
}> {
  const capped = Math.max(1, Math.min(limit, 10))
  const { data, error } = await supabase.rpc('admin_list_active_users_today', {
    p_limit: capped,
    p_country_scope: normalizeCountryScope(countryScope),
  })
  if (error) return { data: null, error: error.message }
  const rows = ((data ?? []) as AdminRegisteredUserRow[]).filter(
    (row) => !isAnalyticsExcludedUser(row),
  )
  return { data: rows.slice(0, capped), error: null }
}

export function registeredUserDisplayName(row: AdminRegisteredUserRow): string {
  const parts = [row.first_name, row.last_name].filter(Boolean)
  if (parts.length) return parts.join(' ')
  return row.phone ?? row.id.slice(0, 8)
}

/** Params-safe copy of a list row for AdminUserTimeline. */
export function userRowToTimelineParams(row: AdminRegisteredUserRow): AdminRegisteredUserRow {
  return {
    id: row.id,
    phone: row.phone,
    first_name: row.first_name,
    last_name: row.last_name,
    current_streak: row.current_streak ?? 0,
    longest_streak: row.longest_streak ?? 0,
    last_activity_date: row.last_activity_date,
    created_at: row.created_at,
    last_event_at: row.last_event_at,
  }
}
