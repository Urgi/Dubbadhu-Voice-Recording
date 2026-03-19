import { Text, View } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminWordInput'>

export default function AdminWordInputScreen({}: Props) {
  return (
    <View>
      <Text>AdminWordInputScreen</Text>
    </View>
  )
}
