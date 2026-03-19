import { Text, View } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'ModeSelect'>

export default function ModeSelectScreen({}: Props) {
  return (
    <View>
      <Text>ModeSelectScreen</Text>
    </View>
  )
}
