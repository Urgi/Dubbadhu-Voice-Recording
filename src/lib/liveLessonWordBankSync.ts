import type { SupabaseClient } from '@supabase/supabase-js'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type LinkedAudioExposureTranslation = {
  wordId: string
  word: string
  translation: string
}

/** Linked Audio Exposure definitions authored in lesson JSON, deduped by `word_id`. */
export function collectLinkedAudioExposureTranslations(
  content: Record<string, unknown>,
): LinkedAudioExposureTranslation[] {
  const screens = content.screens
  if (!Array.isArray(screens)) return []

  const byId = new Map<string, LinkedAudioExposureTranslation>()
  for (const screen of screens) {
    if (screen == null || typeof screen !== 'object' || Array.isArray(screen)) continue
    const sr = screen as Record<string, unknown>
    if (sr.type !== 'audioExposure') continue
    const screenContent = sr.content
    if (screenContent == null || typeof screenContent !== 'object' || Array.isArray(screenContent)) continue
    const words = (screenContent as Record<string, unknown>).words
    if (!Array.isArray(words)) continue

    for (const item of words) {
      if (item == null || typeof item !== 'object' || Array.isArray(item)) continue
      const rec = item as Record<string, unknown>
      const wordId = String(rec.word_id ?? '').trim().toLowerCase()
      const word = String(rec.word ?? rec.oromo ?? '').trim()
      const translation = String(rec.translation ?? rec.english ?? '').trim()
      if (!UUID_RE.test(wordId) || !translation) continue

      const previous = byId.get(wordId)
      if (previous && previous.translation !== translation) {
        throw new Error(
          `Audio Exposure uses “${previous.word || wordId}” with two definitions. Make them match before saving.`,
        )
      }
      byId.set(wordId, { wordId, word, translation })
    }
  }
  return [...byId.values()]
}

/**
 * For complete/testing/published admin saves, make `public.words.translation` match linked
 * Audio Exposure definitions. Draft/approval flows continue using `seedWordsFromSeriesLessons`.
 */
export async function syncLiveLessonWordTranslations(
  content: Record<string, unknown>,
  client: Pick<SupabaseClient, 'from'>,
): Promise<{ updated: number }> {
  const linked = collectLinkedAudioExposureTranslations(content)
  if (linked.length === 0) return { updated: 0 }

  const ids = linked.map((item) => item.wordId)
  const { data, error } = await client.from('words').select('id,translation').in('id', ids)
  if (error) throw new Error(error.message || 'Could not read linked word definitions.')

  const current = new Map<string, string>()
  for (const row of data ?? []) {
    if (row == null || typeof row !== 'object' || Array.isArray(row)) continue
    const rec = row as Record<string, unknown>
    const id = String(rec.id ?? '').trim().toLowerCase()
    if (id) current.set(id, String(rec.translation ?? '').trim())
  }

  const missing = linked.filter((item) => !current.has(item.wordId))
  if (missing.length > 0) {
    throw new Error(
      `Could not find linked word row${missing.length === 1 ? '' : 's'}: ${missing
        .map((item) => item.word || item.wordId)
        .join(', ')}`,
    )
  }

  const changes = linked.filter((item) => current.get(item.wordId) !== item.translation)
  for (const item of changes) {
    const { data: updated, error: updateError } = await client
      .from('words')
      .update({ translation: item.translation })
      .eq('id', item.wordId)
      .select('id,translation')
      .maybeSingle()
    if (updateError) {
      throw new Error(
        `Could not update “${item.word || item.wordId}” in the word bank: ${
          updateError.message || 'unknown database error'
        }`,
      )
    }
    const savedTranslation = String(
      updated && typeof updated === 'object' && !Array.isArray(updated)
        ? (updated as Record<string, unknown>).translation ?? ''
        : '',
    ).trim()
    if (savedTranslation !== item.translation) {
      throw new Error(
        `“${item.word || item.wordId}” was not updated in the word bank. Check the words update policy.`,
      )
    }
  }
  return { updated: changes.length }
}
