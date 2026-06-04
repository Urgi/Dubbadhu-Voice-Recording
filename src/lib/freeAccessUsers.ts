import supabase from './supabase'

export type FreeAccessUserRow = {
  id: string
  phone: string | null
  first_name: string | null
  last_name: string | null
  isPremium: boolean
  premium_product_id: string | null
  created_at: string
}

/** Complimentary premium: `isPremium` without a store product mirror. */
export function isFreeAccessRow(row: {
  isPremium?: boolean | null
  premium_product_id?: string | null
}): boolean {
  const premium =
    row.isPremium === true || row.isPremium === 1 || String(row.isPremium) === 'true'
  const ppid = row.premium_product_id
  return premium && (ppid == null || String(ppid).trim() === '')
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
    .select('id, phone, first_name, last_name, isPremium, premium_product_id, created_at')
    .eq('isPremium', true)
    .is('premium_product_id', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return { data: null, error: error.message }
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
      .select('id, phone, first_name, last_name, isPremium, premium_product_id, created_at')
      .eq('phone', phone)
      .maybeSingle()
    if (error) return { user: null, error: error.message }
    if (data) return { user: data as FreeAccessUserRow, error: null }
  }
  return { user: null, error: null }
}

export type GrantFreeAccessResult =
  | { ok: true }
  | { ok: false; error: string }
  | { ok: false; needsConfirm: true; user: FreeAccessUserRow; message: string }

/**
 * Complimentary access: `isPremium` true, clear RevenueCat mirror fields (null ppid).
 */
export async function grantFreeAccess(
  userId: string,
  options: { forceClearProductId?: boolean } = {},
): Promise<GrantFreeAccessResult> {
  const { data: row, error: fetchErr } = await supabase
    .from('users')
    .select('id, phone, first_name, last_name, isPremium, premium_product_id, created_at')
    .eq('id', userId)
    .maybeSingle()

  if (fetchErr) return { ok: false, error: fetchErr.message }
  if (!row) return { ok: false, error: 'User not found' }

  const user = row as FreeAccessUserRow
  const existingPpid =
    user.premium_product_id != null && String(user.premium_product_id).trim() !== ''

  if (existingPpid && !options.forceClearProductId) {
    return {
      ok: false,
      needsConfirm: true,
      user,
      message:
        `This user has a store product id (${user.premium_product_id}). ` +
        'Free access clears premium_product_id so the learner app will not client-downgrade them. Continue?',
    }
  }

  if (isFreeAccessRow(user)) {
    return { ok: true }
  }

  const { error: updateErr } = await supabase
    .from('users')
    .update({
      isPremium: true,
      premium_product_id: null,
      premium_will_renew: null,
      premium_expires_at: null,
    })
    .eq('id', userId)

  if (updateErr) return { ok: false, error: updateErr.message }
  return { ok: true }
}

export async function revokeFreeAccess(userId: string): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase
    .from('users')
    .update({
      isPremium: false,
      premium_product_id: null,
      premium_will_renew: null,
      premium_expires_at: null,
    })
    .eq('id', userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, error: null }
}
