import { Suspense, lazy } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import LoginScreen from './src/screens/LoginScreen'
import ModeSelectScreen from './src/screens/ModeSelectScreen'
import AdminSeriesListScreen from './src/screens/AdminSeriesListScreen'
import AdminSeriesDetailScreen from './src/screens/AdminSeriesDetailScreen'
import VoiceActorDashboardScreen from './src/screens/VoiceActorDashboardScreen'
import { AuthProvider } from './src/context/AuthContext'
import type { RootStackParamList } from './src/types'

/** Lazy: load expo-av only when needed — avoids ExponentAV / runtime init races on iOS. */
const RecordingScreen = lazy(() => import('./src/screens/RecordingScreen'))
const ReviewScreen = lazy(() => import('./src/screens/ReviewScreen'))

const Stack = createStackNavigator<RootStackParamList>()

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <SafeAreaProvider>
          <NavigationContainer>
            <Suspense
              fallback={
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' }}>
                  <ActivityIndicator color="#fff" />
                </View>
              }
            >
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
                <Stack.Screen name="AdminSeriesList" component={AdminSeriesListScreen} options={{ title: 'Word Manager' }} />
                <Stack.Screen name="AdminSeriesDetail" component={AdminSeriesDetailScreen} />
                <Stack.Screen
                  name="VoiceActorDashboard"
                  component={VoiceActorDashboardScreen}
                  options={{ title: 'Recording Studio' }}
                />
                <Stack.Screen name="Recording" component={RecordingScreen} options={{ title: 'Recording' }} />
                <Stack.Screen name="Review" component={ReviewScreen} options={{ title: 'Review' }} />
              </Stack.Navigator>
            </Suspense>
          </NavigationContainer>
        </SafeAreaProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  )
}
