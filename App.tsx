import { NavigationContainer } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import LoginScreen from './src/screens/LoginScreen'
import ModeSelectScreen from './src/screens/ModeSelectScreen'
import AdminWordInputScreen from './src/screens/AdminWordInputScreen'
import VoiceActorQueueScreen from './src/screens/VoiceActorQueueScreen'
import RecordingScreen from './src/screens/RecordingScreen'
import ReviewScreen from './src/screens/ReviewScreen'
import { AuthProvider } from './src/context/AuthContext'
import type { RootStackParamList } from './src/types'

const Stack = createStackNavigator<RootStackParamList>()

export default function App() {
  return (
    <AuthProvider>
      <SafeAreaProvider>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Login"
            screenOptions={{
              headerStyle: { backgroundColor: '#0a0a0a' },
              headerTintColor: '#ffffff',
              headerTitleStyle: { fontSize: 16, fontWeight: '600' },
              headerShadowVisible: false,
              cardStyle: { backgroundColor: '#0a0a0a' },
            }}
          >
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="ModeSelect" component={ModeSelectScreen} options={{ title: 'Select Mode' }} />
            <Stack.Screen name="AdminWordInput" component={AdminWordInputScreen} options={{ title: 'Admin' }} />
            <Stack.Screen name="VoiceActorQueue" component={VoiceActorQueueScreen} options={{ title: 'Voice Actor' }} />
            <Stack.Screen name="Recording" component={RecordingScreen} options={{ title: 'Recording' }} />
            <Stack.Screen name="Review" component={ReviewScreen} options={{ title: 'Review' }} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </AuthProvider>
  )
}
