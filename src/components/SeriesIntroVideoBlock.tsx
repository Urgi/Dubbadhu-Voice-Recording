import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { AdminTextInput } from './AdminTextInput'
import {
  VIDEOS_DUBBADHU_BUCKET,
  listVideosDubbadhuBucket,
  publicUrlForVideosDubbadhuObject,
} from '../lib/videosDubbadhuStorage'

type Props = {
  introVideoUrl: string | null
  onChangeUrl: (next: string | null) => void
  disabled: boolean
  lessonSeriesRowExists: boolean
}

export default function SeriesIntroVideoBlock({
  introVideoUrl,
  onChangeUrl,
  disabled,
  lessonSeriesRowExists,
}: Props) {
  const [browseOpen, setBrowseOpen] = useState(false)
  const [bucketFiles, setBucketFiles] = useState<string[]>([])
  const [filterQ, setFilterQ] = useState('')
  const [listErr, setListErr] = useState('')
  const [listLoading, setListLoading] = useState(false)
  const [rawListCount, setRawListCount] = useState(0)

  const loadBucket = useCallback(async () => {
    setListLoading(true)
    setListErr('')
    setRawListCount(0)
    const { names, error, rawCount } = await listVideosDubbadhuBucket()
    setRawListCount(rawCount)
    setListLoading(false)
    if (error) {
      setListErr(error)
      setBucketFiles([])
      return
    }
    setBucketFiles(names)
  }, [])

  useEffect(() => {
    if (browseOpen) {
      setFilterQ('')
      void loadBucket()
    }
  }, [browseOpen, loadBucket])

  const filteredFiles = useMemo(() => {
    const q = filterQ.trim().toLowerCase()
    if (!q) return bucketFiles
    return bucketFiles.filter((n) => n.toLowerCase().includes(q))
  }, [bucketFiles, filterQ])

  const v = (introVideoUrl ?? '').trim()
  const selectedFileLabel = useMemo(() => {
    if (!v) return null
    try {
      const tail = v.split('/').pop() ?? v
      return decodeURIComponent(tail.split('?')[0] ?? tail)
    } catch {
      return 'Selected video'
    }
  }, [v])

  const applyUrl = (next: string | null) => {
    const t = next?.trim() ?? ''
    onChangeUrl(t ? t : null)
  }

  /** In-app expo-av playback crashed on some devices; open the public URL in Safari / Chrome instead. */
  const openVideoInSystemBrowser = useCallback(() => {
    if (!v) return
    void Linking.openURL(v).catch(() => {
      Alert.alert(
        'Could not open',
        'Try again with network access, or open the file from Supabase storage in a browser.',
      )
    })
  }, [v])

  return (
    <View style={styles.block}>
      <Text style={styles.sectionLabel}>Series intro video</Text>
      <Text style={[styles.statusLine, !selectedFileLabel && styles.statusEmpty]}>
        {selectedFileLabel ?? 'No video selected'}
      </Text>

      <View style={styles.row}>
        <Pressable
          style={[styles.secondaryBtn, (disabled || !lessonSeriesRowExists) && styles.disabled]}
          onPress={() => setBrowseOpen(true)}
          disabled={disabled || !lessonSeriesRowExists}
        >
          <Text style={styles.secondaryBtnText}>Browse bucket</Text>
        </Pressable>
        {v ? (
          <Pressable
            style={[styles.secondaryBtn, disabled && styles.disabled]}
            onPress={openVideoInSystemBrowser}
            disabled={disabled}
          >
            <Text style={styles.secondaryBtnText}>Open video</Text>
          </Pressable>
        ) : null}
        {v ? (
          <Pressable
            style={[styles.secondaryBtn, disabled && styles.disabled]}
            onPress={() => applyUrl(null)}
            disabled={disabled}
          >
            <Text style={styles.secondaryBtnText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      <Modal visible={browseOpen} transparent animationType="fade" onRequestClose={() => setBrowseOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setBrowseOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Videos in {VIDEOS_DUBBADHU_BUCKET}</Text>
            <AdminTextInput
              style={styles.input}
              value={filterQ}
              onChangeText={setFilterQ}
              placeholder="Filter by file name…"
              placeholderTextColor="#52525b"
              autoCapitalize="none"
            />
            {listLoading ? <ActivityIndicator color="#a1a1aa" style={{ marginVertical: 12 }} /> : null}
            {listErr ? <Text style={styles.err}>{listErr}</Text> : null}
            {!listLoading && !listErr && bucketFiles.length === 0 && rawListCount === 0 ? (
              <Text style={styles.hintSmall}>
                No files listed (check RLS on storage.objects — sql/storage_videos_dubbadhu_anon_list.sql).
              </Text>
            ) : null}
            <ScrollView style={styles.sheetList} keyboardShouldPersistTaps="handled">
              {filteredFiles.map((name) => (
                <Pressable
                  key={name}
                  style={styles.choice}
                  onPress={() => {
                    applyUrl(publicUrlForVideosDubbadhuObject(name))
                    setBrowseOpen(false)
                  }}
                >
                  <Text style={styles.choiceText}>{name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const GOLD = '#d4af37'

const styles = StyleSheet.create({
  block: { marginBottom: 18 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: GOLD,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  hintSmall: { fontSize: 11, color: '#71717a', marginBottom: 8, lineHeight: 16 },
  statusLine: { fontSize: 13, color: '#e5e5ea', marginBottom: 10 },
  statusEmpty: { color: '#636366' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  secondaryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#52525b',
  },
  secondaryBtnText: { color: '#a1a1aa', fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  input: {
    backgroundColor: '#1c1c1e',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#38383a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#fff',
    marginBottom: 8,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    backgroundColor: '#1c1c1e',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#38383a',
    padding: 16,
    maxHeight: 520,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 10 },
  sheetList: { maxHeight: 300 },
  choice: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2c2c2e',
  },
  choiceText: { color: '#e5e5ea', fontSize: 14 },
  err: { color: '#f87171', fontSize: 13, marginBottom: 8 },
})
