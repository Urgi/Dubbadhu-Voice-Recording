import { useCallback, useLayoutEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import { useFocusEffect } from '@react-navigation/native'
import { useRemoteAudioUrl } from '../hooks/useRemoteAudioUrl'
import {
  VOCABULARY_MERGED_SERIES,
  voiceBankLanguageSqlValues,
} from '../lib/voiceBankLabels'
import { normalizeRecordingWords } from '../lib/wordStatus'
import supabase from '../lib/supabase'
import type { RecordingWord, RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'VoiceActorAwaitingApproval'>

/**
 * Voice actors: relisten to uploaded takes that are still awaiting admin approval,
 * and re-record if they want a better take (stays `recorded` until approved).
 */
export default function VoiceActorAwaitingApprovalScreen({ navigation, route }: Props) {
  const { series, language, vocabOnly } = route.params ?? {}
  const [words, setWords] = useState<RecordingWord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const { playUrl, playingId } = useRemoteAudioUrl()

  const title = vocabOnly
    ? 'Vocabulary · awaiting approval'
    : series
      ? `${series} · awaiting approval`
      : 'Awaiting approval'

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Awaiting approval' })
  }, [navigation])

  const load = useCallback(async () => {
    setError('')
    let q = supabase
      .from('words')
      .select('*')
      .eq('status', 'recorded')
      .order('word', { ascending: true })

    if (vocabOnly) {
      const langVals = voiceBankLanguageSqlValues()
      q = q
        .eq('series', VOCABULARY_MERGED_SERIES)
        .eq('vocab_text_approved', true)
        .in('language', langVals)
    } else if (series != null && language != null) {
      q = q.eq('series', series).eq('language', language)
    } else {
      // All recorded words: vocab (text-approved) + lesson series
      const langVals = voiceBankLanguageSqlValues()
      const [vRes, sRes] = await Promise.all([
        supabase
          .from('words')
          .select('*')
          .eq('status', 'recorded')
          .eq('series', VOCABULARY_MERGED_SERIES)
          .eq('vocab_text_approved', true)
          .in('language', langVals)
          .order('word', { ascending: true }),
        supabase
          .from('words')
          .select('*')
          .eq('status', 'recorded')
          .or(`series.is.null,series.neq.${VOCABULARY_MERGED_SERIES}`)
          .order('series', { ascending: true })
          .order('word', { ascending: true }),
      ])
      const err = vRes.error ?? sRes.error
      if (err) {
        setError(err.message)
        setWords([])
        return
      }
      setWords([
        ...normalizeRecordingWords(vRes.data ?? []),
        ...normalizeRecordingWords(sRes.data ?? []),
      ])
      return
    }

    const { data, error: err } = await q
    if (err) {
      setError(err.message)
      setWords([])
      return
    }
    setWords(normalizeRecordingWords(data ?? []))
  }, [language, series, vocabOnly])

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void (async () => {
        setLoading(true)
        await load()
        if (!cancelled) setLoading(false)
      })()
      return () => {
        cancelled = true
      }
    }, [load]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const onReRecord = useCallback(
    (item: RecordingWord) => {
      navigation.navigate('Recording', {
        words: [item],
        /** Stay on Review with just this word after upload — then back to hub. */
      })
    },
    [navigation],
  )

  const renderItem = ({ item }: { item: RecordingWord }) => {
    const hasSlow = Boolean(item.slow_audio_url?.trim())
    const hasFast = Boolean(item.fast_audio_url?.trim())
    return (
      <View style={styles.row}>
        <Text style={styles.word}>{item.word}</Text>
        <Text style={styles.meta}>
          {item.series}
          {item.language ? ` · ${item.language}` : ''}
        </Text>
        <View style={styles.actions}>
          <Pressable
            style={[styles.pillBtn, !hasSlow && styles.pillBtnDisabled]}
            disabled={!hasSlow}
            onPress={() => void playUrl(item.slow_audio_url, `${item.id}-slow`)}
          >
            <Text style={styles.pillBtnText}>
              {playingId === `${item.id}-slow` ? 'Stop slow' : 'Play slow'}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.pillBtn, !hasFast && styles.pillBtnDisabled]}
            disabled={!hasFast}
            onPress={() => void playUrl(item.fast_audio_url, `${item.id}-fast`)}
          >
            <Text style={styles.pillBtnText}>
              {playingId === `${item.id}-fast` ? 'Stop fast' : 'Play fast'}
            </Text>
          </Pressable>
        </View>
        <Pressable onPress={() => onReRecord(item)} hitSlop={8}>
          <Text style={styles.reRecord}>Re-record</Text>
        </Pressable>
      </View>
    )
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.subtitle}>{title}</Text>
      <Text style={styles.hint}>
        These takes are waiting for admin approval. Listen again anytime, or re-record to replace
        the upload.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={words}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={words.length === 0 ? styles.emptyList : styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No recordings awaiting approval here.</Text>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  centered: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  hint: {
    color: '#a1a1aa',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  error: {
    color: '#f87171',
    marginBottom: 10,
    fontSize: 14,
  },
  list: {
    paddingBottom: 32,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 48,
  },
  emptyText: {
    color: '#a1a1aa',
    fontSize: 15,
    textAlign: 'center',
  },
  row: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  word: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  meta: {
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
  pillBtnDisabled: {
    opacity: 0.4,
  },
  pillBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  reRecord: {
    color: '#a78bfa',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
})
