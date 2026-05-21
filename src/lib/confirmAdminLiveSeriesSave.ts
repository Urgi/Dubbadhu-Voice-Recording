import { Alert } from 'react-native'
import type { AuthRole } from '../types'
import {
  isLessonStructureFrozen,
  seriesStatusLabel,
  type LessonSeriesStatus,
} from './lessonSeriesStatus'

/** Whether this role may use the lesson / series editors at all. */
export function canEditLessonStructure(role: AuthRole | null | undefined, st: LessonSeriesStatus): boolean {
  if (role === 'admin') return true
  if (role === 'professor') return st === 'draft'
  return false
}

/** Admin-only: confirm before writing while series is live (complete / testing / published). */
export function shouldConfirmAdminLiveSeriesSave(
  role: AuthRole | null | undefined,
  st: LessonSeriesStatus,
): boolean {
  return role === 'admin' && isLessonStructureFrozen(st)
}

export type AdminLiveSeriesSaveContext = 'lesson' | 'series script' | 'series cover' | 'series intro video'

/**
 * Blocking confirmation — resolves true only if the admin taps Save anyway.
 */
export function confirmAdminLiveSeriesSave(
  seriesStatus: LessonSeriesStatus,
  context: AdminLiveSeriesSaveContext,
): Promise<boolean> {
  return new Promise((resolve) => {
    const label = seriesStatusLabel(seriesStatus)
    const isPublished = seriesStatus === 'published'
    const title = isPublished
      ? 'Save changes to published series?'
      : `Save changes to ${label} series?`

    const contextLine =
      context === 'lesson'
        ? 'This lesson'
        : context === 'series script'
          ? 'The series intro script'
          : context === 'series cover'
            ? 'The Speak tab cover'
            : 'The series intro video'

    const message = isPublished
      ? `${contextLine} will be updated in production. Learners on the live app may see your changes after they refresh content.\n\nTap Cancel to keep editing without saving.`
      : `${contextLine} will be saved while this series is in “${label}” status. Learners on test or production builds may already see this series.\n\nTap Cancel to back out without saving.`

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      {
        text: 'Save anyway',
        style: isPublished ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ])
  })
}
