import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useLayoutEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import { ADMIN_ACCENT_GOLD } from '../components/lesson-config/AdminLessonConfigChrome'
import type { FreeAccessUserRow } from '../lib/freeAccessUsers'
import {
  fetchFidelBetaUsers,
  fidelBetaDisplayName,
  findUserByPhone,
  grantFidelBetaAccess,
  revokeFidelBetaAccess,
  type FidelBetaRow,
} from '../lib/fidelBetaAccess'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminFidelBeta'>

export default function AdminFidelBetaScreen({ navigation }: Props) {
  const [rows, setRows] = useState<FidelBetaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [phoneQuery, setPhoneQuery] = useState('')
  const [searchBusy, setSearchBusy] = useState(false)
  const [foundUser, setFoundUser] = useState<FreeAccessUserRow | null>(null)
  const [grantBusy, setGrantBusy] = useState(false)

  const loadList = useCallback(async () => {
    setError('')
    const { data, error: err } = await fetchFidelBetaUsers()
    if (err) {
      setError(err)
      setRows([])
    } else {
      setRows(data ?? [])
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void (async () => {
        setLoading(true)
        await loadList()
        if (!cancelled) setLoading(false)
      })()
      return () => {
        cancelled = true
      }
    }, [loadList]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadList()
    setRefreshing(false)
  }, [loadList])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Amharic beta',
      headerStyle: { backgroundColor: '#000000' },
      headerTitleStyle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
      headerTintColor: '#ffffff',
    })
  }, [navigation])

  const onSearch = useCallback(async () => {
    const q = phoneQuery.trim()
    if (!q) {
      Alert.alert('Enter a phone number')
      return
    }
    setSearchBusy(true)
    setFoundUser(null)
    setError('')
    const { user, error: err } = await findUserByPhone(q)
    setSearchBusy(false)
    if (err) {
      Alert.alert('Search failed', err)
      return
    }
    if (!user) {
      Alert.alert('No user', 'No user found with that phone number.')
      return
    }
    setFoundUser(user)
  }, [phoneQuery])

  const onGrantFound = useCallback(() => {
    if (!foundUser) return
    void (async () => {
      setGrantBusy(true)
      try {
        const result = await grantFidelBetaAccess({
          userId: foundUser.id,
          phone: foundUser.phone,
          note: [foundUser.first_name, foundUser.last_name].filter(Boolean).join(' '),
        })
        if (!result.ok) {
          Alert.alert('Could not add', result.error ?? 'Unknown error')
          return
        }
        Alert.alert('Added', 'Amharic Fidel beta access granted. Learner sees it after refresh / relaunch.')
        setFoundUser(null)
        setPhoneQuery('')
        await loadList()
      } finally {
        setGrantBusy(false)
      }
    })()
  }, [foundUser, loadList])

  const onRevoke = useCallback(
    (row: FidelBetaRow) => {
      Alert.alert(
        'Remove from Amharic beta?',
        `${fidelBetaDisplayName(row)} will lose Fidel Continue until re-added.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                const { ok, error: err } = await revokeFidelBetaAccess(row.user_id)
                if (!ok) Alert.alert('Failed', err ?? 'Unknown error')
                else await loadList()
              })()
            },
          },
        ],
      )
    },
    [loadList],
  )

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#fbbf24" />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fbbf24" />
      }
    >
      <Text style={styles.lead}>
        Allowlist for Profile → Languages → Continue (Amharic Fidel). Changes apply without a new
        learner App Store build (needs DB table + an app that reads fidel_beta_access).
      </Text>
      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      <Text style={styles.sectionTitle}>Add by phone</Text>
      <TextInput
        style={styles.input}
        placeholder="Phone (e.g. +16025551234)"
        placeholderTextColor="#636366"
        value={phoneQuery}
        onChangeText={setPhoneQuery}
        keyboardType="phone-pad"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable
        style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
        onPress={() => void onSearch()}
        disabled={searchBusy}
      >
        {searchBusy ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.primaryBtnText}>Search</Text>
        )}
      </Pressable>

      {foundUser ? (
        <View style={styles.foundCard}>
          <Text style={styles.foundTitle}>{fidelBetaDisplayName({
            user_id: foundUser.id,
            phone: foundUser.phone,
            first_name: foundUser.first_name,
            last_name: foundUser.last_name,
          })}</Text>
          <Text style={styles.foundMeta}>{foundUser.phone ?? '—'}</Text>
          <Text style={styles.foundMeta}>id: {foundUser.id}</Text>
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              (pressed || grantBusy) && styles.btnPressed,
            ]}
            onPress={onGrantFound}
            disabled={grantBusy}
          >
            {grantBusy ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.primaryBtnText}>Add to Amharic beta</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>
        Beta users ({rows.length})
      </Text>
      {rows.length === 0 ? (
        <Text style={styles.empty}>No one on the Amharic beta list yet.</Text>
      ) : (
        rows.map((row) => (
          <View key={row.user_id} style={styles.rowCard}>
            <Text style={styles.rowName}>{fidelBetaDisplayName(row)}</Text>
            <Text style={styles.rowMeta}>{row.phone ?? row.user_id}</Text>
            {row.note ? <Text style={styles.rowMeta}>{row.note}</Text> : null}
            <Pressable
              style={({ pressed }) => [styles.revokeBtn, pressed && styles.btnPressed]}
              onPress={() => onRevoke(row)}
            >
              <Text style={styles.revokeBtnText}>Remove</Text>
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  content: { padding: 20, paddingBottom: 40 },
  centered: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lead: {
    color: '#8e8e93',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  errorBanner: { color: '#f87171', marginBottom: 12, fontSize: 14 },
  sectionTitle: {
    color: ADMIN_ACCENT_GOLD,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  sectionTitleSpaced: { marginTop: 24 },
  input: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#ffffff',
    fontSize: 16,
    marginBottom: 10,
  },
  primaryBtn: {
    backgroundColor: '#fbbf24',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  primaryBtnText: { color: '#000000', fontSize: 16, fontWeight: '700' },
  btnPressed: { opacity: 0.88 },
  foundCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    gap: 6,
  },
  foundTitle: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
  foundMeta: { color: '#8e8e93', fontSize: 13 },
  empty: { color: '#8e8e93', fontSize: 14 },
  rowCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  rowName: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  rowMeta: { color: '#8e8e93', fontSize: 13, marginTop: 4, marginBottom: 4 },
  revokeBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f87171',
    marginTop: 6,
  },
  revokeBtnText: { color: '#f87171', fontSize: 14, fontWeight: '600' },
})
