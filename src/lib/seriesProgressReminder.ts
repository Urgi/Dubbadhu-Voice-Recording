import * as Notifications from 'expo-notifications'
import * as FileSystem from 'expo-file-system/legacy'
import supabase from './supabase'

const REMINDER_NOTIFICATION_ID = 'series_progress_16h_reminder'
const LAST_EDIT_FILE = 'dubbadhu_last_screen_edit.json'
export const SERIES_INACTIVITY_HOURS = 16

/** Setup notification presentation behavior on app boot. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

function getLastEditFilePath(): string | null {
  if (!FileSystem.documentDirectory) return null
  return `${FileSystem.documentDirectory}${LAST_EDIT_FILE}`
}

export async function saveLastScreenEditAt(timestamp: string = new Date().toISOString()): Promise<void> {
  try {
    const path = getLastEditFilePath()
    if (!path) return
    await FileSystem.writeAsStringAsync(path, JSON.stringify({ lastEditAt: timestamp }))
  } catch (err) {
    console.warn('[seriesProgressReminder] Failed to save last edit timestamp:', err)
  }
}

export async function getLastScreenEditAt(): Promise<string | null> {
  try {
    const path = getLastEditFilePath()
    if (!path) return null
    const info = await FileSystem.getInfoAsync(path)
    if (!info.exists) return null
    const raw = await FileSystem.readAsStringAsync(path)
    const parsed = JSON.parse(raw) as { lastEditAt?: string }
    return parsed?.lastEditAt ?? null
  } catch {
    return null
  }
}

export function formatElapsedSince(publishedDate: Date, now: Date = new Date()): string {
  const diffMs = Math.max(0, now.getTime() - publishedDate.getTime())
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays >= 60) {
    const months = Math.floor(diffDays / 30)
    return `${months} months`
  }
  if (diffDays >= 14) {
    const weeks = Math.floor(diffDays / 7)
    return `${weeks} weeks`
  }
  if (diffDays === 1) {
    return '1 day'
  }
  if (diffDays > 0) {
    return `${diffDays} days`
  }
  return 'Recently'
}

/**
 * Resets and schedules the 16-hour series inactivity reminder.
 * Called whenever a screen or lesson is updated/saved.
 */
export async function refreshSeriesProgressReminder(options?: {
  seriesId?: string | null
  delaySecondsOverride?: number
}): Promise<{ ok: boolean; scheduledTime?: string; error?: string }> {
  try {
    // 1. Ensure notification permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }
    if (finalStatus !== 'granted') {
      return { ok: false, error: 'Notification permissions not granted' }
    }

    // 2. Cancel previous pending inactivity reminder
    await Notifications.cancelScheduledNotificationAsync(REMINDER_NOTIFICATION_ID).catch(() => {})

    // 3. Query series status to get accurate copy
    const { data: allSeries } = await supabase
      .from('lesson_series')
      .select('id, title, sort_order, series_status, updated_at, created_at')
      .order('sort_order', { ascending: true })

    const seriesList = allSeries ?? []

    // Last published series (highest sort_order with status 'published')
    const publishedSeries = seriesList
      .filter((s) => s.series_status === 'published')
      .sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0))
    const lastPublished = publishedSeries[0]

    // Active draft series (e.g. Series 3)
    const draftSeries = seriesList.filter((s) => s.series_status !== 'published')
    const activeDraft =
      (options?.seriesId ? draftSeries.find((s) => s.id === options.seriesId) : null) ||
      draftSeries[0] ||
      lastPublished

    const publishedDate = lastPublished?.updated_at
      ? new Date(lastPublished.updated_at)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const now = new Date()
    const elapsedText = formatElapsedSince(publishedDate, now)
    const draftTitle = activeDraft?.title ? `“${activeDraft.title}”` : 'next series'

    const title = 'Series Progress Stalled'
    const body = `${elapsedText} since last series pushed and no new progress in 16 hours. Tap to continue drafting ${draftTitle}.`

    const delaySec = options?.delaySecondsOverride ?? SERIES_INACTIVITY_HOURS * 60 * 60
    const triggerDate = new Date(now.getTime() + delaySec * 1000)

    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_NOTIFICATION_ID,
      content: {
        title,
        body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: {
          type: 'series_progress_reminder',
          seriesId: activeDraft?.id ?? null,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: delaySec,
        repeats: false,
      },
    })

    void saveLastScreenEditAt(now.toISOString())
    return { ok: true, scheduledTime: triggerDate.toISOString() }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[seriesProgressReminder] Error scheduling 16h reminder:', msg)
    return { ok: false, error: msg }
  }
}
