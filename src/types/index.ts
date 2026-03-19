export type RecordingStatus = 'pending' | 'recorded' | 'approved' | 'rejected'

export type RecordingWord = {
  id: string
  series_id: string
  word: string
  language: string
  slow_audio_url: string | null
  fast_audio_url: string | null
  status: RecordingStatus
  notes: string | null
  recorded_at: string | null
  created_at: string
}

export type Series = {
  id: string
  name: string
  language: string
}

export type RootStackParamList = {
  Login: undefined
  ModeSelect: undefined
  AdminWordInput: undefined
  VoiceActorQueue: undefined
  Recording: undefined
  Review: undefined
}
