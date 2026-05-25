import { useLayoutEffect, useCallback } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import { ADMIN_ACCENT_GOLD } from '../components/lesson-config/AdminLessonConfigChrome'
import { useAuth } from '../context/AuthContext'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'VoiceActorHome'>

export default function VoiceActorHomeScreen({ navigation }: Props) {
  const { setRole } = useAuth()

  const onSignOut = useCallback(() => {
    setRole(null)
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] })
  }, [navigation, setRole])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Voice Actor Hub',
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
      <Pressable
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        onPress={() => navigation.navigate('VoiceActorDashboard')}
      >
        <Text style={styles.tileTitle}>Voice Recording</Text>
        <Text style={styles.recordedLine}>Vocabulary word bank + lesson series queues</Text>
        <Text style={styles.tileHint}>Record pending and re-requested words; vocabulary is listed first</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        onPress={() => navigation.navigate('QubeeLettersHub')}
      >
        <Text style={styles.tileTitle}>Qubee Letters</Text>
        <Text style={styles.recordedLine}>Alphabet — one recording per example word</Text>
        <Text style={styles.tileHint}>One pronunciation clip per letter; admin approves before learners hear audio</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        onPress={() => navigation.navigate('AdminVocabIllustrationReview')}
      >
        <Text style={styles.tileTitle}>Vocab Center</Text>
        <Text style={styles.recordedLine}>Edit words, translations, and example sentences</Text>
        <Text style={styles.tileHint}>Add new vocabulary words here; illustration tools remain admin-only</Text>
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
  tile: {
    backgroundColor: '#1c1c1e',
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 0,
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
    fontWeight: '400',
    marginTop: 10,
    lineHeight: 20,
  },
  tileHint: {
    color: '#8e8e93',
    fontSize: 13,
    fontWeight: '400',
    marginTop: 8,
    lineHeight: 18,
  },
})
