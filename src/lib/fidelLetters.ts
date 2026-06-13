import type { RecordingStatus, RecordingWord } from '../types'

export const FIDEL_RECORDING_SERIES = 'Fidel'
export const FIDEL_RECORDING_LANGUAGE = 'Amharic'

/** Canonical chart row order (main chart then labialized appendix). */
export const FIDEL_CONSONANT_ORDER = [
  'he', 'le', 'hhe', 'me', 'se-legacy', 're', 'se', 'she', 'qe', 'be', 've', 'te', 'che', 'hha', 'ne', 'nye',
  'aleph', 'ke', 'khe', 'we', 'ayin', 'ze', 'zhe', 'ye', 'de', 'je', 'ge', 'te-ej', 'che-ej', 'pe-ej', 'tse',
  'tse-alt', 'fe', 'pe', 'qwe', 'hwe', 'gwe',
] as const

export type FidelLetterRow = {
  id: string
  symbol: string
  consonant_key: string
  vowel_order: number
  english_sound: string
  family_name: string
  example_word: string | null
  chart_key: string
  audio_url: string | null
  status: RecordingStatus
  notes: string | null
  recorded_at: string | null
  created_at?: string
  updated_at?: string
}

export function normalizeFidelStatus(raw: unknown): RecordingStatus {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'recorded' || s === 'approved' || s === 'rerecord_requested') return s
  if (s === 'rejected') return 'pending'
  return 'pending'
}

export function normalizeFidelRows(rows: unknown[]): FidelLetterRow[] {
  return (rows ?? []).map((r) => {
    const row = r as FidelLetterRow
    return {
      id: row.id,
      symbol: row.symbol,
      consonant_key: row.consonant_key,
      vowel_order: Number(row.vowel_order),
      english_sound: row.english_sound,
      family_name: row.family_name,
      example_word: row.example_word ?? null,
      chart_key: row.chart_key,
      audio_url: String(row.audio_url ?? '').trim() || null,
      status: normalizeFidelStatus(row.status),
      notes: row.notes ?? null,
      recorded_at: row.recorded_at ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  })
}

export function sortFidelRowsByChartOrder(rows: FidelLetterRow[]): FidelLetterRow[] {
  const rank = new Map(FIDEL_CONSONANT_ORDER.map((key, i) => [key, i]))
  return [...rows].sort((a, b) => {
    const ra = rank.get(a.consonant_key as (typeof FIDEL_CONSONANT_ORDER)[number]) ?? 999
    const rb = rank.get(b.consonant_key as (typeof FIDEL_CONSONANT_ORDER)[number]) ?? 999
    if (ra !== rb) return ra - rb
    if (a.vowel_order !== b.vowel_order) return a.vowel_order - b.vowel_order
    return a.symbol.localeCompare(b.symbol)
  })
}

/** Map DB row → Recording screen queue item (one syllable clip). */
export function fidelRowToRecordingWord(row: FidelLetterRow): RecordingWord & { fidelSymbol: string } {
  return {
    id: row.id,
    word: row.english_sound,
    fidelSymbol: row.symbol,
    series: FIDEL_RECORDING_SERIES,
    language: FIDEL_RECORDING_LANGUAGE,
    slow_audio_url: row.audio_url,
    fast_audio_url: null,
    status: row.status,
    notes: row.notes,
    recorded_at: row.recorded_at,
    created_at: row.created_at ?? new Date(0).toISOString(),
  }
}
