/**
 * Format app promo event_date for the badge (date only — no "Coming" prefix).
 * Keep in sync with learner `utils/formatAppPromoEventDate.js`.
 */
export function formatAppPromoEventDate(raw: string | null | undefined): string | null {
  const s = String(raw || '').trim()
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null

  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  const label = `${day} ${months[month - 1]}`
  const currentYear = new Date().getFullYear()
  if (year !== currentYear) return `${label} ${year}`
  return label
}
