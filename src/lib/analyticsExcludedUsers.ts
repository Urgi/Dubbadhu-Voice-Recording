/**
 * Accounts excluded from product analytics (admin reads + Gemini).
 * Keep in sync with Dubbadhu/constants/analyticsExcludedUserIds.js
 *
 * Operator QA (Urji + Test): `users.lessons_completed` is routinely reset to 0
 * for notification / Speak tests. Not real learners.
 */

/** Urji — operator phone; also internal Speak catalog QA. */
const DEV_EXCLUDED = '7c39d3b7-72f3-4b2d-ad1c-4225404ffb63'

/** Named "Test" operator accounts (same purpose as Urji). */
const OPERATOR_TEST_EXCLUDED = [
  '855fea80-c5e8-449e-9fb4-a9acb0234f1c',
  '60257c41-2874-4229-b3ed-dcae8017c100',
]

/** Family / permanent / incomplete Premium — pollutes paid conversion. */
const FAMILY_PREMIUM_EXCLUDED = [
  '2e7a5bcf-4177-4b6e-a30c-8b9597fa48d0', // Duresa — brother, real sub, won't churn
  '08a5d7a3-ca37-41bf-aec4-128172c4fcef', // Emenet — store flag, no product_id
  'ee2b9039-4612-48bc-83db-70515a5411e1', // Abuye — friend/tester (+16027368695)
]

const DISCUSSION_SEED_EXCLUDED = [
  '2e92c7e8-07b8-4a08-ad7e-14afcfb77ba9', // Abebe
  '92b40eac-6e81-409b-8cc5-128785b441f5', // Chaltu
  '3f5cb579-4e10-431a-bb3a-2d1237e6a8e7', // Tola
  '5def9a13-c341-4ad0-9c3a-1231a4fc659e', // Hanna
  '5f199fec-6958-44ed-b55f-5ebd6fe6b9cc', // Keneni
  '9057a1de-513c-4f46-acb4-0383a1f94ebb', // Birtukan
  '7e53b84c-5c9e-4e2d-8015-a0ab60ec59c6', // Dawit
  '74576bc2-36ed-4be4-b1fa-072b71a6454e', // Sena
  'c2f1b834-997f-420c-a313-d694a5252b06', // Obsaa
  '734aaccc-d088-4a84-bf78-24023fa40ad0', // Lelise
]

export const ANALYTICS_EXCLUDED_USER_IDS = new Set([
  DEV_EXCLUDED,
  ...OPERATOR_TEST_EXCLUDED,
  ...FAMILY_PREMIUM_EXCLUDED,
  ...DISCUSSION_SEED_EXCLUDED,
])

/** Discussion seed accounts known to exist in `users` (inflate registered count). */
export const ANALYTICS_DISCUSSION_SEED_USER_COUNT = DISCUSSION_SEED_EXCLUDED.length

export function isAnalyticsExcludedPhone(phone: string | null | undefined): boolean {
  const digits = String(phone || '')
    .trim()
    .replace(/[^\d+]/g, '')
  return /^\+155591000\d{2}$/.test(digits)
}

export function isAnalyticsExcludedUserId(userId: string | null | undefined): boolean {
  if (!userId) return false
  return ANALYTICS_EXCLUDED_USER_IDS.has(String(userId))
}

export function isAnalyticsExcludedUser(row: {
  id?: string | null
  phone?: string | null
}): boolean {
  if (row.id && isAnalyticsExcludedUserId(row.id)) return true
  if (isAnalyticsExcludedPhone(row.phone)) return true
  return false
}

export function filterAnalyticsEventsForAnalytics<T extends { user_id?: string | null }>(
  rows: T[],
): T[] {
  return rows.filter((row) => !isAnalyticsExcludedUserId(row.user_id ?? null))
}
