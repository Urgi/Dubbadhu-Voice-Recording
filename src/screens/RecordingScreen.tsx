import { Text, View } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'Recording'>

export default function RecordingScreen({}: Props) {
  return (
    <View>
      <Text>RecordingScreen</Text>
    </View>
  )
}
