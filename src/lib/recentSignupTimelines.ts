import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchRegisteredUsers,
  registeredUserDisplayName,
  type AdminRegisteredUserRow,
} from './adminUsers'
import { isAnalyticsExcludedUser } from './analyticsExcludedUsers'
import { regionFromPhone } from './phoneRegion'

export type SignupTimelineStep = {
  at: string
  label: string
  detail?: string
}

export type RecentSignupTimeline = {
  userId: string
  title: string
  displayName: string
  region: string
  signedUpAt: string
  screensPassed: number | null
  lessonTimeSeconds: number | null
  lessonSummary: string
  steps: SignupTimelineStep[]
}

type AnalyticsEventRow = {
  id: string
  user_id: string | null
  event_name: string
  properties: Record<string, unknown> | null
  created_at: string
}

const LESSON_EVENTS = new Set([
  'lesson_started',
  'lesson_screen_viewed',
  'lesson_exited',
  'lesson_backgrounded',
  'lesson_completed',
  'activation_complete',
  'lesson_1_completed',
])

function numProp(props: Record<string, unknown> | null, key: string): number | null {
  if (!props) return null
  const v = props[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return null
}

function strProp(props: Record<string, unknown> | null, key: string): string | null {
  if (!props) return null
  const v = props[key]
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

export function formatDurationSeconds(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return '—'
  const s = Math.round(totalSeconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m < 60) return rem > 0 ? `${m}m ${rem}s` : `${m}m`
  const h = Math.floor(m / 60)
  const remM = m % 60
  return remM > 0 ? `${h}h ${remM}m` : `${h}h`
}

function formatClock(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function buildTimelineForUser(
  user: AdminRegisteredUserRow,
  eventsAsc: AnalyticsEventRow[],
): RecentSignupTimeline {
  const displayName = registeredUserDisplayName(user)
  const region = regionFromPhone(user.phone)
  const title = `${displayName} · ${region}`

  const signupEvent = eventsAsc.find((e) => e.event_name === 'signup_completed')
  const signedUpAt = signupEvent?.created_at || user.created_at

  const lessonEvents = eventsAsc.filter((e) => LESSON_EVENTS.has(e.event_name))
  const screenViews = lessonEvents.filter((e) => e.event_name === 'lesson_screen_viewed')

  let maxScreenIndex: number | null = null
  let lastScreenType: string | null = null
  const uniqueIndexes = new Set<number>()
  for (const e of screenViews) {
    const idx = numProp(e.properties, 'screen_index')
    if (idx == null) continue
    uniqueIndexes.add(idx)
    if (maxScreenIndex == null || idx > maxScreenIndex) {
      maxScreenIndex = idx
      lastScreenType = strProp(e.properties, 'screen_type')
    }
  }

  for (const e of lessonEvents) {
    if (e.event_name === 'lesson_exited') {
      const exitIdx = numProp(e.properties, 'exit_screen_index')
      if (exitIdx != null && (maxScreenIndex == null || exitIdx > maxScreenIndex)) {
        maxScreenIndex = exitIdx
      }
    }
    if (e.event_name === 'lesson_backgrounded') {
      const bgIdx = numProp(e.properties, 'screen_index')
      if (bgIdx != null && (maxScreenIndex == null || bgIdx > maxScreenIndex)) {
        maxScreenIndex = bgIdx
      }
    }
    if (e.event_name === 'lesson_completed') {
      const completed = numProp(e.properties, 'screens_completed')
      if (completed != null && completed > 0) {
        const asIndex = completed - 1
        if (maxScreenIndex == null || asIndex > maxScreenIndex) maxScreenIndex = asIndex
      }
    }
  }

  const screensPassed =
    maxScreenIndex != null
      ? maxScreenIndex + 1
      : uniqueIndexes.size > 0
        ? uniqueIndexes.size
        : null

  const firstLessonAt = lessonEvents[0]?.created_at ?? null
  const lastLessonAt = lessonEvents[lessonEvents.length - 1]?.created_at ?? null

  let lessonTimeSeconds: number | null = null
  const completedWithTime = [...lessonEvents]
    .reverse()
    .find((e) => e.event_name === 'lesson_completed' && numProp(e.properties, 'time_spent_seconds') != null)
  if (completedWithTime) {
    lessonTimeSeconds = numProp(completedWithTime.properties, 'time_spent_seconds')
  } else if (firstLessonAt && lastLessonAt) {
    const ms = new Date(lastLessonAt).getTime() - new Date(firstLessonAt).getTime()
    if (Number.isFinite(ms) && ms >= 0) lessonTimeSeconds = Math.round(ms / 1000)
  }

  let lessonSummary: string
  if (screensPassed == null && lessonEvents.length === 0) {
    lessonSummary = 'No lesson activity yet'
  } else if (screensPassed == null) {
    lessonSummary = `Lesson activity · ${formatDurationSeconds(lessonTimeSeconds)}`
  } else {
    lessonSummary = `Passed ${screensPassed} screen${screensPassed === 1 ? '' : 's'} in ${formatDurationSeconds(lessonTimeSeconds)}`
  }

  const steps: SignupTimelineStep[] = []
  steps.push({
    at: signedUpAt,
    label: 'Completed signup',
    detail: formatClock(signedUpAt),
  })

  if (lessonEvents.length === 0) {
    steps.push({
      at: signedUpAt,
      label: 'No lesson activity yet',
    })
  } else {
    const started = lessonEvents.find((e) => e.event_name === 'lesson_started')
    if (started) {
      const lessonTitle = strProp(started.properties, 'lesson_title')
      const lessonId = strProp(started.properties, 'lesson_id')
      steps.push({
        at: started.created_at,
        label: 'Started lesson',
        detail: [lessonTitle || lessonId, formatClock(started.created_at)].filter(Boolean).join(' · '),
      })
    }

    if (screensPassed != null) {
      const progressAt = lastLessonAt || signedUpAt
      steps.push({
        at: progressAt,
        label: lessonSummary,
        detail: lastScreenType
          ? `Last screen: ${lastScreenType}${maxScreenIndex != null ? ` (#${maxScreenIndex})` : ''}`
          : formatClock(progressAt),
      })
    }

    const exited = [...lessonEvents].reverse().find((e) => e.event_name === 'lesson_exited')
    const backgrounded = [...lessonEvents]
      .reverse()
      .find((e) => e.event_name === 'lesson_backgrounded')
    const completed = [...lessonEvents].reverse().find((e) => e.event_name === 'lesson_completed')
    const activated = [...lessonEvents].reverse().find((e) => e.event_name === 'activation_complete')

    if (completed) {
      steps.push({
        at: completed.created_at,
        label: 'Completed lesson',
        detail: formatClock(completed.created_at),
      })
    } else if (exited) {
      const exitIdx = numProp(exited.properties, 'exit_screen_index')
      const total = numProp(exited.properties, 'total_screens')
      steps.push({
        at: exited.created_at,
        label: 'Exited lesson',
        detail: [
          exitIdx != null && total != null ? `Screen ${exitIdx + 1} of ${total}` : null,
          formatClock(exited.created_at),
        ]
          .filter(Boolean)
          .join(' · '),
      })
    } else if (backgrounded) {
      const bgIdx = numProp(backgrounded.properties, 'screen_index')
      const total = numProp(backgrounded.properties, 'total_screens')
      const screenType = strProp(backgrounded.properties, 'screen_type')
      steps.push({
        at: backgrounded.created_at,
        label: 'Left app (background)',
        detail: [
          bgIdx != null && total != null ? `Screen ${bgIdx + 1} of ${total}` : null,
          screenType,
          formatClock(backgrounded.created_at),
        ]
          .filter(Boolean)
          .join(' · '),
      })
    }

    if (activated) {
      steps.push({
        at: activated.created_at,
        label: 'Activation complete',
        detail: formatClock(activated.created_at),
      })
    }
  }

  return {
    userId: user.id,
    title,
    displayName,
    region,
    signedUpAt,
    screensPassed,
    lessonTimeSeconds,
    lessonSummary,
    steps,
  }
}

/**
 * Last N registered users with a focused signup → lesson-progress timeline.
 * Uses admin_list_registered_users + admin_fetch_analytics_events (no new RPC).
 */
export async function fetchRecentSignupTimelines(
  client: SupabaseClient,
  limit = 10,
): Promise<{ data: RecentSignupTimeline[]; error: string | null }> {
  const usersRes = await fetchRegisteredUsers(Math.max(limit * 4, 40))
  if (usersRes.error) return { data: [], error: usersRes.error }
  const users = (usersRes.data ?? []).filter((u) => !isAnalyticsExcludedUser(u)).slice(0, limit)
  if (users.length === 0) return { data: [], error: null }

  const oldestCreated = users.reduce((oldest, u) => {
    const t = new Date(u.created_at).getTime()
    return Number.isFinite(t) && t < oldest ? t : oldest
  }, Date.now())
  const since = new Date(oldestCreated - 60 * 60 * 1000).toISOString()

  const userIds = new Set(users.map((u) => u.id))
  const eventsByUser = new Map<string, AnalyticsEventRow[]>()

  let offset = 0
  const pageSize = 1000
  const maxRows = 5000
  let fetchError: string | null = null

  while (offset < maxRows) {
    const { data, error } = await client.rpc('admin_fetch_analytics_events', {
      p_since: since,
      p_limit: pageSize,
      p_offset: offset,
    })
    if (error) {
      fetchError = error.message
      break
    }
    const batch = (data ?? []) as AnalyticsEventRow[]
    if (batch.length === 0) break

    for (const raw of batch) {
      const uid = raw.user_id == null ? null : String(raw.user_id)
      if (!uid || !userIds.has(uid)) continue
      const row: AnalyticsEventRow = {
        id: String(raw.id ?? ''),
        user_id: uid,
        event_name: String(raw.event_name ?? ''),
        properties: (raw.properties as Record<string, unknown> | null) ?? null,
        created_at: String(raw.created_at ?? ''),
      }
      const list = eventsByUser.get(uid) ?? []
      list.push(row)
      eventsByUser.set(uid, list)
    }

    offset += batch.length
    if (batch.length < pageSize) break
  }

  if (fetchError && eventsByUser.size === 0) {
    return { data: [], error: fetchError }
  }

  const timelines = users.map((user) => {
    const rows = (eventsByUser.get(user.id) ?? []).slice().sort((a, b) => {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
    return buildTimelineForUser(user, rows)
  })

  return {
    data: timelines,
    error: fetchError ? `events partial: ${fetchError}` : null,
  }
}

/** Signup → lesson timeline for one registered/active user. */
export async function fetchSignupTimelineForUser(
  client: SupabaseClient,
  user: AdminRegisteredUserRow,
): Promise<{ data: RecentSignupTimeline | null; error: string | null }> {
  const createdMs = new Date(user.created_at).getTime()
  const since = new Date(
    (Number.isFinite(createdMs) ? createdMs : Date.now()) - 60 * 60 * 1000,
  ).toISOString()

  const events: AnalyticsEventRow[] = []
  let offset = 0
  const pageSize = 1000
  const maxRows = 5000
  let fetchError: string | null = null

  while (offset < maxRows) {
    const { data, error } = await client.rpc('admin_fetch_analytics_events', {
      p_since: since,
      p_limit: pageSize,
      p_offset: offset,
    })
    if (error) {
      fetchError = error.message
      break
    }
    const batch = (data ?? []) as AnalyticsEventRow[]
    if (batch.length === 0) break

    for (const raw of batch) {
      const uid = raw.user_id == null ? null : String(raw.user_id)
      if (uid !== user.id) continue
      events.push({
        id: String(raw.id ?? ''),
        user_id: uid,
        event_name: String(raw.event_name ?? ''),
        properties: (raw.properties as Record<string, unknown> | null) ?? null,
        created_at: String(raw.created_at ?? ''),
      })
    }

    offset += batch.length
    if (batch.length < pageSize) break
  }

  if (fetchError && events.length === 0) {
    return { data: null, error: fetchError }
  }

  events.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  return {
    data: buildTimelineForUser(user, events),
    error: fetchError ? `events partial: ${fetchError}` : null,
  }
}
