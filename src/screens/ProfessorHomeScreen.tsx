import { useCallback, useLayoutEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import SeriesConfigListView from '../components/lesson-config/SeriesConfigListView'
import { useAuth } from '../context/AuthContext'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'ProfessorHome'>

export default function ProfessorHomeScreen({ navigation }: Props) {
  const { setRole } = useAuth()

  const onSignOut = useCallback(() => {
    setRole(null)
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] })
  }, [navigation, setRole])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Professor',
      headerLeft: () => (
        <Pressable onPress={onSignOut} style={styles.headerBtn} hitSlop={8}>
          <Text style={styles.headerBtnText}>Sign out</Text>
        </Pressable>
      ),
    })
  }, [navigation, onSignOut])

  return (
    <View style={styles.screen}>
      <SeriesConfigListView navigation={navigation} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0a0a' },
  headerBtn: {
    marginLeft: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  headerBtnText: {
    color: '#a1a1aa',
    fontSize: 15,
    fontWeight: '600',
  },
})
