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

  const truncatedEvents = events
  const payload = JSON.stringify(truncatedEvents, null, 2)
  const prompt = `You are a Senior Mobile Product Growth Manager specializing in language-learning acquisition and user retention for the app "Dubbadhu" (an Afaan Oromo learning platform).

Your task is to analyze a raw JSON payload containing the last ${truncatedEvents.length} telemetry events from our users. Identify where users are gaining momentum and where they are getting stuck in the onboarding and learning funnel.

Context (typical event families in this product — use only what appears in the payload):
- Onboarding & activation: signup_started, signup_completed, activation_complete, app_opened
- Lessons: lesson_started, lesson_completed, lesson_screen_viewed, lesson_exited
- Practice / Dubbadhu tab: sentence_submitted, token_limit_* , tab_changed
- Vocab: vocab_viewed, vocab_quiz_started, vocab_quiz_completed, vocab_quiz_abandoned
- Monetization: subscription_viewed, premium_viewed, premium_purchased, subscription_cancel_intent
- Community & engagement: community_* , session_end

Focus your analysis heavily on early lifecycle milestones:
- **Activation Velocity**: Are users successfully initiating and completing their very first lesson? Look for gaps between lesson_started and lesson_completed, time-to-first-completion, and drop-off after lesson_screen_viewed or lesson_exited without completion.
- **Habit Formation**: Are there patterns showing users returning (repeat app_opened / session_end), recurring practice (sentence_submitted), vocab review, or multi-day engagement?

When comparing funnels, segment mentally by user_id where possible. Call out sparse or missing properties (null/empty metadata) that block diagnosis.

--- RAW TELEMETRY DATA ---
\`\`\`json
${payload}
\`\`\`

--- RESPONSE STRUCTURE ---
Provide your analysis strictly adhering to the following Markdown layout. Keep insights punchy, direct, and hyper-focused on mobile growth mechanics.

## 📊 Core Engagement Patterns
* Provide 2-3 concise bullets on what the dominant events tell us about current user behavior (e.g., features getting heavy use vs. neglected areas).

## ⚠️ Funnel Friction & Drop-offs
* Identify specific bottlenecks or tracking anomalies.
* Look closely at completion rates (e.g., did they start a lesson or practice module but fail to fire a completed event?). Note if any metadata properties are consistently sparse or missing.

## 🚀 Strategic Growth Recommendations
* **Recommendation 1 (Onboarding/Activation)**: [1-2 sentences on a tactical product change to get users to their first completed lesson faster]
* **Recommendation 2 (Retention/Engagement)**: [1-2 sentences on how to incentivize daily habit formation or practice returns]
* **Recommendation 3 (Telemetry/Tracking)**: [1-2 sentences on any critical event properties or logs we need to add to improve our data visibility]

Do not repeat or print out raw blocks of the JSON payload. Keep your response highly scannable.`

  const text = await generateText(prompt)
  if (text) return { ok: true, text, sourceLabel: `analytics_events (${truncatedEvents.length} rows)` }
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
