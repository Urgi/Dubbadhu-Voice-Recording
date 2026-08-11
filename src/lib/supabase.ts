import { createClient } from '@supabase/supabase-js'
import type { RecordingWord } from '../types'
import { normalizeRecordingWords } from './wordStatus'
import {
  getExpoPublicSupabaseAnonKey,
  getExpoPublicSupabaseUrl,
  getSupabaseServiceRoleKey,
} from './expoPublicEnv'

// Use EXPO_PUBLIC_* in .env; also mirrored in app.config.js → extra for native/Xcode embeds.
const SUPABASE_URL = getExpoPublicSupabaseUrl()
const SUPABASE_ANON_KEY = getExpoPublicSupabaseAnonKey()
const SUPABASE_SERVICE_ROLE_KEY = getSupabaseServiceRoleKey()

if (__DEV__ && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
  console.warn(
    '[supabase] Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env, then restart Expo.',
  )
}

if (__DEV__ && !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '[supabase] SUPABASE_SERVICE_ROLE_KEY missing — catalog/config writes will fail after RLS lockdown. Set it in .env (admin app only).',
  )
}

/** Prefer service role so admin mutations work after anon write revoke. */
const clientKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, clientKey)

export const wordsQuery = () => supabase.from('words').select('*')

export const getWords = async () => {
  const { data, error } = await wordsQuery()
  return { data: data ? normalizeRecordingWords(data) : null, error }
}

export default supabase
