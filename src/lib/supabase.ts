import { createClient } from '@supabase/supabase-js'
import type { RecordingWord, Series } from '../types'

const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co'
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export const recordingWordsQuery = () => supabase.from('recording_words').select('*')

export const seriesQuery = () => supabase.from('series').select('*')

export const getRecordingWords = async () => {
  const { data, error } = await recordingWordsQuery()
  return { data: data as RecordingWord[] | null, error }
}

export const getSeries = async () => {
  const { data, error } = await seriesQuery()
  return { data: data as Series[] | null, error }
}

export default supabase
