module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra || {}),
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    EXPO_PUBLIC_GEMINI_API_KEY: process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '',
    EXPO_PUBLIC_VOCAB_BATCH_SECRET: process.env.EXPO_PUBLIC_VOCAB_BATCH_SECRET ?? '',
    VOCAB_BATCH_SECRET: process.env.VOCAB_BATCH_SECRET ?? '',
  },
})
