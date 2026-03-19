import { Text, View } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'Login'>

export default function LoginScreen({}: Props) {
  return (
    <View>
      <Text>LoginScreen</Text>
    </View>
  )
}
