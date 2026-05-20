import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { AdminTextInput } from '../AdminTextInput'
import { normalizeDialogueContent } from '../../lib/lessonEditor'

type Props = {
  content: Record<string, unknown>
  setContent: React.Dispatch<React.SetStateAction<Record<string, unknown>>>
  onSave: () => void
  /** When true, omit the footer Save button (parent provides header Save). */
  hideFooterSave?: boolean
  /** Register the same validation + save handler the footer button would run. */
  onRegisterHeaderSave?: (fn: () => void) => void
  /** Preview-only: show conversation, no edits. */
  readOnly?: boolean
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

/** Append a line + translation, replacing a lone empty placeholder row if present. */
function pushLineAndTrans(lines: string[], trans: string[], line: string, tr: string) {
  const l = [...lines]
  const t = padTranslations([...trans], l.length)
  if (
    l.length === 1 &&
    !String(l[0] ?? '').trim() &&
    (!t.length || !String(t[0] ?? '').trim())
  ) {
    return { lines: [line], translations: [tr] }
  }
  l.push(line)
  const t2 = padTranslations(t, l.length - 1)
  t2.push(tr)
  return { lines: l, translations: t2 }
}

function validateDialogueForSave(content: Record<string, unknown>): string | null {
  const nc = normalizeDialogueContent(content)
  const dd = (nc.dialogueData ?? {}) as Record<string, unknown>
  const a = (dd.person1 ?? {}) as Record<string, unknown>
  const b = (dd.person2 ?? {}) as Record<string, unknown>
  const l1 = (Array.isArray(a.lines) ? a.lines : []) as string[]
  const l2 = (Array.isArray(b.lines) ? b.lines : []) as string[]
  const tr1 = padTranslations(
    (Array.isArray(a.translations) ? a.translations : []) as string[],
    Math.max(l1.length, 1),
  )
  const tr2 = padTranslations(
    (Array.isArray(b.translations) ? b.translations : []) as string[],
    Math.max(l2.length, 1),
  )
  const maxLen = Math.max(l1.length, l2.length)
  let anyLine = false
  for (let i = 0; i < maxLen; i++) {
    const check = (line: string, tr: string, label: string) => {
      const lt = String(line ?? '').trim()
      const tt = String(tr ?? '').trim()
      if (lt || tt) {
        anyLine = true
        if (!lt) return `${label} (turn ${i + 1}): line text is required.`
        if (!tt) return `${label} (turn ${i + 1}): translation is required.`
      }
      return null
    }
    const e1 = check(String(l1[i] ?? ''), String(tr1[i] ?? ''), 'Person 1')
    if (e1) return e1
    const e2 = check(String(l2[i] ?? ''), String(tr2[i] ?? ''), 'Person 2')
    if (e2) return e2
  }
  if (!anyLine) return 'Add at least one line with both Afaan text and translation.'
  return null
}

export function DialogueTwoPersonEditor({
  content,
  setContent,
  onSave,
  hideFooterSave = false,
  onRegisterHeaderSave,
  readOnly = false,
}: Props) {
  const [draftLine, setDraftLine] = useState('')
  const [draftTranslation, setDraftTranslation] = useState('')
  const [draftSpeaker, setDraftSpeaker] = useState<1 | 2>(1)
  const [saveError, setSaveError] = useState('')
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

  const turns = useMemo(() => {
    const l1 = lines1
    const l2 = lines2
    const t1 = padTranslations([...tr1], l1.length)
    const t2 = padTranslations([...tr2], l2.length)
    const maxLen = Math.max(l1.length, l2.length, 1)
    const lineOrTrans = (line: unknown, tr: unknown) =>
      String(line ?? '').trim() !== '' || String(tr ?? '').trim() !== ''
    const hasAny =
      l1.some((ln, i) => lineOrTrans(ln, t1[i])) || l2.some((ln, i) => lineOrTrans(ln, t2[i]))
    const isDefaultEmptySlot =
      maxLen === 1 &&
      !hasAny &&
      String(l1[0] ?? '').trim() === '' &&
      String(l2[0] ?? '').trim() === ''
    if (isDefaultEmptySlot) return []

    const out: TurnRow[] = []
    for (let i = 0; i < maxLen; i++) {
      if (i < l1.length) {
        out.push({
          speaker: 1,
          lineIndex: i,
          name: name1.trim() || 'Person 1',
          text: String(l1[i] ?? ''),
          trans: String(t1[i] ?? ''),
        })
      }
      if (i < l2.length) {
        out.push({
          speaker: 2,
          lineIndex: i,
          name: name2.trim() || 'Person 2',
          text: String(l2[i] ?? ''),
          trans: String(t2[i] ?? ''),
        })
      }
    }
    return out
  }, [lines1, lines2, tr1, tr2, name1, name2])

  useEffect(() => {
    setDraftSpeaker(lines1.length <= lines2.length ? 1 : 2)
  }, [lines1.length, lines2.length])

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
    const line = draftLine.trim()
    const trans = draftTranslation.trim()
    if (!line || !trans) return
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
      let nl1 = l1
      let nt1 = t1
      let nl2 = l2
      let nt2 = t2
      if (draftSpeaker === 1) {
        const r = pushLineAndTrans(l1, t1, line, trans)
        nl1 = r.lines
        nt1 = r.translations
      } else {
        const r = pushLineAndTrans(l2, t2, line, trans)
        nl2 = r.lines
        nt2 = r.translations
      }
      return {
        ...cur,
        dialogueData: {
          person1: { ...a, lines: nl1, translations: nt1 },
          person2: { ...b, lines: nl2, translations: nt2 },
        },
      }
    })
    setDraftLine('')
    setDraftTranslation('')
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

  const updateLineText = (speaker: 1 | 2, lineIndex: number, text: string) => {
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
      if (speaker === 1 && lineIndex >= 0 && lineIndex < l1.length) {
        l1[lineIndex] = text
      } else if (speaker === 2 && lineIndex >= 0 && lineIndex < l2.length) {
        l2[lineIndex] = text
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

  const handleSave = useCallback(() => {
    const err = validateDialogueForSave(content)
    if (err) {
      setSaveError(err)
      return
    }
    setSaveError('')
    onSave()
  }, [content, onSave])

  useLayoutEffect(() => {
    if (!onRegisterHeaderSave) return
    if (readOnly) {
      onRegisterHeaderSave(() => {})
      return () => onRegisterHeaderSave(() => {})
    }
    onRegisterHeaderSave(handleSave)
    return () => onRegisterHeaderSave(() => {})
  }, [onRegisterHeaderSave, handleSave, readOnly])

  return (
    <View style={styles.form}>
      <Text style={styles.hint}>
        {readOnly
          ? 'Learners see translations only after they tap Show on the device.'
          : 'Person 1 speaks first in the app. Under “Next line”, pick who speaks, then enter line + translation (both required). Learners see translations only after they tap Show on the device.'}
      </Text>
      <Text style={styles.sectionTitle}>Names</Text>
      <Text style={styles.fieldLabel}>Person 1</Text>
      <AdminTextInput
        style={styles.input}
        value={name1}
        onChangeText={(t) => setPerson(1, { name: t })}
        placeholder="Name (speaks first)"
        placeholderTextColor="#888"
        editable={!readOnly}
      />
      <Text style={styles.fieldLabel}>Person 2</Text>
      <AdminTextInput
        style={styles.input}
        value={name2}
        onChangeText={(t) => setPerson(2, { name: t })}
        placeholder="Name"
        placeholderTextColor="#888"
        editable={!readOnly}
      />

      <Text style={styles.sectionTitle}>Conversation</Text>
      <View>
        {turns.length === 0 ? (
          <Text style={styles.muted}>No lines yet — add the first line below.</Text>
        ) : (
          turns.map((row) => (
            <View key={`${row.speaker}-${row.lineIndex}`} style={styles.turnCard}>
              <View style={styles.turnHead}>
                <Text style={styles.turnSpeaker}>
                  {row.speaker === 1 ? 'Person 1' : 'Person 2'} · {row.name}
                </Text>
                {readOnly ? null : (
                  <Pressable onPress={() => removeTurn(row.speaker, row.lineIndex)} style={styles.removeBtn}>
                    <Text style={styles.removeBtnText}>Remove</Text>
                  </Pressable>
                )}
              </View>
              <Text style={styles.fieldLabel}>Line</Text>
              <AdminTextInput
                style={styles.input}
                value={row.text}
                onChangeText={(t) => updateLineText(row.speaker, row.lineIndex, t)}
                placeholder="Afaan Oromo"
                placeholderTextColor="#888"
                editable={!readOnly}
              />
              <Text style={styles.fieldLabel}>Translation</Text>
              <AdminTextInput
                style={styles.transInput}
                value={row.trans}
                onChangeText={(t) => updateTranslation(row.speaker, row.lineIndex, t)}
                placeholder="English"
                placeholderTextColor="#666"
                editable={!readOnly}
              />
            </View>
          ))
        )}
      </View>

      {readOnly ? null : (
        <>
          <Text style={styles.sectionTitle}>Next line</Text>
          <Text style={styles.fieldLabel}>Speaker</Text>
          <View style={styles.speakerPick}>
            <Pressable
              style={[styles.speakerChip, draftSpeaker === 1 && styles.speakerChipActive]}
              onPress={() => setDraftSpeaker(1)}
            >
              <Text style={[styles.speakerChipText, draftSpeaker === 1 && styles.speakerChipTextActive]}>
                Person 1 · {name1.trim() || '—'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.speakerChip, draftSpeaker === 2 && styles.speakerChipActive]}
              onPress={() => setDraftSpeaker(2)}
            >
              <Text style={[styles.speakerChipText, draftSpeaker === 2 && styles.speakerChipTextActive]}>
                Person 2 · {name2.trim() || '—'}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.fieldLabel}>Line</Text>
          <AdminTextInput
            style={styles.input}
            value={draftLine}
            onChangeText={setDraftLine}
            placeholder="Afaan Oromo"
            placeholderTextColor="#888"
          />
          <Text style={styles.fieldLabel}>Translation</Text>
          <AdminTextInput
            style={styles.input}
            value={draftTranslation}
            onChangeText={setDraftTranslation}
            placeholder="English"
            placeholderTextColor="#888"
          />
          <Pressable style={styles.addBtn} onPress={addLine}>
            <Text style={styles.addBtnText}>Add line</Text>
          </Pressable>
        </>
      )}

      {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}

      {!hideFooterSave ? (
        <Pressable style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save screen</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  form: { gap: 10 },
  hint: { color: '#9ca3af', fontSize: 13, lineHeight: 18, marginBottom: 4 },
  sectionTitle: { color: '#e5e7eb', fontSize: 15, fontWeight: '700', marginTop: 8 },
  fieldLabel: { color: '#9ca3af', fontSize: 12, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    fontSize: 15,
    minHeight: 44,
  },
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
  errorText: { color: '#f87171', fontSize: 13, marginTop: 6 },
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
  speakerPick: { flexDirection: 'row', gap: 8 },
  speakerChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#4b5563',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#111827',
  },
  speakerChipActive: {
    borderColor: '#60a5fa',
    backgroundColor: '#1e3a5f',
  },
  speakerChipText: { color: '#d1d5db', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  speakerChipTextActive: { color: '#fff' },
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
