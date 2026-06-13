import { useLayoutEffect, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import { useRemoteAudioUrl } from '../hooks/useRemoteAudioUrl'
import { useAuth } from '../context/AuthContext'
import type { RecordingWord, RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'Review'>

function doneRouteForTable(
  recordingTable: RootStackParamList['Review']['recordingTable'],
): keyof RootStackParamList {
  if (recordingTable === 'fidel_letters') return 'FidelLettersHub'
  if (recordingTable === 'qubee_letters') return 'QubeeLettersHub'
  return 'VoiceActorHome'
}

export default function ReviewScreen({ navigation, route }: Props) {
  const { recordedWords, recordingTable } = route.params
  const { role } = useAuth()
  const [submitted, setSubmitted] = useState(false)
  const { playUrl, playingId } = useRemoteAudioUrl()

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Review & Submit' })
  }, [navigation])

  const onDone = () => {
    if (recordingTable === 'fidel_letters' && role === 'fidel') {
      navigation.reset({
        index: 1,
        routes: [{ name: 'FidelRecorderHome' }, { name: 'FidelLettersHub' }],
      })
      return
    }
    const routeName = doneRouteForTable(recordingTable)
    navigation.reset({
      index: 0,
      routes: [{ name: routeName }],
    })
  }

  const onSubmitAll = () => {
    setSubmitted(true)
  }

  const renderItem = ({ item }: { item: RecordingWord }) => (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        {item.fidelSymbol ? (
          <Text style={styles.fidelSymbol}>{item.fidelSymbol}</Text>
        ) : null}
        <Text style={styles.word}>{item.word}</Text>
        <Text style={styles.series}>{item.series}</Text>
        <View style={styles.actions}>
          <Pressable
            style={styles.pillBtn}
            onPress={() => void playUrl(item.slow_audio_url, `${item.id}-slow`)}
          >
            <Text style={styles.pillBtnText}>
              {playingId === `${item.id}-slow` ? 'Stop' : 'Play'}
            </Text>
          </Pressable>
          {!recordingTable || recordingTable === 'words' ? (
            <Pressable
              style={styles.pillBtn}
              onPress={() => void playUrl(item.fast_audio_url, `${item.id}-fast`)}
            >
              <Text style={styles.pillBtnText}>
                {playingId === `${item.id}-fast` ? 'Stop fast' : 'Play fast'}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() =>
            navigation.replace('Recording', {
              words: [item],
              mergeIntoSession: recordedWords,
              recordingTable,
            })
          }
        >
          <Text style={styles.reRecord}>Re-record</Text>
        </Pressable>
      </View>
    </View>
  )

  if (submitted) {
    return (
      <View style={styles.screen}>
        <Text style={styles.successTitle}>
          {recordedWords.length} recordings submitted! Great work.
        </Text>
        <Pressable style={styles.doneBtn} onPress={onDone}>
          <Text style={styles.doneBtnText}>
            {recordingTable === 'fidel_letters'
              ? 'Back to Fidel letters'
              : recordingTable === 'qubee_letters'
                ? 'Back to Qubee letters'
                : 'Back to studio'}
          </Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Review & Submit</Text>
      <Text style={styles.subtitle}>{recordedWords.length} words recorded this session</Text>
      <FlatList
        data={recordedWords}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
      <Pressable style={styles.submitBtn} onPress={onSubmitAll}>
        <Text style={styles.submitBtnText}>Submit All</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    padding: 20,
    paddingBottom: 28,
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: '#888888',
    fontSize: 15,
    marginTop: 6,
    marginBottom: 16,
  },
  list: {
    paddingBottom: 16,
  },
  row: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  rowMain: {},
  fidelSymbol: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 4,
  },
  word: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  series: {
    color: '#888888',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  pillBtn: {
    backgroundColor: '#2e1064',
    borderWidth: 1,
    borderColor: '#7C3AED',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
    marginBottom: 8,
  },
  pillBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  reRecord: {
    color: '#888888',
    fontSize: 14,
    marginTop: 4,
  },
  submitBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  successTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 40,
    marginBottom: 24,
  },
  doneBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: 32,
  },
  doneBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
})
