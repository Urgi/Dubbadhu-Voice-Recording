import * as FileSystem from 'expo-file-system/legacy'
import type { AuthRole } from '../types'

export type StoredSession = {
  role: AuthRole
  email?: string | null
  savedAt: string
}

const SESSION_FILE_NAME = 'dubbadhu_internal_session.json'

function getSessionFilePath(): string | null {
  if (!FileSystem.documentDirectory) return null
  return `${FileSystem.documentDirectory}${SESSION_FILE_NAME}`
}

export async function loadStoredSession(): Promise<StoredSession | null> {
  try {
    const path = getSessionFilePath()
    if (!path) return null
    const info = await FileSystem.getInfoAsync(path)
    if (!info.exists) return null
    const raw = await FileSystem.readAsStringAsync(path)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSession
    if (parsed && typeof parsed.role === 'string') {
      return parsed
    }
    return null
  } catch (e) {
    console.warn('[sessionStorage] Failed to read stored session:', e)
    return null
  }
}

export async function saveStoredSession(session: StoredSession): Promise<void> {
  try {
    const path = getSessionFilePath()
    if (!path) return
    const raw = JSON.stringify(session)
    await FileSystem.writeAsStringAsync(path, raw)
  } catch (e) {
    console.warn('[sessionStorage] Failed to save stored session:', e)
  }
}

export async function clearStoredSession(): Promise<void> {
  try {
    const path = getSessionFilePath()
    if (!path) return
    await FileSystem.deleteAsync(path, { idempotent: true })
  } catch (e) {
    console.warn('[sessionStorage] Failed to clear stored session:', e)
  }
}
