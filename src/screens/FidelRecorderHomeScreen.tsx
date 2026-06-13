import { useLayoutEffect, useCallback } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import { ADMIN_ACCENT_GOLD } from '../components/lesson-config/AdminLessonConfigChrome'
import { useAuth } from '../context/AuthContext'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'FidelRecorderHome'>

export default function FidelRecorderHomeScreen({ navigation }: Props) {
  const { setRole } = useAuth()

  const onSignOut = useCallback(() => {
    setRole(null)
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] })
  }, [navigation, setRole])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Fidel Recording',
      headerStyle: { backgroundColor: '#000000' },
      headerTitleStyle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
      headerTintColor: '#ffffff',
      headerLeft: () => (
        <Pressable onPress={onSignOut} style={styles.headerBtn} hitSlop={8}>
          <Text style={styles.headerBtnText}>Sign Out</Text>
        </Pressable>
      ),
    })
  }, [navigation, onSignOut])

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.welcome}>Amharic Fidel syllables</Text>
      <Text style={styles.sub}>
        Record one short clip per symbol — the isolated sound learners hear in the quiz.
      </Text>

      <Pressable
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        onPress={() => navigation.navigate('FidelLettersHub')}
      >
        <Text style={styles.tileTitle}>Fidel Letters</Text>
        <Text style={styles.recordedLine}>Full chart — pending / recorded / approved</Text>
        <Text style={styles.tileHint}>Tap a row to record, or batch-record everything still pending</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 14,
  },
  headerBtn: {
    marginLeft: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  headerBtnText: {
    color: '#ebebf5',
    fontSize: 15,
    fontWeight: '500',
  },
  welcome: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  sub: {
    color: '#8e8e93',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  tile: {
    backgroundColor: '#1c1c1e',
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  tilePressed: {
    opacity: 0.92,
  },
  tileTitle: {
    color: ADMIN_ACCENT_GOLD,
    fontSize: 18,
    fontWeight: '700',
  },
  recordedLine: {
    color: '#ffffff',
    fontSize: 15,
    marginTop: 10,
    lineHeight: 20,
  },
  tileHint: {
    color: '#8e8e93',
    fontSize: 13,
    marginTop: 8,
    lineHeight: 18,
  },
})
