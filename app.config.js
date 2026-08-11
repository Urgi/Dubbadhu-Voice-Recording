module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra || {}),
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    /** Admin mutations after learner anon write revoke — never put this in the learner app. */
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    EXPO_PUBLIC_GEMINI_API_KEY: process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY ?? '',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '',
    EXPO_PUBLIC_VOCAB_BATCH_SECRET:
      process.env.EXPO_PUBLIC_VOCAB_BATCH_SECRET ?? process.env.VOCAB_BATCH_SECRET ?? '',
    VOCAB_BATCH_SECRET:
      process.env.VOCAB_BATCH_SECRET ?? process.env.EXPO_PUBLIC_VOCAB_BATCH_SECRET ?? '',
  },
})
