import supabase from './supabase'

export const PRACTICE_COMMUNITY_PICKS_MAX = 7

export type PracticeCommunitySentenceRow = {
  id: string | number
  corrected: string
  intended: string
  created_at: string
  is_saved: boolean
  sort_order?: number
}

export type PracticeCommunityPicksAdminState = {
  featured_date: string
  max_picks: number
  wotd: { oromo: string; english: string } | null
  featured: PracticeCommunitySentenceRow[]
  candidates: PracticeCommunitySentenceRow[]
}

export function ymdUTC(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10)
}

export function shiftDateYmd(ymd: string, deltaDays: number): string {
  const d = new Date(`${ymd}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return ymdUTC(d)
}

export async function fetchPracticeCommunityPicksAdmin(
  featuredDate: string,
): Promise<{ data: PracticeCommunityPicksAdminState | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_practice_community_picks_admin', {
    p_date: featuredDate,
  })
  if (error) return { data: null, error: error.message }
  if (!data || typeof data !== 'object') {
    return { data: null, error: 'Empty response from server' }
  }
  const raw = data as PracticeCommunityPicksAdminState
  return {
    data: {
      featured_date: String(raw.featured_date ?? featuredDate),
      max_picks: raw.max_picks ?? PRACTICE_COMMUNITY_PICKS_MAX,
      wotd: raw.wotd ?? null,
      featured: Array.isArray(raw.featured) ? raw.featured : [],
      candidates: Array.isArray(raw.candidates) ? raw.candidates : [],
    },
    error: null,
  }
}

export async function savePracticeCommunityPicks(
  featuredDate: string,
  sentenceIds: Array<string | number>,
): Promise<{ error: string | null }> {
  if (sentenceIds.length > PRACTICE_COMMUNITY_PICKS_MAX) {
    return { error: `Select at most ${PRACTICE_COMMUNITY_PICKS_MAX} sentences` }
  }
  const ids = sentenceIds.map((id) => (typeof id === 'number' ? id : parseInt(String(id), 10)))
  const { error } = await supabase.rpc('set_practice_community_picks', {
    p_date: featuredDate,
    p_sentence_ids: ids,
  })
  return { error: error?.message ?? null }
}
