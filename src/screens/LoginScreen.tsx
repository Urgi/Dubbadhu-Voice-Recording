import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../types'
import { useAuth } from '../context/AuthContext'

type Props = StackScreenProps<RootStackParamList, 'Login'>

const PIN_LENGTH = 4
const ADMIN_PIN = '5139'
const VOICE_PIN = '3142'
const PROFESSOR_PIN = '4126'

const KEYPAD_ROWS: (string | null)[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [null, '0', 'delete'],
]

export default function LoginScreen({ navigation }: Props) {
  const { setRole } = useAuth()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  const tryComplete = useCallback(
    (fullPin: string) => {
      if (fullPin === ADMIN_PIN) {
        setRole('admin')
        setError('')
        setPin('')
        navigation.reset({ index: 0, routes: [{ name: 'AdminHome' }] })
        return
      }
      if (fullPin === VOICE_PIN) {
        setRole('voice')
        setError('')
        setPin('')
        navigation.reset({ index: 0, routes: [{ name: 'VoiceActorDashboard' }] })
        return
      }
      if (fullPin === PROFESSOR_PIN) {
        setRole('professor')
        setError('')
        setPin('')
        navigation.reset({ index: 0, routes: [{ name: 'ProfessorHome' }] })
        return
      }
      setError('Incorrect PIN')
      setPin('')
    },
    [navigation, setRole],
  )

  const onDigit = useCallback(
    (d: string) => {
      setError('')
      setPin((prev) => {
        if (prev.length >= PIN_LENGTH) return prev
        const next = prev + d
        if (next.length === PIN_LENGTH) {
          setTimeout(() => tryComplete(next), 0)
        }
        return next
      })
    },
    [tryComplete],
  )

  const onDelete = useCallback(() => {
    setError('')
    setPin((prev) => prev.slice(0, -1))
  }, [])

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dubbadhu Internal</Text>
      <Text style={styles.subtitle}>Enter your PIN</Text>

      <View style={styles.dotsRow}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <View
            key={i}
            style={[styles.dot, i < pin.length ? styles.dotFilled : styles.dotEmpty]}
          />
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : <View style={styles.errorSpacer} />}

      <View style={styles.keypad}>
        {KEYPAD_ROWS.map((row, ri) => (
          <View key={ri} style={styles.keypadRow}>
            {row.map((cell, ci) => {
              if (cell === null) {
                return <View key={ci} style={styles.keySpacer} />
              }
              if (cell === 'delete') {
                return (
                  <Pressable
                    key={ci}
                    style={({ pressed }) => [styles.key, styles.keyGhost, pressed && styles.keyPressed]}
                    onPress={onDelete}
                    hitSlop={12}
                  >
                    <Text style={styles.keyDeleteText}>⌫</Text>
                  </Pressable>
                )
              }
              return (
                <Pressable
                  key={ci}
                  style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                  onPress={() => onDigit(cell)}
                >
                  <Text style={styles.keyText}>{cell}</Text>
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>
    </View>
  )
}

const KEY_SIZE = 78

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 24,
    paddingTop: 72,
    alignItems: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#a1a1aa',
    fontSize: 16,
    marginBottom: 36,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 18,
    marginBottom: 16,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
  },
  dotEmpty: {
    borderColor: '#52525b',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    borderColor: '#ffffff',
    backgroundColor: '#ffffff',
  },
  error: {
    color: '#f87171',
    fontSize: 14,
    marginBottom: 20,
    minHeight: 20,
  },
  errorSpacer: {
    minHeight: 20,
    marginBottom: 20,
  },
  keypad: {
    marginTop: 8,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 24,
  },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
    backgroundColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  keyGhost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  keyPressed: {
    opacity: 0.65,
  },
  keySpacer: {
    width: KEY_SIZE,
    height: KEY_SIZE,
  },
  keyText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '400',
  },
  keyDeleteText: {
    color: '#a1a1aa',
    fontSize: 26,
    fontWeight: '400',
  },
})
