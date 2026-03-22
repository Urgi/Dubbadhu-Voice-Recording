/** If Supabase uses an enum for `words.status`, add value `rerecord_requested` there too. */
export type RecordingStatus =
  | 'pending'
  | 'recorded'
  | 'approved'
  | 'rejected'
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
  ModeSelect: { role: AuthRole }
  AdminSeriesList: undefined
  AdminSeriesDetail: { seriesName: string; language: string }
  VoiceActorDashboard: undefined
  Recording: {
    words: RecordingWord[]
    /** When re-recording one word from Review, merge back into this list on finish */
    mergeIntoSession?: RecordingWord[]
  }
  Review: { recordedWords: RecordingWord[] }
}
