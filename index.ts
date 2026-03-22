import 'react-native-gesture-handler'
import Constants from 'expo-constants'
import { NativeModules, Platform } from 'react-native'
import { registerRootComponent } from 'expo'

import App from './App'

// #region agent log
fetch('http://127.0.0.1:7368/ingest/1a847bd9-12c4-48d2-a910-d8089982a954', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '84b6a0' },
  body: JSON.stringify({
    sessionId: '84b6a0',
    location: 'index.ts:startup',
    message: 'ExponentAV / runtime probe',
    data: {
      platform: Platform.OS,
      executionEnvironment: (Constants as { executionEnvironment?: string }).executionEnvironment,
      nativeAppVersion: (Constants as { nativeAppVersion?: string }).nativeAppVersion,
      expoVersion: (Constants as { expoVersion?: string }).expoVersion,
      hasExponentAV: !!(NativeModules as Record<string, unknown>).ExponentAV,
      nativeKeysSample: Object.keys(NativeModules)
        .filter((k) => /AV|Exponent|Audio|EXAV/i.test(k))
        .slice(0, 25),
    },
    timestamp: Date.now(),
    hypothesisId: 'H1-web H2-expo-go-mismatch H3-missing-native-build',
    runId: 'pre-fix',
  }),
}).catch(() => {})
// #endregion

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App)
