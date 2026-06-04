import supabase from './supabase'
import { getVocabBatchSecret } from './expoPublicEnv'

export type FreeAccessUserRow = {
  id: string
  phone: string | null
  first_name: string | null
  last_name: string | null
  isPremium: boolean
  premium_product_id: string | null
  premium_source: string | null
  created_at: string
}

/** Search candidates for `users.phone` (E.164 and common US variants). */
export function phoneLookupVariants(input: string): string[] {
  const raw = String(input || '').trim()
  if (!raw) return []
  const digits = raw.replace(/\D/g, '')
  const out = new Set<string>()
  if (raw.startsWith('+')) out.add(raw)
  if (digits.length === 10) {
    out.add(`+1${digits}`)
    out.add(digits)
    out.add(`${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`)
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    out.add(`+${digits}`)
    out.add(digits.slice(1))
  }
  if (digits.length > 0) out.add(digits)
  out.add(raw)
  return [...out]
}

export async function fetchFreeAccessUsers(limit = 80): Promise<{
  data: FreeAccessUserRow[] | null
  error: string | null
}> {
  const { data, error } = await supabase
    .from('users')
    .select(
      'id, phone, first_name, last_name, isPremium, premium_product_id, premium_source, created_at',
    )
    .eq('premium_source', 'complimentary')
    .eq('isPremium', true)
    .order('premium_granted_at', { ascending: false })
    .limit(limit)

  if (error) {
    if (/premium_granted_at|premium_source/i.test(error.message)) {
      const fallback = await supabase
        .from('users')
        .select(
          'id, phone, first_name, last_name, isPremium, premium_product_id, premium_source, created_at',
        )
        .eq('isPremium', true)
        .is('premium_product_id', null)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (fallback.error) return { data: null, error: fallback.error.message }
      return { data: (fallback.data ?? []) as FreeAccessUserRow[], error: null }
    }
    return { data: null, error: error.message }
  }
  return { data: (data ?? []) as FreeAccessUserRow[], error: null }
}

export async function findUserByPhone(phoneInput: string): Promise<{
  user: FreeAccessUserRow | null
  error: string | null
}> {
  const variants = phoneLookupVariants(phoneInput)
  for (const phone of variants) {
    const { data, error } = await supabase
      .from('users')
      .select(
        'id, phone, first_name, last_name, isPremium, premium_product_id, premium_source, created_at',
      )
      .eq('phone', phone)
      .maybeSingle()
    if (error) return { user: null, error: error.message }
    if (data) return { user: data as FreeAccessUserRow, error: null }
  }
  return { user: null, error: null }
}

type GrantApiResult =
  | { ok: true }
  | { ok: false; error: string }
  | { ok: false; needsConfirm: true; user: FreeAccessUserRow; message: string }

async function invokeAdminGrantPremium(body: Record<string, unknown>): Promise<GrantApiResult> {
  const secret = getVocabBatchSecret()
  if (!secret) {
    return { ok: false, error: 'Missing EXPO_PUBLIC_VOCAB_BATCH_SECRET (or VOCAB_BATCH_SECRET) in admin .env' }
  }

  const { data, error } = await supabase.functions.invoke('admin-grant-premium', {
    body,
    headers: { 'x-admin-premium-secret': secret },
  })

  if (error) {
    return { ok: false, error: error.message || 'invoke_failed' }
  }

  const payload = data as {
    ok?: boolean
    needs_confirm?: boolean
    message?: string
    error?: string
    user_id?: string
  }

  if (payload?.needs_confirm) {
    return {
      ok: false,
      needsConfirm: true,
      user: {
        id: payload.user_id ?? '',
        phone: null,
        first_name: null,
        last_name: null,
        isPremium: true,
        premium_product_id: null,
        premium_source: 'store',
        created_at: '',
      },
      message: payload.message ?? 'User has a store product id.',
    }
  }

  if (payload?.error) {
    return { ok: false, error: payload.error }
  }

  if (payload?.ok) {
    return { ok: true }
  }

  return { ok: false, error: 'unknown_response' }
}

export async function grantFreeAccess(
  userId: string,
  options: { forceClearProductId?: boolean; grantedBy?: string } = {},
): Promise<GrantApiResult> {
  const result = await invokeAdminGrantPremium({
    action: 'grant',
    user_id: userId,
    granted_by: options.grantedBy ?? 'admin_app',
    force: options.forceClearProductId === true,
  })

  if (!result.ok && 'needsConfirm' in result && result.needsConfirm) {
    const { data: row } = await supabase
      .from('users')
      .select(
        'id, phone, first_name, last_name, isPremium, premium_product_id, premium_source, created_at',
      )
      .eq('id', userId)
      .maybeSingle()
    if (row) {
      return {
        ok: false,
        needsConfirm: true,
        user: row as FreeAccessUserRow,
        message: result.message,
      }
    }
  }

  return result
}

export async function revokeFreeAccess(userId: string): Promise<{ ok: boolean; error: string | null }> {
  const result = await invokeAdminGrantPremium({
    action: 'revoke',
    user_id: userId,
    granted_by: 'admin_app',
  })
  if (result.ok) return { ok: true, error: null }
  return { ok: false, error: 'error' in result ? result.error : 'revoke_failed' }
}
