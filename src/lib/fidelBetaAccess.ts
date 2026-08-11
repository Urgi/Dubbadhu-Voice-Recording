import supabase from './supabase'
import { findUserByPhone, freeAccessDisplayName } from './freeAccessUsers'

export type FidelBetaRow = {
  user_id: string
  phone: string | null
  note: string
  created_at: string
  first_name?: string | null
  last_name?: string | null
}

export { findUserByPhone, freeAccessDisplayName }

export async function fetchFidelBetaUsers(): Promise<{
  data: FidelBetaRow[] | null
  error: string | null
}> {
  const { data, error } = await supabase
    .from('fidel_beta_access')
    .select('user_id, phone, note, created_at')
    .order('created_at', { ascending: false })

  if (error) return { data: null, error: error.message }

  const rows = (data ?? []) as Omit<FidelBetaRow, 'first_name' | 'last_name'>[]
  if (rows.length === 0) return { data: [], error: null }

  const ids = rows.map((r) => r.user_id)
  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id, first_name, last_name, phone')
    .in('id', ids)

  if (usersErr) {
    // Still return allowlist rows without names
    return { data: rows, error: null }
  }

  const byId = new Map(
    (users ?? []).map((u: { id: string; first_name: string | null; last_name: string | null; phone: string | null }) => [
      u.id,
      u,
    ]),
  )

  return {
    data: rows.map((r) => {
      const u = byId.get(r.user_id)
      return {
        ...r,
        phone: r.phone ?? u?.phone ?? null,
        first_name: u?.first_name ?? null,
        last_name: u?.last_name ?? null,
      }
    }),
    error: null,
  }
}

export async function grantFidelBetaAccess(args: {
  userId: string
  phone?: string | null
  note?: string
}): Promise<{ ok: boolean; error?: string }> {
  const userId = String(args.userId ?? '').trim()
  if (!userId) return { ok: false, error: 'Missing user id' }

  const { error } = await supabase.from('fidel_beta_access').upsert(
    {
      user_id: userId,
      phone: args.phone?.trim() || null,
      note: String(args.note ?? '').trim(),
    },
    { onConflict: 'user_id' },
  )

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function revokeFidelBetaAccess(
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const id = String(userId ?? '').trim()
  if (!id) return { ok: false, error: 'Missing user id' }

  const { error } = await supabase.from('fidel_beta_access').delete().eq('user_id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export function fidelBetaDisplayName(row: {
  user_id: string
  phone?: string | null
  note?: string | null
  first_name?: string | null
  last_name?: string | null
}): string {
  return freeAccessDisplayName({
    id: row.user_id,
    phone: row.phone,
    first_name: row.first_name,
    last_name: row.last_name,
  })
}
