import { createClient } from '@supabase/supabase-js'
import type { RecordingWord } from '../types'
import { normalizeRecordingWords } from './wordStatus'
import { getExpoPublicSupabaseAnonKey, getExpoPublicSupabaseUrl } from './expoPublicEnv'

// Use EXPO_PUBLIC_* in .env; also mirrored in app.config.js → extra for native/Xcode embeds.
const SUPABASE_URL = getExpoPublicSupabaseUrl()
const SUPABASE_ANON_KEY = getExpoPublicSupabaseAnonKey()

if (__DEV__ && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
  console.warn(
    '[supabase] Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env, then restart Expo.',
  )
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export const wordsQuery = () => supabase.from('words').select('*')

export const getWords = async () => {
  const { data, error } = await wordsQuery()
  return { data: data ? normalizeRecordingWords(data) : null, error }
}

export default supabase
