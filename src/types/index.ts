/** If Supabase uses an enum for `words.status`, add value `rerecord_requested` there too. */
import type { AdminRegisteredUserRow } from '../lib/adminUsers'

export type RecordingStatus =
  | 'pending'
  | 'recorded'
  | 'approved'
  | 'rerecord_requested'

export type RecordingWord = {
  id: string
  word: string
  series: string
  language: string
  slow_audio_url: string | null
  fast_audio_url: string | null
  status: RecordingStatus
  notes: string | null
  recorded_at: string | null
  created_at: string
  /** Set when recording Qubee alphabet rows (display letter in UI). */
  qubeeLetter?: string
  /** Set when recording Fidel syllable rows (Ge'ez symbol in UI). */
  fidelSymbol?: string
}

export type RecordingTable = 'words' | 'qubee_letters' | 'fidel_letters'

/** Unified admin audio approval queue item. */
export type AudioReviewItem = RecordingWord & {
  reviewSource: RecordingTable
}

export type AuthRole = 'admin' | 'voice' | 'professor' | 'fidel'

export type RootStackParamList = {
  Login: undefined
  ProfessorHome: undefined
  AdminHome: undefined
  /** Hub section drill-in (tiles for analytics / assets / moderation). */
  AdminHubSection: { section: 'analytics' | 'assets' | 'moderation' }
  /** In-app Gemini chat with bundled Dubbadhu ecosystem context (both apps). */
  LubbuDubbadhu: undefined
  AdminAnalytics: undefined
  /** Registered learners list, or active-today (max 10) when mode is set. */
  AdminUsers: { mode?: 'activeToday' } | undefined
  /** Signup → lesson timeline for one user (from Active today / Registered). */
  AdminUserTimeline: { user: AdminRegisteredUserRow }
  /** Complimentary Premium (isPremium, no premium_product_id). */
  AdminFreeAccess: undefined
  /** Amharic / Fidel beta allowlist (phone search → grant/revoke). */
  AdminFidelBeta: undefined
  /** Curate Practice tab “From the community” picks per WOTD day (max 7). */
  AdminPracticeSuggestions: undefined
  /** Lesson discussion post reports from the learner app. */
  AdminCommunityReports: undefined
  /** AI moderation queue — approve or reject held discussion posts. */
  AdminDiscussionReview: undefined
  /** Home Music catalog (YouTube links + phrases). */
  AdminSongs: undefined
  /** Home Proverbs catalog (native + English). */
  AdminProverbs: undefined
  /** In-app login promo modal (image + title + body + optional CTA). */
  AdminPromo: undefined
  /** Global Expo push to all registered learner tokens. */
  AdminBroadcastPush: undefined
  /** Force-upgrade min iOS/Android marketing versions. */
  AdminForceUpgrade: undefined
  LessonConfig: undefined
  LessonConfigSeries: { seriesId: string }
  LessonConfigDetail: {
    lessonId: string
    /** Stack replace animation: `pop` = previous lesson slides in from the left (after swipe right). */
    lessonNavReplaceAnimation?: 'push' | 'pop'
  }
  AdminSeriesList: undefined
  AdminSeriesDetail: { seriesName: string; language: string }
  AdminAudioReview: { qubeeOnly?: boolean; fidelOnly?: boolean } | undefined
  QubeeLettersHub: undefined
  FidelRecorderHome: undefined
  FidelLettersHub: undefined
  /** QA vocabulary quiz illustrations (good/bad + notes for regeneration). */
  AdminVocabIllustrationReview: undefined
  AdminSeriesAudioReview: { seriesName: string; language: string }
  VoiceActorHome: undefined
  VoiceActorDashboard: undefined
  /** Voice actor: listen / re-record takes still awaiting admin approval. */
  VoiceActorAwaitingApproval:
    | {
        series?: string
        language?: string
        vocabOnly?: boolean
      }
    | undefined
  Recording: {
    words: RecordingWord[]
    /** Default `words`; Qubee alphabet uses `qubee_letters`. */
    recordingTable?: RecordingTable
    /** When re-recording one word from Review, merge back into this list on finish */
    mergeIntoSession?: RecordingWord[]
    /** Voice actor: started from a series card — show series + words-left banner */
    seriesSession?: { series: string; language: string }
  }
  Review: { recordedWords: RecordingWord[]; recordingTable?: RecordingTable }
}
