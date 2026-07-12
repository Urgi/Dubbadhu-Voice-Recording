/** If Supabase uses an enum for `words.status`, add value `rerecord_requested` there too. */
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
  /** In-app Gemini chat with bundled Dubbadhu ecosystem context (both apps). */
  LubbuDubbadhu: undefined
  AdminAnalytics: undefined
  /** Complimentary Premium (isPremium, no premium_product_id). */
  AdminFreeAccess: undefined
  /** Curate Practice tab “From the community” picks per WOTD day (max 7). */
  AdminPracticeSuggestions: undefined
  /** Lesson discussion post reports from the learner app. */
  AdminCommunityReports: undefined
  /** AI moderation queue — approve or reject held discussion posts. */
  AdminDiscussionReview: undefined
  /** Home Music catalog (YouTube links + phrases). */
  AdminSongs: undefined
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
