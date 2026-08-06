import supabase from './supabase'
import {
  collectMatchPairsFromScreens,
  mergeMatchEditorPairLists,
  parseLessonContent,
  type LessonScreen,
  type MatchEditorPair,
} from './lessonEditor'

/**
 * Load every published/draft lesson in a curriculum series and collect Match pairs
 * from lesson JSON (audio exposure, match, video-review vocab, speaking, repetition).
 * Does **not** require voice-bank rows.
 *
 * When `currentLessonId` + `currentScreens` are provided, those screens replace the
 * saved content for that lesson (so unsaved editor draft is included).
 */
export async function fetchSeriesMatchPairsFromLessons(
  seriesId: string,
  opts?: {
    currentLessonId?: string | null
    currentScreens?: LessonScreen[] | null
  },
): Promise<{ pairs: MatchEditorPair[]; lessonCount: number }> {
  const sid = String(seriesId ?? '').trim()
  if (!sid) return { pairs: [], lessonCount: 0 }

  const { data, error } = await supabase
    .from('lessons')
    .select('id, lesson_number, content')
    .eq('series_id', sid)
    .order('lesson_number', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  const rows = Array.isArray(data) ? data : []
  const currentId = String(opts?.currentLessonId ?? '').trim()
  const lists: MatchEditorPair[][] = []

  for (const row of rows) {
    const id = String((row as { id?: string }).id ?? '').trim()
    let screens: LessonScreen[] = []
    if (currentId && id === currentId && Array.isArray(opts?.currentScreens)) {
      screens = opts!.currentScreens!
    } else {
      const parsed = parseLessonContent((row as { content?: unknown }).content, id || 'lesson')
      screens = parsed?.screens ?? []
    }
    lists.push(collectMatchPairsFromScreens(screens))
  }

  // If this lesson is new / not in the query result yet, still include draft screens.
  if (
    currentId &&
    Array.isArray(opts?.currentScreens) &&
    !rows.some((r) => String((r as { id?: string }).id ?? '') === currentId)
  ) {
    lists.push(collectMatchPairsFromScreens(opts!.currentScreens!))
  }

  return {
    pairs: mergeMatchEditorPairLists(lists),
    lessonCount: rows.length,
  }
}
