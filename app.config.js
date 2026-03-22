/**
 * Mirrors EXPO_PUBLIC_* from loaded .env into `expo.extra` so they are available
 * via expo-constants when the JS bundle was built without Metro inlining them.
 */
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra || {}),
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    EXPO_PUBLIC_GEMINI_API_KEY: process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '',
  },
})
