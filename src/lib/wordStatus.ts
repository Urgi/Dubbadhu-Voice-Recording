import type { RecordingStatus, RecordingWord } from '../types'

/**
 * The app no longer uses `rejected`. If Supabase still has legacy rows with that status,
 * treat them as pending so they show in the voice queue and admin counts correctly.
 */
export function normalizeRecordingStatus(raw: unknown): RecordingStatus {
  const s = typeof raw === 'string' ? raw : String(raw)
  if (s === 'rejected') return 'pending'
  return s as RecordingStatus
}

export function normalizeRecordingWords(rows: unknown): RecordingWord[] {
  if (!Array.isArray(rows)) return []
  return rows.map((row) => {
    const w = row as RecordingWord
    return { ...w, status: normalizeRecordingStatus((row as { status?: unknown }).status) }
  })
}
