import { getVocabBatchSecret } from './expoPublicEnv'
import supabase from './supabase'
import type { AppPromoCtaTarget } from './appPromoTargets'

export type BroadcastPreviewResult =
  | { ok: true; recipients: number }
  | { ok: false; error: string }

export type BroadcastSendResult =
  | { ok: true; recipients: number; sent: number }
  | { ok: false; error: string }

async function invokeBroadcast(
  body: Record<string, unknown>,
): Promise<{ payload: Record<string, unknown> | null; error: string | null }> {
  const secret = getVocabBatchSecret().trim()
  if (!secret) {
    return {
      payload: null,
      error:
        'Missing VOCAB_BATCH_SECRET (or EXPO_PUBLIC_VOCAB_BATCH_SECRET) in admin .env — restart Expo after setting it.',
    }
  }

  try {
    const { data, error } = await supabase.functions.invoke('admin-broadcast-push', {
      body,
      headers: { 'x-admin-premium-secret': secret },
    })

    let payload = (data || null) as Record<string, unknown> | null
    if (error) {
      const ctx = error as { context?: Response; message?: string }
      if (ctx.context && typeof ctx.context.json === 'function') {
        try {
          payload = (await ctx.context.json()) as Record<string, unknown>
        } catch {
          /* keep */
        }
      }
      if (!payload) {
        return { payload: null, error: ctx.message || error.message || 'Request failed' }
      }
    }
    return { payload, error: null }
  } catch (e) {
    return { payload: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function previewBroadcastRecipients(): Promise<BroadcastPreviewResult> {
  const { payload, error } = await invokeBroadcast({ action: 'preview' })
  if (error) return { ok: false, error }
  if (!payload?.ok) {
    return { ok: false, error: String(payload?.error || 'preview_failed') }
  }
  return { ok: true, recipients: Number(payload.recipients) || 0 }
}

export async function sendAdminBroadcastPush(input: {
  title: string
  body: string
  cta_target?: AppPromoCtaTarget | null
}): Promise<BroadcastSendResult> {
  const { payload, error } = await invokeBroadcast({
    action: 'send',
    title: input.title,
    body: input.body,
    cta_target: input.cta_target ?? null,
  })
  if (error) return { ok: false, error }
  if (!payload?.ok && payload?.error) {
    return { ok: false, error: String(payload.error) }
  }
  return {
    ok: true,
    recipients: Number(payload?.recipients) || 0,
    sent: Number(payload?.sent) || 0,
  }
}
