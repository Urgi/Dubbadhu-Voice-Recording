import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchRegisteredUsers } from './adminUsers'
import { isAnalyticsExcludedUserId } from './analyticsExcludedUsers'

export type RecentSignupFunnelRates = {
  cohortSize: number
  activated: number
  activationPercent: number | null
  activatedThisWeek: number
  premiumConverted: number
  premiumConversionPercent: number | null
  premiumConvertedThisWeek: number
}

/** @deprecated use RecentSignupFunnelRates */
export type RecentSignupActivationRate = {
  cohortSize: number
  activated: number
  percent: number | null
}

type UserPremiumRow = {
  premium_source?: string | null
  premium_product_id?: string | null
  isPremium?: boolean | null
}

function emptyRates(): RecentSignupFunnelRates {
  return {
    cohortSize: 0,
    activated: 0,
    activationPercent: null,
    activatedThisWeek: 0,
    premiumConverted: 0,
    premiumConversionPercent: null,
    premiumConvertedThisWeek: 0,
  }
}

/**
 * Real App Store subscriber: active Premium from store with a product SKU.
 * Excludes complimentary, family/excluded IDs, and incomplete store flags (no product_id).
 */
export function isCleanStoreSubscriber(row: UserPremiumRow | null | undefined): boolean {
  if (!row?.isPremium) return false
  if (String(row.premium_source || '').trim().toLowerCase() !== 'store') return false
  const product = row.premium_product_id != null ? String(row.premium_product_id).trim() : ''
  return product.length > 0
}

/**
 * Activation + paid premium among the newest registered learners (max 50).
 * - Activated = `activation_complete`
 * - Premium = currently a clean store subscriber (isPremium + store + product_id)
 *   Historical `premium_purchased` alone does not count (expired/test buys inflate the rate).
 * - Premium this week = clean store sub who also has `premium_purchased` in the last 7 days
 */
export async function fetchRecentSignupFunnelRates(
  client: SupabaseClient,
  limit = 50,
): Promise<{ data: RecentSignupFunnelRates | null; error: string | null }> {
  const capped = Math.max(1, Math.min(limit, 50))
  const weekAgoMs = Date.now() - 7 * 86400000
  const usersRes = await fetchRegisteredUsers(capped)
  if (usersRes.error) return { data: null, error: usersRes.error }

  const users = (usersRes.data ?? []).slice(0, capped)
  if (users.length === 0) {
    return { data: emptyRates(), error: null }
  }

  const userIds = new Set(users.map((u) => u.id))
  const oldest = users.reduce((min, u) => {
    const t = new Date(u.created_at).getTime()
    return Number.isFinite(t) && t < min ? t : min
  }, Date.now())
  const since = new Date(oldest - 60 * 60 * 1000).toISOString()

  const activated = new Set<string>()
  const activatedThisWeek = new Set<string>()
  const purchasedThisWeek = new Set<string>()
  let offset = 0
  const pageSize = 1000
  const maxRows = 5000
  let eventsError: string | null = null

  while (offset < maxRows) {
    const { data, error } = await client.rpc('admin_fetch_analytics_events', {
      p_since: since,
      p_limit: pageSize,
      p_offset: offset,
    })
    if (error) {
      eventsError = error.message
      break
    }
    const batch = (data ?? []) as Array<{
      user_id: string | null
      event_name: string
      created_at: string
    }>
    if (batch.length === 0) break

    for (const row of batch) {
      const uid = row.user_id == null ? null : String(row.user_id)
      if (!uid || !userIds.has(uid) || isAnalyticsExcludedUserId(uid)) continue
      const at = new Date(row.created_at).getTime()
      const thisWeek = Number.isFinite(at) && at >= weekAgoMs

      if (row.event_name === 'activation_complete') {
        activated.add(uid)
        if (thisWeek) activatedThisWeek.add(uid)
      }
      if (row.event_name === 'premium_purchased' && thisWeek) {
        purchasedThisWeek.add(uid)
      }
    }

    offset += batch.length
    if (batch.length < pageSize) break
  }

  const premium = new Set<string>()
  const premiumThisWeek = new Set<string>()
  for (const user of users) {
    if (isAnalyticsExcludedUserId(user.id)) continue
    const { data, error } = await client.rpc('admin_find_user_by_id', { p_user_id: user.id })
    if (error) continue
    const row = (Array.isArray(data) ? data[0] : data) as UserPremiumRow | undefined
    if (!isCleanStoreSubscriber(row)) continue
    premium.add(user.id)
    if (purchasedThisWeek.has(user.id)) premiumThisWeek.add(user.id)
  }

  const cohortSize = users.length
  return {
    data: {
      cohortSize,
      activated: activated.size,
      activationPercent: cohortSize > 0 ? (activated.size / cohortSize) * 100 : null,
      activatedThisWeek: activatedThisWeek.size,
      premiumConverted: premium.size,
      premiumConversionPercent: cohortSize > 0 ? (premium.size / cohortSize) * 100 : null,
      premiumConvertedThisWeek: premiumThisWeek.size,
    },
    error: eventsError,
  }
}

/** Back-compat wrapper for activation-only callers. */
export async function fetchRecentSignupActivationRate(
  client: SupabaseClient,
  limit = 50,
): Promise<{ data: RecentSignupActivationRate | null; error: string | null }> {
  const res = await fetchRecentSignupFunnelRates(client, limit)
  if (!res.data) return { data: null, error: res.error }
  return {
    data: {
      cohortSize: res.data.cohortSize,
      activated: res.data.activated,
      percent: res.data.activationPercent,
    },
    error: res.error,
  }
}
