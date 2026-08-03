import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import type { StackScreenProps } from '@react-navigation/stack'
import * as ImagePicker from 'expo-image-picker'
import { AdminTextInput } from '../components/AdminTextInput'
import { ADMIN_ACCENT_GOLD } from '../components/lesson-config/AdminLessonConfigChrome'
import { APP_PROMO_IMAGE_ASPECT, uploadAppPromoImage } from '../lib/appPromoImage'
import {
  APP_PROMO_CTA_TARGETS,
  labelForPromoCtaTarget,
  type AppPromoCtaTarget,
} from '../lib/appPromoTargets'
import supabase from '../lib/supabase'
import type { RootStackParamList } from '../types'

/** iOS keyboard accessory — blue checkmark to dismiss (esp. multiline fields). */
const PROMO_KEYBOARD_ACCESSORY_ID = 'adminPromoKeyboardDone'

type Props = StackScreenProps<RootStackParamList, 'AdminPromo'>

type PromoRow = {
  id: string
  title: string
  body: string
  image_url: string
  cta_target: AppPromoCtaTarget | null
  cta_label: string | null
  event_date: string | null
  is_active: boolean
  updated_at?: string
}

type PromoDraft = {
  id?: string
  title: string
  body: string
  image_url: string
  cta_target: AppPromoCtaTarget | null
  cta_label: string
  /** Optional YYYY-MM-DD for learner date badge. */
  event_date: string
  is_active: boolean
  /** Local uri pending upload on save (new rows without id yet). */
  localImageUri?: string | null
}

function emptyDraft(): PromoDraft {
  return {
    title: '',
    body: '',
    image_url: '',
    cta_target: null,
    cta_label: 'Learn more',
    event_date: '',
    is_active: false,
    localImageUri: null,
  }
}

/** Normalize to YYYY-MM-DD or empty. */
function normalizeEventDateInput(raw: string): string {
  const s = String(raw || '').trim()
  if (!s) return ''
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ''
}

export default function AdminPromoScreen({ navigation }: Props) {
  const [rows, setRows] = useState<PromoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState<PromoDraft>(() => emptyDraft())
  const [keyboardVisible, setKeyboardVisible] = useState(false)

  useEffect(() => {
    if (!editorOpen || Platform.OS !== 'android') {
      setKeyboardVisible(false)
      return undefined
    }
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true))
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [editorOpen])

  const load = useCallback(async () => {
    setError('')
    const { data, error: err } = await supabase
      .from('app_promos')
      .select('id, title, body, image_url, cta_target, cta_label, event_date, is_active, updated_at')
      .order('updated_at', { ascending: false })
    if (err) {
      setError(err.message)
      setRows([])
    } else {
      setRows(
        (data || []).map((row) => ({
          ...(row as PromoRow),
          event_date: row.event_date
            ? normalizeEventDateInput(String(row.event_date))
            : null,
        })),
      )
    }
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
      title: 'App promo',
      headerStyle: { backgroundColor: '#000000' },
      headerTitleStyle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
      headerTintColor: '#ffffff',
      headerRight: () => (
        <Pressable
          onPress={() => {
            setDraft(emptyDraft())
            setEditorOpen(true)
          }}
          style={{ paddingHorizontal: 12, paddingVertical: 6 }}
        >
          <Text style={{ color: ADMIN_ACCENT_GOLD, fontWeight: '700' }}>Add</Text>
        </Pressable>
      ),
    })
  }, [navigation])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const openEdit = useCallback((row: PromoRow) => {
    setDraft({
      id: row.id,
      title: row.title || '',
      body: row.body || '',
      image_url: row.image_url || '',
      cta_target: row.cta_target,
      cta_label: row.cta_label || 'Learn more',
      event_date: row.event_date || '',
      is_active: row.is_active === true,
      localImageUri: null,
    })
    setEditorOpen(true)
  }, [])

  const pickImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to choose a promo image.')
      return
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: APP_PROMO_IMAGE_ASPECT,
      quality: 0.85,
    })
    if (picked.canceled || !picked.assets?.[0]?.uri) return
    const uri = picked.assets[0].uri

    if (draft.id) {
      setUploading(true)
      const result = await uploadAppPromoImage(uri, draft.id)
      setUploading(false)
      if ('error' in result) {
        Alert.alert('Upload failed', result.error)
        return
      }
      setDraft((d) => ({ ...d, image_url: result.publicUrl, localImageUri: null }))
      return
    }

    setDraft((d) => ({ ...d, localImageUri: uri, image_url: uri }))
  }, [draft.id])

  const saveDraft = useCallback(async () => {
    const title = draft.title.trim()
    const body = draft.body.trim()
    if (!title || !body) {
      Alert.alert('Missing fields', 'Title and body are required.')
      return
    }
    if (!draft.image_url && !draft.localImageUri) {
      Alert.alert('Missing image', 'Pick a promo image before saving.')
      return
    }

    const eventDateRaw = draft.event_date.trim()
    let eventDate: string | null = null
    if (eventDateRaw) {
      eventDate = normalizeEventDateInput(eventDateRaw)
      if (!eventDate) {
        Alert.alert('Invalid date', 'Use YYYY-MM-DD for the optional event date, or leave it blank.')
        return
      }
    }

    setSaving(true)
    try {
      let savedId = draft.id || ''
      let imageUrl = draft.image_url.startsWith('http') ? draft.image_url : ''

      if (!savedId) {
        const { data, error: err } = await supabase
          .from('app_promos')
          .insert({
            title,
            body,
            image_url: '',
            cta_target: draft.cta_target,
            cta_label: draft.cta_target ? draft.cta_label.trim() || 'Learn more' : null,
            event_date: eventDate,
            is_active: false,
          })
          .select('id')
          .single()
        if (err || !data?.id) {
          Alert.alert('Save failed', err?.message || 'Could not create promo row.')
          return
        }
        savedId = data.id
      }

      if (draft.localImageUri) {
        const result = await uploadAppPromoImage(draft.localImageUri, savedId)
        if ('error' in result) {
          Alert.alert('Image upload failed', result.error)
          return
        }
        imageUrl = result.publicUrl
      }

      if (!imageUrl) {
        Alert.alert('Missing image', 'Pick a promo image before saving.')
        return
      }

      if (draft.is_active) {
        await supabase.from('app_promos').update({ is_active: false }).neq('id', savedId)
      }

      const { error: err } = await supabase
        .from('app_promos')
        .update({
          title,
          body,
          image_url: imageUrl,
          cta_target: draft.cta_target,
          cta_label: draft.cta_target ? draft.cta_label.trim() || 'Learn more' : null,
          event_date: eventDate,
          is_active: draft.is_active,
        })
        .eq('id', savedId)

      if (err) {
        Alert.alert('Save failed', err.message)
        return
      }

      setEditorOpen(false)
      await load()
    } finally {
      setSaving(false)
    }
  }, [draft, load])

  const removePromo = useCallback(
    (row: PromoRow) => {
      Alert.alert('Delete promo?', row.title || 'Untitled', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const { error: err } = await supabase.from('app_promos').delete().eq('id', row.id)
              if (err) Alert.alert('Delete failed', err.message)
              else await load()
            })()
          },
        },
      ])
    },
    [load],
  )

  const previewUri = draft.localImageUri || draft.image_url

  return (
    <View style={styles.screen}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={ADMIN_ACCENT_GOLD} style={{ marginTop: 24 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <Text style={styles.hint}>
            Learners see the active promo once after login (until you activate a different one).
            Only one promo can be active at a time.
          </Text>
          {rows.length === 0 ? (
            <Text style={styles.empty}>No promos yet. Tap Add.</Text>
          ) : null}
          {rows.map((row) => (
            <View key={row.id} style={styles.card}>
              <Pressable onPress={() => openEdit(row)} style={styles.cardPress}>
                {row.image_url ? (
                  <Image source={{ uri: row.image_url }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Text style={styles.thumbEmptyText}>No image</Text>
                  </View>
                )}
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>
                    {row.title || 'Untitled'}
                    {row.is_active ? ' · active' : ''}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={2}>
                    {row.body}
                  </Text>
                  <Text style={styles.cardMeta}>
                    CTA: {labelForPromoCtaTarget(row.cta_target)}
                    {row.event_date ? ` · ${row.event_date}` : ''}
                  </Text>
                </View>
              </Pressable>
              <View style={styles.cardActions}>
                <Pressable onPress={() => openEdit(row)}>
                  <Text style={styles.action}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => removePromo(row)}>
                  <Text style={[styles.action, styles.actionDanger]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <Modal
        visible={editorOpen}
        animationType="slide"
        transparent
        onRequestClose={() => {
          Keyboard.dismiss()
          setEditorOpen(false)
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{draft.id ? 'Edit promo' : 'Add promo'}</Text>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            >
              <Text style={styles.label}>Title *</Text>
              <AdminTextInput
                style={styles.input}
                placeholderTextColor="#666"
                value={draft.title}
                onChangeText={(title) => setDraft((d) => ({ ...d, title }))}
                inputAccessoryViewID={
                  Platform.OS === 'ios' ? PROMO_KEYBOARD_ACCESSORY_ID : undefined
                }
              />
              <Text style={styles.label}>Body *</Text>
              <AdminTextInput
                style={[styles.input, styles.inputMulti]}
                allowMultiline
                placeholderTextColor="#666"
                value={draft.body}
                onChangeText={(body) => setDraft((d) => ({ ...d, body }))}
                inputAccessoryViewID={
                  Platform.OS === 'ios' ? PROMO_KEYBOARD_ACCESSORY_ID : undefined
                }
              />
              <Text style={styles.label}>Image *</Text>
              {previewUri ? (
                <Image source={{ uri: previewUri }} style={styles.preview} />
              ) : null}
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => {
                  Keyboard.dismiss()
                  void pickImage()
                }}
                disabled={uploading}
              >
                <Text style={styles.secondaryBtnText}>
                  {uploading ? 'Uploading…' : previewUri ? 'Change image' : 'Pick image'}
                </Text>
              </Pressable>

              <Text style={styles.label}>Event date (optional)</Text>
              <AdminTextInput
                style={styles.input}
                placeholderTextColor="#666"
                placeholder="YYYY-MM-DD"
                value={draft.event_date}
                onChangeText={(event_date) => setDraft((d) => ({ ...d, event_date }))}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
                inputAccessoryViewID={
                  Platform.OS === 'ios' ? PROMO_KEYBOARD_ACCESSORY_ID : undefined
                }
              />
              <Text style={styles.fieldHint}>
                Shown as a gold badge (e.g. 15 August). Leave blank for no badge.
              </Text>

              <Text style={styles.label}>CTA destination (optional)</Text>
              <View style={styles.typeRow}>
                <Pressable
                  style={[styles.typeChip, draft.cta_target == null && styles.typeChipOn]}
                  onPress={() => setDraft((d) => ({ ...d, cta_target: null }))}
                >
                  <Text style={styles.typeChipText}>None</Text>
                </Pressable>
                {APP_PROMO_CTA_TARGETS.map((t) => (
                  <Pressable
                    key={t.key}
                    style={[styles.typeChip, draft.cta_target === t.key && styles.typeChipOn]}
                    onPress={() => setDraft((d) => ({ ...d, cta_target: t.key }))}
                  >
                    <Text style={styles.typeChipText}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>

              {draft.cta_target ? (
                <>
                  <Text style={styles.label}>CTA button label</Text>
                  <AdminTextInput
                    style={styles.input}
                    placeholderTextColor="#666"
                    placeholder="Learn more"
                    value={draft.cta_label}
                    onChangeText={(cta_label) => setDraft((d) => ({ ...d, cta_label }))}
                    inputAccessoryViewID={
                      Platform.OS === 'ios' ? PROMO_KEYBOARD_ACCESSORY_ID : undefined
                    }
                  />
                </>
              ) : null}

              <View style={styles.publishRow}>
                <Text style={styles.label}>Active (show to learners)</Text>
                <Switch
                  value={draft.is_active}
                  onValueChange={(is_active) => setDraft((d) => ({ ...d, is_active }))}
                  trackColor={{ true: ADMIN_ACCENT_GOLD }}
                />
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  Keyboard.dismiss()
                  setEditorOpen(false)
                }}
                disabled={saving}
              >
                <Text style={styles.action}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  Keyboard.dismiss()
                  void saveDraft()
                }}
                disabled={saving || uploading}
              >
                <Text style={[styles.action, styles.actionPrimary]}>
                  {saving ? 'Saving…' : 'Save'}
                </Text>
              </Pressable>
            </View>
          </View>

          {Platform.OS === 'ios' ? (
            <InputAccessoryView nativeID={PROMO_KEYBOARD_ACCESSORY_ID}>
              <View style={styles.keyboardAccessory}>
                <View style={{ flex: 1 }} />
                <Pressable
                  onPress={() => Keyboard.dismiss()}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss keyboard"
                  style={styles.keyboardAccessoryBtn}
                >
                  <Text style={styles.keyboardAccessoryCheck}>✓</Text>
                </Pressable>
              </View>
            </InputAccessoryView>
          ) : null}

          {Platform.OS === 'android' && keyboardVisible ? (
            <Pressable
              onPress={() => Keyboard.dismiss()}
              accessibilityRole="button"
              accessibilityLabel="Dismiss keyboard"
              style={styles.androidKeyboardDismiss}
            >
              <Text style={styles.keyboardAccessoryCheck}>✓</Text>
            </Pressable>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  hint: { color: '#9ca3af', fontSize: 13, lineHeight: 18, marginBottom: 4 },
  empty: { color: '#6b7280', marginTop: 12 },
  error: { color: '#f87171', padding: 16 },
  card: {
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#262626',
    padding: 12,
    gap: 10,
  },
  cardPress: { flexDirection: 'row', gap: 12 },
  thumb: { width: 64, height: 80, borderRadius: 8, backgroundColor: '#1f1f1f' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  thumbEmptyText: { color: '#6b7280', fontSize: 10 },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cardMeta: { color: '#9ca3af', fontSize: 12 },
  cardActions: { flexDirection: 'row', gap: 16 },
  action: { color: '#d1d5db', fontWeight: '600' },
  actionDanger: { color: '#f87171' },
  actionPrimary: { color: ADMIN_ACCENT_GOLD },
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#111',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '92%',
    flexGrow: 0,
  },
  modalScroll: { maxHeight: 520 },
  modalScrollContent: { paddingBottom: 16 },
  modalTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 12 },
  label: { color: '#9ca3af', fontSize: 12, marginBottom: 6, marginTop: 10 },
  fieldHint: { color: '#6b7280', fontSize: 11, marginTop: 4, lineHeight: 15 },
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
  inputMulti: { minHeight: 88, textAlignVertical: 'top' },
  keyboardAccessory: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#3a3a3c',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  keyboardAccessoryBtn: {
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyboardAccessoryCheck: {
    color: '#0A84FF',
    fontSize: 22,
    fontWeight: '700',
  },
  androidKeyboardDismiss: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1c1c1e',
    borderWidth: 1,
    borderColor: '#0A84FF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  preview: {
    width: '100%',
    aspectRatio: 4 / 5,
    maxHeight: 220,
    borderRadius: 10,
    backgroundColor: '#1f1f1f',
    marginBottom: 8,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: ADMIN_ACCENT_GOLD,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 4,
  },
  secondaryBtnText: { color: ADMIN_ACCENT_GOLD, fontWeight: '700' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  typeChipOn: { borderColor: ADMIN_ACCENT_GOLD, backgroundColor: 'rgba(212,164,55,0.15)' },
  typeChipText: { color: '#e5e7eb', fontSize: 12, fontWeight: '600' },
  publishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 8,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#262626',
    marginTop: 8,
  },
})
