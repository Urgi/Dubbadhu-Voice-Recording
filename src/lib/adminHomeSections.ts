import type { StackNavigationProp } from '@react-navigation/stack'
import type { RootStackParamList } from '../types'

export type AdminHomeSectionId = 'analytics' | 'assets' | 'moderation'

export type AdminHomeCounts = {
  usersTotal: number | null
  freeAccessCount: number | null
  /** Display names for complimentary Premium users (hub Free access card). */
  freeAccessNames: string[]
  seriesTotal: number | null
  unapprovedSeriesCount: number | null
  unapprovedCount: number | null
  pendingDiscussionReviews: number | null
  openDiscussionReports: number | null
}

export type HubTileConfig = {
  title: string
  lines: string[]
  hint: string
  route:
    | 'AdminAnalytics'
    | 'AdminFreeAccess'
    | 'AdminFidelBeta'
    | 'AdminSpeakQa'
    | 'LessonConfig'
    | 'AdminSeriesList'
    | 'AdminVocabIllustrationReview'
    | 'QubeeLettersHub'
    | 'FidelLettersHub'
    | 'AdminSongs'
    | 'AdminProverbs'
    | 'AdminPromo'
    | 'AdminBroadcastPush'
    | 'AdminForceUpgrade'
    | 'AdminHomeHeroPreview'
    | 'AdminDiscussionReview'
    | 'AdminCommunityReports'
    | 'AdminPracticeSuggestions'
}

type Nav = StackNavigationProp<RootStackParamList>

export const ADMIN_HOME_SECTIONS: Record<
  AdminHomeSectionId,
  { title: string; subtitle: string }
> = {
  analytics: {
    title: 'Analytics',
    subtitle: 'Product health, user insights, and support lookups',
  },
  assets: {
    title: 'Asset Management',
    subtitle: 'Lessons, audio, vocab, and media that ship to learners',
  },
  moderation: {
    title: 'Content Moderation',
    subtitle: 'Community posts, reports, and curated learner sentences',
  },
}

export function sectionBadge(
  section: AdminHomeSectionId,
  counts: AdminHomeCounts,
): string | null {
  if (section === 'analytics') {
    return counts.usersTotal != null ? `${counts.usersTotal} users` : null
  }
  if (section === 'assets') {
    if (counts.unapprovedCount == null) return null
    return `${counts.unapprovedCount} voice approvals`
  }
  if (section === 'moderation') {
    if (counts.openDiscussionReports == null && counts.pendingDiscussionReviews == null) {
      return null
    }
    return `${(counts.pendingDiscussionReviews ?? 0) + (counts.openDiscussionReports ?? 0)} open`
  }
  return null
}

export function buildSectionTiles(
  section: AdminHomeSectionId,
  counts: AdminHomeCounts,
): HubTileConfig[] {
  if (section === 'analytics') {
    return [
      {
        title: 'Analytics',
        lines: [`Total Users : ${counts.usersTotal ?? '—'}`],
        hint: 'Dashboards, retention, waitlist, and Gemini Q&A (up to 10k events)',
        route: 'AdminAnalytics',
      },
    ]
  }
  if (section === 'assets') {
    return [
      {
        title: 'Series Config',
        lines: [
          `Total Series : ${counts.seriesTotal ?? '—'}`,
          `Unapproved Series : ${counts.unapprovedSeriesCount ?? '—'}`,
        ],
        hint: 'Edit lesson JSON, series metadata, and publish status',
        route: 'LessonConfig',
      },
      {
        title: 'Voice Recording',
        lines: [`Approval Requests : ${counts.unapprovedCount ?? '—'}`],
        hint: 'Vocabulary audio by series — record, review, approve',
        route: 'AdminSeriesList',
      },
      {
        title: 'Vocab Center',
        lines: ['Edit words + translations · generate/select pictures'],
        hint: 'Lexical assets and illustration review for the Vocab tab',
        route: 'AdminVocabIllustrationReview',
      },
      {
        title: 'Qubee Letters',
        lines: ['Alphabet recordings + approval queue'],
        hint: 'One audio clip per Oromo letter',
        route: 'QubeeLettersHub',
      },
      {
        title: 'Fidel Letters',
        lines: ["Ge'ez syllable recordings + approval queue"],
        hint: 'Approve syllable clips used in Fidel Quiz',
        route: 'FidelLettersHub',
      },
      {
        title: 'Songs / Music',
        lines: ['YouTube catalog for Home → Songs (Oromo + Amharic)'],
        hint: 'Add, edit, reorder, publish — learner app derives thumbnails',
        route: 'AdminSongs',
      },
      {
        title: 'Proverbs',
        lines: ['Sayings for Home → Proverbs (Oromo + Amharic)'],
        hint: 'Add, edit, reorder, publish native text + English',
        route: 'AdminProverbs',
      },
      {
        title: 'App promo',
        lines: ['Login popup — image, title, body, optional tab/tile CTA'],
        hint: 'Activate one promo for learners to see once after sign-in',
        route: 'AdminPromo',
      },
      {
        title: 'Home hero preview',
        lines: ['Cover height + vertical crop offset on learner Home'],
        hint: 'Tune series intro preview without a new learner build',
        route: 'AdminHomeHeroPreview',
      },
      {
        title: 'Push broadcast',
        lines: ['Send a push notification to all learners with tokens'],
        hint: 'Title + body + optional open-on-tap destination',
        route: 'AdminBroadcastPush',
      },
      {
        title: 'Free access',
        lines: [
          `Complimentary Premium : ${counts.freeAccessCount ?? '—'}`,
          ...(counts.freeAccessNames.length
            ? [`Names : ${counts.freeAccessNames.join(', ')}`]
            : counts.freeAccessCount === 0
              ? ['Names : —']
              : []),
        ],
        hint: 'Audit complimentary Premium grants · search by phone',
        route: 'AdminFreeAccess',
      },
      {
        title: 'Amharic beta',
        lines: ['Fidel Continue allowlist · add/remove by phone'],
        hint: 'Grant Amharic Fidel without a new learner build',
        route: 'AdminFidelBeta',
      },
      {
        title: 'Speak QA',
        lines: ['complete + testing Speak catalog · add/remove by phone'],
        hint: 'Employees see unpublished series ready for QA',
        route: 'AdminSpeakQa',
      },
    ]
  }
  return [
    {
      title: 'Discussion review queue',
      lines: [`Pending AI review : ${counts.pendingDiscussionReviews ?? '—'}`],
      hint: 'Approve or reject posts held before publication',
      route: 'AdminDiscussionReview',
    },
    {
      title: 'Lesson Discussion Reports',
      lines: [`Open reports : ${counts.openDiscussionReports ?? '—'}`],
      hint: 'Dismiss or remove learner-flagged board posts',
      route: 'AdminCommunityReports',
    },
    {
      title: 'Practice Suggestions',
      lines: ['Curate “From the community” on Practice (7 per day, tied to Word of the Day)'],
      hint: 'Pick sentences that use today’s WOTD — learners see your picks first',
      route: 'AdminPracticeSuggestions',
    },
    {
      title: 'Force upgrade',
      lines: ['Block old learner builds until they update'],
      hint: 'Set min iOS/Android marketing versions after a breaking schema change',
      route: 'AdminForceUpgrade',
    },
  ]
}

export function navigateHubTile(navigation: Nav, route: HubTileConfig['route']) {
  navigation.navigate(route)
}
