import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../types'
import { useAuth } from '../context/AuthContext'

type Props = StackScreenProps<RootStackParamList, 'Login'>

const ADMIN_PASSWORD = 'dubbadhu-admin'
const VOICE_PASSWORD = 'dubbadhu-voice'

export default function LoginScreen({ navigation }: Props) {
  const { setRole } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const onSignIn = () => {
    if (password === ADMIN_PASSWORD) {
      setRole('admin')
      setError('')
      navigation.navigate('ModeSelect', { role: 'admin' })
      return
    }

    if (password === VOICE_PASSWORD) {
      setRole('voice')
      setError('')
      navigation.navigate('ModeSelect', { role: 'voice' })
      return
    }

    setError('Incorrect password')
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dubbadhu Voice Recording</Text>

      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Enter password"
        placeholderTextColor="#a1a1aa"
        secureTextEntry
        autoCapitalize="none"
        style={styles.input}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.button} onPress={onSignIn}>
        <Text style={styles.buttonText}>Sign In</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 20,
    paddingTop: 72,
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 28,
  },
  input: {
    backgroundColor: '#18181b',
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  error: {
    color: '#f87171',
    marginTop: 10,
    marginBottom: 4,
    fontSize: 14,
  },
  button: {
    marginTop: 16,
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
})
