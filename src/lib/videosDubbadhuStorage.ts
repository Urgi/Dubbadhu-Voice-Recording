import supabase from './supabase'

/** Must match Supabase bucket id exactly (dashboard: Videos-Dubbadhu). Listing needs RLS: sql/storage_videos_dubbadhu_anon_list.sql */
export const VIDEOS_DUBBADHU_BUCKET = 'Videos-Dubbadhu'

function isVideoStorageObjectFile(f: { name: string; id?: string | null }): boolean {
  const name = f.name
  if (!name || name.endsWith('/')) return false
  if (f.id != null && String(f.id).length > 0) return true
  return /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(name)
}

/**
 * List video-like objects in the public learner bucket (root + shallow folders).
 */
export async function listVideosDubbadhuBucket(): Promise<{
  names: string[]
  error: string
  rawCount: number
}> {
  const bucket = VIDEOS_DUBBADHU_BUCKET
  const { data, error } = await supabase.storage.from(bucket).list('', { limit: 1000 })
  if (error) {
    return { names: [], error: error.message, rawCount: 0 }
  }
  const dataRows = data ?? []
  const fileRows = dataRows.map((f) => ({
    name: String(f.name ?? '').trim(),
    id: (f as { id?: string | null }).id,
  }))

  let names = fileRows.filter(isVideoStorageObjectFile).map((f) => f.name)

  if (names.length === 0 && dataRows.length > 0) {
    const folderPrefixes = fileRows
      .filter((f) => f.name && (f.id == null || f.id === '') && !f.name.includes('.'))
      .map((f) => f.name)
    for (const prefix of folderPrefixes.slice(0, 12)) {
      const nested = await supabase.storage.from(bucket).list(prefix, { limit: 500 })
      if (nested.error) continue
      const nestedRows = (nested.data ?? []).map((f) => ({
        name: String(f.name ?? '').trim(),
        id: (f as { id?: string | null }).id,
      }))
      for (const row of nestedRows.filter(isVideoStorageObjectFile)) {
        names.push(`${prefix}/${row.name}`)
      }
    }
    names = [...new Set(names)].sort((a, b) => a.localeCompare(b))
  } else {
    names = names.sort((a, b) => a.localeCompare(b))
  }

  return { names, error: '', rawCount: dataRows.length }
}

export function publicUrlForVideosDubbadhuObject(name: string): string {
  const { data } = supabase.storage.from(VIDEOS_DUBBADHU_BUCKET).getPublicUrl(name)
  return data.publicUrl
}
