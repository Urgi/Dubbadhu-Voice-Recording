/** Matches `lesson_series.series_status` CHECK in Dubbadhu migrations. */
export type LessonSeriesStatus =
  | 'admin_draft'
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'complete'
  | 'testing'
  | 'published'

export const SERIES_STATUS_ORDER: LessonSeriesStatus[] = [
  'admin_draft',
  'draft',
  'submitted',
  'approved',
  'complete',
  'testing',
  'published',
]

export function legacyFlagsFromSeriesStatus(st: LessonSeriesStatus): {
  approved: boolean
  audio_recorded: boolean
} {
  return {
    approved: st === 'approved' || st === 'complete' || st === 'testing' || st === 'published',
    audio_recorded: st === 'complete' || st === 'testing' || st === 'published',
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
    s === 'testing' ||
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
    case 'testing':
      return 'Testing (pre-release)'
    case 'published':
      return 'Published'
    default:
      return st
  }
}

/**
 * Lesson structure locked after audio complete / shipped (reorder, add/delete lessons).
 * Admins may still edit lesson JSON and series metadata with a save confirmation — see
 * `confirmAdminLiveSeriesSave`.
 */
export function isLessonStructureFrozen(st: LessonSeriesStatus): boolean {
  return st === 'complete' || st === 'testing' || st === 'published'
}

/**
 * Professor may edit lesson JSON only while the series is in **draft** (their series).
 * **admin_draft** and other statuses are view-only so they can preview admin curriculum.
 */
export function isProfessorLessonEditingAllowed(st: LessonSeriesStatus): boolean {
  return st === 'draft'
}
