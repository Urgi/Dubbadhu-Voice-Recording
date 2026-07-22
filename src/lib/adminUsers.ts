import supabase from './supabase'

export type AdminRegisteredUserRow = {
  id: string
  phone: string | null
  first_name: string | null
  last_name: string | null
  current_streak: number
  longest_streak: number
  last_activity_date: string | null
  created_at: string
}

export async function fetchRegisteredUsers(limit = 200): Promise<{
  data: AdminRegisteredUserRow[] | null
  error: string | null
}> {
  const { data, error } = await supabase.rpc('admin_list_registered_users', {
    p_limit: limit,
  })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as AdminRegisteredUserRow[], error: null }
}

export function registeredUserDisplayName(row: AdminRegisteredUserRow): string {
  const parts = [row.first_name, row.last_name].filter(Boolean)
  if (parts.length) return parts.join(' ')
  return row.phone ?? row.id.slice(0, 8)
}
