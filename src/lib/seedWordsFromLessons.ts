import type { RecordingStatus } from '../types'
import supabase from './supabase'
import { normalizeRecordingStatus } from './wordStatus'
import {
  seriesKey,
  voiceBankLanguageSqlValues,
  VOICE_BANK_LANGUAGE,
  wordsBankSeriesLabelFromSeriesId,
} from './voiceBankLabels'

export type HarvestedWord = { word: string; translation: string | null }

/**
 * Values that may appear in `words.series` for this curriculum (`lesson_series.id`).
 * Series 1 lessons use `content.series: "Mastering Greetings"` while new seeds use `"Series 1"` — both must match.
 */
export async function wordBankSeriesColumnValuesForLessonSeries(seriesId: string): Promise<string[]> {
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

/**
 * All `words.series` values to try for a lesson: from `lesson_series` id (slug, "Series N", title) plus
 * `lesson.content.series` (e.g. "Mastering Greetings") when the row id alone is not enough.
 */
export async function buildWordBankLookupLabels(
  lessonSeriesId: string | null | undefined,
  lessonContentSeries: string | null | undefined,
): Promise<string[]> {
  const out: string[] = []
  const add = (s: string) => {
    const t = s.trim()
    if (t && !out.includes(t)) out.push(t)
  }
  if (lessonSeriesId?.trim()) {
    for (const x of await wordBankSeriesColumnValuesForLessonSeries(lessonSeriesId.trim())) add(x)
  }
  if (lessonContentSeries?.trim()) add(lessonContentSeries.trim())
  return out
}

function mapWordsRowToConflictShape(row: Record<string, unknown>): {
  id: string
  translation: string | null
  english: string | null
} | null {
  if (typeof row.id !== 'string') return null
  const tr = row.translation
  const en = row.english
  const def = row.definition
  const gloss =
    (typeof tr === 'string' ? tr.trim() : '') ||
    (typeof en === 'string' ? en.trim() : '') ||
    (typeof def === 'string' ? def.trim() : '') ||
    null
  return {
    id: row.id,
    translation: gloss,
    english: typeof en === 'string' ? en : null,
  }
}

/**
 * Find a voice-bank row for an Afaan token restricted to the given `words.series` labels.
 * Uses `select('*')` and tries `word` / `oromo` so schema variants still match.
 */
export async function lookupWordBankRowWithSeriesLabels(
  seriesLabels: string[],
  afaan: string,
): Promise<{ id: string; translation: string | null; english: string | null } | null> {
  const o = afaan.trim()
  if (!o || seriesLabels.length === 0) return null
  const langVals = voiceBankLanguageSqlValues()

  const base = () => supabase.from('words').select('*').in('series', seriesLabels)

  const runners = [
    () => base().eq('word', o).in('language', langVals).limit(1),
    () => base().ilike('word', o).in('language', langVals).limit(1),
    () => base().eq('oromo', o).in('language', langVals).limit(1),
    () => base().ilike('oromo', o).in('language', langVals).limit(1),
    () => base().eq('word', o).limit(1),
    () => base().ilike('word', o).limit(1),
    () => base().eq('oromo', o).limit(1),
    () => base().ilike('oromo', o).limit(1),
  ]

  for (const run of runners) {
    const { data, error } = await run()
    if (error) {
      if (/column|Could not find|does not exist|PGRST100/i.test(error.message)) continue
      continue
    }
    const raw = Array.isArray(data) && data.length > 0 ? (data[0] as Record<string, unknown>) : null
    const mapped = raw ? mapWordsRowToConflictShape(raw) : null
    if (mapped) return mapped
  }

  return null
}

export async function fetchWordBankRowForLessonWord(
  lessonSeriesId: string | null | undefined,
  lessonContentSeries: string | null | undefined,
  afaan: string,
): Promise<{ id: string; translation: string | null; english: string | null } | null> {
  const labels = await buildWordBankLookupLabels(lessonSeriesId, lessonContentSeries)
  if (!labels.length) return null
  return lookupWordBankRowWithSeriesLabels(labels, afaan)
}

/**
 * Collect spoken-language tokens from lesson JSON that should exist in `words` for VA recording.
 * Mirrors Audio exposure + Celebrate patterns used in the lesson editor.
 */
export function harvestWordsFromLessonContent(content: unknown): HarvestedWord[] {
  if (content == null || typeof content !== 'object' || Array.isArray(content)) return []
  const screens = (content as Record<string, unknown>).screens
  if (!Array.isArray(screens)) return []

  const out: HarvestedWord[] = []
  const seen = new Set<string>()

  const push = (word: string, translation: string | null) => {
    const w = word.trim()
    if (!w) return
    const k = w.toLowerCase()
    if (seen.has(k)) return
    seen.add(k)
    out.push({ word: w, translation: translation?.trim() || null })
  }

  for (const s of screens) {
    if (s == null || typeof s !== 'object' || Array.isArray(s)) continue
    const type = (s as Record<string, unknown>).type
    const c = (s as Record<string, unknown>).content
    if (typeof type !== 'string' || c == null || typeof c !== 'object' || Array.isArray(c)) continue
    const cr = c as Record<string, unknown>

    if (type === 'audioExposure') {
      const words = cr.words
      if (Array.isArray(words)) {
        for (const item of words) {
          if (item == null || typeof item !== 'object' || Array.isArray(item)) continue
          const rec = item as Record<string, unknown>
          const afaan = String(rec.oromo ?? rec.word ?? '').trim()
          const english = String(rec.english ?? rec.translation ?? '').trim() || null
          push(afaan, english)
        }
      }
      const titleWord = String(cr.word ?? '').trim()
      if (titleWord) push(titleWord, null)
    }

    if (type === 'CelebrateScreen') {
      const learned = cr.learned
      if (Array.isArray(learned)) {
        for (const item of learned) {
          if (typeof item === 'string') push(item, null)
        }
      }
    }

    if (type === 'match') {
      const pairs = cr.pairs
      if (Array.isArray(pairs)) {
        for (const p of pairs) {
          if (p == null || typeof p !== 'object' || Array.isArray(p)) continue
          const pr = p as Record<string, unknown>
          const left = String(pr.left ?? '').trim()
          const right = String(pr.right ?? '').trim()
          push(left, right || null)
        }
      }
    }

    if (type === 'quiz') {
      const questions = Array.isArray(cr.questions) ? cr.questions : cr.question ? [cr] : []
      for (const q of questions) {
        if (q == null || typeof q !== 'object' || Array.isArray(q)) continue
        const qr = q as Record<string, unknown>
        const qu = String(qr.question ?? '').trim()
        if (qu) push(qu, null)
        const opts = qr.options
        if (Array.isArray(opts)) {
          for (const o of opts) {
            if (typeof o === 'string') push(o.trim(), null)
            else if (o != null && typeof o === 'object' && !Array.isArray(o)) {
              const ot = (o as Record<string, unknown>).text
              const oe = (o as Record<string, unknown>).english
              if (typeof ot === 'string' && ot.trim()) push(ot.trim(), typeof oe === 'string' ? oe.trim() || null : null)
            }
          }
        }
      }
    }

    if (type === 'speakingPractice') {
      const prompt = String(cr.prompt ?? cr.phrase ?? '').trim()
      const en = String(cr.expectedAnswer ?? cr.phraseEnglish ?? '').trim() || null
      if (prompt) push(prompt, en)
    }

    if (type === 'wordDiscriminationQuiz') {
      const wlist = cr.words
      if (Array.isArray(wlist) && wlist.length >= 2) {
        for (const item of wlist) {
          if (item == null || typeof item !== 'object' || Array.isArray(item)) continue
          const wr = item as Record<string, unknown>
          const t = String(wr.text ?? wr.oromo ?? wr.word ?? '').trim()
          const gloss =
            String(wr.definition ?? wr.english ?? wr.translation ?? '').trim() || null
          if (t) push(t, gloss)
        }
      } else {
        const wa = String(cr.wordA ?? cr.word_a ?? '').trim()
        const wb = String(cr.wordB ?? cr.word_b ?? '').trim()
        const da = String(cr.definitionA ?? '').trim() || null
        const db = String(cr.definitionB ?? '').trim() || null
        if (wa) push(wa, da)
        if (wb) push(wb, db)
      }
    }

    if (type === 'dialogue') {
      const dd = cr.dialogueData as Record<string, unknown> | undefined
      const people = dd && Array.isArray(dd.people) ? (dd.people as unknown[]) : []
      for (const p of people) {
        if (p == null || typeof p !== 'object' || Array.isArray(p)) continue
        const pr = p as Record<string, unknown>
        const lines = Array.isArray(pr.lines) ? pr.lines : []
        const trans = Array.isArray(pr.translations) ? pr.translations : []
        for (let i = 0; i < lines.length; i++) {
          const line = typeof lines[i] === 'string' ? lines[i].trim() : ''
          if (!line) continue
          const tr = trans[i]
          const gloss = typeof tr === 'string' ? tr.trim() || null : null
          push(line, gloss)
        }
      }
    }
  }

  return out
}

/** Harvest tokens from a `screens` array only (same rules as `harvestWordsFromLessonContent`). */
export function harvestWordsFromLessonScreens(screens: unknown[]): HarvestedWord[] {
  return harvestWordsFromLessonContent({ screens })
}

export type BlockedOtherSeries = { word: string; existingSeries: string }

export type SeedWordsResult = {
  inserted: number
  /** Existing rows in this series whose `translation`/`english` was updated from lesson content. */
  translationsUpdated: number
  skippedExisting: number
  totalHarvested: number
  /** Same word+language already lives under another `words.series` — not inserted here. */
  blockedOtherSeries: BlockedOtherSeries[]
  error?: string
}

type SeriesWordSyncPlan = {
  wordsSeriesLabel: string
  language: string
  targetKey: string
  harvested: HarvestedWord[]
  toInsert: HarvestedWord[]
  skippedExisting: number
  blockedOtherSeries: BlockedOtherSeries[]
}

async function buildSeriesWordSyncPlan(seriesId: string): Promise<{ plan: SeriesWordSyncPlan; error?: string } | { error: string }> {
  const id = seriesId.trim()
  const wordsSeriesLabel = wordsBankSeriesLabelFromSeriesId(id)
  const language = VOICE_BANK_LANGUAGE
  const targetKey = seriesKey(id)

  if (!id) {
    return { error: 'Missing series id.' }
  }

  const seriesColumnValues = await wordBankSeriesColumnValuesForLessonSeries(id)
  const targetKeySet = new Set(seriesColumnValues.map((l) => seriesKey(l)))

  const { data: lessons, error: lesErr } = await supabase.from('lessons').select('content').eq('series_id', id)

  if (lesErr) {
    return { error: lesErr.message }
  }

  const harvested: HarvestedWord[] = []
  const seenH = new Set<string>()
  for (const row of (lessons ?? []) as { content: unknown }[]) {
    for (const h of harvestWordsFromLessonContent(row.content)) {
      const k = h.word.toLowerCase()
      if (seenH.has(k)) continue
      seenH.add(k)
      harvested.push(h)
    }
  }

  if (harvested.length === 0) {
    return {
      plan: {
        wordsSeriesLabel,
        language,
        targetKey,
        harvested,
        toInsert: [],
        skippedExisting: 0,
        blockedOtherSeries: [],
      },
    }
  }

  const langVals = voiceBankLanguageSqlValues()
  const { data: allLangRows, error: exErr } = await supabase
    .from('words')
    .select('word, series')
    .in('language', langVals)

  if (exErr) {
    return { error: exErr.message }
  }

  const rows = (allLangRows as { word: string; series: string | null }[] | null) ?? []
  const byWordLower = new Map<string, { series: string }[]>()
  for (const r of rows) {
    const w = r.word.trim().toLowerCase()
    if (!w) continue
    const list = byWordLower.get(w) ?? []
    list.push({ series: String(r.series ?? '') })
    byWordLower.set(w, list)
  }

  const blockedOtherSeries: BlockedOtherSeries[] = []
  let skippedExisting = 0
  const toInsert: HarvestedWord[] = []

  for (const h of harvested) {
    const wl = h.word.toLowerCase()
    const existing = byWordLower.get(wl) ?? []
    const inTarget = existing.some((e) => targetKeySet.has(seriesKey(e.series)))
    if (inTarget) {
      skippedExisting += 1
      continue
    }
    const foreign = existing.filter((e) => !targetKeySet.has(seriesKey(e.series)))
    if (foreign.length > 0) {
      const labels = [...new Set(foreign.map((e) => e.series.trim()).filter(Boolean))]
      blockedOtherSeries.push({
        word: h.word,
        existingSeries: labels.length ? labels.join(', ') : '(unknown series)',
      })
      continue
    }
    toInsert.push(h)
  }

  return {
    plan: {
      wordsSeriesLabel,
      language,
      targetKey,
      harvested,
      toInsert,
      skippedExisting,
      blockedOtherSeries,
    },
  }
}

function glossFromWordsRow(row: { translation?: string | null; english?: string | null }): string {
  return (row.translation ?? row.english ?? '').trim()
}

async function patchWordTranslationFromLesson(rowId: string, translation: string): Promise<{ error?: string }> {
  const e = translation.trim()
  const up1 = await supabase.from('words').update({ translation: e }).eq('id', rowId)
  if (!up1.error) return {}
  const msg = up1.error.message || ''
  if (/column .*translation.* does not exist/i.test(msg)) {
    const up2 = await supabase.from('words').update({ english: e }).eq('id', rowId)
    if (!up2.error) return {}
    return { error: up2.error.message }
  }
  return { error: up1.error.message }
}

/** @deprecated Prefer {@link fetchWordBankRowForLessonWord} with lesson JSON `content.series` when needed. */
export async function fetchWordBankRowForSeries(
  seriesId: string,
  afaan: string,
): Promise<{ id: string; translation: string | null; english: string | null } | null> {
  return fetchWordBankRowForLessonWord(seriesId, null, afaan)
}

export type SeriesWordBankReviewSummary = {
  newWords: { word: string; translation: string | null }[]
  pendingTranslationChanges: {
    word: string
    lessonTranslation: string
    databaseTranslation: string
  }[]
  blockedOtherSeries: BlockedOtherSeries[]
}

/**
 * What would change in `words` when this series is approved: new rows, translation patches, cross-series blocks.
 * Lesson JSON is the source of truth for text; DB is updated only on approve (see {@link seedWordsFromSeriesLessons}).
 */
export async function buildSeriesWordBankReviewSummary(seriesId: string): Promise<
  { summary: SeriesWordBankReviewSummary } | { error: string }
> {
  const sid = seriesId.trim()
  const built = await buildSeriesWordSyncPlan(sid)
  if (!('plan' in built)) return { error: built.error }
  const { plan } = built
  const { wordsSeriesLabel, harvested, toInsert, blockedOtherSeries } = plan
  const langVals = voiceBankLanguageSqlValues()
  const seriesColumnValues = await wordBankSeriesColumnValuesForLessonSeries(sid)
  const seriesInFilter =
    seriesColumnValues.length > 0 ? seriesColumnValues : [wordsSeriesLabel]

  const newWords = toInsert.map((h) => ({ word: h.word, translation: h.translation }))

  const toInsertLower = new Set(toInsert.map((h) => h.word.toLowerCase()))
  const blockedLower = new Set(blockedOtherSeries.map((b) => b.word.toLowerCase()))

  const pendingTranslationChanges: SeriesWordBankReviewSummary['pendingTranslationChanges'] = []

  const inSeriesHarvested = harvested.filter(
    (h) => !toInsertLower.has(h.word.toLowerCase()) && !blockedLower.has(h.word.toLowerCase()),
  )

  if (inSeriesHarvested.length > 0) {
    const { data: seriesRows, error: wErr } = await supabase
      .from('words')
      .select('id,word,translation,english,series')
      .in('series', seriesInFilter)
      .in('language', langVals)

    if (wErr) return { error: wErr.message }

    type SumRow = { id: string; translation: string | null; english: string | null; seriesLabel: string }
    const byLower = new Map<string, SumRow>()
    for (const r of (seriesRows as {
      id?: string
      word?: string
      series?: string | null
      translation?: string | null
      english?: string | null
    }[] | null) ?? []) {
      const w = String(r.word ?? '').trim().toLowerCase()
      if (!w || typeof r.id !== 'string') continue
      const seriesLabel = String(r.series ?? '').trim()
      const candidate: SumRow = {
        id: r.id,
        translation: r.translation ?? null,
        english: r.english ?? null,
        seriesLabel,
      }
      const prev = byLower.get(w)
      if (!prev) {
        byLower.set(w, candidate)
        continue
      }
      const curCanonical = seriesLabel === wordsSeriesLabel
      const prevCanonical = prev.seriesLabel === wordsSeriesLabel
      if (curCanonical && !prevCanonical) byLower.set(w, candidate)
    }

    for (const h of inSeriesHarvested) {
      const leGloss = (h.translation ?? '').trim()
      if (!leGloss) continue
      const row = byLower.get(h.word.toLowerCase())
      if (!row) continue
      const dbGloss = glossFromWordsRow(row)
      if (dbGloss === leGloss) continue
      pendingTranslationChanges.push({
        word: h.word,
        lessonTranslation: leGloss,
        databaseTranslation: dbGloss || '(empty)',
      })
    }
  }

  return {
    summary: {
      newWords,
      pendingTranslationChanges,
      blockedOtherSeries,
    },
  }
}

function isVaAudioCaptured(st: RecordingStatus): boolean {
  return st === 'recorded' || st === 'approved'
}

export type SeriesWordsVaProgress = {
  totalLessonWords: number
  /** Every harvested lesson token already has a `words` row under this series (nothing new to insert as pending). */
  allLessonWordsInVoiceBank: boolean
  /** Lesson tokens not yet in `words` for this language — inserted as pending when curriculum is approved (or on next screen load after approval). */
  syncableNewRowCount: number
  /** Harvested tokens with no row under this series in the voice bank (need sync, conflict, or not loaded). */
  missingFromVoiceBankCount: number
  /** Among lesson tokens that already have a row under this series: uploaded / reviewed. */
  withRecording: number
  /** Among lesson tokens that already have a row under this series: still need VA takes (or re-record). */
  needRecording: number
  blockedOtherSeries: BlockedOtherSeries[]
}

/**
 * Lesson vocabulary vs voice bank: whether sync is needed, and recording progress for tokens already in `words`.
 */
export async function fetchSeriesWordsVaProgress(params: {
  seriesId: string
}): Promise<{ progress: SeriesWordsVaProgress; error?: string }> {
  const built = await buildSeriesWordSyncPlan(params.seriesId.trim())
  if (!('plan' in built)) {
    return {
      progress: {
        totalLessonWords: 0,
        allLessonWordsInVoiceBank: false,
        syncableNewRowCount: 0,
        missingFromVoiceBankCount: 0,
        withRecording: 0,
        needRecording: 0,
        blockedOtherSeries: [],
      },
      error: built.error,
    }
  }

  const { plan } = built
  const { harvested, toInsert, blockedOtherSeries, wordsSeriesLabel } = plan
  const totalLessonWords = harvested.length
  const syncableNewRowCount = toInsert.length
  const allLessonWordsInVoiceBank =
    totalLessonWords > 0 && syncableNewRowCount === 0 && blockedOtherSeries.length === 0

  let withRecording = 0
  let needRecording = 0

  if (totalLessonWords > 0) {
    const langVals = voiceBankLanguageSqlValues()
    const seriesColumnValues = await wordBankSeriesColumnValuesForLessonSeries(params.seriesId.trim())
    const seriesInFilter =
      seriesColumnValues.length > 0 ? seriesColumnValues : [wordsSeriesLabel]
    const { data: seriesRows, error: wErr } = await supabase
      .from('words')
      .select('word,status,series')
      .in('series', seriesInFilter)
      .in('language', langVals)

    if (wErr) {
      return {
        progress: {
          totalLessonWords,
          allLessonWordsInVoiceBank,
          syncableNewRowCount,
          missingFromVoiceBankCount: totalLessonWords,
          withRecording: 0,
          needRecording: 0,
          blockedOtherSeries,
        },
        error: wErr.message,
      }
    }

    const byLower = new Map<string, { st: RecordingStatus; seriesLabel: string }>()
    for (const r of (seriesRows as { word: string; status?: unknown; series?: string | null }[] | null) ?? []) {
      const w = r.word.trim().toLowerCase()
      if (!w) continue
      const seriesLabel = String(r.series ?? '').trim()
      const st = normalizeRecordingStatus(r.status)
      const prev = byLower.get(w)
      if (!prev) {
        byLower.set(w, { st, seriesLabel })
        continue
      }
      const curCanonical = seriesLabel === wordsSeriesLabel
      const prevCanonical = prev.seriesLabel === wordsSeriesLabel
      if (curCanonical && !prevCanonical) byLower.set(w, { st, seriesLabel })
    }

    for (const h of harvested) {
      const entry = byLower.get(h.word.toLowerCase())
      if (entry == null) continue
      if (isVaAudioCaptured(entry.st)) withRecording += 1
      else needRecording += 1
    }
  }

  const inVoiceBankLessonCount = withRecording + needRecording
  const missingFromVoiceBankCount = Math.max(0, totalLessonWords - inVoiceBankLessonCount)

  return {
    progress: {
      totalLessonWords,
      allLessonWordsInVoiceBank,
      syncableNewRowCount,
      missingFromVoiceBankCount,
      withRecording,
      needRecording,
      blockedOtherSeries,
    },
  }
}

/**
 * Apply lesson vocabulary to `words` when admin approves curriculum: insert missing rows and patch
 * translations for existing rows in this series when lesson text differs. Lesson edits before approval
 * only change JSON; this is the DB write path.
 */
export async function seedWordsFromSeriesLessons(params: { seriesId: string }): Promise<SeedWordsResult> {
  const seriesId = params.seriesId.trim()
  if (!seriesId) {
    return {
      inserted: 0,
      translationsUpdated: 0,
      skippedExisting: 0,
      totalHarvested: 0,
      blockedOtherSeries: [],
      error: 'Missing series id.',
    }
  }

  const built = await buildSeriesWordSyncPlan(seriesId)
  if (!('plan' in built)) {
    return {
      inserted: 0,
      translationsUpdated: 0,
      skippedExisting: 0,
      totalHarvested: 0,
      blockedOtherSeries: [],
      error: built.error,
    }
  }

  const { plan } = built
  const { wordsSeriesLabel, language, harvested, toInsert, skippedExisting, blockedOtherSeries } = plan

  if (harvested.length === 0) {
    return { inserted: 0, translationsUpdated: 0, skippedExisting: 0, totalHarvested: 0, blockedOtherSeries: [] }
  }

  let inserted = 0
  let translationsUpdated = 0

  if (toInsert.length > 0) {
    const insertRows = toInsert.map((h) => ({
      series: wordsSeriesLabel,
      word: h.word,
      language,
      translation: h.translation,
      status: 'pending' as const,
      slow_audio_url: null,
      fast_audio_url: null,
    }))

    const { error: insErr } = await supabase.from('words').insert(insertRows)

    if (insErr) {
      return {
        inserted: 0,
        translationsUpdated: 0,
        skippedExisting,
        totalHarvested: harvested.length,
        blockedOtherSeries,
        error: insErr.message,
      }
    }
    inserted = toInsert.length
  }

  const toInsertLower = new Set(toInsert.map((h) => h.word.toLowerCase()))
  const blockedLower = new Set(blockedOtherSeries.map((b) => b.word.toLowerCase()))
  const inSeriesHarvested = harvested.filter(
    (h) => !toInsertLower.has(h.word.toLowerCase()) && !blockedLower.has(h.word.toLowerCase()),
  )

  if (inSeriesHarvested.length > 0) {
    const langVals = voiceBankLanguageSqlValues()
    const seriesColumnValues = await wordBankSeriesColumnValuesForLessonSeries(seriesId)
    const seriesInFilter =
      seriesColumnValues.length > 0 ? seriesColumnValues : [wordsSeriesLabel]
    const { data: seriesRows, error: wErr } = await supabase
      .from('words')
      .select('id,word,translation,english,series')
      .in('series', seriesInFilter)
      .in('language', langVals)

    if (wErr) {
      return {
        inserted,
        translationsUpdated: 0,
        skippedExisting,
        totalHarvested: harvested.length,
        blockedOtherSeries,
        error: wErr.message,
      }
    }

    type RowPick = { id: string; translation: string | null; english: string | null; seriesLabel: string }
    const byLower = new Map<string, RowPick>()
    for (const r of (seriesRows as {
      id?: string
      word?: string
      series?: string | null
      translation?: string | null
      english?: string | null
    }[] | null) ?? []) {
      const w = String(r.word ?? '').trim().toLowerCase()
      if (!w || typeof r.id !== 'string') continue
      const seriesLabel = String(r.series ?? '').trim()
      const candidate: RowPick = {
        id: r.id,
        translation: r.translation ?? null,
        english: r.english ?? null,
        seriesLabel,
      }
      const prev = byLower.get(w)
      if (!prev) {
        byLower.set(w, candidate)
        continue
      }
      const curCanonical = seriesLabel === wordsSeriesLabel
      const prevCanonical = prev.seriesLabel === wordsSeriesLabel
      if (curCanonical && !prevCanonical) byLower.set(w, candidate)
    }

    for (const h of inSeriesHarvested) {
      const leGloss = (h.translation ?? '').trim()
      if (!leGloss) continue
      const row = byLower.get(h.word.toLowerCase())
      if (!row) continue
      const dbGloss = glossFromWordsRow(row)
      if (dbGloss === leGloss) continue
      const { error: patchErr } = await patchWordTranslationFromLesson(row.id, leGloss)
      if (patchErr) {
        return {
          inserted,
          translationsUpdated,
          skippedExisting,
          totalHarvested: harvested.length,
          blockedOtherSeries,
          error: patchErr,
        }
      }
      translationsUpdated += 1
    }
  }

  return {
    inserted,
    translationsUpdated,
    skippedExisting,
    totalHarvested: harvested.length,
    blockedOtherSeries,
  }
}
