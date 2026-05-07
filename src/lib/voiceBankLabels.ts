/**
 * Voice bank (`words` table) conventions: canonical series label + display language string.
 * Full curriculum titles live on `lesson_series.title`; lessons use the same canonical `series` string in JSON.
 */

export const VOICE_BANK_LANGUAGE = 'Afaan Oromo'

/**
 * Canonical `words.series` for merged vocabulary rows (lesson vocab); excluded from the voice recording queue.
 */
export const VOCABULARY_MERGED_SERIES = 'Vocabulary'

/** Normalized key for matching `lesson_series.id` (e.g. series2) to `words.series` (e.g. "Series 2"). */
export function seriesKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '')
}

/**
 * `words.series` and `lesson.content.series`: "Series 2" when id is series2.
 * Non-matching ids fall back to the trimmed id (legacy / custom slugs).
 */
export function wordsBankSeriesLabelFromSeriesId(seriesId: string): string {
  const id = seriesId.trim()
  const m = id.match(/^series(\d+)$/i)
  if (m) return `Series ${parseInt(m[1], 10)}`
  return id || 'Series'
}

/** Values that may already exist in DB from older rows; use with `.in('language', …)`. */
export function voiceBankLanguageSqlValues(): string[] {
  const v = VOICE_BANK_LANGUAGE
  const out = new Set<string>([v, v.toLowerCase()])
  return [...out]
}
