import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { normalizeDialogueContent } from '../../lib/lessonEditor'

type Props = {
  content: Record<string, unknown>
  setContent: React.Dispatch<React.SetStateAction<Record<string, unknown>>>
  onSave: () => void
}

type TurnRow = {
  speaker: 1 | 2
  /** Index within that person's `lines` / `translations` arrays. */
  lineIndex: number
  name: string
  text: string
  trans: string
}

function padTranslations(trans: string[], lineCount: number): string[] {
  const o = [...trans]
  while (o.length < lineCount) o.push('')
  if (o.length > lineCount) o.length = lineCount
  return o
}

export function DialogueTwoPersonEditor({ content, setContent, onSave }: Props) {
  const [draftLine, setDraftLine] = useState('')
  const nc = useMemo(() => normalizeDialogueContent(content), [content])
  const dd = (nc.dialogueData ?? {}) as Record<string, unknown>
  const p1 = (dd.person1 ?? {}) as Record<string, unknown>
  const p2 = (dd.person2 ?? {}) as Record<string, unknown>
  const name1 = String(p1.name ?? '')
  const name2 = String(p2.name ?? '')
  const lines1 = (Array.isArray(p1.lines) ? p1.lines : ['']) as string[]
  const lines2 = (Array.isArray(p2.lines) ? p2.lines : ['']) as string[]
  const tr1 = (Array.isArray(p1.translations) ? p1.translations : []) as string[]
  const tr2 = (Array.isArray(p2.translations) ? p2.translations : []) as string[]
  const showTrans = content.showTranslations !== false && content.showTranslations !== 'false'

  const turns = useMemo(() => {
    const out: TurnRow[] = []
    const maxLen = Math.max(lines1.length, lines2.length)
    for (let i = 0; i < maxLen; i++) {
      const t1 = lines1[i]
      if (t1 != null && String(t1).trim() !== '') {
        out.push({
          speaker: 1,
          lineIndex: i,
          name: name1.trim() || 'Person 1',
          text: String(t1),
          trans: String(tr1[i] ?? ''),
        })
      }
      const t2 = lines2[i]
      if (t2 != null && String(t2).trim() !== '') {
        out.push({
          speaker: 2,
          lineIndex: i,
          name: name2.trim() || 'Person 2',
          text: String(t2),
          trans: String(tr2[i] ?? ''),
        })
      }
    }
    return out
  }, [lines1, lines2, tr1, tr2, name1, name2])

  const nextIsPerson1 = lines1.length <= lines2.length
  const nextLabel = nextIsPerson1 ? name1.trim() || 'Person 1' : name2.trim() || 'Person 2'

  const setPerson = (slot: 1 | 2, patch: Record<string, unknown>) => {
    setContent((cur) => {
      const n = normalizeDialogueContent(cur)
      const d = (n.dialogueData ?? {}) as Record<string, unknown>
      const key = slot === 1 ? 'person1' : 'person2'
      const prev = { ...((d[key] as Record<string, unknown>) ?? {}) }
      return { ...cur, dialogueData: { ...d, [key]: { ...prev, ...patch } } }
    })
  }

  const addLine = () => {
    const t = draftLine.trim()
    if (!t) return
    setContent((cur) => {
      const n = normalizeDialogueContent(cur)
      const d = (n.dialogueData ?? {}) as Record<string, unknown>
      const a = { ...((d.person1 as Record<string, unknown>) ?? {}) }
      const b = { ...((d.person2 as Record<string, unknown>) ?? {}) }
      const l1 = [...(Array.isArray(a.lines) ? (a.lines as string[]) : [])]
      const l2 = [...(Array.isArray(b.lines) ? (b.lines as string[]) : [])]
      const t1 = padTranslations(
        (Array.isArray(a.translations) ? (a.translations as string[]) : []) as string[],
        l1.length,
      )
      const t2 = padTranslations(
        (Array.isArray(b.translations) ? (b.translations as string[]) : []) as string[],
        l2.length,
      )
      if (l1.length <= l2.length) {
        l1.push(t)
        t1.push('')
      } else {
        l2.push(t)
        t2.push('')
      }
      return {
        ...cur,
        dialogueData: {
          person1: { ...a, lines: l1, translations: t1 },
          person2: { ...b, lines: l2, translations: t2 },
        },
      }
    })
    setDraftLine('')
  }

  const removeTurn = (speaker: 1 | 2, lineIndex: number) => {
    setContent((cur) => {
      const n = normalizeDialogueContent(cur)
      const d = (n.dialogueData ?? {}) as Record<string, unknown>
      const a = { ...((d.person1 as Record<string, unknown>) ?? {}) }
      const b = { ...((d.person2 as Record<string, unknown>) ?? {}) }
      const l1 = [...(Array.isArray(a.lines) ? (a.lines as string[]) : [''])]
      const l2 = [...(Array.isArray(b.lines) ? (b.lines as string[]) : [''])]
      let t1 = padTranslations(
        (Array.isArray(a.translations) ? (a.translations as string[]) : []) as string[],
        l1.length,
      )
      let t2 = padTranslations(
        (Array.isArray(b.translations) ? (b.translations as string[]) : []) as string[],
        l2.length,
      )
      if (speaker === 1) {
        if (lineIndex >= 0 && lineIndex < l1.length) {
          l1.splice(lineIndex, 1)
          t1.splice(lineIndex, 1)
        }
      } else if (lineIndex >= 0 && lineIndex < l2.length) {
        l2.splice(lineIndex, 1)
        t2.splice(lineIndex, 1)
      }
      return {
        ...cur,
        dialogueData: {
          person1: {
            ...a,
            lines: l1.length ? l1 : [''],
            translations: padTranslations(t1, l1.length || 1),
          },
          person2: {
            ...b,
            lines: l2.length ? l2 : [''],
            translations: padTranslations(t2, l2.length || 1),
          },
        },
      }
    })
  }

  const updateTranslation = (speaker: 1 | 2, lineIndex: number, text: string) => {
    setContent((cur) => {
      const n = normalizeDialogueContent(cur)
      const d = (n.dialogueData ?? {}) as Record<string, unknown>
      const a = { ...((d.person1 as Record<string, unknown>) ?? {}) }
      const b = { ...((d.person2 as Record<string, unknown>) ?? {}) }
      const l1 = [...(Array.isArray(a.lines) ? (a.lines as string[]) : [])]
      const l2 = [...(Array.isArray(b.lines) ? (b.lines as string[]) : [])]
      let t1 = padTranslations(
        (Array.isArray(a.translations) ? (a.translations as string[]) : []) as string[],
        l1.length,
      )
      let t2 = padTranslations(
        (Array.isArray(b.translations) ? (b.translations as string[]) : []) as string[],
        l2.length,
      )
      if (speaker === 1 && lineIndex >= 0 && lineIndex < t1.length) {
        t1[lineIndex] = text
      } else if (speaker === 2 && lineIndex >= 0 && lineIndex < t2.length) {
        t2[lineIndex] = text
      }
      return {
        ...cur,
        dialogueData: {
          person1: { ...a, lines: l1, translations: t1 },
          person2: { ...b, lines: l2, translations: t2 },
        },
      }
    })
  }

  return (
    <View style={styles.form}>
      <Text style={styles.hint}>
        Person 1 speaks first. Lines alternate in the app (Person 1, Person 2, Person 1…). Add one line at a time.
      </Text>
      <View style={styles.row}>
        <Text style={styles.label}>Show translations in app</Text>
        <Switch
          value={showTrans}
          onValueChange={(v) =>
            setContent((cur) => ({
              ...cur,
              showTranslations: v,
            }))
          }
        />
      </View>
      <Text style={styles.sectionTitle}>Names</Text>
      <Text style={styles.fieldLabel}>Person 1</Text>
      <TextInput
        style={styles.input}
        value={name1}
        onChangeText={(t) => setPerson(1, { name: t })}
        placeholder="Name (speaks first)"
        placeholderTextColor="#888"
      />
      <Text style={styles.fieldLabel}>Person 2</Text>
      <TextInput
        style={styles.input}
        value={name2}
        onChangeText={(t) => setPerson(2, { name: t })}
        placeholder="Name"
        placeholderTextColor="#888"
      />

      <Text style={styles.sectionTitle}>Conversation</Text>
      <ScrollView style={styles.turnList} nestedScrollEnabled>
        {turns.length === 0 ? (
          <Text style={styles.muted}>No lines yet — add the first line below.</Text>
        ) : (
          turns.map((row) => (
            <View key={`${row.speaker}-${row.lineIndex}`} style={styles.turnCard}>
              <View style={styles.turnHead}>
                <Text style={styles.turnSpeaker}>
                  {row.speaker === 1 ? 'Person 1' : 'Person 2'} · {row.name}
                </Text>
                <Pressable onPress={() => removeTurn(row.speaker, row.lineIndex)} style={styles.removeBtn}>
                  <Text style={styles.removeBtnText}>Remove</Text>
                </Pressable>
              </View>
              <Text style={styles.turnAfaan}>{row.text}</Text>
              <TextInput
                style={styles.transInput}
                value={row.trans}
                onChangeText={(t) => updateTranslation(row.speaker, row.lineIndex, t)}
                placeholder="Translation (optional)"
                placeholderTextColor="#666"
              />
            </View>
          ))
        )}
      </ScrollView>

      <Text style={styles.nextHint}>Next line is for: {nextLabel}</Text>
      <TextInput
        style={styles.input}
        value={draftLine}
        onChangeText={setDraftLine}
        placeholder="Afaan line…"
        placeholderTextColor="#888"
        multiline
      />
      <Pressable style={styles.addBtn} onPress={addLine}>
        <Text style={styles.addBtnText}>+ Add line</Text>
      </Pressable>

      <Pressable style={styles.saveBtn} onPress={() => onSave()}>
        <Text style={styles.saveBtnText}>Save screen</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  form: { gap: 10 },
  hint: { color: '#9ca3af', fontSize: 13, lineHeight: 18, marginBottom: 4 },
  sectionTitle: { color: '#e5e7eb', fontSize: 15, fontWeight: '700', marginTop: 8 },
  fieldLabel: { color: '#9ca3af', fontSize: 12, marginTop: 6 },
  label: { color: '#e5e7eb', fontSize: 14, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    fontSize: 15,
    minHeight: 44,
  },
  turnList: { maxHeight: 220 },
  muted: { color: '#6b7280', fontSize: 13, paddingVertical: 8 },
  turnCard: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#111827',
  },
  turnHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  turnSpeaker: { color: '#93c5fd', fontSize: 12, fontWeight: '600' },
  turnAfaan: { color: '#f9fafb', fontSize: 16, marginTop: 6 },
  transInput: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#4b5563',
    borderRadius: 8,
    padding: 8,
    color: '#d1d5db',
    fontSize: 14,
  },
  removeBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  removeBtnText: { color: '#f87171', fontSize: 13, fontWeight: '600' },
  nextHint: { color: '#fcd34d', fontSize: 13, fontWeight: '600', marginTop: 8 },
  addBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  saveBtn: {
    backgroundColor: '#22c55e',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  saveBtnText: { color: '#0a0a0a', fontWeight: '800', fontSize: 16 },
})
