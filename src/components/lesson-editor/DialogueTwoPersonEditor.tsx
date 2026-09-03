import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { AdminTextInput } from '../AdminTextInput'
import {
  dialogueSidesFromTurns,
  dialogueTurnsFromZippedSides,
  readDialogueTurnsForEdit,
  type DialogueSpeaker,
  type DialogueTurn,
} from '../../lib/dialogueTurns'
import { mapDialogueSide } from '../../lib/lessonEditor'

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

function sideRecord(dd: Record<string, unknown>, key: 'person1' | 'person2') {
  const raw = dd[key]
  return raw != null && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {}
}

function turnsFromContent(content: Record<string, unknown>): DialogueTurn[] {
  const dd = (content.dialogueData ?? {}) as Record<string, unknown>
  if (Array.isArray(dd.turns)) {
    const edited = readDialogueTurnsForEdit(dd.turns)
    if (edited && edited.length) return edited
    if (dd.turns.length === 0) return []
  }
  const a = mapDialogueSide(sideRecord(dd, 'person1'))
  const b = mapDialogueSide(sideRecord(dd, 'person2'))
  return dialogueTurnsFromZippedSides(a.lines, b.lines, a.translations, b.translations)
}

function namesFromContent(content: Record<string, unknown>): { name1: string; name2: string } {
  const dd = (content.dialogueData ?? {}) as Record<string, unknown>
  const a = sideRecord(dd, 'person1')
  const b = sideRecord(dd, 'person2')
  return {
    name1: String(a.name ?? ''),
    name2: String(b.name ?? ''),
  }
}

function writeDialogue(
  cur: Record<string, unknown>,
  patch: { turns?: DialogueTurn[]; name1?: string; name2?: string },
): Record<string, unknown> {
  const dd = (cur.dialogueData ?? {}) as Record<string, unknown>
  const names = namesFromContent(cur)
  const name1 = patch.name1 ?? names.name1
  const name2 = patch.name2 ?? names.name2
  const turns = patch.turns ?? turnsFromContent(cur)
  const columns = dialogueSidesFromTurns(turns)
  return {
    ...cur,
    dialogueData: {
      ...dd,
      person1: {
        name: name1,
        lines: columns.lines1,
        translations: columns.trans1,
      },
      person2: {
        name: name2,
        lines: columns.lines2,
        translations: columns.trans2,
      },
      turns,
    },
  }
}

function validateDialogueForSave(content: Record<string, unknown>): string | null {
  const turns = turnsFromContent(content)
  if (!turns.length) return 'Add at least one line with both Afaan text and translation.'
  for (let i = 0; i < turns.length; i++) {
    const line = String(turns[i].text ?? '').trim()
    const tr = String(turns[i].translation ?? '').trim()
    const label = turns[i].speaker === 1 ? 'Person 1' : 'Person 2'
    if (!line) return `${label} (turn ${i + 1}): line text is required.`
    if (!tr) return `${label} (turn ${i + 1}): translation is required.`
  }
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
  const [draftSpeaker, setDraftSpeaker] = useState<DialogueSpeaker>(1)
  const [saveError, setSaveError] = useState('')
  const { name1, name2 } = useMemo(() => namesFromContent(content), [content])
  const turns = useMemo(() => turnsFromContent(content), [content])

  const setNames = (slot: DialogueSpeaker, name: string) => {
    setContent((cur) => writeDialogue(cur, slot === 1 ? { name1: name } : { name2: name }))
  }

  const addLine = () => {
    const line = draftLine.trim()
    const trans = draftTranslation.trim()
    if (!line || !trans) return
    const nextSpeaker = draftSpeaker
    setContent((cur) => {
      const prev = turnsFromContent(cur)
      return writeDialogue(cur, {
        turns: [...prev, { speaker: nextSpeaker, text: line, translation: trans }],
      })
    })
    setDraftLine('')
    setDraftTranslation('')
    setDraftSpeaker(nextSpeaker)
  }

  const removeTurn = (index: number) => {
    setContent((cur) => {
      const prev = turnsFromContent(cur)
      if (index < 0 || index >= prev.length) return cur
      return writeDialogue(cur, { turns: prev.filter((_, i) => i !== index) })
    })
  }

  const updateTurn = (index: number, patch: Partial<DialogueTurn>) => {
    setContent((cur) => {
      const prev = turnsFromContent(cur)
      if (index < 0 || index >= prev.length) return cur
      const next = prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
      return writeDialogue(cur, { turns: next })
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
          : 'Lines play in the order below. The same person can speak twice in a row (split a long line, skip a beat). Under “Next line”, pick who speaks — that choice stays until you change it. Afaan lines appear fully bold in the app; wrap specific words in *asterisks* to emphasize only those words. Learners see translations only after they tap Show on the device.'}
      </Text>
      <Text style={styles.sectionTitle}>Names</Text>
      <Text style={styles.fieldLabel}>Person 1</Text>
      <AdminTextInput
        style={styles.input}
        value={name1}
        onChangeText={(t) => setNames(1, t)}
        placeholder="Name (speaks first)"
        placeholderTextColor="#888"
        editable={!readOnly}
      />
      <Text style={styles.fieldLabel}>Person 2</Text>
      <AdminTextInput
        style={styles.input}
        value={name2}
        onChangeText={(t) => setNames(2, t)}
        placeholder="Name"
        placeholderTextColor="#888"
        editable={!readOnly}
      />

      <Text style={styles.sectionTitle}>Conversation</Text>
      <View>
        {turns.length === 0 ? (
          <Text style={styles.muted}>No lines yet — add the first line below.</Text>
        ) : (
          turns.map((row, index) => (
            <View key={`turn-${index}-${row.speaker}`} style={styles.turnCard}>
              <View style={styles.turnHead}>
                <Text style={styles.turnSpeaker}>
                  {row.speaker === 1 ? 'Person 1' : 'Person 2'} ·{' '}
                  {(row.speaker === 1 ? name1 : name2).trim() || (row.speaker === 1 ? 'Person 1' : 'Person 2')}
                </Text>
                {readOnly ? null : (
                  <Pressable onPress={() => removeTurn(index)} style={styles.removeBtn}>
                    <Text style={styles.removeBtnText}>Remove</Text>
                  </Pressable>
                )}
              </View>
              <Text style={styles.fieldLabel}>Line</Text>
              <AdminTextInput
                style={styles.input}
                value={row.text}
                onChangeText={(t) => updateTurn(index, { text: t })}
                placeholder="Afaan Oromo"
                placeholderTextColor="#888"
                editable={!readOnly}
              />
              <Text style={styles.fieldLabel}>Translation</Text>
              <AdminTextInput
                style={styles.transInput}
                value={row.translation}
                onChangeText={(t) => updateTurn(index, { translation: t })}
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
