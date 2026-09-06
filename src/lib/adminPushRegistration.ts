import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import supabase from './supabase'

export const ADMIN_USER_ID = '7c39d3b7-72f3-4b2d-ad1c-4225404ffb63'

export async function registerAdminPushToken(): Promise<string | null> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }
    if (finalStatus !== 'granted') {
      return null
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId ||
      '010b8b9a-d251-4bfc-927a-e2f7b3495c63'

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    })
    const token = tokenData?.data
    if (!token || !token.startsWith('ExponentPushToken[')) {
      return null
    }

    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: ADMIN_USER_ID,
        expo_push_token: token,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'expo_push_token' },
    )

    if (error) {
      console.warn('[adminPushRegistration] Error saving push token:', error.message)
    } else {
      console.log('[adminPushRegistration] Admin push token registered')
    }
    return token
  } catch (err) {
    console.warn('[adminPushRegistration] Error getting push token:', err)
    return null
  }
}
