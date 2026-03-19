import { NavigationContainer } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import LoginScreen from './src/screens/LoginScreen'
import ModeSelectScreen from './src/screens/ModeSelectScreen'
import AdminWordInputScreen from './src/screens/AdminWordInputScreen'
import VoiceActorQueueScreen from './src/screens/VoiceActorQueueScreen'
import RecordingScreen from './src/screens/RecordingScreen'
import ReviewScreen from './src/screens/ReviewScreen'
import type { RootStackParamList } from './src/types'

const Stack = createStackNavigator<RootStackParamList>()

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Login">
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="ModeSelect" component={ModeSelectScreen} />
          <Stack.Screen name="AdminWordInput" component={AdminWordInputScreen} />
          <Stack.Screen name="VoiceActorQueue" component={VoiceActorQueueScreen} />
          <Stack.Screen name="Recording" component={RecordingScreen} />
          <Stack.Screen name="Review" component={ReviewScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  )
}
