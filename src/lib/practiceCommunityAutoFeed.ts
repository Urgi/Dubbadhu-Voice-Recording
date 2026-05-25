import supabase from './supabase'
import { PRACTICE_COMMUNITY_PICKS_MAX } from './practiceCommunityFeatured'
import { scoreLikelyGoodQuestion } from './practiceCommunityAutoFeedScore'

export type AutoFeedSentenceRow = {
  id: string | number
  corrected: string
  intended: string
  created_at: string
  is_saved: boolean
  autoScore: number
}

type RawSentence = {
  id: string | number
  corrected: string | null
  intended: string | null
  created_at: string
  is_saved?: boolean | null
}

/** Same pipeline as learner fallback in Dubbadhu.js (global pool, no per-user exclude). */
export function rankAutomaticCommunityFeed(
  rows: RawSentence[],
  max = PRACTICE_COMMUNITY_PICKS_MAX,
): AutoFeedSentenceRow[] {
  const seen = new Set<string>()
  const scored = rows
    .filter((r) => (r?.corrected || '').trim())
    .map((r) => {
      const corrected = String(r.corrected || '').trim()
      const intended = String(r.intended || '').trim()
      return {
        id: r.id,
        corrected,
        intended,
        created_at: r.created_at,
        is_saved: r.is_saved === true,
        autoScore: scoreLikelyGoodQuestion(intended, corrected),
      }
    })
    .filter((r) => r.autoScore > 0)
    .filter((r) => {
      const key = r.corrected.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => b.autoScore - a.autoScore)

  return scored.slice(0, max)
}

export async function fetchAutomaticCommunityFeedPreview(): Promise<{
  rows: AutoFeedSentenceRow[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('sentences')
    .select('id, corrected, intended, created_at, is_saved')
    .eq('is_saved', true)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return { rows: [], error: error.message }
  return { rows: rankAutomaticCommunityFeed(data ?? []), error: null }
}

export function withAutoScore<T extends { intended: string; corrected: string }>(
  row: T,
): T & { autoScore: number } {
  return {
    ...row,
    autoScore: scoreLikelyGoodQuestion(row.intended, row.corrected),
  }
}
