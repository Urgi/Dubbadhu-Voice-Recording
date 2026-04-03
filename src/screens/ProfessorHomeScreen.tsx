import { useLayoutEffect, useCallback } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import { useAuth } from '../context/AuthContext'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'ProfessorHome'>

export default function ProfessorHomeScreen({ navigation }: Props) {
  const { setRole } = useAuth()

  const onSignOut = useCallback(() => {
    setRole(null)
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] })
  }, [navigation, setRole])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Professor',
      headerLeft: () => (
        <Pressable onPress={onSignOut} style={styles.headerBtn} hitSlop={8}>
          <Text style={styles.headerBtnText}>Sign out</Text>
        </Pressable>
      ),
    })
  }, [navigation, onSignOut])

  return (
    <View style={styles.screen}>
      <Text style={styles.lead}>Lesson series you can edit while a series is in draft; submit when ready for admin.</Text>
      <Pressable
        style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
        onPress={() => navigation.navigate('LessonConfig')}
        android_ripple={{ color: '#333' }}
      >
        <Text style={styles.primaryBtnText}>Open series config</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'stretch',
    justifyContent: 'center',
    padding: 24,
    gap: 20,
  },
  lead: {
    color: '#a1a1aa',
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  primaryBtn: {
    alignSelf: 'center',
    backgroundColor: '#27272a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d4a853',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 22,
  },
  primaryBtnPressed: { opacity: 0.85 },
  primaryBtnText: { color: '#f4e4bc', fontSize: 16, fontWeight: '700' },
  headerBtn: {
    marginLeft: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  headerBtnText: {
    color: '#a1a1aa',
    fontSize: 15,
    fontWeight: '600',
  },
})
