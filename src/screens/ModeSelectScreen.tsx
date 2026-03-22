import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../types'
import { useAuth } from '../context/AuthContext'

type Props = StackScreenProps<RootStackParamList, 'ModeSelect'>

export default function ModeSelectScreen({ navigation, route }: Props) {
  const { role: contextRole, setRole } = useAuth()
  const role = contextRole ?? route.params.role
  const isAdmin = role === 'admin'
  const isVoice = role === 'voice'

  const onSignOut = () => {
    setRole(null)
    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    })
  }

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View />
        <Pressable style={styles.signOutButton} onPress={onSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>Choose Your Mode</Text>

      <Pressable
        style={[styles.card, !isAdmin && styles.cardDisabled]}
        onPress={() => navigation.navigate('AdminSeriesList')}
        disabled={!isAdmin}
      >
        <Text style={[styles.cardTitle, !isAdmin && styles.textDisabled]}>Admin</Text>
        <Text style={[styles.cardSubtitle, !isAdmin && styles.textDisabled]}>
          Manage word lists and series
        </Text>
      </Pressable>

      <Pressable
        style={[styles.card, !isVoice && styles.cardDisabled]}
        onPress={() => navigation.navigate('VoiceActorDashboard')}
        disabled={!isVoice}
      >
        <Text style={[styles.cardTitle, !isVoice && styles.textDisabled]}>Voice Actor</Text>
        <Text style={[styles.cardSubtitle, !isVoice && styles.textDisabled]}>
          Record audio for words
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    padding: 20,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  signOutButton: {
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  signOutText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 18,
  },
  card: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    padding: 18,
    marginBottom: 14,
    minHeight: 120,
    justifyContent: 'center',
  },
  cardDisabled: {
    backgroundColor: '#27272a',
    opacity: 0.6,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardSubtitle: {
    color: '#e4e4e7',
    fontSize: 14,
  },
  textDisabled: {
    color: '#a1a1aa',
  },
})
