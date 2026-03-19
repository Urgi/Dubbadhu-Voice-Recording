import { Text, View } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'Review'>

export default function ReviewScreen({}: Props) {
  return (
    <View>
      <Text>ReviewScreen</Text>
    </View>
  )
}
