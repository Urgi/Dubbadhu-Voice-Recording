import { Suspense, lazy } from 'react'
import { ActivityIndicator, Platform, StatusBar, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import LoginScreen from './src/screens/LoginScreen'
import ProfessorHomeScreen from './src/screens/ProfessorHomeScreen'
import AdminHomeScreen from './src/screens/AdminHomeScreen'
import AdminAnalyticsScreen from './src/screens/AdminAnalyticsScreen'
import AdminSeriesListScreen from './src/screens/AdminSeriesListScreen'
import AdminSeriesDetailScreen from './src/screens/AdminSeriesDetailScreen'
import AdminAudioReviewScreen from './src/screens/AdminAudioReviewScreen'
import AdminSeriesAudioReviewScreen from './src/screens/AdminSeriesAudioReviewScreen'
import LessonConfigScreen from './src/screens/LessonConfigScreen'
import LessonConfigSeriesScreen from './src/screens/LessonConfigSeriesScreen'
import LessonConfigDetailScreen from './src/screens/LessonConfigDetailScreen'
import VoiceActorDashboardScreen from './src/screens/VoiceActorDashboardScreen'
import { AuthProvider } from './src/context/AuthContext'
import type { RootStackParamList } from './src/types'

/** Lazy: load expo-av only when needed — avoids ExponentAV / runtime init races on iOS. */
const RecordingScreen = lazy(() => import('./src/screens/RecordingScreen'))
const ReviewScreen = lazy(() => import('./src/screens/ReviewScreen'))

const Stack = createStackNavigator<RootStackParamList>()

function AppStack() {
  const insets = useSafeAreaInsets()
  const statusBarHeight =
    Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : Math.max(insets.top, 0)
  return (
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
          headerStatusBarHeight: statusBarHeight,
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ProfessorHome" component={ProfessorHomeScreen} />
        <Stack.Screen name="AdminHome" component={AdminHomeScreen} options={{ title: 'Admin Control Center' }} />
        <Stack.Screen name="LessonConfig" component={LessonConfigScreen} options={{ title: 'Series Config' }} />
        <Stack.Screen name="LessonConfigSeries" component={LessonConfigSeriesScreen} />
        <Stack.Screen name="LessonConfigDetail" component={LessonConfigDetailScreen} />
        <Stack.Screen name="AdminAnalytics" component={AdminAnalyticsScreen} />
        <Stack.Screen name="AdminSeriesList" component={AdminSeriesListScreen} options={{ title: 'Voice Recording' }} />
        <Stack.Screen name="AdminSeriesDetail" component={AdminSeriesDetailScreen} />
        <Stack.Screen name="AdminAudioReview" component={AdminAudioReviewScreen} />
        <Stack.Screen name="AdminSeriesAudioReview" component={AdminSeriesAudioReviewScreen} />
        <Stack.Screen
          name="VoiceActorDashboard"
          component={VoiceActorDashboardScreen}
          options={{ title: 'Home' }}
        />
        <Stack.Screen name="Recording" component={RecordingScreen} options={{ title: 'Recording' }} />
        <Stack.Screen name="Review" component={ReviewScreen} options={{ title: 'Review' }} />
      </Stack.Navigator>
    </Suspense>
  )
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <SafeAreaProvider>
          <NavigationContainer>
            <AppStack />
          </NavigationContainer>
        </SafeAreaProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  )
}
