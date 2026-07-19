import supabase from './supabase'
import { voiceBankLanguageSqlValues, wordsBankSeriesLabelFromSeriesId } from './voiceBankLabels'

/** Same series labels as approve seed / voice bank lookup (avoids circular import with seedWordsFromLessons). */
async function wordBankSeriesColumnValuesForLessonSeries(seriesId: string): Promise<string[]> {
  const id = seriesId.trim()
  if (!id) return []
  const out: string[] = []
  const add = (s: string) => {
    const t = s.trim()
    if (t && !out.includes(t)) out.push(t)
  }
  add(wordsBankSeriesLabelFromSeriesId(id))
  add(id)

  const { data, error } = await supabase.from('lesson_series').select('title').eq('id', id).maybeSingle()
  if (!error && data && typeof (data as { title?: unknown }).title === 'string') {
    add((data as { title: string }).title)
  }

  return out
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isBankWordUuid(v: unknown): boolean {
  return typeof v === 'string' && UUID_RE.test(v.trim().toLowerCase())
}

function parseLessonContentRoot(content: unknown): Record<string, unknown> | null {
  if (content == null) return null
  if (typeof content === 'string') {
    const t = content.trim()
    if (!t) return null
    try {
      const p = JSON.parse(t) as unknown
      if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>
    } catch {
      return null
    }
    return null
  }
  if (typeof content === 'object' && !Array.isArray(content)) return content as Record<string, unknown>
  return null
}

/** Mutable reference to `screens` inside lesson JSON (top-level or nested under `content`). */
function getScreensArrayForMutation(root: Record<string, unknown>): unknown[] | null {
  if (Array.isArray(root.screens)) return root.screens
  const inner = root.content
  if (inner != null && typeof inner === 'object' && !Array.isArray(inner)) {
    const c = inner as Record<string, unknown>
    if (Array.isArray(c.screens)) return c.screens
  }
  return null
}

/**
 * Build `lowerCaseAfaan → words.id` for rows in this curriculum's voice-bank series labels.
 * When duplicates exist, prefer the canonical `wordsBankSeriesLabelFromSeriesId` row (same rule as approve seed).
 */
async function buildCanonicalWordIdMap(seriesId: string): Promise<{ map: Map<string, string> } | { error: string }> {
  const id = seriesId.trim()
  if (!id) return { error: 'Missing series id.' }

  const wordsSeriesLabel = wordsBankSeriesLabelFromSeriesId(id)
  const langVals = voiceBankLanguageSqlValues()
  const seriesColumnValues = await wordBankSeriesColumnValuesForLessonSeries(id)
  const seriesInFilter =
    seriesColumnValues.length > 0 ? seriesColumnValues : [wordsSeriesLabel]

  const { data: seriesRows, error: wErr } = await supabase
    .from('words')
    .select('id,word,series')
    .in('series', seriesInFilter)
    .in('language', langVals)

  if (wErr) return { error: wErr.message }

  type PickRow = { id: string; seriesLabel: string }
  const byLower = new Map<string, PickRow>()
  for (const r of (seriesRows as { id?: string; word?: string; series?: string | null }[] | null) ?? []) {
    const w = String(r.word ?? '').trim().toLowerCase()
    if (!w || typeof r.id !== 'string') continue
    const seriesLabel = String(r.series ?? '').trim()
    const candidate: PickRow = { id: r.id, seriesLabel }
    const prev = byLower.get(w)
    if (!prev) {
      byLower.set(w, candidate)
      continue
    }
    const curCanonical = seriesLabel === wordsSeriesLabel
    const prevCanonical = prev.seriesLabel === wordsSeriesLabel
    if (curCanonical && !prevCanonical) byLower.set(w, candidate)
  }

  const map = new Map<string, string>()
  for (const [lower, row] of byLower) {
    map.set(lower, row.id)
  }
  return { map }
}

function patchScreensInPlace(screens: unknown[], wordMap: Map<string, string>): boolean {
  let changed = false

  for (const sc of screens) {
    if (sc == null || typeof sc !== 'object' || Array.isArray(sc)) continue
    const s = sc as Record<string, unknown>
    const type = s.type
    const co = s.content
    if (typeof type !== 'string' || co == null || typeof co !== 'object' || Array.isArray(co)) continue
    const cr = co as Record<string, unknown>

    if (type === 'audioExposure') {
      const words = cr.words
      if (!Array.isArray(words)) continue
      for (const item of words) {
        if (item == null || typeof item !== 'object' || Array.isArray(item)) continue
        const rec = item as Record<string, unknown>
        if (isBankWordUuid(rec.word_id)) continue
        const afaan = String(rec.word ?? rec.oromo ?? rec.text ?? '').trim()
        if (!afaan) continue
        const rowId = wordMap.get(afaan.toLowerCase())
        if (!rowId) continue
        rec.word_id = rowId.toLowerCase()
        changed = true
      }
    }

    if (type === 'repetitionPractice') {
      const pairs = cr.pairs
      if (!Array.isArray(pairs)) continue
      for (const pair of pairs) {
        if (pair == null || typeof pair !== 'object' || Array.isArray(pair)) continue
        const pr = pair as Record<string, unknown>
        for (const side of ['base', 'answer'] as const) {
          const item = pr[side]
          if (item == null || typeof item !== 'object' || Array.isArray(item)) continue
          const rec = item as Record<string, unknown>
          if (isBankWordUuid(rec.word_id)) continue
          const afaan = String(rec.oromo ?? rec.word ?? rec.text ?? '').trim()
          if (!afaan) continue
          const rowId = wordMap.get(afaan.toLowerCase())
          if (!rowId) continue
          rec.word_id = rowId.toLowerCase()
          changed = true
        }
      }
    }

    if (type === 'speakingPractice') {
      if (isBankWordUuid(cr.word_id)) continue
      const afaan = String(cr.word ?? cr.prompt ?? '').trim()
      if (!afaan) continue
      const rowId = wordMap.get(afaan.toLowerCase())
      if (!rowId) continue
      cr.word_id = rowId.toLowerCase()
      changed = true
    }

    if (type === 'videoReview') {
      const lines = cr.lines
      if (!Array.isArray(lines)) continue
      for (const line of lines) {
        if (line == null || typeof line !== 'object' || Array.isArray(line)) continue
        const ln = line as Record<string, unknown>
        const vw = ln.vocabWords
        if (!Array.isArray(vw)) continue
        for (const w of vw) {
          if (w == null || typeof w !== 'object' || Array.isArray(w)) continue
          const rec = w as Record<string, unknown>
          if (isBankWordUuid(rec.word_id)) continue
          const afaan = String(rec.word ?? rec.oromo ?? rec.text ?? '').trim()
          if (!afaan) continue
          const rowId = wordMap.get(afaan.toLowerCase())
          if (!rowId) continue
          rec.word_id = rowId.toLowerCase()
          changed = true
        }
      }
    }

    if (type === 'discriminationDrill' || type === 'wordDiscriminationQuiz') {
      const wlist = cr.words
      if (!Array.isArray(wlist)) continue
      for (const item of wlist) {
        if (item == null || typeof item !== 'object' || Array.isArray(item)) continue
        const wr = item as Record<string, unknown>
        if (isBankWordUuid(wr.word_id)) continue
        const afaan = String(wr.text ?? wr.oromo ?? wr.word ?? '').trim()
        if (!afaan) continue
        const rowId = wordMap.get(afaan.toLowerCase())
        if (!rowId) continue
        wr.word_id = rowId.toLowerCase()
        changed = true
      }
    }
  }

  return changed
}

/**
 * After `words` rows exist for harvested lesson vocabulary, copy each bank row's `id` into lesson JSON as
 * `word_id` on matching tokens (same Afaan text, series-scoped lookup). Fixes draft-only exposure rows so the
 * learner can hydrate `fastAudioRef` / `slowAudioRef` from `public.words`.
 */
export async function backfillLessonWordIdsForSeries(seriesId: string): Promise<{
  lessonsUpdated: number
  error?: string
}> {
  const sid = seriesId.trim()
  if (!sid) return { lessonsUpdated: 0, error: 'Missing series id.' }

  const built = await buildCanonicalWordIdMap(sid)
  if ('error' in built) return { lessonsUpdated: 0, error: built.error }

  const wordMap = built.map
  if (wordMap.size === 0) return { lessonsUpdated: 0 }

  const { data: lessons, error: lesErr } = await supabase
    .from('lessons')
    .select('id, content')
    .eq('series_id', sid)

  if (lesErr) return { lessonsUpdated: 0, error: lesErr.message }

  let lessonsUpdated = 0

  for (const row of lessons ?? []) {
    const lessonId = typeof row?.id === 'string' ? row.id : null
    if (!lessonId) continue

    const root = parseLessonContentRoot(row.content)
    if (!root) continue

    const screens = getScreensArrayForMutation(root)
    if (!screens || screens.length === 0) continue

    const changed = patchScreensInPlace(screens, wordMap)
    if (!changed) continue

    const { error: upErr } = await supabase.from('lessons').update({ content: root }).eq('id', lessonId)
    if (upErr) return { lessonsUpdated, error: upErr.message }
    lessonsUpdated += 1
  }

  return { lessonsUpdated }
}
