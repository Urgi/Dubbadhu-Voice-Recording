import type { StackScreenProps } from '@react-navigation/stack'
import SeriesConfigListView from '../components/lesson-config/SeriesConfigListView'
import type { RootStackParamList } from '../types'

type Props = StackScreenProps<RootStackParamList, 'LessonConfig'>

export default function LessonConfigScreen({ navigation }: Props) {
  return <SeriesConfigListView navigation={navigation} />
}
