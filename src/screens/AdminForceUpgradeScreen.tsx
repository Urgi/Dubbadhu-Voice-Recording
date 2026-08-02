import { useCallback, useLayoutEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import type { StackScreenProps } from '@react-navigation/stack'
import { ADMIN_ACCENT_GOLD } from '../components/lesson-config/AdminLessonConfigChrome'
import supabase from '../lib/supabase'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminForceUpgrade'>

type ConfigRow = {
  min_ios_version: string
  min_android_version: string
  force_upgrade_message: string
  updated_at?: string
}

const DEFAULT_MESSAGE =
  'A new version of Dubbadhu is required to continue. Please update from the store.'

export default function AdminForceUpgradeScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [minIos, setMinIos] = useState('')
  const [minAndroid, setMinAndroid] = useState('')
  const [message, setMessage] = useState('')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('app_config')
      .select('min_ios_version, min_android_version, force_upgrade_message, updated_at')
      .eq('id', 1)
      .maybeSingle()
    if (error) {
      Alert.alert('Load failed', error.message)
      return
    }
    const row = data as ConfigRow | null
    setMinIos(row?.min_ios_version || '')
    setMinAndroid(row?.min_android_version || '')
    setMessage(row?.force_upgrade_message || '')
    setUpdatedAt(row?.updated_at || null)
  }, [])

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

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Force upgrade',
      headerStyle: { backgroundColor: '#000000' },
      headerTitleStyle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
      headerTintColor: '#ffffff',
    })
  }, [navigation])

  const save = useCallback(async () => {
    setSaving(true)
    const { error } = await supabase
      .from('app_config')
      .upsert({
        id: 1,
        min_ios_version: minIos.trim(),
        min_android_version: minAndroid.trim(),
        force_upgrade_message: message.trim(),
      })
    setSaving(false)
    if (error) {
      Alert.alert('Save failed', error.message)
      return
    }
    Alert.alert(
      'Saved',
      minIos.trim() || minAndroid.trim()
        ? 'Learners below these versions will see the update screen on next open.'
        : 'Force upgrade cleared — all versions can open the app.',
    )
    await load()
  }, [minIos, minAndroid, message, load])

  const clearMins = useCallback(() => {
    Alert.alert('Clear minimums?', 'All installed versions will be allowed again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          setMinIos('')
          setMinAndroid('')
        },
      },
    ])
  }, [])

  if (loading) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator color={ADMIN_ACCENT_GOLD} style={{ marginTop: 40 }} />
      </View>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.hint}>
        Leave a version blank to disable the gate for that platform. Use marketing versions
        (e.g. 1.1.60), same as app.json. Only raise mins after the new build is live in the
        stores — and after a breaking schema change.
      </Text>

      {updatedAt ? (
        <Text style={styles.meta}>Last saved: {new Date(updatedAt).toLocaleString()}</Text>
      ) : null}

      <Text style={styles.label}>Min iOS version</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 1.1.60 (blank = off)"
        placeholderTextColor="#666"
        autoCapitalize="none"
        autoCorrect={false}
        value={minIos}
        onChangeText={setMinIos}
      />

      <Text style={styles.label}>Min Android version</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 1.1.60 (blank = off)"
        placeholderTextColor="#666"
        autoCapitalize="none"
        autoCorrect={false}
        value={minAndroid}
        onChangeText={setMinAndroid}
      />

      <Text style={styles.label}>Message (optional)</Text>
      <TextInput
        style={[styles.input, styles.inputMulti]}
        placeholder={DEFAULT_MESSAGE}
        placeholderTextColor="#666"
        multiline
        value={message}
        onChangeText={setMessage}
      />

      <Pressable style={styles.secondaryBtn} onPress={clearMins}>
        <Text style={styles.secondaryBtnText}>Clear minimums</Text>
      </Pressable>

      <Pressable
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={() => void save()}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 16, paddingBottom: 48 },
  hint: { color: '#9ca3af', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  meta: { color: '#6b7280', fontSize: 12, marginBottom: 12 },
  label: { color: '#9ca3af', fontSize: 12, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  inputMulti: { minHeight: 100, textAlignVertical: 'top' },
  secondaryBtn: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#d1d5db', fontWeight: '700' },
  saveBtn: {
    marginTop: 12,
    backgroundColor: ADMIN_ACCENT_GOLD,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#0a0a0a', fontWeight: '800', fontSize: 15 },
})
