import { useCallback } from 'react'
import { Audio } from 'expo-av'

export const useAudioRecorder = () => {
  const requestPermission = useCallback(async () => {
    const { granted } = await Audio.requestPermissionsAsync()
    return granted
  }, [])

  return {
    requestPermission,
  }
}
