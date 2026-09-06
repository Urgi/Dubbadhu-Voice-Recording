import * as Notifications from 'expo-notifications'
import * as FileSystem from 'expo-file-system/legacy'
import supabase from './supabase'

export const REMINDER_NOTIFICATION_PREFIX = 'series_progress_16h_reminder_'
const LAST_EDIT_FILE = 'dubbadhu_last_screen_edit.json'
export const SERIES_INACTIVITY_HOURS = 16
export const REMINDER_WAKE_HOUR = 8 // 8:00 AM
export const REMINDER_SLEEP_HOUR = 23 // 11:00 PM
export const DEFAULT_SCHEDULE_COUNT = 36 // ~2-3 days of hourly waking notifications

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
 * Returns true if the time is within waking hours (8:00 AM to 11:00 PM inclusive).
 * 11:00 PM sharp (23:00) is the cutoff; 23:01 to 07:59 is quiet night hours.
 */
export function isAllowedReminderTime(date: Date): boolean {
  const h = date.getHours()
  const m = date.getMinutes()
  if (h < REMINDER_WAKE_HOUR) return false
  if (h > REMINDER_SLEEP_HOUR) return false
  if (h === REMINDER_SLEEP_HOUR && m > 0) return false
  return true
}

/**
 * If a date falls in quiet hours (before 8:00 AM or after 11:00 PM),
 * rolls it forward to 8:00 AM of the next waking period.
 */
export function rollToNextAllowedTime(date: Date): Date {
  const d = new Date(date.getTime())
  const h = d.getHours()
  const m = d.getMinutes()

  if (h < REMINDER_WAKE_HOUR) {
    // Early morning before 8am -> roll to 8:00 AM today
    d.setHours(REMINDER_WAKE_HOUR, 0, 0, 0)
    return d
  }
  if (h > REMINDER_SLEEP_HOUR || (h === REMINDER_SLEEP_HOUR && m > 0)) {
    // After 11pm -> roll to 8:00 AM tomorrow
    d.setDate(d.getDate() + 1)
    d.setHours(REMINDER_WAKE_HOUR, 0, 0, 0)
    return d
  }
  return d
}

/**
 * Generates an array of Date objects for hourly reminders:
 * - Starts when the 16-hour inactivity threshold is crossed.
 * - If the threshold hits during quiet hours (11:01 PM - 7:59 AM), rolls to 8:00 AM.
 * - Fires every hour during waking hours (8:00 AM to 11:00 PM).
 * - Pauses at 11:00 PM and restarts at 8:00 AM next morning.
 */
export function generateReminderDates(
  lastEditDate: Date,
  options?: {
    thresholdHours?: number
    count?: number
  },
): Date[] {
  const thresholdHours = options?.thresholdHours ?? SERIES_INACTIVITY_HOURS
  const maxCount = options?.count ?? DEFAULT_SCHEDULE_COUNT

  const thresholdMs = lastEditDate.getTime() + thresholdHours * 60 * 60 * 1000
  let current = rollToNextAllowedTime(new Date(thresholdMs))

  const dates: Date[] = []

  while (dates.length < maxCount) {
    dates.push(new Date(current.getTime()))

    // Advance 1 hour, snapping subsequent hourly checks to the top of the hour
    const nextHour = new Date(current.getTime())
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0)

    current = rollToNextAllowedTime(nextHour)
  }

  return dates
}

/**
 * Cancels all previously scheduled series progress reminder notifications.
 */
export async function cancelAllSeriesProgressReminders(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync()
    for (const notif of scheduled) {
      if (
        notif.identifier.startsWith(REMINDER_NOTIFICATION_PREFIX) ||
        notif.identifier === 'series_progress_16h_reminder' ||
        notif.content?.data?.type === 'series_progress_reminder'
      ) {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier).catch(() => {})
      }
    }
  } catch (err) {
    console.warn('[seriesProgressReminder] Error cancelling reminders:', err)
  }
}

/**
 * Resets and schedules the 16-hour series inactivity reminders:
 * Fires every hour after the 16h threshold between 8:00 AM and 11:00 PM,
 * pausing overnight and resuming at 8:00 AM.
 *
 * Called whenever a screen or lesson is updated/saved.
 */
export async function refreshSeriesProgressReminder(options?: {
  seriesId?: string | null
  lastEditDate?: Date
  scheduleCount?: number
  delaySecondsOverride?: number
}): Promise<{ ok: boolean; scheduledCount?: number; firstTrigger?: string; error?: string }> {
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

    // 2. Cancel all existing pending reminders
    await cancelAllSeriesProgressReminders()

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

    const now = options?.lastEditDate ?? new Date()
    const elapsedText = formatElapsedSince(publishedDate, now)
    const draftTitle = activeDraft?.title ? `“${activeDraft.title}”` : 'next series'

    // 4. Generate hourly trigger dates
    let dates: Date[] = []
    if (options?.delaySecondsOverride != null) {
      // Test override: schedule a single trigger after delaySecondsOverride
      const target = new Date(now.getTime() + options.delaySecondsOverride * 1000)
      dates = [target]
    } else {
      dates = generateReminderDates(now, {
        thresholdHours: SERIES_INACTIVITY_HOURS,
        count: options?.scheduleCount ?? DEFAULT_SCHEDULE_COUNT,
      })
    }

    // 5. Schedule each notification
    const title = 'Series Progress Stalled'
    for (const triggerDate of dates) {
      const identifier = `${REMINDER_NOTIFICATION_PREFIX}${triggerDate.getTime()}`
      const hoursStalled = Math.max(
        SERIES_INACTIVITY_HOURS,
        Math.round((triggerDate.getTime() - now.getTime()) / (1000 * 60 * 60)),
      )
      const body = `${elapsedText} since last series pushed and no new progress in ${hoursStalled} hours. Tap to continue drafting ${draftTitle}.`

      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title,
          body,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: {
            type: 'series_progress_reminder',
            seriesId: activeDraft?.id ?? null,
            hoursStalled,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
      })
    }

    void saveLastScreenEditAt(now.toISOString())
    return {
      ok: true,
      scheduledCount: dates.length,
      firstTrigger: dates[0]?.toISOString(),
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[seriesProgressReminder] Error scheduling reminders:', msg)
    return { ok: false, error: msg }
  }
}
