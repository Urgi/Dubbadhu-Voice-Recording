/** SDK 55+: `readAsStringAsync` lives on the legacy export; main entry throws a deprecation error at runtime. */
import * as FileSystem from 'expo-file-system/legacy'
import supabase from './supabase'

/** Safe folder/file segment for storage paths */
export function slugSegment(s: string, max = 80): string {
  const t = s
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s/]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, max)
  return t || 'series'
}

/**
 * Read local file as base64, upload to `voice-recordings` bucket.
 * Paths: `{seriesSlug}/{wordId}_slow.m4a` and `_fast.m4a`
 */
export async function uploadVoiceM4a(localUri: string, storagePath: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' })
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)

  const { error } = await supabase.storage.from('voice-recordings').upload(storagePath, bytes, {
    contentType: 'audio/mp4',
    upsert: true,
  })
  if (error) throw error

  const { data } = supabase.storage.from('voice-recordings').getPublicUrl(storagePath)
  return data.publicUrl
}

export function voiceStoragePaths(wordId: string, series: string) {
  const folder = slugSegment(series)
  return {
    slow: `${folder}/${wordId}_slow.m4a`,
    fast: `${folder}/${wordId}_fast.m4a`,
  }
}
