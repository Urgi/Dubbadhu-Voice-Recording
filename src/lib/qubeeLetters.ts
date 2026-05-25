import type { RecordingStatus, RecordingWord } from '../types'

export const QUBEE_RECORDING_SERIES = 'Qubee'
export const QUBEE_RECORDING_LANGUAGE = 'Afaan Oromo'

/** Canonical grid order (not stored in DB). */
export const QUBEE_LETTER_ORDER = [
  'A', 'B', 'C', 'CH', 'D', 'DH', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'NY',
  'O', 'P', 'PH', 'Q', 'R', 'S', 'SH', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
] as const

export type QubeeLetterRow = {
  id: string
  letter: string
  example_word: string
  audio_url: string | null
  status: RecordingStatus
  notes: string | null
  recorded_at: string | null
  created_at?: string
  updated_at?: string
}

export function normalizeQubeeStatus(raw: unknown): RecordingStatus {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'recorded' || s === 'approved' || s === 'rerecord_requested') return s
  if (s === 'rejected') return 'pending'
  return 'pending'
}

export function normalizeQubeeRows(rows: unknown[]): QubeeLetterRow[] {
  return (rows ?? []).map((r) => {
    const row = r as QubeeLetterRow & { slow_audio_url?: string | null; fast_audio_url?: string | null }
    const legacyAudio =
      String(row.audio_url ?? '').trim() ||
      String(row.slow_audio_url ?? '').trim() ||
      String(row.fast_audio_url ?? '').trim() ||
      null
    return {
      id: row.id,
      letter: row.letter,
      example_word: row.example_word,
      audio_url: legacyAudio,
      status: normalizeQubeeStatus(row.status),
      notes: row.notes ?? null,
      recorded_at: row.recorded_at ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  })
}

export function sortQubeeRowsByAppOrder(rows: QubeeLetterRow[]): QubeeLetterRow[] {
  const rank = new Map(QUBEE_LETTER_ORDER.map((l, i) => [l, i]))
  return [...rows].sort((a, b) => {
    const ra = rank.get(String(a.letter).toUpperCase() as (typeof QUBEE_LETTER_ORDER)[number]) ?? 999
    const rb = rank.get(String(b.letter).toUpperCase() as (typeof QUBEE_LETTER_ORDER)[number]) ?? 999
    if (ra !== rb) return ra - rb
    return a.letter.localeCompare(b.letter)
  })
}

/** Map DB row → Recording screen queue item (one take per example word). */
export function qubeeRowToRecordingWord(row: QubeeLetterRow): RecordingWord & { qubeeLetter: string } {
  return {
    id: row.id,
    word: row.example_word,
    qubeeLetter: row.letter,
    series: QUBEE_RECORDING_SERIES,
    language: QUBEE_RECORDING_LANGUAGE,
    slow_audio_url: row.audio_url,
    fast_audio_url: null,
    status: row.status,
    notes: row.notes,
    recorded_at: row.recorded_at,
    created_at: row.created_at ?? new Date(0).toISOString(),
  }
}

/** Display for recording UI (e.g. A → Aa, CH → CH). */
export function formatQubeeLetterDisplay(letter: string): string {
  const raw = String(letter || '').trim()
  if (!raw) return ''
  if (raw.length === 1) {
    return `${raw.toUpperCase()}${raw.toLowerCase()}`
  }
  return raw.toUpperCase()
}
