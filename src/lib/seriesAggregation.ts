import type { RecordingStatus } from '../types'

export type WordAggRow = {
  series: string
  language: string
  status: RecordingStatus
}

export type SeriesSummary = {
  key: string
  series: string
  language: string
  pending: number
  recorded: number
  approved: number
  rerecordRequested: number
  total: number
}

/** Group word rows into per-series/language summaries (same logic as Word Manager). */
export function aggregateWordRows(rows: WordAggRow[]): SeriesSummary[] {
  const map = new Map<
    string,
    {
      series: string
      language: string
      pending: number
      recorded: number
      approved: number
      rerecordRequested: number
      total: number
    }
  >()

  for (const row of rows) {
    const key = `${row.series}\u0000${row.language}`
    let entry = map.get(key)
    if (!entry) {
      entry = {
        series: row.series,
        language: row.language,
        pending: 0,
        recorded: 0,
        approved: 0,
        rerecordRequested: 0,
        total: 0,
      }
      map.set(key, entry)
    }
    entry.total += 1
    if (row.status === 'pending') entry.pending += 1
    else if (row.status === 'recorded') entry.recorded += 1
    else if (row.status === 'approved') entry.approved += 1
    else if (row.status === 'rerecord_requested') entry.rerecordRequested += 1
  }

  return Array.from(map.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => a.series.localeCompare(b.series) || a.language.localeCompare(b.language))
}
