/** Keep in sync with learner `utils/appPromoNavigation.js` and DB CHECK on app_promos.cta_target. */
export const APP_PROMO_CTA_TARGETS = [
  { key: 'home', label: 'Home tab' },
  { key: 'speak', label: 'Speak tab' },
  { key: 'practice', label: 'Practice tab' },
  { key: 'vocab', label: 'Vocab tab' },
  { key: 'profile', label: 'Profile tab' },
  { key: 'songs', label: 'Songs' },
  { key: 'community', label: 'Lesson Discussions' },
  { key: 'friends', label: 'Friends' },
  { key: 'subscription', label: 'Subscription' },
] as const

export type AppPromoCtaTarget = (typeof APP_PROMO_CTA_TARGETS)[number]['key']

export function labelForPromoCtaTarget(key: string | null | undefined): string {
  if (!key) return 'None'
  const found = APP_PROMO_CTA_TARGETS.find((t) => t.key === key)
  return found?.label || key
}
