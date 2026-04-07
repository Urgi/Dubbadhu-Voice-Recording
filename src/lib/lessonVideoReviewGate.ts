/**
 * Release gate: every `videoReview` screen in lesson JSON must have a non-empty `videoUrl`.
 */

export type VideoReviewGap = {
  lessonId: string
  lessonTitle: string
  screenIndex: number
}

type LessonContentRow = {
  id: string
  title: string | null | undefined
  content: unknown
}

export function findVideoReviewScreensMissingUrl(rows: LessonContentRow[]): VideoReviewGap[] {
  const gaps: VideoReviewGap[] = []
  for (const row of rows) {
    const content = row.content
    if (content == null || typeof content !== 'object' || Array.isArray(content)) continue
    const screens = (content as { screens?: unknown }).screens
    if (!Array.isArray(screens)) continue
    screens.forEach((sc, idx) => {
      if (sc == null || typeof sc !== 'object' || Array.isArray(sc)) return
      const type = String((sc as { type?: string }).type ?? '').trim()
      if (type !== 'videoReview') return
      const c = (sc as { content?: unknown }).content
      const rec = c != null && typeof c === 'object' && !Array.isArray(c) ? (c as Record<string, unknown>) : {}
      const url = String(rec.videoUrl ?? '').trim()
      if (!url) {
        const t = row.title
        gaps.push({
          lessonId: row.id,
          lessonTitle: typeof t === 'string' && t.trim() ? t.trim() : row.id,
          screenIndex: idx,
        })
      }
    })
  }
  return gaps
}
