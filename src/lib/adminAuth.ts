import { createClient } from '@supabase/supabase-js'
import { getExpoPublicSupabaseAnonKey, getExpoPublicSupabaseUrl } from './expoPublicEnv'

export const ADMIN_EMAIL = 'dev@afaantech.com'

const supabaseUrl = getExpoPublicSupabaseUrl()
const supabaseAnonKey = getExpoPublicSupabaseAnonKey()

/**
 * Dedicated auth client using anon key for user-level OTP sign-in.
 */
const authClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

export async function sendAdminOtp(
  email: string = ADMIN_EMAIL,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const normalized = email.trim().toLowerCase()
    const { error } = await authClient.auth.signInWithOtp({
      email: normalized,
      options: {
        shouldCreateUser: true,
      },
    })
    if (error) {
      return { ok: false, error: error.message || 'Failed to send verification code.' }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Network error sending verification code.'
    return { ok: false, error: msg }
  }
}

export async function verifyAdminOtp(
  token: string,
  email: string = ADMIN_EMAIL,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const normalized = email.trim().toLowerCase()
    const cleanToken = token.trim()
    const { error } = await authClient.auth.verifyOtp({
      email: normalized,
      token: cleanToken,
      type: 'email',
    })
    if (error) {
      return { ok: false, error: error.message || 'Invalid or expired verification code.' }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Network error verifying code.'
    return { ok: false, error: msg }
  }
}
