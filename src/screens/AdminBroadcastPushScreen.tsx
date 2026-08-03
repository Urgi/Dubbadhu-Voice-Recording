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
import { PushNotificationPreview } from '../components/PushNotificationPreview'
import {
  previewBroadcastRecipients,
  sendAdminBroadcastPush,
} from '../lib/adminBroadcastPush'
import {
  APP_PROMO_CTA_TARGETS,
  labelForPromoCtaTarget,
  type AppPromoCtaTarget,
} from '../lib/appPromoTargets'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminBroadcastPush'>

export default function AdminBroadcastPushScreen({ navigation }: Props) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [ctaTarget, setCtaTarget] = useState<AppPromoCtaTarget | null>(null)
  const [recipients, setRecipients] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState(true)
  const [sending, setSending] = useState(false)

  const refreshCount = useCallback(async () => {
    setLoadingCount(true)
    const result = await previewBroadcastRecipients()
    setLoadingCount(false)
    if (result.ok) setRecipients(result.recipients)
    else {
      setRecipients(null)
      Alert.alert('Could not load recipient count', result.error)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void refreshCount()
    }, [refreshCount]),
  )

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Push broadcast',
      headerStyle: { backgroundColor: '#000000' },
      headerTitleStyle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
      headerTintColor: '#ffffff',
    })
  }, [navigation])

  const onSend = useCallback(() => {
    const t = title.trim()
    const b = body.trim()
    if (!t || !b) {
      Alert.alert('Missing fields', 'Title and body are required.')
      return
    }
    const countLabel = recipients == null ? 'all registered devices' : `${recipients} device(s)`
    Alert.alert(
      'Send push to everyone?',
      `This will notify ${countLabel} that have granted notification permission.\n\n“${t}”`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setSending(true)
              const result = await sendAdminBroadcastPush({
                title: t,
                body: b,
                cta_target: ctaTarget,
              })
              setSending(false)
              if (!result.ok) {
                Alert.alert('Send failed', result.error)
                return
              }
              Alert.alert(
                'Sent',
                `Delivered to Expo for ${result.sent} of ${result.recipients} token(s).`,
              )
              void refreshCount()
            })()
          },
        },
      ],
    )
  }, [title, body, ctaTarget, recipients, refreshCount])

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.hint}>
        Sends a remote Expo push to every learner with a registered push token (notification
        permission granted). Optional tap destination uses the same targets as App promo.
      </Text>

      <View style={styles.countRow}>
        <Text style={styles.countLabel}>Registered tokens</Text>
        {loadingCount ? (
          <ActivityIndicator color={ADMIN_ACCENT_GOLD} />
        ) : (
          <Text style={styles.countValue}>{recipients ?? '—'}</Text>
        )}
        <Pressable onPress={() => void refreshCount()}>
          <Text style={styles.refresh}>Refresh</Text>
        </Pressable>
      </View>

      <PushNotificationPreview
        title={title}
        body={body}
        openHint={ctaTarget ? labelForPromoCtaTarget(ctaTarget) : 'Home'}
      />

      <Text style={styles.label}>Title *</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor="#666"
        maxLength={80}
        value={title}
        onChangeText={setTitle}
        placeholder="What's new"
      />

      <Text style={styles.label}>Body *</Text>
      <TextInput
        style={[styles.input, styles.inputMulti]}
        placeholderTextColor="#666"
        multiline
        maxLength={240}
        value={body}
        onChangeText={setBody}
        placeholder="Short message learners will see in the notification"
      />

      <Text style={styles.label}>Open on tap (optional)</Text>
      <View style={styles.typeRow}>
        <Pressable
          style={[styles.typeChip, ctaTarget == null && styles.typeChipOn]}
          onPress={() => setCtaTarget(null)}
        >
          <Text style={styles.typeChipText}>Home</Text>
        </Pressable>
        {APP_PROMO_CTA_TARGETS.filter((t) => t.key !== 'home').map((t) => (
          <Pressable
            key={t.key}
            style={[styles.typeChip, ctaTarget === t.key && styles.typeChipOn]}
            onPress={() => setCtaTarget(t.key)}
          >
            <Text style={styles.typeChipText}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
        onPress={onSend}
        disabled={sending}
      >
        <Text style={styles.sendBtnText}>{sending ? 'Sending…' : 'Send push to all'}</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 16, paddingBottom: 48, gap: 4 },
  hint: { color: '#9ca3af', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#141414',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#262626',
  },
  countLabel: { color: '#9ca3af', flex: 1 },
  countValue: { color: '#fff', fontWeight: '800', fontSize: 18 },
  refresh: { color: ADMIN_ACCENT_GOLD, fontWeight: '700' },
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
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  typeChip: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  typeChipOn: { borderColor: ADMIN_ACCENT_GOLD, backgroundColor: 'rgba(212,164,55,0.15)' },
  typeChipText: { color: '#e5e7eb', fontSize: 12, fontWeight: '600' },
  sendBtn: {
    marginTop: 24,
    backgroundColor: ADMIN_ACCENT_GOLD,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: { color: '#0a0a0a', fontWeight: '800', fontSize: 15 },
})
