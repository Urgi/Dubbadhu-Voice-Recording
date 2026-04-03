/** Matches `lesson_series.series_status` CHECK in Dubbadhu migrations. */
export type LessonSeriesStatus =
  | 'admin_draft'
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'complete'
  | 'published'

export const SERIES_STATUS_ORDER: LessonSeriesStatus[] = [
  'admin_draft',
  'draft',
  'submitted',
  'approved',
  'complete',
  'published',
]

export function legacyFlagsFromSeriesStatus(st: LessonSeriesStatus): {
  approved: boolean
  audio_recorded: boolean
} {
  return {
    approved: st === 'approved' || st === 'complete' || st === 'published',
    audio_recorded: st === 'complete' || st === 'published',
  }
}

export function normalizeSeriesStatus(raw: string | null | undefined): LessonSeriesStatus {
  const s = (raw ?? '').trim()
  // Legacy DB values (pre–single `approved` status)
  if (s === 'content_approved' || s === 'with_va') return 'approved'
  if (
    s === 'admin_draft' ||
    s === 'draft' ||
    s === 'submitted' ||
    s === 'approved' ||
    s === 'complete' ||
    s === 'published'
  ) {
    return s
  }
  return 'draft'
}

export function seriesStatusLabel(st: LessonSeriesStatus): string {
  switch (st) {
    case 'admin_draft':
      return 'Admin draft'
    case 'draft':
      return 'Draft'
    case 'submitted':
      return 'Submitted for review'
    case 'approved':
      return 'Approved'
    case 'complete':
      return 'Audio complete'
    case 'published':
      return 'Published'
    default:
      return st
  }
}

/** Admin: structure locked after audio complete / shipped. */
export function isLessonStructureFrozen(st: LessonSeriesStatus): boolean {
  return st === 'complete' || st === 'published'
}

/** Professor may edit lessons only while the series is in draft. */
export function isProfessorLessonEditingAllowed(st: LessonSeriesStatus): boolean {
  return st === 'draft'
}
