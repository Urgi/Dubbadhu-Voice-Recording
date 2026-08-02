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
import {
  fetchFreeAccessUsers,
  fetchPendingIdentityUsers,
  findUserByPhone,
  freeAccessDisplayName,
  grantFreeAccess,
  rejectIdentity,
  revokeFreeAccess,
  verifyIdentity,
  type FreeAccessUserRow,
  type PendingIdentityUserRow,
} from '../lib/freeAccessUsers'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'AdminFreeAccess'>

export default function AdminFreeAccessScreen({ navigation }: Props) {
  const [rows, setRows] = useState<FreeAccessUserRow[]>([])
  const [pendingIdentity, setPendingIdentity] = useState<PendingIdentityUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [phoneQuery, setPhoneQuery] = useState('')
  const [searchBusy, setSearchBusy] = useState(false)
  const [foundUser, setFoundUser] = useState<FreeAccessUserRow | null>(null)
  const [grantBusy, setGrantBusy] = useState(false)

  const loadList = useCallback(async () => {
    setError('')
    const [free, pending] = await Promise.all([
      fetchFreeAccessUsers(),
      fetchPendingIdentityUsers(),
    ])
    if (free.error) {
      setError(free.error)
      setRows([])
    } else {
      setRows(free.data ?? [])
    }
    if (pending.error) {
      setError((prev) => prev || pending.error || '')
      setPendingIdentity([])
    } else {
      setPendingIdentity(pending.data ?? [])
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
      title: 'Free access',
      headerStyle: { backgroundColor: '#000000' },
      headerTitleStyle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
      headerTintColor: '#ffffff',
    })
  }, [navigation])

  const runGrant = useCallback(
    async (userId: string, forceClearProductId: boolean) => {
      setGrantBusy(true)
      try {
        const result = await grantFreeAccess(userId, { forceClearProductId })
        if (result.ok) {
          Alert.alert('Done', 'Free access granted (isPremium true, no product id).')
          setFoundUser(null)
          setPhoneQuery('')
          await loadList()
          return
        }
        if ('needsConfirm' in result && result.needsConfirm) {
          Alert.alert('Store subscription on file', result.message, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Grant anyway',
              style: 'destructive',
              onPress: () => void runGrant(userId, true),
            },
          ])
          return
        }
        Alert.alert('Could not grant', 'error' in result ? result.error : 'Unknown error')
      } catch (e) {
        Alert.alert(
          'Could not grant',
          e instanceof Error ? e.message : 'Unexpected error',
        )
      } finally {
        setGrantBusy(false)
      }
    },
    [loadList],
  )

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
    void runGrant(foundUser.id, false)
  }, [foundUser, runGrant])

  const onRevoke = useCallback(
    (row: FreeAccessUserRow) => {
      Alert.alert(
        'Revoke free access?',
        `Remove complimentary Premium for ${freeAccessDisplayName(row)}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Revoke',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                const { ok, error: err } = await revokeFreeAccess(row.id)
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

  const onVerifyIdentity = useCallback(
    (row: PendingIdentityUserRow) => {
      Alert.alert(
        'Mark verified?',
        `${freeAccessDisplayName(row)} — ${row.identity_verify_channel ?? 'messenger'} · ${row.phone ?? ''}${
          row.identity_telegram_username
            ? ` · @${row.identity_telegram_username}`
            : ''
        }`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Verified',
            onPress: () => {
              void (async () => {
                const { ok, error: err } = await verifyIdentity(row.id)
                if (!ok) Alert.alert('Failed', err ?? 'Unknown error')
                else {
                  Alert.alert(
                    'Verified',
                    'Identity verified — Ethiopia lesson access granted (practice tokens still apply).',
                  )
                  await loadList()
                }
              })()
            },
          },
        ],
      )
    },
    [loadList],
  )

  const onRejectIdentity = useCallback(
    (row: PendingIdentityUserRow) => {
      Alert.alert(
        'Reject identity?',
        `This sets Premium off, clamps lessons_completed to at most 1, and marks status rejected for ${freeAccessDisplayName(row)}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reject & restrict',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                const { ok, error: err } = await rejectIdentity(row.id)
                if (!ok) Alert.alert('Failed', err ?? 'Unknown error')
                else {
                  Alert.alert('Restricted', 'Account flagged rejected; free-tier only.')
                  await loadList()
                }
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
        Complimentary Premium: isPremium true and premium_product_id empty (learner app will not
        client-downgrade these users). Rejected ET identity checks strip Premium and clamp progress
        to free-tier (≤1 lesson).
      </Text>
      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      <Text style={styles.sectionTitle}>
        Pending identity ({pendingIdentity.length})
      </Text>
      {pendingIdentity.length === 0 ? (
        <Text style={styles.empty}>No pending WhatsApp/Telegram reviews.</Text>
      ) : (
        pendingIdentity.map((row) => (
          <View key={row.id} style={styles.rowCard}>
            <Text style={styles.rowName}>{freeAccessDisplayName(row)}</Text>
            <Text style={styles.rowMeta}>
              {row.phone ?? '—'} · {row.email ?? 'no email'}
            </Text>
            <Text style={styles.rowMeta}>
              via {row.identity_verify_channel ?? '?'}
              {row.identity_telegram_username
                ? ` · @${row.identity_telegram_username}`
                : ''}{' '}
              · lessons {row.lessons_completed} · premium {String(row.isPremium)}
            </Text>
            <View style={styles.rowActions}>
              <Pressable
                style={({ pressed }) => [styles.verifyBtn, pressed && styles.btnPressed]}
                onPress={() => onVerifyIdentity(row)}
              >
                <Text style={styles.verifyBtnText}>Verified</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.revokeBtn, pressed && styles.btnPressed]}
                onPress={() => onRejectIdentity(row)}
              >
                <Text style={styles.revokeBtnText}>Reject</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>Add by phone</Text>
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
          <Text style={styles.foundTitle}>{freeAccessDisplayName(foundUser)}</Text>
          <Text style={styles.foundMeta}>{foundUser.phone ?? '—'}</Text>
          <Text style={styles.foundMeta}>
            isPremium: {String(foundUser.isPremium)} · ppid:{' '}
            {foundUser.premium_product_id ?? '(null)'}
          </Text>
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
              <Text style={styles.primaryBtnText}>Grant free access</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>
        Free access users ({rows.length})
      </Text>
      {rows.length === 0 ? (
        <Text style={styles.empty}>No complimentary users listed.</Text>
      ) : (
        rows.map((row) => (
          <View key={row.id} style={styles.rowCard}>
            <Text style={styles.rowName}>{freeAccessDisplayName(row)}</Text>
            <Text style={styles.rowMeta}>{row.phone ?? row.id}</Text>
            <Pressable
              style={({ pressed }) => [styles.revokeBtn, pressed && styles.btnPressed]}
              onPress={() => onRevoke(row)}
            >
              <Text style={styles.revokeBtnText}>Revoke</Text>
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
  rowActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  verifyBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4ade80',
  },
  verifyBtnText: { color: '#4ade80', fontSize: 14, fontWeight: '600' },
  revokeBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f87171',
  },
  revokeBtnText: { color: '#f87171', fontSize: 14, fontWeight: '600' },
})
