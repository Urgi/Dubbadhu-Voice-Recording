import { Text, View } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'VoiceActorQueue'>

export default function VoiceActorQueueScreen({}: Props) {
  return (
    <View>
      <Text>VoiceActorQueueScreen</Text>
    </View>
  )
}
