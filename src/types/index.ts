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
}

export type AuthRole = 'admin' | 'voice'

export type RootStackParamList = {
  Login: undefined
  AdminHome: undefined
  AdminAnalytics: undefined
  AdminSeriesList: undefined
  AdminSeriesDetail: { seriesName: string; language: string }
  AdminAudioReview: undefined
  VoiceActorDashboard: undefined
  Recording: {
    words: RecordingWord[]
    /** When re-recording one word from Review, merge back into this list on finish */
    mergeIntoSession?: RecordingWord[]
    /** Voice actor: started from a series card — show series + words-left banner */
    seriesSession?: { series: string; language: string }
  }
  Review: { recordedWords: RecordingWord[] }
}
