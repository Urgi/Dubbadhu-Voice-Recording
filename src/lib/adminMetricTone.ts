/**
 * Admin metric color standards — early language-learning, first month of production.
 *
 * Goal context: reach ~300 paid users / month by month 6.
 * Early consumer LL apps typically see roughly:
 * - Registered total (month 1): ≥200 good · 80–199 neutral · <80 bad
 *   (thin base can’t scale to ~300 paid/mo by m6 without a step-change in signups)
 * - Activation (first-lesson / aha): ~20–40% of signups
 * - Signup → paid: ~2–5% early; ≥5% is strong while volume is still small
 *
 * Month-1 paid pace on a ramp to 300/mo by m6 (geometric-ish):
 * ~25–40 paid in month 1 → about 6–10 paid / week once the month is moving.
 * Early weeks can be quieter; 0 paid while new learners sign up is a miss.
 * Weekly registered: ≥15 green (pace toward an 80–200 base); 1–14 white; 0 white.
 *
 * Tone → color:
 * - good    → green  (#30d158)
 * - neutral → white  (#ffffff)
 * - bad     → red    (#ff453a)
 */

export type MetricTone = 'good' | 'neutral' | 'bad'

export const METRIC_TONE_COLOR: Record<MetricTone, string> = {
  good: '#30d158',
  neutral: '#ffffff',
  bad: '#ff453a',
}

/** Last-≤50 signup activation rate (activation_complete). */
export const ACTIVATION_PCT_GOOD = 35
export const ACTIVATION_PCT_OK = 20

/** Last-≤50 signup → paid rate (premium_purchased, excl. complimentary). */
export const PREMIUM_PCT_GOOD = 5
export const PREMIUM_PCT_OK = 2

/**
 * Weekly paid conversions on an early path to ~300 paid/mo by month 6.
 * ~6+/week ≈ month-1 pace; 1–5 is building; 0 with signups is a miss.
 */
export const PREMIUM_WEEKLY_GOOD = 6
export const PREMIUM_WEEKLY_OK = 1

/**
 * Weekly activations vs new signups this week.
 * Early LL: aim for at least ~25% of this week’s signups to activate.
 */
export const ACTIVATION_WEEKLY_VS_SIGNUPS_GOOD = 0.25

/**
 * Weekly new signups (month 1).
 * At ~+4/week you barely crawl toward an 80–200 registered base.
 * ≥15/week ≈ on pace to build that base in the first 1–2 months.
 */
export const REGISTERED_WEEKLY_GOOD = 15
export const REGISTERED_WEEKLY_OK = 1

export function toneForWeeklyRegisteredDelta(n: number | null | undefined): MetricTone {
  if (n == null || !Number.isFinite(n)) return 'neutral'
  if (n < 0) return 'bad'
  if (n >= REGISTERED_WEEKLY_GOOD) return 'good'
  if (n >= REGISTERED_WEEKLY_OK) return 'neutral'
  return 'neutral'
}

export function toneForWeeklyActivationDelta(
  activatedThisWeek: number | null | undefined,
  signupsThisWeek: number | null | undefined,
): MetricTone {
  const a = activatedThisWeek ?? 0
  const s = signupsThisWeek ?? 0
  if (!Number.isFinite(a)) return 'neutral'
  if (a < 0) return 'bad'
  if (s > 0 && a === 0) return 'bad'
  if (s > 0) {
    const ratio = a / s
    if (ratio >= ACTIVATION_WEEKLY_VS_SIGNUPS_GOOD) return 'good'
    if (a > 0) return 'neutral'
    return 'bad'
  }
  // No new signups this week: any activation is still good (older cohort catching up).
  if (a > 0) return 'good'
  return 'neutral'
}

export function toneForWeeklyPremiumDelta(
  paidThisWeek: number | null | undefined,
  signupsThisWeek: number | null | undefined,
): MetricTone {
  const p = paidThisWeek ?? 0
  const s = signupsThisWeek ?? 0
  if (!Number.isFinite(p)) return 'neutral'
  if (p < 0) return 'bad'
  if (p >= PREMIUM_WEEKLY_GOOD) return 'good'
  if (p >= PREMIUM_WEEKLY_OK) return 'neutral'
  if (s > 0 && p === 0) return 'bad'
  return 'neutral'
}

export function toneForActivationPercent(pct: number | null | undefined): MetricTone {
  if (pct == null || !Number.isFinite(pct)) return 'neutral'
  if (pct >= ACTIVATION_PCT_GOOD) return 'good'
  if (pct < ACTIVATION_PCT_OK) return 'bad'
  return 'neutral'
}

export function toneForPremiumPercent(pct: number | null | undefined): MetricTone {
  if (pct == null || !Number.isFinite(pct)) return 'neutral'
  if (pct >= PREMIUM_PCT_GOOD) return 'good'
  if (pct < PREMIUM_PCT_OK) return 'bad'
  return 'neutral'
}

/**
 * Cumulative registered learners (excl. analytics-excluded seeds).
 * Month-1 base for an early LL app that must later support ~300 paid/mo:
 * at ~3–5% signup→paid you eventually need thousands of signups/month,
 * so a thin first-month base (<80) is behind; ≥200 is a solid launch month.
 */
export const REGISTERED_TOTAL_GOOD = 200
export const REGISTERED_TOTAL_OK = 80

export function toneForRegisteredTotal(total: number | null | undefined): MetricTone {
  if (total == null || !Number.isFinite(total)) return 'neutral'
  if (total >= REGISTERED_TOTAL_GOOD) return 'good'
  if (total < REGISTERED_TOTAL_OK) return 'bad'
  return 'neutral'
}

/** @deprecated use toneForWeeklyRegisteredDelta */
export function toneForWeeklyDelta(
  n: number | null | undefined,
  opts?: { treatZeroAsBad?: boolean },
): MetricTone {
  if (n == null || !Number.isFinite(n)) return 'neutral'
  if (n > 0) return 'good'
  if (n < 0) return 'bad'
  return opts?.treatZeroAsBad ? 'bad' : 'neutral'
}

export function toneColorName(tone: MetricTone): string {
  if (tone === 'good') return 'Green'
  if (tone === 'bad') return 'Red'
  return 'White'
}

export type MetricColorExplanation = {
  title: string
  message: string
}

function toneSentence(tone: MetricTone): string {
  return `Showing ${toneColorName(tone).toLowerCase()} (${tone}).`
}

/**
 * Long-press copy for Admin Home analytics metric cards.
 * Benchmarks: early LL, month 1, path to ~300 paid/mo by month 6.
 */
export function explainRegisteredMetric(args: {
  total: number | null
  thisWeek: number | null
}): MetricColorExplanation {
  const totalTone = toneForRegisteredTotal(args.total)
  const weekTone = toneForWeeklyRegisteredDelta(args.thisWeek)
  const total = args.total
  const week = args.thisWeek

  let totalWhy: string
  if (total == null) totalWhy = 'Total is unavailable.'
  else if (totalTone === 'good') {
    totalWhy = `${total} registered is ≥${REGISTERED_TOTAL_GOOD} — solid month-1 base toward volume for ~300 paid/mo by month 6.`
  } else if (totalTone === 'bad') {
    totalWhy = `${total} registered is <${REGISTERED_TOTAL_OK} — too thin to scale toward ~300 paid/mo without a step-change in signups.`
  } else {
    totalWhy = `${total} registered is between ${REGISTERED_TOTAL_OK}–${REGISTERED_TOTAL_GOOD - 1} — building, not yet a strong launch base.`
  }

  let weekWhy: string
  if (week == null) weekWhy = 'Weekly signups unavailable.'
  else if (weekTone === 'good') {
    weekWhy = `+${week} this week ≥${REGISTERED_WEEKLY_GOOD} — on pace to build an 80–200 registered base in the first 1–2 months.`
  } else if (weekTone === 'bad') {
    weekWhy = `Weekly change is negative.`
  } else if (week >= REGISTERED_WEEKLY_OK) {
    weekWhy = `+${week} this week is growth, but under ${REGISTERED_WEEKLY_GOOD}/week — too slow to reach a solid month-1 base toward ~300 paid/mo by month 6 (white).`
  } else {
    weekWhy = `+0 this week — flat signup growth (white).`
  }

  return {
    title: 'Registered color',
    message: [
      `Total number: ${toneSentence(totalTone)}`,
      totalWhy,
      '',
      `“+N this week”: ${toneSentence(weekTone)}`,
      weekWhy,
      '',
      `Benchmarks (month 1): total ≥${REGISTERED_TOTAL_GOOD} green · ${REGISTERED_TOTAL_OK}–${REGISTERED_TOTAL_GOOD - 1} white · <${REGISTERED_TOTAL_OK} red. Weekly: ≥${REGISTERED_WEEKLY_GOOD} green · ${REGISTERED_WEEKLY_OK}–${REGISTERED_WEEKLY_GOOD - 1} white · 0 white.`,
    ].join('\n'),
  }
}

export function explainActivationMetric(args: {
  percent: number | null
  activatedThisWeek: number | null
  signupsThisWeek: number | null
  activated: number | null
  cohortSize: number | null
}): MetricColorExplanation {
  const pctTone = toneForActivationPercent(args.percent)
  const weekTone = toneForWeeklyActivationDelta(args.activatedThisWeek, args.signupsThisWeek)
  const pct = args.percent
  const aWeek = args.activatedThisWeek ?? 0
  const sWeek = args.signupsThisWeek ?? 0

  let pctWhy: string
  if (pct == null) pctWhy = 'Activation rate unavailable.'
  else if (pctTone === 'good') {
    pctWhy = `${pct.toFixed(0)}% ≥${ACTIVATION_PCT_GOOD}% — strong early LL activation (first-lesson / aha).`
  } else if (pctTone === 'bad') {
    pctWhy = `${pct.toFixed(0)}% <${ACTIVATION_PCT_OK}% — below early LL floor; too many signups stall before the first lesson.`
  } else {
    pctWhy = `${pct.toFixed(0)}% is in the ${ACTIVATION_PCT_OK}–${ACTIVATION_PCT_GOOD - 1}% band — acceptable early, not yet strong.`
  }
  if (args.activated != null && args.cohortSize != null) {
    pctWhy += ` (${args.activated}/${args.cohortSize} of last ≤50 signups).`
  }

  let weekWhy: string
  if (sWeek > 0 && aWeek === 0) {
    weekWhy = `${sWeek} signup(s) this week but 0 activations — miss (red).`
  } else if (sWeek > 0) {
    const ratio = aWeek / sWeek
    const pctOfSignups = Math.round(ratio * 100)
    if (weekTone === 'good') {
      weekWhy = `+${aWeek} activations vs ${sWeek} signups (${pctOfSignups}%) — ≥${Math.round(ACTIVATION_WEEKLY_VS_SIGNUPS_GOOD * 100)}% of this week’s signups activated (green).`
    } else {
      weekWhy = `+${aWeek} activations vs ${sWeek} signups (${pctOfSignups}%) — under ${Math.round(ACTIVATION_WEEKLY_VS_SIGNUPS_GOOD * 100)}% of weekly signups (white).`
    }
  } else if (aWeek > 0) {
    weekWhy = `+${aWeek} activations with no new signups — older cohort catching up (green).`
  } else {
    weekWhy = `No activations and no signups this week (white).`
  }

  return {
    title: 'Activation color',
    message: [
      `Rate: ${toneSentence(pctTone)}`,
      pctWhy,
      '',
      `“+N this week”: ${toneSentence(weekTone)}`,
      weekWhy,
      '',
      `Benchmarks: rate ≥${ACTIVATION_PCT_GOOD}% green · ${ACTIVATION_PCT_OK}–${ACTIVATION_PCT_GOOD - 1}% white · <${ACTIVATION_PCT_OK}% red. Weekly: ≥${Math.round(ACTIVATION_WEEKLY_VS_SIGNUPS_GOOD * 100)}% of new signups activate → green; 0 activations with signups → red.`,
    ].join('\n'),
  }
}

export function explainPremiumMetric(args: {
  percent: number | null
  paidThisWeek: number | null
  signupsThisWeek: number | null
  paid: number | null
  cohortSize: number | null
}): MetricColorExplanation {
  const pctTone = toneForPremiumPercent(args.percent)
  const weekTone = toneForWeeklyPremiumDelta(args.paidThisWeek, args.signupsThisWeek)
  const pct = args.percent
  const pWeek = args.paidThisWeek ?? 0
  const sWeek = args.signupsThisWeek ?? 0

  let pctWhy: string
  if (pct == null) pctWhy = 'Premium rate unavailable.'
  else if (pctTone === 'good') {
    pctWhy = `${pct.toFixed(0)}% ≥${PREMIUM_PCT_GOOD}% — strong early signup→paid for consumer LL.`
  } else if (pctTone === 'bad') {
    pctWhy = `${pct.toFixed(0)}% <${PREMIUM_PCT_OK}% — below early paid-conversion floor on the path to ~300 paid/mo by month 6.`
  } else {
    pctWhy = `${pct.toFixed(0)}% is in the ${PREMIUM_PCT_OK}–${PREMIUM_PCT_GOOD - 1}% band — typical early LL paid conversion.`
  }
  if (args.paid != null && args.cohortSize != null) {
    pctWhy += ` (${args.paid}/${args.cohortSize} clean App Store subs in last ≤50; family/free/incomplete store flags excluded).`
  }

  let weekWhy: string
  if (pWeek >= PREMIUM_WEEKLY_GOOD) {
    weekWhy = `+${pWeek} paid this week — on month-1 pace toward ~300 paid/mo by month 6 (≥${PREMIUM_WEEKLY_GOOD}/week).`
  } else if (pWeek >= PREMIUM_WEEKLY_OK) {
    weekWhy = `+${pWeek} paid this week — building (${PREMIUM_WEEKLY_OK}–${PREMIUM_WEEKLY_GOOD - 1}/week is white).`
  } else if (sWeek > 0 && pWeek === 0) {
    weekWhy = `${sWeek} signup(s) this week but 0 new clean paid subs — miss (red).`
  } else {
    weekWhy = `+0 paid this week and no signup pressure to convert (white).`
  }

  return {
    title: 'Premium color',
    message: [
      `Rate: ${toneSentence(pctTone)}`,
      pctWhy,
      '',
      `“+N this week”: ${toneSentence(weekTone)}`,
      weekWhy,
      '',
      `Benchmarks: rate ≥${PREMIUM_PCT_GOOD}% green · ${PREMIUM_PCT_OK}–${PREMIUM_PCT_GOOD - 1}% white · <${PREMIUM_PCT_OK}% red. Weekly paid: ≥${PREMIUM_WEEKLY_GOOD} green · ${PREMIUM_WEEKLY_OK}–${PREMIUM_WEEKLY_GOOD - 1} white · 0 with signups red. Only current store Premium with a product id counts.`,
    ].join('\n'),
  }
}
