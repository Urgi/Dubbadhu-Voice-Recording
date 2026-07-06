import Constants from 'expo-constants'

type Extra = Record<string, unknown> | undefined

function fromExtra(extra: Extra, key: string): string {
  const v = extra?.[key]
  return typeof v === 'string' ? v : ''
}

/**
 * Resolve EXPO_PUBLIC_* for runtime: Metro may inline at bundle time; `app.config.js`
 * also mirrors these into `expo.extra` for native/Xcode embed flows.
 */
export function getExpoPublicSupabaseUrl(): string {
  return (
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    fromExtra(Constants.expoConfig?.extra as Extra, 'EXPO_PUBLIC_SUPABASE_URL') ||
    process.env.SUPABASE_URL ||
    ''
  )
}

export function getExpoPublicSupabaseAnonKey(): string {
  return (
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    fromExtra(Constants.expoConfig?.extra as Extra, 'EXPO_PUBLIC_SUPABASE_ANON_KEY') ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  )
}

export function getExpoPublicGeminiKey(): string {
  const extra = Constants.expoConfig?.extra as Extra
  return (
    process.env.EXPO_PUBLIC_GEMINI_API_KEY ||
    fromExtra(extra, 'EXPO_PUBLIC_GEMINI_API_KEY') ||
    process.env.GEMINI_API_KEY ||
    fromExtra(extra, 'GEMINI_API_KEY') ||
    ''
  )
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getExpoPublicSupabaseUrl() && getExpoPublicSupabaseAnonKey())
}

/** Shared with Edge Function secret VOCAB_BATCH_SECRET (internal admin app only). */
export function getExpoPublicVocabBatchSecret(): string {
  return (
    process.env.EXPO_PUBLIC_VOCAB_BATCH_SECRET ||
    fromExtra(Constants.expoConfig?.extra as Extra, 'EXPO_PUBLIC_VOCAB_BATCH_SECRET') ||
    ''
  )
}
