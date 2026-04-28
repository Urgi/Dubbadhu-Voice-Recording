import { GoogleGenerativeAI } from '@google/generative-ai'
import { getExpoPublicGeminiKey } from './expoPublicEnv'

/** Try stable models first; older model IDs may be retired for some API keys. */
const MODELS = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'] as const

export type GeminiAnalyticsOk = { ok: true; text: string; sourceLabel: string }
export type GeminiAnalyticsErr = { ok: false; error: string }
export type GeminiAnalyticsResult = GeminiAnalyticsOk | GeminiAnalyticsErr

async function generateText(prompt: string): Promise<string | null> {
  const key = getExpoPublicGeminiKey().trim()
  if (!key) return null

  const genAI = new GoogleGenerativeAI(key)

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName })
      const result = await model.generateContent(prompt)
      const response = result.response
      let text = ''
      try {
        text = response.text()
      } catch {
        const c = response.candidates?.[0]?.content?.parts
        if (Array.isArray(c)) {
          text = c
            .map((p) => (typeof (p as { text?: string }).text === 'string' ? (p as { text: string }).text : ''))
            .join('')
        }
      }
      if (text?.trim()) return text.trim()
    } catch {
      if (modelName === MODELS[MODELS.length - 1]) return null
    }
  }
  return null
}

/** Insights use `analytics_events` rows only (no aggregated daily summary). */
export async function runGeminiAnalyticsInsights(events: unknown[]): Promise<GeminiAnalyticsResult> {
  const key = getExpoPublicGeminiKey().trim()
  if (!key) {
    return { ok: false, error: 'Set EXPO_PUBLIC_GEMINI_API_KEY in .env and restart Expo.' }
  }

  if (events.length === 0) {
    return {
      ok: false,
      error:
        'No analytics events loaded. Allow SELECT on analytics_events for your Supabase anon key (check RLS), then pull to refresh.',
    }
  }

  const payload = JSON.stringify(events, null, 2)
  const prompt = `You are a product analyst for a language-learning app (Dubbadhu).

Below is JSON: the last ${events.length} analytics events. Each item may include event_name, properties (JSON metadata), user_id, created_at.

Tasks:
1. Summarize dominant event types and any patterns in properties (e.g. categories).
2. Note anything unusual, sparse data, or risks.
3. Give 3–5 concise, actionable recommendations for the team.

Keep the answer readable with short headings. Do not repeat the raw JSON.

--- EVENTS JSON ---
${payload}`

  const text = await generateText(prompt)
  if (text) return { ok: true, text, sourceLabel: `analytics_events (${events.length} rows)` }
  return { ok: false, error: 'No response from Gemini (empty or blocked). Check API key and model access.' }
}

/** @deprecated use runGeminiAnalyticsInsights */
export async function summarizeAnalyticsEventsWithGemini(
  events: unknown[],
): Promise<{ text: string } | { error: string }> {
  const r = await runGeminiAnalyticsInsights(events)
  if (r.ok) return { text: r.text }
  return { error: r.error }
}
