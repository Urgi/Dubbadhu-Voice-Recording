/** Mirrors Dubbadhu/features/DubbadhuTab/Dubbadhu.js — keep in sync if scoring changes. */

function countWords(s: string): number {
  return String(s || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

function looksLikeQuestion(intended: string, corrected: string): boolean {
  const en = String(intended || '')
    .trim()
    .toLowerCase()
  const om = String(corrected || '')
    .trim()
    .toLowerCase()
  if (!en && !om) return false

  const enQ =
    en.includes('?') ||
    /^(how|what|where|who|when|why|can|could|would|should|do|does|did|is|are|am|will|may)\b/.test(
      en,
    )
  const omQ =
    om.includes('?') || /\b(maal|maali|maaliif|eessa|eenyu|yoom|akkam)\b/.test(om)
  return enQ || omQ
}

function isBeginnerQuestion(intended: string, corrected: string): boolean {
  const c = String(corrected || '').trim()
  const i = String(intended || '').trim()
  if (!looksLikeQuestion(i, c)) return false
  const cw = countWords(c)
  const iw = countWords(i)
  return cw >= 2 && cw <= 8 && c.length >= 8 && c.length <= 70 && iw <= 14
}

export function scoreLikelyGoodQuestion(intended: string, corrected: string): number {
  const i = String(intended || '').trim()
  const c = String(corrected || '').trim()
  if (!c) return -999

  const lower = `${i}\n${c}`.toLowerCase()
  if (
    /(no change needed|you're perfect|is perfect|i can't translate|cannot translate|can't translate|gibberish|as an ai|i am an ai)/i.test(
      lower,
    )
  ) {
    return -999
  }
  if (/(ERROR_TAGS:|GRAMMAR_CONCEPTS:)/i.test(lower)) return -999
  if (/[<>{}[\]]/.test(c)) return -20
  if (/https?:\/\//i.test(lower)) return -20

  const junkChars = (c.match(/[^a-zA-Z\u00C0-\u024F\s'’\-?]/g) || []).length
  const totalChars = Math.max(1, c.length)
  if (junkChars / totalChars > 0.12) return -999
  if (!/[a-zA-Z\u00C0-\u024F]/.test(c)) return -999
  if (countWords(c) < 2) return -999

  let score = 0
  if (looksLikeQuestion(i, c)) score += 6
  if (c.includes('?')) score += 2
  if (i.includes('?')) score += 1

  const cw = countWords(c)
  if (cw >= 2 && cw <= 8) score += 4
  if (c.length >= 10 && c.length <= 60) score += 2
  if (isBeginnerQuestion(i, c)) score += 6

  if (/\b(the|and|how|what|where|your|you|is|are|was|were|translate|perfect)\b/i.test(c)) {
    score -= 6
  }
  if (c.length > 90 || cw > 14) score -= 6
  if (c.split(/[.!?]/).filter(Boolean).length > 2) score -= 4

  return score
}
