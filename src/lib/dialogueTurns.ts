/** Ordered dialogue turns. Same speaker may speak twice in a row. */

export type DialogueSpeaker = 1 | 2

export type DialogueTurn = {
  speaker: DialogueSpeaker
  text: string
  translation: string
}

function asLines(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input.map((x) => String(x ?? ''))
}

/** Zip person1[i] then person2[i], skipping empty text (legacy storage). */
export function dialogueTurnsFromZippedSides(
  lines1: unknown,
  lines2: unknown,
  tr1: unknown,
  tr2: unknown,
): DialogueTurn[] {
  const l1 = asLines(lines1)
  const l2 = asLines(lines2)
  const t1 = asLines(tr1)
  const t2 = asLines(tr2)
  const maxLen = Math.max(l1.length, l2.length)
  const out: DialogueTurn[] = []
  for (let i = 0; i < maxLen; i++) {
    const a = String(l1[i] ?? '')
    if (a.trim()) {
      out.push({ speaker: 1, text: a, translation: String(t1[i] ?? '') })
    }
    const b = String(l2[i] ?? '')
    if (b.trim()) {
      out.push({ speaker: 2, text: b, translation: String(t2[i] ?? '') })
    }
  }
  return out
}

/**
 * One column per turn: the other speaker gets an empty string so old learner zip
 * still plays consecutive same-speaker lines.
 */
export function dialogueSidesFromTurns(turns: DialogueTurn[]): {
  lines1: string[]
  trans1: string[]
  lines2: string[]
  trans2: string[]
} {
  const lines1: string[] = []
  const trans1: string[] = []
  const lines2: string[] = []
  const trans2: string[] = []
  for (const turn of turns) {
    if (turn.speaker === 1) {
      lines1.push(turn.text)
      trans1.push(turn.translation)
      lines2.push('')
      trans2.push('')
    } else {
      lines1.push('')
      trans1.push('')
      lines2.push(turn.text)
      trans2.push(turn.translation)
    }
  }
  if (lines1.length === 0) {
    return {
      lines1: [''],
      trans1: [''],
      lines2: [''],
      trans2: [''],
    }
  }
  return { lines1, trans1, lines2, trans2 }
}

/** Keep empty rows while editing; `parseDialogueTurns` is for save/playback. */
export function readDialogueTurnsForEdit(raw: unknown): DialogueTurn[] | null {
  if (!Array.isArray(raw)) return null
  const out: DialogueTurn[] = []
  for (const row of raw) {
    if (row == null || typeof row !== 'object' || Array.isArray(row)) continue
    const rec = row as Record<string, unknown>
    const speakerRaw = Number(rec.speaker)
    const speaker: DialogueSpeaker = speakerRaw === 2 ? 2 : 1
    out.push({
      speaker,
      text: String(rec.text ?? rec.line ?? ''),
      translation: String(rec.translation ?? rec.tr ?? ''),
    })
  }
  return out
}

export function parseDialogueTurns(raw: unknown): DialogueTurn[] | null {
  const edited = readDialogueTurnsForEdit(raw)
  if (!edited) return null
  const filled = edited.filter((row) => row.text.trim())
  return filled.length ? filled : null
}
