import { GoogleGenerativeAI } from '@google/generative-ai'
import { getExpoPublicGeminiKey } from './expoPublicEnv'

/** Try stable models first; 2.0 may be unavailable on some API keys / regions. */
const MODELS = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-8b'] as const

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

/**
 * Prefer raw `analytics_events` rows; if empty (e.g. RLS), fall back to `daily_event_summary` aggregates.
 */
export async function runGeminiAnalyticsInsights(
  events: unknown[],
  dailySummaryRows: unknown[],
): Promise<GeminiAnalyticsResult> {
  const key = getExpoPublicGeminiKey().trim()
  if (!key) {
    return { ok: false, error: 'Set EXPO_PUBLIC_GEMINI_API_KEY in .env and restart Expo.' }
  }

  if (events.length > 0) {
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
    if (text) return { ok: true, text, sourceLabel: `Raw events (${events.length} rows)` }
    return { ok: false, error: 'No response from Gemini (empty or blocked). Check API key and model access.' }
  }

  if (dailySummaryRows.length > 0) {
    const payload = JSON.stringify(dailySummaryRows, null, 2)
    const prompt = `You are a product analyst for a language-learning app (Dubbadhu).

The mobile app could not load raw analytics_events (often Row Level Security). Instead, below is JSON from the aggregated view daily_event_summary: each row typically has date, event_name, event_count, unique_users (or similar).

Tasks:
1. Summarize which events are most common and trends across days if visible.
2. Comment on engagement (unique_users vs counts) where the data allows.
3. Give 3–5 concise recommendations.

Keep short headings. Do not dump the raw JSON verbatim.

--- DAILY SUMMARY JSON (${dailySummaryRows.length} rows) ---
${payload}`

    const text = await generateText(prompt)
    if (text) {
      return {
        ok: true,
        text,
        sourceLabel: `daily_event_summary (${dailySummaryRows.length} rows, aggregated)`,
      }
    }
    return { ok: false, error: 'No response from Gemini (empty or blocked). Check API key and model access.' }
  }

  return {
    ok: false,
    error:
      'No data for AI: analytics_events returned 0 rows (check RLS SELECT for anon) and daily_event_summary is empty.',
  }
}

/** @deprecated use runGeminiAnalyticsInsights */
export async function summarizeAnalyticsEventsWithGemini(
  events: unknown[],
): Promise<{ text: string } | { error: string }> {
  const r = await runGeminiAnalyticsInsights(events, [])
  if (r.ok) return { text: r.text }
  return { error: r.error }
}
